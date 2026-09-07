import { many, one, query, tx } from '../db.js';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors.js';
import { compareVersions, publicDeviceForFlash } from './devices.js';
import { info } from '../lib/log.js';

// The manifest the installer reads is served for one product at a time.
export async function manifestFor(model, { channels = ['general'] } = {}) {
  const wanted = String(model || '').trim();
  const product = await one(
    `SELECT id, handle, title FROM product
     WHERE lower(handle) = lower($1) OR lower(title) = lower($1)`,
    [wanted],
  );
  if (!product) throw notFound('We do not make that model.', 'model_not_found');

  const allowed = Array.from(new Set(['general', ...channels.filter(Boolean)]));
  const rows = await many(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
     FROM firmware WHERE product_id = $1 AND channel = ANY($2::text[])
     ORDER BY build DESC`,
    [product.id, allowed],
  );

  return {
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    entries: rows.map((r) => ({
      version: r.version,
      build: Number(r.build),
      channel: r.channel,
      product_handle: product.handle,
      min_firmware: r.min_firmware,
      min_app_version: r.min_app_version,
      size_bytes: Number(r.size_bytes),
      sha256: r.sha256,
      released_on: String(r.released_on).slice(0, 10),
    })),
  };
}

export async function imageByBuild(build) {
  const row = await one(
    `SELECT f.*, p.handle AS product_handle, p.title AS product_title
     FROM firmware f JOIN product p ON p.id = f.product_id
     WHERE f.build = $1::int`,
    [Number(build) || 0],
  );
  if (!row) throw notFound('We do not have that firmware image.', 'firmware_not_found');
  return {
    version: row.version,
    build: Number(row.build),
    channel: row.channel,
    min_firmware: row.min_firmware,
    min_app_version: row.min_app_version,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    product_handle: row.product_handle,
    product_title: row.product_title,
  };
}

export async function releases({ pageSize = 20, cursor = null } = {}) {
  // Sorted by build descending; released_on is not a sort key.
  const params = [pageSize + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.build);
    where = 'WHERE build < $2';
  }
  const rows = await many(
    `SELECT version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
     FROM app_release ${where} ORDER BY build DESC LIMIT $1`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const data = (hasMore ? rows.slice(0, pageSize) : rows).map(shapeRelease);
  const last = data[data.length - 1];
  return { data, next_cursor: hasMore && last ? { build: last.build } : null, has_more: hasMore };
}

export const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];

function shapeRelease(r) {
  const notes = r.notes && typeof r.notes === 'object' ? r.notes : {};
  const ordered = {};
  for (const group of NOTE_GROUPS) {
    if (Array.isArray(notes[group]) && notes[group].length) {
      ordered[group] = notes[group].map((n) => (typeof n === 'string' ? { text: n } : n));
    }
  }
  return {
    version: r.version,
    build: Number(r.build),
    released_on: String(r.released_on).slice(0, 10),
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description,
    notes: ordered,
  };
}

export async function releaseByVersion(version) {
  const row = await one(
    `SELECT version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
     FROM app_release WHERE version = $1`,
    [String(version || '')],
  );
  if (!row) throw notFound('That release does not exist.', 'release_not_found');
  return shapeRelease(row);
}

export async function latestRelease() {
  const r = await releases({ pageSize: 1 });
  return r.data[0] || null;
}

// A flash session is refused before it starts when the target image belongs to
// another product, or its min_firmware is above the version the device reports.
export async function startSession({ serial, target_build, reported_version }) {
  const device = await publicDeviceForFlash(serial);
  const image = await one('SELECT * FROM firmware WHERE build = $1::int', [Number(target_build) || 0]);
  if (!image) throw notFound('We do not have that firmware image.', 'firmware_not_found');

  if (Number(image.product_id) !== Number(device.product_id)) {
    throw unprocessable('firmware_wrong_model', `That image is for a different model. It cannot be written to a ${device.model}.`);
  }

  const currentVersion = reported_version ? String(reported_version) : device.firmware_version;
  if (image.min_firmware) {
    if (!currentVersion) {
      throw unprocessable('firmware_below_minimum', `That image needs the camera to be running ${image.min_firmware} or later. We cannot tell what this camera is running.`);
    }
    if (compareVersions(currentVersion, image.min_firmware) < 0) {
      throw unprocessable(
        'firmware_below_minimum',
        `That image needs the camera to be running ${image.min_firmware} or later. This camera is running ${currentVersion}.`,
      );
    }
  }
  if (image.channel !== 'general') {
    throw unprocessable('firmware_channel_closed', 'That image is not offered to this camera.');
  }

  let session;
  try {
    session = await one(
      `INSERT INTO flash_session (device_id, firmware_id, state)
       VALUES ($1,$2,'started')
       ON CONFLICT (device_id) WHERE state = 'started' DO NOTHING
       RETURNING *`,
      [device.id, image.id],
    );
  } catch (err) {
    if (err && err.code === '23505') session = null; else throw err;
  }
  if (!session) {
    throw conflict('flash_session_in_progress', `A firmware write is already running for ${device.serial}.`, { serial: device.serial });
  }

  if (reported_version && reported_version !== device.firmware_version) {
    await query('UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1', [device.id, String(reported_version)]);
  }

  info('flash_session_started', { serial: device.serial, build: Number(image.build) });
  return shapeSession(session, device, image);
}

function shapeSession(row, device, image) {
  return {
    id: Number(row.id),
    serial: device.serial,
    model: device.model,
    state: row.state,
    target_version: image.version,
    target_build: Number(image.build),
    reported_version: row.reported_version,
    failure_reason: row.failure_reason,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    ended_at: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at,
    device_firmware_version: device.firmware_version,
  };
}

async function sessionById(id) {
  return one(
    `SELECT s.*, d.serial, d.firmware_version, d.product_id, p.title AS model,
            f.version AS target_version, f.build AS target_build
     FROM flash_session s
     JOIN device d ON d.id = s.device_id
     JOIN product p ON p.id = d.product_id
     JOIN firmware f ON f.id = s.firmware_id
     WHERE s.id = $1`,
    [Number(id) || 0],
  );
}

// Completing a session records the version read back from the device, never
// the one that was requested.
export async function completeSession(id, reportedVersion) {
  const row = await sessionById(id);
  if (!row) throw notFound('That firmware session does not exist.', 'session_not_found');
  if (row.state !== 'started') {
    throw conflict('session_not_started', 'That firmware session has already finished.', { id: Number(row.id) });
  }
  const version = String(reportedVersion || '').trim();
  if (!version) throw badRequest('reported_version_required', 'The version the camera reported is required.');
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    throw badRequest('reported_version_invalid', 'That did not work. The camera reported a version we cannot read.');
  }

  const updated = await tx(async (c) => {
    const s = await c.query(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
       WHERE id = $1 AND state = 'started' RETURNING *`,
      [row.id, version],
    );
    if (!s.rows.length) throw conflict('session_not_started', 'That firmware session has already finished.', { id: Number(row.id) });
    await c.query(
      'UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1',
      [row.device_id, version],
    );
    return s.rows[0];
  });

  info('flash_session_succeeded', { serial: row.serial, reported_version: version });
  return {
    id: Number(updated.id),
    serial: row.serial,
    model: row.model,
    state: updated.state,
    target_version: row.target_version,
    target_build: Number(row.target_build),
    reported_version: updated.reported_version,
    device_firmware_version: version,
    started_at: updated.started_at.toISOString(),
    ended_at: updated.ended_at.toISOString(),
  };
}

// A failed session leaves the device's firmware version as it was.
export async function failSession(id, reason) {
  const row = await sessionById(id);
  if (!row) throw notFound('That firmware session does not exist.', 'session_not_found');
  if (row.state !== 'started') {
    throw conflict('session_not_started', 'That firmware session has already finished.', { id: Number(row.id) });
  }
  const updated = await one(
    `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
     WHERE id = $1 AND state = 'started' RETURNING *`,
    [row.id, String(reason || 'unknown').slice(0, 200)],
  );
  if (!updated) throw conflict('session_not_started', 'That firmware session has already finished.', { id: Number(row.id) });
  info('flash_session_failed', { serial: row.serial, reason: updated.failure_reason });
  return {
    id: Number(updated.id),
    serial: row.serial,
    model: row.model,
    state: updated.state,
    target_version: row.target_version,
    target_build: Number(row.target_build),
    failure_reason: updated.failure_reason,
    device_firmware_version: row.firmware_version,
    started_at: updated.started_at.toISOString(),
    ended_at: updated.ended_at.toISOString(),
  };
}

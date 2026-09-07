import { many, one, query } from '../db.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors.js';
import { PG_UNIQUE_VIOLATION } from '../db.js';
import { compareVersions, deviceBySerial, serialHasShape, normaliseSerial } from './devices.js';

export async function manifestFor({ model, channels }) {
  const allowed = new Set(['general', ...(channels || [])]);
  const product = await one(
    `SELECT id, handle, title FROM product WHERE (handle = $1 OR lower(title) = lower($1)) AND kind = 'camera'`,
    [String(model || '')],
  );
  if (!product) throw notFound('We do not make that model.');
  const rows = await many(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
       FROM firmware WHERE product_id = $1 ORDER BY build DESC`,
    [product.id],
  );
  return {
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    entries: rows
      .filter((r) => allowed.has(r.channel))
      .map((r) => ({
        version: r.version,
        build: r.build,
        channel: r.channel,
        min_firmware: r.min_firmware,
        min_app_version: r.min_app_version,
        size_bytes: Number(r.size_bytes),
        sha256: r.sha256,
        released_on: r.released_on,
      })),
  };
}

export async function firmwareByBuild(productId, build) {
  return one(
    `SELECT id, product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256
       FROM firmware WHERE product_id = $1 AND build = $2`,
    [productId, build],
  );
}

export async function firmwareById(id) {
  return one(
    `SELECT f.id, f.product_id, f.version, f.build, f.min_firmware, f.min_app_version, f.channel,
            p.title AS product_title FROM firmware f JOIN product p ON p.id = f.product_id WHERE f.id = $1`,
    [id],
  );
}

export async function recommendedFor(device) {
  const rows = await many(
    `SELECT id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256
       FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC`,
    [device.product_id],
  );
  const eligible = rows.filter(
    (f) => !f.min_firmware || (device.firmware_version && compareVersions(device.firmware_version, f.min_firmware) >= 0),
  );
  return { all: rows, recommended: eligible[0] || null };
}

export async function startSession({ serial, targetBuild, reportedVersion }) {
  if (!serialHasShape(serial)) throw badRequest('invalid_serial', 'We do not recognise that serial number.');
  const device = await deviceBySerial(serial);
  if (!device) throw badRequest('unknown_serial', 'We do not recognise that serial number.');

  const build = Number.parseInt(targetBuild, 10);
  if (!Number.isInteger(build)) throw badRequest('invalid_build', 'Choose a firmware image.');

  const image = await one(
    `SELECT f.id, f.product_id, f.version, f.build, f.min_firmware, f.channel, p.title AS product_title
       FROM firmware f JOIN product p ON p.id = f.product_id WHERE f.build = $1`,
    [build],
  );
  if (!image) throw badRequest('unknown_firmware', 'That firmware image does not exist.');

  // Refused before the session exists: wrong model, or below the minimum firmware.
  if (String(image.product_id) !== String(device.product_id)) {
    throw unprocessable(
      'wrong_model',
      `That image is for the ${image.product_title}. This camera is a ${device.product_title}.`,
    );
  }
  const current = reportedVersion ? String(reportedVersion) : device.firmware_version;
  if (image.min_firmware) {
    if (!current || compareVersions(current, image.min_firmware) < 0) {
      throw unprocessable(
        'below_min_firmware',
        `That image needs firmware ${image.min_firmware} or later. This camera reports ${current || 'no version'}.`,
      );
    }
  }

  if (reportedVersion && reportedVersion !== device.firmware_version) {
    await query(`UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`, [
      device.id,
      String(reportedVersion),
    ]);
  }

  try {
    const row = await one(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1, $2, 'started')
       RETURNING id, device_id, firmware_id, state, started_at`,
      [device.id, image.id],
    );
    return { session: row, device, image };
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      throw conflict('session_in_progress', `A write is already running on ${device.serial}.`, { serial: device.serial });
    }
    throw err;
  }
}

export async function sessionById(id) {
  return one(
    `SELECT s.*, d.serial, d.product_id, f.version AS target_version, f.build AS target_build
       FROM flash_session s JOIN device d ON d.id = s.device_id JOIN firmware f ON f.id = s.firmware_id
      WHERE s.id = $1`,
    [id],
  );
}

// The version recorded is the one read back from the device, never the one requested.
export async function completeSession({ id, reportedVersion }) {
  const session = await sessionById(id);
  if (!session) throw notFound('That session does not exist.');
  if (session.state !== 'started') throw conflict('session_finished', 'That session is already finished.');
  const version = String(reportedVersion || '').trim();
  if (!/^\d+(\.\d+)*$/.test(version)) throw badRequest('invalid_version', 'The camera did not report a version.');

  const updated = await one(
    `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
      WHERE id = $1 AND state = 'started' RETURNING *`,
    [id, version],
  );
  if (!updated) throw conflict('session_finished', 'That session is already finished.');
  await query(`UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`, [
    session.device_id,
    version,
  ]);
  return sessionById(id);
}

// A failed session leaves the device's firmware version as it was.
export async function failSession({ id, reason }) {
  const session = await sessionById(id);
  if (!session) throw notFound('That session does not exist.');
  if (session.state !== 'started') throw conflict('session_finished', 'That session is already finished.');
  const updated = await one(
    `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
      WHERE id = $1 AND state = 'started' RETURNING *`,
    [id, String(reason || 'unknown').slice(0, 200)],
  );
  if (!updated) throw conflict('session_finished', 'That session is already finished.');
  return sessionById(id);
}

export function serialiseSession(row) {
  return {
    id: String(row.id),
    device_id: String(row.device_id),
    serial: row.serial,
    firmware_id: String(row.firmware_id),
    target_version: row.target_version,
    target_build: row.target_build,
    state: row.state,
    reported_version: row.reported_version,
    failure_reason: row.failure_reason,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    ended_at: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at,
  };
}

export async function listReleases({ pageSize, cursor }) {
  const params = [pageSize + 1];
  let where = '1 = 1';
  if (cursor) {
    params.push(cursor.build);
    where = `build < $2`;
  }
  const rows = await many(
    `SELECT version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
       FROM app_release WHERE ${where} ORDER BY build DESC LIMIT $1`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize).map((r) => ({ ...r, size_bytes: Number(r.size_bytes) }));
  const last = page[page.length - 1];
  return { data: page, hasMore, lastKey: last ? { build: last.build } : null };
}

export async function releaseByVersion(version) {
  const row = await one(
    `SELECT version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
       FROM app_release WHERE version = $1`,
    [String(version || '')],
  );
  if (!row) throw notFound('That release does not exist.');
  return { ...row, size_bytes: Number(row.size_bytes) };
}

export { normaliseSerial };

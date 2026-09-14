import { db } from './db.js';
import { errors } from './errors.js';
import { numericCursor } from './pagination.js';
import { compareVersions, versionAtLeast, normaliseSerial } from './serials.js';
import { deviceBySerial } from './devices.js';

// The firmware manifest the installer reads, served for one product at a time.
export async function manifestForModel(handle) {
  const sql = db();
  const [product] = await sql`SELECT id, handle, title FROM product WHERE handle = ${handle}`;
  if (!product) throw errors.notFound('We do not know that model.', 'unknown_model');
  const entries = await sql`
    SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
    FROM firmware WHERE product_id = ${product.id}
    ORDER BY build DESC
  `;
  return {
    product: product.title,
    product_handle: product.handle,
    generated_at: new Date().toISOString(),
    entries: entries.map((e) => ({
      version: e.version,
      build: e.build,
      channel: e.channel,
      min_firmware: e.minFirmware,
      min_app_version: e.minAppVersion,
      size_bytes: Number(e.sizeBytes),
      sha256: e.sha256,
      released_on: e.releasedOn
    }))
  };
}

export async function listReleases({ pageSize, cursor }) {
  const sql = db();
  const cursorBuild = numericCursor(cursor);
  const rows = await sql`
    SELECT version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
    FROM app_release
    WHERE (${cursorBuild}::int IS NULL OR build < ${cursorBuild})
    ORDER BY build DESC
    LIMIT ${pageSize + 1}
  `;
  const hasMore = rows.length > pageSize;
  const data = rows.slice(0, pageSize);
  return {
    data: data.map((r) => ({
      version: r.version,
      build: r.build,
      released_on: r.releasedOn,
      channel: r.channel,
      artifact_name: r.artifactName,
      size_bytes: Number(r.sizeBytes),
      sha256: r.sha256,
      description: r.description,
      notes: r.notes
    })),
    hasMore,
    nextCursor: hasMore ? String(data[data.length - 1].build) : null
  };
}

export async function getRelease(version) {
  const sql = db();
  const [r] = await sql`SELECT * FROM app_release WHERE version = ${version} LIMIT 1`;
  if (!r) return null;
  return {
    version: r.version,
    build: r.build,
    released_on: r.releasedOn,
    channel: r.channel,
    artifact_name: r.artifactName,
    size_bytes: Number(r.sizeBytes),
    sha256: r.sha256,
    description: r.description,
    notes: r.notes
  };
}

// A flash session is refused before it starts when the image belongs to another
// product, or its minimum firmware is above the version the device reports.
export async function startFlashSession({ serial, targetBuild }) {
  const sql = db();
  const build = Number(targetBuild);
  if (!Number.isInteger(build) || build <= 0) {
    throw errors.badRequest('Choose a firmware build.', 'invalid_build');
  }
  const device = await deviceBySerial(serial);
  if (!device) throw errors.notFound('We do not recognise that serial number.', 'unknown_serial');
  const [firmware] = await sql`SELECT * FROM firmware WHERE build = ${build} LIMIT 1`;
  if (!firmware) throw errors.notFound('We do not have that firmware.', 'unknown_firmware');
  if (firmware.productId !== device.productId) {
    throw errors.conflict('That image belongs to another camera.', 'wrong_product');
  }
  if (firmware.channel === 'yanked') {
    throw errors.conflict('That firmware was withdrawn.', 'firmware_yanked');
  }
  if (firmware.minFirmware && !versionAtLeast(device.firmwareVersion, firmware.minFirmware)) {
    throw errors.conflict(
      `This camera needs firmware ${firmware.minFirmware} or later before it can take ${firmware.version}. It reports ${device.firmwareVersion || 'nothing'}.`,
      'below_min_firmware'
    );
  }
  try {
    const [session] = await sql`
      INSERT INTO flash_session (device_id, firmware_id, state)
      VALUES (${device.id}, ${firmware.id}, 'started')
      RETURNING *
    `;
    return {
      id: session.id,
      state: session.state,
      device_serial: device.serial,
      firmware_version: firmware.version,
      firmware_build: firmware.build,
      started_at: session.startedAt
    };
  } catch (err) {
    if (String(err.code) === '23505' || /flash_session_one_started/.test(String(err.message))) {
      throw errors.conflict('A write is already running for this camera.', 'session_in_progress');
    }
    throw err;
  }
}

export async function completeFlashSession(sessionId, reportedVersion) {
  const sql = db();
  const id = Number(sessionId);
  const version = String(reportedVersion || '').trim();
  if (!/^\d+(\.\d+)*$/.test(version)) {
    throw errors.badRequest('Report the version the camera gave back.', 'invalid_version');
  }
  const [session] = await sql`
    UPDATE flash_session
    SET state = 'succeeded', reported_version = ${version}, ended_at = now()
    WHERE id = ${id} AND state = 'started'
    RETURNING *
  `;
  if (!session) throw errors.notFound('That session is not running.', 'session_not_started');
  await sql`
    UPDATE device SET firmware_version = ${version}, firmware_reported_at = now(), status = 'registered'
    WHERE id = ${session.deviceId}
  `;
  const [device] = await sql`SELECT serial, firmware_version FROM device WHERE id = ${session.deviceId}`;
  return {
    id: session.id,
    state: 'succeeded',
    reported_version: version,
    device_serial: device.serial,
    device_firmware_version: device.firmwareVersion,
    ended_at: session.endedAt
  };
}

export async function failFlashSession(sessionId, reason) {
  const sql = db();
  const id = Number(sessionId);
  const [session] = await sql`
    UPDATE flash_session
    SET state = 'failed', failure_reason = ${String(reason || 'unknown').slice(0, 300)}, ended_at = now()
    WHERE id = ${id} AND state = 'started'
    RETURNING *
  `;
  if (!session) throw errors.notFound('That session is not running.', 'session_not_started');
  const [device] = await sql`SELECT serial, firmware_version FROM device WHERE id = ${session.deviceId}`;
  return {
    id: session.id,
    state: 'failed',
    failure_reason: session.failureReason,
    device_serial: device.serial,
    device_firmware_version: device.firmwareVersion,
    ended_at: session.endedAt
  };
}

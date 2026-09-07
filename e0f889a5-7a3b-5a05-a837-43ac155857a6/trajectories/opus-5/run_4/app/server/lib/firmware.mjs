import { query, withTransaction } from './db.mjs';
import { badRequest, conflict, notFound } from './errors.mjs';
import { compareVersions, lookupDeviceForFlash } from './devices.mjs';

/**
 * The manifest is served for one product at a time. An entry whose channel is
 * not `general` is never offered to a device that has not opted into it.
 */
export async function manifestFor(model, { channels = ['general'] } = {}) {
  const { rows: products } = await query(
    `SELECT id, handle, title FROM product WHERE (handle = $1 OR lower(title) = lower($1)) AND kind = 'camera'`,
    [String(model || '')]);
  if (!products.length) throw notFound('We do not make that model.', 'model_unknown');
  const product = products[0];
  const allowed = Array.from(new Set(['general', ...channels.filter((c) => c !== 'yanked')]));
  const { rows } = await query(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
       FROM firmware
      WHERE product_id = $1 AND channel = ANY($2::text[])
      ORDER BY build DESC`, [product.id, allowed]);
  return {
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    entries: rows.map((r) => ({
      version: r.version,
      build: Number(r.build),
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
  const { rows } = await query(
    `SELECT * FROM firmware WHERE product_id = $1 AND build = $2`, [productId, build]);
  return rows[0] || null;
}

export async function newestFirmware(productId) {
  const { rows } = await query(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId]);
  return rows[0] || null;
}

/**
 * A session is refused before it starts when the image belongs to another
 * product, or when its min_firmware is above the version the device reports.
 * A refusal writes no session row and leaves the firmware untouched.
 */
export async function startFlashSession({ serial, targetBuild }) {
  const { row: device } = await lookupDeviceForFlash(serial);

  const build = Number(targetBuild);
  if (!Number.isInteger(build)) throw badRequest('target_invalid', 'Choose a firmware image.');

  const { rows: images } = await query(`SELECT * FROM firmware WHERE build = $1`, [build]);
  if (!images.length) throw notFound('That firmware image does not exist.', 'firmware_unknown');
  const image = images[0];

  // Belongs to another product.
  if (String(image.product_id) !== String(device.product_id)) {
    const { rows: owner } = await query(`SELECT title FROM product WHERE id = $1`, [image.product_id]);
    throw conflict('wrong_model',
      `That image is for the ${owner[0]?.title || 'another model'}, not this camera.`);
  }
  if (image.channel === 'yanked') {
    throw conflict('firmware_yanked', 'That image was withdrawn. Choose another.');
  }
  // Would go below the minimum firmware.
  if (image.min_firmware && device.firmware_version
      && compareVersions(device.firmware_version, image.min_firmware) < 0) {
    throw conflict('min_firmware',
      `This camera is running ${device.firmware_version}. It needs ${image.min_firmware} before it can take ${image.version}.`);
  }
  if (image.min_firmware && !device.firmware_version) {
    throw conflict('min_firmware',
      `This camera has not reported its firmware, and ${image.version} needs at least ${image.min_firmware}.`);
  }

  try {
    const { rows } = await query(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
      [device.id, image.id]);
    return { session: rows[0], device, image };
  } catch (err) {
    // At most one session in 'started' per device, enforced by the store.
    if (err && err.code === '23505') {
      throw conflict('session_in_progress', 'This camera already has a write in progress.');
    }
    throw err;
  }
}

async function loadSession(id) {
  const { rows } = await query(
    `SELECT s.*, d.serial, d.product_id, f.version AS target_version, f.build AS target_build
       FROM flash_session s
       JOIN device d ON d.id = s.device_id
       JOIN firmware f ON f.id = s.firmware_id
      WHERE s.id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Completing a session records the version read back from the device, never the
 * one that was requested.
 */
export async function completeFlashSession(id, reportedVersion) {
  const session = await loadSession(id);
  if (!session) throw notFound('That session does not exist.', 'session_not_found');
  if (session.state !== 'started') {
    throw conflict('session_finished', 'That session has already finished.');
  }
  const reported = String(reportedVersion ?? '').trim();
  if (!/^\d+(\.\d+)*$/.test(reported)) {
    throw badRequest('reported_version_invalid', 'The camera did not report a version we understand.');
  }

  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
        WHERE id = $1 AND state = 'started' RETURNING *`, [id, reported]);
    if (!rows.length) throw conflict('session_finished', 'That session has already finished.');
    // The device records what it reported, not what was asked for.
    await client.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`,
      [session.device_id, reported]);
    return rows[0];
  });

  const { rows: device } = await query(
    `SELECT serial, firmware_version FROM device WHERE id = $1`, [session.device_id]);
  return { session: updated, device: device[0], requested_version: session.target_version };
}

/** A failed session leaves the device's version as it was. */
export async function failFlashSession(id, reason) {
  const session = await loadSession(id);
  if (!session) throw notFound('That session does not exist.', 'session_not_found');
  if (session.state !== 'started') {
    throw conflict('session_finished', 'That session has already finished.');
  }
  const { rows } = await query(
    `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
      WHERE id = $1 AND state = 'started' RETURNING *`,
    [id, String(reason ?? 'unknown').slice(0, 200)]);
  if (!rows.length) throw conflict('session_finished', 'That session has already finished.');
  const { rows: device } = await query(
    `SELECT serial, firmware_version FROM device WHERE id = $1`, [session.device_id]);
  return { session: rows[0], device: device[0] };
}

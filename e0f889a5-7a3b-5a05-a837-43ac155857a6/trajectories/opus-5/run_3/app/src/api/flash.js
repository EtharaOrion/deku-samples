import { one, query, tx, PG_UNIQUE_VIOLATION } from '../lib/db.js';
import { compareVersions, isValidSerial, normaliseSerial } from '../lib/domain.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';

/**
 * Start a flash session.
 *
 * Refused before it starts when the target image belongs to another product, or
 * its min_firmware is above the version the device reports. A refusal writes no
 * session row and leaves the firmware untouched.
 *
 * Ownership and warranty are not conditions of repair: a camera registered to
 * somebody else, and a camera out of warranty, are both repaired.
 */
export async function startSession({ serial, targetBuild, reportedVersion }) {
  const clean = normaliseSerial(serial);
  if (!isValidSerial(clean)) {
    throw unprocessable('invalid_serial', 'We do not recognise that serial number.');
  }

  const device = await one(
    `SELECT d.*, p.title AS model FROM device d JOIN product p ON p.id = d.product_id
      WHERE upper(d.serial) = upper($1)`,
    [clean],
  );
  if (!device) throw notFound('We do not recognise that serial number.', 'device_unknown');
  if (device.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked. We cannot write firmware to it.', {
      resource: clean,
    });
  }

  const firmware = await one(`SELECT * FROM firmware WHERE build = $1`, [Number(targetBuild)]);
  if (!firmware) throw notFound('That firmware does not exist.', 'firmware_unknown');

  // The image must belong to this product.
  if (firmware.product_id !== device.product_id) {
    throw unprocessable('firmware_wrong_product',
      `That image is for a different model. It cannot be written to a ${device.model}.`);
  }

  // A manifest entry whose channel is not general is never offered to a device
  // that has not opted into that channel.
  if (firmware.channel !== 'general') {
    throw unprocessable('firmware_channel',
      'That image is not on the general channel, so it is not offered for this camera.');
  }

  // The version the device reports now, falling back to what we last heard.
  const current = reportedVersion ? String(reportedVersion) : device.firmware_version;

  if (firmware.min_firmware) {
    if (!current) {
      throw unprocessable('firmware_minimum',
        `That image needs the camera to be running ${firmware.min_firmware} or later. We have not heard a version from this camera.`);
    }
    if (compareVersions(current, firmware.min_firmware) < 0) {
      throw unprocessable('firmware_minimum',
        `That image needs the camera to be running ${firmware.min_firmware} or later. This one reports ${current}.`);
    }
  }

  if (reportedVersion && reportedVersion !== device.firmware_version) {
    await query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`,
      [device.id, String(reportedVersion)],
    );
  }

  try {
    const session = await one(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
      [device.id, firmware.id],
    );
    return { session, device, firmware };
  } catch (err) {
    if (err?.code === PG_UNIQUE_VIOLATION) {
      // At most one session in started per device at any time.
      throw conflict('flash_in_progress',
        'A firmware write is already running for that camera.', { resource: clean });
    }
    throw err;
  }
}

/**
 * Complete a session. Records the version read back from the device, never the
 * one that was requested.
 */
export async function completeSession(id, reportedVersion) {
  const version = String(reportedVersion ?? '').trim();
  if (!version) {
    throw unprocessable('reported_version_required',
      'The camera did not report a version, so we cannot close this session.');
  }

  return tx(async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [id],
    );
    const session = rows[0];
    if (!session) throw notFound('That session does not exist.', 'session_not_found');
    if (session.state !== 'started') {
      throw conflict('session_not_started', 'That session has already finished.', { resource: id });
    }

    const { rows: sr } = await c.query(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
        WHERE id = $1 RETURNING *`,
      [id, version],
    );
    // The device records what the camera reported.
    const { rows: dr } = await c.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now()
        WHERE id = $1 RETURNING serial, firmware_version`,
      [session.device_id, version],
    );
    return { session: sr[0], device: dr[0] };
  });
}

/** A failed session leaves the firmware version as it was. */
export async function failSession(id, reason) {
  return tx(async (c) => {
    const { rows } = await c.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [id]);
    const session = rows[0];
    if (!session) throw notFound('That session does not exist.', 'session_not_found');
    if (session.state !== 'started') {
      throw conflict('session_not_started', 'That session has already finished.', { resource: id });
    }
    const { rows: sr } = await c.query(
      `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
        WHERE id = $1 RETURNING *`,
      [id, String(reason ?? '').slice(0, 200) || 'unknown'],
    );
    return { session: sr[0] };
  });
}

export async function sessionById(id) {
  return one(`SELECT * FROM flash_session WHERE id = $1`, [id]);
}

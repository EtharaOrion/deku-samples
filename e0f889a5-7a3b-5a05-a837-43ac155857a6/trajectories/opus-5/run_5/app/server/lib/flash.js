import { one, many, tx, isUniqueViolation } from './db.js';
import { conflict, notFound, unprocessable } from './errors.js';
import { assertSerialShape, deviceBySerial, compareVersions } from './devices.js';
import { isoDate } from './catalogue.js';

/**
 * A manifest is served for one product at a time. An entry whose channel is not
 * `general` is never offered to a device that has not opted into that channel.
 */
export async function manifestFor({ handle, channels = ['general'] }) {
  const product = await one(`SELECT id, handle, title FROM product WHERE handle = $1`, [handle]);
  if (!product) throw notFound('We do not build that model.', 'unknown_model');
  const entries = await many(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
       FROM firmware
      WHERE product_id = $1 AND channel = ANY($2::text[])
      ORDER BY build DESC`,
    [product.id, channels],
  );
  return {
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    entries: entries.map((e) => ({
      version: e.version,
      build: e.build,
      channel: e.channel,
      min_firmware: e.min_firmware,
      min_app_version: e.min_app_version,
      size_bytes: Number(e.size_bytes),
      sha256: e.sha256,
      released_on: isoDate(e.released_on),
    })),
  };
}

/**
 * Start a flash session.
 *
 * Refused before it starts when the image belongs to another product, or when its
 * min_firmware is above the version the device reports. A refusal writes no session
 * row and leaves the firmware untouched.
 *
 * Ownership and warranty are not conditions of repair: a camera registered to
 * somebody else, and one out of warranty, are both repaired.
 */
export async function startSession({ serial: rawSerial, targetBuild, reportedVersion, channels = ['general'] }) {
  const serial = assertSerialShape(rawSerial);
  const device = await deviceBySerial(serial);
  if (!device) throw notFound('We do not recognise that serial number.', 'unknown_serial');
  if (device.status === 'blocked') {
    throw unprocessable('device_blocked', 'That camera is blocked. Get in touch before using it.');
  }

  const firmware = await one(`SELECT * FROM firmware WHERE build = $1 AND product_id = $2`, [
    Number(targetBuild), device.product_id,
  ]);
  if (!firmware) {
    // Either it does not exist, or it belongs to another product. Say which.
    const elsewhere = await one(
      `SELECT f.version, p.title FROM firmware f JOIN product p ON p.id = f.product_id WHERE f.build = $1`,
      [Number(targetBuild)],
    );
    if (elsewhere) {
      throw unprocessable(
        'wrong_model',
        `That image is for the ${elsewhere.title}. This camera is a ${device.model}.`,
      );
    }
    throw notFound('We do not have that firmware image.', 'unknown_firmware');
  }
  if (firmware.channel !== 'general' && !channels.includes(firmware.channel)) {
    throw unprocessable('channel_not_opted_in', 'That image is not offered for this camera.');
  }

  const current = reportedVersion || device.firmware_version;
  if (firmware.min_firmware && current && compareVersions(current, firmware.min_firmware) < 0) {
    throw unprocessable(
      'below_min_firmware',
      `This camera runs ${current}. Firmware ${firmware.version} needs ${firmware.min_firmware} or later first.`,
    );
  }

  try {
    const session = await one(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
      [device.id, firmware.id],
    );
    return sessionView(session, device, firmware);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // At most one session in `started` per device at any time.
      throw conflict('session_in_flight', 'That camera already has a write running.', { serial });
    }
    throw err;
  }
}

export async function sessionById(id) {
  return one(
    `SELECT s.*, d.serial, d.status AS device_status, p.title AS model, d.product_id,
            f.version AS firmware_version, f.build AS firmware_build
       FROM flash_session s
       JOIN device d ON d.id = s.device_id
       JOIN product p ON p.id = d.product_id
       JOIN firmware f ON f.id = s.firmware_id
      WHERE s.id = $1`,
    [id],
  );
}

/** Completing records the version read back from the device, never the one requested. */
export async function completeSession({ id, reportedVersion }) {
  const session = await sessionById(id);
  if (!session) throw notFound('That session does not exist.', 'unknown_session');
  if (session.state !== 'started') {
    throw conflict('session_finished', 'That write has already finished.', { id: Number(id) });
  }
  const version = String(reportedVersion ?? '').trim();
  if (!version) throw unprocessable('reported_version_required', 'The camera did not report a version.');

  await tx(async (db) => {
    const { rowCount } = await db.query(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
        WHERE id = $1 AND state = 'started'`,
      [id, version],
    );
    if (!rowCount) throw conflict('session_finished', 'That write has already finished.', { id: Number(id) });
    // The device records what it reported, not what was asked for.
    await db.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`,
      [session.device_id, version],
    );
  });

  const fresh = await sessionById(id);
  return {
    id: Number(fresh.id),
    state: fresh.state,
    serial: fresh.serial,
    model: fresh.model,
    requested_version: fresh.firmware_version,
    reported_version: fresh.reported_version,
    device_firmware_version: fresh.reported_version,
    started_at: new Date(fresh.started_at).toISOString(),
    ended_at: fresh.ended_at ? new Date(fresh.ended_at).toISOString() : null,
  };
}

/** A failed session leaves the device's version as it was. */
export async function failSession({ id, reason }) {
  const session = await sessionById(id);
  if (!session) throw notFound('That session does not exist.', 'unknown_session');
  if (session.state !== 'started') {
    throw conflict('session_finished', 'That write has already finished.', { id: Number(id) });
  }
  const { rowCount } = await one(
    `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
      WHERE id = $1 AND state = 'started' RETURNING id`,
    [id, String(reason ?? 'unknown').slice(0, 200)],
  ).then((r) => ({ rowCount: r ? 1 : 0 }));
  if (!rowCount) throw conflict('session_finished', 'That write has already finished.', { id: Number(id) });

  const fresh = await sessionById(id);
  const device = await one(`SELECT firmware_version FROM device WHERE id = $1`, [session.device_id]);
  return {
    id: Number(fresh.id),
    state: fresh.state,
    serial: fresh.serial,
    model: fresh.model,
    failure_reason: fresh.failure_reason,
    device_firmware_version: device?.firmware_version ?? null,
    started_at: new Date(fresh.started_at).toISOString(),
    ended_at: fresh.ended_at ? new Date(fresh.ended_at).toISOString() : null,
  };
}

function sessionView(session, device, firmware) {
  return {
    id: Number(session.id),
    state: session.state,
    serial: device.serial,
    model: device.model,
    target_version: firmware.version,
    target_build: firmware.build,
    size_bytes: Number(firmware.size_bytes),
    sha256: firmware.sha256,
    current_version: device.firmware_version,
    started_at: new Date(session.started_at).toISOString(),
  };
}

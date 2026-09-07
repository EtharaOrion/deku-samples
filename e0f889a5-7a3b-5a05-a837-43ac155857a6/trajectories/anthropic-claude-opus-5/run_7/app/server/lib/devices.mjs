// Cameras and firmware. A serial is a record in its own right, with at most one
// live owner; ownership is a link made and released.
import { tx, query, one } from './db.mjs';
import { AppError, badRequest, conflict, notFound, unprocessable } from './errors.mjs';

const SERIAL_RE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/** A serial that does not match the shape is refused before any lookup happens. */
export function validSerial(serial) {
  return typeof serial === 'string' && SERIAL_RE.test(serial.trim().toUpperCase());
}

export function normaliseSerial(serial) {
  return String(serial || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

/** Compare dotted version strings numerically: 6.11 is above 6.2. */
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export async function deviceBySerial(serial) {
  return one(
    `SELECT d.*, p.handle, p.title AS model, p.id AS pid, v.sku, v.option_value
       FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
      WHERE upper(d.serial) = upper($1)`,
    [serial],
  );
}

export async function liveOwner(deviceId) {
  return one(
    'SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL',
    [deviceId],
  );
}

/**
 * Register a serial to this account. Only registers when the device exists with no
 * live owner. Two simultaneous registrations cannot both succeed: the partial
 * unique index in the store settles it, not an application check.
 */
export async function registerDevice(serial, customerId) {
  const clean = normaliseSerial(serial);
  if (!validSerial(clean)) {
    throw badRequest('invalid_serial', 'We do not recognise that serial number.');
  }

  return tx(async (c) => {
    const { rows: [device] } = await c.query(
      `SELECT d.*, p.handle, p.title AS model FROM device d JOIN product p ON p.id = d.product_id
        WHERE upper(d.serial) = upper($1)`,
      [clean],
    );
    if (!device) throw notFound('We do not recognise that serial number.');

    if (device.status === 'blocked') {
      throw unprocessable('device_blocked', 'That camera is blocked and cannot be registered.');
    }

    const { rows: [existing] } = await c.query(
      'SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL',
      [device.id],
    );
    if (existing) {
      if (Number(existing.customer_id) === Number(customerId)) {
        throw conflict('already_registered', 'That camera is already on your account.', { resource: device.serial });
      }
      // Never the other person's identity.
      throw conflict('owned_by_other', 'That camera is registered to someone else.', { resource: device.serial });
    }

    try {
      await c.query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
         VALUES ($1,$2,$3,'manual')`,
        [device.id, customerId, device.order_id],
      );
    } catch (err) {
      // The store refused a second live owner: this request lost the race.
      if (err && err.code === '23505') {
        throw conflict('owned_by_other', 'That camera is registered to someone else.', { resource: device.serial });
      }
      throw err;
    }

    await c.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [device.id]);
    const { rows: [fresh] } = await c.query(
      `SELECT d.*, p.handle, p.title AS model, v.sku, v.option_value
         FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
        WHERE d.id = $1`,
      [device.id],
    );
    return fresh;
  });
}

/** Releasing ends the link and grants it to nobody. */
export async function releaseDevice(serial, customerId) {
  return tx(async (c) => {
    const { rows: [device] } = await c.query(
      `SELECT d.*, p.handle, p.title AS model FROM device d JOIN product p ON p.id = d.product_id
        WHERE upper(d.serial) = upper($1)`,
      [normaliseSerial(serial)],
    );
    // Another customer's serial reads as not found, never forbidden.
    if (!device) throw notFound('We do not recognise that serial number.');

    const { rowCount } = await c.query(
      `UPDATE device_ownership SET released_at = now()
        WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL`,
      [device.id, customerId],
    );
    if (rowCount === 0) throw notFound('We do not recognise that serial number.');

    await c.query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1`, [device.id]);
    const { rows: [fresh] } = await c.query(
      `SELECT d.*, p.handle, p.title AS model, v.sku, v.option_value
         FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
        WHERE d.id = $1`,
      [device.id],
    );
    return fresh;
  });
}

export async function renameDevice(serial, customerId, nickname) {
  const device = await deviceBySerial(normaliseSerial(serial));
  if (!device) throw notFound('We do not recognise that serial number.');
  const owner = await liveOwner(device.id);
  if (!owner || Number(owner.customer_id) !== Number(customerId)) {
    throw notFound('We do not recognise that serial number.');
  }
  const { rows: [fresh] } = await query(
    `UPDATE device SET nickname = $2 WHERE id = $1
     RETURNING *, (SELECT title FROM product WHERE id = device.product_id) AS model`,
    [device.id, nickname ? String(nickname).slice(0, 60) : null],
  );
  return { ...device, ...fresh };
}

/** The newest general firmware for a product, which is what "update available" means. */
export async function latestFirmwareFor(productId) {
  return one(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general'
      ORDER BY build DESC LIMIT 1`,
    [productId],
  );
}

export function deviceShape(row, latest) {
  const updateAvailable = Boolean(
    row.firmware_version && latest && compareVersions(latest.version, row.firmware_version) > 0,
  );
  return {
    serial: row.serial,
    model: row.model,
    option_value: row.option_value,
    sku: row.sku,
    nickname: row.nickname,
    status: row.status,
    firmware_version: row.firmware_version,
    firmware_reported_at: row.firmware_reported_at,
    latest_firmware: latest ? latest.version : null,
    update_available: updateAvailable,
    never_connected: !row.firmware_version,
    warranty_until: row.warranty_until,
    warranty_expired: row.warranty_until ? new Date(row.warranty_until) < new Date() : false,
  };
}

/**
 * Start a flash session. Refused before it starts when the image belongs to another
 * product or sits above the device's reported firmware. A refusal writes no row.
 */
export async function startFlashSession({ serial, targetBuild, optInChannels = [] }) {
  const clean = normaliseSerial(serial);
  if (!validSerial(clean)) throw badRequest('invalid_serial', 'We do not recognise that serial number.');

  return tx(async (c) => {
    const { rows: [device] } = await c.query(
      `SELECT d.*, p.handle, p.title AS model FROM device d JOIN product p ON p.id = d.product_id
        WHERE upper(d.serial) = upper($1)`,
      [clean],
    );
    if (!device) throw notFound('We do not recognise that serial number.');

    const { rows: [firmware] } = await c.query('SELECT * FROM firmware WHERE build = $1 LIMIT 1', [Number(targetBuild)]);
    if (!firmware) throw notFound('That firmware image does not exist.');

    // The image belongs to another product.
    if (Number(firmware.product_id) !== Number(device.product_id)) {
      throw unprocessable('wrong_product', 'That firmware is for a different camera.', {
        resource: device.serial,
      });
    }

    // A channel the device has not opted into is never offered.
    if (firmware.channel !== 'general' && !optInChannels.includes(firmware.channel)) {
      throw unprocessable('channel_not_offered', 'That firmware is not offered for this camera.');
    }

    // min_firmware above the version the device reports.
    if (firmware.min_firmware) {
      const reported = device.firmware_version;
      if (!reported || compareVersions(reported, firmware.min_firmware) < 0) {
        throw unprocessable(
          'below_min_firmware',
          `That camera must be running ${firmware.min_firmware} or later before it can take ${firmware.version}.`,
          { min_firmware: firmware.min_firmware, reported_version: reported },
        );
      }
    }

    try {
      const { rows: [session] } = await c.query(
        `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
        [device.id, firmware.id],
      );
      return { session, device, firmware };
    } catch (err) {
      if (err && err.code === '23505') {
        throw conflict('session_in_progress', 'That camera already has a firmware write in progress.', {
          resource: device.serial,
        });
      }
      throw err;
    }
  });
}

/** Records the version read back from the device, never the one requested. */
export async function completeFlashSession(id, reportedVersion) {
  if (!reportedVersion || typeof reportedVersion !== 'string') {
    throw badRequest('reported_version_required', 'The version the camera reported is required.');
  }
  return tx(async (c) => {
    const { rows: [session] } = await c.query(
      `SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [Number(id)],
    );
    if (!session) throw notFound('That firmware session does not exist.');
    if (session.state !== 'started') {
      throw conflict('session_finished', 'That firmware session has already finished.', { resource: String(id) });
    }

    const { rows: [updated] } = await c.query(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
        WHERE id = $1 RETURNING *`,
      [session.id, reportedVersion],
    );
    // The device records what it reported, not what was asked for.
    const { rows: [device] } = await c.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now()
        WHERE id = $1
        RETURNING *, (SELECT title FROM product WHERE id = device.product_id) AS model`,
      [session.device_id, reportedVersion],
    );
    return { session: updated, device };
  });
}

/** A failed session leaves the firmware version as it was. */
export async function failFlashSession(id, reason) {
  return tx(async (c) => {
    const { rows: [session] } = await c.query('SELECT * FROM flash_session WHERE id = $1 FOR UPDATE', [Number(id)]);
    if (!session) throw notFound('That firmware session does not exist.');
    if (session.state !== 'started') {
      throw conflict('session_finished', 'That firmware session has already finished.', { resource: String(id) });
    }
    const { rows: [updated] } = await c.query(
      `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
        WHERE id = $1 RETURNING *`,
      [session.id, reason ? String(reason).slice(0, 200) : 'unknown'],
    );
    const { rows: [device] } = await c.query('SELECT * FROM device WHERE id = $1', [session.device_id]);
    return { session: updated, device };
  });
}

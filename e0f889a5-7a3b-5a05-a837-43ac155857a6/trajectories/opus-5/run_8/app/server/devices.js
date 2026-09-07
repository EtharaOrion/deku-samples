import { tx, one, many, query } from './db.js';
import { badRequest, conflict, notFound, unprocessable } from './errors.js';
import { serialShapeOk } from './orders.js';

export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => Number(n) || 0);
  const pb = String(b ?? '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export async function latestGeneralFirmware(productId) {
  return one(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId]
  );
}

export async function shapeDevice(d) {
  const latest = await latestGeneralFirmware(d.product_id);
  const updateAvailable = !!(latest && d.firmware_version && compareVersions(d.firmware_version, latest.version) < 0);
  const warrantyActive = d.warranty_until ? new Date(d.warranty_until).getTime() >= Date.now() : false;
  return {
    serial: d.serial,
    model: d.model ?? d.product_title,
    handle: d.handle,
    variant: d.option_value,
    nickname: d.nickname,
    status: d.status,
    firmware_version: d.firmware_version,
    firmware_reported_at: d.firmware_reported_at ? new Date(d.firmware_reported_at).toISOString() : null,
    latest_firmware_version: latest ? latest.version : null,
    update_available: updateAvailable,
    warranty_until: d.warranty_until ? String(d.warranty_until).slice(0, 10) : null,
    warranty_active: warrantyActive,
    firmware_state: !d.firmware_version ? 'Not yet connected' : updateAvailable ? 'Update available' : 'Up to date',
  };
}

const DEVICE_SELECT = `
  SELECT d.*, p.title AS model, p.handle, v.option_value
    FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id`;

export async function deviceBySerial(serial) {
  return one(`${DEVICE_SELECT} WHERE upper(d.serial) = upper($1)`, [String(serial ?? '')]);
}

export async function deviceOwnedBy(serial, customerId) {
  return one(
    `${DEVICE_SELECT}
      WHERE upper(d.serial) = upper($1)
        AND EXISTS (SELECT 1 FROM device_ownership o
                     WHERE o.device_id = d.id AND o.released_at IS NULL AND o.customer_id = $2)`,
    [String(serial ?? ''), customerId]
  );
}

export function normaliseSerial(raw) {
  return String(raw ?? '').replace(/[\s-]/g, '').toUpperCase();
}

// A serial registers only when the device exists with no live owner.
export async function registerDevice(serial, customerId) {
  const s = normaliseSerial(serial);
  // A serial that does not match the shape is refused before any lookup happens.
  if (!serialShapeOk(s)) {
    throw badRequest('serial_shape', 'We do not recognise that serial number.');
  }

  return tx(async (c) => {
    const d = await c.query(
      `SELECT d.id, d.status, d.blocked_reason FROM device d WHERE upper(d.serial) = upper($1) FOR UPDATE`,
      [s]
    );
    const dev = d.rows[0];
    if (!dev) throw notFound('We do not recognise that serial number.');
    if (dev.status === 'blocked') {
      throw unprocessable('device_blocked', 'That camera is blocked. Write to us and we will look into it.');
    }

    // The partial unique index is what actually holds this under concurrency.
    let ins;
    try {
      ins = await c.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual') RETURNING id`,
        [dev.id, customerId]
      );
    } catch (err) {
      if (err && err.code === '23505') {
        throw conflict('device_taken', 'That camera is registered to someone else.', { resource: s });
      }
      throw err;
    }
    if (ins.rowCount === 0) {
      throw conflict('device_taken', 'That camera is registered to someone else.', { resource: s });
    }

    await c.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [dev.id]);
    const row = await c.query(`${DEVICE_SELECT} WHERE d.id = $1`, [dev.id]);
    return row.rows[0];
  });
}

export async function renameDevice(serial, customerId, nickname) {
  const d = await deviceOwnedBy(serial, customerId);
  if (!d) throw notFound('We do not recognise that serial number.');
  const n = nickname === null || nickname === undefined ? null : String(nickname).trim().slice(0, 60);
  await query('UPDATE device SET nickname = $2 WHERE id = $1', [d.id, n || null]);
  return deviceBySerial(serial);
}

// Releasing ends the link and grants it to nobody.
export async function releaseDevice(serial, customerId) {
  const d = await deviceOwnedBy(serial, customerId);
  if (!d) throw notFound('We do not recognise that serial number.');
  await tx(async (c) => {
    await c.query(
      `UPDATE device_ownership SET released_at = now()
        WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL`,
      [d.id, customerId]
    );
    await c.query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1`, [d.id]);
  });
  return deviceBySerial(serial);
}

export async function devicesForCustomer(customerId, { limit, cursorId }) {
  const params = [customerId, limit + 1];
  let where = '';
  if (cursorId !== null && cursorId !== undefined) {
    params.push(cursorId);
    where = ` AND d.id < $3`;
  }
  return many(
    `SELECT d.*, p.title AS model, p.handle, v.option_value
       FROM device d
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
       JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
      WHERE o.customer_id = $1${where}
      ORDER BY d.id DESC
      LIMIT $2`,
    params
  );
}

// A flash session is refused before it starts when the image is wrong for the device.
export async function startFlashSession({ serial, targetBuild, reportedVersion }) {
  const s = normaliseSerial(serial);
  if (!serialShapeOk(s)) throw badRequest('serial_shape', 'We do not recognise that serial number.');

  return tx(async (c) => {
    const dRes = await c.query(
      `SELECT d.*, p.title AS model, p.handle FROM device d JOIN product p ON p.id = d.product_id
        WHERE upper(d.serial) = upper($1) FOR UPDATE OF d`,
      [s]
    );
    const device = dRes.rows[0];
    if (!device) throw notFound('We do not recognise that serial number.');
    if (device.status === 'blocked') {
      throw unprocessable('device_blocked', 'That camera is blocked. Write to us and we will look into it.');
    }

    const fRes = await c.query('SELECT * FROM firmware WHERE build = $1', [Number(targetBuild)]);
    const fw = fRes.rows[0];
    if (!fw) throw notFound('We do not have that firmware image.');

    // Refused when the target image belongs to another product.
    if (String(fw.product_id) !== String(device.product_id)) {
      throw unprocessable('firmware_wrong_product', 'That image is for a different camera.', { resource: s });
    }

    // A non-general channel is never offered to a device that has not opted in.
    if (fw.channel !== 'general') {
      throw unprocessable('firmware_channel', 'That image is not offered for this camera.', { resource: s });
    }

    // Refused when min_firmware is above the version the device reports.
    const current = reportedVersion ? String(reportedVersion) : device.firmware_version;
    if (fw.min_firmware) {
      if (!current) {
        throw unprocessable('firmware_min_unknown', `This camera must be running at least ${fw.min_firmware} before it can take this image.`, { resource: s });
      }
      if (compareVersions(current, fw.min_firmware) < 0) {
        throw unprocessable('firmware_min_not_met', `This camera is running ${current}. It must be running at least ${fw.min_firmware} before it can take this image.`, { resource: s });
      }
    }

    if (current && device.firmware_version !== current) {
      await c.query('UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1', [device.id, current]);
    }

    let ses;
    try {
      ses = await c.query(
        `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
        [device.id, fw.id]
      );
    } catch (err) {
      if (err && err.code === '23505') {
        throw conflict('flash_session_in_progress', 'A write to that camera is already running.', { resource: s });
      }
      throw err;
    }

    return {
      session: ses.rows[0],
      device: { ...device, firmware_version: current ?? device.firmware_version },
      firmware: fw,
    };
  });
}

// Completing a session records the version read back from the device, never the one requested.
export async function completeFlashSession(id, reportedVersion) {
  const reported = String(reportedVersion ?? '').trim();
  if (!/^\d+(\.\d+){0,3}$/.test(reported)) {
    throw badRequest('reported_version_invalid', 'The camera did not report a version we understand.');
  }
  return tx(async (c) => {
    const sRes = await c.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [Number(id)]);
    const ses = sRes.rows[0];
    if (!ses) throw notFound('That session does not exist.');
    if (ses.state !== 'started') {
      throw unprocessable('session_not_started', 'That session has already ended.', { resource: String(id) });
    }
    await c.query(
      `UPDATE flash_session SET state='succeeded', reported_version=$2, ended_at=now() WHERE id=$1`,
      [ses.id, reported]
    );
    await c.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`,
      [ses.device_id, reported]
    );
    const out = await c.query(
      `SELECT fs.*, d.serial, d.firmware_version FROM flash_session fs JOIN device d ON d.id = fs.device_id WHERE fs.id = $1`,
      [ses.id]
    );
    return out.rows[0];
  });
}

// A failed session leaves the device's version as it was.
export async function failFlashSession(id, reason) {
  return tx(async (c) => {
    const sRes = await c.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [Number(id)]);
    const ses = sRes.rows[0];
    if (!ses) throw notFound('That session does not exist.');
    if (ses.state !== 'started') {
      throw unprocessable('session_not_started', 'That session has already ended.', { resource: String(id) });
    }
    await c.query(
      `UPDATE flash_session SET state='failed', failure_reason=$2, ended_at=now() WHERE id=$1`,
      [ses.id, String(reason ?? 'unknown').slice(0, 200)]
    );
    const out = await c.query(
      `SELECT fs.*, d.serial, d.firmware_version FROM flash_session fs JOIN device d ON d.id = fs.device_id WHERE fs.id = $1`,
      [ses.id]
    );
    return out.rows[0];
  });
}

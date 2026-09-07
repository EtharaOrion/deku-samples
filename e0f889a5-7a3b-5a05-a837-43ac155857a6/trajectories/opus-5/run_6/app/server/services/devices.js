import { many, one, query } from '../db.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors.js';
import { PG_UNIQUE_VIOLATION } from '../db.js';

const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SERIAL_RE = new RegExp(`^(VA|VC)\\d{2}\\d{2}[${SERIAL_ALPHABET}]{6}$`);

export function normaliseSerial(input) {
  return String(input || '').replace(/[\s-]/g, '').toUpperCase();
}

export function serialHasShape(input) {
  const s = normaliseSerial(input);
  return s.length === 12 && SERIAL_RE.test(s);
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function newestGeneralFirmware(productId) {
  return one(
    `SELECT id, version, build, min_firmware, min_app_version, channel FROM firmware
      WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId],
  );
}

export async function serialiseDevice(row) {
  const newest = await newestGeneralFirmware(row.product_id);
  const updateAvailable = Boolean(
    newest && row.firmware_version && compareVersions(newest.version, row.firmware_version) > 0,
  );
  const warrantyActive = row.warranty_until ? new Date(`${row.warranty_until}T23:59:59Z`) >= new Date() : false;
  return {
    id: String(row.id),
    serial: row.serial,
    model: row.product_title,
    handle: row.handle,
    variant: row.option_value,
    sku: row.sku,
    status: row.status,
    blocked_reason: row.blocked_reason,
    nickname: row.nickname,
    firmware_version: row.firmware_version,
    firmware_reported_at:
      row.firmware_reported_at instanceof Date ? row.firmware_reported_at.toISOString() : row.firmware_reported_at,
    latest_firmware_version: newest ? newest.version : null,
    latest_firmware_build: newest ? newest.build : null,
    update_available: updateAvailable,
    firmware_state: !row.firmware_version ? 'never_connected' : updateAvailable ? 'update_available' : 'current',
    warranty_until: row.warranty_until,
    warranty_state: !row.warranty_until ? 'unknown' : warrantyActive ? 'active' : 'expired',
    order_id: row.order_id ? String(row.order_id) : null,
  };
}

const DEVICE_COLUMNS = `d.id, d.serial, d.product_id, d.variant_id, d.status, d.blocked_reason, d.firmware_version,
  d.firmware_reported_at, d.nickname, d.order_id, d.warranty_until,
  p.title AS product_title, p.handle, v.option_value, v.sku`;

export async function deviceBySerial(serial) {
  return one(
    `SELECT ${DEVICE_COLUMNS} FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
      WHERE upper(d.serial) = upper($1)`,
    [normaliseSerial(serial)],
  );
}

export async function liveOwner(deviceId) {
  return one(
    `SELECT id, customer_id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`,
    [deviceId],
  );
}

export async function listCustomerDevices({ customerId, pageSize, cursor }) {
  const params = [customerId, pageSize + 1];
  let where = 'o.customer_id = $1 AND o.released_at IS NULL';
  if (cursor) {
    params.push(cursor.claimed_at, cursor.id);
    where += ` AND (o.claimed_at, o.id) < ($3::timestamptz, $4::bigint)`;
  }
  const rows = await many(
    `SELECT ${DEVICE_COLUMNS}, o.id AS ownership_id, o.claimed_at
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE ${where}
      ORDER BY o.claimed_at DESC, o.id DESC LIMIT $2`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const data = [];
  for (const r of page) data.push(await serialiseDevice(r));
  const last = page[page.length - 1];
  return {
    data,
    hasMore,
    lastKey: last
      ? { claimed_at: last.claimed_at instanceof Date ? last.claimed_at.toISOString() : last.claimed_at, id: String(last.ownership_id) }
      : null,
  };
}

export async function customerDevice(customerId, serial) {
  const device = await deviceBySerial(serial);
  if (!device) throw notFound('We do not recognise that serial number.');
  const owner = await liveOwner(device.id);
  // Another customer's camera reads as not found, never as forbidden.
  if (!owner || String(owner.customer_id) !== String(customerId)) throw notFound('That camera is not on your account.');
  return device;
}

export async function registerDevice({ customerId, serial }) {
  if (!serialHasShape(serial)) {
    throw badRequest('invalid_serial', 'We do not recognise that serial number.');
  }
  const device = await deviceBySerial(serial);
  if (!device) throw badRequest('unknown_serial', 'We do not recognise that serial number.');
  if (device.status === 'blocked') {
    throw unprocessable('device_blocked', 'That camera is blocked and cannot be registered.');
  }

  const owner = await liveOwner(device.id);
  if (owner) {
    if (String(owner.customer_id) === String(customerId)) {
      return { device: await deviceBySerial(serial), alreadyMine: true };
    }
    throw conflict('device_owned', 'That camera is registered to someone else.', { serial: device.serial });
  }

  try {
    await query(
      `INSERT INTO device_ownership (device_id, customer_id, order_id, method) VALUES ($1, $2, $3, 'manual')`,
      [device.id, customerId, device.order_id],
    );
  } catch (err) {
    // The unique index over live ownership decides the winner, not this code.
    if (err.code === PG_UNIQUE_VIOLATION) {
      throw conflict('device_owned', 'That camera is registered to someone else.', { serial: device.serial });
    }
    throw err;
  }
  await query(`UPDATE device SET status = 'registered' WHERE id = $1`, [device.id]);
  return { device: await deviceBySerial(serial), alreadyMine: false };
}

export async function renameDevice({ customerId, serial, nickname }) {
  const device = await customerDevice(customerId, serial);
  const clean = nickname === null || nickname === undefined ? null : String(nickname).trim().slice(0, 60);
  await query('UPDATE device SET nickname = $2 WHERE id = $1', [device.id, clean || null]);
  return deviceBySerial(serial);
}

export async function releaseDevice({ customerId, serial }) {
  const device = await customerDevice(customerId, serial);
  await query(
    `UPDATE device_ownership SET released_at = now() WHERE device_id = $1 AND released_at IS NULL AND customer_id = $2`,
    [device.id, customerId],
  );
  await query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1`, [device.id]);
  return deviceBySerial(serial);
}

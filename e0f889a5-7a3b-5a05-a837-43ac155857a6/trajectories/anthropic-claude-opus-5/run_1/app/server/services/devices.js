import { many, one, query, tx } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { randomInt } from 'node:crypto';

// Twelve characters: two letters of model code, two digits of year, two digits
// of production week, then six characters from an alphabet that omits I, O, 0
// and 1 because those are misread off an engraved underside.
export const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SERIAL_PATTERN = /^(VA|VC)\d{2}\d{2}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export function normaliseSerial(input) {
  return String(input || '').replace(/[\s-]/g, '').toUpperCase();
}

export function serialShapeValid(serial) {
  return SERIAL_PATTERN.test(normaliseSerial(serial));
}

export function generateSerial(prefix = 'VC') {
  const now = new Date();
  const year = String(now.getUTCFullYear() % 100).padStart(2, '0');
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const week = String(Math.min(52, Math.floor((now.getTime() - start) / (7 * 86400000)) + 1)).padStart(2, '0');
  let tail = '';
  for (let i = 0; i < 6; i++) tail += SERIAL_ALPHABET[randomInt(SERIAL_ALPHABET.length)];
  return `${prefix}${year}${week}${tail}`;
}

// Firmware versions are dotted numbers: 6.11 is above 6.9.
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => Number(n) || 0);
  const pb = String(b ?? '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

async function deviceRow(serial) {
  return one(
    `SELECT d.*, p.handle, p.title AS model, p.id AS model_product_id,
            v.sku, v.option_value,
            o.customer_id AS live_owner_id, o.id AS ownership_id
     FROM device d
     JOIN product p ON p.id = d.product_id
     LEFT JOIN variant v ON v.id = d.variant_id
     LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
     WHERE upper(d.serial) = upper($1)`,
    [normaliseSerial(serial)],
  );
}

export async function shapeDevice(row) {
  if (!row) return null;
  const latest = await one(
    `SELECT version, build FROM firmware
     WHERE product_id = $1 AND channel = 'general'
     ORDER BY build DESC LIMIT 1`,
    [row.product_id],
  );
  const current = row.firmware_version;
  const update_available = Boolean(latest && current && compareVersions(current, latest.version) < 0);
  const warranty = row.warranty_until ? String(row.warranty_until).slice(0, 10) : null;
  const warrantyActive = warranty ? new Date(`${warranty}T23:59:59Z`) >= new Date() : false;
  return {
    serial: row.serial,
    model: row.model,
    handle: row.handle,
    sku: row.sku,
    option_value: row.option_value,
    status: row.status,
    nickname: row.nickname,
    firmware_version: current,
    firmware_reported_at: row.firmware_reported_at instanceof Date ? row.firmware_reported_at.toISOString() : row.firmware_reported_at,
    latest_firmware_version: latest ? latest.version : null,
    update_available,
    firmware_state: !current ? 'not_connected' : update_available ? 'update_available' : 'current',
    warranty_until: warranty,
    warranty_state: !warranty ? 'unknown' : warrantyActive ? 'active' : 'expired',
    blocked_reason: row.blocked_reason,
  };
}

export async function listCustomerDevices(customerId, { pageSize = 20, cursor = null } = {}) {
  const params = [customerId, pageSize + 1];
  let where = 'WHERE o.customer_id = $1 AND o.released_at IS NULL';
  if (cursor) {
    params.push(cursor.id);
    where += ' AND d.id > $3::bigint';
  }
  const rows = await many(
    `SELECT d.*, p.handle, p.title AS model, v.sku, v.option_value
     FROM device_ownership o
     JOIN device d ON d.id = o.device_id
     JOIN product p ON p.id = d.product_id
     LEFT JOIN variant v ON v.id = d.variant_id
     ${where}
     ORDER BY d.id LIMIT $2`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const shaped = [];
  for (const r of data) shaped.push(await shapeDevice(r));
  const last = data[data.length - 1];
  return {
    data: shaped,
    next_cursor: hasMore && last ? { id: Number(last.id) } : null,
    has_more: hasMore,
  };
}

export async function readCustomerDevice(customerId, serial) {
  const row = await deviceRow(serial);
  // Another customer's serial reads as not found, never as forbidden.
  if (!row || Number(row.live_owner_id) !== Number(customerId)) {
    throw notFound('We do not recognise that serial number.', 'device_not_found');
  }
  return shapeDevice(row);
}

// A serial registers only when the device exists with no live owner.
export async function registerDevice(customerId, serialInput) {
  const serial = normaliseSerial(serialInput);
  // A serial that does not match the shape is refused before any lookup happens.
  if (!serialShapeValid(serial)) {
    throw badRequest('serial_malformed', 'We do not recognise that serial number.');
  }
  const row = await deviceRow(serial);
  if (!row) throw notFound('We do not recognise that serial number.', 'device_unknown');
  if (row.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked and cannot be registered.', { serial: row.serial });
  }
  if (row.live_owner_id && Number(row.live_owner_id) === Number(customerId)) {
    return shapeDevice(row);
  }
  if (row.live_owner_id) {
    // Never the other person's identity.
    throw conflict('device_owned', 'That camera is registered to someone else.', { serial: row.serial });
  }

  try {
    await tx(async (c) => {
      // The partial unique index is the single-winner rule; two simultaneous
      // registrations cannot both succeed.
      const ins = await c.query(
        `INSERT INTO device_ownership (device_id, customer_id, method)
         VALUES ($1,$2,'manual')
         ON CONFLICT (device_id) WHERE released_at IS NULL DO NOTHING
         RETURNING id`,
        [row.id, customerId],
      );
      if (!ins.rows.length) {
        throw conflict('device_owned', 'That camera is registered to someone else.', { serial: row.serial });
      }
      await c.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [row.id]);
    });
  } catch (err) {
    if (err && err.code === '23505') {
      throw conflict('device_owned', 'That camera is registered to someone else.', { serial: row.serial });
    }
    throw err;
  }

  return shapeDevice(await deviceRow(serial));
}

export async function renameDevice(customerId, serial, nickname) {
  const row = await deviceRow(serial);
  if (!row || Number(row.live_owner_id) !== Number(customerId)) {
    throw notFound('We do not recognise that serial number.', 'device_not_found');
  }
  const value = String(nickname ?? '').trim().slice(0, 60);
  await query('UPDATE device SET nickname = $2 WHERE id = $1', [row.id, value || null]);
  return shapeDevice(await deviceRow(serial));
}

// Releasing ends the link and grants it to nobody.
export async function releaseDevice(customerId, serial) {
  const row = await deviceRow(serial);
  if (!row || Number(row.live_owner_id) !== Number(customerId)) {
    throw notFound('We do not recognise that serial number.', 'device_not_found');
  }
  await tx(async (c) => {
    await c.query(
      'UPDATE device_ownership SET released_at = now() WHERE device_id = $1 AND released_at IS NULL AND customer_id = $2',
      [row.id, customerId],
    );
    await c.query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1`, [row.id]);
  });
  return shapeDevice(await deviceRow(serial));
}

export async function publicDeviceForFlash(serialInput) {
  const serial = normaliseSerial(serialInput);
  if (!serialShapeValid(serial)) throw badRequest('serial_malformed', 'We do not recognise that serial number.');
  const row = await deviceRow(serial);
  if (!row) throw notFound('We do not recognise that serial number.', 'device_unknown');
  return row;
}

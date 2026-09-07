import { query, withTransaction } from './db.mjs';
import { badRequest, conflict, notFound } from './errors.mjs';
import { isValidSerial, normaliseSerial } from './serial.mjs';

/** Compare dotted version strings numerically: 6.11 is above 6.2. */
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => Number(n) || 0);
  const pb = String(b ?? '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

const DEVICE_SELECT = `
  SELECT d.id, d.serial, d.status, d.blocked_reason, d.firmware_version, d.firmware_reported_at,
         d.nickname, d.order_id, d.warranty_until, d.product_id, d.variant_id,
         p.title AS model, p.handle, v.option_value,
         o.customer_id AS owner_id, o.id AS ownership_id, o.claimed_at
    FROM device d
    JOIN product p ON p.id = d.product_id
    LEFT JOIN variant v ON v.id = d.variant_id
    LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL`;

/** Whether a device has newer firmware available is derived, never stored. */
async function newestGeneralFirmware(productId) {
  const { rows } = await query(
    `SELECT version, build, min_firmware, min_app_version, size_bytes, sha256
       FROM firmware WHERE product_id = $1 AND channel = 'general'
      ORDER BY build DESC LIMIT 1`, [productId]);
  return rows[0] || null;
}

export async function decorateDevice(row) {
  const newest = await newestGeneralFirmware(row.product_id);
  const update_available = Boolean(
    newest && row.firmware_version && compareVersions(newest.version, row.firmware_version) > 0);
  const warrantyActive = row.warranty_until ? row.warranty_until >= new Date().toISOString().slice(0, 10) : false;
  return {
    id: row.id,
    serial: row.serial,
    model: row.model,
    handle: row.handle,
    option_value: row.option_value,
    status: row.status,
    nickname: row.nickname,
    firmware_version: row.firmware_version,
    firmware_reported_at: row.firmware_reported_at,
    warranty_until: row.warranty_until,
    warranty_active: warrantyActive,
    update_available,
    latest_firmware: newest ? newest.version : null,
    // "Not yet connected" is a state of its own, distinct from being behind.
    firmware_state: !row.firmware_version ? 'unknown' : update_available ? 'behind' : 'current',
    owner_id: row.owner_id ?? null,
  };
}

export async function listDevicesForCustomer(customerId, { afterId = null, limit = 21 }) {
  const params = [customerId];
  let where = `o.customer_id = $1 AND o.released_at IS NULL`;
  if (afterId !== null) {
    params.push(afterId);
    where += ` AND d.id > $${params.length}`;
  }
  params.push(limit);
  const { rows } = await query(
    `${DEVICE_SELECT} WHERE ${where} ORDER BY d.id ASC LIMIT $${params.length}`, params);
  return Promise.all(rows.map(decorateDevice));
}

async function findDeviceRow(serial) {
  const { rows } = await query(`${DEVICE_SELECT} WHERE upper(d.serial) = upper($1)`, [serial]);
  return rows[0] || null;
}

/** A device this customer owns, or nothing. Never another customer's. */
export async function getOwnedDevice(serial, customerId) {
  const s = normaliseSerial(serial);
  if (!isValidSerial(s)) return null;
  const row = await findDeviceRow(s);
  if (!row) return null;
  if (String(row.owner_id ?? '') !== String(customerId)) return null;
  return decorateDevice(row);
}

/**
 * Register a serial to this customer.
 *
 * The shape is checked before any lookup happens. The live-owner rule is a
 * unique index in the store, so two simultaneous registrations of one serial
 * cannot both succeed: one wins and the other is refused with a 409.
 */
export async function registerDevice(serial, customerId) {
  const s = normaliseSerial(serial);
  if (!isValidSerial(s)) {
    throw badRequest('serial_invalid', 'We do not recognise that serial number.');
  }
  const row = await findDeviceRow(s);
  if (!row) {
    throw notFound('We do not recognise that serial number.', 'serial_unknown');
  }
  if (row.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked and cannot be registered.', { serial: s });
  }
  if (row.owner_id !== null) {
    if (String(row.owner_id) === String(customerId)) {
      throw conflict('already_registered', 'That camera is already on your account.', { serial: s });
    }
    // Never the other person's identity.
    throw conflict('owned_by_other', 'That camera is registered to someone else.', { serial: s });
  }

  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
         VALUES ($1,$2,$3,'manual')`,
        [row.id, customerId, row.order_id]);
      await client.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [row.id]);
    });
  } catch (err) {
    if (err && err.code === '23505') {
      throw conflict('owned_by_other', 'That camera is registered to someone else.', { serial: s });
    }
    throw err;
  }

  const fresh = await findDeviceRow(s);
  return decorateDevice(fresh);
}

export async function renameDevice(serial, customerId, nickname) {
  const owned = await getOwnedDevice(serial, customerId);
  if (!owned) throw notFound('We do not recognise that serial number.', 'device_not_found');
  const value = String(nickname ?? '').trim().slice(0, 80);
  await query(`UPDATE device SET nickname = $2 WHERE id = $1`, [owned.id, value || null]);
  const fresh = await findDeviceRow(serial);
  return decorateDevice(fresh);
}

/** Releasing ends the link and grants it to nobody. */
export async function releaseDevice(serial, customerId) {
  const owned = await getOwnedDevice(serial, customerId);
  if (!owned) throw notFound('We do not recognise that serial number.', 'device_not_found');
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE device_ownership SET released_at = now()
        WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL`,
      [owned.id, customerId]);
    await client.query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1`, [owned.id]);
  });
  const fresh = await findDeviceRow(serial);
  return decorateDevice(fresh);
}

/** The installer identifies a camera without owning it: repair is not gated. */
export async function lookupDeviceForFlash(serial) {
  const s = normaliseSerial(serial);
  if (!isValidSerial(s)) throw badRequest('serial_invalid', 'We do not recognise that serial number.');
  const row = await findDeviceRow(s);
  if (!row) throw notFound('We do not recognise that serial number.', 'serial_unknown');
  return { row, view: await decorateDevice(row) };
}

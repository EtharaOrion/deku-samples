import { one, many, tx, isUniqueViolation } from './db.js';
import { badRequest, conflict, notFound, unprocessable } from './errors.js';
import { isoDate } from './catalogue.js';

// Twelve characters: two letters of model code, two of year, two of week, then six
// from an alphabet that omits I, O, 0 and 1 because those are misread off an
// engraved underside.
const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SERIAL_RE = new RegExp(`^(VA|VC)\\d{2}\\d{2}[${SERIAL_ALPHABET}]{6}$`);

export const MODEL_CODES = { VA: 'flagship', VC: 'compact' };

export function normaliseSerial(raw) {
  return String(raw ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/** A serial that does not match the shape is refused before any lookup happens. */
export function assertSerialShape(raw) {
  const serial = normaliseSerial(raw);
  if (!SERIAL_RE.test(serial)) {
    throw badRequest('invalid_serial', 'We do not recognise that serial number.', { serial });
  }
  return serial;
}

export async function deviceBySerial(serial) {
  return one(
    `SELECT d.*, p.handle, p.title AS model, p.support_until,
            v.sku, v.option_value,
            o.customer_id AS owner_id, o.id AS ownership_id
       FROM device d
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
       LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
      WHERE upper(d.serial) = upper($1)`,
    [serial],
  );
}

/** Newest general firmware for a product, which is what "update available" means. */
export async function latestFirmwareFor(productId) {
  return one(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId],
  );
}

export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => Number(n) || 0);
  const pb = String(b ?? '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function deviceView(d, latestFirmware) {
  const updateAvailable = Boolean(
    d.firmware_version && latestFirmware && compareVersions(d.firmware_version, latestFirmware.version) < 0,
  );
  const warrantyUntil = d.warranty_until ? isoDate(d.warranty_until) : null;
  const warrantyExpired = warrantyUntil ? new Date(`${warrantyUntil}T23:59:59Z`) < new Date() : false;
  return {
    serial: d.serial,
    model: d.model,
    handle: d.handle,
    variant: d.option_value,
    nickname: d.nickname,
    status: d.status,
    firmware_version: d.firmware_version,
    firmware_reported_at: d.firmware_reported_at
      ? new Date(d.firmware_reported_at).toISOString()
      : null,
    latest_firmware: latestFirmware ? latestFirmware.version : null,
    update_available: updateAvailable,
    firmware_state: !d.firmware_version ? 'Not yet connected' : updateAvailable ? 'Update available' : 'Up to date',
    warranty_until: warrantyUntil,
    warranty_state: !warrantyUntil ? 'No warranty on record' : warrantyExpired ? 'Warranty ended' : `Under warranty until ${warrantyUntil}`,
    warranty_expired: warrantyExpired,
  };
}

/**
 * Register a serial to a customer.
 *
 * A device has at most one live owner, held by a partial unique index rather than
 * by an application-level check, so two simultaneous registrations of one serial
 * cannot both succeed.
 */
export async function registerDevice({ serial: rawSerial, customer }) {
  const serial = assertSerialShape(rawSerial);
  const device = await deviceBySerial(serial);
  if (!device) throw notFound('We do not recognise that serial number.', 'unknown_serial');
  if (device.status === 'blocked') {
    throw unprocessable('device_blocked', 'That camera is blocked. Get in touch before using it.');
  }
  if (device.owner_id && String(device.owner_id) === String(customer.id)) {
    throw conflict('already_registered', 'That camera is already on your account.', { serial });
  }
  if (device.owner_id) {
    // Never the other person's identity.
    throw conflict('owned_by_other', 'That camera is registered to someone else.', { serial });
  }

  try {
    await tx(async (db) => {
      const { rowCount } = await db.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`,
        [device.id, customer.id],
      );
      if (!rowCount) throw conflict('owned_by_other', 'That camera is registered to someone else.', { serial });
      await db.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [device.id]);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // The store refused the second live owner. This request is the loser.
      throw conflict('owned_by_other', 'That camera is registered to someone else.', { serial });
    }
    throw err;
  }

  const fresh = await deviceBySerial(serial);
  const latest = await latestFirmwareFor(fresh.product_id);
  return deviceView(fresh, latest);
}

/** Never read, rename or release another customer's camera. Reads as not found. */
export async function ownedDevice({ serial: rawSerial, customer }) {
  const serial = assertSerialShape(rawSerial);
  const device = await deviceBySerial(serial);
  if (!device || !device.owner_id || String(device.owner_id) !== String(customer.id)) {
    throw notFound('We do not recognise that serial number.', 'unknown_serial');
  }
  return device;
}

export async function renameDevice({ serial, customer, nickname }) {
  const device = await ownedDevice({ serial, customer });
  const clean = nickname === null || nickname === undefined ? null : String(nickname).trim().slice(0, 60);
  await one(`UPDATE device SET nickname = $2 WHERE id = $1 RETURNING id`, [device.id, clean || null]);
  const fresh = await deviceBySerial(device.serial);
  return deviceView(fresh, await latestFirmwareFor(fresh.product_id));
}

/** Releasing ends the link and grants it to nobody. */
export async function releaseDevice({ serial, customer }) {
  const device = await ownedDevice({ serial, customer });
  await tx(async (db) => {
    await db.query(
      `UPDATE device_ownership SET released_at = now()
        WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL`,
      [device.id, customer.id],
    );
    await db.query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1`, [device.id]);
  });
  const fresh = await deviceBySerial(device.serial);
  return deviceView(fresh, await latestFirmwareFor(fresh.product_id));
}

export async function devicesForCustomer(customerId, { pageSize, cursor }) {
  const params = [customerId, pageSize + 1];
  let where = '';
  if (cursor?.id) {
    params.push(cursor.id);
    where = ` AND d.id < $${params.length}`;
  }
  const rows = await many(
    `SELECT d.*, p.handle, p.title AS model, v.option_value, o.customer_id AS owner_id
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE o.customer_id = $1 AND o.released_at IS NULL${where}
      ORDER BY d.id DESC
      LIMIT $2`,
    params,
  );
  const firmware = await many(
    `SELECT DISTINCT ON (product_id) * FROM firmware
      WHERE channel = 'general' ORDER BY product_id, build DESC`,
  );
  const fwBy = new Map(firmware.map((f) => [String(f.product_id), f]));
  return rows.map((d) => ({ raw: d, view: deviceView(d, fwBy.get(String(d.product_id)) ?? null) }));
}

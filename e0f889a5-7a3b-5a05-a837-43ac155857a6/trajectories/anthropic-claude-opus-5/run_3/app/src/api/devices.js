import { many, one, query, tx, PG_UNIQUE_VIOLATION } from '../lib/db.js';
import { isValidSerial, normaliseSerial, compareVersions } from '../lib/domain.js';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors.js';

/** The newest general firmware for a product, which is what a device is offered. */
export async function latestFirmwareFor(productId, { channel = 'general' } = {}) {
  return one(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = $2 ORDER BY build DESC LIMIT 1`,
    [productId, channel],
  );
}

export async function deviceBySerial(serial) {
  return one(
    `SELECT d.*, p.title AS model, p.handle, v.option_value
       FROM device d
       JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id
      WHERE upper(d.serial) = upper($1)`,
    [serial],
  );
}

export async function liveOwner(deviceId) {
  return one(
    `SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`,
    [deviceId],
  );
}

/** Devices this customer owns right now, newest claim first. */
export async function devicesForCustomer(customerId, { limit, cursor }) {
  const params = [customerId, limit + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.claimed_at, cursor.id);
    where = ` AND (o.claimed_at, o.id) < ($3::timestamptz, $4::uuid)`;
  }
  return many(
    `SELECT d.id, d.serial, d.nickname, d.firmware_version, d.firmware_reported_at,
            d.warranty_until, d.status, d.product_id,
            p.title AS model, p.handle, v.option_value,
            o.id AS ownership_id, o.claimed_at, o.method
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id
      WHERE o.customer_id = $1 AND o.released_at IS NULL${where}
      ORDER BY o.claimed_at DESC, o.id DESC
      LIMIT $2`,
    params,
  );
}

export async function decorateDevice(row) {
  const latest = await latestFirmwareFor(row.product_id);
  const current = row.firmware_version;
  const updateAvailable = Boolean(latest && current && compareVersions(current, latest.version) < 0);
  return {
    serial: row.serial,
    model: row.model,
    handle: row.handle,
    option_value: row.option_value ?? null,
    nickname: row.nickname,
    firmware_version: current,
    firmware_reported_at: row.firmware_reported_at,
    latest_firmware_version: latest?.version ?? null,
    update_available: updateAvailable,
    never_connected: !current,
    warranty_until: row.warranty_until,
    warranty_expired: row.warranty_until
      ? new Date(`${String(row.warranty_until).slice(0, 10)}T00:00:00Z`) < new Date()
      : false,
    status: row.status,
    claimed_at: row.claimed_at ?? null,
  };
}

/**
 * Register a serial to a customer.
 *
 * A serial registers only when the device exists with no live owner. The single
 * live owner is enforced by a partial unique index, so two simultaneous
 * registrations of one serial cannot both succeed: one wins, the other is
 * rejected by the store rather than by a check this code races against.
 */
export async function registerDevice(customerId, rawSerial) {
  const serial = normaliseSerial(rawSerial);
  // A serial that does not match the shape is refused before any lookup happens.
  if (!isValidSerial(serial)) {
    throw unprocessable('invalid_serial', 'We do not recognise that serial number.');
  }

  const device = await deviceBySerial(serial);
  if (!device) {
    throw notFound('We do not recognise that serial number.', 'device_unknown');
  }
  if (device.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked and cannot be registered.', {
      resource: serial,
    });
  }

  try {
    return await tx(async (c) => {
      const { rows: existing } = await c.query(
        `SELECT customer_id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`,
        [device.id],
      );
      if (existing[0]) {
        if (existing[0].customer_id === customerId) {
          // Already this customer's camera: nothing to write.
          return { device, already: true };
        }
        // Never the other person's identity.
        throw conflict('device_owned', 'That camera is registered to someone else.', {
          resource: serial,
        });
      }

      await c.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`,
        [device.id, customerId],
      );
      await c.query(
        `UPDATE device SET status = 'registered' WHERE id = $1 AND status <> 'blocked'`,
        [device.id],
      );
      return { device, already: false };
    });
  } catch (err) {
    if (err?.code === PG_UNIQUE_VIOLATION) {
      // The store refused a second live owner: this request lost the race.
      throw conflict('device_owned', 'That camera is registered to someone else.', {
        resource: serial,
      });
    }
    throw err;
  }
}

/** Reading, renaming, releasing and flashing are all scoped to the live owner. */
export async function ownedDeviceOr404(customerId, rawSerial) {
  const serial = normaliseSerial(rawSerial);
  if (!isValidSerial(serial)) {
    throw notFound('We do not recognise that serial number.', 'device_unknown');
  }
  const row = await one(
    `SELECT d.id, d.serial, d.nickname, d.firmware_version, d.firmware_reported_at,
            d.warranty_until, d.status, d.product_id, d.order_id,
            p.title AS model, p.handle, v.option_value,
            o.id AS ownership_id, o.claimed_at, o.method
       FROM device d
       JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id
       JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
      WHERE upper(d.serial) = upper($1) AND o.customer_id = $2`,
    [serial, customerId],
  );
  // Another customer's serial reads as not found, never forbidden.
  if (!row) throw notFound('We do not recognise that serial number.', 'device_not_found');
  return row;
}

export async function renameDevice(customerId, serial, nickname) {
  const device = await ownedDeviceOr404(customerId, serial);
  const clean = String(nickname ?? '').trim().slice(0, 80);
  await query(`UPDATE device SET nickname = $2 WHERE id = $1`, [device.id, clean || null]);
  return { ...device, nickname: clean || null };
}

/** Releasing ends the link and grants it to nobody. */
export async function releaseDevice(customerId, serial) {
  const device = await ownedDeviceOr404(customerId, serial);
  await tx(async (c) => {
    await c.query(
      `UPDATE device_ownership SET released_at = now()
        WHERE device_id = $1 AND released_at IS NULL AND customer_id = $2`,
      [device.id, customerId],
    );
    await c.query(
      `UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1 AND status = 'registered'`,
      [device.id],
    );
  });
  return { ...device, nickname: null, status: 'sold' };
}

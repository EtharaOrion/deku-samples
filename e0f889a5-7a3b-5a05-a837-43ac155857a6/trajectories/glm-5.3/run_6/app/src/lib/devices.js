import { db, tx } from './db.js';
import { errors } from './errors.js';
import { numericCursor } from './pagination.js';
import { normaliseSerial, serialLooksValid } from './serials.js';
import { compareVersions } from './serials.js';

const REGISTERED_SOMEONE_ELSE = 'That camera is registered to someone else.';
const UNKNOWN_SERIAL = 'We do not recognise that serial number.';

export async function deviceBySerial(serial) {
  const sql = db();
  const [device] = await sql`
    SELECT d.*, p.title AS model, p.handle AS product_handle, v.sku AS variant_sku, v.title AS variant_title,
           (SELECT c.id FROM device_ownership o JOIN customer c ON c.id = o.customer_id
             WHERE o.device_id = d.id AND o.released_at IS NULL LIMIT 1) AS owner_customer_id,
           (SELECT c.email FROM device_ownership o JOIN customer c ON c.id = o.customer_id
             WHERE o.device_id = d.id AND o.released_at IS NULL LIMIT 1) AS owner_email
    FROM device d
    JOIN product p ON p.id = d.product_id
    JOIN variant v ON v.id = d.variant_id
    WHERE upper(d.serial) = ${normaliseSerial(serial)}
    LIMIT 1
  `;
  return device || null;
}

export async function listDevicesForCustomer(customerId, { pageSize, cursor }) {
  const sql = db();
  const cursorId = numericCursor(cursor);
  const rows = await sql`
    SELECT d.id, d.serial, d.status, d.firmware_version, d.firmware_reported_at, d.nickname,
           d.warranty_until, p.title AS model, p.handle AS product_handle, v.sku AS variant_sku,
           o.claimed_at,
           (SELECT max(f.build) FROM firmware f WHERE f.product_id = d.product_id AND f.channel = 'general') AS latest_build,
           (SELECT f.version FROM firmware f WHERE f.product_id = d.product_id AND f.channel = 'general'
              ORDER BY f.build DESC LIMIT 1) AS latest_firmware
    FROM device_ownership o
    JOIN device d ON d.id = o.device_id
    JOIN product p ON p.id = d.product_id
    JOIN variant v ON v.id = d.variant_id
    WHERE o.customer_id = ${customerId} AND o.released_at IS NULL
      AND (${cursorId}::bigint IS NULL OR d.id < ${cursorId})
    ORDER BY d.id DESC
    LIMIT ${pageSize + 1}
  `;
  const hasMore = rows.length > pageSize;
  const data = rows.slice(0, pageSize);
  return {
    data: data.map((d) => ({
      serial: d.serial,
      model: d.model,
      product_handle: d.productHandle,
      variant_sku: d.variantSku,
      nickname: d.nickname,
      firmware_version: d.firmwareVersion,
      firmware_reported_at: d.firmwareReportedAt,
      warranty_until: d.warrantyUntil,
      update_available: updateAvailable(d.firmwareVersion, d.latestFirmware),
      latest_firmware: d.latestFirmware,
      never_connected: d.firmwareVersion === null,
      claimed_at: d.claimedAt
    })),
    hasMore,
    nextCursor: hasMore ? String(data[data.length - 1].id) : null
  };
}

export function updateAvailable(current, latest) {
  if (!latest) return false;
  if (!current) return true;
  return compareVersions(current, latest) < 0;
}

export async function registerDevice(customerId, serialInput) {
  const serial = normaliseSerial(serialInput);
  if (!serialLooksValid(serial)) {
    throw errors.badRequest('A serial is twelve characters, for example VC2609PVDA7Q.', 'invalid_serial');
  }
  const device = await deviceBySerial(serial);
  if (!device) throw errors.notFound(UNKNOWN_SERIAL, 'unknown_serial');
  if (device.status === 'blocked') {
    throw errors.conflict('That camera is blocked. Contact support.', 'device_blocked');
  }
  if (device.ownerCustomerId && device.ownerCustomerId !== customerId) {
    throw errors.conflict(REGISTERED_SOMEONE_ELSE, 'already_owned');
  }
  if (device.ownerCustomerId === customerId) {
    throw errors.conflict('That camera is already on your account.', 'already_yours');
  }
  try {
    return await tx(async (client) => {
      const [row] = await client`
        INSERT INTO device_ownership (device_id, customer_id, method)
        VALUES (${device.id}, ${customerId}, 'manual')
        RETURNING *
      `;
      await client`UPDATE device SET status = 'registered' WHERE id = ${device.id}`;
      return row;
    });
  } catch (err) {
    if (String(err.code) === '23505' || /device_ownership_live/.test(String(err.message))) {
      throw errors.conflict(REGISTERED_SOMEONE_ELSE, 'already_owned');
    }
    throw err;
  }
}

export async function releaseDevice(customerId, serialInput, { method = 'manual' } = {}) {
  const serial = normaliseSerial(serialInput);
  const device = await deviceBySerial(serial);
  if (!device || device.ownerCustomerId !== customerId) {
    throw errors.notFound('That camera is not on your account.', 'device_not_found');
  }
  await tx(async (client) => {
    await client`
      UPDATE device_ownership SET released_at = now()
      WHERE device_id = ${device.id} AND customer_id = ${customerId} AND released_at IS NULL
    `;
    await client`
      UPDATE device SET status = CASE WHEN order_id IS NOT NULL THEN 'sold' ELSE 'manufactured' END
      WHERE id = ${device.id}
    `;
  });
  return device;
}

export async function renameDevice(customerId, serialInput, nickname) {
  const serial = normaliseSerial(serialInput);
  const device = await deviceBySerial(serial);
  if (!device || device.ownerCustomerId !== customerId) {
    throw errors.notFound('That camera is not on your account.', 'device_not_found');
  }
  const name = nickname === null ? null : String(nickname).trim().slice(0, 60);
  if (name === '') throw errors.badRequest('Nickname is required.', 'nickname_required');
  const sql = db();
  await sql`UPDATE device SET nickname = ${name} WHERE id = ${device.id}`;
  return { ...device, nickname: name };
}

export async function deviceForCustomer(customerId, serialInput) {
  const serial = normaliseSerial(serialInput);
  const device = await deviceBySerial(serial);
  if (!device || device.ownerCustomerId !== customerId) return null;
  return device;
}

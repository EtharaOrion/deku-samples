import { q, one, tx, isUniqueViolation } from './db.js';

export const SERIAL_RE = /^(VA|VC)\d{2}(0[1-9]|[1-4]\d|5[0-3])[2-9A-HJ-NP-Z]{6}$/;

export class DeviceError extends Error {
  constructor(public code: string, message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/** A serial is exactly twelve characters with the shape the brief describes. */
export function serialLooksValid(serial: string): boolean {
  return SERIAL_RE.test(serial.toUpperCase());
}

export function fold(serial: string): string {
  return serial.trim().toUpperCase();
}

/** Group a serial as it is typed and stored unformatted: display only. */
export function groupSerial(serial: string): string {
  const s = fold(serial);
  return [s.slice(0, 2), s.slice(2, 4), s.slice(4, 6), s.slice(6, 12)].filter(Boolean).join(' ');
}

export type DeviceView = {
  serial: string;
  model: string;
  product_handle: string;
  variant_title: string;
  status: string;
  blocked_reason: string | null;
  firmware_version: string | null;
  firmware_reported_at: string | null;
  update_available: boolean;
  latest_firmware: string | null;
  nickname: string | null;
  warranty_until: string | null;
  owned: boolean;
};

export function toDeviceView(d: any): DeviceView {
  return {
    serial: d.serial,
    model: d.product_title,
    product_handle: d.product_handle,
    variant_title: d.variant_title,
    status: d.status,
    blocked_reason: d.blocked_reason ?? null,
    firmware_version: d.firmware_version ?? null,
    firmware_reported_at: d.firmware_reported_at ?? null,
    update_available: !!d.update_available,
    latest_firmware: d.latest_firmware ?? null,
    nickname: d.nickname ?? null,
    warranty_until: d.warranty_until ? String(d.warranty_until).slice(0, 10) : null,
    owned: !!d.owner_customer_id,
  };
}

const DEVICE_SELECT = `
  SELECT d.*, p.title AS product_title, p.handle AS product_handle, v.title AS variant_title,
         (SELECT f2.version FROM firmware f2 WHERE f2.product_id = d.product_id
            AND f2.channel = 'general' ORDER BY f2.build DESC LIMIT 1) AS latest_firmware,
         (d.firmware_version IS NULL OR EXISTS (
            SELECT 1 FROM firmware f3 WHERE f3.product_id = d.product_id AND f3.channel = 'general'
              AND f3.build > COALESCE((SELECT b.build FROM firmware b
                    WHERE b.product_id = d.product_id AND b.version = d.firmware_version), 0))) AS update_available,
         o.customer_id AS owner_customer_id
    FROM device d
    JOIN product p ON p.id = d.product_id
    JOIN variant v ON v.id = d.variant_id
    LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
`;

export async function deviceBySerial(serial: string): Promise<any | null> {
  return one<any>(`${DEVICE_SELECT} WHERE d.serial_folded = $1`, [fold(serial)]);
}

export async function devicesForCustomer(customerId: number): Promise<any[]> {
  return q<any>(`${DEVICE_SELECT} WHERE o.customer_id = $1 ORDER BY o.claimed_at DESC, d.id ASC`, [customerId]);
}

/**
 * Register a serial. The device must exist with no live owner. The single live
 * owner rule is enforced by a partial unique index, so two simultaneous
 * registrations of one serial cannot both succeed.
 */
export async function registerDevice(customerId: number, rawSerial: string): Promise<any> {
  const serial = fold(rawSerial);
  if (!serialLooksValid(serial)) {
    throw new DeviceError('invalid_serial', 'That serial number does not look right. Check the underside of the camera.', 400);
  }
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError('unknown_serial', 'We do not recognise that serial number.', 404);
  if (device.status === 'blocked') {
    throw new DeviceError('blocked', 'That camera is blocked. Contact support.', 409, { blocked_reason: device.blocked_reason });
  }
  if (device.owner_customer_id && device.owner_customer_id !== customerId) {
    throw new DeviceError('owned_by_other', 'That camera is registered to someone else.', 409);
  }
  if (device.owner_customer_id === customerId) {
    return device; // already this customer's
  }

  try {
    await tx(async (client) => {
      await client.query(
        `UPDATE device SET status='registered' WHERE id=$1`, [device.id]);
      const res = await client.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`,
        [device.id, customerId]);
      return res;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DeviceError('owned_by_other', 'That camera is registered to someone else.', 409);
    }
    throw err;
  }
  return deviceBySerial(serial);
}

/** Releasing ends the link and grants it to nobody. */
export async function releaseDevice(customerId: number, rawSerial: string, method: 'manual' | 'support' = 'manual'): Promise<any> {
  const serial = fold(rawSerial);
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError('unknown_serial', 'We do not recognise that serial number.', 404);
  if (!device.owner_customer_id || device.owner_customer_id !== customerId) {
    // Another customer's serial reads as not found, never forbidden.
    throw new DeviceError('unknown_serial', 'We do not recognise that serial number.', 404);
  }
  await q(
    `UPDATE device_ownership SET released_at = now() WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL`,
    [device.id, customerId]);
  await q(`UPDATE device SET status='sold' WHERE id = $1 AND status='registered'`, [device.id]);
  return deviceBySerial(serial);
}

export async function renameDevice(customerId: number, rawSerial: string, nickname: string): Promise<any> {
  const serial = fold(rawSerial);
  const device = await deviceBySerial(serial);
  if (!device || !device.owner_customer_id || device.owner_customer_id !== customerId) {
    throw new DeviceError('unknown_serial', 'We do not recognise that serial number.', 404);
  }
  await q(`UPDATE device SET nickname = $1 WHERE id = $2`, [nickname.slice(0, 60), device.id]);
  return deviceBySerial(serial);
}

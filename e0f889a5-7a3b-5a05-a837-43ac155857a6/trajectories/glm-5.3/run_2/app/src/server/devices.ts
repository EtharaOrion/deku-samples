import { q, pool } from './db/pool.ts';
import { serialShapeOk, modelCodeOf } from './data/devices.ts';

export class DeviceError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

export type DeviceView = {
  serial: string;
  model: string;
  product_handle: string;
  variant_title: string;
  option_value: string;
  status: string;
  firmware_version: string | null;
  firmware_reported_at: string | null;
  latest_firmware_version: string | null;
  update_available: boolean;
  never_connected: boolean;
  nickname: string | null;
  warranty_until: string | null;
  owned: boolean;
  registered: boolean;
};

function compareFirmware(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export async function latestFirmware(productId: string): Promise<{ version: string; build: number } | null> {
  const res = await q(
    `SELECT version, build FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId]
  );
  return res.rows[0] ? { version: res.rows[0].version, build: Number(res.rows[0].build) } : null;
}

export async function deviceBySerial(serial: string) {
  const res = await q(
    `SELECT d.*, p.title AS model, p.handle AS product_handle, v.title AS variant_title, v.option_value
       FROM device d
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE upper(d.serial) = upper($1)`,
    [serial.trim()]
  );
  return res.rows[0] ?? null;
}

export async function deviceView(row: any, opts: { latest?: { version: string; build: number } | null } = {}): Promise<DeviceView> {
  const latest = opts.latest !== undefined ? opts.latest : await latestFirmware(row.product_id);
  const current = row.firmware_version;
  const updateAvailable = Boolean(latest && current && compareFirmware(latest.version, current) > 0);
  const live = await q(`SELECT customer_id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`, [row.id]);
  return {
    serial: row.serial,
    model: row.model,
    product_handle: row.product_handle,
    variant_title: row.variant_title,
    option_value: row.option_value,
    status: row.status,
    firmware_version: current ?? null,
    firmware_reported_at: row.firmware_reported_at ? new Date(row.firmware_reported_at).toISOString() : null,
    latest_firmware_version: latest ? latest.version : null,
    update_available: updateAvailable,
    never_connected: current === null || current === undefined,
    nickname: row.nickname ?? null,
    warranty_until: row.warranty_until ? new Date(row.warranty_until).toISOString().slice(0, 10) : null,
    owned: live.rows.length > 0,
    registered: live.rows.length > 0,
  };
}

export async function devicesForCustomer(customerId: string | number, limit: number, cursor: string | null): Promise<{ rows: any[]; hasMore: boolean; nextCursor: string | null }> {
  // Keyset pagination over serial, ascending.
  const params: any[] = [customerId];
  let where = `o.customer_id = $1 AND o.released_at IS NULL`;
  if (cursor) {
    params.push(cursor);
    where += ` AND d.serial > $${params.length}`;
  }
  params.push(limit + 1);
  const res = await q(
    `SELECT d.*, p.title AS model, p.handle AS product_handle, v.title AS variant_title, v.option_value
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE ${where}
      ORDER BY d.serial ASC
      LIMIT $${params.length}`,
    params
  );
  const hasMore = res.rows.length > limit;
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
  return { rows, hasMore, nextCursor: hasMore && rows.length > 0 ? rows[rows.length - 1].serial : null };
}

export async function registerDevice(customerId: string | number, rawSerial: string, method: 'manual' | 'order' | 'support' = 'manual', orderId?: string | null) {
  const serial = (rawSerial || '').trim().toUpperCase();
  if (!serialShapeOk(serial)) {
    throw new DeviceError('bad_serial_shape', 'That serial number does not look right.', 400);
  }
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError('unknown_serial', 'We do not recognise that serial number.', 404);
  if (device.status === 'blocked') throw new DeviceError('blocked', 'That camera is blocked. Write to us and we will help.', 409);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The partial unique index is the single-winner rule: the second insert loses here.
    const insert = await client.query(
      `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [device.id, customerId, orderId ?? null, method]
    );
    if (insert.rowCount === 0) {
      const live = await client.query(
        `SELECT customer_id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`,
        [device.id]
      );
      const owner = live.rows[0]?.customer_id;
      if (owner && String(owner) !== String(customerId)) {
        await client.query('ROLLBACK');
        throw new DeviceError('owned_by_other', 'That camera is registered to someone else.', 409);
      }
      // Already owned by this customer: treat as a replay.
      await client.query('COMMIT');
      return deviceView(device);
    }
    await client.query(`UPDATE device SET status = 'registered' WHERE id = $1 AND status <> 'blocked'`, [device.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const refreshed = await deviceBySerial(serial);
  return deviceView(refreshed);
}

export async function releaseDevice(customerId: string | number, rawSerial: string) {
  const serial = (rawSerial || '').trim().toUpperCase();
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError('unknown_serial', 'We do not recognise that serial number.', 404);
  const res = await q(
    `UPDATE device_ownership SET released_at = now()
      WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL
      RETURNING id`,
    [device.id, customerId]
  );
  if (res.rowCount === 0) throw new DeviceError('not_owned', 'That camera is not on your account.', 404);
  await q(`UPDATE device SET status = 'sold' WHERE id = $1 AND status = 'registered'`, [device.id]);
  const refreshed = await deviceBySerial(serial);
  return deviceView(refreshed);
}

export async function renameDevice(customerId: string | number, rawSerial: string, nickname: string) {
  const serial = (rawSerial || '').trim().toUpperCase();
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError('unknown_serial', 'We do not recognise that serial number.', 404);
  const res = await q(
    `UPDATE device d SET nickname = $3
      FROM device_ownership o
      WHERE d.id = o.device_id AND o.device_id = $1 AND o.customer_id = $2 AND o.released_at IS NULL`,
    [device.id, customerId, nickname]
  );
  if (res.rowCount === 0) throw new DeviceError('not_owned', 'That camera is not on your account.', 404);
  const refreshed = await deviceBySerial(serial);
  return deviceView(refreshed);
}

export async function deviceOwnedBy(customerId: string | number, rawSerial: string) {
  const serial = (rawSerial || '').trim().toUpperCase();
  const res = await q(
    `SELECT d.*, p.title AS model, p.handle AS product_handle, v.title AS variant_title, v.option_value
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE o.customer_id = $1 AND o.released_at IS NULL AND upper(d.serial) = upper($2)`,
    [customerId, serial]
  );
  return res.rows[0] ?? null;
}

export { compareFirmware };

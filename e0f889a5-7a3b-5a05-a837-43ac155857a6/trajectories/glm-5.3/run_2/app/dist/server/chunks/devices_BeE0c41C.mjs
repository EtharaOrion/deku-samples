import { q, pool } from "./pool_DifDkjYx.mjs";
import { createHash } from "node:crypto";
const SERIAL_RE = /^(VA|VC)\d{2}(0[1-9]|[1-4]\d|5[0-3])[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
function serialShapeOk(serial) {
  return SERIAL_RE.test((serial || "").trim().toUpperCase());
}
function digestFor(kind, key) {
  return createHash("sha256").update(`vela:${kind}:${key}`).digest("hex");
}
const SEED_FIRMWARE = [
  { handle: "compact", version: "7.2", build: 720, channel: "general", min_firmware: "6.11", min_app_version: "1.4.0", size_bytes: 24117248, released_on: "2026-02-10" },
  { handle: "compact", version: "7.0", build: 700, channel: "general", min_firmware: "6.11", min_app_version: "1.4.0", size_bytes: 23842816, released_on: "2025-10-02" },
  { handle: "compact", version: "6.11", build: 611, channel: "general", min_firmware: null, min_app_version: "1.0.0", size_bytes: 22911488, released_on: "2025-04-18" },
  { handle: "flagship", version: "2.4", build: 240, channel: "general", min_firmware: "2.0", min_app_version: "2.0.0", size_bytes: 31457280, released_on: "2025-09-12" }
];
const SEED_DEVICES = [
  { serial: "VC2609PVDA7Q", handle: "compact", variant_sku: "VELA-CRICKET-GRAPHITE", status: "registered", firmware_version: "7.0", firmware_reported_at: "2026-05-14T10:12:00Z", nickname: "The little one", owner_email: "customer@example.com", order_number: "VE-2026-0001", method: "order", warranty_until: "2028-06-01" },
  { serial: "VA2609NRWB2Z", handle: "flagship", variant_sku: "VELA-A1-SAND", status: "registered", firmware_version: "2.4", firmware_reported_at: "2026-05-02T08:30:00Z", nickname: null, owner_email: "customer2@example.com", order_number: null, method: "manual", warranty_until: "2028-06-01" },
  { serial: "VA2609KTMHX4", handle: "flagship", variant_sku: "VELA-A1-GRAPHITE", status: "sold", firmware_version: null, firmware_reported_at: null, nickname: null, owner_email: null, order_number: null, method: null, warranty_until: "2028-06-01" },
  { serial: "VC2609WJ3DKT", handle: "compact", variant_sku: "VELA-CRICKET-YELLOW", status: "blocked", blocked_reason: "reported_stolen", firmware_version: null, firmware_reported_at: null, nickname: null, owner_email: null, order_number: null, method: null, warranty_until: null }
];
class DeviceError extends Error {
  code;
  status;
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
function compareFirmware(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
async function latestFirmware(productId) {
  const res = await q(
    `SELECT version, build FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId]
  );
  return res.rows[0] ? { version: res.rows[0].version, build: Number(res.rows[0].build) } : null;
}
async function deviceBySerial(serial) {
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
async function deviceView(row, opts = {}) {
  const latest = opts.latest !== void 0 ? opts.latest : await latestFirmware(row.product_id);
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
    never_connected: current === null || current === void 0,
    nickname: row.nickname ?? null,
    warranty_until: row.warranty_until ? new Date(row.warranty_until).toISOString().slice(0, 10) : null,
    owned: live.rows.length > 0,
    registered: live.rows.length > 0
  };
}
async function devicesForCustomer(customerId, limit, cursor) {
  const params = [customerId];
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
async function registerDevice(customerId, rawSerial, method = "manual", orderId) {
  const serial = (rawSerial || "").trim().toUpperCase();
  if (!serialShapeOk(serial)) {
    throw new DeviceError("bad_serial_shape", "That serial number does not look right.", 400);
  }
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError("unknown_serial", "We do not recognise that serial number.", 404);
  if (device.status === "blocked") throw new DeviceError("blocked", "That camera is blocked. Write to us and we will help.", 409);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
        await client.query("ROLLBACK");
        throw new DeviceError("owned_by_other", "That camera is registered to someone else.", 409);
      }
      await client.query("COMMIT");
      return deviceView(device);
    }
    await client.query(`UPDATE device SET status = 'registered' WHERE id = $1 AND status <> 'blocked'`, [device.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw err;
  } finally {
    client.release();
  }
  const refreshed = await deviceBySerial(serial);
  return deviceView(refreshed);
}
async function releaseDevice(customerId, rawSerial) {
  const serial = (rawSerial || "").trim().toUpperCase();
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError("unknown_serial", "We do not recognise that serial number.", 404);
  const res = await q(
    `UPDATE device_ownership SET released_at = now()
      WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL
      RETURNING id`,
    [device.id, customerId]
  );
  if (res.rowCount === 0) throw new DeviceError("not_owned", "That camera is not on your account.", 404);
  await q(`UPDATE device SET status = 'sold' WHERE id = $1 AND status = 'registered'`, [device.id]);
  const refreshed = await deviceBySerial(serial);
  return deviceView(refreshed);
}
async function renameDevice(customerId, rawSerial, nickname) {
  const serial = (rawSerial || "").trim().toUpperCase();
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError("unknown_serial", "We do not recognise that serial number.", 404);
  const res = await q(
    `UPDATE device d SET nickname = $3
      FROM device_ownership o
      WHERE d.id = o.device_id AND o.device_id = $1 AND o.customer_id = $2 AND o.released_at IS NULL`,
    [device.id, customerId, nickname]
  );
  if (res.rowCount === 0) throw new DeviceError("not_owned", "That camera is not on your account.", 404);
  const refreshed = await deviceBySerial(serial);
  return deviceView(refreshed);
}
async function deviceOwnedBy(customerId, rawSerial) {
  const serial = (rawSerial || "").trim().toUpperCase();
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
export {
  DeviceError as D,
  SEED_DEVICES as S,
  deviceView as a,
  devicesForCustomer as b,
  renameDevice as c,
  deviceOwnedBy as d,
  releaseDevice as e,
  deviceBySerial as f,
  SEED_FIRMWARE as g,
  digestFor as h,
  compareFirmware as i,
  registerDevice as r
};

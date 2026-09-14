import { o as one, q, t as tx, i as isUniqueViolation } from "./db_C-9WqIXq.mjs";
const SERIAL_RE = /^(VA|VC)\d{2}(0[1-9]|[1-4]\d|5[0-3])[2-9A-HJ-NP-Z]{6}$/;
class DeviceError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}
function serialLooksValid(serial) {
  return SERIAL_RE.test(serial.toUpperCase());
}
function fold(serial) {
  return serial.trim().toUpperCase();
}
function groupSerial(serial) {
  const s = fold(serial);
  return [s.slice(0, 2), s.slice(2, 4), s.slice(4, 6), s.slice(6, 12)].filter(Boolean).join(" ");
}
function toDeviceView(d) {
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
    owned: !!d.owner_customer_id
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
async function deviceBySerial(serial) {
  return one(`${DEVICE_SELECT} WHERE d.serial_folded = $1`, [fold(serial)]);
}
async function devicesForCustomer(customerId) {
  return q(`${DEVICE_SELECT} WHERE o.customer_id = $1 ORDER BY o.claimed_at DESC, d.id ASC`, [customerId]);
}
async function registerDevice(customerId, rawSerial) {
  const serial = fold(rawSerial);
  if (!serialLooksValid(serial)) {
    throw new DeviceError("invalid_serial", "That serial number does not look right. Check the underside of the camera.", 400);
  }
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError("unknown_serial", "We do not recognise that serial number.", 404);
  if (device.status === "blocked") {
    throw new DeviceError("blocked", "That camera is blocked. Contact support.", 409, { blocked_reason: device.blocked_reason });
  }
  if (device.owner_customer_id && device.owner_customer_id !== customerId) {
    throw new DeviceError("owned_by_other", "That camera is registered to someone else.", 409);
  }
  if (device.owner_customer_id === customerId) {
    return device;
  }
  try {
    await tx(async (client) => {
      await client.query(
        `UPDATE device SET status='registered' WHERE id=$1`,
        [device.id]
      );
      const res = await client.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`,
        [device.id, customerId]
      );
      return res;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DeviceError("owned_by_other", "That camera is registered to someone else.", 409);
    }
    throw err;
  }
  return deviceBySerial(serial);
}
async function releaseDevice(customerId, rawSerial, method = "manual") {
  const serial = fold(rawSerial);
  const device = await deviceBySerial(serial);
  if (!device) throw new DeviceError("unknown_serial", "We do not recognise that serial number.", 404);
  if (!device.owner_customer_id || device.owner_customer_id !== customerId) {
    throw new DeviceError("unknown_serial", "We do not recognise that serial number.", 404);
  }
  await q(
    `UPDATE device_ownership SET released_at = now() WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL`,
    [device.id, customerId]
  );
  await q(`UPDATE device SET status='sold' WHERE id = $1 AND status='registered'`, [device.id]);
  return deviceBySerial(serial);
}
async function renameDevice(customerId, rawSerial, nickname) {
  const serial = fold(rawSerial);
  const device = await deviceBySerial(serial);
  if (!device || !device.owner_customer_id || device.owner_customer_id !== customerId) {
    throw new DeviceError("unknown_serial", "We do not recognise that serial number.", 404);
  }
  await q(`UPDATE device SET nickname = $1 WHERE id = $2`, [nickname.slice(0, 60), device.id]);
  return deviceBySerial(serial);
}
export {
  DeviceError as D,
  devicesForCustomer as a,
  renameDevice as b,
  releaseDevice as c,
  deviceBySerial as d,
  fold as f,
  groupSerial as g,
  registerDevice as r,
  toDeviceView as t
};

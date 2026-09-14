import { query, one, withTransaction } from './db.js';
import { errors } from './errors.js';
import { isValidSerialShape, compareVersions } from './ids.js';
import { encodeCursor, decodeCursor } from './pagination.js';

export const SERIAL_RE = /^[A-Z]{2}\d{4}[A-HJ-NP-Z2-9]{6}$/;

export function isValidSerial(serial) {
  return SERIAL_RE.test(String(serial || '').trim().toUpperCase());
}

export function normaliseSerial(serial) {
  return String(serial || '').trim().toUpperCase();
}

export function serialShapeMessage() {
  return 'A serial is twelve characters, engraved on the underside of the camera.';
}

/** Page of devices owned by a customer, keyset cursor on the ownership id. */
export async function listDevicesForCustomer(customerId, pageSize, cursor) {
  const after = decodeCursor(cursor);
  const params = [customerId];
  let where = '';
  if (after !== null) {
    params.push(Number(after));
    where = ` AND o.id < $${params.length}`;
  }
  const r = await query(
    `SELECT d.*, p.title AS product_title, p.handle AS product_handle,
            v.option_value, v.sku AS variant_sku,
            o.claimed_at, o.id AS ownership_id, o.customer_id AS owner_customer_id
     FROM device_ownership o
     JOIN device d ON d.id = o.device_id
     JOIN product p ON p.id = d.product_id
     JOIN variant v ON v.id = d.variant_id
     WHERE o.released_at IS NULL AND o.customer_id = $1${where}
     ORDER BY o.id DESC
     LIMIT ${pageSize + 1}`,
    params
  );
  const hasMore = r.rows.length > pageSize;
  const page = hasMore ? r.rows.slice(0, pageSize) : r.rows;
  const latestCache = new Map();
  const data = [];
  for (const d of page) {
    if (!latestCache.has(d.product_id)) {
      latestCache.set(d.product_id, await latestFirmware(d.product_id));
    }
    data.push(serializeDevice(d, { latestFw: latestCache.get(d.product_id) }));
  }
  const last = page[page.length - 1];
  return { data, has_more: hasMore, next_cursor: hasMore && last ? encodeCursor(last.ownership_id) : null };
}


/** Look up a device by serial with its product and variant. */
export async function findDeviceBySerial(serial) {
  return one(
    `SELECT d.*, p.title AS product_title, p.handle AS product_handle,
            v.option_value, v.sku AS variant_sku
     FROM device d
     JOIN product p ON p.id = d.product_id
     JOIN variant v ON v.id = d.variant_id
     WHERE lower(d.serial) = lower($1)`,
    [serial]
  );
}

export async function deviceWithOwner(serial) {
  return one(
    `SELECT d.*, p.title AS product_title, p.handle AS product_handle,
            v.option_value, v.sku AS variant_sku,
            o.customer_id AS owner_customer_id, o.claimed_at AS owner_claimed_at
     FROM device d
     JOIN product p ON p.id = d.product_id
     JOIN variant v ON v.id = d.variant_id
     LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
     WHERE lower(d.serial) = lower($1)`,
    [serial]
  );
}

/** Firmware entries for a product, newest build first. */
export async function firmwareForProduct(productId, { channel = null } = {}) {
  const params = [productId];
  let channelFilter = '';
  if (channel) {
    params.push(channel);
    channelFilter = ` AND channel = $2`;
  }
  const r = await query(
    `SELECT * FROM firmware WHERE product_id = $1${channelFilter} ORDER BY build DESC`,
    params
  );
  return r.rows;
}

/** Latest general-channel firmware for a product. */
export async function latestFirmware(productId) {
  return one(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId]
  );
}

export function deviceFirmwareState(device) {
  if (!device.firmware_version) return { state: 'unknown', label: 'Not yet connected', update_available: false };
  return { state: 'current', label: device.firmware_version, update_available: false };
}

/** Register a serial to a customer, single-winner under concurrency. */
export async function registerDevice({ serial, customerId, orderId = null }) {
  const s = normaliseSerial(serial);
  if (!SERIAL_RE.test(s)) {
    throw errors.validation(serialShapeMessage());
  }
  const claimed = await withTransaction(async (client) => {
    const dev = await client
      .query(
        `SELECT d.*, p.title AS product_title FROM device d
         JOIN product p ON p.id = d.product_id
         WHERE lower(d.serial) = lower($1) FOR UPDATE`,
        [s]
      )
      .then((r) => r.rows[0]);
    if (!dev) return { notFound: true };
    if (dev.status === 'blocked') return { blocked: true, reason: dev.blocked_reason };
    const live = await client
      .query(`SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`, [dev.id])
      .then((r) => r.rows[0]);
    if (live && live.customer_id !== customerId) return { owned: true };
    if (live && live.customer_id === customerId) return { already: true, device: dev };
    await client.query(
      `INSERT INTO device_ownership (device_id, customer_id, order_id, method) VALUES ($1,$2,$3,'manual')`,
      [dev.id, customerId, orderId]
    );
    await client.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [dev.id]);
    return { ok: true, device: dev };
  });
  return claimed;
}

export async function releaseDevice({ serial, customerId }) {
  const s = normaliseSerial(serial);
  return withTransaction(async (client) => {
    const dev = await client
      .query(
        `SELECT d.*, p.title AS product_title FROM device d JOIN product p ON p.id = d.product_id
         WHERE lower(d.serial) = lower($1)`,
        [s]
      )
      .then((r) => r.rows[0]);
    if (!dev) return { notFound: true };
    const live = await client
      .query(`SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`, [dev.id])
      .then((r) => r.rows[0]);
    if (!live) return { notFound: true };
    if (live.customer_id !== customerId) return { forbidden: true };
    await client.query(`UPDATE device_ownership SET released_at = now() WHERE id = $1`, [live.id]);
    await client.query(`UPDATE device SET status = 'sold' WHERE id = $1 AND status = 'registered'`, [dev.id]);
    return { ok: true, device: dev };
  });
}

export async function renameDevice({ serial, customerId, nickname }) {
  const s = normaliseSerial(serial);
  const dev = await deviceWithOwner(s);
  if (!dev) throw errors.notFound('That camera does not exist.');
  if (!dev.owner_customer_id) throw errors.notFound('That camera does not exist.');
  if (dev.owner_customer_id !== customerId) throw errors.notFound('That camera does not exist.');
  await query(`UPDATE device SET nickname = $1 WHERE id = $2`, [nickname, dev.id]);
  return one(`SELECT * FROM device WHERE id = $1`, [dev.id]);
}

export function serializeDevice(d, { latestFw = null } = {}) {
  const fw = d.firmware_version;
  const latestBuild = latestFw ? latestFw.build : null;
  const updateAvailable = Boolean(
    latestFw && fw && compareVersions(latestFw.version, fw) > 0
  );
  const notConnected = !fw;
  return {
    id: d.id,
    serial: d.serial,
    model: d.product_title,
    product_handle: d.product_handle,
    option_value: d.option_value,
    status: d.status,
    nickname: d.nickname || null,
    firmware_version: fw,
    firmware_state: notConnected ? 'unknown' : updateAvailable ? 'behind' : 'current',
    firmware_label: notConnected ? 'Not yet connected' : updateAvailable ? 'Update available' : fw,
    update_available: updateAvailable,
    latest_firmware_version: latestFw ? latestFw.version : null,
    warranty_until: d.warranty_until ? d.warranty_until.toISOString().slice(0, 10) : null,
    blocked_reason: d.blocked_reason || null,
    owner_customer_id: d.owner_customer_id ?? null,
  };
}

/**
 * Start a flash session. Refused before it starts when the image belongs to
 * another product or its min_firmware is above what the device reports.
 * At most one started session per device, enforced by a unique index.
 */
export async function startFlashSession({ serial, targetBuild }) {
  const s = normaliseSerial(serial);
  return withTransaction(async (client) => {
    const dev = (
      await client.query(
        `SELECT d.*, p.title AS product_title FROM device d
         JOIN product p ON p.id = d.product_id WHERE lower(d.serial) = lower($1)`,
        [s]
      )
    ).rows[0];
    if (!dev) return { notFound: true };
    if (dev.status === 'blocked') return { blocked: true };

    const fw = (await client.query(`SELECT * FROM firmware WHERE build = $1 AND product_id = $2`, [targetBuild, dev.product_id])).rows[0];
    if (!fw) {
      const anyFw = (await client.query(`SELECT * FROM firmware WHERE build = $1`, [targetBuild])).rows[0];
      if (anyFw) return { wrongProduct: true };
      return { notFound: true };
    }
    if (fw.min_firmware && (!dev.firmware_version || compareVersions(dev.firmware_version, fw.min_firmware) < 0)) {
      return { belowMinimum: true, needs: fw.min_firmware, has: dev.firmware_version || 'nothing' };
    }
    if (fw.channel !== 'general') {
      const deviceOpted = await client
        .query(`SELECT 1 FROM device_channel WHERE device_id = $1 AND channel = $2`, [dev.id, fw.channel])
        .then((r) => r.rows.length > 0)
        .catch(() => false);
      if (!deviceOpted) return { notGeneral: true, channel: fw.channel };
    }
    let inserted;
    try {
      inserted = await client.query(
        `INSERT INTO flash_session (device_id, firmware_id) VALUES ($1,$2) RETURNING *`,
        [dev.id, fw.id]
      );
    } catch (err) {
      if (String(err.code) === '23505') return { busy: true };
      throw err;
    }
    return { session: serializeFlashSession(inserted.rows[0], { device: dev, firmware: fw }) };
  });
}

export async function completeFlashSession(sessionId, reportedVersion) {
  return withTransaction(async (client) => {
    const sess = (await client.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [sessionId])).rows[0];
    if (!sess) return { notFound: true };
    if (sess.state !== 'started') return { wrongState: true };
    await client.query(
      `UPDATE flash_session SET state='succeeded', reported_version=$1, ended_at=now() WHERE id=$2`,
      [reportedVersion, sessionId]
    );
    await client.query(
      `UPDATE device SET firmware_version=$1, firmware_reported_at=now() WHERE id=$2`,
      [reportedVersion, sess.device_id]
    );
    const fresh = (await client.query(`SELECT * FROM flash_session WHERE id = $1`, [sessionId])).rows[0];
    const dev = (await client.query(`SELECT * FROM device WHERE id = $1`, [sess.device_id])).rows[0];
    return { session: serializeFlashSession(fresh, { deviceVersion: dev.firmware_version }) };
  });
}

export async function failFlashSession(sessionId, reason) {
  return withTransaction(async (client) => {
    const sess = (await client.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [sessionId])).rows[0];
    if (!sess) return { notFound: true };
    if (sess.state !== 'started') return { wrongState: true };
    await client.query(
      `UPDATE flash_session SET state='failed', failure_reason=$1, ended_at=now() WHERE id=$2`,
      [reason, sessionId]
    );
    const fresh = (await client.query(`SELECT * FROM flash_session WHERE id = $1`, [sessionId])).rows[0];
    return { session: serializeFlashSession(fresh) };
  });
}

export function serializeFlashSession(s, { deviceVersion = null, device = null, firmware = null } = {}) {
  return {
    id: s.id,
    device_id: s.device_id,
    firmware_id: s.firmware_id,
    state: s.state,
    reported_version: s.reported_version || null,
    failure_reason: s.failure_reason || null,
    started_at: s.started_at,
    ended_at: s.ended_at || null,
    ...(firmware ? { target_version: firmware.version, target_build: firmware.build } : {}),
    ...(deviceVersion ? { device_version: deviceVersion } : {}),
    ...(device ? { serial: device.serial } : {}),
  };
}


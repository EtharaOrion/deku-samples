import { Hono } from 'hono';
import { query, withTransaction } from '../lib/db.mjs';
import { badRequest, notFound, unprocessable, conflict } from '../lib/errors.mjs';
import { normaliseSerial, isValidSerial, compareVersions } from '../lib/serial.mjs';

const app = new Hono();

/**
 * The manifest is served for one product at a time. An entry whose channel is not
 * `general` is never offered to a device that has not opted into that channel.
 */
app.get('/manifest', async (c) => {
  const model = c.req.query('model') || c.req.query('handle');
  if (!model) throw badRequest('model_required', 'Name the model whose firmware you want.');

  const { rows: products } = await query(
    'SELECT id, handle, title FROM product WHERE handle = $1 OR lower(title) = lower($1)',
    [model],
  );
  const product = products[0];
  if (!product) throw notFound('We do not make that model.');

  const requested = (c.req.query('channel') || 'general').toLowerCase();
  const channels = requested === 'general' ? ['general'] : ['general', requested];

  const { rows } = await query(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
       FROM firmware WHERE product_id = $1 AND channel = ANY($2::text[])
      ORDER BY build DESC`,
    [product.id, channels],
  );

  return c.json({
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    channel: requested,
    entries: rows.map((f) => ({
      version: f.version,
      build: f.build,
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: Number(f.size_bytes),
      sha256: f.sha256,
      released_on: f.released_on.toISOString().slice(0, 10),
    })),
  });
});

/** A device the installer can identify, so the page can state what it is. */
app.get('/device/:serial', async (c) => {
  const serial = normaliseSerial(c.req.param('serial'));
  if (!isValidSerial(serial)) throw badRequest('serial_invalid', 'We do not recognise that serial number.');
  const { rows } = await query(
    `SELECT d.serial, d.firmware_version, d.status, p.handle, p.title AS model
       FROM device d JOIN product p ON p.id = d.product_id
      WHERE upper(d.serial) = upper($1)`,
    [serial],
  );
  if (!rows[0]) throw notFound('We do not recognise that serial number.');
  const d = rows[0];
  const { rows: fw } = await query(
    `SELECT version, build, min_firmware, min_app_version, size_bytes, sha256
       FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE p.handle = $1 AND f.channel = 'general' ORDER BY build DESC`,
    [d.handle],
  );
  return c.json({
    serial: d.serial,
    model: d.model,
    handle: d.handle,
    status: d.status,
    firmware_version: d.firmware_version,
    // Ownership and warranty are not conditions of repair.
    images: fw.map((f) => ({
      ...f,
      size_bytes: Number(f.size_bytes),
      eligible: !f.min_firmware || !d.firmware_version
        ? Boolean(d.firmware_version)
        : compareVersions(d.firmware_version, f.min_firmware) >= 0,
    })),
  });
});

export const sessions = new Hono();

/**
 * A session is refused before it starts when the image belongs to another product
 * or its min_firmware is above the version the device reports. A refusal writes
 * no session row and leaves the firmware untouched.
 */
sessions.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serial = normaliseSerial(body.serial);
  const targetBuild = Number(body.target_build);

  if (!isValidSerial(serial)) throw badRequest('serial_invalid', 'We do not recognise that serial number.');
  if (!Number.isInteger(targetBuild)) throw badRequest('target_build_required', 'Name the firmware build to write.');

  const session = await withTransaction(async (client) => {
    const { rows: deviceRows } = await client.query(
      `SELECT d.id, d.serial, d.product_id, d.firmware_version, d.status, p.title AS model
         FROM device d JOIN product p ON p.id = d.product_id
        WHERE upper(d.serial) = upper($1) FOR UPDATE OF d`,
      [serial],
    );
    const device = deviceRows[0];
    if (!device) throw notFound('We do not recognise that serial number.');
    if (device.status === 'blocked') {
      throw unprocessable('device_blocked', 'That camera is blocked. Get in touch and we will look into it.');
    }

    const { rows: fwRows } = await client.query('SELECT * FROM firmware WHERE build = $1', [targetBuild]);
    const firmware = fwRows[0];
    if (!firmware) throw notFound('That firmware image does not exist.');

    // The image must belong to this product.
    if (firmware.product_id !== device.product_id) {
      throw unprocessable('wrong_product', `That image is for a different camera. It cannot be written to a ${device.model}.`);
    }
    if (firmware.channel !== 'general') {
      throw unprocessable('channel_not_offered', 'That image is not offered for this camera.');
    }
    // It must not go below the minimum firmware the image requires.
    if (firmware.min_firmware && device.firmware_version
        && compareVersions(device.firmware_version, firmware.min_firmware) < 0) {
      throw unprocessable(
        'below_min_firmware',
        `This camera is running ${device.firmware_version}. It needs ${firmware.min_firmware} before it can take ${firmware.version}.`,
      );
    }
    if (firmware.min_firmware && !device.firmware_version) {
      throw unprocessable(
        'firmware_unknown',
        `We have not heard a version from this camera yet. Connect it once with Arranger before writing ${firmware.version}.`,
      );
    }

    try {
      const { rows } = await client.query(
        `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
        [device.id, firmware.id],
      );
      return { ...rows[0], serial: device.serial, model: device.model, target_version: firmware.version };
    } catch (err) {
      // At most one session in `started` per device at any time.
      if (err.code === '23505') {
        throw conflict('session_in_flight', 'A write is already running on that camera.', { resource: `device:${serial}` });
      }
      throw err;
    }
  });

  return c.json({
    id: session.id,
    serial: session.serial,
    model: session.model,
    state: session.state,
    target_version: session.target_version,
    started_at: session.started_at,
  }, 201);
});

/** Completing records the version read back from the device, never the requested one. */
sessions.post('/:id/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const reported = String(body.reported_version || '').trim();
  if (!reported) throw badRequest('reported_version_required', 'The version the camera reported is required.');
  if (!/^\d+(\.\d+)*$/.test(reported)) throw badRequest('reported_version_invalid', 'That did not work.');

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT s.*, d.serial FROM flash_session s JOIN device d ON d.id = s.device_id
        WHERE s.id = $1 FOR UPDATE OF s`,
      [c.req.param('id')],
    );
    const session = rows[0];
    if (!session) throw notFound('That session does not exist.');
    if (session.state !== 'started') {
      throw unprocessable('session_settled', 'That write has already finished.');
    }
    const { rows: [updated] } = await client.query(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
        WHERE id = $1 RETURNING *`,
      [session.id, reported],
    );
    // The device records what it reported, not what was asked for.
    await client.query(
      'UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1',
      [session.device_id, reported],
    );
    return { ...updated, serial: session.serial };
  });

  return c.json({
    id: result.id,
    serial: result.serial,
    state: result.state,
    reported_version: result.reported_version,
    firmware_version: result.reported_version,
    ended_at: result.ended_at,
  });
});

/** A failed session leaves the device's version as it was. */
sessions.post('/:id/fail', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim().slice(0, 200) || 'unknown';

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT s.*, d.serial, d.firmware_version FROM flash_session s JOIN device d ON d.id = s.device_id
        WHERE s.id = $1 FOR UPDATE OF s`,
      [c.req.param('id')],
    );
    const session = rows[0];
    if (!session) throw notFound('That session does not exist.');
    if (session.state !== 'started') {
      throw unprocessable('session_settled', 'That write has already finished.');
    }
    const { rows: [updated] } = await client.query(
      `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
        WHERE id = $1 RETURNING *`,
      [session.id, reason],
    );
    return { ...updated, serial: session.serial, firmware_version: session.firmware_version };
  });

  return c.json({
    id: result.id,
    serial: result.serial,
    state: result.state,
    failure_reason: result.failure_reason,
    firmware_version: result.firmware_version,
    ended_at: result.ended_at,
  });
});

export default app;

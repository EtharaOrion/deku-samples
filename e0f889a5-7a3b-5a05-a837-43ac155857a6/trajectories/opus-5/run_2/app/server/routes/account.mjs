import { Hono } from 'hono';
import { query, withTransaction } from '../lib/db.mjs';
import { customerForToken, bearerFrom } from '../lib/auth.mjs';
import { pageSizeFrom, decodeCursor, paginate } from '../lib/pagination.mjs';
import { badRequest, conflict, notFound, unauthorized, unprocessable } from '../lib/errors.mjs';
import { normaliseSerial, isValidSerial, compareVersions } from '../lib/serial.mjs';
import { orderWithLines, orderChip } from '../lib/orders.mjs';

const app = new Hono();

/*
 * Authorization is enforced server-side on every account endpoint. A direct API
 * call from a visitor session is rejected here, before any state is read or
 * written; hiding a button is not authorization.
 */
app.use('*', async (c, next) => {
  const customer = await customerForToken(bearerFrom(c));
  if (!customer) throw unauthorized('Sign in to continue.');
  c.set('customer', customer);
  await next();
});

const deviceShape = (row) => ({
  serial: row.serial,
  model: row.model,
  handle: row.handle,
  option_value: row.option_value,
  nickname: row.nickname,
  status: row.status,
  firmware_version: row.firmware_version,
  firmware_reported_at: row.firmware_reported_at,
  latest_firmware: row.latest_firmware,
  update_available: Boolean(
    row.firmware_version && row.latest_firmware && compareVersions(row.latest_firmware, row.firmware_version) > 0,
  ),
  warranty_until: row.warranty_until ? row.warranty_until.toISOString().slice(0, 10) : null,
  warranty_expired: row.warranty_until ? row.warranty_until.getTime() < Date.now() : false,
  claimed_at: row.claimed_at,
});

const DEVICE_SELECT = `
  SELECT d.id, d.serial, d.nickname, d.status, d.firmware_version, d.firmware_reported_at,
         d.warranty_until, p.title AS model, p.handle, v.option_value, o.claimed_at,
         (SELECT f.version FROM firmware f
           WHERE f.product_id = d.product_id AND f.channel = 'general'
           ORDER BY f.build DESC LIMIT 1) AS latest_firmware
    FROM device_ownership o
    JOIN device d ON d.id = o.device_id
    JOIN product p ON p.id = d.product_id
    JOIN variant v ON v.id = d.variant_id
   WHERE o.customer_id = $1 AND o.released_at IS NULL
`;

app.get('/devices', async (c) => {
  const customer = c.get('customer');
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [customer.id];
  let where = '';
  if (cursor) {
    params.push(cursor.claimed_at, cursor.id);
    where = ` AND (o.claimed_at, d.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(pageSize + 1);
  const { rows } = await query(
    `${DEVICE_SELECT}${where} ORDER BY o.claimed_at DESC, d.id DESC LIMIT $${params.length}`,
    params,
  );
  const page = paginate(rows, pageSize, (last) => ({ claimed_at: last.claimed_at, id: last.id }));
  return c.json({ ...page, data: page.data.map(deviceShape) });
});

/** A serial registers only when the device exists with no live owner. */
app.post('/devices', async (c) => {
  const customer = c.get('customer');
  const body = await c.req.json().catch(() => ({}));
  const serial = normaliseSerial(body.serial);

  // The shape is refused before any lookup happens.
  if (!isValidSerial(serial)) {
    throw badRequest('serial_invalid', 'We do not recognise that serial number.');
  }

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT d.id, d.status, d.blocked_reason FROM device d WHERE upper(d.serial) = upper($1) FOR UPDATE`,
      [serial],
    );
    const device = rows[0];
    if (!device) throw notFound('We do not recognise that serial number.');
    if (device.status === 'blocked') {
      throw unprocessable('device_blocked', 'That camera is blocked. Get in touch and we will look into it.');
    }

    const live = await client.query(
      'SELECT customer_id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL',
      [device.id],
    );
    if (live.rowCount > 0) {
      if (live.rows[0].customer_id === customer.id) {
        throw conflict('already_registered', 'That camera is already on your account.', { resource: `device:${serial}` });
      }
      // Never the other person's identity.
      throw conflict('owned_by_other', 'That camera is registered to someone else.', { resource: `device:${serial}` });
    }

    try {
      await client.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`,
        [device.id, customer.id],
      );
    } catch (err) {
      // The partial unique index is the single winner rule under real concurrency.
      if (err.code === '23505') {
        throw conflict('owned_by_other', 'That camera is registered to someone else.', { resource: `device:${serial}` });
      }
      throw err;
    }
    await client.query("UPDATE device SET status = 'registered' WHERE id = $1", [device.id]);
    return device.id;
  });

  const { rows } = await query(`${DEVICE_SELECT} AND d.id = $2`, [customer.id, result]);
  return c.json(deviceShape(rows[0]), 201);
});

app.get('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const serial = normaliseSerial(c.req.param('serial'));
  const { rows } = await query(`${DEVICE_SELECT} AND upper(d.serial) = upper($2)`, [customer.id, serial]);
  if (!rows[0]) throw notFound('That camera is not on your account.');
  return c.json(deviceShape(rows[0]));
});

app.patch('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const serial = normaliseSerial(c.req.param('serial'));
  const body = await c.req.json().catch(() => ({}));
  const nickname = body.nickname === null ? null : String(body.nickname || '').trim().slice(0, 60);

  // Only a camera this customer holds live may be renamed.
  const owned = await query(
    `SELECT d.id FROM device_ownership o JOIN device d ON d.id = o.device_id
      WHERE o.customer_id = $1 AND o.released_at IS NULL AND upper(d.serial) = upper($2)`,
    [customer.id, serial],
  );
  if (!owned.rowCount) throw notFound('That camera is not on your account.');

  await query('UPDATE device SET nickname = $2 WHERE id = $1', [owned.rows[0].id, nickname || null]);
  const { rows } = await query(`${DEVICE_SELECT} AND d.id = $2`, [customer.id, owned.rows[0].id]);
  return c.json(deviceShape(rows[0]));
});

/** Releasing ends the link and grants it to nobody. */
app.delete('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const serial = normaliseSerial(c.req.param('serial'));
  const released = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT o.id AS ownership_id, d.id AS device_id, d.serial
         FROM device_ownership o JOIN device d ON d.id = o.device_id
        WHERE o.customer_id = $1 AND o.released_at IS NULL AND upper(d.serial) = upper($2)
        FOR UPDATE OF o`,
      [customer.id, serial],
    );
    if (!rows[0]) throw notFound('That camera is not on your account.');
    await client.query('UPDATE device_ownership SET released_at = now() WHERE id = $1', [rows[0].ownership_id]);
    await client.query("UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1", [rows[0].device_id]);
    return rows[0].serial;
  });
  return c.json({ serial: released, released: true, owner: null });
});

app.get('/orders', async (c) => {
  const customer = c.get('customer');
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [customer.id];
  let where = '';
  if (cursor) {
    params.push(cursor.placed_at, cursor.id);
    where = ` AND (o.placed_at, o.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(pageSize + 1);
  const { rows } = await query(
    `SELECT o.*,
            (SELECT title_snapshot FROM order_line l WHERE l.order_id = o.id ORDER BY position LIMIT 1) AS first_title,
            (SELECT count(*) FROM order_line l WHERE l.order_id = o.id) AS line_count
       FROM "order" o
      WHERE o.customer_id = $1${where}
      ORDER BY o.placed_at DESC, o.id DESC
      LIMIT $${params.length}`,
    params,
  );
  const page = paginate(rows, pageSize, (last) => ({ placed_at: last.placed_at, id: last.id }));
  return c.json({
    ...page,
    data: page.data.map((o) => ({
      number: o.number,
      placed_at: o.placed_at,
      email: o.email,
      total_minor: o.total_minor,
      currency: o.currency,
      status: o.status,
      payment_status: o.payment_status,
      fulfilment_status: o.fulfilment_status,
      first_title: o.first_title,
      extra_lines: Math.max(0, Number(o.line_count) - 1),
      chip: orderChip(o),
    })),
  });
});

app.get('/orders/:number', async (c) => {
  const customer = c.get('customer');
  const { rows } = await query(
    'SELECT * FROM "order" WHERE number = $1 AND customer_id = $2',
    [c.req.param('number'), customer.id],
  );
  // Another customer's order reads as not found, never forbidden.
  if (!rows[0]) throw notFound('That order does not exist.');
  const shaped = await orderWithLines(rows[0]);
  return c.json({ ...shaped, chip: orderChip(rows[0]) });
});

/** The account overview: cameras first, then two recent orders, then software. */
app.get('/overview', async (c) => {
  const customer = c.get('customer');
  const devices = await query(`${DEVICE_SELECT} ORDER BY o.claimed_at DESC LIMIT 12`, [customer.id]);
  const orders = await query(
    `SELECT o.*, (SELECT title_snapshot FROM order_line l WHERE l.order_id = o.id ORDER BY position LIMIT 1) AS first_title,
            (SELECT count(*) FROM order_line l WHERE l.order_id = o.id) AS line_count
       FROM "order" o WHERE o.customer_id = $1 ORDER BY o.placed_at DESC LIMIT 2`,
    [customer.id],
  );
  const release = await query('SELECT version, build, released_on, artifact_name, size_bytes FROM app_release ORDER BY build DESC LIMIT 1');
  return c.json({
    customer: { id: customer.id, email: customer.email, name: customer.name },
    devices: devices.rows.map(deviceShape),
    orders: orders.rows.map((o) => ({
      number: o.number, placed_at: o.placed_at, total_minor: o.total_minor, currency: o.currency,
      first_title: o.first_title, extra_lines: Math.max(0, Number(o.line_count) - 1), chip: orderChip(o),
    })),
    latest_release: release.rows[0] || null,
  });
});

export default app;

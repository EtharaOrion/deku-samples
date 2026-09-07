import { Hono } from 'hono';
import { many, one } from '../lib/db.mjs';
import { requireAuth } from '../lib/auth.mjs';
import { badRequest, notFound } from '../lib/errors.mjs';
import { pageSizeFrom, decodeCursor, buildPage } from '../lib/pagination.mjs';
import { orderPayload, statePhrase } from '../lib/orders.mjs';
import { registerDevice, releaseDevice, renameDevice, deviceShape, latestFirmwareFor, deviceBySerial, liveOwner } from '../lib/devices.mjs';

const app = new Hono();
// Every /api/account route takes a bearer token, checked on the server.
app.use('*', requireAuth);

async function body(c) {
  try { return (await c.req.json()) || {}; } catch { return {}; }
}

app.get('/orders', async (c) => {
  const customer = c.get('customer');
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));

  // Newest first over a stable key, so a list that gains rows never repeats one.
  const rows = await many(
    `SELECT o.*,
            (SELECT ol.title_snapshot FROM order_line ol WHERE ol.order_id = o.id ORDER BY ol.position LIMIT 1) AS first_title,
            (SELECT count(*)::int FROM order_line ol WHERE ol.order_id = o.id) AS line_count
       FROM "order" o
      WHERE o.customer_id = $1
        AND ($2::bigint IS NULL OR o.id < $2::bigint)
      ORDER BY o.id DESC
      LIMIT $3`,
    [customer.id, cursor?.id ?? null, pageSize + 1],
  );

  const page = buildPage(rows, pageSize, (r) => ({ id: Number(r.id) }));
  return c.json({
    data: page.data.map((o) => ({
      number: o.number,
      placed_at: o.placed_at,
      total_minor: o.total_minor,
      currency: o.currency,
      status: o.status,
      payment_status: o.payment_status,
      fulfilment_status: o.fulfilment_status,
      state_phrase: statePhrase(o),
      first_title: o.first_title,
      more_count: Math.max(0, o.line_count - 1),
    })),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  });
});

app.get('/orders/:number', async (c) => {
  const customer = c.get('customer');
  const order = await one('SELECT * FROM "order" WHERE number = $1 AND customer_id = $2', [
    c.req.param('number'), customer.id,
  ]);
  // Another customer's order reads as not found, never forbidden.
  if (!order) throw notFound('That order does not exist.');
  return c.json({ order: await orderPayload(order) });
});

app.get('/devices', async (c) => {
  const customer = c.get('customer');
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));

  const rows = await many(
    `SELECT d.*, p.title AS model, p.handle, v.sku, v.option_value
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE o.customer_id = $1 AND o.released_at IS NULL
        AND ($2::bigint IS NULL OR d.id > $2::bigint)
      ORDER BY d.id
      LIMIT $3`,
    [customer.id, cursor?.id ?? null, pageSize + 1],
  );

  const page = buildPage(rows, pageSize, (r) => ({ id: Number(r.id) }));
  const latestByProduct = new Map();
  const data = [];
  for (const row of page.data) {
    const pid = Number(row.product_id);
    if (!latestByProduct.has(pid)) latestByProduct.set(pid, await latestFirmwareFor(pid));
    data.push(deviceShape(row, latestByProduct.get(pid)));
  }

  return c.json({ data, next_cursor: page.next_cursor, has_more: page.has_more });
});

app.post('/devices', async (c) => {
  const customer = c.get('customer');
  const { serial } = await body(c);
  if (!serial) throw badRequest('serial_required', 'Serial number is required.');
  const device = await registerDevice(serial, customer.id);
  const latest = await latestFirmwareFor(device.product_id);
  return c.json({ device: deviceShape(device, latest) }, 201);
});

app.get('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const device = await deviceBySerial(c.req.param('serial'));
  if (!device) throw notFound('We do not recognise that serial number.');
  const owner = await liveOwner(device.id);
  // Another customer's serial reads as not found, never forbidden.
  if (!owner || Number(owner.customer_id) !== Number(customer.id)) {
    throw notFound('We do not recognise that serial number.');
  }
  const latest = await latestFirmwareFor(device.product_id);
  return c.json({ device: deviceShape(device, latest) });
});

app.patch('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const { nickname } = await body(c);
  const device = await renameDevice(c.req.param('serial'), customer.id, nickname);
  const latest = await latestFirmwareFor(device.product_id);
  return c.json({ device: deviceShape(device, latest) });
});

app.delete('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const device = await releaseDevice(c.req.param('serial'), customer.id);
  const latest = await latestFirmwareFor(device.product_id);
  return c.json({ device: deviceShape(device, latest), released: true });
});

/** The account overview: cameras first, then two recent orders, then the app version. */
app.get('/overview', async (c) => {
  const customer = c.get('customer');

  const devices = await many(
    `SELECT d.*, p.title AS model, v.sku, v.option_value
       FROM device_ownership o JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
      WHERE o.customer_id = $1 AND o.released_at IS NULL ORDER BY d.id LIMIT 20`,
    [customer.id],
  );
  const shapedDevices = [];
  const latestByProduct = new Map();
  for (const row of devices) {
    const pid = Number(row.product_id);
    if (!latestByProduct.has(pid)) latestByProduct.set(pid, await latestFirmwareFor(pid));
    shapedDevices.push(deviceShape(row, latestByProduct.get(pid)));
  }

  const orders = await many(
    `SELECT o.*, (SELECT ol.title_snapshot FROM order_line ol WHERE ol.order_id = o.id ORDER BY ol.position LIMIT 1) AS first_title,
            (SELECT count(*)::int FROM order_line ol WHERE ol.order_id = o.id) AS line_count
       FROM "order" o WHERE o.customer_id = $1 ORDER BY o.id DESC LIMIT 2`,
    [customer.id],
  );

  const release = await one('SELECT version, build, released_on FROM app_release ORDER BY build DESC LIMIT 1');

  return c.json({
    devices: shapedDevices,
    orders: orders.map((o) => ({
      number: o.number, placed_at: o.placed_at, total_minor: o.total_minor,
      currency: o.currency, state_phrase: statePhrase(o),
      first_title: o.first_title, more_count: Math.max(0, o.line_count - 1),
    })),
    latest_release: release,
  });
});

export default app;

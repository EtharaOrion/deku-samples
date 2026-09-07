import { Hono } from 'hono';
import { many, one, query } from '../lib/db.js';
import { requireCustomer } from '../lib/auth.js';
import { pageSizeFrom, decodeCursor, buildPage } from '../lib/pagination.js';
import { statePhrase, linesFor, orderView, orderByNumber } from '../lib/orders.js';
import { registerDevice, renameDevice, releaseDevice, devicesForCustomer, deviceBySerial, deviceView, latestFirmwareFor, assertSerialShape } from '../lib/devices.js';
import { notFound, badRequest } from '../lib/errors.js';

const routes = new Hono();

// Every /api/account route takes a bearer token. Authorization is enforced
// server-side: a direct call from a visitor session is rejected here.
routes.use('*', requireCustomer);

routes.get('/orders', async (c) => {
  const customer = c.get('customer');
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));

  const params = [customer.id, pageSize + 1];
  let keyset = '';
  if (cursor?.placed_at && cursor?.id) {
    params.push(cursor.placed_at, cursor.id);
    keyset = ` AND (o.placed_at, o.id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`;
  }
  const rows = await many(
    `SELECT o.*, (SELECT count(*) FROM order_line l WHERE l.order_id = o.id) AS line_count,
            (SELECT l.title_snapshot FROM order_line l WHERE l.order_id = o.id ORDER BY l.position LIMIT 1) AS first_title
       FROM "order" o
      WHERE o.customer_id = $1${keyset}
      ORDER BY o.placed_at DESC, o.id DESC
      LIMIT $2`,
    params,
  );

  const page = buildPage(rows, pageSize, (r) => ({
    placed_at: new Date(r.placed_at).toISOString(),
    id: Number(r.id),
  }));

  return c.json({
    ...page,
    data: page.data.map((o) => ({
      number: o.number,
      placed_at: new Date(o.placed_at).toISOString(),
      first_title: o.first_title,
      line_count: Number(o.line_count),
      summary:
        Number(o.line_count) > 1
          ? `${o.first_title} and ${Number(o.line_count) - 1} more`
          : o.first_title,
      total_minor: o.total_minor,
      currency: o.currency,
      status: o.status,
      payment_status: o.payment_status,
      fulfilment_status: o.fulfilment_status,
      state_phrase: statePhrase(o),
    })),
  });
});

routes.get('/orders/:number', async (c) => {
  const customer = c.get('customer');
  const order = await orderByNumber(c.req.param('number'));
  // Another customer's order reads as not found, never forbidden.
  if (!order || String(order.customer_id ?? '') !== String(customer.id)) {
    throw notFound('That order does not exist.', 'order_not_found');
  }
  const lines = await linesFor(order.id);
  return c.json(await orderView({ order, lines }));
});

routes.get('/devices', async (c) => {
  const customer = c.get('customer');
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));
  const rows = await devicesForCustomer(customer.id, { pageSize, cursor });
  const page = buildPage(rows, pageSize, (r) => ({ id: Number(r.raw.id) }));
  return c.json({ ...page, data: page.data.map((r) => r.view) });
});

routes.post('/devices', async (c) => {
  const customer = c.get('customer');
  const body = await c.req.json().catch(() => ({}));
  const device = await registerDevice({ serial: body?.serial, customer });
  return c.json(device, 201);
});

routes.get('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const serial = assertSerialShape(c.req.param('serial'));
  const device = await deviceBySerial(serial);
  if (!device || String(device.owner_id ?? '') !== String(customer.id)) {
    throw notFound('We do not recognise that serial number.', 'unknown_serial');
  }
  return c.json(deviceView(device, await latestFirmwareFor(device.product_id)));
});

routes.patch('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const body = await c.req.json().catch(() => ({}));
  const device = await renameDevice({
    serial: c.req.param('serial'),
    customer,
    nickname: body?.nickname ?? null,
  });
  return c.json(device);
});

routes.delete('/devices/:serial', async (c) => {
  const customer = c.get('customer');
  const device = await releaseDevice({ serial: c.req.param('serial'), customer });
  return c.json(device);
});

/** The account overview: cameras first, then two recent orders, then the software. */
routes.get('/overview', async (c) => {
  const customer = c.get('customer');
  const devices = await devicesForCustomer(customer.id, { pageSize: 12, cursor: null });
  const orders = await many(
    `SELECT o.*, (SELECT count(*) FROM order_line l WHERE l.order_id = o.id) AS line_count,
            (SELECT l.title_snapshot FROM order_line l WHERE l.order_id = o.id ORDER BY l.position LIMIT 1) AS first_title
       FROM "order" o WHERE o.customer_id = $1
      ORDER BY o.placed_at DESC, o.id DESC LIMIT 2`,
    [customer.id],
  );
  const release = await one(`SELECT version, build, released_on FROM app_release ORDER BY build DESC LIMIT 1`);
  const seen = await one(`SELECT build FROM account_seen_release WHERE customer_id = $1`, [customer.id]);

  return c.json({
    customer: { email: customer.email, name: customer.name },
    devices: devices.map((d) => d.view),
    orders: orders.map((o) => ({
      number: o.number,
      placed_at: new Date(o.placed_at).toISOString(),
      summary: Number(o.line_count) > 1 ? `${o.first_title} and ${Number(o.line_count) - 1} more` : o.first_title,
      total_minor: o.total_minor,
      currency: o.currency,
      state_phrase: statePhrase(o),
    })),
    software: release
      ? {
          version: release.version,
          build: release.build,
          is_newer_than_seen: !seen || Number(seen.build) < Number(release.build),
          last_seen_build: seen ? Number(seen.build) : null,
        }
      : null,
  });
});

routes.post('/software/seen', async (c) => {
  const customer = c.get('customer');
  const release = await one(`SELECT build FROM app_release ORDER BY build DESC LIMIT 1`);
  if (release) {
    await query(
      `INSERT INTO account_seen_release (customer_id, build) VALUES ($1,$2)
       ON CONFLICT (customer_id) DO UPDATE SET build = EXCLUDED.build`,
      [customer.id, release.build],
    );
  }
  return c.json({ ok: true });
});

export default routes;

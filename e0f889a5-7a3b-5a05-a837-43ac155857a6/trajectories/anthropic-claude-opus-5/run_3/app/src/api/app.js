import { Hono } from 'hono';
import { many, one, query } from '../lib/db.js';
import { AppError, isAppError, badRequest, conflict, errorBody, notFound, unauthorized, unprocessable } from '../lib/errors.js';
import { newRequestId, logRequest, logError } from '../lib/log.js';
import { readPageSize, decodeCursor, buildPage } from '../lib/pagination.js';
import { currentCustomer, requireCustomer, hashPassword, verifyPassword, issueToken } from '../lib/auth.js';
import { availabilityOf, DELIVERY_METHODS, deliveryMethod, compareVersions, NOTE_GROUPS } from '../lib/domain.js';
import { PG_UNIQUE_VIOLATION } from '../lib/db.js';
import {
  CART_COOKIE, getOrCreateCart, findCartByToken, cartView, createCart, touchCart,
} from './carts.js';
import { placeOrder, orderLines, orderSerials, readableOrder, orderPayload, findOrderByNumber, replayOrder } from './orders.js';
import {
  devicesForCustomer, decorateDevice, registerDevice, renameDevice, releaseDevice,
  ownedDeviceOr404, latestFirmwareFor, deviceBySerial,
} from './devices.js';
import { startSession, completeSession, failSession, sessionById } from './flash.js';
import { healthy as billingHealthy } from '../lib/killbill.js';

export const api = new Hono().basePath('/api');

/* ---------- request identity, structured logging, error shape ---------- */

api.use('*', async (c, next) => {
  const started = performance.now();
  const requestId = c.req.header('x-request-id') || newRequestId();
  c.set('requestId', requestId);
  c.set('startedAt', started);
  c.header('x-request-id', requestId);

  await next();

  // One line of JSON per request, carrying the method, route, status, elapsed
  // milliseconds and the request_id.
  logRequest({
    method: c.req.method,
    route: new URL(c.req.url).pathname,
    status: c.res.status,
    ms: performance.now() - started,
    requestId,
  });
});

/**
 * Errors are turned into responses here rather than in the middleware, because
 * the framework handles a rejected handler itself and would otherwise answer
 * every refusal with a bare 500. An invalid, unauthorized or out-of-state call
 * must be a client error carrying its own code, message and request_id.
 */
api.onError((err, c) => {
  const requestId = c.get('requestId') || newRequestId();
  const status = isAppError(err) ? err.status : 500;

  if (status >= 500) {
    logError('unhandled error', {
      request_id: requestId,
      error: String(err?.message || err),
      stack: err?.stack,
    });
  }

  logRequest({
    method: c.req.method,
    route: new URL(c.req.url).pathname,
    status,
    ms: performance.now() - (c.get('startedAt') ?? performance.now()),
    requestId,
  });

  return new Response(JSON.stringify(errorBody(err, requestId)), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  });
});

const rid = (c) => c.get('requestId');

/* ---------- health ---------- */

api.get('/health', async (c) => {
  try {
    await query('SELECT 1');
  } catch (err) {
    return c.json(
      { status: 'unhealthy', code: 'database_unavailable', message: 'The database is not reachable.', request_id: rid(c) },
      503,
    );
  }
  return c.json({ status: 'ok', request_id: rid(c) });
});

api.get('/health/deep', async (c) => {
  const [db, billing] = await Promise.all([
    query('SELECT 1').then(() => true).catch(() => false),
    billingHealthy(),
  ]);
  return c.json({ status: db ? 'ok' : 'unhealthy', database: db, billing, request_id: rid(c) }, db ? 200 : 503);
});

/* ---------- auth ---------- */

function customerPayload(row) {
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

api.post('/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();

  if (!email) throw unprocessable('email_required', 'Email is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw unprocessable('email_invalid', 'That did not work. Enter an email address.');
  if (!name) throw unprocessable('name_required', 'Name is required.');
  if (password.length < 8) throw unprocessable('password_too_short', 'Password is required and must be at least 8 characters.');

  try {
    const row = await one(
      `INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active')
       RETURNING id, email, name, created_at`,
      [email, name, hashPassword(password)],
    );
    return c.json({ access_token: issueToken(row.id), customer: customerPayload(row) }, 201);
  } catch (err) {
    // Signup refuses a registered address.
    if (err?.code === PG_UNIQUE_VIOLATION) {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.', { resource: email });
    }
    throw err;
  }
});

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const row = await one(
    `SELECT * FROM customer WHERE lower(email) = lower($1) AND status = 'active'`, [email],
  );
  // The same answer either way, so this cannot be used to learn who has an account.
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw unauthorized('That email and password do not match.', 'invalid_credentials');
  }
  return c.json({ access_token: issueToken(row.id), customer: customerPayload(row) });
});

api.get('/auth/me', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  return c.json({ customer: customerPayload(customer) });
});

/* ---------- catalogue ---------- */

async function productPayload(row, { withBlocks = false } = {}) {
  const variants = await many(
    `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, COALESCE(il.available,0) AS available, COALESCE(il.committed,0) AS committed
       FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = $1 ORDER BY v.position, v.id`,
    [row.id],
  );

  const decorated = variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    option_value: v.option_value,
    price_minor: v.price_minor,
    currency: v.currency,
    available: v.available,
    availability: availabilityOf({
      productStatus: row.status, available: v.available, inventoryPolicy: v.inventory_policy,
    }),
  }));

  const prices = decorated.map((v) => v.price_minor);
  const payload = {
    handle: row.handle,
    title: row.title,
    subtitle: row.subtitle,
    kind: row.kind,
    status: row.status,
    support_until: row.support_until,
    position: row.position,
    variants: decorated,
    price_minor: Math.min(...prices),
    price_varies: new Set(prices).size > 1,
    availability: availabilityOf({
      productStatus: row.status,
      available: decorated.reduce((n, v) => n + v.available, 0),
      inventoryPolicy: 'deny',
    }),
  };

  if (withBlocks) {
    payload.blocks = await many(
      `SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id`,
      [row.id],
    );
  }
  return payload;
}

// The catalogue is ordered by the editorial position and never by price or name.
api.get('/products', async (c) => {
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const params = [pageSize + 1];
  let where = `WHERE kind <> 'protection'`;
  if (cursor) {
    params.push(cursor.position, cursor.id);
    where += ` AND (position, id) > ($2::int, $3::uuid)`;
  }
  const rows = await many(
    `SELECT * FROM product ${where} ORDER BY position, id LIMIT $1`, params,
  );
  const page = buildPage(rows, pageSize, (r) => ({ position: r.position, id: r.id }));
  const data = [];
  for (const row of page.data) data.push(await productPayload(row));
  return c.json({ data, next_cursor: page.next_cursor, has_more: page.has_more });
});

api.get('/products/:handle', async (c) => {
  const handle = c.req.param('handle');
  const row = await one(`SELECT * FROM product WHERE handle = $1 AND kind <> 'protection'`, [handle]);
  if (!row) throw notFound('That product does not exist.', 'product_not_found');
  const payload = await productPayload(row, { withBlocks: true });

  // A parameter naming a variant that does not exist renders the default and
  // drops the parameter without comment.
  const wanted = c.req.query('variant');
  const selected = payload.variants.find((v) => v.sku === wanted) ?? payload.variants[0];
  return c.json({ product: payload, selected_sku: selected?.sku ?? null });
});

/* ---------- cart ---------- */

function cartTokenFrom(c) {
  const header = c.req.header('x-cart-token');
  if (header) return header;
  const cookie = c.req.header('cookie') || '';
  const m = /(?:^|;\s*)vela_cart=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

function setCartCookie(c, token) {
  c.header(
    'set-cookie',
    `${CART_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; HttpOnly`,
    { append: true },
  );
}

async function cartFor(c) {
  const customer = await currentCustomer(c.req.raw);
  const token = cartTokenFrom(c);
  const cart = await getOrCreateCart(token, customer?.id ?? null);
  if (cart.token !== token) setCartCookie(c, cart.token);
  if (customer && !cart.customer_id) {
    await query(`UPDATE cart SET customer_id = $2 WHERE id = $1`, [cart.id, customer.id]);
    cart.customer_id = customer.id;
  }
  return cart;
}

api.get('/cart', async (c) => {
  const cart = await cartFor(c);
  return c.json({ cart: await cartView(cart) });
});

api.post('/cart/lines', async (c) => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));
  const sku = String(body.sku ?? '').trim();
  const quantity = Number(body.quantity ?? 1);

  if (!sku) throw unprocessable('sku_required', 'Choose an option first.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw unprocessable('quantity_invalid', 'Quantity must be a whole number from 1 to 10.');
  }

  const variant = await one(
    `SELECT v.*, p.status AS product_status, p.title, p.kind, COALESCE(il.available,0) AS available
       FROM variant v JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.sku = $1`,
    [sku],
  );
  if (!variant || variant.kind === 'protection') {
    throw notFound('That item does not exist.', 'variant_not_found');
  }

  const avail = availabilityOf({
    productStatus: variant.product_status,
    available: variant.available,
    inventoryPolicy: variant.inventory_policy,
  });
  if (!avail.buyable) {
    throw unprocessable('not_buyable',
      avail.state === 'discontinued' ? 'We no longer sell this.' : 'That option is sold out.');
  }

  const existing = await one(
    `SELECT * FROM cart_line WHERE cart_id = $1 AND variant_id = $2`, [cart.id, variant.id],
  );
  const nextQty = Math.min((existing?.quantity ?? 0) + quantity, 10);
  if (nextQty > variant.available) {
    throw unprocessable('insufficient_stock', `Only ${variant.available} left.`);
  }

  if (existing) {
    await query(`UPDATE cart_line SET quantity = $2 WHERE id = $1`, [existing.id, nextQty]);
  } else {
    // A cart line stores the unit price at add time.
    await query(
      `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)`,
      [cart.id, variant.id, nextQty, variant.price_minor],
    );
  }
  await touchCart(cart.id);
  return c.json({ cart: await cartView(cart) }, 201);
});

api.patch('/cart/lines/:id', async (c) => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw unprocessable('quantity_invalid', 'Quantity must be a whole number from 1 to 10.');
  }

  const line = await one(
    `SELECT cl.*, COALESCE(il.available,0) AS available, p.title
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.id = $1 AND cl.cart_id = $2`,
    [c.req.param('id'), cart.id],
  );
  if (!line) throw notFound('That line is not in your cart.', 'line_not_found');
  if (quantity > line.available) {
    throw unprocessable('insufficient_stock', `Only ${line.available} left.`);
  }

  await query(`UPDATE cart_line SET quantity = $2 WHERE id = $1`, [line.id, quantity]);
  await touchCart(cart.id);
  return c.json({ cart: await cartView(cart) });
});

api.delete('/cart/lines/:id', async (c) => {
  const cart = await cartFor(c);
  const { rowCount } = await query(
    `DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [c.req.param('id'), cart.id],
  );
  if (!rowCount) throw notFound('That line is not in your cart.', 'line_not_found');
  await touchCart(cart.id);
  return c.json({ cart: await cartView(cart) });
});

api.post('/cart/protection', async (c) => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));
  await query(`UPDATE cart SET protection_enabled = $2, updated_at = now() WHERE id = $1`, [
    cart.id, Boolean(body.enabled),
  ]);
  const fresh = await findCartByToken(cart.token);
  return c.json({ cart: await cartView(fresh) });
});

api.post('/cart/delivery', async (c) => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));

  const patch = {};
  if (body.email !== undefined) {
    const email = String(body.email ?? '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw unprocessable('email_invalid', 'That did not work. Enter an email address.');
    }
    patch.email = email || null;
  }
  if (body.marketing_consent !== undefined) patch.marketing_consent = Boolean(body.marketing_consent);
  if (body.shipping_address !== undefined) {
    const a = body.shipping_address ?? {};
    const required = ['name', 'line1', 'city', 'region', 'postal_code', 'country'];
    const labels = {
      name: 'Name', line1: 'Address', city: 'City', region: 'Region',
      postal_code: 'Postal code', country: 'Country',
    };
    for (const key of required) {
      if (!String(a[key] ?? '').trim()) {
        throw unprocessable('address_incomplete', `${labels[key]} is required.`, { field: key });
      }
    }
    patch.shipping_address = JSON.stringify({
      name: String(a.name).trim(), line1: String(a.line1).trim(),
      line2: String(a.line2 ?? '').trim(), city: String(a.city).trim(),
      region: String(a.region).trim(), postal_code: String(a.postal_code).trim(),
      country: String(a.country).trim().toUpperCase(), phone: String(a.phone ?? '').trim(),
    });
  }
  if (body.shipping_method !== undefined) {
    const code = String(body.shipping_method ?? '').trim();
    if (code && !deliveryMethod(code)) {
      throw unprocessable('shipping_method_invalid', 'Choose Standard or Express.');
    }
    patch.shipping_method = code || null;
  }

  const keys = Object.keys(patch);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await query(
      `UPDATE cart SET ${sets}, updated_at = now() WHERE id = $1`,
      [cart.id, ...keys.map((k) => patch[k])],
    );
  }
  const fresh = await findCartByToken(cart.token);
  return c.json({ cart: await cartView(fresh) });
});

api.get('/delivery-methods', (c) => c.json({ data: DELIVERY_METHODS, next_cursor: null, has_more: false }));

/* ---------- orders ---------- */

api.post('/orders', async (c) => {
  const customer = await currentCustomer(c.req.raw);
  const token = cartTokenFrom(c);
  const body = await c.req.json().catch(() => ({}));
  const idempotencyKey = c.req.header('idempotency-key') || body.idempotency_key || null;

  // A replayed key returns the order it returned the first time. This is
  // answered before the cart is consulted, because the first request emptied
  // the cart and a replay must still get its order back rather than an error.
  if (idempotencyKey) {
    const prior = await replayOrder(idempotencyKey);
    if (prior) {
      const serials = await orderSerials(prior.order.id);
      return c.json({
        order: { ...orderPayload(prior.order, prior.lines, serials), access_token: null },
        replayed: true,
      });
    }
  }

  const cart = await findCartByToken(token);
  if (!cart) throw unprocessable('cart_empty', 'Your cart is empty.');

  const result = await placeOrder({
    cart,
    customer,
    idempotencyKey,
    expectedTotalMinor: body.expected_total_minor,
    requestId: rid(c),
  });

  const serials = await orderSerials(result.order.id);
  return c.json(
    {
      order: {
        ...orderPayload(result.order, result.lines, serials),
        access_token: result.access_token,
      },
      replayed: result.replayed,
    },
    result.replayed ? 200 : 201,
  );
});

api.get('/orders/:number', async (c) => {
  const customer = await currentCustomer(c.req.raw);
  const accessToken = c.req.query('access_token') || c.req.header('x-order-token') || null;
  const order = await readableOrder(c.req.param('number'), { accessToken, customer });
  const lines = await orderLines(order.id);
  const serials = await orderSerials(order.id);
  return c.json({ order: orderPayload(order, lines, serials) });
});

/* ---------- account ---------- */

api.get('/account/orders', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const params = [customer.id, pageSize + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.placed_at, cursor.id);
    where = ` AND (placed_at, id) < ($3::timestamptz, $4::uuid)`;
  }
  const rows = await many(
    `SELECT * FROM "order" WHERE customer_id = $1${where}
      ORDER BY placed_at DESC, id DESC LIMIT $2`,
    params,
  );
  const page = buildPage(rows, pageSize, (r) => ({ placed_at: r.placed_at, id: r.id }));

  const data = [];
  for (const order of page.data) {
    const lines = await orderLines(order.id);
    data.push({
      ...orderPayload(order, lines),
      first_line_title: lines[0]?.title_snapshot ?? null,
      extra_line_count: Math.max(lines.length - 1, 0),
    });
  }
  return c.json({ data, next_cursor: page.next_cursor, has_more: page.has_more });
});

api.get('/account/orders/:number', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  const order = await readableOrder(c.req.param('number'), { customer });
  const lines = await orderLines(order.id);
  const serials = await orderSerials(order.id);
  return c.json({ order: orderPayload(order, lines, serials) });
});

api.get('/account/devices', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const rows = await devicesForCustomer(customer.id, { limit: pageSize, cursor });
  const page = buildPage(rows, pageSize, (r) => ({ claimed_at: r.claimed_at, id: r.ownership_id }));
  const data = [];
  for (const row of page.data) data.push(await decorateDevice(row));
  return c.json({ data, next_cursor: page.next_cursor, has_more: page.has_more });
});

api.post('/account/devices', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  const body = await c.req.json().catch(() => ({}));
  const { device, already } = await registerDevice(customer.id, body.serial);
  const row = await one(
    `SELECT d.id, d.serial, d.nickname, d.firmware_version, d.firmware_reported_at, d.warranty_until,
            d.status, d.product_id, p.title AS model, p.handle, v.option_value
       FROM device d JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id WHERE d.id = $1`,
    [device.id],
  );
  return c.json({ device: await decorateDevice(row), already_yours: already }, already ? 200 : 201);
});

api.patch('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  const body = await c.req.json().catch(() => ({}));
  const updated = await renameDevice(customer.id, c.req.param('serial'), body.nickname);
  return c.json({ device: await decorateDevice(updated) });
});

api.delete('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  const released = await releaseDevice(customer.id, c.req.param('serial'));
  return c.json({ device: await decorateDevice(released), released: true });
});

api.get('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c.req.raw);
  const device = await ownedDeviceOr404(customer.id, c.req.param('serial'));
  return c.json({ device: await decorateDevice(device) });
});

/* ---------- releases ---------- */

function releasePayload(r) {
  // Four ordered groups only, none invented beyond those four.
  const notes = {};
  for (const group of NOTE_GROUPS) {
    const items = r.notes?.[group];
    if (Array.isArray(items) && items.length) notes[group] = items;
  }
  return {
    version: r.version,
    build: r.build,
    released_on: r.released_on,
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: r.size_bytes,
    sha256: r.sha256,
    description: r.description,
    notes,
  };
}

// Ordered by build descending and never by release date: 1.4.3 and 1.4.2 share
// a release date and must still order deterministically.
api.get('/releases', async (c) => {
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const params = [pageSize + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.build);
    where = ` WHERE build < $2::int`;
  }
  const rows = await many(
    `SELECT * FROM app_release${where} ORDER BY build DESC LIMIT $1`, params,
  );
  const page = buildPage(rows, pageSize, (r) => ({ build: r.build }));
  return c.json({
    data: page.data.map(releasePayload),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  });
});

api.get('/releases/:version', async (c) => {
  const row = await one(`SELECT * FROM app_release WHERE version = $1`, [c.req.param('version')]);
  if (!row) throw notFound('That release does not exist.', 'release_not_found');
  return c.json({ release: releasePayload(row) });
});

/* ---------- firmware ---------- */

// The manifest is served for one product at a time.
api.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model') || c.req.query('product') || 'compact';
  const product = await one(
    `SELECT * FROM product WHERE handle = $1 OR lower(title) = lower($1)`, [model],
  );
  if (!product) throw notFound('That model does not exist.', 'product_not_found');

  // A device that has not opted into a channel is never offered an entry
  // outside general.
  const channel = c.req.query('channel') || 'general';
  const allowed = channel === 'general' ? ['general'] : ['general', channel];

  const rows = await many(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = ANY($2) ORDER BY build DESC`,
    [product.id, allowed],
  );
  return c.json({
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    entries: rows.map((f) => ({
      version: f.version,
      build: f.build,
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: f.size_bytes,
      sha256: f.sha256,
      released_on: f.released_on,
    })),
  });
});

api.get('/firmware/for-serial/:serial', async (c) => {
  const device = await deviceBySerial(c.req.param('serial'));
  if (!device) throw notFound('We do not recognise that serial number.', 'device_unknown');
  if (device.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked. We cannot write firmware to it.', {
      resource: device.serial,
    });
  }
  const entries = await many(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC`,
    [device.product_id],
  );
  const current = device.firmware_version;
  const eligible = entries.filter(
    (f) => !f.min_firmware || (current && compareVersions(current, f.min_firmware) >= 0),
  );
  return c.json({
    device: {
      serial: device.serial,
      model: device.model,
      handle: device.handle,
      firmware_version: current,
    },
    recommended: eligible[0]
      ? { version: eligible[0].version, build: eligible[0].build, size_bytes: eligible[0].size_bytes, sha256: eligible[0].sha256 }
      : null,
    entries: entries.map((f) => ({
      version: f.version,
      build: f.build,
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: f.size_bytes,
      sha256: f.sha256,
      eligible: !f.min_firmware || (current && compareVersions(current, f.min_firmware) >= 0),
    })),
  });
});

/* ---------- flash sessions ---------- */

api.post('/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { session, device, firmware } = await startSession({
    serial: body.serial,
    targetBuild: body.target_build,
    reportedVersion: body.reported_version,
  });
  return c.json({
    session: {
      id: session.id,
      state: session.state,
      started_at: session.started_at,
      serial: device.serial,
      target_version: firmware.version,
      target_build: firmware.build,
    },
  }, 201);
});

api.post('/flash-sessions/:id/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { session, device } = await completeSession(c.req.param('id'), body.reported_version);
  return c.json({
    session: {
      id: session.id,
      state: session.state,
      reported_version: session.reported_version,
      ended_at: session.ended_at,
    },
    device: { serial: device.serial, firmware_version: device.firmware_version },
  });
});

api.post('/flash-sessions/:id/fail', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { session } = await failSession(c.req.param('id'), body.reason);
  return c.json({
    session: {
      id: session.id,
      state: session.state,
      failure_reason: session.failure_reason,
      ended_at: session.ended_at,
    },
  });
});

api.get('/flash-sessions/:id', async (c) => {
  const session = await sessionById(c.req.param('id'));
  if (!session) throw notFound('That session does not exist.', 'session_not_found');
  return c.json({ session });
});

/* ---------- anything else under /api ---------- */

api.all('*', (c) =>
  c.json(
    { code: 'not_found', message: 'That endpoint does not exist.', request_id: rid(c) },
    404,
  ),
);

export default api;

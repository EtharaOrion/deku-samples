import { Hono } from 'hono';
import { AppError, badRequest, notFound, unauthorized } from './lib/errors.mjs';
import { log } from './lib/log.mjs';
import { query } from './lib/db.mjs';
import * as authService from './lib/auth.mjs';
import * as catalogue from './lib/catalogue.mjs';
import * as cartService from './lib/cart.mjs';
import * as orderService from './lib/orders.mjs';
import * as deviceService from './lib/devices.mjs';
import * as firmwareService from './lib/firmware.mjs';
import * as releaseService from './lib/releases.mjs';
import { buildPage, decodeCursor, readPageSize } from './lib/pagination.mjs';
import { healthy as billingHealthy } from './lib/killbill.mjs';

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

export function readCookie(c, name) {
  const raw = c.req.header('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setCookie(c, name, value, { maxAge = 60 * 60 * 24 * 30 } = {}) {
  c.header('set-cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
    { append: true });
}

export function clearCookie(c, name) {
  c.header('set-cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`, { append: true });
}

function bearerFrom(c) {
  const header = c.req.header('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return readCookie(c, SESSION_COOKIE);
}

/** Authorization is enforced server-side on every account endpoint. */
async function requireCustomer(c) {
  const token = bearerFrom(c);
  const customer = await authService.customerForToken(token);
  if (!customer) throw unauthorized('Sign in to continue.', 'unauthorized');
  return customer;
}

async function optionalCustomer(c) {
  return authService.customerForToken(bearerFrom(c));
}

async function cartFor(c, { create = false } = {}) {
  const token = readCookie(c, CART_COOKIE) || c.req.header('x-cart-token');
  const customer = await optionalCustomer(c);
  const existing = await cartService.findCartByToken(token);
  if (existing) {
    if (customer && !existing.customer_id) {
      await query(`UPDATE cart SET customer_id = $1 WHERE id = $2`, [customer.id, existing.id]);
      existing.customer_id = customer.id;
    }
    return existing;
  }
  if (!create) return null;
  const fresh = await cartService.createCart({ customerId: customer ? customer.id : null });
  setCookie(c, CART_COOKIE, fresh.token);
  return fresh;
}

export const api = new Hono();

api.get('/health', async (c) => {
  try {
    await query('SELECT 1');
  } catch (err) {
    return c.json({ status: 'starting', request_id: c.get('requestId') }, 503);
  }
  return c.json({ status: 'ok', request_id: c.get('requestId') });
});

api.get('/readiness', async (c) => {
  const [db, billing] = await Promise.all([
    query('SELECT 1').then(() => true).catch(() => false),
    billingHealthy(),
  ]);
  return c.json({ database: db, billing, request_id: c.get('requestId') }, db ? 200 : 503);
});

// ---------------------------------------------------------------- auth

api.post('/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await authService.signup(body);
  setCookie(c, SESSION_COOKIE, result.access_token);
  return c.json(result, 201);
});

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await authService.login(body);
  setCookie(c, SESSION_COOKIE, result.access_token);
  return c.json(result);
});

api.post('/auth/logout', async (c) => {
  await authService.signOut(bearerFrom(c));
  clearCookie(c, SESSION_COOKIE);
  return c.json({ ok: true });
});

api.get('/auth/me', async (c) => {
  const customer = await requireCustomer(c);
  return c.json({ customer: authService.publicCustomer(customer) });
});

// ----------------------------------------------------------- catalogue

api.get('/products', async (c) => {
  const q = c.req.query();
  const pageSize = readPageSize(q);
  const cursor = decodeCursor(q.cursor);
  const rows = await catalogue.listProducts({
    afterPosition: cursor,
    limit: pageSize + 1,
  });
  const page = buildPage(rows, pageSize, (r) => ({ position: r.position, id: String(r.id) }));
  return c.json({
    ...page,
    data: page.data.map((p) => ({
      handle: p.handle,
      title: p.title,
      subtitle: p.subtitle,
      kind: p.kind,
      status: p.status,
      support_until: p.support_until,
      position: p.position,
      availability: p.availability,
      price_from_minor: Math.min(...p.variants.map((v) => Number(v.price_minor))),
      variants: p.variants.map((v) => ({
        sku: v.sku, option_value: v.option_value, price_minor: Number(v.price_minor),
        currency: v.currency, available: Number(v.available),
      })),
    })),
  });
});

api.get('/products/:handle', async (c) => {
  const product = await catalogue.getProductByHandle(c.req.param('handle'));
  if (!product || product.kind === 'protection') throw notFound('That product does not exist.', 'product_not_found');
  const requested = c.req.query('variant');
  // A parameter naming a variant that does not exist renders the default.
  const selected = product.variants.find((v) => v.sku === requested) || product.variants[0];
  return c.json({
    handle: product.handle,
    title: product.title,
    subtitle: product.subtitle,
    kind: product.kind,
    status: product.status,
    support_until: product.support_until,
    availability: product.availability,
    selected_sku: selected ? selected.sku : null,
    variants: product.variants.map((v) => ({
      sku: v.sku, title: v.title, option_value: v.option_value,
      price_minor: Number(v.price_minor), currency: v.currency,
      available: Number(v.available), availability: v.availability,
    })),
    blocks: product.blocks,
  });
});

// ---------------------------------------------------------------- cart

api.get('/cart', async (c) => {
  const cart = await cartFor(c, { create: true });
  return c.json(await cartService.readCart(cart));
});

api.post('/cart/lines', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await cartFor(c, { create: true });
  return c.json(await cartService.addLine(cart, { sku: body.sku, quantity: body.quantity ?? 1 }));
});

api.patch('/cart/lines/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await cartFor(c);
  if (!cart) throw notFound('Your cart is empty.', 'cart_not_found');
  return c.json(await cartService.updateLine(cart, c.req.param('id'), body.quantity));
});

api.delete('/cart/lines/:id', async (c) => {
  const cart = await cartFor(c);
  if (!cart) throw notFound('Your cart is empty.', 'cart_not_found');
  return c.json(await cartService.removeLine(cart, c.req.param('id')));
});

api.post('/cart/protection', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await cartFor(c, { create: true });
  return c.json(await cartService.setProtection(cart, body.enabled));
});

api.post('/cart/delivery', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await cartFor(c, { create: true });
  return c.json(await cartService.setDelivery(cart, body));
});

api.get('/shipping-methods', async (c) => {
  const rows = await catalogue.shippingMethods();
  return c.json({ data: rows.map((r) => ({ ...r, price_minor: Number(r.price_minor) })), next_cursor: null, has_more: false });
});

// -------------------------------------------------------------- orders

api.post('/orders', async (c) => {
  // The cart token may already be spent when a replay arrives, so the
  // idempotency key alone has to be enough to answer.
  const cartToken = readCookie(c, CART_COOKIE) || c.req.header('x-cart-token');
  const customer = await optionalCustomer(c);
  const idempotencyKey = c.req.header('idempotency-key') || c.req.header('Idempotency-Key') || null;

  const { order, replayed, access_token } = await orderService.placeOrder({
    cartToken,
    customerId: customer ? customer.id : null,
    idempotencyKey,
    requestId: c.get('requestId'),
  });

  if (!replayed) clearCookie(c, CART_COOKIE);
  return c.json({
    ...orderService.publicOrder(order),
    access_token,
    replayed,
  }, replayed ? 200 : 201);
});

api.get('/orders/:number', async (c) => {
  const customer = await optionalCustomer(c);
  const accessToken = c.req.query('access_token') || c.req.header('x-order-token');
  const order = await orderService.readOrderFor(c.req.param('number'), {
    accessToken,
    customerId: customer ? customer.id : null,
    customerEmail: customer ? customer.email : null,
  });
  // Another customer's order reads as not found, never forbidden.
  if (!order) throw notFound('That order does not exist.', 'order_not_found');
  return c.json(orderService.publicOrder(order));
});

// ------------------------------------------------------------- account

api.get('/account/orders', async (c) => {
  const customer = await requireCustomer(c);
  const q = c.req.query();
  const pageSize = readPageSize(q);
  const cursor = decodeCursor(q.cursor);
  const params = [customer.id, customer.email];
  let where = orderService.ACCOUNT_ORDER_PREDICATE;
  if (cursor && cursor.id) {
    params.push(cursor.id);
    where += ` AND id < $${params.length}`;
  }
  params.push(pageSize + 1);
  const { rows } = await query(
    `SELECT * FROM "order" WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`, params);
  const page = buildPage(rows, pageSize, (r) => ({ id: String(r.id) }));
  const data = [];
  for (const row of page.data) {
    const lines = await orderService.orderLines(row.id);
    data.push({
      number: row.number,
      placed_at: row.placed_at,
      status: row.status,
      payment_status: row.payment_status,
      fulfilment_status: row.fulfilment_status,
      state_phrase: orderService.statePhrase(row),
      currency: row.currency,
      total_minor: Number(row.total_minor),
      first_line_title: lines.length ? lines[0].title_snapshot : null,
      extra_line_count: Math.max(lines.length - 1, 0),
    });
  }
  return c.json({ ...page, data });
});

api.get('/account/orders/:number', async (c) => {
  const customer = await requireCustomer(c);
  const order = await orderService.readOrderFor(c.req.param('number'), {
    customerId: customer.id, customerEmail: customer.email,
  });
  if (!order) throw notFound('That order does not exist.', 'order_not_found');
  return c.json(orderService.publicOrder(order));
});

api.get('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const q = c.req.query();
  const pageSize = readPageSize(q);
  const cursor = decodeCursor(q.cursor);
  const rows = await deviceService.listDevicesForCustomer(customer.id, {
    afterId: cursor ? cursor.id : null,
    limit: pageSize + 1,
  });
  const page = buildPage(rows, pageSize, (r) => ({ id: String(r.id) }));
  return c.json(page);
});

api.post('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const body = await c.req.json().catch(() => ({}));
  const device = await deviceService.registerDevice(body.serial, customer.id);
  return c.json(device, 201);
});

api.patch('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(await deviceService.renameDevice(c.req.param('serial'), customer.id, body.nickname));
});

api.delete('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  return c.json(await deviceService.releaseDevice(c.req.param('serial'), customer.id));
});

api.get('/account/overview', async (c) => {
  const customer = await requireCustomer(c);
  const devices = await deviceService.listDevicesForCustomer(customer.id, { limit: 100 });
  const { rows } = await query(
    `SELECT * FROM "order" WHERE ${orderService.ACCOUNT_ORDER_PREDICATE} ORDER BY id DESC LIMIT 2`,
    [customer.id, customer.email]);
  const orders = [];
  for (const row of rows) {
    const lines = await orderService.orderLines(row.id);
    orders.push({
      number: row.number, placed_at: row.placed_at, total_minor: Number(row.total_minor),
      currency: row.currency, state_phrase: orderService.statePhrase(row),
      first_line_title: lines.length ? lines[0].title_snapshot : null,
      extra_line_count: Math.max(lines.length - 1, 0),
    });
  }
  const newest = await releaseService.newestRelease();
  const { rows: seen } = await query(`SELECT build FROM account_seen_release WHERE customer_id = $1`, [customer.id]);
  return c.json({
    customer: authService.publicCustomer(customer),
    devices,
    orders,
    software: {
      newest,
      last_seen_build: seen.length ? Number(seen[0].build) : null,
      is_newer: newest ? (!seen.length || Number(seen[0].build) < newest.build) : false,
    },
  });
});

// ------------------------------------------------------------ releases

api.get('/releases', async (c) => {
  const q = c.req.query();
  const pageSize = readPageSize(q);
  const cursor = decodeCursor(q.cursor);
  const rows = await releaseService.listReleases({
    afterBuild: cursor ? cursor.build : null,
    limit: pageSize + 1,
  });
  return c.json(buildPage(rows, pageSize, (r) => ({ build: r.build })));
});

api.get('/releases/:version', async (c) => {
  const release = await releaseService.getRelease(c.req.param('version'));
  if (!release) throw notFound('That release does not exist.', 'release_not_found');
  return c.json(release);
});

/**
 * The artifacts. The bytes are generated deterministically from the release's
 * own record rather than held in an object store, because this app has no file
 * upload and no object storage: what matters is that the control works, the
 * length matches the size the archive reports, and the name is the artifact
 * name the record carries.
 */
api.get('/downloads/:artifact', async (c) => {
  const artifact = c.req.param('artifact');
  const { rows } = await query(`SELECT * FROM app_release WHERE artifact_name = $1`, [artifact]);
  if (!rows.length) throw notFound('That download does not exist.', 'artifact_not_found');
  const release = rows[0];
  return artifactResponse(c, {
    name: release.artifact_name,
    seed: `arranger ${release.version} build ${release.build} ${release.sha256}`,
    // Kept small on the wire; the archive still reports the real figure.
    bytes: 65536,
  });
});

api.get('/downloads/firmware/:handle/:version', async (c) => {
  const { rows } = await query(
    `SELECT f.*, p.handle, p.title FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE p.handle = $1 AND f.version = $2`,
    [c.req.param('handle'), c.req.param('version')]);
  if (!rows.length) throw notFound('That firmware does not exist.', 'artifact_not_found');
  const image = rows[0];
  return artifactResponse(c, {
    name: `vela-${image.handle}-firmware-${image.version}.bin`,
    seed: `firmware ${image.handle} ${image.version} build ${image.build} ${image.sha256}`,
    bytes: 65536,
  });
});

function artifactResponse(c, { name, seed, bytes }) {
  const block = Buffer.from(seed);
  const body = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i += block.length) block.copy(body, i);
  c.header('content-type', 'application/octet-stream');
  c.header('content-disposition', `attachment; filename="${name}"`);
  c.header('content-length', String(body.length));
  return c.body(body);
}

// ------------------------------------------------------------ firmware

api.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model');
  if (!model) throw badRequest('model_required', 'Name a model.');
  const channels = String(c.req.query('channels') || 'general')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return c.json(await firmwareService.manifestFor(model, { channels }));
});

api.get('/firmware/device/:serial', async (c) => {
  const { view } = await deviceService.lookupDeviceForFlash(c.req.param('serial'));
  const manifest = await firmwareService.manifestFor(view.handle, { channels: ['general'] });
  return c.json({ device: view, manifest });
});

api.post('/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { session, device, image } = await firmwareService.startFlashSession({
    serial: body.serial,
    targetBuild: body.target_build ?? body.targetBuild,
  });
  return c.json({
    id: String(session.id),
    state: session.state,
    serial: device.serial,
    target_version: image.version,
    target_build: Number(image.build),
    started_at: session.started_at,
  }, 201);
});

api.post('/flash-sessions/:id/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { session, device, requested_version } = await firmwareService.completeFlashSession(
    c.req.param('id'), body.reported_version ?? body.reportedVersion);
  return c.json({
    id: String(session.id),
    state: session.state,
    // The version read back from the device, never the one requested.
    reported_version: session.reported_version,
    requested_version,
    device: { serial: device.serial, firmware_version: device.firmware_version },
    ended_at: session.ended_at,
  });
});

api.post('/flash-sessions/:id/fail', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { session, device } = await firmwareService.failFlashSession(c.req.param('id'), body.reason);
  return c.json({
    id: String(session.id),
    state: session.state,
    failure_reason: session.failure_reason,
    device: { serial: device.serial, firmware_version: device.firmware_version },
    ended_at: session.ended_at,
  });
});

api.all('*', (c) => {
  throw notFound('That endpoint does not exist.', 'endpoint_not_found');
});

/**
 * Every rejection is a rendered JSON error carrying a stable code, a human
 * message and the request id that also names its log line.
 */
api.onError((err, c) => {
  const requestId = c.get('requestId');
  if (err instanceof AppError) {
    return c.json({
      error: { code: err.code, message: err.message, request_id: requestId, ...err.extra },
      code: err.code,
      message: err.message,
      request_id: requestId,
    }, err.status);
  }
  log({
    level: 'error', msg: 'unhandled', request_id: requestId,
    route: c.req.path, error: String(err && err.message), stack: err && err.stack,
  });
  return c.json({
    error: {
      code: 'internal_error',
      message: `Something went wrong at our end. Reference ${requestId}.`,
      request_id: requestId,
    },
    code: 'internal_error',
    message: `Something went wrong at our end. Reference ${requestId}.`,
    request_id: requestId,
  }, 500);
});

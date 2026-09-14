import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errors, errorBody, ApiError } from './errors.js';
import { parsePagination } from './pagination.js';
import { query, one, withTransaction } from './db.js';
import { verifyPassword, hashPassword, randomToken, sha256 } from './ids.js';
import { dollars } from './money.js';
import * as cartLib from './cart.js';
import * as ordersLib from './orders.js';
import * as productsLib from './products.js';
import * as releasesLib from './releases.js';
import * as devicesLib from './devices.js';
import { TOKEN_TTL_HOURS } from './auth.js';

const api = new Hono().basePath('/api');

/* ---------- request id and structured logging ---------- */
api.use('*', async (c, next) => {
  c.set('requestId', c.req.header('x-request-id') || randomToken(12));
  const start = Date.now();
  try {
    await next();
  } finally {
    try {
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'request',
          request_id: c.get('requestId'),
          method: c.req.method,
          route: c.req.path,
          status: c.res ? c.res.status : 0,
          elapsed_ms: Date.now() - start,
        })
      );
    } catch { /* logging must never break a response */ }
  }
});

function fail(c, err) {
  const status = err instanceof ApiError ? err.status : err.status || 500;
  const body = errorBody(status >= 500 ? new Error('Something went wrong at our end.') : err, c.get('requestId'));
  if (status >= 500) {
    console.log(JSON.stringify({
      level: 'error', msg: 'handler_error', request_id: c.get('requestId'),
      error: String((err && err.message) || err),
    }));
  }
  return c.json(body, status);
}

function list(c, data, has_more, next_cursor) {
  return c.json({ data, has_more, next_cursor, request_id: c.get('requestId') });
}

/* ---------- health ---------- */
api.get('/health', (c) => c.json({ status: 'ok' }));

/* ---------- auth ---------- */
api.post('/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  if (!email) throw errors.required('Email');
  if (!password) throw errors.required('Password');
  if (!name) throw errors.required('Name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw errors.validation('Email is not a valid address.');
  if (password.length < 8) throw errors.validation('Password must be at least 8 characters.');
  const existing = await one(`SELECT id FROM customer WHERE lower(email) = $1`, [email]);
  if (existing) throw Object.assign(new ApiError(409, 'email_taken', 'That address is already registered.'), { status: 409 });
  const customer = (
    await query(
      `INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3) RETURNING *`,
      [email, name, hashPassword(password)]
    )
  ).rows[0];
  const token = await issueToken(customer.id);
  return c.json({ access_token: token, customer: serializeCustomer(customer) });
});

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email) throw errors.required('Email');
  if (!password) throw errors.required('Password');
  const customer = await one(`SELECT * FROM customer WHERE lower(email) = $1`, [email]);
  if (!customer || !verifyPassword(password, customer.password_hash)) {
    throw errors.validation('That did not work. Check the address and the password.');
  }
  const token = await issueToken(customer.id);
  return c.json({ access_token: token, customer: serializeCustomer(customer) });
});

api.get('/auth/me', async (c) => {
  const customer = await customerFromRequest(c);
  if (!customer) throw errors.unauthorized('Your session has ended. Sign in again.');
  return c.json({ customer: serializeCustomer(customer) });
});

async function issueToken(customerId) {
  const token = randomToken(24);
  await query(
    `INSERT INTO auth_token (token_hash, customer_id, expires_at) VALUES ($1,$2, now() + ($3 || ' hours')::interval)`,
    [sha256(token), customerId, String(TOKEN_TTL_HOURS)]
  );
  return token;
}

export async function customerFromRequest(c) {
  const header = c.req.header('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const row = await one(
    `SELECT c.* FROM auth_token t JOIN customer c ON c.id = t.customer_id
     WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha256(m[1])]
  );
  return row || null;
}

export function serializeCustomer(cu) {
  return {
    id: cu.id,
    email: cu.email,
    name: cu.name,
    status: cu.status,
    created_at: cu.created_at,
    last_seen_release_build: cu.last_seen_release_build ?? null,
  };
}

/* ---------- products ---------- */
api.get('/products', async (c) => {
  const { page_size } = parsePagination(c.req.query());
  const all = await productsLib.listProducts();
  const sliced = all.slice(0, page_size);
  return list(c, sliced.map((p) => productsLib.serializeProduct(p)), all.length > page_size, null);
});

api.get('/products/:handle', async (c) => {
  const handle = c.req.param('handle');
  const product = await productsLib.productByHandle(handle);
  if (!product) throw errors.notFound('That product does not exist.');
  const blocks = await productsLib.productBlocks(product.id);
  const wanted = c.req.query('variant');
  const serialised = productsLib.serializeProduct({ ...product, blocks });
  if (wanted) {
    const found = serialised.variants.find((v) => v.sku === wanted);
    if (found) serialised.selected_variant = found.sku;
  }
  return c.json({ ...serialised, request_id: c.get('requestId') });
});

/* ---------- cart ---------- */
function cartTokenFrom(c) {
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)vela_cart=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function cartFrom(c) {
  let token = cartTokenFrom(c);
  let created = false;
  if (!token) {
    token = randomToken(18);
    created = true;
  }
  const customer = await customerFromRequest(c).catch(() => null);
  const cart = await cartLib.getOrCreateCart(token, customer ? customer.id : null);
  return { cart, token, created, customer };
}

function respondCart(c, serialized, token) {
  c.header('Set-Cookie', `vela_cart=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return c.json({ ...serialized, request_id: c.get('requestId') });
}

api.get('/cart', async (c) => {
  const { cart, token } = await cartFrom(c);
  return respondCart(c, await cartLib.serializeCart(cart), token);
});

api.post('/cart/lines', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart, token } = await cartFrom(c);
  const serialized = await cartLib.addLine(cart, body.sku, Number(body.quantity ?? 1));
  return respondCart(c, serialized, token);
});

api.patch('/cart/lines/:lineId', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart, token } = await cartFrom(c);
  const serialized = await cartLib.setLineQuantity(cart, Number(c.req.param('lineId')), Number(body.quantity));
  return respondCart(c, serialized, token);
});

api.delete('/cart/lines/:lineId', async (c) => {
  const { cart, token } = await cartFrom(c);
  const serialized = await cartLib.removeLine(cart, Number(c.req.param('lineId')));
  return respondCart(c, serialized, token);
});

api.post('/cart/protection', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart, token } = await cartFrom(c);
  const serialized = await cartLib.setProtection(cart, Boolean(body.enabled));
  return respondCart(c, serialized, token);
});

api.post('/cart/delivery', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart, token } = await cartFrom(c);
  const address = body.shipping_address || null;
  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : cart.email;
  const method = body.shipping_method !== undefined ? body.shipping_method : cart.shipping_method;

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw errors.validation('Email is not a valid address.');
  }
  if (!email) throw errors.required('Email');

  if (address) {
    for (const field of ['name', 'line1', 'city', 'postal_code', 'country']) {
      if (!String(address[field] || '').trim()) throw errors.required(labelFor(field));
    }
  }
  if (method !== null && method !== undefined && !(method in cartLib.SHIPPING_METHODS)) {
    throw errors.validation('Choose a delivery method.');
  }

  const serialized = await cartLib.setDelivery(cart, { email, shipping_address: address, shipping_method: method });
  return respondCart(c, serialized, token);
});

function labelFor(field) {
  return { name: 'Name', line1: 'Address', city: 'City', postal_code: 'Postal code', country: 'Country' }[field] || field;
}

/* ---------- orders ---------- */
api.post('/orders', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart, token } = await cartFrom(c);
  const customer = await customerFromRequest(c).catch(() => null);
  const idempotencyKey = c.req.header('idempotency-key') || null;
  const result = await ordersLib.placeOrder({ cart, customer, idempotencyKey, requestId: c.get('requestId') });
  c.header('Set-Cookie', `vela_cart=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return c.json({ ...result, request_id: c.get('requestId') });
});

api.get('/orders/:number', async (c) => {
  const number = c.req.param('number');
  const accessToken = c.req.query('access_token');
  const customer = await customerFromRequest(c).catch(() => null);
  const order = await ordersLib.orderByNumber(number);
  if (!order) throw errors.notFound('That order does not exist.');
  if (customer && order.customer_id && order.customer_id === customer.id) {
    return c.json({ ...await ordersLib.serializeOrder(order), request_id: c.get('requestId') });
  }
  if (!accessToken) throw errors.unauthorized('That order needs its access link.');
  if (sha256(accessToken) !== order.access_token_hash) throw errors.notFound('That order does not exist.');
  return c.json({ ...(await ordersLib.serializeOrder(order)), request_id: c.get('requestId') });
});

/* ---------- account ---------- */
async function requireAuth(c) {
  const customer = await customerFromRequest(c).catch(() => null);
  if (!customer) throw errors.unauthorized('Your session has ended. Sign in again.');
  return customer;
}

api.get('/account/orders', async (c) => {
  const customer = await requireAuth(c);
  const { page_size } = parsePagination(c.req.query());
  const cursor = c.req.query('cursor');
  const result = await ordersLib.listOrdersForCustomer(customer.id, page_size, cursor);
  return list(c, result.data, result.has_more, result.next_cursor);
});

api.get('/account/orders/:number', async (c) => {
  const customer = await requireAuth(c);
  const order = await ordersLib.orderByNumber(c.req.param('number'));
  if (!order || !order.customer_id || order.customer_id !== customer.id) {
    throw errors.notFound('That order does not exist.');
  }
  return c.json({ ...(await ordersLib.serializeOrder(order)), request_id: c.get('requestId') });
});

api.get('/account/devices', async (c) => {
  const customer = await requireAuth(c);
  const { page_size } = parsePagination(c.req.query());
  const result = await devicesLib.listDevicesForCustomer(customer.id, page_size, c.req.query('cursor'));
  return list(c, result.data, result.has_more, result.next_cursor);
});

api.post('/account/devices', async (c) => {
  const customer = await requireAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const serial = String(body.serial || '').trim();
  if (!devicesLib.isValidSerial(serial)) {
    throw errors.validation(devicesLib.serialShapeMessage());
  }
  const outcome = await devicesLib.registerDevice({ serial, customerId: customer.id });
  if (outcome.notFound) throw errors.notFound('We do not recognise that serial number.');
  if (outcome.blocked) throw errors.validation('That camera is blocked. Contact support.');
  if (outcome.owned) throw errors.conflict('That camera is registered to someone else.');
  const device = await devicesLib.deviceWithOwner(serial);
  const latestFw = await devicesLib.latestFirmware(device.product_id);
  return c.json({
    ...devicesLib.serializeDevice(device, { latestFw }),
    request_id: c.get('requestId'),
  }, 201);
});

api.patch('/account/devices/:serial', async (c) => {
  const customer = await requireAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const nickname = String(body.nickname ?? '').trim();
  if (nickname.length > 60) throw errors.validation('Nickname is too long.');
  const device = await devicesLib.renameDevice({ serial: c.req.param('serial'), customerId: customer.id, nickname });
  const latestFw = await devicesLib.latestFirmware(device.product_id);
  return c.json({ ...devicesLib.serializeDevice(device, { latestFw }), request_id: c.get('requestId') });
});

api.delete('/account/devices/:serial', async (c) => {
  const customer = await requireAuth(c);
  const outcome = await devicesLib.releaseDevice({ serial: c.req.param('serial'), customerId: customer.id });
  if (outcome.notFound) throw errors.notFound('That camera does not exist.');
  if (outcome.forbidden) throw errors.notFound('That camera does not exist.');
  const device = await devicesLib.deviceWithOwner(c.req.param('serial'));
  const latestFw = device ? await devicesLib.latestFirmware(device.product_id) : null;
  return c.json({
    ...(device ? devicesLib.serializeDevice(device, { latestFw }) : { serial: c.req.param('serial') }),
    request_id: c.get('requestId'),
  });
});

/* ---------- releases ---------- */
api.get('/releases', async (c) => {
  const { page_size } = parsePagination(c.req.query());
  const cursor = c.req.query('cursor');
  const result = await releasesLib.releasesPage(page_size, cursor);
  return list(c, result.data, result.has_more, result.next_cursor);
});

api.get('/releases/:version', async (c) => {
  const release = await releasesLib.releaseByVersion(c.req.param('version'));
  if (!release) throw errors.notFound('That release does not exist.');
  return c.json({ ...releasesLib.serializeRelease(release), request_id: c.get('requestId') });
});

/* ---------- firmware ---------- */
api.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model');
  if (!model) throw errors.required('Model');
  const product = await productsLib.productByHandle(model);
  if (!product) throw errors.notFound('That product does not exist.');
  const entries = await devicesLib.firmwareForProduct(product.id);
  return c.json({
    product: product.title,
    generated_at: new Date().toISOString(),
    entries: entries.map((f) => ({
      version: f.version,
      build: f.build,
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: Number(f.size_bytes),
      sha256: f.sha256,
    })),
    request_id: c.get('requestId'),
  });
});

/* ---------- flash sessions ---------- */
api.post('/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serial = String(body.serial || '').trim();
  const targetBuild = Number(body.target_build);
  if (!devicesLib.isValidSerial(serial)) throw errors.validation(devicesLib.serialShapeMessage());
  if (!Number.isInteger(targetBuild)) throw errors.required('Target build');
  const outcome = await devicesLib.startFlashSession({ serial, targetBuild });
  if (outcome.notFound) throw errors.notFound('We do not recognise that serial number.');
  if (outcome.wrongProduct) throw errors.validation('That image belongs to another product.');
  if (outcome.belowMinimum) throw errors.validation(`That image needs firmware ${outcome.needs} or later. Your camera reports ${outcome.has}.`);
  if (outcome.busy) throw errors.conflict('A write is already running on that camera.');
  return c.json({ ...outcome.session, request_id: c.get('requestId') }, 201);
});

api.post('/flash-sessions/:id/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const reported = String(body.reported_version || '').trim();
  if (!reported) throw errors.required('Reported version');
  const outcome = await devicesLib.completeFlashSession(Number(c.req.param('id')), reported);
  if (outcome.notFound) throw errors.notFound('That session does not exist.');
  if (outcome.wrongState) throw errors.validation('That session has already ended.');
  return c.json({ ...outcome.session, request_id: c.get('requestId') });
});

api.post('/flash-sessions/:id/fail', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const outcome = await devicesLib.failFlashSession(Number(c.req.param('id')), String(body.reason || '').slice(0, 200));
  if (outcome.notFound) throw errors.notFound('That session does not exist.');
  if (outcome.wrongState) throw errors.validation('That session has already ended.');
  return c.json({ ...outcome.session, request_id: c.get('requestId') });
});

/* ---------- downloads ---------- */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ARTIFACT_DIR = process.env.ARTIFACT_DIR
  ? resolve(process.env.ARTIFACT_DIR)
  : join(ROOT, '.downloads-cache');

function artifactResponse(name) {
  const clean = String(name).replace(/[^A-Za-z0-9._-]/g, '');
  const path = join(ARTIFACT_DIR, clean);
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${clean}"`,
      'Content-Length': String(buf.length),
    },
  });
}

api.get('/releases/artifact/:version', async (c) => {
  const release = await releasesLib.releaseByVersion(c.req.param('version'));
  if (!release) throw errors.notFound('That release does not exist.');
  const res = artifactResponse(release.artifact_name);
  if (!res) throw errors.notFound('That download is not available.');
  return res;
});

api.get('/firmware/artifact/:handle/:build', async (c) => {
  const product = await productsLib.productByHandle(c.req.param('handle'));
  if (!product) throw errors.notFound('That product does not exist.');
  const r = await query(`SELECT * FROM firmware WHERE product_id = $1 AND build = $2`, [
    product.id,
    Number(c.req.param('build')),
  ]);
  const fw = r.rows[0];
  if (!fw) throw errors.notFound('That firmware does not exist.');
  const res = artifactResponse(fw.artifact_name || `vela-${product.handle}-${fw.version}.fw`);
  if (!res) throw errors.notFound('That download is not available.');
  return res;
});

api.onError((err, c) => fail(c, err));
api.notFound((c) => fail(c, errors.notFound('That page does not exist.')));

export default api;


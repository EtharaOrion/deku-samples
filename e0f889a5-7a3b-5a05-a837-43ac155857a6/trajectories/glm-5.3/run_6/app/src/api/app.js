import { Hono } from 'hono';
import { errors, ApiError, errorBody } from '../lib/errors.js';
import { parsePageSize, page } from '../lib/pagination.js';
import { listProducts, getProduct } from '../lib/catalog.js';
import {
  ensureCart, findCartByToken, readCart, addLine, updateLine, removeLine,
  setProtection, setDelivery, newCartToken
} from '../lib/cart.js';
import { placeOrder, readOrder, listOrdersForCustomer } from '../lib/orders.js';
import { signup, login, customerFromToken, shape } from '../lib/customers.js';
import { listDevicesForCustomer, registerDevice, releaseDevice, renameDevice, deviceForCustomer } from '../lib/devices.js';
import { listReleases, getRelease, manifestForModel, startFlashSession, completeFlashSession, failFlashSession } from '../lib/firmware.js';
import { paymentsHealthy } from '../lib/billing.js';
import { logRequest, newRequestId } from '../lib/log.js';
import { ensureReady } from '../lib/seed.js';

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

const app = new Hono();

// --- middleware: request identifier, structured log line, cart cookie ---

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || newRequestId();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  const startedAt = Date.now();
  await next();
  const route = new URL(c.req.url).pathname;
  logRequest({
    requestId, method: c.req.method, route, status: c.res.status, startedAt
  });
});

app.onError((err, c) => {
  const requestId = c.get('requestId') || newRequestId();
  if (err instanceof ApiError) {
    return c.json(errorBody(err, requestId), err.status);
  }
  console.error(JSON.stringify({ level: 'error', event: 'api.unhandled', request_id: requestId, error: err.message, stack: err.stack }));
  const e = errors.internal();
  return c.json(errorBody({ ...e, message: `Something went wrong at our end. Reference ${requestId}.` }, requestId), 500);
});

app.notFound((c) => {
  const requestId = c.get('requestId') || newRequestId();
  return c.json(errorBody(errors.notFound(), requestId), 404);
});

// --- helpers ---

function bearer(c) {
  const header = c.req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function currentCustomer(c) {
  const token = bearer(c) || getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return customerFromToken(token);
}

function getCookie(c, name) {
  const cookie = c.req.header('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookieHeader(c, name, value, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  const existing = c.res.headers.getSetCookie?.() || [];
  c.res.headers.delete('set-cookie');
  existing.push(parts.join('; '));
  for (const one of existing) c.res.headers.append('set-cookie', one);
}

async function requireCustomer(c) {
  const customer = await currentCustomer(c);
  if (!customer) {
    throw errors.unauthorized('Sign in to continue.', 'unauthorized');
  }
  return customer;
}

async function cartFor(c, { create = true } = {}) {
  const token = getCookie(c, CART_COOKIE);
  const customer = await currentCustomer(c);
  const existing = token ? await findCartByToken(token) : null;
  if (existing) {
    if (customer && existing.customerId !== customer.id) {
      const { db } = await import('../lib/db.js');
      await db()`UPDATE cart SET customer_id = ${customer.id} WHERE id = ${existing.id}`;
      existing.customerId = customer.id;
    }
    return { cart: existing, created: false };
  }
  if (!create) return { cart: null, created: false };
  const newToken = newCartToken();
  const cart = await ensureCart(newToken, { customerId: customer ? customer.id : null });
  setCookieHeader(c, CART_COOKIE, newToken, 60 * 60 * 24 * 30);
  return { cart, created: true };
}

function cursorParams(c) {
  const query = c.req.query();
  const pageSize = parsePageSize(query);
  // The cursor travels encoded and is decoded once, inside the list query.
  return { pageSize, cursor: query.cursor };
}

// --- health ---

app.get('/health', async (c) => {
  await ensureReady();
  return c.json({ status: 'ok', ready: true });
});

// --- auth ---

app.post('/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await signup(body);
  setCookieHeader(c, SESSION_COOKIE, result.access_token, 60 * 60 * 24 * 14);
  return c.json(result, 201);
});

app.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await login(body);
  setCookieHeader(c, SESSION_COOKIE, result.access_token, 60 * 60 * 24 * 14);
  return c.json(result);
});

app.post('/auth/logout', (c) => {
  setCookieHeader(c, SESSION_COOKIE, '', 0);
  return c.json({ ok: true });
});

app.get('/auth/me', async (c) => {
  const customer = await requireCustomer(c);
  return c.json({ customer: shape(customer) });
});

// --- products ---

app.get('/products', async (c) => {
  const { pageSize, cursor } = cursorParams(c);
  const result = await listProducts({ pageSize, cursor });
  return c.json(page(result.data, { hasMore: result.hasMore, nextCursor: result.nextCursor }));
});

app.get('/products/:handle', async (c) => {
  const handle = c.req.param('handle');
  const product = await getProduct(handle, { variantSku: c.req.query('variant') });
  if (!product) throw errors.notFound('That page does not exist.', 'product_not_found');
  return c.json(product);
});

// --- cart ---

app.get('/cart', async (c) => {
  const { cart } = await cartFor(c);
  if (!cart) return c.json(emptyCart());
  return c.json(await readCart(cart, { markSeen: true }));
});

app.post('/cart/lines', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart } = await cartFor(c);
  await addLine(cart, body.sku, body.quantity === undefined ? 1 : body.quantity);
  return c.json(await readCart(await findCartByToken(cart.token)));
});

app.patch('/cart/lines/:lineId', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart } = await cartFor(c);
  await updateLine(cart, c.req.param('lineId'), body.quantity);
  return c.json(await readCart(await findCartByToken(cart.token)));
});

app.delete('/cart/lines/:lineId', async (c) => {
  const { cart } = await cartFor(c);
  await removeLine(cart, c.req.param('lineId'));
  return c.json(await readCart(await findCartByToken(cart.token)));
});

app.post('/cart/protection', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart } = await cartFor(c);
  await setProtection(cart, body.enabled);
  return c.json(await readCart(await findCartByToken(cart.token)));
});

app.post('/cart/delivery', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart } = await cartFor(c);
  await setDelivery(cart, {
    email: body.email,
    shippingAddress: body.shipping_address,
    shippingMethod: body.shipping_method
  });
  return c.json(await readCart(await findCartByToken(cart.token)));
});

// --- orders ---

app.post('/orders', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { cart } = await cartFor(c);
  if (!cart) throw errors.badRequest('Your cart is empty.', 'empty_cart');
  const idempotencyKey = c.req.header('idempotency-key') || body.idempotency_key || null;
  const result = await placeOrder({
    cart: await findCartByToken(cart.token),
    idempotencyKey,
    expectedTotalMinor: body.expected_total_minor
  });
  setCookieHeader(c, CART_COOKIE, cart.token, 0);
  return c.json(
    {
      number: result.order.number,
      total_minor: Number(result.order.totalMinor),
      currency: result.order.currency,
      status: result.order.status,
      killbill_external_key: result.order.killbillExternalKey,
      killbill_invoice_amount: result.order.killbillInvoiceAmount,
      access_token: result.access_token,
      replayed: result.replayed
    },
    result.replayed ? 200 : 201
  );
});

app.get('/orders/:number', async (c) => {
  const number = c.req.param('number');
  const customer = await currentCustomer(c);
  const token = c.req.query('access_token') || c.req.query('token');
  const order = await readOrder(number, {
    accessToken: token,
    customerId: customer ? customer.id : null
  });
  return c.json(order);
});

// --- account ---

app.get('/account/orders', async (c) => {
  const customer = await requireCustomer(c);
  const { pageSize, cursor } = cursorParams(c);
  const result = await listOrdersForCustomer(customer.id, { pageSize, cursor });
  return c.json(page(result.data, { hasMore: result.hasMore, nextCursor: result.nextCursor }));
});

app.get('/account/orders/:number', async (c) => {
  const customer = await requireCustomer(c);
  const order = await readOrder(c.req.param('number'), { customerId: customer.id });
  return c.json(order);
});

app.get('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const { pageSize, cursor } = cursorParams(c);
  const result = await listDevicesForCustomer(customer.id, { pageSize, cursor });
  return c.json(page(result.data, { hasMore: result.hasMore, nextCursor: result.nextCursor }));
});

app.post('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const body = await c.req.json().catch(() => ({}));
  const ownership = await registerDevice(customer.id, body.serial);
  const device = await deviceForCustomer(customer.id, body.serial);
  return c.json(
    {
      serial: device.serial,
      model: device.model,
      nickname: device.nickname,
      firmware_version: device.firmwareVersion,
      warranty_until: device.warrantyUntil,
      update_available: true,
      ownership_id: ownership.id
    },
    201
  );
});

app.patch('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const body = await c.req.json().catch(() => ({}));
  const device = await renameDevice(customer.id, c.req.param('serial'), body.nickname);
  return c.json({
    serial: device.serial,
    model: device.model,
    nickname: device.nickname,
    firmware_version: device.firmwareVersion
  });
});

app.delete('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const device = await releaseDevice(customer.id, c.req.param('serial'));
  return c.json({ serial: device.serial, released: true });
});

// --- releases and firmware ---

app.get('/releases', async (c) => {
  const { pageSize, cursor } = cursorParams(c);
  const result = await listReleases({ pageSize, cursor });
  return c.json(page(result.data, { hasMore: result.hasMore, nextCursor: result.nextCursor }));
});

app.get('/releases/:version', async (c) => {
  const release = await getRelease(c.req.param('version'));
  if (!release) throw errors.notFound('That release does not exist.', 'release_not_found');
  return c.json(release);
});

app.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model');
  if (!model) throw errors.badRequest('Name the model.', 'model_required');
  return c.json(await manifestForModel(model));
});

app.post('/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const session = await startFlashSession({ serial: body.serial, targetBuild: body.target_build });
  return c.json(session, 201);
});

app.post('/flash-sessions/:id/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await completeFlashSession(c.req.param('id'), body.reported_version));
});

app.post('/flash-sessions/:id/fail', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await failFlashSession(c.req.param('id'), body.reason));
});

function emptyCart() {
  return {
    token: null, email: null, customer_id: null, lines: [], item_count: 0,
    subtotal_minor: 0, protection: { enabled: false, rung: null, price_minor: 0, price_display: null },
    shipping_minor: null, tax_minor: null, total_minor: null, notices: [],
    shipping_address: null, shipping_method: null, shipping_methods: null
  };
}

// The API is served on the same origin under the /api prefix.
const mounted = new Hono();
mounted.route('/api', app);

export default mounted;

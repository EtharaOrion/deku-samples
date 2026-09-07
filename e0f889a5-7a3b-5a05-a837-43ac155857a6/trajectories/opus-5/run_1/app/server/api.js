import { Hono } from 'hono';
import { AppError, badRequest, notFound, unauthorized } from './lib/errors.js';
import { requestId as newRequestId } from './lib/crypto.js';
import { log, error as logError } from './lib/log.js';
import { readPageSize, decodeCursor, encodeCursor } from './lib/pagination.js';
import { customerForToken, login, signup, signOut } from './services/auth.js';
import { getProduct, listProducts } from './services/catalogue.js';
import * as carts from './services/cart.js';
import * as orders from './services/orders.js';
import * as devices from './services/devices.js';
import * as firmware from './services/firmware.js';
import { pool } from './db.js';
import { SHIPPING_METHODS } from './seed.js';
import { healthy as billingHealthy } from './services/killbill.js';

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

const cursorOut = (c) => (c ? encodeCursor(c) : null);

export function createApi() {
  const api = new Hono();

  api.use('*', async (c, next) => {
    const started = Date.now();
    const rid = c.req.header('x-request-id') || newRequestId();
    c.set('requestId', rid);
    c.header('x-request-id', rid);
    try {
      await next();
    } finally {
      // One line of JSON per request, carrying the request identifier.
      log({
        level: 'info',
        msg: 'request',
        request_id: rid,
        method: c.req.method,
        route: new URL(c.req.url).pathname,
        status: c.res?.status ?? 0,
        duration_ms: Date.now() - started,
      });
    }
  });

  api.onError((err, c) => {
    const rid = c.get('requestId') || newRequestId();
    if (err instanceof AppError) {
      return c.json({ code: err.code, message: err.message, request_id: rid, ...err.extra }, err.status);
    }
    logError('unhandled_error', { request_id: rid, error: String(err && err.stack ? err.stack : err) });
    return c.json(
      { code: 'internal_error', message: `Something went wrong at our end. Reference ${rid}.`, request_id: rid },
      500,
    );
  });

  api.notFound((c) =>
    c.json({ code: 'not_found', message: 'That page does not exist.', request_id: c.get('requestId') }, 404));

  // ---- health -------------------------------------------------------------
  api.get('/health', async (c) => {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok', request_id: c.get('requestId') });
  });

  api.get('/health/deep', async (c) => {
    const [db, billing] = await Promise.all([
      pool.query('SELECT 1').then(() => true).catch(() => false),
      billingHealthy().catch(() => false),
    ]);
    return c.json({ status: db ? 'ok' : 'degraded', database: db, billing, request_id: c.get('requestId') });
  });

  // ---- auth ---------------------------------------------------------------
  const bearer = (c) => {
    const header = c.req.header('authorization') || '';
    if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
    return readCookie(c, SESSION_COOKIE);
  };

  const requireCustomer = async (c) => {
    const customer = await customerForToken(bearer(c));
    if (!customer) throw unauthorized('Sign in to continue.', 'unauthorized');
    return customer;
  };

  api.post('/auth/signup', async (c) => {
    const body = await readJson(c);
    const out = await signup(body);
    setSessionCookie(c, out.access_token);
    return c.json(out, 201);
  });

  api.post('/auth/login', async (c) => {
    const body = await readJson(c);
    const out = await login(body);
    setSessionCookie(c, out.access_token);
    return c.json(out);
  });

  api.post('/auth/logout', async (c) => {
    await signOut(bearer(c));
    clearCookie(c, SESSION_COOKIE);
    return c.json({ ok: true });
  });

  api.get('/auth/me', async (c) => {
    const customer = await requireCustomer(c);
    return c.json({ customer });
  });

  // ---- catalogue ----------------------------------------------------------
  api.get('/products', async (c) => {
    const q = c.req.query();
    const pageSize = readPageSize(q);
    const cursor = decodeCursor(q.cursor);
    const out = await listProducts({ pageSize, cursor });
    return c.json({ data: out.data, next_cursor: cursorOut(out.next_cursor), has_more: out.has_more });
  });

  api.get('/products/:handle', async (c) => {
    const product = await getProduct(c.req.param('handle'));
    const wanted = c.req.query('variant');
    // A parameter naming a variant that does not exist renders the default.
    const selected = product.variants.find((v) => v.sku.toLowerCase() === String(wanted || '').toLowerCase())
      || product.variants[0] || null;
    return c.json({ ...product, selected_sku: selected ? selected.sku : null });
  });

  api.get('/shipping-methods', (c) => c.json({ data: SHIPPING_METHODS, next_cursor: null, has_more: false }));

  // ---- cart ---------------------------------------------------------------
  const cartFor = async (c, { create = false } = {}) => {
    const customer = await customerForToken(bearer(c));
    const row = await carts.cartByToken(readCookie(c, CART_COOKIE), { create, customerId: customer?.id ?? null });
    if (!row) return { row: null, customer };
    if (row.token !== readCookie(c, CART_COOKIE)) setCartCookie(c, row.token);
    return { row, customer };
  };

  api.get('/cart', async (c) => {
    const { row } = await cartFor(c, { create: true });
    // This is a surface that displays the cart, so it records what it showed.
    return c.json(await carts.showCart(row));
  });

  api.post('/cart/lines', async (c) => {
    const body = await readJson(c);
    const { row } = await cartFor(c, { create: true });
    return c.json(await carts.addLine(row, body.sku, body.quantity ?? 1));
  });

  api.patch('/cart/lines/:id', async (c) => {
    const body = await readJson(c);
    const { row } = await cartFor(c);
    if (!row) throw notFound('Your cart is empty.', 'cart_not_found');
    return c.json(await carts.updateLine(row, c.req.param('id'), body.quantity));
  });

  api.delete('/cart/lines/:id', async (c) => {
    const { row } = await cartFor(c);
    if (!row) throw notFound('Your cart is empty.', 'cart_not_found');
    return c.json(await carts.removeLine(row, c.req.param('id')));
  });

  api.post('/cart/protection', async (c) => {
    const body = await readJson(c);
    const { row } = await cartFor(c, { create: true });
    return c.json(await carts.setProtection(row, body.enabled));
  });

  api.post('/cart/delivery', async (c) => {
    const body = await readJson(c);
    const { row } = await cartFor(c, { create: true });
    return c.json(await carts.setDelivery(row, body));
  });

  // ---- orders -------------------------------------------------------------
  api.post('/orders', async (c) => {
    const body = await readJson(c).catch(() => ({}));
    const key = c.req.header('idempotency-key') || body.idempotency_key || null;

    // A replayed key returns the order the first call returned, before the cart
    // is looked at, because that first call already emptied it.
    const replayed = await orders.orderForIdempotencyKey(key);
    if (replayed) {
      clearCookie(c, CART_COOKIE);
      return c.json(await orders.shapeOrder(replayed), 200);
    }

    const { row, customer } = await cartFor(c);
    if (!row) throw badRequest('cart_empty', 'Your cart is empty.');
    const result = await orders.placeOrder({
      cartRow: row,
      customerId: customer?.id ?? null,
      idempotencyKey: key,
      expectedTotalMinor: body.expected_total_minor ?? null,
    });
    const shaped = await orders.shapeOrder(result.order, { includeAccessToken: result.accessToken });
    if (result.accessToken) setOrderCookie(c, result.order.number, result.accessToken);
    clearCookie(c, CART_COOKIE);
    return c.json(shaped, result.replayed ? 200 : 201);
  });

  api.get('/orders/:number', async (c) => {
    const row = await orders.orderByNumber(c.req.param('number'));
    const token = c.req.query('access_token') || c.req.header('x-order-token') || readOrderCookie(c, c.req.param('number'));
    const customer = await customerForToken(bearer(c));
    const owned = row && customer && Number(row.customer_id) === Number(customer.id);
    // Another customer's order reads as not found, never as forbidden.
    if (!row || (!owned && !orders.accessTokenMatches(row, token))) {
      throw notFound('That order does not exist.', 'order_not_found');
    }
    return c.json(await orders.shapeOrder(row));
  });

  // ---- account ------------------------------------------------------------
  api.get('/account/orders', async (c) => {
    const customer = await requireCustomer(c);
    const q = c.req.query();
    const out = await orders.listCustomerOrders(customer.id, {
      pageSize: readPageSize(q), cursor: decodeCursor(q.cursor),
    });
    return c.json({ data: out.data, next_cursor: cursorOut(out.next_cursor), has_more: out.has_more });
  });

  api.get('/account/orders/:number', async (c) => {
    const customer = await requireCustomer(c);
    const row = await orders.orderByNumber(c.req.param('number'));
    if (!row || Number(row.customer_id) !== Number(customer.id)) {
      throw notFound('That order does not exist.', 'order_not_found');
    }
    return c.json(await orders.shapeOrder(row));
  });

  api.get('/account/devices', async (c) => {
    const customer = await requireCustomer(c);
    const q = c.req.query();
    const out = await devices.listCustomerDevices(customer.id, {
      pageSize: readPageSize(q), cursor: decodeCursor(q.cursor),
    });
    return c.json({ data: out.data, next_cursor: cursorOut(out.next_cursor), has_more: out.has_more });
  });

  api.post('/account/devices', async (c) => {
    const customer = await requireCustomer(c);
    const body = await readJson(c);
    const device = await devices.registerDevice(customer.id, body.serial);
    return c.json(device, 201);
  });

  api.get('/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    return c.json(await devices.readCustomerDevice(customer.id, c.req.param('serial')));
  });

  api.patch('/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    const body = await readJson(c);
    return c.json(await devices.renameDevice(customer.id, c.req.param('serial'), body.nickname));
  });

  api.delete('/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    return c.json(await devices.releaseDevice(customer.id, c.req.param('serial')));
  });

  // The installer needs to identify the camera in front of the reader. A camera
  // registered to somebody else, and one out of warranty, are both repaired, so
  // this names the model and the firmware only and never an owner.
  api.get('/devices/:serial/public', async (c) => {
    const row = await devices.publicDeviceForFlash(c.req.param('serial'));
    if (row.status === 'blocked') {
      throw new AppError(409, 'device_blocked', 'That camera is blocked. Write to us before going on.');
    }
    return c.json({
      serial: row.serial,
      model: row.model,
      handle: row.handle,
      firmware_version: row.firmware_version,
      firmware_reported_at: row.firmware_reported_at instanceof Date
        ? row.firmware_reported_at.toISOString() : row.firmware_reported_at,
    });
  });

  // ---- releases and firmware ---------------------------------------------
  api.get('/releases', async (c) => {
    const q = c.req.query();
    const out = await firmware.releases({ pageSize: readPageSize(q), cursor: decodeCursor(q.cursor) });
    return c.json({ data: out.data, next_cursor: cursorOut(out.next_cursor), has_more: out.has_more });
  });

  api.get('/releases/:version', async (c) => c.json(await firmware.releaseByVersion(c.req.param('version'))));

  // The artifact itself. This build ships no macOS binary, so what is served is
  // a short manifest naming the release, its size and its digest, under the
  // artifact's own filename. It is honest about what it is rather than
  // pretending to be the installer.
  api.get('/releases/:version/artifact', async (c) => {
    const release = await firmware.releaseByVersion(c.req.param('version'));
    const body = [
      `Arranger ${release.version}`,
      `Build ${release.build}`,
      `Released on ${release.released_on}`,
      `Artifact ${release.artifact_name}`,
      `Size ${release.size_bytes} bytes`,
      `SHA-256 ${release.sha256}`,
      '',
      'This deployment serves the release record rather than the macOS installer',
      'binary, which is not distributed with this build.',
      '',
    ].join('\n');
    c.header('content-type', 'text/plain; charset=utf-8');
    c.header('content-disposition', `attachment; filename="${release.artifact_name}.txt"`);
    return c.body(body);
  });

  api.get('/firmware/:build/artifact', async (c) => {
    const image = await firmware.imageByBuild(c.req.param('build'));
    const body = [
      `${image.product_title} firmware ${image.version}`,
      `Build ${image.build}`,
      `Channel ${image.channel}`,
      `Minimum firmware ${image.min_firmware || 'none'}`,
      `Minimum application ${image.min_app_version}`,
      `Size ${image.size_bytes} bytes`,
      `SHA-256 ${image.sha256}`,
      '',
      'This deployment serves the firmware record rather than the image itself,',
      'which is not distributed with this build.',
      '',
    ].join('\n');
    c.header('content-type', 'text/plain; charset=utf-8');
    c.header('content-disposition', `attachment; filename="vela-${image.product_handle}-firmware-${image.version}.txt"`);
    return c.body(body);
  });

  api.get('/firmware/manifest', async (c) => {
    const model = c.req.query('model');
    if (!model) throw badRequest('model_required', 'Name the model whose firmware you want.');
    const channels = String(c.req.query('channels') || '').split(',').map((s) => s.trim()).filter(Boolean);
    return c.json(await firmware.manifestFor(model, { channels }));
  });

  api.post('/flash-sessions', async (c) => {
    const body = await readJson(c);
    const session = await firmware.startSession({
      serial: body.serial,
      target_build: body.target_build,
      reported_version: body.reported_version,
    });
    return c.json(session, 201);
  });

  api.post('/flash-sessions/:id/complete', async (c) => {
    const body = await readJson(c);
    return c.json(await firmware.completeSession(c.req.param('id'), body.reported_version));
  });

  api.post('/flash-sessions/:id/fail', async (c) => {
    const body = await readJson(c);
    return c.json(await firmware.failSession(c.req.param('id'), body.reason));
  });

  return api;
}

// ---- helpers --------------------------------------------------------------

async function readJson(c) {
  const type = c.req.header('content-type') || '';
  if (type.includes('application/json')) {
    try {
      return (await c.req.json()) || {};
    } catch {
      throw badRequest('invalid_json', 'That did not work. The request body could not be read.');
    }
  }
  if (type.includes('form')) {
    const form = await c.req.parseBody();
    return form || {};
  }
  try {
    const text = await c.req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export function readCookie(c, name) {
  const raw = c.req.header('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function appendCookie(c, value) {
  c.header('set-cookie', value, { append: true });
}

export function setCartCookie(c, token) {
  appendCookie(c, `${CART_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
}

export function setSessionCookie(c, token) {
  appendCookie(c, `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=259200`);
}

export function clearCookie(c, name) {
  appendCookie(c, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function orderCookieName(number) {
  return `vela_order_${String(number).replace(/[^A-Za-z0-9]/g, '_')}`;
}

export function setOrderCookie(c, number, token) {
  appendCookie(c, `${orderCookieName(number)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
}

export function readOrderCookie(c, number) {
  return readCookie(c, orderCookieName(number));
}

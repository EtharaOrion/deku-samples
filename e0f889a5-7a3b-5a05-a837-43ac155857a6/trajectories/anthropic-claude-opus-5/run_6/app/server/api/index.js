import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { AppError, badRequest, notFound, unauthorized } from '../errors.js';
import { log, logRequest, newRequestId } from '../log.js';
import { pageSizeFrom, decodeCursor, page, readJson } from './support.js';
import * as auth from '../services/auth.js';
import * as catalogue from '../services/catalogue.js';
import * as cartService from '../services/cart.js';
import * as orderService from '../services/orders.js';
import * as deviceService from '../services/devices.js';
import * as firmwareService from '../services/firmware.js';
import * as killbill from '../killbill.js';
import { pool } from '../db.js';
import * as rateLimit from './ratelimit.js';

export const CART_COOKIE = 'vela_cart';
export const AUTH_COOKIE = 'vela_token';

const cookieOptions = { path: '/', httpOnly: false, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 };

function clientKey(c) {
  return (
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    (c.env && c.env.incoming && c.env.incoming.socket && c.env.incoming.socket.remoteAddress) ||
    'unknown'
  );
}

export function bearerFrom(c) {
  const header = c.req.header('authorization') || c.req.header('Authorization');
  if (header && /^bearer\s+/i.test(header)) return header.replace(/^bearer\s+/i, '').trim();
  return null;
}

async function currentCustomer(c) {
  const token = bearerFrom(c) || getCookie(c, AUTH_COOKIE);
  if (!token) return null;
  return auth.customerForToken(token);
}

async function requireCustomer(c) {
  const customer = await currentCustomer(c);
  if (!customer) throw unauthorized('Sign in to continue.');
  return customer;
}

async function cartFor(c, { create = true } = {}) {
  const token = c.req.header('x-cart-token') || getCookie(c, CART_COOKIE) || null;
  const customer = await currentCustomer(c);
  const existing = await cartService.cartByToken(token);
  if (existing) {
    if (customer && !existing.customer_id) {
      await pool.query('UPDATE cart SET customer_id = $2 WHERE id = $1', [existing.id, customer.id]);
      existing.customer_id = customer.id;
    }
    return existing;
  }
  if (!create) return null;
  const cart = await cartService.createCart(customer ? customer.id : null);
  setCookie(c, CART_COOKIE, cart.token, cookieOptions);
  return cart;
}

async function cartResponse(c, cart) {
  const view = await cartService.readCart(cart);
  setCookie(c, CART_COOKIE, cart.token, cookieOptions);
  return c.json(view);
}

export function createApi() {
  const api = new Hono().basePath('/api');

  api.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') || newRequestId();
    c.set('requestId', requestId);
    const started = Date.now();
    await next();
    c.header('X-Request-Id', requestId);
    logRequest({
      requestId,
      method: c.req.method,
      route: c.req.routePath && c.req.routePath !== '/*' ? c.req.routePath : new URL(c.req.url).pathname,
      status: c.res.status,
      elapsedMs: Date.now() - started,
      extra: { path: new URL(c.req.url).pathname, surface: 'api' },
    });
  });

  api.onError((err, c) => {
    const requestId = c.get('requestId') || newRequestId();
    if (err instanceof AppError) {
      log({
        level: err.status >= 500 ? 'error' : 'warn',
        request_id: requestId,
        msg: 'request refused',
        code: err.code,
        status: err.status,
        error: err.message,
      });
      return c.json(
        { code: err.code, message: err.message, request_id: requestId, ...(err.details ? { details: err.details } : {}) },
        err.status,
      );
    }
    log({ level: 'error', request_id: requestId, msg: 'unhandled error', error: String(err && err.stack) });
    return c.json(
      { code: 'internal_error', message: `Something went wrong at our end. Reference ${requestId}.`, request_id: requestId },
      500,
    );
  });

  api.notFound((c) => {
    const requestId = c.get('requestId') || newRequestId();
    return c.json({ code: 'not_found', message: 'That page does not exist.', request_id: requestId }, 404);
  });

  // ---- health -------------------------------------------------------------
  api.get('/health', async (c) => {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok', time: new Date().toISOString() });
  });

  api.get('/health/deep', async (c) => {
    const db = await pool.query('SELECT 1').then(() => true).catch(() => false);
    const billing = await killbill.healthy();
    return c.json({ status: db && billing ? 'ok' : 'degraded', database: db, billing }, db ? 200 : 503);
  });

  // ---- auth ---------------------------------------------------------------
  api.post('/auth/signup', async (c) => {
    const body = await readJson(c);
    rateLimit.take(`signup:${clientKey(c)}`);
    const result = await auth.signup(body);
    setCookie(c, AUTH_COOKIE, result.access_token, cookieOptions);
    return c.json(result, 201);
  });

  api.post('/auth/login', async (c) => {
    const body = await readJson(c);
    rateLimit.take(`login:${clientKey(c)}:${String(body.email || '').toLowerCase()}`);
    const result = await auth.login(body);
    setCookie(c, AUTH_COOKIE, result.access_token, cookieOptions);
    return c.json(result);
  });

  api.post('/auth/logout', async (c) => {
    const token = bearerFrom(c) || getCookie(c, AUTH_COOKIE);
    await auth.revokeToken(token);
    deleteCookie(c, AUTH_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  api.get('/auth/me', async (c) => {
    const customer = await requireCustomer(c);
    return c.json({ customer: auth.publicCustomer(customer) });
  });

  // ---- catalogue ----------------------------------------------------------
  api.get('/products', async (c) => page(c, await catalogue.listProducts({ pageSize: pageSizeFrom(c), cursor: decodeCursor(c) })));

  api.get('/products/:handle', async (c) => {
    const product = await catalogue.getProduct(c.req.param('handle'));
    const wanted = c.req.query('variant');
    const selected =
      (wanted && product.variants.find((v) => v.sku.toLowerCase() === String(wanted).toLowerCase())) ||
      product.variants[0] ||
      null;
    return c.json({ ...product, selected_sku: selected ? selected.sku : null, variant_known: Boolean(wanted && selected) });
  });

  // ---- cart ---------------------------------------------------------------
  api.get('/cart', async (c) => cartResponse(c, await cartFor(c)));

  api.post('/cart/lines', async (c) => {
    const body = await readJson(c);
    const cart = await cartFor(c);
    await cartService.addLine(cart, { sku: body.sku, quantity: body.quantity ?? 1 });
    return cartResponse(c, cart);
  });

  api.patch('/cart/lines/:lineId', async (c) => {
    const body = await readJson(c);
    const cart = await cartFor(c, { create: false });
    if (!cart) throw notFound('That line is not in your cart.');
    await cartService.updateLine(cart, c.req.param('lineId'), body.quantity);
    return cartResponse(c, cart);
  });

  api.delete('/cart/lines/:lineId', async (c) => {
    const cart = await cartFor(c, { create: false });
    if (!cart) throw notFound('That line is not in your cart.');
    await cartService.removeLine(cart, c.req.param('lineId'));
    return cartResponse(c, cart);
  });

  api.post('/cart/protection', async (c) => {
    const body = await readJson(c);
    const cart = await cartFor(c);
    await cartService.setProtection(cart, body.enabled === true || body.enabled === 'true');
    return cartResponse(c, cart);
  });

  api.post('/cart/delivery', async (c) => {
    const body = await readJson(c);
    const cart = await cartFor(c);
    await cartService.setDelivery(cart, body);
    const fresh = await cartService.cartByToken(cart.token);
    return cartResponse(c, fresh);
  });

  // ---- orders -------------------------------------------------------------
  api.post('/orders', async (c) => {
    const cart = await cartFor(c, { create: false });
    if (!cart) throw badRequest('empty_cart', 'Your cart is empty.');
    const customer = await currentCustomer(c);
    const key = c.req.header('idempotency-key') || c.req.header('Idempotency-Key') || null;
    const { order, accessToken, replayed } = await orderService.placeOrder({
      cart,
      customer,
      idempotencyKey: key,
      requestId: c.get('requestId'),
    });
    const body = await orderService.serialiseOrder(order, { includeAccessToken: accessToken });
    setCookie(c, `vela_order_${order.number}`, accessToken, cookieOptions);
    return c.json({ ...body, replayed }, replayed ? 200 : 201);
  });

  api.get('/orders/:number', async (c) => {
    const customer = await currentCustomer(c);
    const token =
      c.req.query('access_token') || c.req.header('x-order-token') || getCookie(c, `vela_order_${c.req.param('number')}`);
    const order = await orderService.requireReadableOrder({
      number: c.req.param('number'),
      accessToken: token,
      customer,
    });
    return c.json(await orderService.serialiseOrder(order));
  });

  // ---- account ------------------------------------------------------------
  api.get('/account/orders', async (c) => {
    const customer = await requireCustomer(c);
    return page(c, await orderService.listCustomerOrders({ customerId: customer.id, pageSize: pageSizeFrom(c), cursor: decodeCursor(c) }));
  });

  api.get('/account/orders/:number', async (c) => {
    const customer = await requireCustomer(c);
    const order = await orderService.requireReadableOrder({ number: c.req.param('number'), customer });
    return c.json(await orderService.serialiseOrder(order));
  });

  api.get('/account/devices', async (c) => {
    const customer = await requireCustomer(c);
    return page(c, await deviceService.listCustomerDevices({ customerId: customer.id, pageSize: pageSizeFrom(c), cursor: decodeCursor(c) }));
  });

  api.post('/account/devices', async (c) => {
    const customer = await requireCustomer(c);
    const body = await readJson(c);
    const { device, alreadyMine } = await deviceService.registerDevice({ customerId: customer.id, serial: body.serial });
    return c.json(await deviceService.serialiseDevice(device), alreadyMine ? 200 : 201);
  });

  api.get('/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    const device = await deviceService.customerDevice(customer.id, c.req.param('serial'));
    return c.json(await deviceService.serialiseDevice(device));
  });

  api.patch('/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    const body = await readJson(c);
    const device = await deviceService.renameDevice({
      customerId: customer.id,
      serial: c.req.param('serial'),
      nickname: body.nickname,
    });
    return c.json(await deviceService.serialiseDevice(device));
  });

  api.delete('/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    const device = await deviceService.releaseDevice({ customerId: customer.id, serial: c.req.param('serial') });
    return c.json(await deviceService.serialiseDevice(device));
  });

  // ---- releases and firmware ---------------------------------------------
  api.get('/releases', async (c) => page(c, await firmwareService.listReleases({ pageSize: pageSizeFrom(c), cursor: decodeCursor(c) })));
  api.get('/releases/:version', async (c) => c.json(await firmwareService.releaseByVersion(c.req.param('version'))));

  api.get('/firmware/manifest', async (c) => {
    const model = c.req.query('model');
    if (!model) throw badRequest('missing_model', 'Name a model.');
    const channels = (c.req.query('channels') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return c.json(await firmwareService.manifestFor({ model, channels }));
  });

  api.get('/firmware/lookup/:serial', async (c) => {
    const serial = c.req.param('serial');
    if (!deviceService.serialHasShape(serial)) {
      throw badRequest('invalid_serial', 'We do not recognise that serial number.');
    }
    const device = await deviceService.deviceBySerial(serial);
    if (!device) throw badRequest('unknown_serial', 'We do not recognise that serial number.');
    if (device.status === 'blocked') {
      throw badRequest('device_blocked', 'That camera is blocked. Write to us before going further.');
    }
    const { all, recommended } = await firmwareService.recommendedFor(device);
    return c.json({
      device: {
        serial: device.serial,
        model: device.product_title,
        variant: device.option_value,
        firmware_version: device.firmware_version,
      },
      recommended: recommended
        ? { build: recommended.build, version: recommended.version, size_bytes: Number(recommended.size_bytes) }
        : null,
      images: all.map((f) => ({
        build: f.build,
        version: f.version,
        min_firmware: f.min_firmware,
        size_bytes: Number(f.size_bytes),
        sha256: f.sha256,
      })),
    });
  });

  // ---- flash sessions -----------------------------------------------------
  api.post('/flash-sessions', async (c) => {
    const body = await readJson(c);
    const { session, device, image } = await firmwareService.startSession({
      serial: body.serial,
      targetBuild: body.target_build ?? body.build,
      reportedVersion: body.reported_version,
    });
    return c.json(
      {
        ...firmwareService.serialiseSession({
          ...session,
          serial: device.serial,
          target_version: image.version,
          target_build: image.build,
        }),
      },
      201,
    );
  });

  api.get('/flash-sessions/:id', async (c) => {
    const row = await firmwareService.sessionById(c.req.param('id'));
    if (!row) throw notFound('That session does not exist.');
    return c.json(firmwareService.serialiseSession(row));
  });

  api.post('/flash-sessions/:id/complete', async (c) => {
    const body = await readJson(c);
    const row = await firmwareService.completeSession({ id: c.req.param('id'), reportedVersion: body.reported_version });
    const device = await deviceService.deviceBySerial(row.serial);
    return c.json({ ...firmwareService.serialiseSession(row), device: await deviceService.serialiseDevice(device) });
  });

  api.post('/flash-sessions/:id/fail', async (c) => {
    const body = await readJson(c);
    const row = await firmwareService.failSession({ id: c.req.param('id'), reason: body.reason });
    const device = await deviceService.deviceBySerial(row.serial);
    return c.json({ ...firmwareService.serialiseSession(row), device: await deviceService.serialiseDevice(device) });
  });

  // ---- downloads (artifacts are generated, never fetched from anywhere) ----
  api.get('/downloads/arranger/:version', async (c) => {
    const release = await firmwareService.releaseByVersion(c.req.param('version'));
    return c.json({
      version: release.version,
      artifact_name: release.artifact_name,
      size_bytes: release.size_bytes,
      sha256: release.sha256,
      message: 'Arranger is a macOS application.',
    });
  });

  return api;
}

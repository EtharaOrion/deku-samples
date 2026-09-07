import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { one, many, query, pool } from './db.js';
import { AppError, badRequest, notFound, unauthorized, conflict } from './errors.js';
import { newRequestId, logLine } from './log.js';
import { bearerFrom, customerFromToken, login, signup, revokeToken } from './auth.js';
import * as catalogue from './catalogue.js';
import * as cartLib from './cart.js';
import * as orders from './orders.js';
import * as devices from './devices.js';
import { pageSizeFrom, decodeCursor, page } from './pagination.js';
import { formatMinor } from './money.js';

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

export function cookieOpts(maxAge) {
  return { path: '/', httpOnly: true, sameSite: 'Lax', maxAge, secure: false };
}

export async function currentCustomer(c) {
  const token = bearerFrom(c.req.header('authorization')) || getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return customerFromToken(token);
}

// Only a write creates a cart. A read never does, so rendering a page never
// mints a row, and the cart the reader holds is the one they filled.
export async function ensureCart(c) {
  const token = getCookie(c, CART_COOKIE);
  let row = await cartLib.cartByToken(token);
  if (!row) {
    const customer = await currentCustomer(c);
    row = await cartLib.createCart(customer?.id ?? null);
    setCookie(c, CART_COOKIE, row.token, cookieOpts(60 * 60 * 24 * 30));
    row = await cartLib.cartByToken(row.token);
  }
  return row;
}

export async function existingCart(c) {
  return cartLib.cartByToken(getCookie(c, CART_COOKIE));
}

const api = new Hono().basePath('/api');

api.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || newRequestId();
  c.set('requestId', requestId);
  const started = Date.now();
  await next();
  logLine({
    level: 'info',
    request_id: requestId,
    method: c.req.method,
    route: c.req.routePath || new URL(c.req.url).pathname,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    duration_ms: Date.now() - started,
  });
  c.res.headers.set('x-request-id', requestId);
});

api.onError((err, c) => {
  const requestId = c.get('requestId') || newRequestId();
  if (err instanceof AppError) {
    logLine({ level: 'warn', request_id: requestId, msg: 'client error', code: err.code, status: err.status, detail: err.message });
    return c.json({ code: err.code, message: err.message, request_id: requestId, ...err.extra }, err.status);
  }
  logLine({ level: 'error', request_id: requestId, msg: 'unhandled error', error: String(err && err.stack ? err.stack : err) });
  return c.json({
    code: 'internal_error',
    message: `Something went wrong at our end. Reference ${requestId}.`,
    request_id: requestId,
  }, 500);
});

api.notFound((c) => {
  const requestId = c.get('requestId') || newRequestId();
  return c.json({ code: 'not_found', message: 'That page does not exist.', request_id: requestId }, 404);
});

async function body(c) {
  try {
    const t = await c.req.text();
    if (!t) return {};
    return JSON.parse(t);
  } catch {
    throw badRequest('body_invalid', 'That did not work.');
  }
}

async function requireCustomer(c) {
  const customer = await currentCustomer(c);
  if (!customer) throw unauthorized('Sign in to continue.');
  return customer;
}

/* ---------------------------------------------------------------- health */

api.get('/health', async (c) => {
  await pool.query('SELECT 1');
  return c.json({ status: 'ok' });
});

/* ------------------------------------------------------------------ auth */

api.post('/auth/signup', async (c) => {
  const b = await body(c);
  const out = await signup(b);
  setCookie(c, SESSION_COOKIE, out.access_token, cookieOpts(60 * 60 * 12));
  return c.json(out, 201);
});

api.post('/auth/login', async (c) => {
  const b = await body(c);
  const out = await login(b);
  setCookie(c, SESSION_COOKIE, out.access_token, cookieOpts(60 * 60 * 12));
  return c.json(out);
});

api.post('/auth/logout', async (c) => {
  const token = bearerFrom(c.req.header('authorization')) || getCookie(c, SESSION_COOKIE);
  await revokeToken(token);
  setCookie(c, SESSION_COOKIE, '', cookieOpts(0));
  return c.json({ ok: true });
});

api.get('/auth/me', async (c) => {
  const customer = await requireCustomer(c);
  return c.json({ customer: { id: String(customer.id), email: customer.email, name: customer.name } });
});

/* -------------------------------------------------------------- products */

api.get('/products', async (c) => {
  const q = c.req.query();
  const limit = pageSizeFrom(q);
  const cursor = decodeCursor(q.cursor);
  const rows = await catalogue.listProducts({ limit, cursorPosition: cursor });
  return c.json(page(rows, limit, (r) => r.position));
});

api.get('/products/:handle', async (c) => {
  const p = await catalogue.productByHandle(c.req.param('handle'));
  if (!p || p.kind === 'protection') throw notFound('That page does not exist.');
  const wanted = c.req.query('variant');
  const selected = p.variants.find((v) => v.sku === wanted) ?? p.variants[0] ?? null;
  return c.json({ ...p, selected_sku: selected ? selected.sku : null });
});

api.get('/shipping-methods', async (c) => {
  return c.json({ data: await catalogue.shippingMethods(), next_cursor: null, has_more: false });
});

/* ------------------------------------------------------------------ cart */

// Reading a cart never creates one. An empty shape is the honest answer for a
// visitor who has not added anything yet.
api.get('/cart', async (c) => {
  const row = await existingCart(c);
  if (!row) return c.json(cartLib.emptyCart());
  return c.json(await cartLib.shapeCart(row));
});

api.post('/cart/lines', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await cartLib.addLine(row, b.sku, b.quantity ?? 1);
  return c.json(await cartLib.shapeCart(row), 201);
});

api.patch('/cart/lines/:id', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await cartLib.setLineQuantity(row, c.req.param('id'), b.quantity);
  return c.json(await cartLib.shapeCart(row));
});

api.delete('/cart/lines/:id', async (c) => {
  const row = await ensureCart(c);
  await cartLib.removeLine(row, c.req.param('id'));
  return c.json(await cartLib.shapeCart(row));
});

api.post('/cart/protection', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await cartLib.setProtection(row, !!b.enabled);
  const fresh = await cartLib.cartByToken(row.token);
  return c.json(await cartLib.shapeCart(fresh));
});

api.post('/cart/delivery', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await cartLib.setDelivery(row, b);
  const fresh = await cartLib.cartByToken(row.token);
  return c.json(await cartLib.shapeCart(fresh));
});

/* ---------------------------------------------------------------- orders */

api.post('/orders', async (c) => {
  const row = await ensureCart(c);
  const shaped = await cartLib.shapeCart(row);
  const customer = await currentCustomer(c);
  const idem = c.req.header('idempotency-key') || null;

  // If a line moved since the cart was last shown, the order is refused and the
  // person returns to a re-priced cart carrying that notice.
  const priceNotice = shaped.notices.find((n) => n.kind === 'price_changed');
  if (priceNotice) {
    throw new AppError(422, 'price_changed', priceNotice.message, {
      resource: priceNotice.sku,
      old_price_minor: priceNotice.old_price_minor,
      new_price_minor: priceNotice.new_price_minor,
      return_to: '/cart',
    });
  }

  const order = await orders.placeOrder({ cart: shaped, cartRow: row, customer, idempotencyKey: idem });
  return c.json(order, 201);
});

api.get('/orders/:number', async (c) => {
  const customer = await currentCustomer(c);
  const accessToken = c.req.query('access_token') || c.req.header('x-order-token') || null;
  const o = await orders.orderReadableBy(c.req.param('number'), { accessToken, customer });
  const serials = await orders.serialsForOrder(o.id);
  return c.json(orders.shapeOrder(o, {
    serials: serials.map((d) => ({ serial: d.serial, model: d.model, registered: d.owner_id !== null })),
  }));
});

/* --------------------------------------------------------------- account */

api.get('/account/orders', async (c) => {
  const customer = await requireCustomer(c);
  const q = c.req.query();
  const limit = pageSizeFrom(q);
  const cursor = decodeCursor(q.cursor);
  const params = [customer.id, limit + 1];
  let where = '';
  if (cursor) { params.push(Number(cursor)); where = ' AND o.id < $3'; }
  const rows = await many(
    `SELECT o.* FROM "order" o WHERE o.customer_id = $1${where} ORDER BY o.id DESC LIMIT $2`,
    params
  );
  const out = page(rows, limit, (r) => r.id);
  const data = [];
  for (const o of out.data) {
    const lines = await many(
      `SELECT ol.*, v.sku, p.handle, p.kind FROM order_line ol
        JOIN variant v ON v.id = ol.variant_id JOIN product p ON p.id = v.product_id
       WHERE ol.order_id = $1 ORDER BY ol.position, ol.id`, [o.id]
    );
    data.push(orders.shapeOrder({ ...o, lines }));
  }
  return c.json({ data, next_cursor: out.next_cursor, has_more: out.has_more });
});

api.get('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const q = c.req.query();
  const limit = pageSizeFrom(q);
  const cursor = decodeCursor(q.cursor);
  const rows = await devices.devicesForCustomer(customer.id, { limit, cursorId: cursor ? Number(cursor) : null });
  const out = page(rows, limit, (r) => r.id);
  const data = [];
  for (const d of out.data) data.push(await devices.shapeDevice(d));
  return c.json({ data, next_cursor: out.next_cursor, has_more: out.has_more });
});

api.post('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const b = await body(c);
  const d = await devices.registerDevice(b.serial, customer.id);
  return c.json(await devices.shapeDevice(d), 201);
});

api.get('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const d = await devices.deviceOwnedBy(c.req.param('serial'), customer.id);
  // Another customer's serial reads as not found, never forbidden.
  if (!d) throw notFound('We do not recognise that serial number.');
  return c.json(await devices.shapeDevice(d));
});

api.patch('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const b = await body(c);
  const d = await devices.renameDevice(c.req.param('serial'), customer.id, b.nickname);
  return c.json(await devices.shapeDevice(d));
});

api.delete('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const d = await devices.releaseDevice(c.req.param('serial'), customer.id);
  return c.json(await devices.shapeDevice(d));
});

/* -------------------------------------------------------------- releases */

// Sort by build descending. released_on is not a sort key.
api.get('/releases', async (c) => {
  const q = c.req.query();
  const limit = pageSizeFrom(q);
  const cursor = decodeCursor(q.cursor);
  const params = [limit + 1];
  let where = '';
  if (cursor) { params.push(Number(cursor)); where = ' WHERE build < $2'; }
  const rows = await many(
    `SELECT version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
       FROM app_release${where} ORDER BY build DESC LIMIT $1`,
    params
  );
  const out = page(rows, limit, (r) => r.build);
  return c.json({
    data: out.data.map(shapeRelease),
    next_cursor: out.next_cursor,
    has_more: out.has_more,
  });
});

api.get('/releases/:version', async (c) => {
  const r = await one(
    `SELECT version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
       FROM app_release WHERE version = $1`,
    [c.req.param('version')]
  );
  if (!r) throw notFound('That release does not exist.');
  return c.json(shapeRelease(r));
});

export function shapeRelease(r) {
  return {
    version: r.version,
    build: r.build,
    released_on: String(r.released_on).slice(0, 10),
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description,
    notes: r.notes,
  };
}

api.get('/releases/:version/artifact', async (c) => {
  const r = await one('SELECT version, artifact_name, size_bytes, sha256 FROM app_release WHERE version = $1', [c.req.param('version')]);
  if (!r) throw notFound('That release does not exist.');
  return artifactResponse(c, r.artifact_name, `Arranger ${r.version}`, r.sha256);
});

/* -------------------------------------------------------------- firmware */

api.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model') || c.req.query('handle');
  if (!model) throw badRequest('model_required', 'Name the camera the manifest is for.');
  const p = await one(`SELECT id, handle, title FROM product WHERE handle = $1 AND kind = 'camera'`, [model]);
  if (!p) throw notFound('We do not recognise that camera.');
  const channel = String(c.req.query('channel') || 'general');
  const allowed = channel === 'general' ? ['general'] : ['general', channel];
  const rows = await many(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
       FROM firmware WHERE product_id = $1 AND channel = ANY($2::text[]) ORDER BY build DESC`,
    [p.id, allowed]
  );
  return c.json({
    product: { handle: p.handle, title: p.title },
    generated_at: new Date().toISOString(),
    entries: rows.map((r) => ({
      version: r.version,
      build: r.build,
      channel: r.channel,
      min_firmware: r.min_firmware,
      min_app_version: r.min_app_version,
      size_bytes: Number(r.size_bytes),
      sha256: r.sha256,
      released_on: String(r.released_on).slice(0, 10),
    })),
  });
});

api.get('/firmware/:build/artifact', async (c) => {
  const fw = await one(
    `SELECT f.build, f.version, f.sha256, p.title FROM firmware f JOIN product p ON p.id = f.product_id WHERE f.build = $1`,
    [Number(c.req.param('build'))]
  );
  if (!fw) throw notFound('That firmware does not exist.');
  return artifactResponse(c, `${fw.title.toLowerCase().replace(/\s+/g, '-')}-firmware-${fw.version}.bin`, `${fw.title} firmware ${fw.version}`, fw.sha256);
});

// A small, honest artifact: this app builds no binaries, so the download is a
// signed-off manifest of the release it names rather than a fake payload.
function artifactResponse(c, filename, label, sha256) {
  const text = [
    `${label}`,
    ``,
    `File: ${filename}`,
    `Digest (sha256): ${sha256}`,
    ``,
    `This build is distributed from the Vela downloads page.`,
    `The Vela team.`,
    ``,
  ].join('\n');
  return c.body(text, 200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}.txt"`,
  });
}

/* -------------------------------------------------------- flash sessions */

api.post('/flash-sessions', async (c) => {
  const b = await body(c);
  const out = await devices.startFlashSession({
    serial: b.serial,
    targetBuild: b.target_build ?? b.targetBuild,
    reportedVersion: b.reported_version ?? b.reportedVersion ?? null,
  });
  return c.json({
    id: String(out.session.id),
    state: out.session.state,
    started_at: new Date(out.session.started_at).toISOString(),
    device: { serial: out.device.serial, model: out.device.model, firmware_version: out.device.firmware_version },
    firmware: { version: out.firmware.version, build: out.firmware.build, size_bytes: Number(out.firmware.size_bytes), sha256: out.firmware.sha256 },
  }, 201);
});

api.post('/flash-sessions/:id/complete', async (c) => {
  const b = await body(c);
  const s = await devices.completeFlashSession(c.req.param('id'), b.reported_version ?? b.reportedVersion);
  return c.json({
    id: String(s.id),
    state: s.state,
    reported_version: s.reported_version,
    device: { serial: s.serial, firmware_version: s.firmware_version },
    ended_at: s.ended_at ? new Date(s.ended_at).toISOString() : null,
  });
});

api.post('/flash-sessions/:id/fail', async (c) => {
  const b = await body(c);
  const s = await devices.failFlashSession(c.req.param('id'), b.reason);
  return c.json({
    id: String(s.id),
    state: s.state,
    failure_reason: s.failure_reason,
    device: { serial: s.serial, firmware_version: s.firmware_version },
    ended_at: s.ended_at ? new Date(s.ended_at).toISOString() : null,
  });
});

/* --------------------------------------------------- device lookup (public) */

// The installer needs to know what a serial is before anyone signs in: ownership
// and warranty are not conditions of repair.
api.get('/devices/:serial/public', async (c) => {
  const serial = devices.normaliseSerial(c.req.param('serial'));
  if (!orders.serialShapeOk(serial)) throw badRequest('serial_shape', 'We do not recognise that serial number.');
  const d = await devices.deviceBySerial(serial);
  if (!d) throw notFound('We do not recognise that serial number.');
  if (d.status === 'blocked') {
    throw new AppError(422, 'device_blocked', 'That camera is blocked. Write to us and we will look into it.');
  }
  const p = await one('SELECT handle, title FROM product WHERE id = $1', [d.product_id]);
  return c.json({
    serial: d.serial,
    model: d.model,
    handle: p.handle,
    firmware_version: d.firmware_version,
  });
});

export default api;

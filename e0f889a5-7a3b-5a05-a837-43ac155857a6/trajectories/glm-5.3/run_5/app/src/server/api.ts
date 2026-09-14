import { Hono } from 'hono';
import { q, one } from './db.js';
import { env } from './env.js';
import { newRequestId, logLine, logEvent } from './log.js';
import { hashPassword, verifyPassword, issueToken, readToken, randomToken } from './auth.js';
import { listProducts, getProduct, PROTECTION_PRODUCT_HANDLE } from './catalogue.js';
import {
  ensureCart, getCartState, addLine, setLineQuantity, removeLine, setProtection, setDelivery,
  CART_COOKIE, type CartState,
} from './cart.js';
import { placeOrder, orderView, getOrder, loadOrderLines, orderSerials, canSeeOrder, OrderError, toOrderView } from './orders.js';
import {
  registerDevice, releaseDevice, renameDevice, devicesForCustomer, deviceBySerial,
  toDeviceView, serialLooksValid, DeviceError, fold, groupSerial,
} from './devices.js';
import { listReleases, getRelease, firmwareForProduct, latestFirmware } from './releases.js';
import { startFlashSession, completeFlashSession, failFlashSession, getSession, sessionView, FlashError } from './flash.js';
import { pageSize, PageSizeError, keysetPage, encodeCursor, decodeCursor } from './pagination.js';
import { sendMail } from './mail.js';
import { dollars } from './money.js';

export type Vars = { requestId: string; customerId: number | null; customerEmail: string | null };

const app = new Hono<{ Variables: Vars }>();

// The request identifier is generated at the edge and carried into the logs,
// the response headers and every error body.
app.use('*', async (c, next) => {
  const given = c.req.header('x-request-id');
  c.set('requestId', given && /^[a-f0-9]{6,32}$/.test(given) ? given : newRequestId());
  await next();
});

/* --------------------------------- helpers -------------------------------- */

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function fail(c: any, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return c.json({ error: { code, message, request_id: c.get('requestId'), ...extra } }, status);
}

function bearer(c: any): string | null {
  const h = c.req.header('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** The bearer token from the header, or the HttpOnly session cookie a browser holds. */
function sessionToken(c: any): string | null {
  const header = bearer(c);
  if (header) return header;
  const cookie = c.req.header('cookie') ?? '';
  const m = /(?:^|;\s*)vela_token=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Server-side authorization on every mutating endpoint. */
async function requireCustomer(c: any): Promise<{ id: number; email: string } | null> {
  const token = sessionToken(c);
  const payload = readToken(token);
  if (!payload) return null;
  const row = await one<{ id: number; email: string; status: string }>(
    `SELECT id, email, status FROM customer WHERE id = $1`, [payload.sub]);
  if (!row || row.status !== 'active') return null;
  c.set('customerId', row.id);
  c.set('customerEmail', row.email);
  return { id: row.id, email: row.email };
}

function cartTokenFrom(c: any): string | null {
  return c.req.header('x-cart-token') || new URL(c.req.url).searchParams.get('cart_token') || null;
}

async function currentCart(c: any): Promise<{ token: string; state: CartState | null }> {
  const given = cartTokenFrom(c);
  const customer = c.get('customerId') as number | null;
  let token = given;
  if (!token) {
    const cookie = c.req.header('cookie') ?? '';
    const m = /(?:^|;\s*)vela_cart=([^;]+)/.exec(cookie);
    if (m) token = decodeURIComponent(m[1]);
  }
  const ensured = await ensureCart(token ?? undefined, customer);
  c.header('X-Cart-Token', ensured);
  setCartCookie(c, ensured);
  return { token: ensured, state: await getCartState(ensured) };
}

/** The browser session cookie is set by the server; HttpOnly cannot be set from a script. */
function setAuthCookie(c: any, token: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  c.header('Set-Cookie', `vela_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`);
}

function setCartCookie(c: any, token: string) {
  c.header('Set-Cookie', `${CART_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

function cartJson(state: CartState) {
  return {
    token: state.token,
    email: state.email,
    lines: state.lines,
    subtotal_minor: state.subtotal_minor,
    protection_rung: state.protection_rung,
    protection: state.protection,
    shipping_method: state.shipping_method,
    shipping_address: state.shipping_address,
    marketing_consent: state.marketing_consent,
    shipping_minor: state.shipping_minor,
    tax_minor: state.tax_minor,
    total_minor: state.total_minor,
    notices: state.notices,
  };
}

/* ---------------------------------- health --------------------------------- */

app.all('/health', (c) => c.json({ ok: true, status: 'ready' }));

/* ----------------------------------- auth ---------------------------------- */

app.post('/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(c, 400, 'invalid_email', 'Email is required.');
  }
  if (!name) return fail(c, 400, 'name_required', 'Name is required.');
  if (password.length < 8) return fail(c, 400, 'weak_password', 'Password must be at least eight characters.');
  const existing = await one(`SELECT id FROM customer WHERE email_folded = $1`, [email]);
  if (existing) return fail(c, 409, 'email_taken', 'That address is already registered. Sign in instead.');
  const hash = await hashPassword(password);
  const row = await one<{ id: number; email: string; name: string }>(
    `INSERT INTO customer (email, email_folded, name, password_hash, status) VALUES ($1,$1,$2,$3,'active') RETURNING id, email, name`,
    [email, name, hash]);
  const { token, expiresAt } = issueToken(row!.id, row!.email);
  setAuthCookie(c, token);
  return c.json({ access_token: token, expires_at: expiresAt, customer: { id: row!.id, email: row!.email, name: row!.name } }, 201);
});

app.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const row = await one<{ id: number; email: string; name: string; password_hash: string; status: string }>(
    `SELECT id, email, name, password_hash, status FROM customer WHERE email_folded = $1`, [email]);
  if (!row || row.status !== 'active') return fail(c, 401, 'invalid_credentials', 'That did not work. Check your email and password.');
  const ok = await verifyPassword(row.password_hash, password);
  if (!ok) return fail(c, 401, 'invalid_credentials', 'That did not work. Check your email and password.');
  const { token, expiresAt } = issueToken(row.id, row.email);
  setAuthCookie(c, token);
  return c.json({ access_token: token, expires_at: expiresAt, customer: { id: row.id, email: row.email, name: row.name } });
});

app.get('/auth/me', async (c) => {
  const customer = await requireCustomer(c);
  if (!customer) return fail(c, 401, 'unauthorized', 'Sign in to continue.');
  const row = await one(`SELECT id, email, name, created_at FROM customer WHERE id = $1`, [customer.id]);
  return c.json({ customer: row });
});

app.post('/auth/logout', (c) => {
  c.header('Set-Cookie', 'vela_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return c.json({ ok: true });
});

/* --------------------------------- catalogue ------------------------------- */

app.get('/products', async (c) => {
  const size = pageSize(c, c.req.query());
  const cursor = decodeCursor(c.req.query('cursor'));
  const products = (await listProducts()).map((p) => ({
    handle: p.handle, title: p.title, subtitle: p.subtitle, kind: p.kind, status: p.status,
    support_until: p.support_until, position: p.position,
    variants: p.variants.map((v) => ({
      id: v.id, sku: v.sku, title: v.title, option_value: v.option_value,
      price_minor: v.price_minor, currency: v.currency, available: v.available, committed: v.committed,
      inventory_policy: v.inventory_policy,
    })),
    availability: p.availability,
    price_from_minor: p.variants.length ? Math.min(...p.variants.map((v) => v.price_minor)) : null,
    price_range: p.variants.length && new Set(p.variants.map((v) => v.price_minor)).size > 1,
    image: `/assets/${p.handle}.png`,
  }));
  const page = keysetPage(products, (p) => p.handle, size, cursor as string | null);
  return c.json({ data: page.data, next_cursor: page.next_cursor, has_more: page.has_more });
});

app.get('/products/:handle', async (c) => {
  const handle = c.req.param('handle');
  const product = await getProduct(handle);
  if (!product || product.handle === PROTECTION_PRODUCT_HANDLE) {
    return fail(c, 404, 'not_found', 'That page does not exist.');
  }
  const variantParam = c.req.query('variant');
  const wanted = variantParam ? product.variants.find((v) => v.sku === variantParam || v.option_value.toLowerCase() === variantParam.toLowerCase()) : null;
  return c.json({
    handle: product.handle, title: product.title, subtitle: product.subtitle, kind: product.kind,
    status: product.status, support_until: product.support_until, position: product.position,
    availability: product.availability,
    image: `/assets/${product.handle}.png`,
    variants: product.variants.map((v) => ({
      id: v.id, sku: v.sku, title: v.title, option_value: v.option_value, price_minor: v.price_minor,
      currency: v.currency, available: v.available, committed: v.committed,
      inventory_policy: v.inventory_policy,
    })),
    selected_variant: wanted?.sku ?? product.variants[0]?.sku ?? null,
    blocks: product.blocks.map((b) => ({ kind: b.kind, ...(b.payload as object) })),
    firmware: await latestFirmware(product.handle),
  });
});

/* ----------------------------------- cart ---------------------------------- */

app.get('/cart', async (c) => {
  const { state } = await currentCart(c);
  if (!state) return fail(c, 404, 'no_cart', 'That cart does not exist.');
  return c.json(cartJson(state));
});

app.post('/cart/lines', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sku = String(body.sku ?? '');
  const quantity = Math.trunc(Number(body.quantity ?? 1));
  if (!sku) return fail(c, 400, 'sku_required', 'Choose a variant.');
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) {
    return fail(c, 400, 'invalid_quantity', 'Quantity must be between 1 and 10.');
  }
  const { token } = await currentCart(c);
  const result = await addLine(token, sku, quantity);
  if (result.error === 'unknown_sku') return fail(c, 404, 'unknown_sku', 'That page does not exist.');
  if (result.error === 'discontinued') return fail(c, 409, 'discontinued', 'We no longer sell this.');
  const state = await getCartState(token);
  return c.json(cartJson(state!), 201);
});

app.patch('/cart/lines/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const quantity = Math.trunc(Number(body.quantity ?? 0));
  const { token } = await currentCart(c);
  const result = await setLineQuantity(token, id, quantity);
  if (result.error) return fail(c, 404, 'no_line', 'That line is not in this cart.');
  const state = await getCartState(token);
  return c.json(cartJson(state!));
});

app.delete('/cart/lines/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { token } = await currentCart(c);
  const result = await removeLine(token, id);
  if (result.error) return fail(c, 404, 'no_line', 'That line is not in this cart.');
  const state = await getCartState(token);
  return c.json(cartJson(state!));
});

app.post('/cart/protection', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  const { token } = await currentCart(c);
  await setProtection(token, enabled);
  const state = await getCartState(token);
  return c.json(cartJson(state!));
});

app.post('/cart/delivery', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { token } = await currentCart(c);
  const result = await setDelivery(token, {
    email: body.email != null ? String(body.email).trim().toLowerCase() : undefined,
    shipping_address: body.shipping_address,
    shipping_method: body.shipping_method != null ? String(body.shipping_method) : undefined,
    marketingConsent: typeof body.marketing_consent === 'boolean' ? body.marketing_consent : undefined,
  });
  if (result.error) return fail(c, 400, 'unknown_method', 'Choose a delivery method.');
  const state = await getCartState(token);
  return c.json(cartJson(state!));
});

/* ---------------------------------- orders --------------------------------- */

app.post('/orders', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const customer = await requireCustomer(c);
  const { token } = await currentCart(c);
  const idempotencyKey = c.req.header('idempotency-key') || body.idempotency_key || null;

  const address = body.shipping_address ?? {};
  const email = String(body.email ?? '').trim().toLowerCase();
  const method = String(body.shipping_method ?? '');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(c, 400, 'email_required', 'Email is required.');
  if (!method) return fail(c, 400, 'method_required', 'Choose a delivery method.');
  const missing = ['name', 'line1', 'city', 'region', 'postal_code', 'country'].filter((k) => !String((address as any)[k] ?? '').trim());
  if (missing.length > 0) return fail(c, 400, 'address_required', 'Complete the address before placing the order.');

  try {
    const result = await placeOrder({
      cartToken: token,
      customerId: customer?.id ?? null,
      idempotencyKey,
      email,
      shippingAddress: address,
      shippingMethod: method,
      marketingConsent: !!body.marketing_consent,
      expectedTotalMinor: body.expected_total_minor ?? null,
    });
    return c.json({
      number: result.order.number,
      total_minor: result.order.total_minor,
      total_dollars: result.order.total_dollars,
      killbill_external_key: result.order.killbill_external_key,
      killbill_invoice_amount: result.order.killbill_invoice_amount,
      status: result.order.status,
      access_token: result.access_token,
      order: result.order,
      replayed: result.replayed,
    }, result.replayed ? 200 : 201);
  } catch (err) {
    if (err instanceof OrderError) {
      const payload: Record<string, unknown> = { notice: err.extra.notice ?? null };
      return fail(c, err.status, err.code, err.message, payload);
    }
    throw err;
  }
});

app.get('/orders/:number', async (c) => {
  const number = c.req.param('number').toUpperCase();
  const order = await getOrder(number);
  if (!order) return fail(c, 404, 'not_found', 'That page does not exist.');
  const accessToken = c.req.query('access_token') || c.req.header('x-access-token');
  const customer = await requireCustomer(c);
  const allowed = await canSeeOrder(order, { accessToken, customerId: customer?.id ?? null });
  if (!allowed) return fail(c, 404, 'not_found', 'That page does not exist.');
  const lines = await loadOrderLines(order.id);
  const serials = await orderSerials(order.id);
  return c.json(toOrderView(order, lines, serials));
});

/* ------------------------------- account routes ---------------------------- */

app.get('/account/orders', async (c) => {
  const customer = await requireCustomer(c);
  if (!customer) return fail(c, 401, 'unauthorized', 'Sign in to see your orders.');
  const size = pageSize(c, c.req.query());
  const cursor = decodeCursor(c.req.query('cursor'));
  const rows = await q<any>(
    `SELECT o.*, (SELECT l.title_snapshot FROM order_line l WHERE l.order_id = o.id ORDER BY l.id ASC LIMIT 1) AS first_line,
            (SELECT count(*)::int FROM order_line l WHERE l.order_id = o.id) AS line_count
       FROM "order" o WHERE o.customer_id = $1 ORDER BY o.placed_at DESC, o.id DESC`, [customer.id]);
  const views = rows.map((o) => ({
    number: o.number,
    placed_at: o.placed_at,
    first_line: o.first_line,
    line_count: o.line_count,
    total_minor: Number(o.total_minor),
    currency: o.currency,
    total_dollars: dollars(Number(o.total_minor)),
    status: o.status,
    payment_status: o.payment_status,
    fulfilment_status: o.fulfilment_status,
    chip: toOrderView(o, []).status_chip,
  }));
  const page = keysetPage(views, (v) => v.number, size, cursor as string | null);
  return c.json({ data: page.data, next_cursor: page.next_cursor, has_more: page.has_more });
});

app.get('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  if (!customer) return fail(c, 401, 'unauthorized', 'Sign in to see your cameras.');
  const size = pageSize(c, c.req.query());
  const cursor = decodeCursor(c.req.query('cursor'));
  const rows = await devicesForCustomer(customer.id);
  const views = rows.map(toDeviceView);
  const page = keysetPage(views, (v) => v.serial, size, cursor as string | null);
  return c.json({ data: page.data, next_cursor: page.next_cursor, has_more: page.has_more });
});

app.post('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  if (!customer) return fail(c, 401, 'unauthorized', 'Sign in to register a camera.');
  const body = await c.req.json().catch(() => ({}));
  const serial = String(body.serial ?? '').trim();
  try {
    const device = await registerDevice(customer.id, serial);
    return c.json(toDeviceView(device), 201);
  } catch (err) {
    if (err instanceof DeviceError) return fail(c, err.status, err.code, err.message, err.extra);
    throw err;
  }
});

app.patch('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  if (!customer) return fail(c, 401, 'unauthorized', 'Sign in to rename a camera.');
  const body = await c.req.json().catch(() => ({}));
  const nickname = String(body.nickname ?? '').trim();
  if (!nickname) return fail(c, 400, 'nickname_required', 'Nickname is required.');
  try {
    const device = await renameDevice(customer.id, c.req.param('serial'), nickname);
    return c.json(toDeviceView(device));
  } catch (err) {
    if (err instanceof DeviceError) return fail(c, err.status, err.code, err.message, err.extra);
    throw err;
  }
});

app.delete('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  if (!customer) return fail(c, 401, 'unauthorized', 'Sign in to release a camera.');
  try {
    const device = await releaseDevice(customer.id, c.req.param('serial'));
    return c.json(toDeviceView(device));
  } catch (err) {
    if (err instanceof DeviceError) return fail(c, err.status, err.code, err.message, err.extra);
    throw err;
  }
});

/* -------------------------------- releases --------------------------------- */

app.get('/releases', async (c) => {
  const size = pageSize(c, c.req.query());
  const cursor = decodeCursor(c.req.query('cursor'));
  const releases = await listReleases();
  const page = keysetPage(releases, (r) => r.build, size, cursor as number | null);
  return c.json({
    data: page.data.map((r) => ({ ...r, size_label: formatBytes(r.size_bytes) })),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  });
});

app.get('/releases/:version', async (c) => {
  const release = await getRelease(c.req.param('version'));
  if (!release) return fail(c, 404, 'not_found', 'That page does not exist.');
  return c.json({ ...release, size_label: formatBytes(release.size_bytes) });
});

function formatBytes(n: number): string {
  const mb = n / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

/* --------------------------------- firmware -------------------------------- */

app.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model');
  const channel = c.req.query('channel');
  if (!model) return fail(c, 400, 'model_required', 'Name the model.');
  const { product, entries } = await firmwareForProduct(model, { channel });
  if (entries.length === 0) return fail(c, 404, 'not_found', 'That page does not exist.');
  return c.json({
    product,
    generated_at: new Date().toISOString(),
    entries: entries.map((e) => ({
      version: e.version, build: e.build, channel: e.channel, min_firmware: e.min_firmware,
      min_app_version: e.min_app_version, size_bytes: e.size_bytes, sha256: e.sha256,
    })),
  });
});

/** What a device reports, so the installer can state the version it is on. */
app.get('/firmware/device', async (c) => {
  const serial = c.req.query('serial');
  if (!serial) return fail(c, 400, 'serial_required', 'Serial is required.');
  const device = await deviceBySerial(serial);
  if (!device) return fail(c, 404, 'not_found', 'We do not recognise that serial number.');
  return c.json({
    serial: device.serial,
    model: device.product_title,
    firmware_version: device.firmware_version ?? null,
    blocked: device.status === 'blocked',
  });
});

app.post('/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serial = String(body.serial ?? '').trim();
  const targetBuild = Number(body.target_build);
  if (!serial) return fail(c, 400, 'serial_required', 'Serial is required.');
  if (!Number.isFinite(targetBuild)) return fail(c, 400, 'target_required', 'Name the firmware to write.');
  try {
    const { session, device, firmware } = await startFlashSession({
      serial, targetBuild, currentVersion: body.current_version ?? null,
    });
    return c.json(sessionView(session, device, firmware), 201);
  } catch (err) {
    if (err instanceof FlashError) return fail(c, err.status, err.code, err.message, err.extra);
    if (err instanceof DeviceError) return fail(c, err.status, err.code, err.message, err.extra);
    throw err;
  }
});

app.post('/flash-sessions/:id/complete', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reported = String(body.reported_version ?? '').trim();
  if (!reported) return fail(c, 400, 'version_required', 'The version read back from the camera is required.');
  try {
    const { session } = await completeFlashSession(id, reported);
    const full = await getSession(id);
    return c.json(sessionView(session, { serial: full!.serial }, { build: full!.firmware_build, version: full!.firmware_version }));
  } catch (err) {
    if (err instanceof FlashError) return fail(c, err.status, err.code, err.message, err.extra);
    throw err;
  }
});

app.post('/flash-sessions/:id/fail', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason ?? '').trim() || 'unspecified';
  try {
    const session = await failFlashSession(id, reason);
    const full = await getSession(id);
    return c.json(sessionView(session, { serial: full!.serial }, { build: full!.firmware_build, version: full!.firmware_version }));
  } catch (err) {
    if (err instanceof FlashError) return fail(c, err.status, err.code, err.message, err.extra);
    throw err;
  }
});

/* ------------------------------ error handling ------------------------------ */

app.notFound((c) => fail(c, 404, 'not_found', 'That page does not exist.'));

// A page size above the cap is refused with the cap named, never a 500.
app.onError((err, c) => {
  if (err instanceof PageSizeError) {
    return c.json(
      { error: { code: 'page_size_too_large', message: err.message, request_id: c.get('requestId') } },
      400,
    );
  }
  logEvent('api.unhandled', { request_id: c.get('requestId'), error: String(err) });
  return c.json(
    { error: { code: 'internal', message: 'Something went wrong at our end.', request_id: c.get('requestId') } },
    500,
  );
});

export async function handleApi(request: Request): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  try {
    // The id is minted here, at the edge, and travelled in on the header so the
    // router, the logs and the error body all name one value.
    const edgeRequest = new Request(request, {
      headers: new Headers(request.headers),
    });
    if (!edgeRequest.headers.get('x-request-id')) {
      edgeRequest.headers.set('x-request-id', newRequestId());
    }
    const requestId = edgeRequest.headers.get('x-request-id')!;
    const res = await app.fetch(edgeRequest);
    logLine({
      request_id: requestId,
      method: request.method,
      route: url.pathname,
      status: res.status,
      ms: Date.now() - started,
    });
    const headers = new Headers(res.headers);
    headers.set('x-request-id', requestId);
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    logEvent('api.error', { request_id: requestId, method: request.method, route: url.pathname, error: String(err) });
    logLine({ request_id: requestId, method: request.method, route: url.pathname, status: 500, ms: Date.now() - started });
    return Response.json(
      { error: { code: 'internal', message: 'Something went wrong at our end.', request_id: requestId } },
      { status: 500, headers: { 'x-request-id': requestId } },
    );
  }
}

export default app;

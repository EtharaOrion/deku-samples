// The HTTP API, served by Hono under /api on the same origin.
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { boot, isReady } from './boot.js';
import { q, withTransaction, logLine } from './lib/db.js';
import { newRequestId, requestLog, errorLog } from './lib/logs.js';
import { parsePageSize, decodeCursor, listResponse } from './lib/pagination.js';
import {
  hashPassword, verifyPassword, normalizeEmail, createTokenFor, customerForToken,
  bearerFromRequest, publicCustomer,
} from './lib/auth.js';
import {
  ensureCart, cartPayload, listProducts, productByHandle, variantAvailability,
  serialShapeValid, normalizeSerial, deviceBySerial, liveOwnerOf,
  listAppReleases, currentAppRelease, firmwareForProduct, latestFirmwareForProduct,
  compareVersions, SHIPPING_METHODS, sha256,
} from './lib/store.js';
import { placeOrder, orderByNumber, serializeOrder, OrderRefused } from './lib/orders.js';

const CART_COOKIE = 'vela_cart';

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const api = new Hono();

api.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || newRequestId();
  const startedAt = Date.now();
  c.set('requestId', requestId);
  c.set('startedAt', startedAt);
  await boot();
  await next();
  c.header('x-request-id', requestId);
  const status = c.res?.status ?? 200;
  if (c.req.path !== '/api/health') {
    requestLog(requestId, c.req.method, c.req.path, status, startedAt);
  }
});

api.onError((err, c) => {
  const requestId = c.get('requestId') || newRequestId();
  if (err && err.code === 'page_size_too_large') {
    return c.json({ error: { code: err.code, message: err.message, request_id: requestId } }, 400);
  }
  if (err instanceof ApiError || err instanceof OrderRefused) {
    const status = err.status || 400;
    return c.json({ error: { code: err.code, message: err.message, request_id: requestId, ...err.extra } }, status);
  }
  errorLog(requestId, 'unhandled_error', { method: c.req.method, path: c.req.path, error: String(err && err.message) });
  return c.json(
    { error: { code: 'internal_error', message: `Something went wrong at our end. Reference ${requestId}.`, request_id: requestId } },
    500
  );
});

api.notFound((c) => {
  const requestId = c.get('requestId') || newRequestId();
  return c.json({ error: { code: 'not_found', message: 'That page does not exist.', request_id: requestId } }, 404);
});

async function requireCustomer(c) {
  const bearer = await bearerFromRequest(c.req.raw);
  if (!bearer) {
    throw new ApiError(401, 'unauthorized', 'Sign in to do that.');
  }
  const { expired, customer } = await customerForToken(bearer);
  if (expired) throw new ApiError(401, 'token_expired', 'Your session has ended. Sign in again.');
  if (!customer) throw new ApiError(401, 'unauthorized', 'Sign in to do that.');
  return customer;
}

async function currentCart(c) {
  const token = getCookie(c, CART_COOKIE);
  const customer = c.get('customer') || null;
  const cart = await ensureCart(token, customer ? customer.id : null);
  if (!token || token !== cart.token) {
    setCookie(c, CART_COOKIE, cart.token, { path: '/', httpOnly: false, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 });
  }
  return cart;
}

// ---------- health ----------

api.get('/api/health', (c) => c.json({ ok: true, ready: isReady() }));

// Signing out returns to the letter and changes nothing else.
api.get('/api/account/signout', (c) => {
  deleteCookie(c, 'vela_session', { path: '/' });
  return c.redirect('/');
});

// ---------- auth ----------

api.post('/api/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'email_invalid', 'Email is required.');
  if (password.length < 8) throw new ApiError(400, 'password_short', 'Password must be at least 8 characters.');
  if (!name) throw new ApiError(400, 'name_required', 'Name is required.');
  const existing = await q('SELECT id FROM customer WHERE lower(email) = $1', [email]);
  if (existing.length) throw new ApiError(409, 'email_taken', 'That address is already registered.');
  const rows = await q(
    `INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active') RETURNING *`,
    [email, name, hashPassword(password)]
  );
  const token = await createTokenFor(rows[0].id);
  return c.json({ access_token: token, customer: publicCustomer(rows[0]) }, 201);
});

api.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const rows = await q('SELECT * FROM customer WHERE lower(email) = $1', [email]);
  if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
    throw new ApiError(401, 'credentials_invalid', 'That did not work. Check the address and the password.');
  }
  const token = await createTokenFor(rows[0].id);
  return c.json({ access_token: token, customer: publicCustomer(rows[0]) });
});

api.get('/api/auth/me', async (c) => {
  const customer = await requireCustomer(c);
  return c.json({ customer: publicCustomer(customer) });
});


// ---------- products ----------

api.get('/api/products', async (c) => {
  const pageSize = parsePageSize(c.req.query('page_size'));
  const cursor = decodeCursor(c.req.query('cursor'));
  let all = await listProducts({ includeProtection: false });
  // Keyset pagination over the editorial position, the stable ordering key.
  if (cursor && cursor.position !== undefined) {
    all = all.filter((p) => Number(p.position) > Number(cursor.position));
  }
  const enriched = [];
  for (const p of all) {
    const variants = await q(
      `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.position, v.inventory_policy,
              il.available, il.committed
         FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
        WHERE v.product_id = $1 ORDER BY v.position, v.id`,
      [p.id]
    );
    const states = variants.map((v) => variantAvailability(v, p).state);
    const availability = states.includes('available')
      ? 'available'
      : states.includes('sold_out')
        ? 'sold_out'
        : 'discontinued';
    const prices = variants.map((v) => Number(v.price_minor));
    enriched.push({
      ...p,
      variants: variants.map((v) => ({
        sku: v.sku, title: v.title, option_value: v.option_value,
        price_minor: Number(v.price_minor), available: Number(v.available ?? 0),
        availability: variantAvailability(v, p).state,
      })),
      availability,
      min_price_minor: prices.length ? Math.min(...prices) : null,
      from_price: variants.length > 1 && new Set(prices).size > 1,
    });
  }
  return c.json(listResponse(enriched, 'position', pageSize));
});

api.get('/api/products/:handle', async (c) => {
  const handle = c.req.param('handle');
  const variantParam = c.req.query('variant');
  const product = await productByHandle(handle, { includeProtection: false });
  if (!product) throw new ApiError(404, 'not_found', 'That page does not exist.');
  let selected = null;
  if (variantParam) {
    selected = product.variants.find((v) => v.sku === variantParam) || null;
  }
  if (!selected) selected = product.variants.find((v) => variantAvailability(v, product).state === 'available') || product.variants[0] || null;
  return c.json({
    handle: product.handle,
    title: product.title,
    subtitle: product.subtitle,
    kind: product.kind,
    status: product.status,
    support_until: product.support_until,
    blocks: product.blocks.map((b) => ({ kind: b.kind, payload: b.payload })),
    selected_sku: selected ? selected.sku : null,
    variants: product.variants.map((v) => ({
      sku: v.sku, title: v.title, option_value: v.option_value,
      price_minor: Number(v.price_minor), currency: v.currency,
      available: Number(v.available ?? 0), committed: Number(v.committed ?? 0),
      availability: variantAvailability(v, product).state,
    })),
  });
});

// ---------- cart ----------

api.get('/api/cart', async (c) => {
  const cart = await currentCart(c);
  return c.json(await cartPayload(cart));
});

api.post('/api/cart/lines', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await currentCart(c);
  const sku = String(body.sku || '');
  const quantity = Number(body.quantity ?? 1);
  const rows = await q(
    `SELECT v.*, p.status AS product_status, p.title AS product_title, il.available
       FROM variant v JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.sku = $1`,
    [sku]
  );
  if (!rows.length) throw new ApiError(404, 'variant_not_found', 'We do not sell that.');
  const variant = rows[0];
  if (variant.product_status === 'discontinued') throw new ApiError(409, 'discontinued', 'We no longer sell this.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new ApiError(400, 'quantity_invalid', 'Quantity must be between 1 and 10.');
  }
  const avail = Number(variant.available ?? 0);
  const existing = await q('SELECT * FROM cart_line WHERE cart_id = $1 AND variant_id = $2', [cart.id, variant.id]);
  const newQty = (existing.length ? Number(existing[0].quantity) : 0) + quantity;
  if (variant.inventory_policy === 'deny' && newQty > avail) {
    throw new ApiError(409, 'out_of_stock', `Only ${avail} of ${variant.product_title} remain.`);
  }
  if (existing.length) {
    await q('UPDATE cart_line SET quantity = $3, unit_price_minor = $4 WHERE id = $1 AND cart_id = $2', [
      existing[0].id, cart.id, Math.min(newQty, 10), Number(variant.price_minor),
    ]);
  } else {
    await q('INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)', [
      cart.id, variant.id, quantity, Number(variant.price_minor),
    ]);
  }
  await q('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return c.json(await cartPayload(cart), 201);
});

api.patch('/api/cart/lines/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await currentCart(c);
  const lineId = Number(c.req.param('id'));
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) {
    throw new ApiError(400, 'quantity_invalid', 'Quantity must be between 1 and 10.');
  }
  const rows = await q(
    `SELECT cl.*, v.sku, v.title AS variant_title, v.price_minor, v.inventory_policy, il.available
       FROM cart_line cl JOIN variant v ON v.id = cl.variant_id
       LEFT JOIN inventory_level il ON il.variant_id = cl.variant_id
      WHERE cl.id = $1 AND cl.cart_id = $2`,
    [lineId, cart.id]
  );
  if (!rows.length) throw new ApiError(404, 'line_not_found', 'That line is not in your cart.');
  const line = rows[0];
  if (quantity === 0) {
    await q('DELETE FROM cart_line WHERE id = $1', [lineId]);
  } else {
    if (line.inventory_policy === 'deny' && quantity > Number(line.available ?? 0)) {
      throw new ApiError(409, 'out_of_stock', `Only ${Number(line.available ?? 0)} of that remain.`);
    }
    await q('UPDATE cart_line SET quantity = $3 WHERE id = $1 AND cart_id = $2', [lineId, cart.id, quantity]);
  }
  await q('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return c.json(await cartPayload(cart));
});

api.delete('/api/cart/lines/:id', async (c) => {
  const cart = await currentCart(c);
  const lineId = Number(c.req.param('id'));
  await q('DELETE FROM cart_line WHERE id = $1 AND cart_id = $2', [lineId, cart.id]);
  return c.json(await cartPayload(cart));
});

api.post('/api/cart/protection', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await currentCart(c);
  await q('UPDATE cart SET protection_enabled = $2, updated_at = now() WHERE id = $1', [cart.id, !!body.enabled]);
  const fresh = await q('SELECT * FROM cart WHERE id = $1', [cart.id]);
  return c.json(await cartPayload(fresh[0]));
});

api.post('/api/cart/delivery', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await currentCart(c);
  const email = normalizeEmail(body.email);
  const address = body.shipping_address || null;
  const method = String(body.shipping_method || '');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'email_invalid', 'Email is required.');
  if (method && !SHIPPING_METHODS.find((m) => m.code === method)) {
    throw new ApiError(400, 'shipping_method_invalid', 'Choose a delivery method.');
  }
  await q(
    `UPDATE cart SET email = COALESCE($2, email), shipping_address = COALESCE($3, shipping_address),
        shipping_method = COALESCE($4, shipping_method), updated_at = now() WHERE id = $1`,
    [cart.id, email || null, address ? JSON.stringify(address) : null, method || null]
  );
  const fresh = await q('SELECT * FROM cart WHERE id = $1', [cart.id]);
  return c.json(await cartPayload(fresh[0]));
});


// ---------- orders ----------

api.post('/api/orders', async (c) => {
  const cart = await currentCart(c);
  const idempotencyKey = c.req.header('Idempotency-Key') || null;
  const bearer = bearerFromRequest(c.req.raw);
  let customer = null;
  if (bearer) {
    const out = await customerForToken(bearer);
    customer = out.customer;
  }
  const body = await c.req.json().catch(() => ({}));
  const cartFresh = await q('SELECT * FROM cart WHERE id = $1', [cart.id]);
  const theCart = cartFresh[0];
  const email = normalizeEmail(body.email || theCart.email);
  const address = body.shipping_address || theCart.shipping_address;
  const method = body.shipping_method || theCart.shipping_method || 'standard';
  if (!email) throw new ApiError(400, 'email_required', 'Email is required.');
  if (!address || !address.name || !address.line1 || !address.city || !address.country) {
    throw new ApiError(400, 'address_required', 'We need an address to send this to.');
  }
  const { order, access_token: accessToken, replay } = await placeOrder({
    cartToken: theCart.token,
    email,
    shippingAddress: address,
    shippingMethod: method,
    protectionEnabled: !!theCart.protection_enabled,
    idempotencyKey,
    customerId: customer ? customer.id : null,
    expectedTotalMinor: body.expected_total_minor !== undefined ? Number(body.expected_total_minor) : null,
  });
  const payload = await serializeOrder(order);
  return c.json(
    { ...payload, access_token: accessToken, replay: !!replay },
    replay ? 200 : 201
  );
});

api.get('/api/orders/:number', async (c) => {
  const number = c.req.param('number');
  const order = await orderByNumber(number);
  if (!order) throw new ApiError(404, 'not_found', 'That page does not exist.');
  const token = c.req.query('access_token');
  const bearer = bearerFromRequest(c.req.raw);
  let authorised = false;
  if (token && sha256(token) === order.access_token_hash) authorised = true;
  if (!authorised && bearer) {
    const { customer } = await customerForToken(bearer);
    if (customer && order.customer_id && order.customer_id === customer.id) authorised = true;
  }
  if (!authorised) throw new ApiError(404, 'not_found', 'That page does not exist.');
  return c.json(await serializeOrder(order));
});

// ---------- account ----------

api.get('/api/account/orders', async (c) => {
  const customer = await requireCustomer(c);
  const pageSize = parsePageSize(c.req.query('page_size'));
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [customer.id];
  let where = 'WHERE customer_id = $1';
  if (cursor && cursor.id !== undefined) {
    params.push(Number(cursor.id));
    where += ` AND id < $${params.length}`;
  }
  params.push(pageSize + 1);
  const rows = await q(
    `SELECT * FROM "order" ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  return c.json(listResponse(rows.map((o) => ({
    number: o.number,
    email: o.email,
    status: o.status,
    payment_status: o.payment_status,
    fulfilment_status: o.fulfilment_status,
    total_minor: Number(o.total_minor),
    currency: o.currency,
    placed_at: o.placed_at,
    id: o.id,
  })), 'id', pageSize));
});

api.get('/api/account/orders/:number', async (c) => {
  const customer = await requireCustomer(c);
  const order = await orderByNumber(c.req.param('number'));
  // Another customer's order reads as not found, never forbidden.
  if (!order || !order.customer_id || order.customer_id !== customer.id) {
    throw new ApiError(404, 'not_found', 'That page does not exist.');
  }
  return c.json(await serializeOrder(order));
});

api.get('/api/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const pageSize = parsePageSize(c.req.query('page_size'));
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [customer.id];
  let where = `WHERE o.customer_id = $1 AND o.released_at IS NULL`;
  if (cursor && cursor.id !== undefined) {
    params.push(Number(cursor.id));
    where += ` AND o.id < $${params.length}`;
  }
  params.push(pageSize + 1);
  const rows = await q(
    `SELECT d.id AS device_id, d.serial, d.nickname, d.status, d.firmware_version, d.warranty_until,
            p.title AS model, p.handle AS product_handle, v.title AS variant_title, o.id AS ownership_id
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
       ${where}
      ORDER BY o.id DESC
      LIMIT $${params.length}`,
    params
  );
  const out = [];
  for (const d of rows) {
    const latest = await latestFirmwareForProduct(d.product_handle === 'compact' ? (await productIdByHandle('compact')) : (await productIdByHandle('flagship')));
    out.push({
      serial: d.serial,
      model: d.model,
      variant: d.variant_title,
      nickname: d.nickname,
      status: d.status,
      firmware_version: d.firmware_version,
      update_available: !!(latest && d.firmware_version && compareVersions(latest.version, d.firmware_version) > 0),
      never_connected: !d.firmware_version,
      warranty_until: d.warranty_until,
      id: d.ownership_id,
    });
  }
  return c.json(listResponse(out, 'id', pageSize));
});

async function productIdByHandle(handle) {
  const rows = await q('SELECT id FROM product WHERE handle = $1', [handle]);
  return rows.length ? rows[0].id : null;
}

api.post('/api/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const body = await c.req.json().catch(() => ({}));
  const raw = String(body.serial || '');
  const serial = normalizeSerial(raw);
  if (!serialShapeValid(serial)) {
    throw new ApiError(400, 'serial_invalid', 'That does not look like a Vela serial number.');
  }
  const device = await deviceBySerial(serial);
  if (!device) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  if (device.status === 'blocked') throw new ApiError(409, 'device_blocked', 'That camera is blocked.');
  const owner = await liveOwnerOf(device.id);
  if (owner) {
    throw new ApiError(409, 'device_owned', 'That camera is registered to someone else.');
  }
  try {
    await withTransaction(async (client) => {
      const lock = await client.query('SELECT id FROM device WHERE id = $1 FOR UPDATE', [device.id]);
      if (!lock.rowCount) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
      const live = await client.query(
        'SELECT id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL',
        [device.id]
      );
      if (live.rowCount) throw new ApiError(409, 'device_owned', 'That camera is registered to someone else.');
      await client.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`,
        [device.id, customer.id]
      );
      await client.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [device.id]);
    });
  } catch (err) {
    if (err && err.code === '23505') throw new ApiError(409, 'device_owned', 'That camera is registered to someone else.');
    throw err;
  }
  const fresh = await deviceBySerial(serial);
  return c.json({
    serial: fresh.serial,
    model: fresh.product_title,
    variant: fresh.variant_title,
    nickname: fresh.nickname,
    status: fresh.status,
    firmware_version: fresh.firmware_version,
    warranty_until: fresh.warranty_until,
  }, 201);
});

api.patch('/api/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const serial = normalizeSerial(c.req.param('serial'));
  const body = await c.req.json().catch(() => ({}));
  const device = await deviceBySerial(serial);
  if (!device) throw new ApiError(404, 'not_found', 'That page does not exist.');
  const owner = await liveOwnerOf(device.id);
  if (!owner || owner.customer_id !== customer.id) {
    throw new ApiError(404, 'not_found', 'That page does not exist.');
  }
  const nickname = String(body.nickname || '').slice(0, 60) || null;
  await q('UPDATE device SET nickname = $2 WHERE id = $1', [device.id, nickname]);
  return c.json({ serial: device.serial, nickname });
});

api.delete('/api/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const serial = normalizeSerial(c.req.param('serial'));
  const device = await deviceBySerial(serial);
  if (!device) throw new ApiError(404, 'not_found', 'That page does not exist.');
  const owner = await liveOwnerOf(device.id);
  if (!owner || owner.customer_id !== customer.id) {
    throw new ApiError(404, 'not_found', 'That page does not exist.');
  }
  await q(
    `UPDATE device_ownership SET released_at = now() WHERE id = $1 AND released_at IS NULL`,
    [owner.id]
  );
  await q(`UPDATE device SET status = 'sold' WHERE id = $1`, [device.id]);
  return c.json({ serial: device.serial, released: true });
});


// ---------- releases ----------

api.get('/api/releases', async (c) => {
  const pageSize = parsePageSize(c.req.query('page_size'));
  const cursor = decodeCursor(c.req.query('cursor'));
  const rows = await listAppReleases({ pageSize, cursor });
  const page = listResponse(rows, 'build', pageSize);
  return c.json({
    data: page.data.map((r) => ({
      version: r.version,
      build: Number(r.build),
      released_on: r.released_on instanceof Date ? r.released_on.toISOString().slice(0, 10) : r.released_on,
      artifact_name: r.artifact_name,
      size_bytes: Number(r.size_bytes),
      sha256: r.sha256,
      description: r.description,
      notes: r.notes,
    })),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  });
});

api.get('/api/releases/:version', async (c) => {
  const version = c.req.param('version');
  const rows = await q('SELECT * FROM app_release WHERE version = $1', [version]);
  if (!rows.length) throw new ApiError(404, 'not_found', 'That page does not exist.');
  const r = rows[0];
  return c.json({
    version: r.version,
    build: Number(r.build),
    released_on: r.released_on instanceof Date ? r.released_on.toISOString().slice(0, 10) : r.released_on,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description,
    notes: r.notes,
  });
});

// ---------- firmware ----------

api.get('/api/firmware/manifest', async (c) => {
  const model = c.req.query('model');
  if (!model) throw new ApiError(400, 'model_required', 'Name a model.');
  const productRows = await q('SELECT * FROM product WHERE handle = $1', [model]);
  if (!productRows.length) throw new ApiError(404, 'not_found', 'We do not know that model.');
  const product = productRows[0];
  const rows = await q(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel <> 'yanked' ORDER BY build DESC`,
    [product.id]
  );
  return c.json({
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    entries: rows.map((f) => ({
      version: f.version,
      build: Number(f.build),
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: Number(f.size_bytes),
      sha256: f.sha256,
    })),
  });
});

api.get('/api/firmware/identity', async (c) => {
  const serial = normalizeSerial(c.req.query('serial') || '');
  if (!serialShapeValid(serial)) throw new ApiError(400, 'serial_invalid', 'That does not look like a Vela serial number.');
  const device = await deviceBySerial(serial);
  if (!device) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  // Ownership and warranty are not conditions of repair.
  return c.json({
    serial: device.serial,
    model: device.product_title,
    product_handle: device.product_handle,
    variant: device.variant_title,
    firmware_version: device.firmware_version,
    warranty_until: device.warranty_until,
  });
});

// ---------- flash sessions ----------

api.post('/api/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serial = normalizeSerial(body.serial);
  const targetBuild = Number(body.target_build);
  if (!serialShapeValid(serial)) throw new ApiError(400, 'serial_invalid', 'That does not look like a Vela serial number.');
  const device = await deviceBySerial(serial);
  if (!device) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  const fwRows = await q('SELECT * FROM firmware WHERE build = $1', [targetBuild]);
  if (!fwRows.length) throw new ApiError(404, 'firmware_not_found', 'We do not have that firmware.');
  const fw = fwRows[0];
  // Refused before it starts when the target image belongs to another product.
  if (fw.product_id !== device.product_id) {
    throw new ApiError(409, 'wrong_product', 'That firmware belongs to another model.');
  }
  // Or its min_firmware is above the version the device reports.
  if (fw.min_firmware && device.firmware_version && compareVersions(fw.min_firmware, device.firmware_version) > 0) {
    throw new ApiError(409, 'below_minimum', `That firmware needs version ${fw.min_firmware} or later on the camera first.`);
  }
  // One started session per device.
  const existing = await q(`SELECT id FROM flash_session WHERE device_id = $1 AND state = 'started'`, [device.id]);
  if (existing.length) throw new ApiError(409, 'session_in_progress', 'A write is already running on that camera.');
  const made = await q(
    `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
    [device.id, fw.id]
  );
  return c.json({
    id: made[0].id,
    state: 'started',
    serial: device.serial,
    target: { version: fw.version, build: Number(fw.build) },
    started_at: made[0].started_at,
  }, 201);
});

api.post('/api/flash-sessions/:id/complete', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reported = String(body.reported_version || '');
  const rows = await q('SELECT * FROM flash_session WHERE id = $1', [id]);
  if (!rows.length) throw new ApiError(404, 'not_found', 'That page does not exist.');
  const session = rows[0];
  if (session.state !== 'started') {
    throw new ApiError(409, 'session_not_started', 'That write already finished.');
  }
  if (!reported) throw new ApiError(400, 'reported_version_required', 'The camera must report its version.');
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now() WHERE id = $1`,
      [id, reported]
    );
    // The version read back from the device, never the one requested.
    await client.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`,
      [session.device_id, reported]
    );
  });
  const deviceRows = await q('SELECT * FROM device WHERE id = $1', [session.device_id]);
  return c.json({
    id: session.id,
    state: 'succeeded',
    reported_version: reported,
    device_firmware_version: deviceRows[0].firmware_version,
  });
});

api.post('/api/flash-sessions/:id/fail', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || 'unknown');
  const rows = await q('SELECT * FROM flash_session WHERE id = $1', [id]);
  if (!rows.length) throw new ApiError(404, 'not_found', 'That page does not exist.');
  const session = rows[0];
  if (session.state !== 'started') {
    throw new ApiError(409, 'session_not_started', 'That write already finished.');
  }
  // A failed session leaves the firmware as it was.
  await q(
    `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now() WHERE id = $1`,
    [id, reason]
  );
  return c.json({ id: session.id, state: 'failed', failure_reason: reason });
});

export default api;

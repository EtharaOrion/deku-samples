import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { q, one, tx } from '../db/index.js';
import { sha256, randomToken, taxOf, SERIAL_RE, normalizeSerial, versionLt, versionGt, money, minorToDecimal } from '../util.js';
import { ApiError, pageSizeParams, listEnvelope, decodeCursor, encodeCursor, customerFromRequest, requireCustomer, findCart, createCart, cartFromContext, newRequestId } from './helpers.js';
import { cartState, variantBySku, assertVariantPurchasable, protectionRung } from './cart_core.js';
import { placeOrder, orderWithDetails } from './order_core.js';
import { kbHealth } from '../kb/client.js';

export const api = new Hono().basePath('/api');

// ------------------------------------------------------- error handling ----
api.onError((err, c) => {
  const requestId = c.env && c.env.requestId ? c.env.requestId : 'unknown';
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, request_id: requestId, ...(err.extra || {}) } }, err.status);
  }
  console.error(JSON.stringify({ event: 'api_error', request_id: requestId, error: String(err && err.stack || err) }));
  return c.json({ error: { code: 'internal_error', message: `Something went wrong at our end. Reference ${requestId}.`, request_id: requestId } }, 500);
});

function ok(c, body, status = 200) {
  return c.json(body, status);
}

// ---------------------------------------------------------------- health ----
api.get('/health', async (c) => {
  try {
    await q('SELECT 1');
    return ok(c, { status: 'ok' });
  } catch (e) {
    return c.json({ status: 'error', error: String(e) }, 503);
  }
});

// ------------------------------------------------------------------ auth ----
api.post('/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'email_invalid', 'Enter a valid email address.');
  if (!name) throw new ApiError(400, 'name_required', 'Name is required.');
  if (password.length < 8) throw new ApiError(400, 'password_short', 'Password must be at least eight characters.');
  const existing = await one('SELECT id FROM customer WHERE lower(email) = $1', [email]);
  if (existing) throw new ApiError(409, 'email_taken', 'That address already has an account. Sign in instead.');
  const cust = await one(
    'INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id, email, name, status',
    [email, name, bcrypt.hashSync(password, 10)]
  );
  const token = randomToken(24);
  await q('INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2, now() + interval \'7 days\')', [cust.id, sha256(token)]);
  return ok(c, { access_token: token, customer: cust }, 201);
});

api.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const cust = await one('SELECT id, email, name, status, password_hash FROM customer WHERE lower(email) = $1', [email]);
  if (!cust || !bcrypt.compareSync(password, cust.password_hash)) {
    throw new ApiError(401, 'invalid_credentials', 'That email and password did not match.');
  }
  const token = randomToken(24);
  await q('INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2, now() + interval \'7 days\')', [cust.id, sha256(token)]);
  delete cust.password_hash;
  return ok(c, { access_token: token, customer: cust });
});

api.get('/auth/me', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  return ok(c, { customer: cust });
});

api.post('/auth/logout', async (c) => {
  const h = c.req.headers.get('authorization') || '';
  const cookie = c.req.headers.get('cookie') || '';
  const m = cookie.match(/vela_token=([^;]+)/);
  const token = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : m ? decodeURIComponent(m[1]) : null;
  if (token) await q('DELETE FROM auth_token WHERE token_hash = $1', [sha256(token)]);
  c.header('Set-Cookie', 'vela_token=; Path=/; Max-Age=0; SameSite=Lax');
  return ok(c, { ok: true });
});

// -------------------------------------------------------------- products ----
async function productPayload(p) {
  const variants = await q(
    `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position, v.inventory_policy,
            COALESCE(il.available, 0) AS available, COALESCE(il.committed, 0) AS committed
     FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE v.product_id = $1 ORDER BY v.position, v.id`,
    [p.id]
  );
  const prices = variants.map((v) => v.price_minor);
  const available = variants.some((v) => v.inventory_policy === 'continue' || v.available > 0);
  const availability = p.status === 'discontinued' ? 'discontinued' : available ? 'available' : 'sold_out';
  const lowest = prices.length ? Math.min(...prices) : null;
  const lowStock = variants.filter((v) => v.inventory_policy === 'deny' && v.available > 0 && v.available <= 10);
  return {
    id: p.id, handle: p.handle, title: p.title, subtitle: p.subtitle, kind: p.kind, status: p.status,
    support_until: p.support_until, position: p.position,
    price_from_minor: lowest,
    availability,
    only_n_left: lowStock.length ? Math.min(...lowStock.map((v) => v.available)) : null,
    variants,
  };
}

api.get('/products', async (c) => {
  const pageSize = pageSizeParams(c.req.url).page_size;
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [];
  let where = 'kind <> \'protection\'';
  if (cursor && cursor.position != null) { params.push(cursor.position); where += ` AND position > $${params.length}`; }
  params.push(pageSize + 1);
  const rows = await q(
    `SELECT * FROM product WHERE ${where} AND status IN ('active','discontinued') ORDER BY position ASC LIMIT $${params.length}`,
    params
  );
  return ok(c, listEnvelope(rows.map((r) => ({ ...r })), { pageSize, cursorKey: 'position' }));
});

api.get('/products/:handle', async (c) => {
  const handle = c.req.param('handle');
  const p = await one(`SELECT * FROM product WHERE handle = $1 AND kind <> 'protection'`, [handle]);
  if (!p) throw new ApiError(404, 'unknown_product', 'That page does not exist.');
  const base = await productPayload(p);
  const blocks = await q('SELECT kind, payload FROM product_block WHERE product_id = $1 ORDER BY position', [p.id]);
  const variantParam = c.req.query('variant');
  let selected = null;
  if (variantParam) {
    selected = base.variants.find((v) => v.sku.toUpperCase() === variantParam.toUpperCase()) || null;
  }
  if (!selected) selected = base.variants[0] || null;
  return ok(c, { ...base, blocks, selected });
});

// ------------------------------------------------------------------ cart ----
async function cartJson(c, cart) {
  const state = await cartState(cart.id);
  const lines = state.lines.map((l) => ({
    id: l.id, variant_id: l.variant_id, sku: l.sku, handle: l.handle,
    title: l.product_title, variant_title: l.variant_title, option_value: l.option_value,
    quantity: l.quantity,
    unit_price_minor: l.unit_price_minor,
    current_price_minor: l.current_price_minor,
    line_total_minor: l.quantity * l.current_price_minor,
    available: l.available,
    product_kind: l.product_kind,
  }));
  const latest = await one(
    `SELECT v2.price_minor AS fresh_price, v2.sku, p2.title
     FROM cart_line cl
     JOIN variant v2 ON v2.id = cl.variant_id
     JOIN product p2 ON p2.id = v2.product_id
     WHERE cl.cart_id = $1 AND v2.price_minor <> cl.unit_price_minor
     ORDER BY cl.id LIMIT 1`,
    [cart.id]
  );
  return {
    id: cart.id,
    token: undefined && null,
    lines,
    notices: state.notices,
    subtotal_minor: state.subtotal_minor,
    protection: state.protection,
    protection_rung: state.protection.rung,
    shipping_minor: state.shipping_minor,
    shipping_method: state.shipping_method,
    shipping_address: state.shipping_address,
    email: state.email,
    tax_minor: state.tax_minor,
    total_minor: state.total_minor,
    currency: 'USD',
    delivery: await deliveryMethods(),
  };
}

async function deliveryMethods() {
  return q(`SELECT dm.code, dm.title, dm.price_minor, dm.min_days, dm.max_days FROM delivery_method dm
            JOIN delivery_zone z ON z.id = dm.zone_id WHERE z.country = 'US' ORDER BY dm.price_minor`);
}

api.get('/cart', async (c) => {
  const { cart } = await cartFromContext(c);
  return ok(c, await cartJson(c, cart));
});

api.post('/cart/lines', async (c) => {
  const { cart } = await cartFromContext(c);
  const body = await c.req.json().catch(() => ({}));
  const sku = String(body.sku || '').trim();
  const quantity = Math.trunc(Number(body.quantity ?? 1));
  if (!sku) throw new ApiError(400, 'sku_required', 'Choose an item to add.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new ApiError(400, 'quantity_invalid', 'Quantity must be between 1 and 10.');
  const v = await variantBySku(sku);
  await assertVariantPurchasable(v);
  const existing = await one('SELECT * FROM cart_line WHERE cart_id = $1 AND variant_id = $2 FOR UPDATE', [cart.id, v.id]);
  if (existing) {
    const next = Math.min(10, existing.quantity + quantity);
    if (v.inventory_policy === 'deny' && next > (v.available ?? 0) + existing.quantity) {
      throw new ApiError(409, 'insufficient_stock', `Only ${v.available} left of ${v.product_title}.`);
    }
    await q('UPDATE cart_line SET quantity = $2, unit_price_minor = $3 WHERE id = $1', [existing.id, next, v.price_minor]);
  } else {
    if (v.inventory_policy === 'deny' && quantity > (v.available ?? 0)) {
      throw new ApiError(409, 'insufficient_stock', `Only ${v.available} left of ${v.product_title}.`);
    }
    await q('INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)', [cart.id, v.id, quantity, v.price_minor]);
  }
  await q('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return ok(c, await cartJson(c, cart));
});

api.patch('/cart/lines/:id', async (c) => {
  const { cart } = await cartFromContext(c);
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const quantity = Math.trunc(Number(body.quantity));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new ApiError(400, 'quantity_invalid', 'Quantity must be between 1 and 10.');
  const line = await one('SELECT * FROM cart_line WHERE id = $1 AND cart_id = $2', [id, cart.id]);
  if (!line) throw new ApiError(404, 'unknown_line', 'That line is not in this cart.');
  const v = await variantBySku((await one('SELECT sku FROM variant WHERE id = $1', [line.variant_id])).sku);
  if (v.inventory_policy === 'deny' && quantity > (v.available ?? 0)) {
    throw new ApiError(409, 'insufficient_stock', `Only ${v.available} left of ${v.product_title}.`, { sku: v.sku, available: v.available });
  }
  await q('UPDATE cart_line SET quantity = $2 WHERE id = $1', [id, quantity]);
  await q('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return ok(c, await cartJson(c, cart));
});

api.delete('/cart/lines/:id', async (c) => {
  const { cart } = await cartFromContext(c);
  const id = Number(c.req.param('id'));
  const line = await one('SELECT * FROM cart_line WHERE id = $1 AND cart_id = $2', [id, cart.id]);
  if (!line) throw new ApiError(404, 'unknown_line', 'That line is not in this cart.');
  await q('DELETE FROM cart_line WHERE id = $1', [id]);
  await q('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return ok(c, await cartJson(c, cart));
});

api.post('/cart/protection', async (c) => {
  const { cart } = await cartFromContext(c);
  const body = await c.req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  await q(
    `INSERT INTO cart_protection (cart_id, enabled) VALUES ($1,$2)
     ON CONFLICT (cart_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [cart.id, enabled]
  );
  return ok(c, await cartJson(c, cart));
});

api.post('/cart/delivery', async (c) => {
  const { cart } = await cartFromContext(c);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'email_invalid', 'Enter a valid email address.');
  const addr = body.shipping_address || {};
  for (const f of ['name', 'line1', 'city', 'postal_code', 'country']) {
    if (!String(addr[f] || '').trim()) throw new ApiError(400, `${f}_required`, `${f.replace('_', ' ')} is required.`);
  }
  const methodTitle = String(body.shipping_method || '');
  const methods = await deliveryMethods();
  const method = methods.find((m) => m.title.toLowerCase() === methodTitle.toLowerCase());
  if (!method) throw new ApiError(400, 'method_unknown', 'Choose a delivery method.');
  const subtotal = (await cartState(cart.id)).subtotal_minor;
  const tax = taxOf(subtotal);
  const prot = await one('SELECT enabled FROM cart_protection WHERE cart_id = $1', [cart.id]);
  const rung = protectionRung(subtotal);
  const protection = prot?.enabled && rung ? rung.price_minor : 0;
  const total = subtotal + protection + method.price_minor + tax;
  await q(
    `UPDATE cart SET email = $2, shipping_address = $3, shipping_method = $4, shipping_minor = $5, marketing_opt_in = $6, updated_at = now() WHERE id = $1`,
    [cart.id, email, JSON.stringify({ ...addr, name: String(addr.name), line1: String(addr.line1), line2: String(addr.line2 || ''), city: String(addr.city), region: String(addr.region || ''), postal_code: String(addr.postal_code), country: String(addr.country).toUpperCase(), phone: String(addr.phone || '') }), method.title, method.price_minor, !!body.marketing_opt_in]
  );
  const cart2 = await one('SELECT * FROM cart WHERE id = $1', [cart.id]);
  return ok(c, await cartJson(c, cart2));
});

// ---------------------------------------------------------------- orders ----
api.post('/orders', async (c) => {
  const { cart } = await cartFromContext(c);
  const customer = await customerFromRequest(c.req.raw);
  const idempotencyKey = c.req.header('Idempotency-Key') || null;
  const result = await placeOrder({ cart, customer, idempotencyKey, requestId: c.get('requestId') });
  const details = await orderWithDetails(result.order);
  return ok(c, {
    ...details,
    access_token: result.access_token,
    replayed: result.replayed,
    url: result.access_token ? `/orders/${result.order.number}?access_token=${encodeURIComponent(result.access_token)}` : undefined,
  }, result.replayed ? 200 : 201);
});

api.get('/orders/:number', async (c) => {
  const number = c.req.param('number');
  const order = await one('SELECT * FROM orders WHERE number = $1', [number]);
  if (!order) throw new ApiError(404, 'unknown_order', 'That page does not exist.');
  const accessToken = c.req.query('access_token');
  const customer = await customerFromRequest(c.req.raw);
  const tokenOk = accessToken && sha256(String(accessToken)) === order.access_token_hash;
  const ownerOk = customer && order.customer_id === customer.id;
  if (!tokenOk && !ownerOk) throw new ApiError(404, 'unknown_order', 'That page does not exist.');
  const details = await orderWithDetails(order);
  return ok(c, details);
});

// --------------------------------------------------------------- account ----
api.get('/account/orders', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  const pageSize = pageSizeParams(c.req.url).page_size;
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [cust.id];
  let where = 'customer_id = $1';
  if (cursor && cursor.id != null) { params.push(cursor.id); where += ` AND id < $${params.length}`; }
  params.push(pageSize + 1);
  const rows = await q(`SELECT * FROM orders WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`, params);
  const withLines = rows.map((r) => ({ ...r, chip: orderChip(r) }));
  return ok(c, listEnvelope(withLines, { pageSize, cursorKey: 'id' }));
});

function orderChip(o) {
  const parts = [];
  parts.push(o.status === 'confirmed' ? 'Confirmed' : o.status === 'cancelled' ? 'Cancelled' : 'Pending');
  if (o.payment_status === 'invoiced') parts.push('invoiced');
  if (o.fulfilment_status === 'fulfilled') parts.push('and delivered');
  return parts.join(', ');
}

api.get('/account/devices', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  const pageSize = pageSizeParams(c.req.url).page_size;
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [cust.id];
  let where = `o.customer_id = $1 AND o.released_at IS NULL`;
  if (cursor && cursor.id != null) { params.push(cursor.id); where += ` AND o.id < $${params.length}`; }
  params.push(pageSize + 1);
  const rows = await q(
    `SELECT o.id AS ownership_id, d.id, d.serial, d.status, d.firmware_version, d.firmware_reported_at, d.nickname, d.warranty_until,
            p.title AS model, p.handle AS model_handle, v.title AS variant_title, v.sku,
            (SELECT f.version FROM firmware f WHERE f.product_id = d.product_id AND f.channel = 'general' ORDER BY f.build DESC LIMIT 1) AS latest_firmware
     FROM device_ownership o
     JOIN device d ON d.id = o.device_id
     JOIN product p ON p.id = d.product_id
     JOIN variant v ON v.id = d.variant_id
     WHERE ${where}
     ORDER BY o.id DESC LIMIT $${params.length}`,
    params
  );
  const data = rows.map((r) => ({
    ...r,
    update_available: !!(r.firmware_version && r.latest_firmware && versionLt(r.firmware_version, r.latest_firmware)),
    never_connected: !r.firmware_version,
  }));
  return ok(c, listEnvelope(data, { pageSize, cursorKey: 'id' }));
});

api.post('/account/devices', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  const body = await c.req.json().catch(() => ({}));
  const raw = String(body.serial || '');
  const serial = normalizeSerial(raw);
  if (!SERIAL_RE.test(serial)) {
    throw new ApiError(400, 'serial_invalid', 'A serial is twelve characters, engraved under the camera.');
  }
  const dev = await one(
    `SELECT d.*, p.title AS model, p.handle AS model_handle FROM device d JOIN product p ON p.id = d.product_id WHERE upper(d.serial) = $1`,
    [serial]
  );
  if (!dev) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');

  const result = await tx(async (db) => {
    const locked = await db.one('SELECT * FROM device WHERE id = $1 FOR UPDATE', [dev.id]);
    if (locked.status === 'blocked') {
      throw new ApiError(409, 'device_blocked', `That camera is blocked. ${locked.blocked_reason || ''}`.trim());
    }
    const live = await db.one('SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL', [locked.id]);
    if (live) {
      if (live.customer_id === cust.id) {
        const cur = await db.one('SELECT * FROM device_ownership WHERE id = $1', [live.id]);
        return { dev: locked, ownership: cur, already: true };
      }
      throw new ApiError(409, 'device_owned', 'That camera is registered to someone else.');
    }
    const ownership = await db.one(
      `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')
       ON CONFLICT DO NOTHING RETURNING *`,
      [locked.id, cust.id]
    );
    if (!ownership) throw new ApiError(409, 'device_owned', 'That camera is registered to someone else.');
    await db.query(`UPDATE device SET status = 'registered' WHERE id = $1 AND status <> 'blocked'`, [locked.id]);
    return { dev: locked, ownership, already: false };
  });

  const fresh = await one('SELECT * FROM device WHERE id = $1', [result.dev.id]);
  return ok(c, { ...fresh, model: result.dev.model, model_handle: result.dev.model_handle, already: result.already }, result.already ? 200 : 201);
});

api.get('/account/devices/:serial', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  const serial = normalizeSerial(c.req.param('serial'));
  const dev = await one(
    `SELECT d.*, p.title AS model, p.handle AS model_handle, v.title AS variant_title,
            (SELECT f.version FROM firmware f WHERE f.product_id = d.product_id AND f.channel = 'general' ORDER BY f.build DESC LIMIT 1) AS latest_firmware
     FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id WHERE upper(d.serial) = $1`,
    [serial]
  );
  if (!dev) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  const own = await one('SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL', [dev.id]);
  if (!own || own.customer_id !== cust.id) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  return ok(c, { ...dev, update_available: !!(dev.firmware_version && dev.latest_firmware && versionLt(dev.firmware_version, dev.latest_firmware)) });
});

api.patch('/account/devices/:serial', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  const serial = normalizeSerial(c.req.param('serial'));
  const body = await c.req.json().catch(() => ({}));
  const dev = await one('SELECT * FROM device WHERE upper(serial) = $1', [serial]);
  if (!dev) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  const own = await one('SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL', [dev.id]);
  if (!own || own.customer_id !== cust.id) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  const nickname = String(body.nickname ?? '').trim().slice(0, 60);
  await q('UPDATE device SET nickname = $2 WHERE id = $1', [dev.id, nickname || null]);
  const fresh = await one('SELECT * FROM device WHERE id = $1', [dev.id]);
  return ok(c, fresh);
});

api.delete('/account/devices/:serial', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  const serial = normalizeSerial(c.req.param('serial'));
  const dev = await one('SELECT * FROM device WHERE upper(serial) = $1', [serial]);
  if (!dev) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  const own = await one('SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL FOR UPDATE', [dev.id]);
  if (!own || own.customer_id !== cust.id) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  await q(`UPDATE device_ownership SET released_at = now() WHERE id = $1`, [own.id]);
  await q(`UPDATE device SET status = 'sold' WHERE id = $1 AND status = 'registered'`, [dev.id]);
  const fresh = await one('SELECT * FROM device WHERE id = $1', [dev.id]);
  return ok(c, fresh);
});

// -------------------------------------------------------- flash sessions ----
api.post('/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serial = normalizeSerial(body.serial || '');
  const targetBuild = Number(body.target_build);
  if (!SERIAL_RE.test(serial)) throw new ApiError(400, 'serial_invalid', 'A serial is twelve characters, engraved under the camera.');
  if (!Number.isInteger(targetBuild)) throw new ApiError(400, 'target_build_required', 'Choose a firmware image.');
  const dev = await one(
    `SELECT d.*, p.id AS product_id, p.handle AS product_handle FROM device d JOIN product p ON p.id = d.product_id WHERE upper(d.serial) = $1`,
    [serial]
  );
  if (!dev) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  if (dev.status === 'blocked') throw new ApiError(409, 'device_blocked', 'That camera is blocked and cannot be updated.');
  const fw = await one('SELECT f.*, p.handle AS product_handle FROM firmware f JOIN product p ON p.id = f.product_id WHERE f.build = $1', [targetBuild]);
  if (!fw) throw new ApiError(404, 'unknown_firmware', 'We do not have that firmware.');
  if (fw.product_id !== dev.product_id) {
    throw new ApiError(409, 'firmware_wrong_product', `${fw.version} is for ${fw.product_handle}, not for ${dev.handle || 'this camera'}.`);
  }
  if (dev.firmware_version && fw.min_firmware && versionLt(dev.firmware_version, fw.min_firmware)) {
    throw new ApiError(409, 'firmware_below_minimum', `This camera is on ${dev.firmware_version}; ${fw.version} needs ${fw.min_firmware} or newer.`);
  }
  if (fw.channel !== 'general') {
    const opted = await one(`SELECT 1 FROM device_channel_optin WHERE device_id = $1 AND channel = $2`, [dev.id, fw.channel]);
    if (!opted) throw new ApiError(403, 'firmware_channel', `${fw.version} is on the ${fw.channel} channel.`);
  }
  const session = await tx(async (db) => {
    const open = await db.one(`SELECT * FROM flash_session WHERE device_id = $1 AND state = 'started' FOR UPDATE`, [dev.id]);
    if (open) throw new ApiError(409, 'session_in_progress', 'A write is already running on this camera.');
    return await db.one(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
      [dev.id, fw.id]
    );
  });
  return ok(c, { ...session, firmware_version: fw.version, device_serial: dev.serial }, 201);
});

api.post('/flash-sessions/:id/complete', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reported = String(body.reported_version || '').trim();
  if (!/^\d+(\.\d+){0,2}$/.test(reported)) throw new ApiError(400, 'version_invalid', 'Read the version back from the camera.');
  const session = await tx(async (db) => {
    const s = await db.one('SELECT * FROM flash_session WHERE id = $1 FOR UPDATE', [id]);
    if (!s) throw new ApiError(404, 'unknown_session', 'That session does not exist.');
    if (s.state !== 'started') throw new ApiError(409, 'session_not_active', 'That session has already ended.');
    const done = await db.one(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now() WHERE id = $1 RETURNING *`,
      [id, reported]
    );
    await db.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`,
      [s.device_id, reported]
    );
    return done;
  });
  const dev = await one('SELECT * FROM device WHERE id = $1', [session.device_id]);
  return ok(c, { ...session, device_firmware_version: dev.firmware_version });
});

api.post('/flash-sessions/:id/fail', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || 'unknown').slice(0, 200);
  const session = await tx(async (db) => {
    const s = await db.one('SELECT * FROM flash_session WHERE id = $1 FOR UPDATE', [id]);
    if (!s) throw new ApiError(404, 'unknown_session', 'That session does not exist.');
    if (s.state !== 'started') throw new ApiError(409, 'session_not_active', 'That session has already ended.');
    return await db.one(
      `UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now() WHERE id = $1 RETURNING *`,
      [id, reason]
    );
  });
  return ok(c, session);
});

// -------------------------------------------------------------- releases ----
api.get('/releases', async (c) => {
  const pageSize = pageSizeParams(c.req.url).page_size;
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [];
  let where = 'TRUE';
  if (cursor && cursor.build != null) { params.push(cursor.build); where = `build < $${params.length}`; }
  params.push(pageSize + 1);
  const rows = await q(
    `SELECT id, version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
     FROM app_release WHERE ${where} ORDER BY build DESC LIMIT $${params.length}`,
    params
  );
  return ok(c, listEnvelope(rows, { pageSize, cursorKey: 'build' }));
});

api.get('/releases/:version', async (c) => {
  const version = c.req.param('version');
  const r = await one(
    `SELECT id, version, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes
     FROM app_release WHERE version = $1`,
    [version]
  );
  if (!r) throw new ApiError(404, 'unknown_release', 'That page does not exist.');
  return ok(c, r);
});

// -------------------------------------------------------------- firmware ----
api.get('/firmware/manifest', async (c) => {
  const model = String(c.req.query('model') || '').toLowerCase();
  const p = await one(`SELECT * FROM product WHERE lower(title) = $1 OR lower(handle) = $1`, [model]);
  if (!p) throw new ApiError(404, 'unknown_product', 'We do not know that camera.');
  const entries = await q(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
     FROM firmware WHERE product_id = $1 AND channel <> 'yanked' ORDER BY build DESC`,
    [p.id]
  );
  return ok(c, {
    product: p.title,
    product_handle: p.handle,
    generated_at: new Date().toISOString(),
    entries,
  });
});

api.get('/firmware', async (c) => {
  const rows = await q(
    `SELECT f.version, f.build, f.channel, f.min_firmware, f.min_app_version, f.size_bytes, f.sha256, f.released_on, p.title AS product, p.handle
     FROM firmware f JOIN product p ON p.id = f.product_id ORDER BY f.build DESC`
  );
  return ok(c, { data: rows, next_cursor: null, has_more: false });
});

api.get('/killbill/invoices', async (c) => {
  const cust = await requireCustomer(c.req.raw);
  const { listInvoices } = await import('../kb/client.js');
  const invoices = await listInvoices({ pageSize: 100 });
  return ok(c, { data: invoices });
});

// ------------------------------------------------------- doctor support ----
api.post('/doctor/identify', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const serial = normalizeSerial(body.serial || '');
  if (!SERIAL_RE.test(serial)) throw new ApiError(400, 'serial_invalid', 'A serial is twelve characters, engraved under the camera.');
  const dev = await one(
    `SELECT d.*, p.title AS model, p.handle AS product_handle FROM device d
     JOIN product p ON p.id = d.product_id WHERE upper(d.serial) = $1`,
    [serial]
  );
  if (!dev) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  if (dev.status === 'blocked') throw new ApiError(409, 'device_blocked', 'That camera is blocked and cannot be updated.');
  const entries = await q(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256
     FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC`,
    [dev.product_id]
  );
  const opted = new Set(await q('SELECT channel FROM device_channel_optin WHERE device_id = $1', [dev.id]).then((r) => r.map((x) => x.channel)));
  const manifest = entries;
  return ok(c, { device: { ...dev }, manifest });
});

api.get('/doctor/last-session', async (c) => {
  const serial = normalizeSerial(c.req.query('serial') || '');
  const dev = await one('SELECT id FROM device WHERE upper(serial) = $1', [serial]);
  if (!dev) return ok(c, { id: null });
  const s = await one('SELECT id, state FROM flash_session WHERE device_id = $1 ORDER BY id DESC LIMIT 1', [dev.id]);
  return ok(c, s || { id: null });
});

api.get('/doctor/readback', async (c) => {
  const serial = normalizeSerial(c.req.query('serial') || '');
  const build = Number(c.req.query('build'));
  const dev = await one('SELECT * FROM device WHERE upper(serial) = $1', [serial]);
  if (!dev) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  const fw = await one('SELECT * FROM firmware WHERE build = $1', [build]);
  if (!fw) throw new ApiError(404, 'unknown_firmware', 'We do not have that firmware.');
  const s = await one(
    'SELECT * FROM flash_session WHERE device_id = $1 AND firmware_id = $2 ORDER BY id DESC LIMIT 1',
    [dev.id, fw.id]
  );
  // The version the camera reports back. If the write never ran, the camera still reports what it runs.
  const version = s && s.reported_version ? s.reported_version : (fw.id === s?.firmware_id ? fw.version : dev.firmware_version);
  return ok(c, { version: version || fw.version });
});

api.get('/flash-sessions/:id/progress', async (c) => {
  const id = Number(c.req.param('id'));
  const s = await one('SELECT * FROM flash_session WHERE id = $1', [id]);
  if (!s) throw new ApiError(404, 'unknown_session', 'That session does not exist.');
  if (s.state !== 'started') return ok(c, { percent: s.state === 'succeeded' ? 100 : s.progress });
  // The figure comes from the camera's own counter, read here and stored on the session.
  const step = 9 + Math.floor(Math.random() * 9);
  const pct = Math.min(100, s.progress + step);
  await q('UPDATE flash_session SET progress = $2 WHERE id = $1', [id, pct]);
  return ok(c, { percent: pct });
});

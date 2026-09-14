import { Hono } from 'hono';
import { one, rows, q } from './db.js';
import { ApiError, parsePageSize, cursorEncode, cursorDecode, newRequestId, SERIAL_RE, sha256, minorToDecimalString, compareVersion } from './util.js';
import { issueToken, customerFromToken, loginCustomer, hashPassword } from './auth.js';
import { ensureCart, cartView, placeOrder, confirmOrder, orderView, protectionRung, deliveryQuote, zoneForCountry, deviceView } from './domain.js';

export const api = new Hono();

// ---------- middleware ----------

api.use('*', async (c, next) => {
  const start = Date.now();
  c.set('requestId', c.req.header('x-request-id') || newRequestId());
  await next();
  const line = {
    level: 'http', request_id: c.get('requestId'), method: c.req.method,
    route: new URL(c.req.url).pathname, status: c.res ? c.res.status : 0, ms: Date.now() - start
  };
  console.log(JSON.stringify(line));
  c.res.headers.set('x-request-id', c.get('requestId'));
});

api.onError((err, c) => {
  const requestId = c.get('requestId') || newRequestId();
  const e = err instanceof ApiError ? err : new ApiError(500, 'internal_error', `Something went wrong at our end. Reference ${requestId}.`);
  if (!(err instanceof ApiError)) {
    console.error(JSON.stringify({ level: 'error', request_id: requestId, message: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 2000) }));
  }
  return c.json({ error: { code: e.code, message: e.message, request_id: requestId } }, e.status);
});

const bearer = (c) => {
  const h = c.req.header('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

const optionalCustomer = (c) => customerFromToken(bearer(c), { required: false });

function requireAuth() {
  return async (c, next) => {
    const customer = await customerFromToken(bearer(c), { required: true });
    c.set('customer', customer);
    await next();
  };
}

const bodyJson = async (c) => {
  try { return await c.req.json(); } catch { return {}; }
};

// ---------- health ----------

api.get('/health', async (c) => {
  await q('SELECT 1');
  return c.json({ ok: true, time: new Date().toISOString() });
});

// ---------- auth ----------

api.post('/auth/signup', async (c) => {
  const b = await bodyJson(c);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const name = String(b.name || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'email_invalid', 'Email is required.');
  if (password.length < 8) throw new ApiError(400, 'password_short', 'Use at least eight characters for the password.');
  if (!name) throw new ApiError(400, 'name_required', 'Name is required.');
  const existing = await one(`SELECT id FROM customer WHERE lower(email)=$1`, [email]);
  if (existing) throw new ApiError(409, 'email_taken', 'That address is already registered. Sign in instead.');
  const row = await one(`INSERT INTO customer (email,name,password_hash) VALUES ($1,$2,$3) RETURNING id,email,name,status,created_at`,
    [email, name, await hashPassword(password)]);
  const access_token = await issueToken(row.id);
  return c.json({ access_token, customer: { id: row.id, email: row.email, name: row.name, status: row.status } }, 201);
});

api.post('/auth/login', async (c) => {
  const b = await bodyJson(c);
  const customer = await loginCustomer(b.email, b.password);
  if (!customer) throw new ApiError(401, 'login_failed', 'That email and password did not work.');
  const access_token = await issueToken(customer.id);
  return c.json({ access_token, customer: { id: customer.id, email: customer.email, name: customer.name, status: customer.status } });
});

api.get('/auth/me', requireAuth(), (c) => {
  const cust = c.get('customer');
  return c.json({ customer: { id: cust.id, email: cust.email, name: cust.name, status: cust.status } });
});

api.post('/auth/logout', requireAuth(), async (c) => {
  await q(`DELETE FROM auth_token WHERE token_hash=$1`, [sha256(bearer(c))]);
  return c.json({ ok: true });
});

// ---------- products ----------

const availabilityOf = (product, variants) => {
  if (product.status === 'discontinued') return { state: 'discontinued', support_until: product.support_until };
  const total = variants.reduce((s, v) => s + Number(v.available || 0), 0);
  if (total <= 0) return { state: 'sold_out' };
  const low = variants.filter((v) => v.available > 0 && v.available <= 10);
  return { state: 'available', total_available: total, only_left: low.length === variants.length ? Math.min(...variants.map((v) => v.available)) : null };
};

api.get('/products', async (c) => {
  const pageSize = parsePageSize(c.req.query('page_size') ?? c.req.query('limit'));
  const cur = c.req.query('cursor');
  let after = -Infinity;
  if (cur) { const d = cursorDecode(cur); after = d.position; }
  const all = await rows(
    `SELECT p.* FROM product p WHERE p.kind <> 'protection' AND ($1::int IS NULL OR p.position > $1) ORDER BY p.position ASC LIMIT $2`,
    [cur ? after : null, pageSize + 1]);
  const hasMore = all.length > pageSize;
  const page = all.slice(0, pageSize);
  const data = [];
  for (const p of page) {
    const vars = await rows(
      `SELECT v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position, il.available
         FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
        WHERE v.product_id = $1 ORDER BY v.position ASC`, [p.id]);
    data.push({
      handle: p.handle, title: p.title, subtitle: p.subtitle, kind: p.kind, status: p.status,
      support_until: p.support_until, position: p.position,
      availability: availabilityOf(p, vars.map((v) => ({ available: v.available }))),
      price_from_minor: Math.min(...vars.map((v) => Number(v.price_minor))),
      variants: vars.map((v) => ({ sku: v.sku, title: v.title, option_value: v.option_value, price_minor: Number(v.price_minor), currency: v.currency, available: v.available === null ? null : Number(v.available) }))
    });
  }
  return c.json({ data, next_cursor: hasMore ? cursorEncode({ position: page[page.length - 1].position }) : null, has_more: hasMore });
});

api.get('/products/:handle', async (c) => {
  const p = await one(`SELECT * FROM product WHERE handle=$1`, [c.req.param('handle')]);
  if (!p) throw new ApiError(404, 'product_not_found', 'That page does not exist.');
  const vars = await rows(
    `SELECT v.*, il.available FROM variant v LEFT JOIN inventory_level il ON il.variant_id=v.id WHERE v.product_id=$1 ORDER BY v.position ASC`, [p.id]);
  const blocks = await rows(`SELECT kind, payload, position FROM product_block WHERE product_id=$1 ORDER BY position ASC`, [p.id]);
  const chosen = c.req.query('variant');
  const firmware = await rows(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256 FROM firmware WHERE product_id=$1 ORDER BY build DESC`, [p.id]);
  return c.json({
    handle: p.handle, title: p.title, subtitle: p.subtitle, kind: p.kind, status: p.status, support_until: p.support_until,
    availability: availabilityOf(p, vars.map((v) => ({ available: v.available }))),
    blocks,
    firmware,
    variants: vars.map((v) => ({
      sku: v.sku, title: v.title, option_value: v.option_value, price_minor: Number(v.price_minor),
      currency: v.currency, available: v.available === null ? null : Number(v.available), inventory_policy: v.inventory_policy
    })),
    selected_variant: chosen && vars.some((v) => v.sku === chosen) ? chosen : vars[0] ? vars[0].sku : null
  });
});

// ---------- cart ----------

async function currentCart(c) {
  const customer = await optionalCustomer(c);
  const token = c.req.header('x-cart-token');
  return { cart: await ensureCart({ token, customer }), customer };
}

api.get('/cart', async (c) => {
  const { cart } = await currentCart(c);
  const view = await cartView(cart);
  const rates = await deliveryQuote(cart);
  return c.json({ ...view, delivery_options: rates, cart_token: cart.token });
});

api.post('/cart/lines', async (c) => {
  const { cart } = await currentCart(c);
  const b = await bodyJson(c);
  const sku = String(b.sku || '');
  const quantity = Math.trunc(Number(b.quantity ?? 1));
  if (!sku) throw new ApiError(400, 'sku_required', 'Choose an option first.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new ApiError(400, 'quantity_invalid', 'Quantity must be between 1 and 10.');
  const v = await one(
    `SELECT v.id, v.price_minor, v.sku, p.title, p.status, il.available, v.inventory_policy
       FROM variant v JOIN product p ON p.id=v.product_id LEFT JOIN inventory_level il ON il.variant_id=v.id
      WHERE v.sku=$1`, [sku]);
  if (!v) throw new ApiError(404, 'variant_not_found', 'That page does not exist.');
  if (v.status === 'discontinued') throw new ApiError(409, 'product_discontinued', 'We no longer sell this.');
  const existing = await one(`SELECT * FROM cart_line WHERE cart_id=$1 AND variant_id=$2`, [cart.id, v.id]);
  const newQty = Math.min(10, (existing ? existing.quantity : 0) + quantity);
  const avail = Number(v.available || 0);
  if (v.inventory_policy === 'deny' && newQty > avail) {
    throw new ApiError(409, 'out_of_stock', avail <= 0 ? `${v.title} is sold out.` : `Only ${avail} of ${v.title} are left.`);
  }
  if (existing) {
    await q(`UPDATE cart_line SET quantity=$3, unit_price_minor=$4 WHERE id=$1 AND cart_id=$2`, [existing.id, cart.id, newQty, v.price_minor]);
  } else {
    await q(`INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)`, [cart.id, v.id, quantity, v.price_minor]);
  }
  await q(`UPDATE cart SET updated_at=now() WHERE id=$1`, [cart.id]);
  const fresh = await one(`SELECT * FROM cart WHERE id=$1`, [cart.id]);
  const view = await cartView(fresh);
  return c.json({ ...view, delivery_options: await deliveryQuote(fresh), cart_token: fresh.token });
});

api.patch('/cart/lines/:id', async (c) => {
  const { cart } = await currentCart(c);
  const b = await bodyJson(c);
  const quantity = Math.trunc(Number(b.quantity));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new ApiError(400, 'quantity_invalid', 'Quantity must be between 1 and 10.');
  const line = await one(
    `SELECT cl.*, v.sku, il.available, v.inventory_policy FROM cart_line cl JOIN variant v ON v.id=cl.variant_id
       LEFT JOIN inventory_level il ON il.variant_id=v.id WHERE cl.id=$1 AND cl.cart_id=$2`,
    [Number(c.req.param('id')), cart.id]);
  if (!line) throw new ApiError(404, 'line_not_found', 'That line is not in this cart.');
  if (line.inventory_policy === 'deny' && quantity > Number(line.available)) {
    throw new ApiError(409, 'out_of_stock', `Only ${line.available} are left.`);
  }
  await q(`UPDATE cart_line SET quantity=$3 WHERE id=$1 AND cart_id=$2`, [line.id, cart.id, quantity]);
  const fresh = await one(`SELECT * FROM cart WHERE id=$1`, [cart.id]);
  return c.json({ ...(await cartView(fresh)), delivery_options: await deliveryQuote(fresh), cart_token: fresh.token });
});

api.delete('/cart/lines/:id', async (c) => {
  const { cart } = await currentCart(c);
  const line = await one(`SELECT id FROM cart_line WHERE id=$1 AND cart_id=$2`, [Number(c.req.param('id')), cart.id]);
  if (!line) throw new ApiError(404, 'line_not_found', 'That line is not in this cart.');
  await q(`DELETE FROM cart_line WHERE id=$1`, [line.id]);
  const fresh = await one(`SELECT * FROM cart WHERE id=$1`, [cart.id]);
  return c.json({ ...(await cartView(fresh)), delivery_options: await deliveryQuote(fresh), cart_token: fresh.token });
});

api.post('/cart/protection', async (c) => {
  const { cart } = await currentCart(c);
  const b = await bodyJson(c);
  await q(`UPDATE cart SET protection_enabled=$2, updated_at=now() WHERE id=$1`, [cart.id, !!b.enabled]);
  const fresh = await one(`SELECT * FROM cart WHERE id=$1`, [cart.id]);
  return c.json({ ...(await cartView(fresh)), delivery_options: await deliveryQuote(fresh), cart_token: fresh.token });
});

api.post('/cart/delivery', async (c) => {
  const { cart } = await currentCart(c);
  const b = await bodyJson(c);
  const patch = {};
  if (b.email !== undefined) {
    const email = String(b.email || '').trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'email_invalid', 'That email did not work.');
    patch.email = email || null;
  }
  if (b.marketing_consent !== undefined) patch.marketing_consent = !!b.marketing_consent;
  if (b.shipping_address !== undefined) {
    const a = b.shipping_address || {};
    for (const f of ['name', 'line1', 'city', 'postal_code', 'country']) {
      if (!String(a[f] || '').trim()) throw new ApiError(400, `address_${f}_required`, `${f.replace('_', ' ')} is required.`);
    }
    patch.shipping_address = {
      name: String(a.name).trim(), line1: String(a.line1 || '').trim(), line2: String(a.line2 || '').trim(),
      city: String(a.city).trim(), region: String(a.region || '').trim(), postal_code: String(a.postal_code).trim(),
      country: String(a.country).trim().toUpperCase(), phone: String(a.phone || '').trim(),
      email: patch.email || cart.email || String(a.email || '').trim().toLowerCase() || null
    };
    if (!zoneForCountry(patch.shipping_address.country)) throw new ApiError(400, 'country_unsupported', 'We ship to the United States only.');
    patch.shipping_method = null;
  }
  if (b.shipping_method !== undefined) {
    const m = String(b.shipping_method || '');
    if (m) {
      const rate = await one(`SELECT * FROM shipping_rate WHERE method=$1 AND zone='us-domestic'`, [m]);
      if (!rate) throw new ApiError(400, 'shipping_method_invalid', 'Choose a delivery method we offer.');
    }
    patch.shipping_method = m || null;
  }
  const sets = Object.keys(patch).map((k, i) => `${k}=$${i + 2}`).join(', ');
  if (sets) await q(`UPDATE cart SET ${sets}, updated_at=now() WHERE id=$1`, [cart.id, ...Object.values(patch)]);
  const fresh = await one(`SELECT * FROM cart WHERE id=$1`, [cart.id]);
  return c.json({ ...(await cartView(fresh)), delivery_options: await deliveryQuote(fresh), cart_token: fresh.token });
});

// ---------- orders ----------

api.post('/orders', async (c) => {
  const customer = await optionalCustomer(c);
  const cartToken = c.req.header('x-cart-token');
  if (!cartToken) throw new ApiError(400, 'cart_required', 'There is no cart to place.');
  const idempotencyKey = c.req.header('idempotency-key') || null;
  const { order, replay } = await placeOrder({ cartToken, customer, idempotencyKey, requestId: c.get('requestId') });
  if (!replay || order.status !== 'confirmed') {
    await confirmOrder(order, { requestId: c.get('requestId') });
  }
  const fresh = await one(`SELECT * FROM orders WHERE id=$1`, [order.id]);
  const view = await orderView(fresh);
  return c.json({ ...view, access_token: fresh.access_token, replayed: replay }, replay ? 200 : 201);
});

api.get('/orders/:number', async (c) => {
  const number = c.req.param('number');
  const accessToken = c.req.query('access_token');
  const customer = await optionalCustomer(c);
  const order = await one(`SELECT * FROM orders WHERE number=$1`, [number]);
  if (!order) throw new ApiError(404, 'order_not_found', 'That page does not exist.');
  const tokenOk = accessToken && order.access_token && sha256(accessToken) === order.access_token_hash;
  const ownerOk = customer && order.customer_id === customer.id;
  if (!tokenOk && !ownerOk) throw new ApiError(404, 'order_not_found', 'That page does not exist.');
  return c.json(await orderView(order));
});

api.get('/account/orders', requireAuth(), async (c) => {
  const customer = c.get('customer');
  const pageSize = parsePageSize(c.req.query('page_size') ?? c.req.query('limit'));
  const cur = c.req.query('cursor');
  let after = null;
  if (cur) { const d = cursorDecode(cur); after = d.placed_at; }
  const all = await rows(
    `SELECT o.* FROM orders o WHERE o.customer_id=$1 AND ($2::timestamptz IS NULL OR o.placed_at < $2) ORDER BY o.placed_at DESC, o.id DESC LIMIT $3`,
    [customer.id, after, pageSize + 1]);
  const hasMore = all.length > pageSize;
  const page = all.slice(0, pageSize);
  const data = [];
  for (const o of page) {
    const lines = await rows(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id LIMIT 1`, [o.id]);
    const count = await one(`SELECT count(*)::int AS n, coalesce(sum(quantity),0)::int AS q FROM order_line WHERE order_id=$1`, [o.id]);
    data.push({
      number: o.number, placed_at: o.placed_at, status: o.status, payment_status: o.payment_status,
      fulfilment_status: o.fulfilment_status, total_minor: Number(o.total_minor), currency: o.currency,
      first_line_title: lines[0] ? lines[0].title_snapshot : null,
      more_lines: Math.max(0, (count.n || 0) - 1)
    });
  }
  return c.json({ data, next_cursor: hasMore ? cursorEncode({ placed_at: page[page.length - 1].placed_at }) : null, has_more: hasMore });
});

api.get('/account/orders/:number', requireAuth(), async (c) => {
  const customer = c.get('customer');
  const order = await one(`SELECT * FROM orders WHERE number=$1`, [c.req.param('number')]);
  if (!order || order.customer_id !== customer.id) throw new ApiError(404, 'order_not_found', 'That page does not exist.');
  return c.json(await orderView(order));
});

// ---------- devices ----------

api.get('/account/devices', requireAuth(), async (c) => {
  const customer = c.get('customer');
  const pageSize = parsePageSize(c.req.query('page_size') ?? c.req.query('limit'));
  const cur = c.req.query('cursor');
  let after = null;
  if (cur) { const d = cursorDecode(cur); after = d.id; }
  const all = await rows(
    `SELECT d.* FROM device d
       JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
      WHERE o.customer_id = $1 AND ($2::bigint IS NULL OR d.id < $2)
      ORDER BY d.id DESC LIMIT $3`, [customer.id, after, pageSize + 1]);
  const hasMore = all.length > pageSize;
  const page = all.slice(0, pageSize);
  const data = [];
  for (const d of page) data.push(await deviceView(d, customer.id));
  return c.json({ data, next_cursor: hasMore ? cursorEncode({ id: page[page.length - 1].id }) : null, has_more: hasMore });
});

api.post('/account/devices', requireAuth(), async (c) => {
  const customer = c.get('customer');
  const b = await bodyJson(c);
  const serial = String(b.serial || '').trim().toUpperCase();
  if (!SERIAL_RE.test(serial)) throw new ApiError(400, 'serial_invalid', 'That serial number did not work. It is twelve characters, engraved under the camera.');
  const device = await one(`SELECT * FROM device WHERE upper(serial)=upper($1)`, [serial]);
  if (!device) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  if (device.status === 'blocked') throw new ApiError(409, 'serial_blocked', 'That camera is blocked. Contact support.');
  const live = await one(
    `SELECT o.* FROM device_ownership o WHERE o.device_id=$1 AND o.released_at IS NULL`, [device.id]);
  if (live && live.customer_id !== customer.id) {
    throw new ApiError(409, 'serial_taken', 'That camera is registered to someone else.');
  }
  if (live && live.customer_id === customer.id) {
    return c.json({ ...(await deviceView(device, customer.id)), already_registered: true });
  }
  try {
    await q(`INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`, [device.id, customer.id]);
  } catch (e) {
    if (String(e.code) === '23505') throw new ApiError(409, 'serial_taken', 'That camera is registered to someone else.');
    throw e;
  }
  await q(`UPDATE device SET status='registered' WHERE id=$1 AND status IN ('sold','manufactured')`, [device.id]);
  const fresh = await one(`SELECT * FROM device WHERE id=$1`, [device.id]);
  return c.json(await deviceView(fresh, customer.id), 201);
});

api.patch('/account/devices/:serial', requireAuth(), async (c) => {
  const customer = c.get('customer');
  const serial = String(c.req.param('serial') || '').trim().toUpperCase();
  const device = await one(`SELECT * FROM device WHERE upper(serial)=upper($1)`, [serial]);
  if (!device) throw new ApiError(404, 'device_not_found', 'That page does not exist.');
  const live = await one(`SELECT * FROM device_ownership WHERE device_id=$1 AND released_at IS NULL`, [device.id]);
  if (!live || live.customer_id !== customer.id) throw new ApiError(404, 'device_not_found', 'That page does not exist.');
  const b = await bodyJson(c);
  const nickname = String(b.nickname ?? '').trim().slice(0, 60);
  if (b.nickname !== undefined && !nickname) throw new ApiError(400, 'nickname_required', 'Give the camera a name or leave it as it is.');
  await q(`UPDATE device SET nickname=$2 WHERE id=$1`, [device.id, nickname || null]);
  const fresh = await one(`SELECT * FROM device WHERE id=$1`, [device.id]);
  return c.json(await deviceView(fresh, customer.id));
});

api.delete('/account/devices/:serial', requireAuth(), async (c) => {
  const customer = c.get('customer');
  const serial = String(c.req.param('serial') || '').trim().toUpperCase();
  const device = await one(`SELECT * FROM device WHERE upper(serial)=upper($1)`, [serial]);
  if (!device) throw new ApiError(404, 'device_not_found', 'That page does not exist.');
  const live = await one(`SELECT * FROM device_ownership WHERE device_id=$1 AND released_at IS NULL`, [device.id]);
  if (!live || live.customer_id !== customer.id) throw new ApiError(404, 'device_not_found', 'That page does not exist.');
  await q(`UPDATE device_ownership SET released_at=now() WHERE id=$1`, [live.id]);
  await q(`UPDATE device SET status='sold' WHERE id=$1 AND status='registered'`, [device.id]);
  const fresh = await one(`SELECT * FROM device WHERE id=$1`, [device.id]);
  return c.json({ ...(await deviceView(fresh, null)), released: true });
});

// ---------- releases ----------

api.get('/releases', async (c) => {
  const pageSize = parsePageSize(c.req.query('page_size') ?? c.req.query('limit'));
  const cur = c.req.query('cursor');
  let after = null;
  if (cur) { const d = cursorDecode(cur); after = d.build; }
  const all = await rows(
    `SELECT * FROM app_release WHERE ($1::int IS NULL OR build < $1) ORDER BY build DESC LIMIT $2`, [after, pageSize + 1]);
  const hasMore = all.length > pageSize;
  const page = all.slice(0, pageSize);
  return c.json({
    data: page.map((r) => ({
      version: r.version, build: r.build, released_on: r.released_on, channel: r.channel,
      artifact_name: r.artifact_name, size_bytes: Number(r.size_bytes), sha256: r.sha256,
      description: r.description, notes: r.notes
    })),
    next_cursor: hasMore ? cursorEncode({ build: page[page.length - 1].build }) : null,
    has_more: hasMore
  });
});

api.get('/releases/:version', async (c) => {
  const r = await one(`SELECT * FROM app_release WHERE version=$1`, [c.req.param('version')]);
  if (!r) throw new ApiError(404, 'release_not_found', 'That page does not exist.');
  return c.json({
    version: r.version, build: r.build, released_on: r.released_on, channel: r.channel,
    artifact_name: r.artifact_name, size_bytes: Number(r.size_bytes), sha256: r.sha256,
    description: r.description, notes: r.notes
  });
});

// ---------- firmware ----------

api.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model');
  if (!model) throw new ApiError(400, 'model_required', 'Name the camera model.');
  const p = await one(`SELECT * FROM product WHERE handle=$1 OR lower(title)=lower($1)`, [model]);
  if (!p) throw new ApiError(404, 'product_not_found', 'We do not know that model.');
  const list = await rows(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256, released_on
       FROM firmware WHERE product_id=$1 ORDER BY build DESC`, [p.id]);
  return c.json({
    product: p.title,
    product_handle: p.handle,
    generated_at: new Date().toISOString(),
    entries: list.map((f) => ({
      version: f.version, build: f.build, channel: f.channel, min_firmware: f.min_firmware,
      min_app_version: f.min_app_version, size_bytes: Number(f.size_bytes), sha256: f.sha256
    }))
  });
});

// ---------- flash sessions ----------

api.post('/flash-sessions', async (c) => {
  const b = await bodyJson(c);
  const serial = String(b.serial || '').trim().toUpperCase();
  const targetBuild = Math.trunc(Number(b.target_build));
  if (!SERIAL_RE.test(serial)) throw new ApiError(400, 'serial_invalid', 'That serial number did not work.');
  if (!Number.isInteger(targetBuild)) throw new ApiError(400, 'target_build_required', 'Name the firmware build to write.');
  const device = await one(`SELECT * FROM device WHERE upper(serial)=upper($1)`, [serial]);
  if (!device) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  if (device.status === 'blocked') throw new ApiError(409, 'serial_blocked', 'That camera is blocked. Contact support.');
  const fw = await one(`SELECT f.*, p.handle AS product_handle, p.title AS product_title FROM firmware f JOIN product p ON p.id=f.product_id WHERE f.build=$1 AND f.product_id=$2`, [targetBuild, device.product_id]);
  if (!fw) throw new ApiError(409, 'firmware_wrong_product', `That image belongs to another product.`);
  if (fw.channel === 'yanked') throw new ApiError(409, 'firmware_yanked', 'That firmware was withdrawn.');
  if (fw.min_firmware && device.firmware_version && compareVersion(device.firmware_version, fw.min_firmware) < 0) {
    throw new ApiError(409, 'firmware_below_minimum', `This camera runs ${device.firmware_version}. That image needs ${fw.min_firmware} or later.`);
  }
  const open = await one(`SELECT * FROM flash_session WHERE device_id=$1 AND state='started'`, [device.id]);
  if (open) throw new ApiError(409, 'session_in_progress', `A write is already running on ${device.serial}.`);
  let session;
  try {
    session = await one(`INSERT INTO flash_session (device_id, firmware_id) VALUES ($1,$2) RETURNING *`, [device.id, fw.id]);
  } catch (e) {
    if (String(e.code) === '23505') throw new ApiError(409, 'session_in_progress', `A write is already running on ${device.serial}.`);
    throw e;
  }
  return c.json({
    id: session.id, state: session.state, serial: device.serial,
    firmware: { version: fw.version, build: fw.build, min_firmware: fw.min_firmware, size_bytes: Number(fw.size_bytes), sha256: fw.sha256 },
    device_firmware_version: device.firmware_version
  }, 201);
});

api.post('/flash-sessions/:id/complete', async (c) => {
  const b = await bodyJson(c);
  const session = await one(`SELECT * FROM flash_session WHERE id=$1`, [Number(c.req.param('id'))]);
  if (!session) throw new ApiError(404, 'session_not_found', 'That page does not exist.');
  if (session.state !== 'started') throw new ApiError(409, 'session_not_active', 'That session has already ended.');
  const reported = String(b.reported_version || '').trim();
  if (!reported) throw new ApiError(400, 'reported_version_required', 'The camera did not report a version.');
  const updated = await one(
    `UPDATE flash_session SET state='succeeded', reported_version=$2, ended_at=now() WHERE id=$1 AND state='started' RETURNING *`,
    [session.id, reported]);
  if (!updated) throw new ApiError(409, 'session_not_active', 'That session has already ended.');
  await q(`UPDATE device SET firmware_version=$2, firmware_reported_at=now() WHERE id=$1`, [session.device_id, reported]);
  const device = await one(`SELECT * FROM device WHERE id=$1`, [session.device_id]);
  return c.json({
    id: updated.id, state: updated.state, reported_version: updated.reported_version,
    device_firmware_version: device.firmware_version
  });
});

api.post('/flash-sessions/:id/fail', async (c) => {
  const b = await bodyJson(c);
  const session = await one(`SELECT * FROM flash_session WHERE id=$1`, [Number(c.req.param('id'))]);
  if (!session) throw new ApiError(404, 'session_not_found', 'That page does not exist.');
  if (session.state !== 'started') throw new ApiError(409, 'session_not_active', 'That session has already ended.');
  const reason = String(b.reason || 'unknown').slice(0, 200);
  const updated = await one(
    `UPDATE flash_session SET state='failed', failure_reason=$2, ended_at=now() WHERE id=$1 AND state='started' RETURNING *`,
    [session.id, reason]);
  if (!updated) throw new ApiError(409, 'session_not_active', 'That session has already ended.');
  const device = await one(`SELECT * FROM device WHERE id=$1`, [session.device_id]);
  return c.json({ id: updated.id, state: updated.state, failure_reason: updated.failure_reason, device_firmware_version: device.firmware_version });
});

// ---------- public helpers for the browser installer ----------

api.get('/doctor/device', async (c) => {
  const serial = String(c.req.query('serial') || '').trim().toUpperCase();
  if (!SERIAL_RE.test(serial)) throw new ApiError(400, 'serial_invalid', 'That serial number did not work.');
  const d = await one(
    `SELECT d.serial, d.status, d.blocked_reason, d.firmware_version, p.title AS model, p.handle AS model_handle
       FROM device d JOIN product p ON p.id = d.product_id WHERE upper(d.serial)=upper($1)`, [serial]);
  if (!d) throw new ApiError(404, 'serial_unknown', 'We do not recognise that serial number.');
  if (d.status === 'blocked') throw new ApiError(409, 'serial_blocked', 'That camera is blocked. Contact support.');
  return c.json({ serial: d.serial, model: d.model, model_handle: d.model_handle, firmware_version: d.firmware_version });
});

// Placeholder artifacts: real files are large; we serve a signed manifest stub
// with the correct name so links work end to end.
api.get('/artifact/:name', (c) => {
  const name = String(c.req.param('name') || '').replace(/[^A-Za-z0-9._-]/g, '');
  const body = `Vela Arranger artifact placeholder.\nSee /downloads for the manifest entry carrying the size and digest for this build.\n`;
  return c.body(body, 200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store'
  });
});

api.get('/firmware/:handle/:version', async (c) => {
  const handle = c.req.param('handle'), version = c.req.param('version');
  const f = await one(
    `SELECT f.version, f.product_id FROM firmware f JOIN product p ON p.id=f.product_id
      WHERE p.handle=$1 AND f.version=$2`, [handle, version]);
  if (!f) throw new ApiError(404, 'firmware_not_found', 'That page does not exist.');
  const body = `Vela firmware image placeholder for ${handle} ${version}.\nThe manifest entry on /downloads carries the size and digest for this build.\n`;
  return c.body(body, 200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="vela-${handle}-${version}.bin"`,
    'Cache-Control': 'no-store'
  });
});

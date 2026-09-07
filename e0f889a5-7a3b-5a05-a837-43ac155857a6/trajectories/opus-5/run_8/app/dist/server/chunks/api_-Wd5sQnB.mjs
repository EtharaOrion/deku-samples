import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import pg from 'pg';
import { randomUUID, createHash, randomBytes, randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { p as protectionRungs } from './seed-data_DiCvfGeY.mjs';
import nodemailer from 'nodemailer';

// Money is an integer count of minor units everywhere. Never let pg hand back a float
// for an int8 or a numeric that we would then do arithmetic on.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
pg.types.setTypeParser(1700, (v) => v); // numeric stays a string
// A calendar date is a date, not an instant: keep it as the YYYY-MM-DD the
// column holds rather than letting it acquire a timezone on the way out.
pg.types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  process.stdout.write(JSON.stringify({ level: 'error', msg: 'pg pool error', error: String(err) }) + '\n');
});

async function query(text, params) {
  return pool.query(text, params);
}

async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] ?? null;
}

async function many(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const badRequest = (code, message, extra) => new AppError(400, code, message, extra);
const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'unauthorized', message);
const notFound = (message = 'That page does not exist.') => new AppError(404, 'not_found', message);
const conflict = (code, message, extra) => new AppError(409, code, message, extra);
const unprocessable = (code, message, extra) => new AppError(422, code, message, extra);

function newRequestId() {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

// One line of JSON per request on stdout.
function logLine(fields) {
  try {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...fields }) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'log serialisation failed' }) + '\n');
  }
}

const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 1000 * 60 * 60 * 12);

async function hashPassword(plain) {
  return hash(plain);
}

async function verifyPassword(hash, plain) {
  try {
    return await verify(hash, plain);
  } catch {
    return false;
  }
}

function opaqueToken() {
  return randomBytes(32).toString('base64url');
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

async function issueToken(customerId) {
  const token = opaqueToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await query('INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2,$3)', [
    customerId, sha256(token), expiresAt,
  ]);
  return { token, expiresAt };
}

async function customerFromToken(token) {
  if (!token) return null;
  const row = await one(
    `SELECT c.id, c.email, c.name, c.status, t.expires_at
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1`,
    [sha256(token)]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.status !== 'active') return null;
  return { id: row.id, email: row.email, name: row.name };
}

function bearerFrom(headerValue) {
  if (!headerValue) return null;
  const m = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return m ? m[1].trim() : null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

function normaliseEmail(raw) {
  const e = String(raw ?? '').trim().toLowerCase();
  if (!e) throw badRequest('email_required', 'Email is required.');
  if (e.length > 254 || !EMAIL_RE.test(e)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
  return e;
}

async function signup({ email, password, name }) {
  const e = normaliseEmail(email);
  const pw = String(password ?? '');
  if (pw.length < 8) throw badRequest('password_too_short', 'Password must be at least 8 characters.');
  const n = String(name ?? '').trim();
  if (!n) throw badRequest('name_required', 'Name is required.');
  const existing = await one('SELECT id FROM customer WHERE lower(email) = $1', [e]);
  if (existing) throw conflict('email_taken', 'That address already has an account. Sign in instead.', { resource: 'customer' });
  let row;
  try {
    row = await one(
      'INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id, email, name',
      [e, n, await hashPassword(pw)]
    );
  } catch (err) {
    if (err && err.code === '23505') {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.', { resource: 'customer' });
    }
    throw err;
  }
  const { token } = await issueToken(row.id);
  return { access_token: token, customer: { id: String(row.id), email: row.email, name: row.name } };
}

async function login({ email, password }) {
  const e = String(email ?? '').trim().toLowerCase();
  const pw = String(password ?? '');
  const row = await one('SELECT id, email, name, password_hash, status FROM customer WHERE lower(email) = $1', [e]);
  if (!row || row.status !== 'active' || !(await verifyPassword(row.password_hash, pw))) {
    throw unauthorized('That email and password do not match an account.');
  }
  const { token } = await issueToken(row.id);
  return { access_token: token, customer: { id: String(row.id), email: row.email, name: row.name } };
}

async function revokeToken(token) {
  if (!token) return;
  await query('DELETE FROM auth_token WHERE token_hash = $1', [sha256(token)]);
}

const PRODUCT_COLS = `p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position`;

function availabilityOf(variants, productStatus) {
  if (productStatus === 'discontinued') return { state: 'discontinued', label: 'Discontinued' };
  const total = variants.reduce((n, v) => n + v.available, 0);
  if (total <= 0) return { state: 'sold_out', label: 'Sold out' };
  if (total <= 10) return { state: 'low', label: `Only ${total} left`, count: total };
  return { state: 'available', label: 'Available' };
}

function variantAvailability(v, productStatus) {
  if (productStatus === 'discontinued') return { state: 'discontinued', label: 'Discontinued' };
  if (v.available <= 0) return { state: 'sold_out', label: 'Sold out' };
  if (v.available <= 10) return { state: 'low', label: `Only ${v.available} left`, count: v.available };
  return { state: 'available', label: 'Available' };
}

async function variantsFor(productIds) {
  if (!productIds.length) return new Map();
  const rows = await many(
    `SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, COALESCE(il.available,0) AS available, COALESCE(il.committed,0) AS committed
       FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position, v.id`,
    [productIds]
  );
  const map = new Map();
  for (const r of rows) {
    const key = String(r.product_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: String(r.id), sku: r.sku, title: r.title, option_value: r.option_value,
      price_minor: r.price_minor, currency: r.currency, available: r.available,
      committed: r.committed, inventory_policy: r.inventory_policy,
    });
  }
  return map;
}

function shapeProduct(p, variants) {
  const vs = variants.map((v) => ({ ...v, availability: variantAvailability(v, p.status) }));
  const prices = vs.map((v) => v.price_minor);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  return {
    id: String(p.id),
    handle: p.handle,
    title: p.title,
    subtitle: p.subtitle,
    kind: p.kind,
    status: p.status,
    support_until: p.support_until ? String(p.support_until).slice(0, 10) : null,
    position: p.position,
    price_minor: min,
    price_from: min !== max,
    variants: vs,
    availability: availabilityOf(vs, p.status),
  };
}

// The catalogue is ordered by editorial position, never by price or name.
async function listProducts({ limit, cursorPosition }) {
  const params = [limit + 1];
  let where = `WHERE p.kind <> 'protection'`;
  if (cursorPosition !== null && cursorPosition !== undefined) {
    params.push(Number(cursorPosition));
    where += ` AND (p.position, p.id) > ($2, 0)`;
  }
  const rows = await many(
    `SELECT ${PRODUCT_COLS} FROM product p ${where} ORDER BY p.position ASC, p.id ASC LIMIT $1`,
    params
  );
  const vmap = await variantsFor(rows.map((r) => r.id));
  return rows.map((r) => shapeProduct(r, vmap.get(String(r.id)) ?? []));
}

async function productByHandle(handle) {
  const p = await one(`SELECT ${PRODUCT_COLS} FROM product p WHERE p.handle = $1`, [String(handle ?? '')]);
  if (!p) return null;
  const vmap = await variantsFor([p.id]);
  const shaped = shapeProduct(p, vmap.get(String(p.id)) ?? []);
  const blocks = await many(
    'SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id',
    [p.id]
  );
  return { ...shaped, blocks };
}

async function shippingMethods() {
  return many('SELECT code, label, price_minor, window_text FROM shipping_method ORDER BY position, id');
}

// Money is an integer count of minor units in usd, in every layer.
// No floating point money exists anywhere in this app.

function formatMinor(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  const dollars = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${grouped}.${String(cents).padStart(2, '0')}`;
}

// killbill wants a decimal. Build it from the integer, never via division into a float.
function minorToDecimalString(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Ten percent of the taxable subtotal, computed on integers, truncated toward zero.
function taxOn(taxableSubtotalMinor) {
  return Math.trunc(Math.trunc(taxableSubtotalMinor) / 10);
}

function formatBytes(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function rungFor(subtotalMinor) {
  for (const r of protectionRungs) {
    if (subtotalMinor >= r.min && subtotalMinor <= r.max) return r;
  }
  return protectionRungs[0];
}

// The shape of a cart nobody has filled yet. No row is written to say so.
function emptyCart() {
  const rung = rungFor(1);
  return {
    token: null,
    id: null,
    email: null,
    contact: null,
    shipping_address: null,
    shipping_method: null,
    protection_enabled: false,
    lines: [],
    item_count: 0,
    goods_subtotal_minor: 0,
    protection_rung: {
      sku: rung.sku,
      price_minor: rung.price_minor,
      label: `Protect this shipment against loss, theft and damage for ${formatMinor(rung.price_minor)}`,
      enabled: false,
    },
    protection_minor: 0,
    subtotal_minor: 0,
    shipping_minor: 0,
    tax_minor: 0,
    total_minor: 0,
    currency: 'usd',
    notices: [],
    estimated: true,
  };
}

async function createCart(customerId = null) {
  const token = opaqueToken();
  const row = await one(
    'INSERT INTO cart (token, customer_id) VALUES ($1,$2) RETURNING id, token',
    [token, customerId]
  );
  return row;
}

async function cartByToken(token) {
  if (!token) return null;
  return one('SELECT * FROM cart WHERE token = $1 AND expires_at > now()', [token]);
}

async function linesOf(cartId) {
  return many(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.inventory_policy,
            p.handle, p.title, p.kind, p.status AS product_status,
            COALESCE(il.available, 0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.id ASC`,
    [cartId]
  );
}

// Every cart read compares the snapshotted price to the current price.
async function shapeCart(cart) {
  const raw = await linesOf(cart.id);
  const lines = raw.filter((l) => l.kind !== 'protection');
  const notices = [];

  for (const l of lines) {
    if (l.unit_price_minor !== l.current_price_minor) {
      notices.push({
        kind: 'price_changed',
        sku: l.sku,
        title: l.title,
        old_price_minor: l.unit_price_minor,
        new_price_minor: l.current_price_minor,
        message: `The price of ${l.title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(l.current_price_minor)} since you added it.`,
      });
    }
    if (l.available < l.quantity && l.inventory_policy === 'deny') {
      notices.push({
        kind: 'availability_changed',
        sku: l.sku,
        title: l.title,
        available: l.available,
        message: l.available === 0
          ? `${l.title} is sold out since you added it.`
          : `Only ${l.available} of ${l.title} remain, and you have ${l.quantity} in your cart.`,
      });
    }
  }

  const goodsSubtotal = lines.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
  const rung = rungFor(goodsSubtotal || 1);
  const protectionMinor = cart.protection_enabled ? rung.price_minor : 0;

  const shipping = cart.shipping_method
    ? await one('SELECT * FROM shipping_method WHERE code = $1', [cart.shipping_method])
    : null;
  const shippingMinor = shipping ? shipping.price_minor : 0;

  // Shipment protection is excluded from tax.
  const taxMinor = taxOn(goodsSubtotal);
  const subtotalMinor = goodsSubtotal + protectionMinor;
  const totalMinor = subtotalMinor + shippingMinor + taxMinor;

  return {
    token: cart.token,
    id: String(cart.id),
    email: cart.email,
    contact: cart.contact,
    shipping_address: cart.shipping_address,
    shipping_method: cart.shipping_method,
    protection_enabled: cart.protection_enabled,
    lines: lines.map((l) => ({
      id: String(l.id),
      sku: l.sku,
      handle: l.handle,
      title: l.title,
      option_value: l.option_value,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      current_price_minor: l.current_price_minor,
      total_minor: l.unit_price_minor * l.quantity,
      available: l.available,
      kind: l.kind,
    })),
    item_count: lines.reduce((n, l) => n + l.quantity, 0),
    goods_subtotal_minor: goodsSubtotal,
    protection_rung: {
      sku: rung.sku,
      price_minor: rung.price_minor,
      label: `Protect this shipment against loss, theft and damage for ${formatMinor(rung.price_minor)}`,
      enabled: cart.protection_enabled,
    },
    protection_minor: protectionMinor,
    subtotal_minor: subtotalMinor,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: totalMinor,
    currency: 'usd',
    notices,
    estimated: !cart.shipping_address,
  };
}

async function addLine(cart, sku, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('quantity_invalid', 'Quantity must be a whole number between 1 and 10.');
  }
  const v = await one(
    `SELECT v.id, v.price_minor, v.inventory_policy, p.status AS product_status, p.kind, p.title,
            COALESCE(il.available,0) AS available
       FROM variant v JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.sku = $1`,
    [String(sku ?? '')]
  );
  if (!v) throw notFound('We do not sell that.');
  if (v.kind === 'protection') throw badRequest('protection_not_addable', 'Use the shipment protection toggle instead.');
  if (v.product_status === 'discontinued') throw badRequest('discontinued', 'We no longer sell this.');
  if (v.inventory_policy === 'deny' && v.available < 1) {
    throw conflict('sold_out', `${v.title} is sold out.`, { resource: sku });
  }

  const existing = await one('SELECT id, quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2', [cart.id, v.id]);
  const target = Math.min(10, (existing?.quantity ?? 0) + qty);
  if (v.inventory_policy === 'deny' && target > v.available) {
    throw conflict('insufficient_stock', `Only ${v.available} left.`, { resource: sku });
  }
  if (existing) {
    await query('UPDATE cart_line SET quantity = $1 WHERE id = $2', [target, existing.id]);
  } else {
    await query(
      'INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)',
      [cart.id, v.id, target, v.price_minor]
    );
  }
  await touch(cart.id);
}

async function setLineQuantity(cart, lineId, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('quantity_invalid', 'Quantity must be a whole number between 1 and 10.');
  }
  const line = await one(
    `SELECT cl.id, cl.variant_id, v.inventory_policy, v.sku, COALESCE(il.available,0) AS available
       FROM cart_line cl JOIN variant v ON v.id = cl.variant_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.id = $1 AND cl.cart_id = $2`,
    [Number(lineId), cart.id]
  );
  if (!line) throw notFound('That line is not in your cart.');
  if (line.inventory_policy === 'deny' && qty > line.available) {
    throw conflict('insufficient_stock', `Only ${line.available} left.`, { resource: line.sku });
  }
  await query('UPDATE cart_line SET quantity = $1 WHERE id = $2', [qty, line.id]);
  await touch(cart.id);
}

async function removeLine(cart, lineId) {
  const r = await query('DELETE FROM cart_line WHERE id = $1 AND cart_id = $2', [Number(lineId), cart.id]);
  if (r.rowCount === 0) throw notFound('That line is not in your cart.');
  await touch(cart.id);
}

async function setProtection(cart, enabled) {
  await query('UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE id = $2', [!!enabled, cart.id]);
}

async function setDelivery(cart, { email, shipping_address, shipping_method, contact }) {
  const patch = {};
  if (email !== undefined) patch.email = String(email).trim().toLowerCase();
  if (shipping_address !== undefined) patch.shipping_address = shipping_address;
  if (contact !== undefined) patch.contact = contact;
  if (shipping_method !== undefined) {
    const code = String(shipping_method ?? '').trim().toLowerCase();
    if (code) {
      const m = await one('SELECT code FROM shipping_method WHERE code = $1', [code]);
      if (!m) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');
    }
    patch.shipping_method = code || null;
  }
  await query(
    `UPDATE cart SET
       email = COALESCE($2, email),
       shipping_address = COALESCE($3::jsonb, shipping_address),
       contact = COALESCE($4::jsonb, contact),
       shipping_method = CASE WHEN $5::boolean THEN $6 ELSE shipping_method END,
       updated_at = now()
     WHERE id = $1`,
    [
      cart.id,
      patch.email ?? null,
      patch.shipping_address === undefined ? null : JSON.stringify(patch.shipping_address),
      patch.contact === undefined ? null : JSON.stringify(patch.contact),
      patch.shipping_method !== undefined,
      patch.shipping_method ?? null,
    ]
  );
}

async function touch(cartId) {
  await query('UPDATE cart SET updated_at = now() WHERE id = $1', [cartId]);
}

const base = () => (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');

function headers(extra = {}) {
  const user = process.env.PAYMENTS_ADMIN_USER || '';
  const pass = process.env.PAYMENTS_ADMIN_PASSWORD || '';
  return {
    'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY || '',
    'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET || '',
    'X-Killbill-CreatedBy': 'vela-storefront',
    Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    Accept: 'application/json',
    ...extra,
  };
}

async function kb(path, { method = 'GET', body, timeoutMs = 20_000 } = {}) {
  const url = `${base()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    return { status: res.status, json, text, location: res.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

async function getAccountByExternalKey(externalKey) {
  const res = await kb(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 200 && res.json && res.json.accountId) return res.json;
  if (res.status === 404) return null;
  if (res.status >= 400) throw new Error(`killbill account lookup failed: ${res.status} ${res.text?.slice(0, 300)}`);
  return null;
}

// One account per order email lowercased, created or reused. externalKey is unique
// per tenant, so a second create with a used key is refused by the store itself.
async function ensureAccount({ externalKey, email, name }) {
  const existing = await getAccountByExternalKey(externalKey);
  if (existing) return existing;

  const res = await kb('/1.0/kb/accounts', {
    method: 'POST',
    body: { name: name || email, externalKey, email, currency: 'USD', country: 'US' },
  });

  if (res.status === 201 || res.status === 200) {
    const again = await getAccountByExternalKey(externalKey);
    if (again) return again;
    if (res.location) {
      const id = res.location.split('/').pop();
      return { accountId: id, externalKey };
    }
  }
  // The store refused the key because somebody else created it in the same instant.
  if (res.status === 409 || res.status === 400 || res.status === 500) {
    const again = await getAccountByExternalKey(externalKey);
    if (again) return again;
  }
  throw new Error(`killbill account create failed: ${res.status} ${res.text?.slice(0, 300)}`);
}

async function listAccountInvoices(accountId) {
  const res = await kb(`/1.0/kb/accounts/${encodeURIComponent(accountId)}/invoices?includeInvoiceComponents=true&includeVoidedInvoices=false`);
  if (res.status === 200 && Array.isArray(res.json)) return res.json;
  return [];
}

// Raise one invoice on the account for the order total in USD.
async function raiseInvoice({ accountId, totalMinor, description, chargeKey }) {
  const amount = minorToDecimalString(totalMinor);
  const res = await kb(`/1.0/kb/invoices/charges/${encodeURIComponent(accountId)}?autoCommit=true`, {
    method: 'POST',
    body: [{
      accountId,
      amount: Number(amount),
      currency: 'USD',
      description,
      ...(chargeKey ? { itemDetails: chargeKey } : {}),
    }],
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`killbill invoice create failed: ${res.status} ${res.text?.slice(0, 300)}`);
  }
  const items = Array.isArray(res.json) ? res.json : [];
  const invoiceId = items[0]?.invoiceId ?? null;
  logLine({ level: 'info', msg: 'killbill invoice raised', invoice_id: invoiceId, amount, currency: 'USD', account_id: accountId });
  return { invoiceId, amount };
}

// Find the invoice already raised for this exact order row, so a retry after a
// crash between the charge and the commit does not raise a second one.
async function findInvoiceByChargeKey(accountId, chargeKey) {
  if (!chargeKey) return null;
  const invoices = await listAccountInvoices(accountId);
  for (const inv of invoices) {
    if (inv.status === 'VOID') continue;
    for (const item of inv.items || []) {
      if (item.itemDetails === chargeKey) {
        return { invoiceId: inv.invoiceId, amount: String(inv.amount) };
      }
    }
  }
  return null;
}

let transport = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!host) throw new Error('SMTP_HOST is not set');
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    ignoreTLS: true,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transport;
}

const FROM = process.env.MAIL_FROM || 'Vela <orders@vela.example>';

// Exactly one mail to the order's email only. No cc, no bcc.
async function sendOrderConfirmation(order) {
  const subject = `Order confirmed: ${order.number}`;
  const lines = order.lines
    .map((l) => `  ${l.title_snapshot}  x${l.quantity}  ${formatMinor(l.total_minor)}`)
    .join('\n');

  const text = [
    `Your order ${order.number} is confirmed.`,
    '',
    'What you bought:',
    lines,
    '',
    `Subtotal: ${formatMinor(order.subtotal_minor)}`,
    `Delivery: ${formatMinor(order.shipping_minor)}`,
    `Tax: ${formatMinor(order.tax_minor)}`,
    `Total: ${formatMinor(order.total_minor)}`,
    '',
    'We will write again when it ships.',
    '',
    'The Vela team.',
  ].join('\n');

  const rows = order.lines
    .map((l) => `<tr><td>${esc(l.title_snapshot)}</td><td>${l.quantity}</td><td>${formatMinor(l.total_minor)}</td></tr>`)
    .join('');

  const html = `<!doctype html><html><body>
<p>Your order ${esc(order.number)} is confirmed.</p>
<table><thead><tr><th>Item</th><th>Quantity</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<p>Subtotal: ${formatMinor(order.subtotal_minor)}<br>
Delivery: ${formatMinor(order.shipping_minor)}<br>
Tax: ${formatMinor(order.tax_minor)}<br>
Total: ${formatMinor(order.total_minor)}</p>
<p>We will write again when it ships.</p>
<p>The Vela team.</p>
</body></html>`;

  const info = await getTransport().sendMail({
    from: FROM,
    to: order.email,
    subject,
    text,
    html,
  });
  logLine({ level: 'info', msg: 'order confirmation sent', order: order.number, to: order.email, message_id: info.messageId });
  return info;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MODEL_CODE = { flagship: 'VA', compact: 'VC' };

function serialShapeOk(serial) {
  return /^[A-Z]{2}\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(String(serial ?? '').toUpperCase());
}

function mintSerial(handle) {
  const code = MODEL_CODE[handle] || 'VA';
  const now = new Date();
  const year = String(now.getUTCFullYear() % 100).padStart(2, '0');
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const week = String(Math.min(52, Math.floor((now.getTime() - start) / 604800000) + 1)).padStart(2, '0');
  let tail = '';
  for (let i = 0; i < 6; i += 1) tail += SERIAL_ALPHABET[randomInt(SERIAL_ALPHABET.length)];
  return `${code}${year}${week}${tail}`;
}

function cartFingerprint(cart) {
  const h = createHash('sha256');
  h.update(cart.token);
  h.update(JSON.stringify(cart.lines.map((l) => [l.sku, l.quantity, l.unit_price_minor])));
  h.update(String(cart.protection_enabled));
  h.update(String(cart.shipping_method ?? ''));
  return h.digest('hex').slice(0, 40);
}

async function readOrder(orderId) {
  const o = await one('SELECT * FROM "order" WHERE id = $1', [orderId]);
  if (!o) return null;
  const lines = await many(
    `SELECT ol.*, v.sku, p.handle, p.kind
       FROM order_line ol JOIN variant v ON v.id = ol.variant_id JOIN product p ON p.id = v.product_id
      WHERE ol.order_id = $1 ORDER BY ol.position, ol.id`,
    [orderId]
  );
  return { ...o, lines };
}

function shapeOrder(order, { access_token = null, serials = [] } = {}) {
  return {
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    state_phrase: statePhrase(order),
    currency: order.currency,
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    placed_at: new Date(order.placed_at).toISOString(),
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    lines: (order.lines || []).map((l) => ({
      id: String(l.id),
      title_snapshot: l.title_snapshot,
      sku_snapshot: l.sku_snapshot,
      handle: l.handle,
      kind: l.kind,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
    })),
    serials,
    ...(access_token ? { access_token } : {}),
  };
}

function statePhrase(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'pending') return 'Placed, not yet confirmed';
  if (order.fulfilment_status === 'fulfilled') return 'Confirmed, paid and shipped';
  if (order.payment_status === 'invoiced') return 'Confirmed and invoiced, not yet shipped';
  return 'Confirmed, awaiting invoice';
}

async function serialsForOrder(orderId) {
  return many(
    `SELECT d.serial, d.id, p.title AS model, v.sku,
            (SELECT customer_id FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS owner_id
       FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
      WHERE d.order_id = $1 ORDER BY d.id`,
    [orderId]
  );
}

// Placing an order: re-price, commit stock atomically, allocate the number, write the rows.
// Then raise the invoice in killbill and send exactly one mail, and only then confirm.
async function placeOrder({ cart, cartRow, customer, idempotencyKey }) {
  const key = idempotencyKey || `cart:${cartFingerprint(cart)}`;

  // A replay of a key we have already finished returns the order we returned the first time.
  const seen = await one('SELECT * FROM idempotency_key WHERE key = $1', [key]);
  if (seen) {
    const settled = await waitForKey(key);
    if (settled) return settled;
  }

  if (!cart.lines.length) throw badRequest('cart_empty', 'Your cart is empty.');
  const email = String(cart.email ?? '').trim().toLowerCase();
  if (!email) throw badRequest('email_required', 'Email is required.');
  if (!cart.shipping_address) throw badRequest('address_required', 'A delivery address is required.');
  if (!cart.shipping_method) throw badRequest('shipping_method_required', 'Choose a delivery method.');

  let created;
  try {
    created = await tx(async (c) => {
      // Claim the key inside the same transaction that writes the order.
      const claim = await c.query(
        `INSERT INTO idempotency_key (key, scope, state) VALUES ($1,'orders','in_progress')
         ON CONFLICT (key) DO NOTHING RETURNING key`,
        [key]
      );
      if (claim.rowCount === 0) throw new AppError(409, 'idempotency_replay', 'That order is already being placed.', { resource: key, replay: key });

      // Re-price every line against the current price.
      const priced = [];
      for (const l of cart.lines) {
        const v = await c.query(
          `SELECT v.id, v.sku, v.price_minor, v.inventory_policy, p.title, p.handle, p.kind, p.status
             FROM variant v JOIN product p ON p.id = v.product_id WHERE v.sku = $1`,
          [l.sku]
        );
        const row = v.rows[0];
        if (!row) throw unprocessable('line_gone', `${l.title} is no longer sold.`, { resource: l.sku });
        if (row.price_minor !== l.unit_price_minor) {
          throw unprocessable('price_changed', `The price of ${row.title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(row.price_minor)} since you added it.`, {
            resource: l.sku, old_price_minor: l.unit_price_minor, new_price_minor: row.price_minor, title: row.title,
          });
        }
        priced.push({ ...row, quantity: l.quantity, option_value: l.option_value });
      }

      // Commit stock in one step. One statement per line: available falls and committed
      // rises together, guarded by the row itself, so two racing checkouts cannot both win.
      for (const p of priced) {
        if (p.inventory_policy === 'continue') continue;
        const upd = await c.query(
          `UPDATE inventory_level SET available = available - $2, committed = committed + $2
            WHERE variant_id = $1 AND available >= $2
            RETURNING available`,
          [p.id, p.quantity]
        );
        if (upd.rowCount === 0) {
          throw conflict('insufficient_stock', `${p.title} sold out while you were checking out.`, { resource: p.sku });
        }
      }

      const goodsSubtotal = priced.reduce((s, p) => s + p.price_minor * p.quantity, 0);
      const rung = rungFor(goodsSubtotal || 1);
      const protectionMinor = cartRow.protection_enabled ? rung.price_minor : 0;
      const ship = await c.query('SELECT * FROM shipping_method WHERE code = $1', [cart.shipping_method]);
      if (!ship.rows[0]) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');
      const shippingMinor = ship.rows[0].price_minor;
      const taxMinor = taxOn(goodsSubtotal); // protection is excluded from tax
      const subtotalMinor = goodsSubtotal + protectionMinor;
      const totalMinor = subtotalMinor + shippingMinor + taxMinor;

      // Numbers are allocated in sequence. The counter row is the lock.
      const year = new Date().getUTCFullYear();
      const cnt = await c.query(
        `INSERT INTO order_counter (year, last_value) VALUES ($1, 1)
         ON CONFLICT (year) DO UPDATE SET last_value = order_counter.last_value + 1
         RETURNING last_value`,
        [year]
      );
      const number = `VE-${year}-${String(cnt.rows[0].last_value).padStart(4, '0')}`;

      const accessToken = opaqueToken();
      // Unique to this order row, so a retry finds its own charge and a later
      // database generation reusing this number never adopts an older invoice.
      const chargeKey = `${number}/${randomUUID()}`;

      // A guest checkout that names a registered address is that person's order,
      // so it belongs in their history as well as behind its access token.
      let ownerId = customer?.id ?? null;
      if (!ownerId) {
        const match = await c.query('SELECT id FROM customer WHERE lower(email) = $1', [email]);
        ownerId = match.rows[0]?.id ?? null;
      }
      const orderRow = await c.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
                              total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
                              shipping_address, access_token_hash, killbill_external_key, killbill_charge_key)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11,$12)
         RETURNING id, number`,
        [number, ownerId, email, subtotalMinor, shippingMinor, taxMinor, totalMinor,
         cart.shipping_method, JSON.stringify(cart.shipping_address), sha256(accessToken), email, chargeKey]
      );
      const orderId = orderRow.rows[0].id;

      let pos = 0;
      for (const p of priced) {
        pos += 1;
        await c.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [orderId, p.id, `${p.title} — ${p.option_value}`, p.sku, p.quantity, p.price_minor, p.price_minor * p.quantity, pos]
        );
      }
      if (protectionMinor > 0) {
        pos += 1;
        const pv = await c.query('SELECT id, sku FROM variant WHERE sku = $1', [rung.sku]);
        await c.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,'Shipment protection',$3,1,$4,$4,$5)`,
          [orderId, pv.rows[0].id, pv.rows[0].sku, protectionMinor, pos]
        );
      }

      // A camera is a record in its own right: mint the serial the order allocated.
      for (const p of priced) {
        if (p.kind !== 'camera') continue;
        for (let i = 0; i < p.quantity; i += 1) {
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const serial = mintSerial(p.handle);
            const ins = await c.query(
              `INSERT INTO device (serial, product_id, variant_id, status, order_id, warranty_until)
               SELECT $1, v.product_id, v.id, 'sold', $2, (now() + interval '2 years')::date
                 FROM variant v WHERE v.id = $3
               ON CONFLICT (upper(serial)) DO NOTHING RETURNING id`,
              [serial, orderId, p.id]
            );
            if (ins.rowCount > 0) break;
          }
        }
      }

      await c.query('UPDATE idempotency_key SET order_id = $2 WHERE key = $1', [key, orderId]);
      await c.query('DELETE FROM cart_line WHERE cart_id = $1', [cartRow.id]);
      await c.query('UPDATE cart SET updated_at = now(), protection_enabled = false WHERE id = $1', [cartRow.id]);

      return { orderId, number, accessToken, totalMinor, email };
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'idempotency_replay') {
      const settled = await waitForKey(key);
      if (settled) return settled;
      throw conflict('idempotency_in_progress', 'That order is already being placed.', { resource: key });
    }
    throw err;
  }

  // The order exists and the stock is committed. Now the money and the mail, which
  // live outside this app entirely.
  const order = await readOrder(created.orderId);
  const externalKey = created.email;
  // The description the invoice carries names the order; the key that makes a
  // retry idempotent is unique to this row and travels in the item details.
  const description = `Order ${created.number}`;
  const chargeKey = order.killbill_charge_key;

  const account = await ensureAccount({
    externalKey,
    email: created.email,
    name: order.shipping_address?.name || created.email,
  });

  let invoice = await findInvoiceByChargeKey(account.accountId, chargeKey);
  if (!invoice) {
    invoice = await raiseInvoice({
      accountId: account.accountId,
      totalMinor: created.totalMinor,
      description,
      chargeKey,
    });
  }

  await query(
    `UPDATE "order" SET status='confirmed', payment_status='invoiced',
            killbill_account_id=$2, killbill_invoice_id=$3, killbill_invoice_amount=$4
      WHERE id = $1`,
    [created.orderId, account.accountId, invoice.invoiceId, invoice.amount]
  );

  const confirmed = await readOrder(created.orderId);
  await sendOrderConfirmation(confirmed);

  const serials = await serialsForOrder(created.orderId);
  const shaped = shapeOrder(confirmed, { access_token: created.accessToken, serials: serials.map(serialShape) });

  await query(
    `UPDATE idempotency_key SET state='done', response=$2 WHERE key = $1`,
    [key, JSON.stringify(shaped)]
  );
  logLine({ level: 'info', msg: 'order confirmed', order: created.number, total_minor: created.totalMinor, invoice_id: invoice.invoiceId });
  return shaped;
}

function serialShape(d) {
  return { serial: d.serial, model: d.model, registered: d.owner_id !== null };
}

async function waitForKey(key, timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await one('SELECT state, response, order_id FROM idempotency_key WHERE key = $1', [key]);
    if (row && row.state === 'done' && row.response) return row.response;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function orderByNumber(number) {
  const o = await one('SELECT * FROM "order" WHERE number = $1', [String(number ?? '')]);
  if (!o) return null;
  return readOrder(o.id);
}

async function orderReadableBy(number, { accessToken, customer }) {
  const o = await orderByNumber(number);
  // Another customer's order reads as not found, never forbidden.
  if (!o) throw notFound('That order does not exist.');
  if (customer && o.customer_id && String(o.customer_id) === String(customer.id)) return o;
  if (accessToken && o.access_token_hash === sha256(accessToken)) return o;
  throw notFound('That order does not exist.');
}

function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => Number(n) || 0);
  const pb = String(b ?? '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function latestGeneralFirmware(productId) {
  return one(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId]
  );
}

async function shapeDevice(d) {
  const latest = await latestGeneralFirmware(d.product_id);
  const updateAvailable = !!(latest && d.firmware_version && compareVersions(d.firmware_version, latest.version) < 0);
  const warrantyActive = d.warranty_until ? new Date(d.warranty_until).getTime() >= Date.now() : false;
  return {
    serial: d.serial,
    model: d.model ?? d.product_title,
    handle: d.handle,
    variant: d.option_value,
    nickname: d.nickname,
    status: d.status,
    firmware_version: d.firmware_version,
    firmware_reported_at: d.firmware_reported_at ? new Date(d.firmware_reported_at).toISOString() : null,
    latest_firmware_version: latest ? latest.version : null,
    update_available: updateAvailable,
    warranty_until: d.warranty_until ? String(d.warranty_until).slice(0, 10) : null,
    warranty_active: warrantyActive,
    firmware_state: !d.firmware_version ? 'Not yet connected' : updateAvailable ? 'Update available' : 'Up to date',
  };
}

const DEVICE_SELECT = `
  SELECT d.*, p.title AS model, p.handle, v.option_value
    FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id`;

async function deviceBySerial(serial) {
  return one(`${DEVICE_SELECT} WHERE upper(d.serial) = upper($1)`, [String(serial ?? '')]);
}

async function deviceOwnedBy(serial, customerId) {
  return one(
    `${DEVICE_SELECT}
      WHERE upper(d.serial) = upper($1)
        AND EXISTS (SELECT 1 FROM device_ownership o
                     WHERE o.device_id = d.id AND o.released_at IS NULL AND o.customer_id = $2)`,
    [String(serial ?? ''), customerId]
  );
}

function normaliseSerial(raw) {
  return String(raw ?? '').replace(/[\s-]/g, '').toUpperCase();
}

// A serial registers only when the device exists with no live owner.
async function registerDevice(serial, customerId) {
  const s = normaliseSerial(serial);
  // A serial that does not match the shape is refused before any lookup happens.
  if (!serialShapeOk(s)) {
    throw badRequest('serial_shape', 'We do not recognise that serial number.');
  }

  return tx(async (c) => {
    const d = await c.query(
      `SELECT d.id, d.status, d.blocked_reason FROM device d WHERE upper(d.serial) = upper($1) FOR UPDATE`,
      [s]
    );
    const dev = d.rows[0];
    if (!dev) throw notFound('We do not recognise that serial number.');
    if (dev.status === 'blocked') {
      throw unprocessable('device_blocked', 'That camera is blocked. Write to us and we will look into it.');
    }

    // The partial unique index is what actually holds this under concurrency.
    let ins;
    try {
      ins = await c.query(
        `INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual') RETURNING id`,
        [dev.id, customerId]
      );
    } catch (err) {
      if (err && err.code === '23505') {
        throw conflict('device_taken', 'That camera is registered to someone else.', { resource: s });
      }
      throw err;
    }
    if (ins.rowCount === 0) {
      throw conflict('device_taken', 'That camera is registered to someone else.', { resource: s });
    }

    await c.query(`UPDATE device SET status = 'registered' WHERE id = $1`, [dev.id]);
    const row = await c.query(`${DEVICE_SELECT} WHERE d.id = $1`, [dev.id]);
    return row.rows[0];
  });
}

async function renameDevice(serial, customerId, nickname) {
  const d = await deviceOwnedBy(serial, customerId);
  if (!d) throw notFound('We do not recognise that serial number.');
  const n = nickname === null || nickname === undefined ? null : String(nickname).trim().slice(0, 60);
  await query('UPDATE device SET nickname = $2 WHERE id = $1', [d.id, n || null]);
  return deviceBySerial(serial);
}

// Releasing ends the link and grants it to nobody.
async function releaseDevice(serial, customerId) {
  const d = await deviceOwnedBy(serial, customerId);
  if (!d) throw notFound('We do not recognise that serial number.');
  await tx(async (c) => {
    await c.query(
      `UPDATE device_ownership SET released_at = now()
        WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL`,
      [d.id, customerId]
    );
    await c.query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1`, [d.id]);
  });
  return deviceBySerial(serial);
}

async function devicesForCustomer(customerId, { limit, cursorId }) {
  const params = [customerId, limit + 1];
  let where = '';
  if (cursorId !== null && cursorId !== undefined) {
    params.push(cursorId);
    where = ` AND d.id < $3`;
  }
  return many(
    `SELECT d.*, p.title AS model, p.handle, v.option_value
       FROM device d
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
       JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
      WHERE o.customer_id = $1${where}
      ORDER BY d.id DESC
      LIMIT $2`,
    params
  );
}

// A flash session is refused before it starts when the image is wrong for the device.
async function startFlashSession({ serial, targetBuild, reportedVersion }) {
  const s = normaliseSerial(serial);
  if (!serialShapeOk(s)) throw badRequest('serial_shape', 'We do not recognise that serial number.');

  return tx(async (c) => {
    const dRes = await c.query(
      `SELECT d.*, p.title AS model, p.handle FROM device d JOIN product p ON p.id = d.product_id
        WHERE upper(d.serial) = upper($1) FOR UPDATE OF d`,
      [s]
    );
    const device = dRes.rows[0];
    if (!device) throw notFound('We do not recognise that serial number.');
    if (device.status === 'blocked') {
      throw unprocessable('device_blocked', 'That camera is blocked. Write to us and we will look into it.');
    }

    const fRes = await c.query('SELECT * FROM firmware WHERE build = $1', [Number(targetBuild)]);
    const fw = fRes.rows[0];
    if (!fw) throw notFound('We do not have that firmware image.');

    // Refused when the target image belongs to another product.
    if (String(fw.product_id) !== String(device.product_id)) {
      throw unprocessable('firmware_wrong_product', 'That image is for a different camera.', { resource: s });
    }

    // A non-general channel is never offered to a device that has not opted in.
    if (fw.channel !== 'general') {
      throw unprocessable('firmware_channel', 'That image is not offered for this camera.', { resource: s });
    }

    // Refused when min_firmware is above the version the device reports.
    const current = reportedVersion ? String(reportedVersion) : device.firmware_version;
    if (fw.min_firmware) {
      if (!current) {
        throw unprocessable('firmware_min_unknown', `This camera must be running at least ${fw.min_firmware} before it can take this image.`, { resource: s });
      }
      if (compareVersions(current, fw.min_firmware) < 0) {
        throw unprocessable('firmware_min_not_met', `This camera is running ${current}. It must be running at least ${fw.min_firmware} before it can take this image.`, { resource: s });
      }
    }

    if (current && device.firmware_version !== current) {
      await c.query('UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1', [device.id, current]);
    }

    let ses;
    try {
      ses = await c.query(
        `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
        [device.id, fw.id]
      );
    } catch (err) {
      if (err && err.code === '23505') {
        throw conflict('flash_session_in_progress', 'A write to that camera is already running.', { resource: s });
      }
      throw err;
    }

    return {
      session: ses.rows[0],
      device: { ...device, firmware_version: current ?? device.firmware_version },
      firmware: fw,
    };
  });
}

// Completing a session records the version read back from the device, never the one requested.
async function completeFlashSession(id, reportedVersion) {
  const reported = String(reportedVersion ?? '').trim();
  if (!/^\d+(\.\d+){0,3}$/.test(reported)) {
    throw badRequest('reported_version_invalid', 'The camera did not report a version we understand.');
  }
  return tx(async (c) => {
    const sRes = await c.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [Number(id)]);
    const ses = sRes.rows[0];
    if (!ses) throw notFound('That session does not exist.');
    if (ses.state !== 'started') {
      throw unprocessable('session_not_started', 'That session has already ended.', { resource: String(id) });
    }
    await c.query(
      `UPDATE flash_session SET state='succeeded', reported_version=$2, ended_at=now() WHERE id=$1`,
      [ses.id, reported]
    );
    await c.query(
      `UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`,
      [ses.device_id, reported]
    );
    const out = await c.query(
      `SELECT fs.*, d.serial, d.firmware_version FROM flash_session fs JOIN device d ON d.id = fs.device_id WHERE fs.id = $1`,
      [ses.id]
    );
    return out.rows[0];
  });
}

// A failed session leaves the device's version as it was.
async function failFlashSession(id, reason) {
  return tx(async (c) => {
    const sRes = await c.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [Number(id)]);
    const ses = sRes.rows[0];
    if (!ses) throw notFound('That session does not exist.');
    if (ses.state !== 'started') {
      throw unprocessable('session_not_started', 'That session has already ended.', { resource: String(id) });
    }
    await c.query(
      `UPDATE flash_session SET state='failed', failure_reason=$2, ended_at=now() WHERE id=$1`,
      [ses.id, String(reason ?? 'unknown').slice(0, 200)]
    );
    const out = await c.query(
      `SELECT fs.*, d.serial, d.firmware_version FROM flash_session fs JOIN device d ON d.id = fs.device_id WHERE fs.id = $1`,
      [ses.id]
    );
    return out.rows[0];
  });
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// A request naming a page above the cap is refused with the cap named, rather than
// quietly served a page cut down to fit.
function pageSizeFrom(query) {
  const raw = query.page_size ?? query.pageSize ?? query.limit ?? query.per_page;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('page_size_invalid', `page_size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest('page_size_too_large', `page_size is capped at ${MAX_PAGE_SIZE}. You asked for ${n}.`, { cap: MAX_PAGE_SIZE });
  }
  return n;
}

// Keyset cursor over a stable ordering key. Never an offset.
function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (typeof decoded.k === 'string' || typeof decoded.k === 'number') return decoded.k;
    return null;
  } catch {
    throw badRequest('cursor_invalid', 'That cursor is not one we issued.');
  }
}

function encodeCursor(key) {
  return Buffer.from(JSON.stringify({ k: String(key) }), 'utf8').toString('base64url');
}

function page(rows, limit, keyOf) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const next = hasMore && data.length ? encodeCursor(keyOf(data[data.length - 1])) : null;
  return { data, next_cursor: next, has_more: hasMore };
}

const CART_COOKIE = 'vela_cart';
const SESSION_COOKIE = 'vela_session';

function cookieOpts(maxAge) {
  return { path: '/', httpOnly: true, sameSite: 'Lax', maxAge, secure: false };
}

async function currentCustomer(c) {
  const token = bearerFrom(c.req.header('authorization')) || getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return customerFromToken(token);
}

// Only a write creates a cart. A read never does, so rendering a page never
// mints a row, and the cart the reader holds is the one they filled.
async function ensureCart(c) {
  const token = getCookie(c, CART_COOKIE);
  let row = await cartByToken(token);
  if (!row) {
    const customer = await currentCustomer(c);
    row = await createCart(customer?.id ?? null);
    setCookie(c, CART_COOKIE, row.token, cookieOpts(60 * 60 * 24 * 30));
    row = await cartByToken(row.token);
  }
  return row;
}

async function existingCart(c) {
  return cartByToken(getCookie(c, CART_COOKIE));
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
  const rows = await listProducts({ limit, cursorPosition: cursor });
  return c.json(page(rows, limit, (r) => r.position));
});

api.get('/products/:handle', async (c) => {
  const p = await productByHandle(c.req.param('handle'));
  if (!p || p.kind === 'protection') throw notFound('That page does not exist.');
  const wanted = c.req.query('variant');
  const selected = p.variants.find((v) => v.sku === wanted) ?? p.variants[0] ?? null;
  return c.json({ ...p, selected_sku: selected ? selected.sku : null });
});

api.get('/shipping-methods', async (c) => {
  return c.json({ data: await shippingMethods(), next_cursor: null, has_more: false });
});

/* ------------------------------------------------------------------ cart */

// Reading a cart never creates one. An empty shape is the honest answer for a
// visitor who has not added anything yet.
api.get('/cart', async (c) => {
  const row = await existingCart(c);
  if (!row) return c.json(emptyCart());
  return c.json(await shapeCart(row));
});

api.post('/cart/lines', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await addLine(row, b.sku, b.quantity ?? 1);
  return c.json(await shapeCart(row), 201);
});

api.patch('/cart/lines/:id', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await setLineQuantity(row, c.req.param('id'), b.quantity);
  return c.json(await shapeCart(row));
});

api.delete('/cart/lines/:id', async (c) => {
  const row = await ensureCart(c);
  await removeLine(row, c.req.param('id'));
  return c.json(await shapeCart(row));
});

api.post('/cart/protection', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await setProtection(row, !!b.enabled);
  const fresh = await cartByToken(row.token);
  return c.json(await shapeCart(fresh));
});

api.post('/cart/delivery', async (c) => {
  const row = await ensureCart(c);
  const b = await body(c);
  await setDelivery(row, b);
  const fresh = await cartByToken(row.token);
  return c.json(await shapeCart(fresh));
});

/* ---------------------------------------------------------------- orders */

api.post('/orders', async (c) => {
  const row = await ensureCart(c);
  const shaped = await shapeCart(row);
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

  const order = await placeOrder({ cart: shaped, cartRow: row, customer, idempotencyKey: idem });
  return c.json(order, 201);
});

api.get('/orders/:number', async (c) => {
  const customer = await currentCustomer(c);
  const accessToken = c.req.query('access_token') || c.req.header('x-order-token') || null;
  const o = await orderReadableBy(c.req.param('number'), { accessToken, customer });
  const serials = await serialsForOrder(o.id);
  return c.json(shapeOrder(o, {
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
    data.push(shapeOrder({ ...o, lines }));
  }
  return c.json({ data, next_cursor: out.next_cursor, has_more: out.has_more });
});

api.get('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const q = c.req.query();
  const limit = pageSizeFrom(q);
  const cursor = decodeCursor(q.cursor);
  const rows = await devicesForCustomer(customer.id, { limit, cursorId: cursor ? Number(cursor) : null });
  const out = page(rows, limit, (r) => r.id);
  const data = [];
  for (const d of out.data) data.push(await shapeDevice(d));
  return c.json({ data, next_cursor: out.next_cursor, has_more: out.has_more });
});

api.post('/account/devices', async (c) => {
  const customer = await requireCustomer(c);
  const b = await body(c);
  const d = await registerDevice(b.serial, customer.id);
  return c.json(await shapeDevice(d), 201);
});

api.get('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const d = await deviceOwnedBy(c.req.param('serial'), customer.id);
  // Another customer's serial reads as not found, never forbidden.
  if (!d) throw notFound('We do not recognise that serial number.');
  return c.json(await shapeDevice(d));
});

api.patch('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const b = await body(c);
  const d = await renameDevice(c.req.param('serial'), customer.id, b.nickname);
  return c.json(await shapeDevice(d));
});

api.delete('/account/devices/:serial', async (c) => {
  const customer = await requireCustomer(c);
  const d = await releaseDevice(c.req.param('serial'), customer.id);
  return c.json(await shapeDevice(d));
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

function shapeRelease(r) {
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
  const out = await startFlashSession({
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
  const s = await completeFlashSession(c.req.param('id'), b.reported_version ?? b.reportedVersion);
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
  const s = await failFlashSession(c.req.param('id'), b.reason);
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
  const serial = normaliseSerial(c.req.param('serial'));
  if (!serialShapeOk(serial)) throw badRequest('serial_shape', 'We do not recognise that serial number.');
  const d = await deviceBySerial(serial);
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

// Server-side calls from an Astro route into the app's own HTTP API on the same
// origin. Every route is server-rendered from the real API, never from a fixture.

async function apiFetch(astro, path, init = {}) {
  const url = new URL(astro.request.url);
  const target = new URL(path, url.origin);
  const headers = new Headers(init.headers || {});
  const cookie = astro.request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  headers.set('x-request-id', astro.locals?.requestId || 'ssr');

  const req = new Request(target, { ...init, headers });
  const res = await api.fetch(req);

  // Any Set-Cookie the API issued (a new cart, a new session) must reach the
  // browser. It goes through Astro.cookies, because Astro.redirect builds a
  // fresh Response and would otherwise drop a header set on Astro.response.
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const sc of setCookies) {
    if (astro.cookies) applyCookie(astro.cookies, sc);
    else astro.response?.headers?.append('set-cookie', sc);
  }

  let json = null;
  const text = await res.text();
  if (text) { try { json = JSON.parse(text); } catch { json = null; } }
  return { status: res.status, ok: res.ok, data: json, setCookies };
}

// Parse one Set-Cookie header and hand it to Astro's cookie store, so it is
// written onto whatever response the route finally returns.
function applyCookie(cookies, header) {
  const parts = String(header).split(';');
  const [name, ...valueParts] = parts[0].split('=');
  const value = valueParts.join('=');
  const opts = { path: '/' };
  for (const p of parts.slice(1)) {
    const [rawK, ...rawV] = p.trim().split('=');
    const k = rawK.toLowerCase();
    const v = rawV.join('=');
    if (k === 'path') opts.path = v;
    else if (k === 'max-age') opts.maxAge = Number(v);
    else if (k === 'expires') opts.expires = new Date(v);
    else if (k === 'samesite') opts.sameSite = v.toLowerCase();
    else if (k === 'httponly') opts.httpOnly = true;
    else if (k === 'secure') opts.secure = true;
    else if (k === 'domain') opts.domain = v;
  }
  cookies.set(name.trim(), decodeURIComponent(value), opts);
}

export { apiFetch as a, formatBytes as b, formatMinor as f };

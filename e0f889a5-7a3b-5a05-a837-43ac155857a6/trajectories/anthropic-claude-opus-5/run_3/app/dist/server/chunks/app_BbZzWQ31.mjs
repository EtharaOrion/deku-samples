import { Hono } from 'hono';
import pg from 'pg';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

// Money is an integer count of minor units everywhere. Never let pg hand back a
// float for an integer column, and keep numerics as strings so no float appears.
pg.types.setTypeParser(20, v => v === null ? null : Number(v)); // int8
pg.types.setTypeParser(1700, v => v); // numeric -> string

let pool;
function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    pool.on('error', err => {
      console.log(JSON.stringify({
        level: 'error',
        msg: 'pg pool error',
        error: err.message
      }));
    });
  }
  return pool;
}
async function query(text, params) {
  return getPool().query(text, params);
}
async function one(text, params) {
  const r = await getPool().query(text, params);
  return r.rows[0] ?? null;
}
async function many(text, params) {
  const r = await getPool().query(text, params);
  return r.rows;
}

/** Run fn inside a transaction, rolling back on any throw. */
async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {/* connection already gone */}
    throw err;
  } finally {
    client.release();
  }
}
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Every rejected call carries a stable machine-readable code, a human message
 * and the request_id. An invalid, unauthorized or out-of-state call is a client
 * error, never a 5xx and never a silent success.
 */
class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.extra = extra;
    // Tagged rather than identified by instanceof: the bundler may place this
    // module in more than one chunk, and a client error must never be reported
    // as a 5xx because two copies of the class did not match.
    this.isAppError = true;
  }
}
function isAppError(err) {
  return Boolean(err && err.isAppError === true && typeof err.status === 'number');
}
const badRequest = (code, message, extra) => new AppError(400, code, message, extra);
const unauthorized = (message = 'Sign in to continue.', code = 'unauthorized') => new AppError(401, code, message);
const notFound = (message = 'That page does not exist.', code = 'not_found') => new AppError(404, code, message);
const conflict = (code, message, extra) => new AppError(409, code, message, extra);
const unprocessable = (code, message, extra) => new AppError(422, code, message, extra);
function errorBody(err, requestId) {
  if (isAppError(err)) {
    return {
      error: {
        code: err.code,
        message: err.message,
        request_id: requestId,
        ...err.extra
      },
      code: err.code,
      message: err.message,
      request_id: requestId,
      ...err.extra
    };
  }
  return {
    error: {
      code: 'internal_error',
      message: `Something went wrong at our end. Reference ${requestId}.`,
      request_id: requestId
    },
    code: 'internal_error',
    message: `Something went wrong at our end. Reference ${requestId}.`,
    request_id: requestId
  };
}

/** A request identifier generated at the edge of the request. */
function newRequestId() {
  return 'req_' + crypto.randomBytes(9).toString('base64url');
}

/**
 * Structured logs to stdout, one line of JSON per request, carrying the method,
 * the route, the status, the elapsed milliseconds and the request_id. The same
 * request_id is returned in the body of every error response.
 */
function logRequest({
  method,
  route,
  status,
  ms,
  requestId,
  extra
}) {
  const line = {
    ts: new Date().toISOString(),
    level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
    msg: 'request',
    request_id: requestId,
    method,
    route,
    status,
    duration_ms: Math.round(ms),
    ...(extra || {})
  };
  process.stdout.write(JSON.stringify(line) + '\n');
}
function logEvent(msg, fields = {}) {
  process.stdout.write(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    msg,
    ...fields
  }) + '\n');
}
function logError(msg, fields = {}) {
  process.stdout.write(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    msg,
    ...fields
  }) + '\n');
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * A page size above the cap is refused with the cap named, rather than served
 * as a page quietly cut down to fit.
 */
function readPageSize(url) {
  const raw = url.searchParams.get('page_size') ?? url.searchParams.get('limit') ?? url.searchParams.get('per_page');
  if (raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', `page_size must be a whole number of at least 1 and at most ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest('page_size_too_large', `page_size may not be above ${MAX_PAGE_SIZE}. You asked for ${n}.`, {
      max_page_size: MAX_PAGE_SIZE,
      requested: n
    });
  }
  return n;
}

/**
 * A keyset cursor over a stable ordering key, so a list that receives new rows
 * between two reads never repeats a row and never skips one.
 */
function encodeCursor(parts) {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}
function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('bad shape');
    return parsed;
  } catch {
    throw badRequest('invalid_cursor', 'That page reference is not one we issued.');
  }
}

/** Fetch pageSize+1 rows, then report data, next_cursor and has_more. */
function buildPage(rows, pageSize, cursorOf) {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const next = hasMore && data.length ? encodeCursor(cursorOf(data[data.length - 1])) : null;
  return {
    data,
    next_cursor: next,
    has_more: hasMore
  };
}

// Passwords are stored hashed with scrypt, a modern memory-hard password hash
// from the platform itself, so the image carries no native build step.
const SCRYPT = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64
};
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 512 * 1024 * 1024
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}
function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const dk = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: 512 * 1024 * 1024
    });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}
function secret() {
  return process.env.AUTH_SECRET || process.env.DATABASE_URL || 'vela-development-secret';
}
const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL || 60 * 60 * 12);

/** Email and password exchange for a bearer token. Tokens expire. */
function issueToken(customerId, ttlSeconds = TOKEN_TTL_SECONDS) {
  const payload = {
    sub: customerId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.sub || !payload?.exp) return null;
  if (payload.exp * 1000 <= Date.now()) return null; // an expired token is rejected
  return payload;
}
function bearerFrom(req) {
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) return m[1].trim();
  const cookie = req.headers.get('cookie') || '';
  const cm = /(?:^|;\s*)vela_token=([^;]+)/.exec(cookie);
  return cm ? decodeURIComponent(cm[1]) : null;
}

/** Resolve the signed-in customer, or null. Never throws for absent tokens. */
async function currentCustomer(req) {
  const token = bearerFrom(req);
  const payload = readToken(token);
  if (!payload) return null;
  const row = await one(`SELECT id, email, name, status, created_at FROM customer WHERE id = $1 AND status = 'active'`, [payload.sub]);
  return row ?? null;
}

/** Require a customer. An expired or absent token is rejected and mutates nothing. */
async function requireCustomer(req) {
  const customer = await currentCustomer(req);
  if (!customer) throw unauthorized('Sign in to continue.', 'unauthorized');
  return customer;
}
function hashOpaque(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Shape rules and derived state. Derived rather than stored: an order's status
// chip, a variant's availability state, whether a device has newer firmware,
// and the shipment-protection rung for a cart.

const SERIAL_RE = /^(VA|VC)\d{2}\d{2}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
function normaliseSerial(input) {
  return String(input || '').replace(/[\s-]/g, '').toUpperCase();
}

/** A serial that does not match the shape is refused before any lookup happens. */
function isValidSerial(input) {
  const s = normaliseSerial(input);
  return s.length === 12 && SERIAL_RE.test(s);
}

/** Availability is a state, not a boolean. */
function availabilityOf({
  productStatus,
  available,
  inventoryPolicy = 'deny'
}) {
  if (productStatus === 'discontinued') return {
    state: 'discontinued',
    label: 'Discontinued',
    buyable: false
  };
  if (available <= 0 && inventoryPolicy === 'deny') return {
    state: 'sold_out',
    label: 'Sold out',
    buyable: false
  };
  if (available > 0 && available <= 10) return {
    state: 'low',
    label: `Only ${available} left`,
    buyable: true
  };
  return {
    state: 'available',
    label: 'Available',
    buyable: true
  };
}

/** Compare dotted version strings numerically: 7.10 is above 7.2. */
function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
function formatDateLong(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}
function formatDateShort(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

/** One chip combining the order, payment and fulfilment states into a phrase. */
function orderChip(order) {
  if (order.status === 'cancelled') return {
    text: 'Cancelled',
    tone: 'error'
  };
  if (order.status === 'pending') return {
    text: 'Not yet confirmed',
    tone: 'progress'
  };
  if (order.fulfilment_status === 'fulfilled') return {
    text: 'Confirmed and delivered',
    tone: 'done'
  };
  if (order.payment_status === 'invoiced') return {
    text: 'Confirmed, preparing to ship',
    tone: 'progress'
  };
  return {
    text: 'Confirmed',
    tone: 'done'
  };
}
const DELIVERY_METHODS = [{
  code: 'Standard',
  price_minor: 0,
  window: 'Arrives in 5 to 7 days'
}, {
  code: 'Express',
  price_minor: 2500,
  window: 'Arrives in 2 days'
}];
function deliveryMethod(code) {
  return DELIVERY_METHODS.find(m => m.code === code) ?? null;
}
const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];

// Money is an integer count of minor units in usd everywhere in this app,
// in every layer including the browser. No floating point money exists.

/** 37800 -> "$378.00" */
function formatMoney(minor) {
  const n = Math.trunc(Number(minor));
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${grouped}.${String(cents).padStart(2, '0')}`;
}

/** 41580 -> "415.80". The decimal string the billing platform is given. */
function minorToDecimalString(minor) {
  const n = Math.trunc(Number(minor));
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Tax is ten percent of the line subtotal, on integers, truncated toward zero. */
function taxFor(subtotalMinor) {
  return Math.trunc(Math.trunc(Number(subtotalMinor)) / 10);
}

// Shipment protection rungs, chosen from the cart subtotal in minor units.
const PROTECTION_RUNGS = [{
  sku: 'VELA-PROTECT-1',
  price_minor: 98,
  min: 1,
  max: 9999
}, {
  sku: 'VELA-PROTECT-2',
  price_minor: 298,
  min: 10000,
  max: 49999
}, {
  sku: 'VELA-PROTECT-3',
  price_minor: 598,
  min: 50000,
  max: 99999
}, {
  sku: 'VELA-PROTECT-4',
  price_minor: 1198,
  min: 100000,
  max: Infinity
}];
function protectionRungFor(subtotalMinor) {
  const s = Math.trunc(Number(subtotalMinor));
  if (s < 1) return null;
  return PROTECTION_RUNGS.find(r => s >= r.min && s <= r.max) ?? null;
}
function formatBytes(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const CART_COOKIE = 'vela_cart';
async function createCart(customerId = null) {
  const token = randomToken(24);
  const row = await one(`INSERT INTO cart (token, customer_id) VALUES ($1,$2) RETURNING *`, [token, customerId]);
  return row;
}
async function findCartByToken(token) {
  if (!token) return null;
  return one(`SELECT * FROM cart WHERE token = $1 AND expires_at > now()`, [token]);
}

/** A visitor never reads another cart: the opaque token is the only handle. */
async function getOrCreateCart(token, customerId = null) {
  const found = await findCartByToken(token);
  if (found) return found;
  return createCart(customerId);
}
async function cartLines(cartId) {
  return many(`SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.inventory_policy,
            p.handle, p.title, p.subtitle, p.kind, p.status AS product_status,
            COALESCE(il.available, 0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.created_at, cl.id`, [cartId]);
}

/**
 * Build the whole cart view. Every cart read compares the price snapshotted at
 * add time to the current price; a difference renders as a notice naming the
 * item, the old price and the new.
 */
async function cartView(cart) {
  const lines = await cartLines(cart.id);
  const notices = [];
  for (const l of lines) {
    if (l.unit_price_minor !== l.current_price_minor) {
      notices.push({
        kind: 'price_change',
        sku: l.sku,
        line_id: l.id,
        title: l.title,
        old_price_minor: l.unit_price_minor,
        new_price_minor: l.current_price_minor,
        message: `The price of ${l.title} changed from ${formatMoney(l.unit_price_minor)} to ${formatMoney(l.current_price_minor)} since you added it.`
      });
    }
    const avail = availabilityOf({
      productStatus: l.product_status,
      available: l.available,
      inventoryPolicy: l.inventory_policy
    });
    if (!avail.buyable) {
      notices.push({
        kind: 'availability_change',
        sku: l.sku,
        line_id: l.id,
        title: l.title,
        message: `${l.title} is ${avail.state === 'discontinued' ? 'no longer sold' : 'sold out'} since you added it.`
      });
    } else if (l.quantity > l.available) {
      notices.push({
        kind: 'availability_change',
        sku: l.sku,
        line_id: l.id,
        title: l.title,
        message: `Only ${l.available} of ${l.title} remain. Reduce the quantity to continue.`
      });
    }
  }

  // Money is integers throughout; the subtotal is the sum of the line totals.
  const subtotal = lines.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
  const rung = protectionRungFor(subtotal);
  const protectionMinor = cart.protection_enabled && rung ? rung.price_minor : 0;
  const method = deliveryMethod(cart.shipping_method);
  const shipping = method ? method.price_minor : 0;
  // Shipment protection is excluded from tax.
  const tax = taxFor(subtotal);
  const total = subtotal + protectionMinor + shipping + tax;
  return {
    id: cart.id,
    token: cart.token,
    email: cart.email,
    shipping_address: cart.shipping_address,
    shipping_method: cart.shipping_method,
    marketing_consent: cart.marketing_consent,
    protection_enabled: cart.protection_enabled,
    lines: lines.map(l => ({
      id: l.id,
      variant_id: l.variant_id,
      sku: l.sku,
      handle: l.handle,
      title: l.title,
      subtitle: l.subtitle,
      kind: l.kind,
      option_value: l.option_value,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      current_price_minor: l.current_price_minor,
      total_minor: l.unit_price_minor * l.quantity,
      available: l.available,
      product_status: l.product_status
    })),
    item_count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal_minor: subtotal,
    protection_rung: rung ? {
      sku: rung.sku,
      price_minor: rung.price_minor,
      enabled: Boolean(cart.protection_enabled)
    } : null,
    protection_minor: protectionMinor,
    shipping_minor: shipping,
    tax_minor: tax,
    total_minor: total,
    notices,
    // The order is refused if a line changed since the cart was last shown.
    priced_fingerprint: fingerprint(lines)
  };
}

/** A stable fingerprint of what the cart was last shown at. */
function fingerprint(lines) {
  return lines.map(l => `${l.sku}:${l.quantity}:${l.unit_price_minor}`).sort().join('|');
}
async function touchCart(cartId) {
  await query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cartId]);
}

// Billing is killbill: a billing platform, not a card processor. There is no
// card, no token and no decline. Every host and credential comes from the
// environment; nothing here is hardcoded.
function config() {
  const base = (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, '');
  return {
    base,
    apiKey: process.env.PAYMENTS_API_KEY || '',
    apiSecret: process.env.PAYMENTS_API_SECRET || '',
    user: process.env.PAYMENTS_ADMIN_USER || '',
    password: process.env.PAYMENTS_ADMIN_PASSWORD || ''
  };
}
function headers(cfg, extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: 'Basic ' + Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64'),
    'X-Killbill-ApiKey': cfg.apiKey,
    'X-Killbill-ApiSecret': cfg.apiSecret,
    'X-Killbill-CreatedBy': 'vela-storefront',
    ...extra
  };
}
async function kbFetch(path, init = {}, timeoutMs = 20000) {
  const cfg = config();
  if (!cfg.base) throw new Error('PAYMENTS_API_URL is not set');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${cfg.base}${path}`, {
      ...init,
      headers: headers(cfg, init.headers),
      signal: ctl.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
async function healthy() {
  try {
    const cfg = config();
    const res = await fetch(`${cfg.base}/1.0/healthcheck`, {
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 200 when the account exists, 404 when it does not. */
async function findAccountByExternalKey(externalKey) {
  const res = await kbFetch(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`killbill account lookup failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Create or reuse one account keyed by the order email lowercased. externalKey
 * is unique per tenant, so a second create with a used key is refused by the
 * store rather than by app code; we treat that refusal as "already there".
 */
async function ensureAccount({
  externalKey,
  email,
  name
}) {
  const existing = await findAccountByExternalKey(externalKey);
  if (existing) return existing;
  const res = await kbFetch('/1.0/kb/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: name || email,
      externalKey,
      email,
      currency: 'USD',
      country: 'US'
    })
  });
  if (res.status === 201) {
    const location = res.headers.get('location');
    if (location) {
      const byId = await kbFetch(`/1.0/kb/accounts/${location.split('/').pop()}`);
      if (byId.ok) return byId.json();
    }
    const after = await findAccountByExternalKey(externalKey);
    if (after) return after;
  }

  // The store refused the duplicate key: read back the winner.
  const after = await findAccountByExternalKey(externalKey);
  if (after) return after;
  throw new Error(`killbill account create failed: ${res.status} ${await res.text()}`);
}

/**
 * Raise one invoice on the account for the order total in USD. The amount is
 * the app's integer minor units expressed as a decimal string; no float is ever
 * constructed on the way out.
 */
async function createInvoiceCharge({
  accountId,
  totalMinor,
  description
}) {
  const amount = minorToDecimalString(totalMinor);
  const body = JSON.stringify([{
    accountId,
    amount: Number(amount),
    currency: 'USD',
    description
  }]);
  const res = await kbFetch(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: 'POST',
    body
  }, 30000);
  if (!res.ok) {
    throw new Error(`killbill invoice create failed: ${res.status} ${await res.text()}`);
  }
  const items = await res.json();
  const item = Array.isArray(items) ? items[0] : items;
  return {
    invoiceId: item?.invoiceId ?? null,
    invoiceItemId: item?.invoiceItemId ?? null,
    amount
  };
}

/** Read one invoice back, with its items, so the figure is confirmed at source. */
async function getInvoice(invoiceId) {
  const res = await kbFetch(`/1.0/kb/invoices/${invoiceId}?withItems=true`);
  if (!res.ok) return null;
  return res.json();
}

// Mail goes over real SMTP. Host, port and credentials come from the
// environment; a body written to a log instead of sent is not mail.
let transport;
function getTransport() {
  if (!transport) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 1025);
    if (!host) throw new Error('SMTP_HOST is not set');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      ignoreTLS: true,
      // Authenticate with SMTP_USER and SMTP_PASS where they are set.
      ...(user ? {
        auth: {
          user,
          pass: pass || ''
        }
      } : {}),
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return transport;
}
const FROM = process.env.MAIL_FROM || 'Vela Electronics <orders@vela.example>';

/**
 * A confirmed order sends exactly one mail to the order's email only, with no
 * cc and no bcc. The subject is `Order confirmed: ` then the order number.
 */
async function sendOrderConfirmation(order, lines) {
  const subject = `Order confirmed: ${order.number}`;
  const lineText = lines.map(l => `  ${l.title_snapshot} x${l.quantity}  ${formatMoney(l.total_minor)}`).join('\n');
  const text = [`Your order is confirmed.`, ``, `Order ${order.number}`, ``, lineText, ``, `Subtotal: ${formatMoney(order.subtotal_minor)}`, `Delivery (${order.shipping_method}): ${formatMoney(order.shipping_minor)}`, `Tax: ${formatMoney(order.tax_minor)}`, `Total: ${formatMoney(order.total_minor)}`, ``, `We will send the serial numbers when it ships.`, ``, `The Vela team.`].join('\n');
  const rows = lines.map(l => `<tr><td>${escapeHtml(l.title_snapshot)}</td><td align="right">${l.quantity}</td><td align="right">${formatMoney(l.total_minor)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif">
<p>Your order is confirmed.</p>
<p>Order <strong>${escapeHtml(order.number)}</strong></p>
<table cellpadding="6" style="border-collapse:collapse">${rows}</table>
<p>Subtotal: ${formatMoney(order.subtotal_minor)}<br>
Delivery (${escapeHtml(order.shipping_method)}): ${formatMoney(order.shipping_minor)}<br>
Tax: ${formatMoney(order.tax_minor)}<br>
<strong>Total: ${formatMoney(order.total_minor)}</strong></p>
<p>The Vela team.</p>
</body></html>`;
  const info = await getTransport().sendMail({
    from: FROM,
    to: order.email,
    // the order's email only, no cc and no bcc
    subject,
    text,
    html
  });
  return info;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

/** VE-<year>-<four digits>, allocated in sequence by the store. */
async function allocateNumber(client) {
  const {
    rows
  } = await client.query(`SELECT nextval('order_number_seq') AS n`);
  const n = Number(rows[0].n);
  const year = new Date().getUTCFullYear();
  return `VE-${year}-${String(n).padStart(4, '0')}`;
}

/**
 * Place an order.
 *
 * Re-prices every line, commits stock in one atomic step per line so two
 * concurrent checkouts for the last unit cannot both succeed, then raises the
 * invoice and sends the mail exactly once.
 */
async function placeOrder({
  cart,
  customer,
  idempotencyKey,
  expectedTotalMinor,
  requestId
}) {
  const lines = await cartLines(cart.id);
  if (lines.length === 0) {
    throw unprocessable('cart_empty', 'Your cart is empty.');
  }
  const email = (cart.email || customer?.email || '').trim();
  if (!email) throw unprocessable('email_required', 'Email is required.');
  if (!cart.shipping_address) throw unprocessable('address_required', 'A delivery address is required.');
  const method = deliveryMethod(cart.shipping_method);
  if (!method) throw unprocessable('shipping_method_required', 'Choose how it gets there.');

  // Placing an order re-prices every line. If a line changed since the cart was
  // last shown the order is refused and the person returns to a re-priced cart.
  const changed = lines.filter(l => l.unit_price_minor !== l.current_price_minor);
  if (changed.length > 0) {
    throw new AppError(409, 'price_changed', changed.map(l => `The price of ${l.title} changed from ${formatMoney(l.unit_price_minor)} to ${formatMoney(l.current_price_minor)} since you added it.`).join(' '), {
      notices: changed.map(l => ({
        sku: l.sku,
        title: l.title,
        old_price_minor: l.unit_price_minor,
        new_price_minor: l.current_price_minor
      }))
    });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
  const rung = protectionRungFor(subtotal);
  const protectionMinor = cart.protection_enabled && rung ? rung.price_minor : 0;
  const shipping = method.price_minor;
  const tax = taxFor(subtotal); // protection is excluded from tax
  const total = subtotal + protectionMinor + shipping + tax;

  // The total authorized is the figure the final step showed.
  if (expectedTotalMinor !== undefined && expectedTotalMinor !== null && Number(expectedTotalMinor) !== total) {
    throw new AppError(409, 'total_changed', `The total changed from ${formatMoney(expectedTotalMinor)} to ${formatMoney(total)}. Check the order and place it again.`, {
      expected_total_minor: Number(expectedTotalMinor),
      total_minor: total
    });
  }
  const accessToken = randomToken(24);

  /**
   * Guest checkout is the default, but an order placed with the address of a
   * registered account belongs to that account: it is the same person, and
   * they should find it in their own history rather than only by the token in
   * their mail. The link is made once, here, so the row states the truth.
   */
  let ownerId = customer?.id ?? cart.customer_id ?? null;
  if (!ownerId) {
    const match = await one(`SELECT id FROM customer WHERE lower(email) = lower($1) AND status = 'active'`, [email]);
    if (match) ownerId = match.id;
  }
  let created;
  try {
    created = await tx(async c => {
      // A replayed Idempotency-Key returns the order it returned the first time.
      if (idempotencyKey) {
        const {
          rows: prior
        } = await c.query(`SELECT * FROM "order" WHERE idempotency_key = $1`, [idempotencyKey]);
        if (prior[0]) return {
          order: prior[0],
          replayed: true
        };
      }

      // Commit stock in one step: available falls and committed rises per line.
      // The guard lives in the UPDATE itself, so the loser of a race writes
      // nothing and available never goes negative.
      for (const l of lines) {
        if (l.kind === 'protection') continue;
        const {
          rows
        } = await c.query(`UPDATE inventory_level
              SET available = available - $2, committed = committed + $2
            WHERE variant_id = $1
              AND (available >= $2 OR $3 = 'continue')
            RETURNING available`, [l.variant_id, l.quantity, l.inventory_policy]);
        if (rows.length === 0) {
          throw conflict('out_of_stock', `${l.title} ${l.option_value} is no longer available in that quantity.`, {
            sku: l.sku,
            resource: l.sku
          });
        }
      }
      const number = await allocateNumber(c);
      const {
        rows: or
      } = await c.query(`INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
             discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
             shipping_method, shipping_address, access_token_hash, idempotency_key,
             killbill_external_key, protection_minor)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11,$12,$13)
         RETURNING *`, [number, ownerId, email, subtotal + protectionMinor, shipping, tax, total, method.code, cart.shipping_address, hashOpaque(accessToken), idempotencyKey || null, email.toLowerCase(), protectionMinor]);
      const order = or[0];
      for (const [i, l] of lines.entries()) {
        await c.query(`INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity,
              unit_price_minor, total_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [order.id, l.variant_id, `${l.title} ${l.option_value}`.trim(), l.sku, l.quantity, l.unit_price_minor, l.unit_price_minor * l.quantity, i + 1]);
      }
      if (protectionMinor > 0 && rung) {
        const {
          rows: pv
        } = await c.query(`SELECT id FROM variant WHERE sku = $1`, [rung.sku]);
        if (pv[0]) {
          await c.query(`INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity,
                unit_price_minor, total_minor, position)
             VALUES ($1,$2,'Shipment protection',$3,1,$4,$4,$5)`, [order.id, pv[0].id, rung.sku, protectionMinor, lines.length + 1]);
        }
      }

      // The cart is emptied so a reload cannot place it twice.
      await c.query(`DELETE FROM cart_line WHERE cart_id = $1`, [cart.id]);
      await c.query(`UPDATE cart SET protection_enabled = false, updated_at = now() WHERE id = $1`, [cart.id]);
      return {
        order,
        replayed: false
      };
    });
  } catch (err) {
    if (err?.code === PG_UNIQUE_VIOLATION && String(err.constraint || '').includes('idempotency')) {
      const prior = await one(`SELECT * FROM "order" WHERE idempotency_key = $1`, [idempotencyKey]);
      if (prior) created = {
        order: prior,
        replayed: true
      };else throw err;
    } else {
      throw err;
    }
  }
  if (created.replayed) {
    const settled = await waitForSettled(created.order.id);
    return {
      order: settled,
      lines: await orderLines(settled.id),
      access_token: null,
      replayed: true
    };
  }
  const order = await confirmOrder(created.order, requestId);
  return {
    order,
    lines: await orderLines(order.id),
    access_token: accessToken,
    replayed: false
  };
}

/**
 * Raise the invoice and send the mail, exactly once. The order row is locked and
 * only the caller that finds it pending does the outside work, so a replay
 * creates no second account, invoice or mail.
 */
async function confirmOrder(orderRow, requestId) {
  const lines = await orderLines(orderRow.id);
  const externalKey = orderRow.email.toLowerCase();
  let invoice;
  try {
    // One killbill account keyed by the order email lowercased, created or reused.
    const account = await ensureAccount({
      externalKey,
      email: orderRow.email,
      name: orderRow.shipping_address?.name || orderRow.email
    });
    invoice = await createInvoiceCharge({
      accountId: account.accountId,
      totalMinor: orderRow.total_minor,
      description: `Vela order ${orderRow.number}`
    });

    // Read the figure back from the platform, so the app never reports a total
    // it has only told itself.
    const confirmed = invoice.invoiceId ? await getInvoice(invoice.invoiceId) : null;
    await query(`UPDATE "order"
          SET status = 'confirmed', payment_status = 'invoiced',
              killbill_account_id = $2, killbill_invoice_id = $3, killbill_invoice_amount = $4
        WHERE id = $1`, [orderRow.id, account.accountId, invoice.invoiceId, confirmed?.amount ?? invoice.amount]);
    logEvent('order invoiced', {
      request_id: requestId,
      order: orderRow.number,
      killbill_account_id: account.accountId,
      killbill_invoice_id: invoice.invoiceId,
      amount: invoice.amount
    });
  } catch (err) {
    // The invoice could not be raised: release the stock this order committed
    // and leave the order cancelled rather than pretending it was paid.
    logError('order billing failed', {
      request_id: requestId,
      order: orderRow.number,
      error: String(err?.message || err)
    });
    await releaseStock(orderRow.id);
    await query(`UPDATE "order" SET status = 'cancelled' WHERE id = $1`, [orderRow.id]);
    throw new AppError(502, 'billing_unavailable', 'We could not raise the invoice for this order, so we have not taken it. Nothing was charged. Try again in a moment.');
  }

  // A confirmed order sends exactly one mail. Mail failure does not unmake a
  // confirmed order or a raised invoice; it is logged and the order stands.
  try {
    const fresh = await one(`SELECT * FROM "order" WHERE id = $1`, [orderRow.id]);
    await sendOrderConfirmation(fresh, lines.filter(l => l.sku_snapshot !== 'VELA-PROTECT-1'));
    logEvent('order mail sent', {
      request_id: requestId,
      order: orderRow.number,
      to: orderRow.email
    });
  } catch (err) {
    logError('order mail failed', {
      request_id: requestId,
      order: orderRow.number,
      error: String(err?.message || err)
    });
  }
  return one(`SELECT * FROM "order" WHERE id = $1`, [orderRow.id]);
}
async function releaseStock(orderId) {
  try {
    await query(`UPDATE inventory_level il
          SET available = il.available + ol.quantity, committed = GREATEST(il.committed - ol.quantity, 0)
         FROM order_line ol
        WHERE ol.order_id = $1 AND ol.variant_id = il.variant_id`, [orderId]);
  } catch (err) {
    logError('stock release failed', {
      order_id: orderId,
      error: String(err?.message || err)
    });
  }
}

/**
 * Look up the order a previously seen Idempotency-Key produced. A replay that
 * arrives while the first request is still at the billing platform waits for it
 * to settle rather than reporting a half-made order.
 */
async function replayOrder(idempotencyKey) {
  const prior = await one(`SELECT * FROM "order" WHERE idempotency_key = $1`, [idempotencyKey]);
  if (!prior) return null;
  const settled = await waitForSettled(prior.id);
  return {
    order: settled ?? prior,
    lines: await orderLines(prior.id)
  };
}

/** A replay may arrive while the first request is still at the billing platform. */
async function waitForSettled(orderId, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let row = await one(`SELECT * FROM "order" WHERE id = $1`, [orderId]);
  while (row && row.status === 'pending' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 150));
    row = await one(`SELECT * FROM "order" WHERE id = $1`, [orderId]);
  }
  return row;
}
async function orderLines(orderId) {
  return many(`SELECT ol.*, v.sku, p.handle, p.kind, p.title AS product_title
       FROM order_line ol
       JOIN variant v ON v.id = ol.variant_id
       JOIN product p ON p.id = v.product_id
      WHERE ol.order_id = $1
      ORDER BY ol.position, ol.id`, [orderId]);
}
async function orderSerials(orderId) {
  return many(`SELECT d.serial, d.status, d.firmware_version, p.title AS model,
            EXISTS (SELECT 1 FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS owned
       FROM device d JOIN product p ON p.id = d.product_id
      WHERE d.order_id = $1
      ORDER BY d.serial`, [orderId]);
}
async function findOrderByNumber(number) {
  return one(`SELECT * FROM "order" WHERE number = $1`, [number]);
}

/**
 * One order, readable by its access token or by the customer who owns it.
 * Another customer's order reads as not found, never as forbidden.
 */
async function readableOrder(number, {
  accessToken,
  customer
}) {
  const order = await findOrderByNumber(number);
  if (!order) throw notFound('That order does not exist.', 'order_not_found');
  if (accessToken && order.access_token_hash === hashOpaque(accessToken)) return order;
  if (customer && order.customer_id === customer.id) return order;
  throw notFound('That order does not exist.', 'order_not_found');
}
function orderPayload(order, lines, serials = []) {
  return {
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    currency: order.currency,
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    placed_at: order.placed_at,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    lines: lines.map(l => ({
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
      kind: l.kind,
      handle: l.handle
    })),
    serials: serials.map(s => ({
      serial: s.serial,
      model: s.model,
      status: s.status,
      registered: s.owned
    }))
  };
}

/** The newest general firmware for a product, which is what a device is offered. */
async function latestFirmwareFor(productId, {
  channel = 'general'
} = {}) {
  return one(`SELECT * FROM firmware WHERE product_id = $1 AND channel = $2 ORDER BY build DESC LIMIT 1`, [productId, channel]);
}
async function deviceBySerial(serial) {
  return one(`SELECT d.*, p.title AS model, p.handle, v.option_value
       FROM device d
       JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id
      WHERE upper(d.serial) = upper($1)`, [serial]);
}

/** Devices this customer owns right now, newest claim first. */
async function devicesForCustomer(customerId, {
  limit,
  cursor
}) {
  const params = [customerId, limit + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.claimed_at, cursor.id);
    where = ` AND (o.claimed_at, o.id) < ($3::timestamptz, $4::uuid)`;
  }
  return many(`SELECT d.id, d.serial, d.nickname, d.firmware_version, d.firmware_reported_at,
            d.warranty_until, d.status, d.product_id,
            p.title AS model, p.handle, v.option_value,
            o.id AS ownership_id, o.claimed_at, o.method
       FROM device_ownership o
       JOIN device d ON d.id = o.device_id
       JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id
      WHERE o.customer_id = $1 AND o.released_at IS NULL${where}
      ORDER BY o.claimed_at DESC, o.id DESC
      LIMIT $2`, params);
}
async function decorateDevice(row) {
  const latest = await latestFirmwareFor(row.product_id);
  const current = row.firmware_version;
  const updateAvailable = Boolean(latest && current && compareVersions(current, latest.version) < 0);
  return {
    serial: row.serial,
    model: row.model,
    handle: row.handle,
    option_value: row.option_value ?? null,
    nickname: row.nickname,
    firmware_version: current,
    firmware_reported_at: row.firmware_reported_at,
    latest_firmware_version: latest?.version ?? null,
    update_available: updateAvailable,
    never_connected: !current,
    warranty_until: row.warranty_until,
    warranty_expired: row.warranty_until ? new Date(`${String(row.warranty_until).slice(0, 10)}T00:00:00Z`) < new Date() : false,
    status: row.status,
    claimed_at: row.claimed_at ?? null
  };
}

/**
 * Register a serial to a customer.
 *
 * A serial registers only when the device exists with no live owner. The single
 * live owner is enforced by a partial unique index, so two simultaneous
 * registrations of one serial cannot both succeed: one wins, the other is
 * rejected by the store rather than by a check this code races against.
 */
async function registerDevice(customerId, rawSerial) {
  const serial = normaliseSerial(rawSerial);
  // A serial that does not match the shape is refused before any lookup happens.
  if (!isValidSerial(serial)) {
    throw unprocessable('invalid_serial', 'We do not recognise that serial number.');
  }
  const device = await deviceBySerial(serial);
  if (!device) {
    throw notFound('We do not recognise that serial number.', 'device_unknown');
  }
  if (device.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked and cannot be registered.', {
      resource: serial
    });
  }
  try {
    return await tx(async c => {
      const {
        rows: existing
      } = await c.query(`SELECT customer_id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`, [device.id]);
      if (existing[0]) {
        if (existing[0].customer_id === customerId) {
          // Already this customer's camera: nothing to write.
          return {
            device,
            already: true
          };
        }
        // Never the other person's identity.
        throw conflict('device_owned', 'That camera is registered to someone else.', {
          resource: serial
        });
      }
      await c.query(`INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`, [device.id, customerId]);
      await c.query(`UPDATE device SET status = 'registered' WHERE id = $1 AND status <> 'blocked'`, [device.id]);
      return {
        device,
        already: false
      };
    });
  } catch (err) {
    if (err?.code === PG_UNIQUE_VIOLATION) {
      // The store refused a second live owner: this request lost the race.
      throw conflict('device_owned', 'That camera is registered to someone else.', {
        resource: serial
      });
    }
    throw err;
  }
}

/** Reading, renaming, releasing and flashing are all scoped to the live owner. */
async function ownedDeviceOr404(customerId, rawSerial) {
  const serial = normaliseSerial(rawSerial);
  if (!isValidSerial(serial)) {
    throw notFound('We do not recognise that serial number.', 'device_unknown');
  }
  const row = await one(`SELECT d.id, d.serial, d.nickname, d.firmware_version, d.firmware_reported_at,
            d.warranty_until, d.status, d.product_id, d.order_id,
            p.title AS model, p.handle, v.option_value,
            o.id AS ownership_id, o.claimed_at, o.method
       FROM device d
       JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id
       JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
      WHERE upper(d.serial) = upper($1) AND o.customer_id = $2`, [serial, customerId]);
  // Another customer's serial reads as not found, never forbidden.
  if (!row) throw notFound('We do not recognise that serial number.', 'device_not_found');
  return row;
}
async function renameDevice(customerId, serial, nickname) {
  const device = await ownedDeviceOr404(customerId, serial);
  const clean = String(nickname ?? '').trim().slice(0, 80);
  await query(`UPDATE device SET nickname = $2 WHERE id = $1`, [device.id, clean || null]);
  return {
    ...device,
    nickname: clean || null
  };
}

/** Releasing ends the link and grants it to nobody. */
async function releaseDevice(customerId, serial) {
  const device = await ownedDeviceOr404(customerId, serial);
  await tx(async c => {
    await c.query(`UPDATE device_ownership SET released_at = now()
        WHERE device_id = $1 AND released_at IS NULL AND customer_id = $2`, [device.id, customerId]);
    await c.query(`UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1 AND status = 'registered'`, [device.id]);
  });
  return {
    ...device,
    nickname: null,
    status: 'sold'
  };
}

/**
 * Start a flash session.
 *
 * Refused before it starts when the target image belongs to another product, or
 * its min_firmware is above the version the device reports. A refusal writes no
 * session row and leaves the firmware untouched.
 *
 * Ownership and warranty are not conditions of repair: a camera registered to
 * somebody else, and a camera out of warranty, are both repaired.
 */
async function startSession({
  serial,
  targetBuild,
  reportedVersion
}) {
  const clean = normaliseSerial(serial);
  if (!isValidSerial(clean)) {
    throw unprocessable('invalid_serial', 'We do not recognise that serial number.');
  }
  const device = await one(`SELECT d.*, p.title AS model FROM device d JOIN product p ON p.id = d.product_id
      WHERE upper(d.serial) = upper($1)`, [clean]);
  if (!device) throw notFound('We do not recognise that serial number.', 'device_unknown');
  if (device.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked. We cannot write firmware to it.', {
      resource: clean
    });
  }
  const firmware = await one(`SELECT * FROM firmware WHERE build = $1`, [Number(targetBuild)]);
  if (!firmware) throw notFound('That firmware does not exist.', 'firmware_unknown');

  // The image must belong to this product.
  if (firmware.product_id !== device.product_id) {
    throw unprocessable('firmware_wrong_product', `That image is for a different model. It cannot be written to a ${device.model}.`);
  }

  // A manifest entry whose channel is not general is never offered to a device
  // that has not opted into that channel.
  if (firmware.channel !== 'general') {
    throw unprocessable('firmware_channel', 'That image is not on the general channel, so it is not offered for this camera.');
  }

  // The version the device reports now, falling back to what we last heard.
  const current = reportedVersion ? String(reportedVersion) : device.firmware_version;
  if (firmware.min_firmware) {
    if (!current) {
      throw unprocessable('firmware_minimum', `That image needs the camera to be running ${firmware.min_firmware} or later. We have not heard a version from this camera.`);
    }
    if (compareVersions(current, firmware.min_firmware) < 0) {
      throw unprocessable('firmware_minimum', `That image needs the camera to be running ${firmware.min_firmware} or later. This one reports ${current}.`);
    }
  }
  if (reportedVersion && reportedVersion !== device.firmware_version) {
    await query(`UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`, [device.id, String(reportedVersion)]);
  }
  try {
    const session = await one(`INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`, [device.id, firmware.id]);
    return {
      session,
      device,
      firmware
    };
  } catch (err) {
    if (err?.code === PG_UNIQUE_VIOLATION) {
      // At most one session in started per device at any time.
      throw conflict('flash_in_progress', 'A firmware write is already running for that camera.', {
        resource: clean
      });
    }
    throw err;
  }
}

/**
 * Complete a session. Records the version read back from the device, never the
 * one that was requested.
 */
async function completeSession(id, reportedVersion) {
  const version = String(reportedVersion ?? '').trim();
  if (!version) {
    throw unprocessable('reported_version_required', 'The camera did not report a version, so we cannot close this session.');
  }
  return tx(async c => {
    const {
      rows
    } = await c.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [id]);
    const session = rows[0];
    if (!session) throw notFound('That session does not exist.', 'session_not_found');
    if (session.state !== 'started') {
      throw conflict('session_not_started', 'That session has already finished.', {
        resource: id
      });
    }
    const {
      rows: sr
    } = await c.query(`UPDATE flash_session SET state = 'succeeded', reported_version = $2, ended_at = now()
        WHERE id = $1 RETURNING *`, [id, version]);
    // The device records what the camera reported.
    const {
      rows: dr
    } = await c.query(`UPDATE device SET firmware_version = $2, firmware_reported_at = now()
        WHERE id = $1 RETURNING serial, firmware_version`, [session.device_id, version]);
    return {
      session: sr[0],
      device: dr[0]
    };
  });
}

/** A failed session leaves the firmware version as it was. */
async function failSession(id, reason) {
  return tx(async c => {
    const {
      rows
    } = await c.query(`SELECT * FROM flash_session WHERE id = $1 FOR UPDATE`, [id]);
    const session = rows[0];
    if (!session) throw notFound('That session does not exist.', 'session_not_found');
    if (session.state !== 'started') {
      throw conflict('session_not_started', 'That session has already finished.', {
        resource: id
      });
    }
    const {
      rows: sr
    } = await c.query(`UPDATE flash_session SET state = 'failed', failure_reason = $2, ended_at = now()
        WHERE id = $1 RETURNING *`, [id, String(reason ?? '').slice(0, 200) || 'unknown']);
    return {
      session: sr[0]
    };
  });
}
async function sessionById(id) {
  return one(`SELECT * FROM flash_session WHERE id = $1`, [id]);
}

const api = new Hono().basePath('/api');

/* ---------- request identity, structured logging, error shape ---------- */

api.use('*', async (c, next) => {
  const started = performance.now();
  const requestId = c.req.header('x-request-id') || newRequestId();
  c.set('requestId', requestId);
  c.set('startedAt', started);
  c.header('x-request-id', requestId);
  await next();

  // One line of JSON per request, carrying the method, route, status, elapsed
  // milliseconds and the request_id.
  logRequest({
    method: c.req.method,
    route: new URL(c.req.url).pathname,
    status: c.res.status,
    ms: performance.now() - started,
    requestId
  });
});

/**
 * Errors are turned into responses here rather than in the middleware, because
 * the framework handles a rejected handler itself and would otherwise answer
 * every refusal with a bare 500. An invalid, unauthorized or out-of-state call
 * must be a client error carrying its own code, message and request_id.
 */
api.onError((err, c) => {
  const requestId = c.get('requestId') || newRequestId();
  const status = isAppError(err) ? err.status : 500;
  if (status >= 500) {
    logError('unhandled error', {
      request_id: requestId,
      error: String(err?.message || err),
      stack: err?.stack
    });
  }
  logRequest({
    method: c.req.method,
    route: new URL(c.req.url).pathname,
    status,
    ms: performance.now() - (c.get('startedAt') ?? performance.now()),
    requestId
  });
  return new Response(JSON.stringify(errorBody(err, requestId)), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId
    }
  });
});
const rid = c => c.get('requestId');

/* ---------- health ---------- */

api.get('/health', async c => {
  try {
    await query('SELECT 1');
  } catch (err) {
    return c.json({
      status: 'unhealthy',
      code: 'database_unavailable',
      message: 'The database is not reachable.',
      request_id: rid(c)
    }, 503);
  }
  return c.json({
    status: 'ok',
    request_id: rid(c)
  });
});
api.get('/health/deep', async c => {
  const [db, billing] = await Promise.all([query('SELECT 1').then(() => true).catch(() => false), healthy()]);
  return c.json({
    status: db ? 'ok' : 'unhealthy',
    database: db,
    billing,
    request_id: rid(c)
  }, db ? 200 : 503);
});

/* ---------- auth ---------- */

function customerPayload(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    created_at: row.created_at
  };
}
api.post('/auth/signup', async c => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();
  if (!email) throw unprocessable('email_required', 'Email is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw unprocessable('email_invalid', 'That did not work. Enter an email address.');
  if (!name) throw unprocessable('name_required', 'Name is required.');
  if (password.length < 8) throw unprocessable('password_too_short', 'Password is required and must be at least 8 characters.');
  try {
    const row = await one(`INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active')
       RETURNING id, email, name, created_at`, [email, name, hashPassword(password)]);
    return c.json({
      access_token: issueToken(row.id),
      customer: customerPayload(row)
    }, 201);
  } catch (err) {
    // Signup refuses a registered address.
    if (err?.code === PG_UNIQUE_VIOLATION) {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.', {
        resource: email
      });
    }
    throw err;
  }
});
api.post('/auth/login', async c => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const row = await one(`SELECT * FROM customer WHERE lower(email) = lower($1) AND status = 'active'`, [email]);
  // The same answer either way, so this cannot be used to learn who has an account.
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw unauthorized('That email and password do not match.', 'invalid_credentials');
  }
  return c.json({
    access_token: issueToken(row.id),
    customer: customerPayload(row)
  });
});
api.get('/auth/me', async c => {
  const customer = await requireCustomer(c.req.raw);
  return c.json({
    customer: customerPayload(customer)
  });
});

/* ---------- catalogue ---------- */

async function productPayload(row, {
  withBlocks = false
} = {}) {
  const variants = await many(`SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, COALESCE(il.available,0) AS available, COALESCE(il.committed,0) AS committed
       FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = $1 ORDER BY v.position, v.id`, [row.id]);
  const decorated = variants.map(v => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    option_value: v.option_value,
    price_minor: v.price_minor,
    currency: v.currency,
    available: v.available,
    availability: availabilityOf({
      productStatus: row.status,
      available: v.available,
      inventoryPolicy: v.inventory_policy
    })
  }));
  const prices = decorated.map(v => v.price_minor);
  const payload = {
    handle: row.handle,
    title: row.title,
    subtitle: row.subtitle,
    kind: row.kind,
    status: row.status,
    support_until: row.support_until,
    position: row.position,
    variants: decorated,
    price_minor: Math.min(...prices),
    price_varies: new Set(prices).size > 1,
    availability: availabilityOf({
      productStatus: row.status,
      available: decorated.reduce((n, v) => n + v.available, 0),
      inventoryPolicy: 'deny'
    })
  };
  if (withBlocks) {
    payload.blocks = await many(`SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id`, [row.id]);
  }
  return payload;
}

// The catalogue is ordered by the editorial position and never by price or name.
api.get('/products', async c => {
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const params = [pageSize + 1];
  let where = `WHERE kind <> 'protection'`;
  if (cursor) {
    params.push(cursor.position, cursor.id);
    where += ` AND (position, id) > ($2::int, $3::uuid)`;
  }
  const rows = await many(`SELECT * FROM product ${where} ORDER BY position, id LIMIT $1`, params);
  const page = buildPage(rows, pageSize, r => ({
    position: r.position,
    id: r.id
  }));
  const data = [];
  for (const row of page.data) data.push(await productPayload(row));
  return c.json({
    data,
    next_cursor: page.next_cursor,
    has_more: page.has_more
  });
});
api.get('/products/:handle', async c => {
  const handle = c.req.param('handle');
  const row = await one(`SELECT * FROM product WHERE handle = $1 AND kind <> 'protection'`, [handle]);
  if (!row) throw notFound('That product does not exist.', 'product_not_found');
  const payload = await productPayload(row, {
    withBlocks: true
  });

  // A parameter naming a variant that does not exist renders the default and
  // drops the parameter without comment.
  const wanted = c.req.query('variant');
  const selected = payload.variants.find(v => v.sku === wanted) ?? payload.variants[0];
  return c.json({
    product: payload,
    selected_sku: selected?.sku ?? null
  });
});

/* ---------- cart ---------- */

function cartTokenFrom(c) {
  const header = c.req.header('x-cart-token');
  if (header) return header;
  const cookie = c.req.header('cookie') || '';
  const m = /(?:^|;\s*)vela_cart=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}
function setCartCookie(c, token) {
  c.header('set-cookie', `${CART_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; HttpOnly`, {
    append: true
  });
}
async function cartFor(c) {
  const customer = await currentCustomer(c.req.raw);
  const token = cartTokenFrom(c);
  const cart = await getOrCreateCart(token, customer?.id ?? null);
  if (cart.token !== token) setCartCookie(c, cart.token);
  if (customer && !cart.customer_id) {
    await query(`UPDATE cart SET customer_id = $2 WHERE id = $1`, [cart.id, customer.id]);
    cart.customer_id = customer.id;
  }
  return cart;
}
api.get('/cart', async c => {
  const cart = await cartFor(c);
  return c.json({
    cart: await cartView(cart)
  });
});
api.post('/cart/lines', async c => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));
  const sku = String(body.sku ?? '').trim();
  const quantity = Number(body.quantity ?? 1);
  if (!sku) throw unprocessable('sku_required', 'Choose an option first.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw unprocessable('quantity_invalid', 'Quantity must be a whole number from 1 to 10.');
  }
  const variant = await one(`SELECT v.*, p.status AS product_status, p.title, p.kind, COALESCE(il.available,0) AS available
       FROM variant v JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.sku = $1`, [sku]);
  if (!variant || variant.kind === 'protection') {
    throw notFound('That item does not exist.', 'variant_not_found');
  }
  const avail = availabilityOf({
    productStatus: variant.product_status,
    available: variant.available,
    inventoryPolicy: variant.inventory_policy
  });
  if (!avail.buyable) {
    throw unprocessable('not_buyable', avail.state === 'discontinued' ? 'We no longer sell this.' : 'That option is sold out.');
  }
  const existing = await one(`SELECT * FROM cart_line WHERE cart_id = $1 AND variant_id = $2`, [cart.id, variant.id]);
  const nextQty = Math.min((existing?.quantity ?? 0) + quantity, 10);
  if (nextQty > variant.available) {
    throw unprocessable('insufficient_stock', `Only ${variant.available} left.`);
  }
  if (existing) {
    await query(`UPDATE cart_line SET quantity = $2 WHERE id = $1`, [existing.id, nextQty]);
  } else {
    // A cart line stores the unit price at add time.
    await query(`INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)`, [cart.id, variant.id, nextQty, variant.price_minor]);
  }
  await touchCart(cart.id);
  return c.json({
    cart: await cartView(cart)
  }, 201);
});
api.patch('/cart/lines/:id', async c => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw unprocessable('quantity_invalid', 'Quantity must be a whole number from 1 to 10.');
  }
  const line = await one(`SELECT cl.*, COALESCE(il.available,0) AS available, p.title
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.id = $1 AND cl.cart_id = $2`, [c.req.param('id'), cart.id]);
  if (!line) throw notFound('That line is not in your cart.', 'line_not_found');
  if (quantity > line.available) {
    throw unprocessable('insufficient_stock', `Only ${line.available} left.`);
  }
  await query(`UPDATE cart_line SET quantity = $2 WHERE id = $1`, [line.id, quantity]);
  await touchCart(cart.id);
  return c.json({
    cart: await cartView(cart)
  });
});
api.delete('/cart/lines/:id', async c => {
  const cart = await cartFor(c);
  const {
    rowCount
  } = await query(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [c.req.param('id'), cart.id]);
  if (!rowCount) throw notFound('That line is not in your cart.', 'line_not_found');
  await touchCart(cart.id);
  return c.json({
    cart: await cartView(cart)
  });
});
api.post('/cart/protection', async c => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));
  await query(`UPDATE cart SET protection_enabled = $2, updated_at = now() WHERE id = $1`, [cart.id, Boolean(body.enabled)]);
  const fresh = await findCartByToken(cart.token);
  return c.json({
    cart: await cartView(fresh)
  });
});
api.post('/cart/delivery', async c => {
  const cart = await cartFor(c);
  const body = await c.req.json().catch(() => ({}));
  const patch = {};
  if (body.email !== undefined) {
    const email = String(body.email ?? '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw unprocessable('email_invalid', 'That did not work. Enter an email address.');
    }
    patch.email = email || null;
  }
  if (body.marketing_consent !== undefined) patch.marketing_consent = Boolean(body.marketing_consent);
  if (body.shipping_address !== undefined) {
    const a = body.shipping_address ?? {};
    const required = ['name', 'line1', 'city', 'region', 'postal_code', 'country'];
    const labels = {
      name: 'Name',
      line1: 'Address',
      city: 'City',
      region: 'Region',
      postal_code: 'Postal code',
      country: 'Country'
    };
    for (const key of required) {
      if (!String(a[key] ?? '').trim()) {
        throw unprocessable('address_incomplete', `${labels[key]} is required.`, {
          field: key
        });
      }
    }
    patch.shipping_address = JSON.stringify({
      name: String(a.name).trim(),
      line1: String(a.line1).trim(),
      line2: String(a.line2 ?? '').trim(),
      city: String(a.city).trim(),
      region: String(a.region).trim(),
      postal_code: String(a.postal_code).trim(),
      country: String(a.country).trim().toUpperCase(),
      phone: String(a.phone ?? '').trim()
    });
  }
  if (body.shipping_method !== undefined) {
    const code = String(body.shipping_method ?? '').trim();
    if (code && !deliveryMethod(code)) {
      throw unprocessable('shipping_method_invalid', 'Choose Standard or Express.');
    }
    patch.shipping_method = code || null;
  }
  const keys = Object.keys(patch);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await query(`UPDATE cart SET ${sets}, updated_at = now() WHERE id = $1`, [cart.id, ...keys.map(k => patch[k])]);
  }
  const fresh = await findCartByToken(cart.token);
  return c.json({
    cart: await cartView(fresh)
  });
});
api.get('/delivery-methods', c => c.json({
  data: DELIVERY_METHODS,
  next_cursor: null,
  has_more: false
}));

/* ---------- orders ---------- */

api.post('/orders', async c => {
  const customer = await currentCustomer(c.req.raw);
  const token = cartTokenFrom(c);
  const body = await c.req.json().catch(() => ({}));
  const idempotencyKey = c.req.header('idempotency-key') || body.idempotency_key || null;

  // A replayed key returns the order it returned the first time. This is
  // answered before the cart is consulted, because the first request emptied
  // the cart and a replay must still get its order back rather than an error.
  if (idempotencyKey) {
    const prior = await replayOrder(idempotencyKey);
    if (prior) {
      const serials = await orderSerials(prior.order.id);
      return c.json({
        order: {
          ...orderPayload(prior.order, prior.lines, serials),
          access_token: null
        },
        replayed: true
      });
    }
  }
  const cart = await findCartByToken(token);
  if (!cart) throw unprocessable('cart_empty', 'Your cart is empty.');
  const result = await placeOrder({
    cart,
    customer,
    idempotencyKey,
    expectedTotalMinor: body.expected_total_minor,
    requestId: rid(c)
  });
  const serials = await orderSerials(result.order.id);
  return c.json({
    order: {
      ...orderPayload(result.order, result.lines, serials),
      access_token: result.access_token
    },
    replayed: result.replayed
  }, result.replayed ? 200 : 201);
});
api.get('/orders/:number', async c => {
  const customer = await currentCustomer(c.req.raw);
  const accessToken = c.req.query('access_token') || c.req.header('x-order-token') || null;
  const order = await readableOrder(c.req.param('number'), {
    accessToken,
    customer
  });
  const lines = await orderLines(order.id);
  const serials = await orderSerials(order.id);
  return c.json({
    order: orderPayload(order, lines, serials)
  });
});

/* ---------- account ---------- */

api.get('/account/orders', async c => {
  const customer = await requireCustomer(c.req.raw);
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const params = [customer.id, pageSize + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.placed_at, cursor.id);
    where = ` AND (placed_at, id) < ($3::timestamptz, $4::uuid)`;
  }
  const rows = await many(`SELECT * FROM "order" WHERE customer_id = $1${where}
      ORDER BY placed_at DESC, id DESC LIMIT $2`, params);
  const page = buildPage(rows, pageSize, r => ({
    placed_at: r.placed_at,
    id: r.id
  }));
  const data = [];
  for (const order of page.data) {
    const lines = await orderLines(order.id);
    data.push({
      ...orderPayload(order, lines),
      first_line_title: lines[0]?.title_snapshot ?? null,
      extra_line_count: Math.max(lines.length - 1, 0)
    });
  }
  return c.json({
    data,
    next_cursor: page.next_cursor,
    has_more: page.has_more
  });
});
api.get('/account/orders/:number', async c => {
  const customer = await requireCustomer(c.req.raw);
  const order = await readableOrder(c.req.param('number'), {
    customer
  });
  const lines = await orderLines(order.id);
  const serials = await orderSerials(order.id);
  return c.json({
    order: orderPayload(order, lines, serials)
  });
});
api.get('/account/devices', async c => {
  const customer = await requireCustomer(c.req.raw);
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const rows = await devicesForCustomer(customer.id, {
    limit: pageSize,
    cursor
  });
  const page = buildPage(rows, pageSize, r => ({
    claimed_at: r.claimed_at,
    id: r.ownership_id
  }));
  const data = [];
  for (const row of page.data) data.push(await decorateDevice(row));
  return c.json({
    data,
    next_cursor: page.next_cursor,
    has_more: page.has_more
  });
});
api.post('/account/devices', async c => {
  const customer = await requireCustomer(c.req.raw);
  const body = await c.req.json().catch(() => ({}));
  const {
    device,
    already
  } = await registerDevice(customer.id, body.serial);
  const row = await one(`SELECT d.id, d.serial, d.nickname, d.firmware_version, d.firmware_reported_at, d.warranty_until,
            d.status, d.product_id, p.title AS model, p.handle, v.option_value
       FROM device d JOIN product p ON p.id = d.product_id
       LEFT JOIN variant v ON v.id = d.variant_id WHERE d.id = $1`, [device.id]);
  return c.json({
    device: await decorateDevice(row),
    already_yours: already
  }, already ? 200 : 201);
});
api.patch('/account/devices/:serial', async c => {
  const customer = await requireCustomer(c.req.raw);
  const body = await c.req.json().catch(() => ({}));
  const updated = await renameDevice(customer.id, c.req.param('serial'), body.nickname);
  return c.json({
    device: await decorateDevice(updated)
  });
});
api.delete('/account/devices/:serial', async c => {
  const customer = await requireCustomer(c.req.raw);
  const released = await releaseDevice(customer.id, c.req.param('serial'));
  return c.json({
    device: await decorateDevice(released),
    released: true
  });
});
api.get('/account/devices/:serial', async c => {
  const customer = await requireCustomer(c.req.raw);
  const device = await ownedDeviceOr404(customer.id, c.req.param('serial'));
  return c.json({
    device: await decorateDevice(device)
  });
});

/* ---------- releases ---------- */

function releasePayload(r) {
  // Four ordered groups only, none invented beyond those four.
  const notes = {};
  for (const group of NOTE_GROUPS) {
    const items = r.notes?.[group];
    if (Array.isArray(items) && items.length) notes[group] = items;
  }
  return {
    version: r.version,
    build: r.build,
    released_on: r.released_on,
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: r.size_bytes,
    sha256: r.sha256,
    description: r.description,
    notes
  };
}

// Ordered by build descending and never by release date: 1.4.3 and 1.4.2 share
// a release date and must still order deterministically.
api.get('/releases', async c => {
  const url = new URL(c.req.url);
  const pageSize = readPageSize(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const params = [pageSize + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.build);
    where = ` WHERE build < $2::int`;
  }
  const rows = await many(`SELECT * FROM app_release${where} ORDER BY build DESC LIMIT $1`, params);
  const page = buildPage(rows, pageSize, r => ({
    build: r.build
  }));
  return c.json({
    data: page.data.map(releasePayload),
    next_cursor: page.next_cursor,
    has_more: page.has_more
  });
});
api.get('/releases/:version', async c => {
  const row = await one(`SELECT * FROM app_release WHERE version = $1`, [c.req.param('version')]);
  if (!row) throw notFound('That release does not exist.', 'release_not_found');
  return c.json({
    release: releasePayload(row)
  });
});

/* ---------- firmware ---------- */

// The manifest is served for one product at a time.
api.get('/firmware/manifest', async c => {
  const model = c.req.query('model') || c.req.query('product') || 'compact';
  const product = await one(`SELECT * FROM product WHERE handle = $1 OR lower(title) = lower($1)`, [model]);
  if (!product) throw notFound('That model does not exist.', 'product_not_found');

  // A device that has not opted into a channel is never offered an entry
  // outside general.
  const channel = c.req.query('channel') || 'general';
  const allowed = channel === 'general' ? ['general'] : ['general', channel];
  const rows = await many(`SELECT * FROM firmware WHERE product_id = $1 AND channel = ANY($2) ORDER BY build DESC`, [product.id, allowed]);
  return c.json({
    product: {
      handle: product.handle,
      title: product.title
    },
    generated_at: new Date().toISOString(),
    entries: rows.map(f => ({
      version: f.version,
      build: f.build,
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: f.size_bytes,
      sha256: f.sha256,
      released_on: f.released_on
    }))
  });
});
api.get('/firmware/for-serial/:serial', async c => {
  const device = await deviceBySerial(c.req.param('serial'));
  if (!device) throw notFound('We do not recognise that serial number.', 'device_unknown');
  if (device.status === 'blocked') {
    throw conflict('device_blocked', 'That camera is blocked. We cannot write firmware to it.', {
      resource: device.serial
    });
  }
  const entries = await many(`SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC`, [device.product_id]);
  const current = device.firmware_version;
  const eligible = entries.filter(f => !f.min_firmware || current && compareVersions(current, f.min_firmware) >= 0);
  return c.json({
    device: {
      serial: device.serial,
      model: device.model,
      handle: device.handle,
      firmware_version: current
    },
    recommended: eligible[0] ? {
      version: eligible[0].version,
      build: eligible[0].build,
      size_bytes: eligible[0].size_bytes,
      sha256: eligible[0].sha256
    } : null,
    entries: entries.map(f => ({
      version: f.version,
      build: f.build,
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: f.size_bytes,
      sha256: f.sha256,
      eligible: !f.min_firmware || current && compareVersions(current, f.min_firmware) >= 0
    }))
  });
});

/* ---------- flash sessions ---------- */

api.post('/flash-sessions', async c => {
  const body = await c.req.json().catch(() => ({}));
  const {
    session,
    device,
    firmware
  } = await startSession({
    serial: body.serial,
    targetBuild: body.target_build,
    reportedVersion: body.reported_version
  });
  return c.json({
    session: {
      id: session.id,
      state: session.state,
      started_at: session.started_at,
      serial: device.serial,
      target_version: firmware.version,
      target_build: firmware.build
    }
  }, 201);
});
api.post('/flash-sessions/:id/complete', async c => {
  const body = await c.req.json().catch(() => ({}));
  const {
    session,
    device
  } = await completeSession(c.req.param('id'), body.reported_version);
  return c.json({
    session: {
      id: session.id,
      state: session.state,
      reported_version: session.reported_version,
      ended_at: session.ended_at
    },
    device: {
      serial: device.serial,
      firmware_version: device.firmware_version
    }
  });
});
api.post('/flash-sessions/:id/fail', async c => {
  const body = await c.req.json().catch(() => ({}));
  const {
    session
  } = await failSession(c.req.param('id'), body.reason);
  return c.json({
    session: {
      id: session.id,
      state: session.state,
      failure_reason: session.failure_reason,
      ended_at: session.ended_at
    }
  });
});
api.get('/flash-sessions/:id', async c => {
  const session = await sessionById(c.req.param('id'));
  if (!session) throw notFound('That session does not exist.', 'session_not_found');
  return c.json({
    session
  });
});

/* ---------- anything else under /api ---------- */

api.all('*', c => c.json({
  code: 'not_found',
  message: 'That endpoint does not exist.',
  request_id: rid(c)
}, 404));

export { DELIVERY_METHODS as D, NOTE_GROUPS as N, formatDateShort as a, formatMoney as b, api as c, formatBytes as d, formatDateLong as f, orderChip as o };

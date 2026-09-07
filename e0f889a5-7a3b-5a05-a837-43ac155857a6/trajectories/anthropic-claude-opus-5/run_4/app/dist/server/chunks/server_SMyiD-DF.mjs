import pg from 'pg';
import { createHash, randomBytes, scrypt as scrypt$1, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { promisify } from 'node:util';

// Money is integer minor units everywhere. Never let pg hand back a float for
// numeric columns, and keep bigint counters as JS numbers (all well under 2^53).
pg.types.setTypeParser(pg.types.builtins.INT8, v => v === null ? null : Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, v => v);
// DATE columns come back as plain YYYY-MM-DD strings, never Date objects, so a
// server timezone can never shift a release date or a support-until date.
pg.types.setTypeParser(pg.types.builtins.DATE, v => v);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');
const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
pool.on('error', err => {
  console.log(JSON.stringify({
    level: 'error',
    msg: 'pg pool error',
    error: String(err && err.message)
  }));
});
function query(text, params) {
  return pool.query(text, params);
}
async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
async function withTransaction(fn) {
  return withClient(async client => {
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {/* connection already gone */}
      throw err;
    }
  });
}

/** Availability is a state, not a boolean. */
function availabilityFor(product, variant) {
  if (product.status === 'discontinued') {
    return {
      state: 'discontinued',
      label: 'Discontinued',
      purchasable: false
    };
  }
  const available = Number(variant.available || 0);
  if (available <= 0) return {
    state: 'sold_out',
    label: 'Sold out',
    purchasable: false
  };
  if (available <= 10) return {
    state: 'low',
    label: `Only ${available} left`,
    purchasable: true,
    remaining: available
  };
  return {
    state: 'available',
    label: 'In stock',
    purchasable: true,
    remaining: available
  };
}

/** The state a product card shows, from the states of its variants. */
function productAvailability(product) {
  if (product.status === 'discontinued') return {
    state: 'discontinued',
    label: 'Discontinued'
  };
  const totals = product.variants.reduce((n, v) => n + Number(v.available || 0), 0);
  if (totals <= 0) return {
    state: 'sold_out',
    label: 'Sold out'
  };
  const anyLow = product.variants.some(v => Number(v.available) > 0 && Number(v.available) <= 10);
  if (anyLow && totals <= 10) return {
    state: 'low',
    label: `Only ${totals} left`
  };
  return {
    state: 'available',
    label: 'In stock'
  };
}
const PRODUCT_COLUMNS = `
  p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position`;
async function listProducts({
  includeProtection = false,
  afterPosition = null,
  limit = null
} = {}) {
  const params = [];
  const where = [];
  if (!includeProtection) where.push(`p.kind <> 'protection'`);
  if (afterPosition !== null) {
    params.push(afterPosition.position, afterPosition.id);
    where.push(`(p.position, p.id) > ($${params.length - 1}, $${params.length})`);
  }
  let sql = `SELECT ${PRODUCT_COLUMNS} FROM product p
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.position ASC, p.id ASC`;
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  const {
    rows
  } = await query(sql, params);
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const {
    rows: variants
  } = await query(`SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency,
            v.position, v.inventory_policy,
            COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position ASC, v.id ASC`, [ids]);
  const byProduct = new Map(ids.map(id => [String(id), []]));
  for (const v of variants) byProduct.get(String(v.product_id))?.push(v);
  return rows.map(p => {
    const product = {
      ...p,
      variants: byProduct.get(String(p.id)) || []
    };
    product.availability = productAvailability(product);
    return product;
  });
}
async function getProductByHandle(handle) {
  const {
    rows
  } = await query(`SELECT ${PRODUCT_COLUMNS} FROM product p WHERE p.handle = $1`, [handle]);
  if (!rows.length) return null;
  const product = rows[0];
  const {
    rows: variants
  } = await query(`SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, COALESCE(i.available,0) AS available, COALESCE(i.committed,0) AS committed
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = $1 ORDER BY v.position ASC, v.id ASC`, [product.id]);
  const {
    rows: blocks
  } = await query(`SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position ASC, id ASC`, [product.id]);
  product.variants = variants;
  product.blocks = blocks;
  product.availability = productAvailability(product);
  for (const v of product.variants) v.availability = availabilityFor(product, v);
  return product;
}
async function shippingMethods() {
  const {
    rows
  } = await query(`SELECT m.code, m.title, m.price_minor, m.window_text
       FROM shipping_method m JOIN shipping_zone z ON z.id = m.zone_id
      WHERE z.code = 'us-domestic' ORDER BY m.position ASC`);
  return rows;
}

function newOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

// Bearer tokens and order access tokens are stored only as digests, so a copy of
// the database is not a set of live credentials.
function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}
const TOKEN_TTL_HOURS = Number(process.env.AUTH_TOKEN_TTL_HOURS || 72);

// Money is an integer count of minor units everywhere inside this app. These
// helpers are the only place a minor-unit integer becomes a string, and they
// never go through a float.

const TAX_NUMERATOR = 1;
const TAX_DENOMINATOR = 10;

/** Format 41580 as "$415.80". Integer arithmetic only. */
function formatMinor(minor, currency = 'usd') {
  const n = Number(minor);
  if (!Number.isInteger(n)) throw new TypeError(`formatMinor expects an integer, received ${minor}`);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = currency.toLowerCase() === 'usd' ? '$' : '';
  return `${negative ? '-' : ''}${symbol}${grouped}.${String(cents).padStart(2, '0')}`;
}

/** Ten percent of the line subtotal, on integers, truncated toward zero. */
function taxOn(subtotalMinor) {
  return Math.trunc(subtotalMinor * TAX_NUMERATOR / TAX_DENOMINATOR);
}

/** killbill takes a decimal; this is the one boundary where that is correct. */
function minorToDecimalString(minor) {
  const n = Number(minor);
  const negative = n < 0;
  const abs = Math.abs(n);
  return `${negative ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** The shipment-protection rung is derived from the cart subtotal, never stored. */
function protectionRungFor(subtotalMinor) {
  if (subtotalMinor >= 100000) return {
    sku: 'VELA-PROTECT-4',
    price_minor: 1198
  };
  if (subtotalMinor >= 50000) return {
    sku: 'VELA-PROTECT-3',
    price_minor: 598
  };
  if (subtotalMinor >= 10000) return {
    sku: 'VELA-PROTECT-2',
    price_minor: 298
  };
  if (subtotalMinor >= 1) return {
    sku: 'VELA-PROTECT-1',
    price_minor: 98
  };
  return null;
}

/**
 * Every rejection carries a stable machine-readable code, a human message and
 * the request id, and is a client error rather than a 5xx.
 */
class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const badRequest = (code, message, extra) => new AppError(400, code, message, extra);
const unauthorized = (message = 'Sign in to continue.', code = 'unauthorized') => new AppError(401, code, message);
// Another customer's order or serial reads as not found, never forbidden.
const notFound = (message = 'That page does not exist.', code = 'not_found') => new AppError(404, code, message);
const conflict = (code, message, extra) => new AppError(409, code, message, extra);
const unprocessable = (code, message, extra) => new AppError(422, code, message, extra);

const errors = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  AppError,
  badRequest,
  conflict,
  notFound,
  unauthorized,
  unprocessable
}, Symbol.toStringTag, { value: 'Module' }));

async function findCartByToken(token) {
  if (!token) return null;
  const {
    rows
  } = await query(`SELECT * FROM cart WHERE token = $1 AND expires_at > now()`, [token]);
  return rows[0] || null;
}
async function loadLines(cartId) {
  const {
    rows
  } = await query(`SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor, cl.created_at,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.currency,
            p.handle, p.title, p.kind, p.status AS product_status,
            COALESCE(i.available,0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.id ASC`, [cartId]);
  return rows;
}

/**
 * Every cart read compares the snapshotted unit price to the current price and
 * renders a notice naming the item, the old price and the new.
 */
function noticesFor(lines) {
  const notices = [];
  for (const l of lines) {
    if (Number(l.unit_price_minor) !== Number(l.current_price_minor)) {
      notices.push({
        kind: 'price_changed',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        was_minor: Number(l.unit_price_minor),
        now_minor: Number(l.current_price_minor),
        message: `The price of ${l.title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(l.current_price_minor)} since you added it.`
      });
    }
    const availability = availabilityFor({
      status: l.product_status
    }, l);
    if (!availability.purchasable) {
      notices.push({
        kind: 'unavailable',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        message: `${l.title} is no longer available.`
      });
    } else if (Number(l.available) < Number(l.quantity)) {
      notices.push({
        kind: 'quantity_unavailable',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        message: `Only ${l.available} of ${l.title} remain. Lower the quantity to continue.`
      });
    }
  }
  return notices;
}

/** Everything the cart is, derived from its lines. Nothing here is stored. */
async function readCart(cart) {
  const lines = await loadLines(cart.id);
  const notices = noticesFor(lines);
  const items = lines.map(l => ({
    id: l.id,
    variant_id: l.variant_id,
    sku: l.sku,
    handle: l.handle,
    title: l.title,
    option_value: l.option_value,
    kind: l.kind,
    quantity: Number(l.quantity),
    unit_price_minor: Number(l.unit_price_minor),
    current_price_minor: Number(l.current_price_minor),
    line_total_minor: Number(l.unit_price_minor) * Number(l.quantity),
    available: Number(l.available),
    product_status: l.product_status
  }));
  const subtotal_minor = items.reduce((n, l) => n + l.line_total_minor, 0);
  const rung = protectionRungFor(subtotal_minor);
  const protection_minor = cart.protection_enabled && rung ? rung.price_minor : 0;
  const method = cart.shipping_method ? (await query(`SELECT m.code, m.title, m.price_minor, m.window_text FROM shipping_method m
           JOIN shipping_zone z ON z.id = m.zone_id
          WHERE z.code = 'us-domestic' AND m.code = $1`, [cart.shipping_method])).rows[0] : null;
  const shipping_minor = method ? Number(method.price_minor) : 0;

  // Shipment protection is excluded from tax.
  const tax_minor = taxOn(subtotal_minor);
  const total_minor = subtotal_minor + protection_minor + shipping_minor + tax_minor;
  return {
    token: cart.token,
    id: cart.id,
    email: cart.email,
    customer_id: cart.customer_id,
    lines: items,
    notices,
    currency: 'usd',
    protection_enabled: cart.protection_enabled,
    protection_rung: rung ? {
      ...rung,
      enabled: cart.protection_enabled
    } : null,
    protection_minor,
    shipping_method: cart.shipping_method,
    shipping_method_title: method ? method.title : null,
    shipping_address: cart.shipping_address,
    marketing_consent: cart.marketing_consent,
    subtotal_minor,
    shipping_minor,
    tax_minor,
    total_minor,
    item_count: items.reduce((n, l) => n + l.quantity, 0),
    priced: Boolean(cart.shipping_method && cart.shipping_address)
  };
}
const REQUIRED_ADDRESS_FIELDS = [['name', 'Name'], ['line1', 'Address'], ['city', 'City'], ['region', 'Region'], ['postal_code', 'Postal code'], ['country', 'Country']];
async function setDelivery(cart, {
  email,
  shipping_address,
  shipping_method,
  marketing_consent
}) {
  const patch = {};
  if (email !== undefined) {
    const value = String(email || '').trim();
    if (!value) throw badRequest('email_required', 'Email is required.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
    patch.email = value;
  }
  if (shipping_address !== undefined) {
    const a = shipping_address || {};
    for (const [field, label] of REQUIRED_ADDRESS_FIELDS) {
      if (!String(a[field] || '').trim()) throw badRequest('address_incomplete', `${label} is required.`, {
        field
      });
    }
    if (String(a.country).toUpperCase() !== 'US') {
      throw badRequest('country_unsupported', 'We only deliver inside the United States.');
    }
    patch.shipping_address = {
      name: String(a.name).trim(),
      line1: String(a.line1).trim(),
      line2: String(a.line2 || '').trim(),
      city: String(a.city).trim(),
      region: String(a.region).trim(),
      postal_code: String(a.postal_code).trim(),
      country: 'US',
      phone: String(a.phone || '').trim()
    };
  }
  if (shipping_method !== undefined) {
    const code = String(shipping_method || '').trim();
    const {
      rows
    } = await query(`SELECT m.code FROM shipping_method m JOIN shipping_zone z ON z.id = m.zone_id
        WHERE z.code = 'us-domestic' AND m.code = $1`, [code]);
    if (!rows.length) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');
    patch.shipping_method = code;
  }
  if (marketing_consent !== undefined) patch.marketing_consent = Boolean(marketing_consent);
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(patch)) {
    params.push(k === 'shipping_address' ? JSON.stringify(v) : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (sets.length) {
    params.push(cart.id);
    await query(`UPDATE cart SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  }
  const fresh = await findCartByToken(cart.token);
  return readCart(fresh);
}

/** One line of JSON per event on stdout. */
function log(fields) {
  process.stdout.write(`${JSON.stringify({
    ts: new Date().toISOString(),
    ...fields
  })}\n`);
}

function transport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 1025);
  if (!host) throw new Error('SMTP_HOST is not set');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    // Mailpit accepts plain SMTP; authenticate only where credentials are set.
    ...(user ? {
      auth: {
        user,
        pass
      }
    } : {}),
    tls: {
      rejectUnauthorized: false
    }
  });
}
const MAIL_FROM = process.env.MAIL_FROM || 'Vela <orders@vela.example.com>';

/**
 * Exactly one mail, to the order's email only, with no cc and no bcc.
 * Subject is "Order confirmed: " then the order number.
 */
async function sendOrderConfirmation({
  order,
  lines,
  requestId
}) {
  const subject = `Order confirmed: ${order.number}`;
  const lineText = lines.map(l => `  ${l.title_snapshot}${l.option_snapshot ? ` (${l.option_snapshot})` : ''} × ${l.quantity}   ${formatMinor(l.total_minor)}`).join('\n');
  const text = [`Your order ${order.number} is confirmed.`, '', 'What you bought:', lineText, '', `Subtotal: ${formatMinor(order.subtotal_minor)}`, `Delivery: ${formatMinor(order.shipping_minor)}`, `Tax: ${formatMinor(order.tax_minor)}`, `Total: ${formatMinor(order.total_minor)}`, '', 'We will send another note when it ships.', 'The Vela team.'].join('\n');
  const rows = lines.map(l => `<tr><td>${escapeHtml(l.title_snapshot)}${l.option_snapshot ? ` (${escapeHtml(l.option_snapshot)})` : ''}</td>` + `<td align="right">${l.quantity}</td>` + `<td align="right">${formatMinor(l.total_minor)}</td></tr>`).join('');
  const html = `<!doctype html><html><body>
<p>Your order <strong>${escapeHtml(order.number)}</strong> is confirmed.</p>
<table cellpadding="6" cellspacing="0" border="0">
<thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Total</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot>
<tr><td colspan="2" align="right">Subtotal</td><td align="right">${formatMinor(order.subtotal_minor)}</td></tr>
<tr><td colspan="2" align="right">Delivery</td><td align="right">${formatMinor(order.shipping_minor)}</td></tr>
<tr><td colspan="2" align="right">Tax</td><td align="right">${formatMinor(order.tax_minor)}</td></tr>
<tr><td colspan="2" align="right"><strong>Total</strong></td><td align="right"><strong>${formatMinor(order.total_minor)}</strong></td></tr>
</tfoot></table>
<p>We will send another note when it ships.<br>The Vela team.</p>
</body></html>`;
  const info = await transport().sendMail({
    from: MAIL_FROM,
    to: order.email,
    subject,
    text,
    html
  });
  log({
    level: 'info',
    msg: 'mail.sent',
    request_id: requestId,
    to: order.email,
    subject,
    message_id: info.messageId
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

const scrypt = promisify(scrypt$1);

// scrypt is a modern memory-hard password hash and ships with Node itself, so
// the image needs no native build step.
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 32;
async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEYLEN, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(plain, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, rr, pp, saltB64, keyB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(plain, salt, expected.length, {
      N: Number(n),
      r: Number(rr),
      p: Number(pp),
      maxmem: 64 * 1024 * 1024
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function publicCustomer(row) {
  return {
    id: String(row.id),
    email: row.email,
    name: row.name
  };
}
async function issueToken(customerId) {
  const token = newOpaqueToken(32);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
  await query(`INSERT INTO auth_token (customer_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [customerId, hashToken(token), expiresAt]);
  return {
    token,
    expiresAt
  };
}
async function signup({
  email,
  password,
  name
}) {
  const address = String(email || '').trim();
  if (!EMAIL_RE.test(address)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
  if (String(password || '').length < 8) {
    throw badRequest('password_too_short', 'A password needs at least eight characters.');
  }
  const person = String(name || '').trim();
  if (!person) throw badRequest('name_required', 'Name is required.');
  const passwordHash = await hashPassword(String(password));
  let rows;
  try {
    ({
      rows
    } = await query(`INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active') RETURNING *`, [address, person, passwordHash]));
  } catch (err) {
    // Signup refuses a registered address; uniqueness is the store's rule.
    if (err && err.code === '23505') {
      throw conflict('email_taken', 'That address already has an account. Sign in instead.');
    }
    throw err;
  }
  const {
    token,
    expiresAt
  } = await issueToken(rows[0].id);
  return {
    access_token: token,
    expires_at: expiresAt.toISOString(),
    customer: publicCustomer(rows[0])
  };
}
async function login({
  email,
  password
}) {
  const address = String(email || '').trim();
  const {
    rows
  } = await query(`SELECT * FROM customer WHERE lower(email) = lower($1)`, [address]);
  const row = rows[0];
  // The same refusal either way, so this never reports who has an account.
  const ok = row ? await verifyPassword(String(password || ''), row.password_hash) : false;
  if (!row || !ok || row.status !== 'active') {
    throw unauthorized('That email and password do not match an account.', 'invalid_credentials');
  }
  const {
    token,
    expiresAt
  } = await issueToken(row.id);
  return {
    access_token: token,
    expires_at: expiresAt.toISOString(),
    customer: publicCustomer(row)
  };
}

/** An expired or absent token is rejected and mutates nothing. */
async function customerForToken(token) {
  if (!token) return null;
  const {
    rows
  } = await query(`SELECT c.* FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now() AND c.status = 'active'`, [hashToken(token)]);
  return rows[0] || null;
}
async function signOut(token) {
  if (!token) return;
  await query(`DELETE FROM auth_token WHERE token_hash = $1`, [hashToken(token)]);
}

// Astro pages render on the server against the same service layer the API uses,
// so first paint is complete markup rather than a shell waiting on fetch.
const CART_COOKIE = 'vela_cart';
const SESSION_COOKIE = 'vela_session';

/** The signed-in customer for this request, or null. */
async function currentCustomer(Astro) {
  const token = Astro.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await customerForToken(token);
  if (!row) return null;
  return {
    id: String(row.id),
    email: row.email,
    name: row.name
  };
}

/** The cart for this request as a view, without creating one to read it. */
async function currentCart(Astro) {
  const token = Astro.cookies.get(CART_COOKIE)?.value;
  if (!token) return null;
  const cart = await findCartByToken(token);
  if (!cart) return null;
  return readCart(cart);
}

/**
 * A signed-out request for an /account route lands on /sign-in carrying the
 * intended path and returns there after signing in.
 */
function signInRedirect(Astro) {
  const next = Astro.url.pathname + (Astro.url.search || '');
  return Astro.redirect(`/sign-in?next=${encodeURIComponent(next)}`);
}

export { errors as A, CART_COOKIE as C, SESSION_COOKIE as S, conflict as a, badRequest as b, currentCustomer as c, currentCart as d, setDelivery as e, findCartByToken as f, shippingMethods as g, getProductByHandle as h, hashToken as i, formatMinor as j, newOpaqueToken as k, log as l, minorToDecimalString as m, notFound as n, sendOrderConfirmation as o, protectionRungFor as p, query as q, readCart as r, signInRedirect as s, taxOn as t, unprocessable as u, listProducts as v, withTransaction as w, login as x, signOut as y, signup as z };

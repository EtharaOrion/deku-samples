import { Hono } from 'hono';
import { boot, tryGet } from './state.mjs';
import { inTx } from './db.mjs';
import {
  env, newId, newRequestId, signToken, verifyToken, hashToken, sha256, orderAccessToken,
  validSerial, normalizeSerial, encodeCursor, decodeCursor, pageSize, cmpVersion, minorToDollars,
} from './env.mjs';
import * as kb from './killbill.mjs';
import { sendOrderConfirmation } from './mail.mjs';
import {
  CURRENCY, SHIPPING_METHODS, methodByCode, protectionRungFor, computeTotals, priceNotices, usd,
  variantAvailability, firmwareUpdateAvailable,
} from './domain.mjs';

const COOKIE_CART = 'vela_cart';
const COOKIE_TOKEN = 'vela_token';

// ---------------------------------------------------------------- helpers

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status; this.code = code; this.extra = extra;
  }
}
const bad = (code, message, extra = {}) => new ApiError(400, code, message, extra);
const denied = (code, message, extra = {}) => new ApiError(401, code, message, extra);
const gone = (code, message, extra = {}) => new ApiError(404, code, message, extra);
const conflict = (code, message, extra = {}) => new ApiError(409, code, message, extra);

function logLine(o) { process.stdout.write(JSON.stringify(o) + '\n'); }

function respond(c, status, body, headers) {
  if (status >= 400 && body && typeof body === 'object') {
    body = { ...body, request_id: c.get('requestId') };
  }
  return c.json(body, status, headers);
}

function errBody(c, e) {
  const requestId = c.get('requestId');
  const status = e.status || 500;
  const code = e.code || (status >= 500 ? 'internal_error' : 'error');
  const message = status >= 500
    ? `Something went wrong at our end. Reference ${requestId}.`
    : e.message || 'That did not work.';
  return { error: { code, message, request_id: requestId } };
}

// ---------------------------------------------------------------- session

async function customerFromToken(c) {
  const auth = c.req.header('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1];
  const cookieTok = getCookie(c, COOKIE_TOKEN);
  const token = bearer || cookieTok;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return { expired: true, token };
  const db = tryGet().db;
  const r = await db.query(`SELECT id, email, name, status, created_at FROM customer WHERE id = $1`, [payload.sub]);
  if (!r.rows.length || r.rows[0].status !== 'active') return { expired: true };
  return { customer: r.rows[0] };
}

function getCookie(c, name) {
  const h = c.req.header('cookie') || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setCookie(c, name, value, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', 'HttpOnly'];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  const prev = c.res.headers.get('set-cookie');
  const val = parts.join('; ');
  c.res.headers.append('set-cookie', val);
  if (prev) c.res.headers.append('set-cookie', prev);
  void prev;
}

// ---------------------------------------------------------------- cart

const CART_SELECT = `
  SELECT c.id, c.token, c.customer_id, c.email, c.shipping_method, c.shipping_address,
         c.marketing_consent, c.protection_enabled, c.expires_at
  FROM cart c WHERE c.token = $1`;

async function loadCart(db, token, { forUpdate = false } = {}) {
  if (!token) return null;
  const r = await db.query(CART_SELECT + (forUpdate ? ' FOR UPDATE' : ''), [token]);
  return r.rows[0] || null;
}

async function ensureCart(db, c, customerId) {
  const token = getCookie(c, COOKIE_CART);
  if (token) {
    const cart = await loadCart(db, token);
    if (cart) {
      if (customerId && !cart.customer_id) {
        await db.query(`UPDATE cart SET customer_id=$1, updated_at=now() WHERE id=$2`, [customerId, cart.id]);
        cart.customer_id = customerId;
      }
      return cart;
    }
  }
  const fresh = newId(18);
  const r = await db.query(
    `INSERT INTO cart (token, customer_id) VALUES ($1,$2) RETURNING id, token, customer_id, email, shipping_method, shipping_address, marketing_consent, protection_enabled`,
    [fresh, customerId]
  );
  setCookie(c, COOKIE_CART, fresh, 60 * 60 * 24 * 30);
  return r.rows[0];
}

async function cartLines(db, cartId) {
  const r = await db.query(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor::int AS unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor::int AS current_price_minor,
            v.inventory_policy, p.title AS product_title, p.handle, p.status AS product_status, p.kind AS product_kind,
            il.available, il.committed
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE cl.cart_id = $1 ORDER BY cl.id`,
    [cartId]
  );
  return r.rows;
}

async function cartPayload(db, cart, { shippingMinor } = {}) {
  const lines = await cartLines(db, cart.id);
  const method = methodByCode(cart.shipping_method);
  const sm = shippingMinor !== undefined ? shippingMinor : method ? method.minor : 0;
  const totals = computeTotals({
    lines,
    shippingMinor: sm,
    protectionEnabled: cart.protection_enabled,
  });
  return {
    id: cart.id,
    token: cart.token,
    email: cart.email || null,
    shipping_method: cart.shipping_method || null,
    shipping_address: cart.shipping_address || null,
    marketing_consent: cart.marketing_consent,
    protection_enabled: cart.protection_enabled,
    lines: lines.map((l) => ({
      id: l.id, variant_id: l.variant_id, sku: l.sku, title: l.product_title,
      variant_title: l.variant_title, option_value: l.option_value,
      quantity: l.quantity,
      // pg returns bigint as text; money is an integer of minor units in every layer
      unit_price_minor: Number(l.unit_price_minor),
      current_price_minor: Number(l.current_price_minor),
      line_total_minor: Number(l.unit_price_minor) * l.quantity,
      available: l.available ?? 0, product_status: l.product_status,
    })),
    notices: priceNotices(lines),
    ...totals,
    protection_rung: protectionRungFor(totals.subtotal_minor),
    expiry_at: cart.expires_at,
  };
}

// ---------------------------------------------------------------- orders

function nextOrderNumber(seq) {
  const year = new Date().getUTCFullYear();
  return `VE-${year}-${String(seq).padStart(4, '0')}`;
}

async function allocateSerials(t, orderId, lines) {
  const out = [];
  for (const l of lines) {
    if (l.product_kind !== 'camera') { out.push({ line_id: l.id, serials: [] }); continue; }
    const r = await t.query(
      `SELECT d.id, d.serial FROM device d
       WHERE d.variant_id = $1 AND d.order_id IS NULL
         AND d.status IN ('sold','manufactured')
         AND NOT EXISTS (SELECT 1 FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL)
       ORDER BY d.id LIMIT $2 FOR UPDATE`,
      [l.variant_id, l.quantity]
    );
    const serials = r.rows.map((x) => x.serial);
    if (l.id) await t.query(`UPDATE order_line SET serials = $1 WHERE id = $2`, [serials, l.id]);
    if (r.rows.length) {
      await t.query(`UPDATE device SET order_id = $1, status = 'sold' WHERE id = ANY($2::bigint[])`, [orderId, r.rows.map((x) => x.id)]);
    }
    out.push({ line_id: l.id, serials });
  }
  return out;
}

/** Cart lines carrying the order_line ids their snapshot produced, so serials
 *  are written onto the rows just created. */
function orderLinesWithKind(lines, lineIds) {
  return lines.map((l, i) => ({ ...l, id: lineIds[i] ?? null }));
}

// ---------------------------------------------------------------- api app

export function buildApi() {
  const api = new Hono().basePath('/api');

  // Structured logging happens once per request, at the edge of the process
  // (server/middleware.mjs). This middleware only assigns the request id so the
  // same value can appear in error bodies.
  api.use('*', async (c, next) => {
    c.set('requestId', c.req.header('x-request-id') || newRequestId());
    await next();
  });

  api.onError((e, c) => {
    const status = e.status || 500;
    if (status >= 500) {
      logLine({ ts: new Date().toISOString(), request_id: c.get('requestId'), level: 'error', message: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join(' | ') });
    }
    return respond(c, status, errBody(c, e));
  });

  api.notFound((c) => respond(c, 404, { error: { code: 'not_found', message: 'That page does not exist.', request_id: c.get('requestId') } }));

  // ---- health
  api.get('/health', async (c) => {
    if (!tryGet()) return respond(c, 503, { error: { code: 'starting', message: 'Starting.', request_id: c.get('requestId') } });
    try {
      const { db } = tryGet();
      await db.query('SELECT 1');
      return respond(c, 200, { ok: true, status: 'ok', time: new Date().toISOString() });
    } catch (e) {
      return respond(c, 503, { error: { code: 'unavailable', message: 'Not ready.', request_id: c.get('requestId') } });
    }
  });

  // ---- auth
  api.post('/auth/signup', async (c) => {
    const { db } = tryGet();
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('invalid_email', 'Enter an email address we can write to.');
    if (!name) throw bad('name_required', 'Name is required.');
    if (password.length < 8) throw bad('weak_password', 'Use a password of eight characters or more.');
    const exists = await db.query(`SELECT 1 FROM customer WHERE email = $1`, [email]);
    if (exists.rows.length) throw conflict('email_taken', 'That address is already registered. Sign in instead.');
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      `INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id, email, name, status, created_at`,
      [email, name, hash]
    );
    const customer = r.rows[0];
    const token = signToken({ sub: customer.id, email: customer.email });
    setCookie(c, COOKIE_TOKEN, token, 60 * 60 * 12);
    return respond(c, 201, { access_token: token, customer });
  });

  api.post('/auth/login', async (c) => {
    const { db } = tryGet();
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) throw bad('missing_fields', 'Email and password are required.');
    const r = await db.query(`SELECT id, email, name, password_hash, status, created_at FROM customer WHERE email = $1`, [email]);
    if (!r.rows.length) throw denied('bad_credentials', 'That did not work. Check the address and the password.');
    const row = r.rows[0];
    const bcrypt = (await import('bcryptjs')).default;
    const okPw = await bcrypt.compare(password, row.password_hash);
    if (!okPw) throw denied('bad_credentials', 'That did not work. Check the address and the password.');
    if (row.status !== 'active') throw denied('inactive', 'That account is not active.');
    const token = signToken({ sub: row.id, email: row.email });
    setCookie(c, COOKIE_TOKEN, token, 60 * 60 * 12);
    return respond(c, 200, { access_token: token, customer: { id: row.id, email: row.email, name: row.name, status: row.status, created_at: row.created_at } });
  });

  api.post('/auth/logout', async (c) => {
    setCookie(c, COOKIE_TOKEN, '', 0);
    return respond(c, 200, { ok: true });
  });

  api.get('/auth/me', async (c) => {
    const s = await customerFromToken(c);
    if (!s || s.expired || !s.customer) throw denied('unauthenticated', 'Sign in to continue.');
    return respond(c, 200, { customer: s.customer });
  });

  // ---- products
  api.get('/products', async (c) => {
    const { db } = tryGet();
    const q = c.req.query();
    const ps = pageSize(new URLSearchParams(q));
    if (ps.error) throw bad('page_size_too_large', ps.error);
    return respond(c, 200, await productsPage(db, { size: ps.size, cursor: decodeCursor(q.cursor), kind: q.kind }));
  });

  api.get('/products/:handle', async (c) => {
    const { db } = tryGet();
    const handle = c.req.param('handle');
    const p = await productByHandle(db, handle);
    if (!p) throw gone('not_found', 'That page does not exist.');
    return respond(c, 200, p);
  });

  // ---- cart
  api.get('/cart', async (c) => {
    const { db } = tryGet();
    const s = await customerFromToken(c);
    const customerId = s?.customer?.id || null;
    const cart = await ensureCart(db, c, customerId);
    return respond(c, 200, await cartPayload(db, cart));
  });

  api.post('/cart/lines', async (c) => {
    const { db } = tryGet();
    const body = await c.req.json().catch(() => ({}));
    const sku = String(body.sku || '').trim();
    const qty = Number(body.quantity ?? 1);
    if (!sku) throw bad('sku_required', 'Choose an option first.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw bad('quantity_range', 'Quantity must be between 1 and 10.');
    const s = await customerFromToken(c);
    const customerId = s?.customer?.id || null;
    const cart = await ensureCart(db, c, customerId);
    const v = (await db.query(
      `SELECT v.*, p.status AS product_status, p.kind AS product_kind, il.available, il.committed
       FROM variant v JOIN product p ON p.id=v.product_id LEFT JOIN inventory_level il ON il.variant_id=v.id
       WHERE v.sku = $1`, [sku]
    )).rows[0];
    if (!v || v.product_kind === 'protection') throw gone('unknown_sku', 'That option does not exist.');
    if (v.product_status === 'discontinued') throw conflict('discontinued', 'We no longer sell this.');
    if (v.inventory_policy === 'deny' && (v.available ?? 0) <= 0) throw conflict('sold_out', 'That one is sold out.');
    const existing = (await db.query(`SELECT * FROM cart_line WHERE cart_id=$1 AND variant_id=$2`, [cart.id, v.id])).rows[0];
    const newQty = Math.min(10, (existing?.quantity || 0) + qty);
    if (v.inventory_policy === 'deny' && newQty > (v.available ?? 0)) {
      throw conflict('insufficient_stock', `Only ${v.available ?? 0} left.`);
    }
    if (existing) {
      await db.query(`UPDATE cart_line SET quantity=$1 WHERE id=$2`, [newQty, existing.id]);
    } else {
      await db.query(
        `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)`,
        [cart.id, v.id, newQty, v.price_minor]
      );
    }
    await db.query(`UPDATE cart SET updated_at=now() WHERE id=$1`, [cart.id]);
    const fresh = await loadCart(db, cart.token);
    return respond(c, 200, await cartPayload(db, fresh));
  });

  api.patch('/cart/lines/:lineId', async (c) => {
    const { db } = tryGet();
    const lineId = Number(c.req.param('lineId'));
    const body = await c.req.json().catch(() => ({}));
    const qty = Number(body.quantity);
    const s = await customerFromToken(c);
    const cart = await ensureCart(db, c, s?.customer?.id || null);
    if (!Number.isInteger(qty) || qty < 0 || qty > 10) throw bad('quantity_range', 'Quantity must be between 1 and 10.');
    const line = (await db.query(`SELECT * FROM cart_line WHERE id=$1 AND cart_id=$2`, [lineId, cart.id])).rows[0];
    if (!line) throw gone('not_found', 'That line is not in this cart.');
    if (qty === 0) {
      await db.query(`DELETE FROM cart_line WHERE id=$1`, [line.id]);
    } else {
      const v = (await db.query(
        `SELECT v.inventory_policy, il.available FROM variant v LEFT JOIN inventory_level il ON il.variant_id=v.id WHERE v.id=$1`,
        [line.variant_id]
      )).rows[0];
      if (v?.inventory_policy === 'deny' && qty > (v.available ?? 0)) {
        throw conflict('insufficient_stock', `Only ${v.available ?? 0} left.`);
      }
      await db.query(`UPDATE cart_line SET quantity=$1 WHERE id=$2`, [qty, line.id]);
    }
    await db.query(`UPDATE cart SET updated_at=now() WHERE id=$1`, [cart.id]);
    const fresh = await loadCart(db, cart.token);
    return respond(c, 200, await cartPayload(db, fresh));
  });

  api.delete('/cart/lines/:lineId', async (c) => {
    const { db } = tryGet();
    const lineId = Number(c.req.param('lineId'));
    const s = await customerFromToken(c);
    const cart = await ensureCart(db, c, s?.customer?.id || null);
    const line = (await db.query(`SELECT id FROM cart_line WHERE id=$1 AND cart_id=$2`, [lineId, cart.id])).rows[0];
    if (!line) throw gone('not_found', 'That line is not in this cart.');
    await db.query(`DELETE FROM cart_line WHERE id=$1`, [line.id]);
    await db.query(`UPDATE cart SET updated_at=now() WHERE id=$1`, [cart.id]);
    const fresh = await loadCart(db, cart.token);
    return respond(c, 200, await cartPayload(db, fresh));
  });

  api.post('/cart/protection', async (c) => {
    const { db } = tryGet();
    const body = await c.req.json().catch(() => ({}));
    const s = await customerFromToken(c);
    const cart = await ensureCart(db, c, s?.customer?.id || null);
    const enabled = Boolean(body.enabled);
    await db.query(`UPDATE cart SET protection_enabled=$1, updated_at=now() WHERE id=$2`, [enabled, cart.id]);
    const fresh = await loadCart(db, cart.token);
    return respond(c, 200, await cartPayload(db, fresh));
  });

  api.post('/cart/delivery', async (c) => {
    const { db } = tryGet();
    const body = await c.req.json().catch(() => ({}));
    const s = await customerFromToken(c);
    const cart = await ensureCart(db, c, s?.customer?.id || null);
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('invalid_email', 'Enter an email address we can write to.');
    const addr = body.shipping_address || null;
    const method = body.shipping_method ? methodByCode(body.shipping_method) : null;
    if (body.shipping_method && !method) throw bad('unknown_method', 'Choose a delivery method.');
    // Only the fields a step actually sends are updated, so one step never wipes another.
    const nextEmail = body.email !== undefined ? email : cart.email || null;
    const nextAddr = addr !== null ? addr : cart.shipping_address || null;
    const nextConsent = body.marketing_consent !== undefined ? Boolean(body.marketing_consent) : cart.marketing_consent;
    if (nextAddr) {
      const need = ['name', 'line1', 'city', 'postal_code', 'country'];
      for (const k of need) {
        if (!String(nextAddr[k] || '').trim()) throw bad(`address_${k}_required`, `${k.replace(/_/g, ' ')} is required.`);
      }
    }
    await db.query(
      `UPDATE cart SET email=$1, shipping_method=$2, shipping_address=$3, marketing_consent=$4, updated_at=now() WHERE id=$5`,
      [nextEmail, method ? method.code : cart.shipping_method, nextAddr ? JSON.stringify(nextAddr) : null, nextConsent, cart.id]
    );
    const fresh = await loadCart(db, cart.token);
    const payload = await cartPayload(db, fresh);
    return respond(c, 200, payload);
  });

  // ---- orders
  api.post('/orders', async (c) => {
    const { db } = tryGet();
    const idemKey = c.req.header('idempotency-key') || null;
    const s = await customerFromToken(c);
    const cartTok = getCookie(c, COOKIE_CART);
    const cart = await loadCart(db, cartTok);
    if (!cart) throw bad('empty_cart', 'Your cart is empty.');
    const lines = await cartLines(db, cart.id);
    if (!lines.length) throw bad('empty_cart', 'Your cart is empty.');

    if (idemKey) {
      const prior = (await db.query(`SELECT * FROM orders WHERE idempotency_key=$1`, [idemKey])).rows[0];
      if (prior) {
        const tok = orderAccessToken(prior.id, prior.number);
        return respond(c, 200, await orderFull(db, prior, { accessToken: tok }));
      }
    }

    const email = String(cart.email || s?.customer?.email || '').trim().toLowerCase();
    if (!email) throw bad('email_required', 'We need an email address to send the order to.');
    const method = methodByCode(cart.shipping_method);
    if (!method) throw bad('method_required', 'Choose a delivery method.');
    const address = cart.shipping_address || {};
    for (const k of ['name', 'line1', 'city', 'postal_code', 'country']) {
      if (!String(address[k] || '').trim()) throw bad(`address_${k}_required`, `${k.replace(/_/g, ' ')} is required.`);
    }

    // re-price every line; refuse if changed since last shown
    const notices = priceNotices(lines);
    if (notices.length) {
      throw conflict('price_changed', notices[0].message, { notices });
    }
    for (const l of lines) {
      if (l.product_status === 'discontinued') throw conflict('discontinued', `${l.product_title} is no longer sold.`);
      if (l.inventory_policy === 'deny' && l.quantity > (l.available ?? 0)) {
        throw conflict('insufficient_stock', `Only ${l.available ?? 0} of ${l.product_title} left.`);
      }
    }

    const totals = computeTotals({ lines, shippingMinor: method.minor, protectionEnabled: cart.protection_enabled });

    const result = await inTx(db, async (t) => {
      // commit stock for every line in one step
      for (const l of lines) {
        const r = await t.query(
          `UPDATE inventory_level SET available = available - $1, committed = committed + $1
           WHERE variant_id = $2 AND available >= $1 RETURNING available, committed`,
          [l.quantity, l.variant_id]
        );
        if (!r.rows.length) {
          throw conflict('insufficient_stock', `Only 0 of ${l.product_title} left.`);
        }
      }
      await t.query(`SELECT pg_advisory_xact_lock(918273645)`);
      const seq = await t.query(
        `SELECT COALESCE(MAX(RIGHT(number, 4)::int), 0) + 1 AS n FROM orders
         WHERE number LIKE 'VE-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-%'`
      );
      const number = nextOrderNumber(seq.rows[0].n);
      if (seq.rows[0].n > 9999) throw conflict('numbers_exhausted', 'Order numbers for this year are exhausted.');

      const placeholder = newId(18);
      const o = await t.query(
        `INSERT INTO orders (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor, currency,
           status, payment_status, fulfilment_status, shipping_method, shipping_address, access_token_hash, idempotency_key, placed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'USD','pending','unpaid','unfulfilled',$8,$9,$10,$11, now())
         RETURNING *`,
        [number, s?.customer?.id || null, email, totals.subtotal_minor, totals.shipping_minor, totals.tax_minor,
         totals.total_minor, method.code, JSON.stringify(address), sha256(placeholder), idemKey]
      );
      const order = o.rows[0];
      const finalAccess = orderAccessToken(order.id, order.number);
      await t.query(`UPDATE orders SET access_token_hash=$1 WHERE id=$2`, [sha256(finalAccess), order.id]);
      const lineIds = [];
      for (const l of lines) {
        const ins = await t.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [order.id, l.variant_id, l.product_title, l.sku, l.quantity, l.unit_price_minor, l.unit_price_minor * l.quantity]
        );
        lineIds.push(ins.rows[0].id);
      }
      await allocateSerials(t, order.id, orderLinesWithKind(lines, lineIds));
      return { order, access: finalAccess };
    });

    // billing + mail happen outside the stock transaction
    let kbError = null;
    try {
      await confirmOrder(db, result.order, result.access);
    } catch (e) {
      kbError = e;
      logLine({ ts: new Date().toISOString(), request_id: c.get('requestId'), level: 'error',
        scope: 'confirm', message: e.message, order: result.order.number });
    }

    const finalOrder = (await db.query(`SELECT * FROM orders WHERE id=$1`, [result.order.id])).rows[0];
    return respond(c, 201, {
      ...(await orderFull(db, finalOrder, { accessToken: result.access })),
      ...(kbError ? { warning: `The order is placed. The invoice will be retried. Reference ${c.get('requestId')}.` } : {}),
    });
  });

  api.get('/orders/:number', async (c) => {
    const { db } = tryGet();
    const number = String(c.req.param('number') || '').toUpperCase();
    const tokenParam = c.req.query('access_token') || c.req.header('x-access-token');
    const s = await customerFromToken(c);
    const order = (await db.query(`SELECT * FROM orders WHERE number=$1`, [number])).rows[0];
    if (!order) throw gone('not_found', 'That page does not exist.');
    const authorized = (tokenParam && sha256(tokenParam) === order.access_token_hash)
      || (s?.customer && order.customer_id === s.customer.id);
    if (!authorized) throw gone('not_found', 'That page does not exist.');
    return respond(c, 200, await orderFull(db, order, { accessToken: tokenParam || null }));
  });

  // ---- account (bearer required)
  api.use('/account/*', async (c, next) => {
    const s = await customerFromToken(c);
    if (!s || !s.customer) {
      throw denied('unauthenticated', 'Sign in to continue.');
    }
    c.set('customer', s.customer);
    await next();
  });

  api.get('/account/orders', async (c) => {
    const { db } = tryGet();
    const q = c.req.query();
    const ps = pageSize(new URLSearchParams(q));
    if (ps.error) throw bad('page_size_too_large', ps.error);
    const cursor = decodeCursor(q.cursor);
    const cust = c.get('customer');
    const params = [cust.id];
    let clause = '';
    if (cursor) { params.push(cursor); clause = ` AND o.id < $${params.length}`; }
    params.push(ps.size + 1);
    const r = await db.query(
      `SELECT o.* FROM orders o WHERE o.customer_id = $1 ${clause} ORDER BY o.id DESC LIMIT $${params.length}`, params
    );
    const rows = r.rows;
    const hasMore = rows.length > ps.size;
    const page = hasMore ? rows.slice(0, ps.size) : rows;
    const data = [];
    for (const o of page) {
      const lines = (await db.query(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id`, [o.id])).rows;
      data.push(await orderFull(db, o, {}));
    }
    return respond(c, 200, { data, next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1].id) : null, has_more: hasMore });
  });

  api.get('/account/devices', async (c) => {
    const { db } = tryGet();
    const q = c.req.query();
    const ps = pageSize(new URLSearchParams(q));
    if (ps.error) throw bad('page_size_too_large', ps.error);
    const cursor = decodeCursor(q.cursor);
    const cust = c.get('customer');
    const data = await devicesForCustomer(db, cust.id, ps.size + 1, cursor);
    const hasMore = data.length > ps.size;
    const page = hasMore ? data.slice(0, ps.size) : data;
    return respond(c, 200, {
      data: page,
      next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1].id) : null,
      has_more: hasMore,
    });
  });

  api.post('/account/devices', async (c) => {
    const { db } = tryGet();
    const body = await c.req.json().catch(() => ({}));
    const raw = String(body.serial || '');
    const serial = normalizeSerial(raw);
    if (!validSerial(raw)) {
      throw bad('bad_serial_shape', 'A serial is twelve characters, for example VA2609KTMHX4.');
    }
    const cust = c.get('customer');
    const dev = (await db.query(`SELECT * FROM device WHERE serial = $1`, [serial])).rows[0];
    if (!dev) throw gone('unknown_serial', 'We do not recognise that serial number.');
    if (dev.status === 'blocked') throw conflict('blocked_device', 'That camera is blocked. Contact us and quote the serial.');
    const live = (await db.query(`SELECT o.*, c.email AS owner_email FROM device_ownership o LEFT JOIN customer c ON c.id=o.customer_id WHERE o.device_id=$1 AND o.released_at IS NULL`, [dev.id])).rows[0];
    if (live && live.customer_id && live.customer_id !== cust.id) {
      throw conflict('owned_by_other', 'That camera is registered to someone else.');
    }
    try {
      const res = await inTx(db, async (t) => {
        const d = (await t.query(`SELECT id, status FROM device WHERE id=$1 FOR UPDATE`, [dev.id])).rows[0];
        if (!d) throw gone('unknown_serial', 'We do not recognise that serial number.');
        if (d.status === 'blocked') throw conflict('blocked_device', 'That camera is blocked. Contact us and quote the serial.');
        const already = (await t.query(`SELECT id, customer_id FROM device_ownership WHERE device_id=$1 AND released_at IS NULL FOR UPDATE`, [dev.id])).rows[0];
        if (already && already.customer_id === cust.id) return { already: true };
        if (already) throw conflict('owned_by_other', 'That camera is registered to someone else.');
        await t.query(`INSERT INTO device_ownership (device_id, customer_id, method) VALUES ($1,$2,'manual')`, [dev.id, cust.id]);
        await t.query(`UPDATE device SET status='registered' WHERE id=$1`, [dev.id]);
        return { already: false };
      });
      if (res.already) return respond(c, 200, await devicePayload(db, dev.id, cust.id));
    } catch (e) { throw e; }
    return respond(c, 201, await devicePayload(db, dev.id, cust.id));
  });

  api.patch('/account/devices/:serial', async (c) => {
    const { db } = tryGet();
    const serial = normalizeSerial(c.req.param('serial'));
    const body = await c.req.json().catch(() => ({}));
    const cust = c.get('customer');
    const dev = (await db.query(`SELECT * FROM device WHERE serial=$1`, [serial])).rows[0];
    if (!dev) throw gone('unknown_serial', 'We do not recognise that serial number.');
    const live = (await db.query(`SELECT customer_id FROM device_ownership WHERE device_id=$1 AND released_at IS NULL`, [dev.id])).rows[0];
    if (!live || live.customer_id !== cust.id) throw gone('not_found', 'That page does not exist.');
    const nickname = body.nickname === null ? null : String(body.nickname || '').trim().slice(0, 80) || null;
    await db.query(`UPDATE device SET nickname=$1 WHERE id=$2`, [nickname, dev.id]);
    return respond(c, 200, await devicePayload(db, dev.id, cust.id));
  });

  api.delete('/account/devices/:serial', async (c) => {
    const { db } = tryGet();
    const serial = normalizeSerial(c.req.param('serial'));
    const cust = c.get('customer');
    const dev = (await db.query(`SELECT * FROM device WHERE serial=$1`, [serial])).rows[0];
    if (!dev) throw gone('unknown_serial', 'We do not recognise that serial number.');
    const live = (await db.query(`SELECT customer_id FROM device_ownership WHERE device_id=$1 AND released_at IS NULL`, [dev.id])).rows[0];
    if (!live || live.customer_id !== cust.id) throw gone('not_found', 'That page does not exist.');
    await inTx(db, async (t) => {
      await t.query(`UPDATE device_ownership SET released_at=now() WHERE device_id=$1 AND released_at IS NULL`, [dev.id]);
      await t.query(`UPDATE device SET status='sold' WHERE id=$1 AND status='registered'`, [dev.id]);
    });
    return respond(c, 200, { released: true, serial: dev.serial });
  });

  // ---- releases
  api.get('/releases', async (c) => {
    const { db } = tryGet();
    const q = c.req.query();
    const ps = pageSize(new URLSearchParams(q));
    if (ps.error) throw bad('page_size_too_large', ps.error);
    const cursor = decodeCursor(q.cursor);
    const params = [];
    let clause = '';
    if (cursor) { params.push(cursor); clause = ` AND build < $${params.length}`; }
    params.push(ps.size + 1);
    const r = await db.query(`SELECT * FROM app_release WHERE TRUE ${clause} ORDER BY build DESC LIMIT $${params.length}`, params);
    const rows = r.rows;
    const hasMore = rows.length > ps.size;
    const page = hasMore ? rows.slice(0, ps.size) : rows;
    return respond(c, 200, {
      data: page.map(releasePayload),
      next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1].build) : null,
      has_more: hasMore,
    });
  });

  api.get('/releases/:version', async (c) => {
    const { db } = tryGet();
    const v = String(c.req.param('version') || '').trim();
    const r = await db.query(`SELECT * FROM app_release WHERE version = $1`, [v]);
    if (!r.rows.length) throw gone('not_found', 'That page does not exist.');
    return respond(c, 200, releasePayload(r.rows[0]));
  });

  // ---- firmware
  api.get('/firmware/manifest', async (c) => {
    const { db } = tryGet();
    const model = String(c.req.query('model') || '').trim();
    if (!model) throw bad('model_required', 'Name a model.');
    const p = (await db.query(`SELECT id, handle, title FROM product WHERE title = $1 OR handle = $1`, [model])).rows[0];
    if (!p) throw gone('unknown_model', 'We do not know that model.');
    const channel = String(c.req.query('channel') || 'general');
    const rows = (await db.query(
      `SELECT * FROM firmware WHERE product_id=$1 AND channel IN ('general','beta') ORDER BY build DESC`, [p.id]
    )).rows;
    const entries = rows
      .filter((f) => f.channel === 'general' || channel === f.channel)
      .map((f) => ({
        version: f.version, build: f.build, channel: f.channel,
        min_firmware: f.min_firmware, min_app_version: f.min_app_version,
        size_bytes: f.size_bytes, sha256: f.sha256, released_on: String(f.released_on).slice(0, 10),
      }));
    return respond(c, 200, {
      product: p.title, handle: p.handle, generated_at: new Date().toISOString(), entries,
    });
  });

  // ---- doctor helper: identify a device by serial for the installer (public, read-only)
  api.get('/doctor/device', async (c) => {
    const { db } = tryGet();
    const raw = c.req.query('serial') || '';
    const serial = normalizeSerial(raw);
    if (!validSerial(raw)) throw bad('bad_serial_shape', 'A serial is twelve characters, for example VA2609PVDA7Q.');
    const r = await db.query(
      `SELECT d.id, d.serial, d.product_id, d.firmware_version, d.warranty_until,
              p.title AS model, p.handle AS product_handle
       FROM device d JOIN product p ON p.id = d.product_id WHERE d.serial = $1`, [serial]);
    if (!r.rows.length) throw gone('unknown_serial', 'We do not recognise that serial number.');
    return respond(c, 200, r.rows[0]);
  });

  // ---- flash sessions
  api.post('/flash-sessions', async (c) => {
    const { db } = tryGet();
    const body = await c.req.json().catch(() => ({}));
    const serial = normalizeSerial(body.serial);
    const build = Number(body.target_build);
    if (!validSerial(serial)) throw bad('bad_serial_shape', 'A serial is twelve characters, for example VA2609PVDA7Q.');
    if (!Number.isInteger(build)) throw bad('build_required', 'Name the build to write.');
    const dev = (await db.query(`SELECT * FROM device WHERE serial=$1`, [serial])).rows[0];
    if (!dev) throw gone('unknown_serial', 'We do not recognise that serial number.');
    const fw = (await db.query(`SELECT f.*, p.title AS product_title, p.id AS product_id FROM firmware f JOIN product p ON p.id=f.product_id WHERE f.build=$1`, [build])).rows[0];
    if (!fw) throw gone('unknown_build', 'That build does not exist.');
    if (fw.product_id !== dev.product_id) {
      throw conflict('wrong_product', `${fw.version} is for the ${fw.product_title}. This is a different camera.`);
    }
    if (fw.min_firmware && dev.firmware_version && cmpVersion(fw.min_firmware, dev.firmware_version) > 0) {
      throw conflict('below_minimum', `This camera is running ${dev.firmware_version}. ${fw.version} needs ${fw.min_firmware} or later.`);
    }
    const started = (await db.query(`SELECT id FROM flash_session WHERE device_id=$1 AND state='started'`, [dev.id])).rows[0];
    if (started) throw conflict('session_in_progress', 'A write is already running on this camera.');
    const ins = await db.query(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
      [dev.id, fw.id]
    );
    return respond(c, 201, flashPayload(ins.rows[0], { firmware: fw, device: dev }));
  });

  api.post('/flash-sessions/:id/complete', async (c) => {
    const { db } = tryGet();
    const id = Number(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    const reported = String(body.reported_version || '').trim();
    if (!/^\d+(\.\d+){0,3}$/.test(reported)) throw bad('bad_version', 'Report the version the camera read back.');
    const sess = (await db.query(`SELECT * FROM flash_session WHERE id=$1`, [id])).rows[0];
    if (!sess) throw gone('not_found', 'That page does not exist.');
    if (sess.state !== 'started') throw conflict('not_started', 'That session is not running.');
    const fw = (await db.query(`SELECT * FROM firmware WHERE id=$1`, [sess.firmware_id])).rows[0];
    await inTx(db, async (t) => {
      const cur = (await t.query(`SELECT id, state FROM flash_session WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!cur || cur.state !== 'started') throw conflict('not_started', 'That session is not running.');
      await t.query(`UPDATE flash_session SET state='succeeded', reported_version=$1, ended_at=now() WHERE id=$2`, [reported, id]);
      await t.query(`UPDATE device SET firmware_version=$1, firmware_reported_at=now() WHERE id=$2`, [reported, sess.device_id]);
    });
    const out = (await db.query(`SELECT * FROM flash_session WHERE id=$1`, [id])).rows[0];
    return respond(c, 200, flashPayload(out, { firmware: fw }));
  });

  api.post('/flash-sessions/:id/fail', async (c) => {
    const { db } = tryGet();
    const id = Number(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || 'unknown').slice(0, 200);
    const sess = (await db.query(`SELECT * FROM flash_session WHERE id=$1`, [id])).rows[0];
    if (!sess) throw gone('not_found', 'That page does not exist.');
    if (sess.state !== 'started') throw conflict('not_started', 'That session is not running.');
    await inTx(db, async (t) => {
      const cur = (await t.query(`SELECT id, state FROM flash_session WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!cur || cur.state !== 'started') throw conflict('not_started', 'That session is not running.');
      await t.query(`UPDATE flash_session SET state='failed', failure_reason=$1, ended_at=now() WHERE id=$2`, [reason, id]);
    });
    const out = (await db.query(`SELECT * FROM flash_session WHERE id=$1`, [id])).rows[0];
    return respond(c, 200, flashPayload(out));
  });

  return api;
}

function flashPayload(s, { firmware } = {}) {
  return {
    id: s.id, device_id: s.device_id, firmware_id: s.firmware_id, state: s.state,
    reported_version: s.reported_version || null, failure_reason: s.failure_reason || null,
    started_at: s.started_at, ended_at: s.ended_at || null,
    ...(firmware ? { firmware: { id: firmware.id, version: firmware.version, build: firmware.build } } : {}),
  };
}

function releasePayload(r) {
  return {
    id: r.id, version: r.version, build: r.build,
    released_on: typeof r.released_on === 'string' ? r.released_on.slice(0, 10) : String(r.released_on).slice(0, 10),
    channel: r.channel, artifact_name: r.artifact_name, size_bytes: r.size_bytes,
    sha256: r.sha256, description: r.description || '', notes: r.notes || [],
  };
}

async function devicesForCustomer(db, customerId, limit, cursor) {
  const params = [customerId];
  let clause = '';
  if (cursor) { params.push(cursor); clause = ` AND d.id < $${params.length}`; }
  params.push(limit);
  const r = await db.query(
    `SELECT d.*, p.title AS model, p.handle AS product_handle, v.title AS variant_title
     FROM device_ownership o
     JOIN device d ON d.id = o.device_id
     JOIN product p ON p.id = d.product_id
     LEFT JOIN variant v ON v.id = d.variant_id
     WHERE o.customer_id = $1 AND o.released_at IS NULL ${clause}
     ORDER BY d.id DESC LIMIT $${params.length}`,
    params
  );
  const rows = r.rows;
  const out = [];
  for (const d of rows) {
    const fw = (await db.query(`SELECT version, build, channel FROM firmware WHERE product_id=$1 ORDER BY build DESC`, [d.product_id])).rows;
    const upd = firmwareUpdateAvailable(d.firmware_version, fw);
    out.push({
      id: d.id, serial: d.serial, model: d.model, variant_title: d.variant_title,
      nickname: d.nickname, status: d.status, firmware_version: d.firmware_version,
      firmware_reported_at: d.firmware_reported_at, warranty_until: d.warranty_until ? String(d.warranty_until).slice(0, 10) : null,
      update_available: upd.available, latest_firmware: upd.newest ? { version: upd.newest.version, build: upd.newest.build } : null,
      update_state: !d.firmware_version ? 'never_connected' : (upd.available ? 'update_available' : 'current'),
    });
  }
  return out;
}

async function devicePayload(db, deviceId, customerId) {
  const list = await devicesForCustomer(db, customerId, 1000, null);
  return list.find((d) => d.id === deviceId) || null;
}

async function confirmOrder(db, order, access) {
  const lines = (await db.query(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id`, [order.id])).rows;
  const description = `Vela order ${order.number}`;
  const account = await kb.ensureAccount({
    name: order.email,
    externalKey: order.email,
    email: order.email,
    currency: 'USD',
    country: (order.shipping_address || {}).country || 'US',
  });
  // Exactly one invoice and one mail per order: a retried confirmation finds the
  // invoice it already raised and sends nothing further.
  const alreadyInvoiced = await kb.findInvoiceByDescription(account.accountId, description, order.total_minor);
  const invoice = alreadyInvoiced || (await kb.createInvoice({
    accountId: account.accountId,
    description,
    totalMinor: order.total_minor,
    currency: 'USD',
  }));
  await db.query(
    `UPDATE orders SET status='confirmed', payment_status='invoiced', killbill_external_key=$1,
       killbill_invoice_amount=$2, placed_at=now() WHERE id=$3`,
    [order.email, invoice.amount, order.id]
  );
  if (alreadyInvoiced) return { invoice, mail: { skipped: true, reason: 'already invoiced' } };
  const mail = await sendOrderConfirmation({
    to: order.email,
    orderNumber: order.number,
    lines: lines.map((l) => ({ title: l.title_snapshot, quantity: l.quantity, lineTotal: usd(l.total_minor) })),
    totalMinor: usd(order.total_minor),
    currency: order.currency,
  });
  return { invoice, mail };
}

async function orderPayload(db, order, { accessToken } = {}) {
  const lines = (await db.query(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id`, [order.id])).rows;
  // pg returns bigint as text; money is an integer of minor units in every layer
  const n = (v) => Number(v);
  return {
    id: order.id,
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    subtotal_minor: n(order.subtotal_minor),
    shipping_minor: n(order.shipping_minor),
    tax_minor: n(order.tax_minor),
    total_minor: n(order.total_minor),
    currency: order.currency,
    killbill_external_key: order.killbill_external_key || order.email,
    ...(accessToken ? { access_token: accessToken } : {}),
    lines: lines.map((l) => ({
      id: l.id, variant_id: l.variant_id, title: l.title_snapshot, sku: l.sku_snapshot,
      quantity: l.quantity, unit_price_minor: n(l.unit_price_minor), total_minor: n(l.total_minor), serials: l.serials || [],
    })),
  };
}

async function orderFull(db, order, { accessToken } = {}) {
  const p = await orderPayload(db, order, { accessToken });
  return {
    ...p,
    placed_at: order.placed_at,
    created_at: order.created_at,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    killbill_invoice_amount: order.killbill_invoice_amount !== null && order.killbill_invoice_amount !== undefined ? Number(order.killbill_invoice_amount) : null,
    access_url: accessToken ? `/orders/${order.number}?access_token=${encodeURIComponent(accessToken)}` : null,
  };
}

async function productsPage(db, { size, cursor, kind }) {
  const params = [];
  let where = `WHERE p.kind <> 'protection'`;
  if (kind) { params.push(kind); where += ` AND p.kind = $${params.length}`; }
  let cursorClause = '';
  if (cursor) { params.push(cursor); cursorClause = ` AND p.position > $${params.length}`; }
  params.push(size + 1);
  const sql = `
    SELECT p.* FROM product p ${where} ${cursorClause}
    ORDER BY p.position ASC, p.id ASC LIMIT $${params.length}`;
  const r = await db.query(sql, params);
  const rows = r.rows;
  const hasMore = rows.length > size;
  const page = hasMore ? rows.slice(0, size) : rows;
  const ids = page.map((p) => p.id);
  const variants = ids.length
    ? (await db.query(
        `SELECT v.*, il.available, il.committed FROM variant v
         LEFT JOIN inventory_level il ON il.variant_id = v.id
         WHERE v.product_id = ANY($1::bigint[]) ORDER BY v.position, v.id`,
        [ids]
      )).rows
    : [];
  const byProduct = new Map();
  for (const v of variants) {
    if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
    byProduct.get(v.product_id).push(v);
  }
  const data = page.map((p) => {
    const vs = (byProduct.get(p.id) || []).map((v) => ({
      id: v.id, sku: v.sku, title: v.title, option_value: v.option_value,
      price_minor: Number(v.price_minor), currency: v.currency, available: v.available ?? 0,
      inventory_policy: v.inventory_policy,
      availability: variantAvailability({ status: p.status, inventory: { available: v.available ?? 0 }, policy: v.inventory_policy }),
    }));
    return {
      id: p.id, handle: p.handle, title: p.title, subtitle: p.subtitle, kind: p.kind, status: p.status,
      support_until: p.support_until ? String(p.support_until).slice(0, 10) : null,
      variants: vs,
      availability: productAvailability(vs, p.status),
      price_from_minor: vs.length ? Math.min(...vs.map((v) => v.price_minor)) : null,
    };
  });
  return {
    data,
    next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1].position) : null,
    has_more: hasMore,
  };
}

function productAvailability(variants, status) {
  if (status === 'discontinued') return { state: 'discontinued', label: 'Discontinued' };
  const buyable = variants.filter((v) => v.availability.buyable);
  if (buyable.length) {
    const min = Math.min(...buyable.map((v) => v.availability.available));
    return { state: min <= 10 ? 'low' : 'available', label: min <= 10 ? `Only ${min} left` : 'Available' };
  }
  return { state: 'sold_out', label: 'Sold out' };
}

async function productByHandle(db, handle) {
  const r = await db.query(`SELECT * FROM product WHERE handle = $1 AND kind <> 'protection'`, [handle]);
  if (!r.rows.length) return null;
  const p = r.rows[0];
  const vs = (await db.query(
    `SELECT v.*, il.available, il.committed FROM variant v
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE v.product_id = $1 ORDER BY v.position, v.id`, [p.id]
  )).rows;
  const blocks = (await db.query(
    `SELECT kind, payload FROM product_block WHERE product_id = $1 ORDER BY position`, [p.id]
  )).rows.map((b) => ({ kind: b.kind, ...b.payload }));
  const variants = vs.map((v) => ({
    id: v.id, sku: v.sku, title: v.title, option_value: v.option_value,
    price_minor: Number(v.price_minor), currency: v.currency, available: v.available ?? 0,
    inventory_policy: v.inventory_policy,
    availability: variantAvailability({ status: p.status, inventory: { available: v.available ?? 0 }, policy: v.inventory_policy }),
  }));
  return {
    id: p.id, handle: p.handle, title: p.title, subtitle: p.subtitle, kind: p.kind, status: p.status,
    support_until: p.support_until ? String(p.support_until).slice(0, 10) : null,
    blocks, variants,
    availability: productAvailability(variants, p.status),
    price_from_minor: variants.length ? Math.min(...variants.map((v) => v.price_minor)) : null,
  };
}

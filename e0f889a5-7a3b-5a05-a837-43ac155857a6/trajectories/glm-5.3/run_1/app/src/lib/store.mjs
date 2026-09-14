import { boot, tryGet } from '../../server/state.mjs';
import { verifyToken, orderAccessToken, sha256 } from '../../server/env.mjs';
import { usd, variantAvailability, firmwareUpdateAvailable, computeTotals, protectionRungFor } from '../../server/domain.mjs';

/** Waits for boot so a page rendered during startup degrades rather than throwing. */
export async function db() {
  if (tryGet()) return tryGet().db;
  try { await boot(); } catch {}
  return tryGet()?.db ?? null;
}

function header(req, name) {
  // Astro hands the page a fetch Request; be tolerant of a Node IncomingMessage too.
  const h = req && req.headers;
  if (!h) return '';
  if (typeof h.get === 'function') return h.get(name) || '';
  const v = h[name] ?? h[name.toLowerCase()];
  if (v === undefined || v === null) return '';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function cookieValue(req, key) {
  const raw = header(req, 'cookie');
  for (const part of String(raw || '').split(';')) {
    const t = part.trim();
    if (t.startsWith(key + '=')) {
      try { return decodeURIComponent(t.slice(key.length + 1)); } catch { return t.slice(key.length + 1); }
    }
  }
  return null;
}

export async function getCustomer(request) {
  const auth = header(request, 'authorization');
  const bearer = /^Bearer\s+(.+)$/i.exec(String(auth || ''))?.[1];
  const token = bearer || cookieValue(request, 'vela_token');
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return { expired: true };
  const d = tryGet().db;
  const r = await d.query(`SELECT id, email, name, status FROM customer WHERE id=$1`, [payload.sub]);
  if (!r.rows.length) return { expired: true };
  return { customer: r.rows[0] };
}

export function cartToken(request) {
  return cookieValue(request, 'vela_cart');
}

export async function loadCart(d, token) {
  if (!token) return null;
  const r = await d.query(`SELECT * FROM cart WHERE token=$1`, [token]);
  return r.rows[0] || null;
}

export async function cartLines(d, cartId) {
  const r = await d.query(
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

export async function cartView(d, cart) {
  if (!cart) {
    return { exists: false, lines: [], notices: [], subtotal_minor: 0, shipping_minor: 0, tax_minor: 0, total_minor: 0, protection_minor: 0, protection_enabled: false, protection_rung: null, email: null, shipping_method: null, shipping_address: null, marketing_consent: false };
  }
  const lines = await cartLines(d, cart.id);
  const method = cart.shipping_method;
  const ship = method === 'Express' ? 2500 : method === 'Standard' ? 0 : 0;
  const subtotal = lines.reduce((s, l) => s + l.unit_price_minor * l.quantity, 0);
  const tax = Math.trunc((subtotal * 1000) / 10000);
  const prot = cart.protection_enabled ? (protectionRungFor(subtotal)?.minor ?? 0) : 0;
  const notices = lines
    .filter((l) => l.current_price_minor !== l.unit_price_minor)
    .map((l) => ({
      title: l.product_title,
      old: l.unit_price_minor,
      new: l.current_price_minor,
      message: `The price of ${l.product_title} changed from ${usd(l.unit_price_minor)} to ${usd(l.current_price_minor)} since you added it.`,
    }));
  return {
    exists: true,
    id: cart.id,
    lines,
    notices,
    subtotal_minor: subtotal,
    shipping_minor: method ? ship : null,
    tax_minor: tax,
    total_minor: subtotal + (method ? ship : 0) + tax + prot,
    protection_minor: prot,
    protection_enabled: cart.protection_enabled,
    protection_rung: protectionRungFor(subtotal),
    email: cart.email,
    shipping_method: method,
    shipping_address: cart.shipping_address,
    marketing_consent: cart.marketing_consent,
    methodKnown: Boolean(method),
  };
}

export async function cartCount(request) {
  const d = tryGet().db;
  const t = cartToken(request);
  if (!t) return 0;
  const r = await d.query(
    `SELECT COALESCE(SUM(cl.quantity),0)::int AS n FROM cart_line cl JOIN cart c ON c.id=cl.cart_id WHERE c.token=$1`,
    [t]
  );
  return r.rows[0]?.n || 0;
}

export async function productsForShop() {
  const d = tryGet().db;
  const r = await d.query(
    `SELECT p.* FROM product p WHERE p.kind <> 'protection' ORDER BY p.position ASC, p.id ASC`
  );
  const products = r.rows;
  const variants = (await d.query(
    `SELECT v.*, il.available FROM variant v LEFT JOIN inventory_level il ON il.variant_id=v.id ORDER BY v.position, v.id`
  )).rows;
  const blocks = (await d.query(`SELECT product_id, kind, payload FROM product_block ORDER BY position`)).rows;
  return products.map((p) => ({
    ...p,
    variants: variants.filter((v) => v.product_id === p.id),
    blocks: blocks.filter((b) => b.product_id === p.id),
  }));
}

export async function productByHandle(handle) {
  const d = tryGet().db;
  const r = await d.query(`SELECT * FROM product WHERE handle=$1 AND kind <> 'protection'`, [handle]);
  if (!r.rows.length) return null;
  const p = r.rows[0];
  const variants = (await d.query(
    `SELECT v.*, il.available FROM variant v LEFT JOIN inventory_level il ON il.variant_id=v.id WHERE v.product_id=$1 ORDER BY v.position, v.id`,
    [p.id]
  )).rows;
  const blocks = (await d.query(`SELECT kind, payload FROM product_block WHERE product_id=$1 ORDER BY position`, [p.id])).rows;
  return { ...p, variants, blocks };
}

export function availabilityOf(product, variant) {
  return variantAvailability({
    status: product.status,
    inventory: { available: variant.available ?? 0 },
    policy: variant.inventory_policy,
  });
}

export async function releasesList() {
  const d = tryGet().db;
  return (await d.query(`SELECT * FROM app_release ORDER BY build DESC`)).rows;
}

export async function releaseByVersion(v) {
  const d = tryGet().db;
  const r = await d.query(`SELECT * FROM app_release WHERE version=$1`, [v]);
  return r.rows[0] || null;
}

export async function firmwareForProduct(productId) {
  const d = tryGet().db;
  return (await d.query(`SELECT * FROM firmware WHERE product_id=$1 ORDER BY build DESC`, [productId])).rows;
}

export async function newestFirmwareFor(productId) {
  const list = await firmwareForProduct(productId);
  return list.find((f) => f.channel === 'general') || null;
}

export async function devicesFor(customerId) {
  const d = tryGet().db;
  const r = await d.query(
    `SELECT d.*, p.title AS model, p.handle AS product_handle, v.title AS variant_title, v.option_value
     FROM device_ownership o
     JOIN device d ON d.id=o.device_id
     JOIN product p ON p.id=d.product_id
     LEFT JOIN variant v ON v.id=d.variant_id
     WHERE o.customer_id=$1 AND o.released_at IS NULL
     ORDER BY d.id DESC`,
    [customerId]
  );
  const out = [];
  for (const dev of r.rows) {
    const fw = await firmwareForProduct(dev.product_id);
    const upd = firmwareUpdateAvailable(dev.firmware_version, fw);
    out.push({ ...dev, update_available: upd.available, latest: upd.newest, never_connected: !dev.firmware_version });
  }
  return out;
}

export async function ordersFor(customerId, limit = 100) {
  const d = tryGet().db;
  const r = await d.query(
    `SELECT * FROM orders WHERE customer_id=$1 ORDER BY id DESC LIMIT $2`, [customerId, limit]
  );
  const out = [];
  for (const o of r.rows) {
    const lines = (await d.query(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id`, [o.id])).rows;
    out.push({ ...o, lines });
  }
  return out;
}

export async function orderByNumber(number) {
  const d = tryGet().db;
  const r = await d.query(`SELECT * FROM orders WHERE number=$1`, [number]);
  if (!r.rows.length) return null;
  const o = r.rows[0];
  const lines = (await d.query(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id`, [o.id])).rows;
  return { ...o, lines };
}

export function orderAccessUrl(order) {
  const tok = orderAccessToken(order.id, order.number);
  return `/orders/${order.number}?access_token=${encodeURIComponent(tok)}`;
}

export function verifyOrderAccess(token, order) {
  return Boolean(token && order.access_token_hash && sha256(token) === order.access_token_hash);
}

export async function appNewest() {
  const d = tryGet().db;
  const r = await d.query(`SELECT * FROM app_release ORDER BY build DESC LIMIT 1`);
  return r.rows[0] || null;
}

export function fmtDate(d) {
  if (!d) return '';
  const iso = d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

export function fmtBytes(n) {
  const mb = n / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

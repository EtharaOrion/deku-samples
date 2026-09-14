// Domain logic shared by the API and the SSR pages.

import crypto from 'node:crypto';
import { q, withTransaction } from './db.js';
import { taxFor, moneyFormat } from './money.js';
import { hashPassword } from './auth.js';

export const SHIPPING_METHODS = [
  { code: 'standard', title: 'Standard', price_minor: 0, window: '5 to 7 days', zone: 'us-domestic' },
  { code: 'express', title: 'Express', price_minor: 2500, window: '2 days', zone: 'us-domestic' },
];

export const SHIPPING_ZONE_COUNTRY = { 'us-domestic': 'US' };

export function protectRungFor(subtotalMinor) {
  if (subtotalMinor >= 100000) return 'VELA-PROTECT-4';
  if (subtotalMinor >= 50000) return 'VELA-PROTECT-3';
  if (subtotalMinor >= 10000) return 'VELA-PROTECT-2';
  if (subtotalMinor >= 1) return 'VELA-PROTECT-1';
  return null;
}

export const PROTECT_PRICES = {
  'VELA-PROTECT-1': 98,
  'VELA-PROTECT-2': 298,
  'VELA-PROTECT-3': 598,
  'VELA-PROTECT-4': 1198,
};

export function newOpaqueToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// ---------- cart ----------

export async function ensureCart(cartToken, customerId = null) {
  if (cartToken) {
    const rows = await q('SELECT * FROM cart WHERE token = $1', [cartToken]);
    if (rows.length) return rows[0];
  }
  const token = cartToken || newOpaqueToken();
  const rows = await q(
    `INSERT INTO cart (token, customer_id) VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [token, customerId]
  );
  return rows[0];
}

export async function cartLines(cartId) {
  return q(
    `SELECT cl.id, cl.cart_id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            v.inventory_policy, il.available, il.committed,
            p.id AS product_id, p.handle AS product_handle, p.title AS product_title,
            p.kind AS product_kind, p.status AS product_status
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = cl.variant_id
      WHERE cl.cart_id = $1
      ORDER BY cl.id`,
    [cartId]
  );
}

export function cartNotices(lines) {
  const notices = [];
  for (const l of lines) {
    if (Number(l.current_price_minor) !== Number(l.unit_price_minor)) {
      notices.push({
        code: 'price_changed',
        item: l.product_title,
        sku: l.sku,
        old_minor: Number(l.unit_price_minor),
        new_minor: Number(l.current_price_minor),
        message: `The price of ${l.product_title} changed from ${moneyFormat(l.unit_price_minor)} to ${moneyFormat(l.current_price_minor)} since you added it.`,
      });
    }
    const avail = Number(l.available ?? 0);
    if (l.inventory_policy === 'deny' && avail < l.quantity) {
      notices.push({
        code: 'availability_changed',
        item: l.product_title,
        sku: l.sku,
        message: `Only ${Math.max(avail, 0)} of ${l.product_title} remain, so the quantity you asked for is not available.`,
      });
    }
  }
  return notices;
}

export function cartSubtotal(lines, { protection = false } = {}) {
  let subtotal = 0;
  for (const l of lines) subtotal += Number(l.current_price_minor) * Number(l.quantity);
  if (protection) {
    const rung = protectRungFor(subtotal);
    if (rung) subtotal += PROTECT_PRICES[rung];
  }
  return subtotal;
}

export async function cartPayload(cart, { shippingMethod = null, protection = null } = {}) {
  const lines = await cartLines(cart.id);
  const notices = cartNotices(lines);
  const goodsSubtotal = lines.reduce((s, l) => s + Number(l.current_price_minor) * Number(l.quantity), 0);
  const methodCode = shippingMethod ?? (cart.shipping_method || null);
  const method = methodCode ? SHIPPING_METHODS.find((m) => m.code === methodCode) || null : null;
  const protectionOn = protection === null ? !!cart.protection_enabled : !!protection;
  const rung = protectRungFor(goodsSubtotal);
  const protectionMinor = protectionOn && rung ? PROTECT_PRICES[rung] : 0;
  const subtotal = goodsSubtotal + protectionMinor;
  const shippingMinor = method ? method.price_minor : 0;
  // Shipment protection is excluded from tax and from shipping weight.
  const taxMinor = taxFor(subtotal - protectionMinor);
  const totalMinor = subtotal + shippingMinor + taxMinor;
  return {
    id: cart.id,
    token: cart.token,
    email: cart.email,
    shipping_method: method ? method.code : null,
    shipping_address: cart.shipping_address || null,
    lines: lines.map((l) => ({
      id: l.id,
      variant_id: l.variant_id,
      sku: l.sku,
      product_handle: l.product_handle,
      product_title: l.product_title,
      variant_title: l.variant_title,
      option_value: l.option_value,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      current_price_minor: Number(l.current_price_minor),
      line_total_minor: Number(l.current_price_minor) * Number(l.quantity),
      available: Number(l.available ?? 0),
      product_status: l.product_status,
    })),
    subtotal_minor: subtotal,
    goods_subtotal_minor: goodsSubtotal,
    protection_enabled: protectionOn,
    protection_rung: rung,
    protection_minor: protectionMinor,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: totalMinor,
    notices,
  };
}

export async function cartByTokenWithFlags(token) {
  const rows = await q('SELECT * FROM cart WHERE token = $1', [token]);
  return rows.length ? rows[0] : null;
}

// ---------- products ----------

export async function listProducts({ includeProtection = false } = {}) {
  return q(
    `SELECT p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position
       FROM product p
      WHERE ($1 OR p.kind <> 'protection')
      ORDER BY p.position, p.id`,
    [includeProtection]
  );
}

export async function productByHandle(handle, { includeProtection = false } = {}) {
  const rows = await q(
    `SELECT p.* FROM product p WHERE p.handle = $1 AND ($2 OR p.kind <> 'protection')`,
    [handle, includeProtection]
  );
  if (!rows.length) return null;
  const product = rows[0];
  const variants = await q(
    `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, il.available, il.committed
       FROM variant v
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = $1
      ORDER BY v.position, v.id`,
    [product.id]
  );
  const blocks = await q(
    `SELECT id, kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id`,
    [product.id]
  );
  return { ...product, variants, blocks };
}

export function variantAvailability(variant, product) {
  if (product.status === 'discontinued') return { state: 'discontinued', available: Number(variant.available ?? 0) };
  const avail = Number(variant.available ?? 0);
  if (variant.inventory_policy === 'deny' && avail <= 0) return { state: 'sold_out', available: avail };
  return { state: 'available', available: avail };
}

// ---------- devices ----------

export const SERIAL_RE = /^(VA|VC)\d{2}(0[1-9]|[1-4]\d|5[0-3])[2-9A-HJ-NP-Z]{6}$/;

export function serialShapeValid(serial) {
  return SERIAL_RE.test(String(serial || '').toUpperCase());
}

export function normalizeSerial(serial) {
  return String(serial || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function deviceBySerial(serial) {
  const rows = await q(
    `SELECT d.*, p.handle AS product_handle, p.title AS product_title, p.kind AS product_kind,
            v.title AS variant_title, v.option_value, v.sku
       FROM device d
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE upper(d.serial) = upper($1)`,
    [serial]
  );
  return rows.length ? rows[0] : null;
}

export async function liveOwnerOf(deviceId) {
  const rows = await q(
    `SELECT o.*, c.email AS owner_email, c.name AS owner_name
       FROM device_ownership o
       LEFT JOIN customer c ON c.id = o.customer_id
      WHERE o.device_id = $1 AND o.released_at IS NULL`,
    [deviceId]
  );
  return rows.length ? rows[0] : null;
}

// ---------- app ----------

export async function currentAppRelease() {
  const rows = await q('SELECT * FROM app_release ORDER BY build DESC LIMIT 1');
  return rows.length ? rows[0] : null;
}

export async function listAppReleases({ pageSize = 20, cursor = null } = {}) {
  let where = '';
  const params = [];
  if (cursor && cursor.build !== undefined) {
    params.push(Number(cursor.build));
    where = `WHERE build < $${params.length}`;
  }
  params.push(Number(pageSize) + 1);
  const limit = `$${params.length}`;
  const rows = await q(
    `SELECT * FROM app_release ${where} ORDER BY build DESC LIMIT ${limit}`,
    params
  );
  return rows;
}

// ---------- firmware ----------

export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export async function firmwareForProduct(productId, { channel = 'general' } = {}) {
  return q(
    `SELECT f.*, p.handle AS product_handle, p.title AS product_title
       FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE f.product_id = $1 AND f.channel = $2
      ORDER BY f.build DESC`,
    [productId, channel]
  );
}

export async function latestFirmwareForProduct(productId) {
  const rows = await q(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`,
    [productId]
  );
  return rows.length ? rows[0] : null;
}

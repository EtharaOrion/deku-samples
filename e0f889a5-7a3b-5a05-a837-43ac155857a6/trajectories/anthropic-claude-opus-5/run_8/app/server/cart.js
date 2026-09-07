import { one, many, query } from './db.js';
import { opaqueToken } from './auth.js';
import { formatMinor, taxOn } from './money.js';
import { protectionRungs } from '../db/seed-data.js';
import { badRequest, notFound, conflict } from './errors.js';

export const PROTECTION_HANDLE = 'protection';

export function rungFor(subtotalMinor) {
  for (const r of protectionRungs) {
    if (subtotalMinor >= r.min && subtotalMinor <= r.max) return r;
  }
  return protectionRungs[0];
}

// The shape of a cart nobody has filled yet. No row is written to say so.
export function emptyCart() {
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

export async function createCart(customerId = null) {
  const token = opaqueToken();
  const row = await one(
    'INSERT INTO cart (token, customer_id) VALUES ($1,$2) RETURNING id, token',
    [token, customerId]
  );
  return row;
}

export async function cartByToken(token) {
  if (!token) return null;
  return one('SELECT * FROM cart WHERE token = $1 AND expires_at > now()', [token]);
}

export async function loadCart(token) {
  const cart = await cartByToken(token);
  if (!cart) return null;
  return shapeCart(cart);
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
export async function shapeCart(cart) {
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

export async function addLine(cart, sku, quantity) {
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

export async function setLineQuantity(cart, lineId, quantity) {
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

export async function removeLine(cart, lineId) {
  const r = await query('DELETE FROM cart_line WHERE id = $1 AND cart_id = $2', [Number(lineId), cart.id]);
  if (r.rowCount === 0) throw notFound('That line is not in your cart.');
  await touch(cart.id);
}

export async function setProtection(cart, enabled) {
  await query('UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE id = $2', [!!enabled, cart.id]);
}

export async function setDelivery(cart, { email, shipping_address, shipping_method, contact }) {
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

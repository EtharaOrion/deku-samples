import { query, one, withTransaction } from './db.js';
import { errors } from './errors.js';
import { taxFromSubtotal, dollars } from './money.js';

export const SHIPPING_METHODS = {
  Standard: { price_minor: 0, days: '5 to 7 days' },
  Express: { price_minor: 2500, days: '2 days' },
};

export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', price_minor: 98, min: 1, max: 9999 },
  { sku: 'VELA-PROTECT-2', price_minor: 298, min: 10000, max: 49999 },
  { sku: 'VELA-PROTECT-3', price_minor: 598, min: 50000, max: 99999 },
  { sku: 'VELA-PROTECT-4', price_minor: 1198, min: 100000, max: null },
];

export function protectionRungFor(subtotalMinor) {
  if (subtotalMinor < 1) return null;
  return (
    PROTECTION_RUNGS.find((r) => subtotalMinor >= r.min && (r.max === null || subtotalMinor <= r.max)) ||
    PROTECTION_RUNGS[3]
  );
}

export async function getOrCreateCart(token, customerId = null) {
  const existing = await one(`SELECT * FROM cart WHERE token = $1`, [token]);
  if (existing) return existing;
  const r = await query(
    `INSERT INTO cart (token, customer_id) VALUES ($1,$2) ON CONFLICT (token) DO NOTHING RETURNING *`,
    [token, customerId]
  );
  return r.rows[0] || (await one(`SELECT * FROM cart WHERE token = $1`, [token]));
}

export async function loadCartLines(cartId) {
  const r = await query(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value,
            v.price_minor AS current_price_minor, v.inventory_policy, v.product_id,
            p.title AS product_title, p.handle, p.kind AS product_kind,
            p.status AS product_status, p.support_until,
            il.available, il.committed
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE cl.cart_id = $1
     ORDER BY cl.id`,
    [cartId]
  );
  return r.rows;
}

export function noticesForLines(lines) {
  const notices = [];
  for (const line of lines) {
    if (line.current_price_minor !== line.unit_price_minor) {
      notices.push({
        code: 'price_changed',
        kind: 'persistent',
        message: `The price of ${line.product_title} changed from ${dollars(line.unit_price_minor)} to ${dollars(line.current_price_minor)} since you added it.`,
      });
    }
    const available = line.available ?? 0;
    if (line.quantity > available && (line.inventory_policy || 'deny') === 'deny') {
      notices.push({
        code: 'not_enough_stock',
        kind: 'persistent',
        message: `Only ${available} of ${line.product_title} in ${line.option_value} are left.`,
      });
    }
  }
  return notices;
}

export async function serializeCart(cartRow) {
  const lines = await loadCartLines(cartRow.id);
  const notices = noticesForLines(lines);
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.current_price_minor, 0);
  const rung = protectionRungFor(subtotal);
  const method = cartRow.shipping_method || null;
  const addressKnown = Boolean(cartRow.shipping_address);
  // Nothing is taxed until the address is known: the cart reads the subtotal.
  const shipping = addressKnown && method && SHIPPING_METHODS[method] ? SHIPPING_METHODS[method].price_minor : 0;
  const tax = addressKnown ? taxFromSubtotal(subtotal) : 0;
  const protectionPrice = cartRow.protection_enabled && rung ? rung.price_minor : 0;
  const total = subtotal + shipping + tax + protectionPrice;
  return {
    id: cartRow.id,
    token: cartRow.token,
    email: cartRow.email,
    shipping_method: method,
    shipping_address: cartRow.shipping_address || null,
    address_known: addressKnown,
    marketing_consent: Boolean(cartRow.marketing_consent),
    protection_enabled: Boolean(cartRow.protection_enabled),
    protection_rung: rung,
    lines: lines.map((l) => ({
      id: l.id,
      variant_id: l.variant_id,
      sku: l.sku,
      product_handle: l.handle,
      product_title: l.product_title,
      option_value: l.option_value,
      variant_title: l.variant_title,
      quantity: l.quantity,
      unit_price_minor: l.current_price_minor,
      unit_price_at_add_minor: l.unit_price_minor,
      line_total_minor: l.quantity * l.current_price_minor,
      available: l.available ?? 0,
      product_status: l.product_status,
    })),
    notices,
    subtotal_minor: subtotal,
    shipping_minor: shipping,
    tax_minor: tax,
    protection_minor: protectionPrice,
    total_minor: total,
    currency: 'usd',
  };
}

export async function addLine(cart, sku, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw errors.validation('Quantity must be between 1 and 10.');
  }
  const variant = await one(
    `SELECT v.*, p.status AS product_status, p.title AS product_title, il.available
     FROM variant v JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE v.sku = $1`,
    [sku]
  );
  if (!variant) throw errors.notFound('We do not sell that item.');
  if (variant.product_status === 'discontinued') {
    throw errors.validation(`We no longer sell ${variant.product_title}.`);
  }
  if ((variant.inventory_policy || 'deny') === 'deny') {
    const existing = await one(
      `SELECT quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2`,
      [cart.id, variant.id]
    );
    const already = existing ? existing.quantity : 0;
    if (already + quantity > (variant.available ?? 0)) {
      throw errors.conflict(`We only have ${variant.available ?? 0} of that left.`);
    }
  }
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (cart_id, variant_id)
       DO UPDATE SET quantity = LEAST(cart_line.quantity + EXCLUDED.quantity, 10),
                     unit_price_minor = EXCLUDED.unit_price_minor
       RETURNING *`,
      [cart.id, variant.id, quantity, variant.price_minor]
    );
    await client.query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  });
  return serializeCart(await one(`SELECT * FROM cart WHERE id = $1`, [cart.id]));
}

export async function setLineQuantity(cart, lineId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) {
    throw errors.validation('Quantity must be between 1 and 10.');
  }
  const line = await one(
    `SELECT cl.*, v.inventory_policy, p.title AS product_title, il.available
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     JOIN product p ON p.id = v.product_id
     WHERE cl.id = $1 AND cl.cart_id = $2`,
    [lineId, cart.id]
  );
  if (!line) throw errors.notFound('That line is not in your cart.');
  if (quantity === 0) return removeLine(cart, lineId);
  if ((line.inventory_policy || 'deny') === 'deny' && quantity > (line.available ?? 0)) {
    throw errors.conflict(`We only have ${line.available ?? 0} of ${line.product_title} left.`);
  }
  await query(`UPDATE cart_line SET quantity = $1 WHERE id = $2 AND cart_id = $3`, [quantity, lineId, cart.id]);
  await query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return serializeCart(await one(`SELECT * FROM cart WHERE id = $1`, [cart.id]));
}

export async function removeLine(cart, lineId) {
  const r = await query(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cart.id]);
  if (r.rowCount === 0) throw errors.notFound('That line is not in your cart.');
  await query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return serializeCart(await one(`SELECT * FROM cart WHERE id = $1`, [cart.id]));
}

export async function setProtection(cart, enabled) {
  await query(`UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE id = $2`, [enabled ? true : false, cart.id]);
  return serializeCart(await one(`SELECT * FROM cart WHERE id = $1`, [cart.id]));
}

export async function setDelivery(cart, { email, shipping_address, shipping_method }) {
  const nextAddress = shipping_address || cart.shipping_address || null;
  const nextMethod =
    shipping_method === undefined ? cart.shipping_method || null : shipping_method || null;
  const nextEmail = email || cart.email || null;
  await query(
    `UPDATE cart SET email = $1, shipping_address = $2, shipping_method = $3, updated_at = now() WHERE id = $4`,
    [nextEmail, nextAddress ? JSON.stringify(nextAddress) : null, nextMethod, cart.id]
  );
  return serializeCart(await one(`SELECT * FROM cart WHERE id = $1`, [cart.id]));
}

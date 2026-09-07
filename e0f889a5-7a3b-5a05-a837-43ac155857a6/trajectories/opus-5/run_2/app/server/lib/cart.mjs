import crypto from 'node:crypto';
import { query } from './db.mjs';
import { taxFor, protectionRungFor, formatMoney } from './money.mjs';

export const CART_COOKIE = 'vela_cart';

export function newCartToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export async function findOrCreateCart(token, customerId = null) {
  if (token) {
    const { rows } = await query('SELECT * FROM cart WHERE token = $1 AND expires_at > now()', [token]);
    if (rows[0]) {
      if (customerId && !rows[0].customer_id) {
        await query('UPDATE cart SET customer_id = $1, updated_at = now() WHERE id = $2', [customerId, rows[0].id]);
        rows[0].customer_id = customerId;
      }
      return rows[0];
    }
  }
  const fresh = newCartToken();
  const { rows } = await query(
    'INSERT INTO cart (token, customer_id) VALUES ($1,$2) RETURNING *',
    [fresh, customerId],
  );
  return rows[0];
}

export async function cartLines(cartId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor, cl.created_at,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.currency,
            p.title, p.handle, p.status AS product_status, p.kind,
            il.available, il.committed
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.created_at, cl.id`,
    [cartId],
  );
  return rows;
}

/**
 * Every cart read compares the snapshotted unit price to the current price; a
 * difference renders as a notice naming the item, the old price and the new.
 */
export function priceNoticesFor(lines) {
  const notices = [];
  for (const l of lines) {
    if (l.unit_price_minor !== l.current_price_minor) {
      notices.push({
        kind: 'price_changed',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        old_price_minor: l.unit_price_minor,
        new_price_minor: l.current_price_minor,
        message: `The price of ${l.title} changed from ${formatMoney(l.unit_price_minor)} to ${formatMoney(l.current_price_minor)} since you added it.`,
      });
    }
    if (l.quantity > l.available && l.kind !== 'protection') {
      notices.push({
        kind: 'availability_changed',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        available: l.available,
        message: l.available === 0
          ? `${l.title} is sold out.`
          : `Only ${l.available} of ${l.title} remain. Reduce the quantity to continue.`,
      });
    }
  }
  return notices;
}

export async function shippingPrice(code) {
  if (!code) return null;
  const { rows } = await query('SELECT * FROM delivery_method WHERE code = $1', [code]);
  return rows[0] || null;
}

/**
 * Totals are derived from the lines beneath them, never printed independently.
 * Shipment protection is excluded from tax.
 */
export async function summariseCart(cart) {
  const lines = await cartLines(cart.id);
  const goods = lines.filter((l) => l.kind !== 'protection');
  // The rung is chosen from the goods subtotal; protection is excluded from tax
  // and counted exactly once, the same way the order counts it.
  const goodsSubtotalMinor = goods.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
  const rung = protectionRungFor(goodsSubtotalMinor);
  const protectionMinor = cart.protection_enabled && rung ? rung.price_minor : 0;
  const subtotalMinor = goodsSubtotalMinor + protectionMinor;
  const method = await shippingPrice(cart.shipping_method);
  const shippingMinor = method ? method.price_minor : 0;
  const taxMinor = taxFor(goodsSubtotalMinor);
  const totalMinor = subtotalMinor + shippingMinor + taxMinor;

  return {
    id: cart.id,
    token: cart.token,
    email: cart.email,
    customer_id: cart.customer_id,
    shipping_address: cart.shipping_address,
    shipping_method: cart.shipping_method,
    marketing_consent: cart.marketing_consent,
    protection_enabled: cart.protection_enabled,
    protection_rung: rung ? { ...rung, max: rung.max === Infinity ? null : rung.max } : null,
    protection_minor: protectionMinor,
    lines: lines.map((l) => ({
      id: l.id,
      variant_id: l.variant_id,
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
      product_status: l.product_status,
    })),
    item_count: goods.reduce((n, l) => n + l.quantity, 0),
    subtotal_minor: subtotalMinor,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: totalMinor,
    currency: 'usd',
    notices: priceNoticesFor(lines),
    delivery_known: Boolean(cart.shipping_method && cart.shipping_address),
  };
}

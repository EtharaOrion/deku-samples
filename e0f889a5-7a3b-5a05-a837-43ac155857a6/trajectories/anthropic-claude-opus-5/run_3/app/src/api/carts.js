import { many, one, query } from '../lib/db.js';
import { taxFor, protectionRungFor, formatMoney } from '../lib/money.js';
import { availabilityOf, deliveryMethod } from '../lib/domain.js';
import { randomToken } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';

export const CART_COOKIE = 'vela_cart';

export async function createCart(customerId = null) {
  const token = randomToken(24);
  const row = await one(
    `INSERT INTO cart (token, customer_id) VALUES ($1,$2) RETURNING *`,
    [token, customerId],
  );
  return row;
}

export async function findCartByToken(token) {
  if (!token) return null;
  return one(`SELECT * FROM cart WHERE token = $1 AND expires_at > now()`, [token]);
}

/** A visitor never reads another cart: the opaque token is the only handle. */
export async function getOrCreateCart(token, customerId = null) {
  const found = await findCartByToken(token);
  if (found) return found;
  return createCart(customerId);
}

export async function cartLines(cartId) {
  return many(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.inventory_policy,
            p.handle, p.title, p.subtitle, p.kind, p.status AS product_status,
            COALESCE(il.available, 0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.created_at, cl.id`,
    [cartId],
  );
}

/**
 * Build the whole cart view. Every cart read compares the price snapshotted at
 * add time to the current price; a difference renders as a notice naming the
 * item, the old price and the new.
 */
export async function cartView(cart) {
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
        message: `The price of ${l.title} changed from ${formatMoney(l.unit_price_minor)} to ${formatMoney(l.current_price_minor)} since you added it.`,
      });
    }
    const avail = availabilityOf({
      productStatus: l.product_status,
      available: l.available,
      inventoryPolicy: l.inventory_policy,
    });
    if (!avail.buyable) {
      notices.push({
        kind: 'availability_change',
        sku: l.sku,
        line_id: l.id,
        title: l.title,
        message: `${l.title} is ${avail.state === 'discontinued' ? 'no longer sold' : 'sold out'} since you added it.`,
      });
    } else if (l.quantity > l.available) {
      notices.push({
        kind: 'availability_change',
        sku: l.sku,
        line_id: l.id,
        title: l.title,
        message: `Only ${l.available} of ${l.title} remain. Reduce the quantity to continue.`,
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
    lines: lines.map((l) => ({
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
      product_status: l.product_status,
    })),
    item_count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal_minor: subtotal,
    protection_rung: rung
      ? { sku: rung.sku, price_minor: rung.price_minor, enabled: Boolean(cart.protection_enabled) }
      : null,
    protection_minor: protectionMinor,
    shipping_minor: shipping,
    tax_minor: tax,
    total_minor: total,
    notices,
    // The order is refused if a line changed since the cart was last shown.
    priced_fingerprint: fingerprint(lines),
  };
}

/** A stable fingerprint of what the cart was last shown at. */
export function fingerprint(lines) {
  return lines
    .map((l) => `${l.sku}:${l.quantity}:${l.unit_price_minor}`)
    .sort()
    .join('|');
}

export async function requireCartByToken(token) {
  const cart = await findCartByToken(token);
  if (!cart) throw notFound('That cart does not exist.', 'cart_not_found');
  return cart;
}

export async function touchCart(cartId) {
  await query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cartId]);
}

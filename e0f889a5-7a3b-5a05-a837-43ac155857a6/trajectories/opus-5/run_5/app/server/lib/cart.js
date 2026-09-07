import { createHash } from 'node:crypto';
import { many, one, query } from './db.js';
import { newOpaqueToken } from './auth.js';
import { formatMinor, protectionRungFor, taxFor } from './money.js';
import { availabilityFor } from './catalogue.js';
import { badRequest, notFound } from './errors.js';

export const SHIPPING_METHODS = [
  { code: 'Standard', label: 'Standard', price_minor: 0, window: '5 to 7 days' },
  { code: 'Express', label: 'Express', price_minor: 2500, window: '2 days' },
];

export const SHIPPING_ZONE = { code: 'us-domestic', country: 'US' };

export function shippingMethod(code) {
  return SHIPPING_METHODS.find((m) => m.code.toLowerCase() === String(code || '').toLowerCase()) ?? null;
}

export async function createCart({ customerId = null, email = null } = {}) {
  const token = newOpaqueToken();
  const row = await one(
    `INSERT INTO cart (token, customer_id, email) VALUES ($1,$2,$3) RETURNING *`,
    [token, customerId, email],
  );
  return row;
}

export async function cartByToken(token) {
  if (!token) return null;
  return one(`SELECT * FROM cart WHERE token = $1 AND expires_at > now()`, [token]);
}

export async function cartLines(cartId) {
  return many(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            v.inventory_policy,
            p.handle, p.title AS product_title, p.status AS product_status, p.kind,
            COALESCE(i.available, 0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.created_at ASC, cl.id ASC`,
    [cartId],
  );
}

/**
 * Build the whole cart view. Every read compares the snapshotted unit price to
 * the current price, so a change renders as a notice naming item, old and new.
 */
export async function readCart(cart) {
  const lines = await cartLines(cart.id);
  const notices = [];

  const shaped = lines.map((l) => {
    const changed = l.unit_price_minor !== l.current_price_minor;
    if (changed) {
      notices.push({
        kind: 'price_change',
        sku: l.sku,
        title: l.product_title,
        was_minor: l.unit_price_minor,
        now_minor: l.current_price_minor,
        message: `The price of ${l.product_title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(l.current_price_minor)} since you added it.`,
      });
    }
    const availability = availabilityFor({
      productStatus: l.product_status,
      available: l.available,
      inventoryPolicy: l.inventory_policy,
    });
    if (!availability.purchasable) {
      notices.push({
        kind: 'availability_change',
        sku: l.sku,
        title: l.product_title,
        message:
          availability.state === 'discontinued'
            ? `${l.product_title} is no longer sold. Remove it to carry on.`
            : `${l.product_title} sold out since you added it. Remove it to carry on.`,
      });
    } else if (l.quantity > l.available) {
      notices.push({
        kind: 'availability_change',
        sku: l.sku,
        title: l.product_title,
        message: `Only ${l.available} of ${l.product_title} left. Lower the quantity to carry on.`,
      });
    }

    return {
      id: l.id,
      variant_id: l.variant_id,
      sku: l.sku,
      handle: l.handle,
      title: l.product_title,
      variant_summary: l.option_value,
      kind: l.kind,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      current_price_minor: l.current_price_minor,
      line_total_minor: l.unit_price_minor * l.quantity,
      available: l.available,
      availability,
      price_changed: changed,
    };
  });

  const subtotal_minor = shaped.reduce((sum, l) => sum + l.line_total_minor, 0);
  const rung = protectionRungFor(subtotal_minor);
  const protection_minor = cart.protection_enabled && rung ? rung.price_minor : 0;

  const method = shippingMethod(cart.shipping_method);
  const shipping_minor = method ? method.price_minor : 0;
  // Shipment protection is excluded from tax.
  const tax_minor = taxFor(subtotal_minor);
  const total_minor = subtotal_minor + protection_minor + shipping_minor + tax_minor;

  return {
    token: cart.token,
    email: cart.email,
    lines: shaped,
    notices,
    item_count: shaped.reduce((n, l) => n + l.quantity, 0),
    subtotal_minor,
    protection_enabled: cart.protection_enabled,
    protection_rung: rung
      ? {
          sku: rung.sku,
          price_minor: rung.price_minor,
          label: `Protect this shipment against loss, theft and damage for ${formatMinor(rung.price_minor)}`,
        }
      : null,
    protection_minor,
    shipping_method: method ? method.code : null,
    shipping_minor,
    tax_minor,
    total_minor,
    currency: 'usd',
    shipping_address: cart.shipping_address ?? null,
    marketing_consent: cart.marketing_consent,
    has_address: Boolean(cart.shipping_address && cart.email),
    price_signature: priceSignature(shaped),
    priced_signature: cart.priced_signature ?? null,
  };
}

/**
 * A signature over every line's variant, quantity and snapshotted price. The
 * checkout stores it when it shows the final figure; placing compares against it,
 * so an order can never be placed on a total the person was not shown.
 */
export function priceSignature(lines) {
  const material = lines
    .map((l) => `${l.variant_id}:${l.quantity}:${l.unit_price_minor}`)
    .sort()
    .join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

export async function touchCart(cartId) {
  await query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cartId]);
}

export function validateQuantity(q) {
  const n = Number(q);
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    throw badRequest('invalid_quantity', 'Quantity is between 1 and 10.');
  }
  return n;
}

export async function requireLine(cartId, lineId) {
  const line = await one(`SELECT * FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cartId]);
  if (!line) throw notFound('That line is not in your cart.', 'line_not_found');
  return line;
}

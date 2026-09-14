import { q, one } from '../db/index.js';
import { taxOf } from '../util.js';
import { ApiError } from './helpers.js';

// ---- Cart reads -------------------------------------------------------------

export async function cartLines(cartId) {
  return q(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            v.inventory_policy, p.id AS product_id, p.handle, p.title AS product_title, p.kind AS product_kind, p.status AS product_status,
            il.available, il.committed
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = cl.variant_id
     WHERE cl.cart_id = $1
     ORDER BY cl.id`,
    [cartId]
  );
}

export async function cartState(cartId) {
  const cart = await one('SELECT * FROM cart WHERE id = $1', [cartId]);
  const lines = await cartLines(cartId);
  const prot = await one('SELECT enabled FROM cart_protection WHERE cart_id = $1', [cartId]);
  const protectionEnabled = !!prot?.enabled;
  const notices = [];
  let subtotal = 0;
  for (const l of lines) {
    subtotal += l.quantity * l.current_price_minor;
    if (l.unit_price_minor !== l.current_price_minor) {
      notices.push({
        kind: 'price_change',
        code: 'price_changed',
        sku: l.sku,
        item: l.product_title,
        old_minor: l.unit_price_minor,
        new_minor: l.current_price_minor,
        message: `The price of ${l.product_title} changed from ${money(l.unit_price_minor)} to ${money(l.current_price_minor)} since you added it.`,
      });
    }
  }
  const rung = protectionRung(subtotal);
  const protection = protectionEnabled && rung ? rung.price_minor : 0;
  const shipping = cart.shipping_minor || 0;
  const method = await one(
    `SELECT dm.* FROM delivery_method dm WHERE lower(dm.title) = lower($1)`,
    [cart.shipping_method || '']
  );
  const address = cart.shipping_address || null;
  const taxable = subtotal; // protection is excluded from tax
  const tax = address ? taxOf(taxable) : null;
  const total = subtotal + protection + shipping + (tax || 0);
  return {
    cart,
    lines,
    notices,
    subtotal_minor: subtotal,
    protection: { enabled: protectionEnabled, rung: rung ? { sku: rung.sku, price_minor: rung.price_minor, covers_minor: rung.covers_minor } : null },
    shipping_minor: shipping,
    shipping_method: cart.shipping_method || null,
    shipping_address: address,
    email: cart.email,
    tax_minor: tax,
    total_minor: total,
  };
}

function money(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// ---- Protection rungs -------------------------------------------------------

export function protectionRung(subtotalMinor) {
  if (subtotalMinor < 1) return null;
  if (subtotalMinor <= 9999) return { sku: 'VELA-PROTECT-1', price_minor: 98, covers_minor: 9999 };
  if (subtotalMinor <= 49999) return { sku: 'VELA-PROTECT-2', price_minor: 298, covers_minor: 49999 };
  if (subtotalMinor <= 99999) return { sku: 'VELA-PROTECT-3', price_minor: 598, covers_minor: 99999 };
  return { sku: 'VELA-PROTECT-4', price_minor: 1198, covers_minor: null };
}

export async function variantBySku(sku) {
  return one(
    `SELECT v.*, p.handle, p.title AS product_title, p.kind AS product_kind, p.status AS product_status, p.support_until,
            il.available, il.committed
     FROM variant v JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE upper(v.sku) = upper($1)`,
    [sku]
  );
}

export async function assertVariantPurchasable(v) {
  if (!v) throw new ApiError(404, 'unknown_variant', 'We do not sell that item.');
  if (v.product_status === 'discontinued') {
    throw new ApiError(409, 'product_discontinued', `${v.product_title} is no longer sold.`);
  }
  if (v.inventory_policy === 'deny' && (v.available ?? 0) <= 0) {
    throw new ApiError(409, 'sold_out', `${v.product_title} is sold out.`);
  }
}

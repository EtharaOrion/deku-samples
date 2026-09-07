// Cart pricing. Every figure is derived from the lines beneath it, never printed
// from a stored total.
import { formatMinor, taxFor, protectionRungFor } from './money.mjs';
import { randomToken } from './auth.mjs';
import { notFound } from './errors.mjs';

export const PROTECTION_HANDLE = 'protection';

export async function createCart(c, { customerId = null, email = null } = {}) {
  const token = randomToken(24);
  const { rows: [cart] } = await c.query(
    'INSERT INTO cart (token, customer_id, email) VALUES ($1,$2,$3) RETURNING *',
    [token, customerId, email],
  );
  return cart;
}

export async function findCartByToken(c, token) {
  if (!token) return null;
  const { rows } = await c.query('SELECT * FROM cart WHERE token = $1 AND expires_at > now()', [token]);
  return rows[0] || null;
}

export async function cartLines(c, cartId) {
  const { rows } = await c.query(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            cl.previous_price_minor, cl.created_at,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.inventory_policy,
            p.handle, p.title, p.subtitle, p.kind, p.status AS product_status, p.support_until,
            COALESCE(il.available, 0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.created_at, cl.id`,
    [cartId],
  );
  return rows;
}

/**
 * The whole shape a cart read returns. Every read compares the snapshotted unit
 * price to the current price and renders a notice naming the item and both prices.
 */
export async function readCart(c, cart) {
  const lines = await cartLines(c, cart.id);
  const notices = [];

  const shaped = lines.map((l) => {
    // A price that moved since the line was added, whether it is still stale or
    // has just been re-priced by a refused checkout. The notice must survive
    // being ignored, so it persists until the line is touched again.
    const movedFrom =
      l.unit_price_minor !== l.current_price_minor ? l.unit_price_minor
      : l.previous_price_minor !== null && l.previous_price_minor !== l.current_price_minor ? l.previous_price_minor
      : null;

    if (movedFrom !== null) {
      notices.push({
        kind: 'price_change',
        sku: l.sku,
        title: l.title,
        old_price_minor: movedFrom,
        new_price_minor: l.current_price_minor,
        message: `The price of ${l.title} changed from ${formatMinor(movedFrom)} to ${formatMinor(l.current_price_minor)} since you added it.`,
      });
    }
    if (l.available < l.quantity && l.inventory_policy === 'deny') {
      notices.push({
        kind: 'availability_change',
        sku: l.sku,
        title: l.title,
        available: l.available,
        message:
          l.available === 0
            ? `${l.title} sold out since you added it.`
            : `Only ${l.available} of ${l.title} remain, and you have ${l.quantity} in your cart.`,
      });
    }
    return {
      id: Number(l.id),
      variant_id: Number(l.variant_id),
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
    };
  });

  // Shipment protection is excluded from tax and never listed in the catalogue.
  const goods = shaped.filter((l) => l.kind !== 'protection');
  const subtotalGoods = goods.reduce((s, l) => s + l.total_minor, 0);
  const rung = protectionRungFor(subtotalGoods);
  const protectionLine = shaped.find((l) => l.kind === 'protection') || null;
  const protectionMinor = protectionLine ? protectionLine.total_minor : 0;

  const shipping = await shippingMinorFor(c, cart.shipping_method);
  const tax = taxFor(subtotalGoods);
  const subtotal = subtotalGoods + protectionMinor;
  const total = subtotal + shipping + tax;

  return {
    token: cart.token,
    email: cart.email,
    lines: shaped.filter((l) => l.kind !== 'protection'),
    protection_line: protectionLine,
    protection_enabled: Boolean(protectionLine),
    protection_rung: rung
      ? { sku: rung.sku, price_minor: rung.price_minor, label: `Protect this shipment against loss, theft and damage for ${formatMinor(rung.price_minor)}` }
      : null,
    shipping_method: cart.shipping_method,
    shipping_address: cart.shipping_address,
    marketing_consent: cart.marketing_consent,
    subtotal_minor: subtotal,
    goods_subtotal_minor: subtotalGoods,
    protection_minor: protectionMinor,
    shipping_minor: shipping,
    tax_minor: tax,
    total_minor: total,
    currency: 'usd',
    item_count: goods.reduce((s, l) => s + l.quantity, 0),
    notices,
    has_blocking_notice: notices.length > 0,
  };
}

export async function shippingMinorFor(c, methodCode) {
  if (!methodCode) return 0;
  const { rows } = await c.query('SELECT price_minor FROM shipping_method WHERE code = $1', [methodCode]);
  return rows[0] ? rows[0].price_minor : 0;
}

export async function shippingMethods(c) {
  const { rows } = await c.query(
    `SELECT sm.code, sm.title, sm.price_minor, sm.window_text
       FROM shipping_method sm JOIN shipping_zone sz ON sz.id = sm.zone_id
      WHERE sz.code = 'us-domestic' ORDER BY sm.position`,
  );
  return rows;
}

/** Keep the protection line in step with the rung the subtotal selects. */
export async function syncProtection(c, cart) {
  const lines = await cartLines(c, cart.id);
  const goods = lines.filter((l) => l.kind !== 'protection');
  const existing = lines.find((l) => l.kind === 'protection');
  const subtotal = goods.reduce((s, l) => s + l.unit_price_minor * l.quantity, 0);
  const rung = protectionRungFor(subtotal);

  if (!cart.protection_enabled || !rung) {
    if (existing) await c.query('DELETE FROM cart_line WHERE id = $1', [existing.id]);
    return;
  }

  const { rows: [variant] } = await c.query('SELECT id, price_minor FROM variant WHERE sku = $1', [rung.sku]);
  if (!variant) return;

  if (existing && Number(existing.variant_id) !== Number(variant.id)) {
    await c.query('DELETE FROM cart_line WHERE id = $1', [existing.id]);
  }
  await c.query(
    `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
     VALUES ($1,$2,1,$3)
     ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = 1, unit_price_minor = EXCLUDED.unit_price_minor`,
    [cart.id, variant.id, variant.price_minor],
  );
}

export async function touchCart(c, cartId) {
  await c.query('UPDATE cart SET updated_at = now() WHERE id = $1', [cartId]);
}

export async function requireCart(c, token) {
  const cart = await findCartByToken(c, token);
  if (!cart) throw notFound('That cart does not exist.');
  return cart;
}

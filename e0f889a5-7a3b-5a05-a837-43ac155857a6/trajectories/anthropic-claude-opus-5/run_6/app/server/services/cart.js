import { many, one, query } from '../db.js';
import { randomToken } from '../passwords.js';
import { badRequest, notFound } from '../errors.js';
import { formatMinor, protectionRungFor, taxFor } from '../money.js';
import { deliveryMethods, getVariantBySku } from './catalogue.js';

export async function createCart(customerId = null) {
  const token = randomToken(24);
  const row = await one(
    `INSERT INTO cart (token, customer_id) VALUES ($1, $2)
     RETURNING id, token, customer_id, email, marketing_consent, shipping_address, shipping_method, created_at, updated_at, expires_at`,
    [token, customerId],
  );
  return row;
}

export async function cartByToken(token) {
  if (!token) return null;
  return one(
    `SELECT id, token, customer_id, email, marketing_consent, shipping_address, shipping_method,
            created_at, updated_at, expires_at
       FROM cart WHERE token = $1 AND expires_at > now()`,
    [token],
  );
}

export async function ensureCart(token, customerId = null) {
  const existing = await cartByToken(token);
  if (existing) {
    if (customerId && !existing.customer_id) {
      await query('UPDATE cart SET customer_id = $2, updated_at = now() WHERE id = $1', [existing.id, customerId]);
      existing.customer_id = customerId;
    }
    return existing;
  }
  return createCart(customerId);
}

async function rawLines(cartId) {
  return many(
    `SELECT l.id, l.variant_id, l.quantity, l.unit_price_minor, l.created_at,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.inventory_policy,
            COALESCE(i.available, 0) AS available,
            p.handle, p.title AS product_title, p.kind AS product_kind, p.status AS product_status
       FROM cart_line l
       JOIN variant v ON v.id = l.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE l.cart_id = $1
      ORDER BY l.created_at, l.id`,
    [cartId],
  );
}

export function lineTitle(row) {
  return row.product_kind === 'protection' ? 'Shipment protection' : `${row.product_title} — ${row.option_value}`;
}

export async function readCart(cart) {
  const rows = await rawLines(cart.id);
  const lines = rows.map((r) => ({
    id: String(r.id),
    variant_id: String(r.variant_id),
    sku: r.sku,
    handle: r.handle,
    kind: r.product_kind,
    product_title: r.product_title,
    option_value: r.option_value,
    title: lineTitle(r),
    quantity: r.quantity,
    unit_price_minor: r.unit_price_minor,
    current_price_minor: r.current_price_minor,
    total_minor: r.unit_price_minor * r.quantity,
    available: r.available,
    removable: r.product_kind !== 'protection',
  }));

  const notices = [];
  for (const l of lines) {
    if (l.current_price_minor !== l.unit_price_minor) {
      notices.push({
        code: 'price_changed',
        sku: l.sku,
        title: l.title,
        old_price_minor: l.unit_price_minor,
        new_price_minor: l.current_price_minor,
        message: `The price of ${l.kind === 'protection' ? 'Shipment protection' : l.product_title} changed from ${formatMinor(
          l.unit_price_minor,
        )} to ${formatMinor(l.current_price_minor)} since you added it.`,
      });
    }
    if (l.kind !== 'protection' && l.available < l.quantity) {
      notices.push({
        code: 'availability_changed',
        sku: l.sku,
        title: l.title,
        available: l.available,
        message:
          l.available === 0
            ? `${l.product_title} — ${l.option_value} sold out since you added it.`
            : `Only ${l.available} of ${l.product_title} — ${l.option_value} remain, and you have ${l.quantity} in your cart.`,
      });
    }
  }

  const subtotalMinor = lines.reduce((s, l) => s + l.total_minor, 0);
  const goodsSubtotalMinor = lines.filter((l) => l.kind !== 'protection').reduce((s, l) => s + l.total_minor, 0);
  const protectionLine = lines.find((l) => l.kind === 'protection') || null;
  const rung = protectionRungFor(goodsSubtotalMinor);

  const methods = await deliveryMethods('US');
  const method = cart.shipping_method ? methods.find((m) => m.code === cart.shipping_method) || null : null;
  const shippingMinor = method ? method.price_minor : 0;
  const taxMinor = taxFor(goodsSubtotalMinor);

  return {
    token: cart.token,
    customer_id: cart.customer_id ? String(cart.customer_id) : null,
    email: cart.email,
    marketing_consent: cart.marketing_consent,
    shipping_address: cart.shipping_address,
    shipping_method: cart.shipping_method,
    shipping_method_title: method ? method.title : null,
    lines,
    item_count: lines.filter((l) => l.kind !== 'protection').reduce((s, l) => s + l.quantity, 0),
    currency: 'usd',
    subtotal_minor: subtotalMinor,
    goods_subtotal_minor: goodsSubtotalMinor,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: subtotalMinor + shippingMinor + taxMinor,
    protection_enabled: Boolean(protectionLine),
    protection_rung: { sku: rung.sku, price_minor: rung.price_minor },
    delivery_methods: methods.map((m) => ({
      code: m.code,
      title: m.title,
      price_minor: m.price_minor,
      window_label: m.window_label,
    })),
    notices,
    estimated: !cart.shipping_address,
  };
}

export async function addLine(cart, { sku, quantity }) {
  const qty = Number.parseInt(quantity ?? 1, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number from 1 to 10.');
  }
  const variant = await getVariantBySku(String(sku || ''));
  if (!variant) throw notFound('That item does not exist.');
  if (variant.product_kind === 'protection') {
    throw badRequest('protection_not_addable', 'Shipment protection is added with the protection control.');
  }
  if (variant.product_status === 'discontinued') {
    throw badRequest('discontinued', 'We no longer sell this.');
  }
  if (variant.inventory_policy === 'deny' && variant.available < 1) {
    throw badRequest('sold_out', 'That option is sold out.');
  }

  const existing = await one('SELECT id, quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2', [
    cart.id,
    variant.id,
  ]);
  const target = Math.min(10, (existing ? existing.quantity : 0) + qty);
  if (variant.inventory_policy === 'deny' && target > variant.available) {
    throw badRequest('not_enough_stock', `Only ${variant.available} left.`);
  }
  if (existing) {
    await query('UPDATE cart_line SET quantity = $2 WHERE id = $1', [existing.id, target]);
  } else {
    await query(
      `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1, $2, $3, $4)`,
      [cart.id, variant.id, target, variant.price_minor],
    );
  }
  await touch(cart.id);
  await resyncProtection(cart.id);
}

export async function updateLine(cart, lineId, quantity) {
  const qty = Number.parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty < 0 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number from 1 to 10.');
  }
  const line = await one(
    `SELECT l.id, l.variant_id, v.inventory_policy, COALESCE(i.available, 0) AS available, p.kind
       FROM cart_line l JOIN variant v ON v.id = l.variant_id JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE l.id = $1 AND l.cart_id = $2`,
    [lineId, cart.id],
  );
  if (!line) throw notFound('That line is not in your cart.');
  if (qty === 0) {
    await query('DELETE FROM cart_line WHERE id = $1', [line.id]);
  } else {
    if (line.inventory_policy === 'deny' && qty > line.available) {
      throw badRequest('not_enough_stock', `Only ${line.available} left.`);
    }
    await query('UPDATE cart_line SET quantity = $2 WHERE id = $1', [line.id, qty]);
  }
  await touch(cart.id);
  await resyncProtection(cart.id);
}

export async function removeLine(cart, lineId) {
  const line = await one('SELECT id FROM cart_line WHERE id = $1 AND cart_id = $2', [lineId, cart.id]);
  if (!line) throw notFound('That line is not in your cart.');
  await query('DELETE FROM cart_line WHERE id = $1', [line.id]);
  await touch(cart.id);
  await resyncProtection(cart.id);
}

export async function setProtection(cart, enabled) {
  if (!enabled) {
    await query(
      `DELETE FROM cart_line l USING variant v, product p
        WHERE l.variant_id = v.id AND v.product_id = p.id AND p.kind = 'protection' AND l.cart_id = $1`,
      [cart.id],
    );
    await touch(cart.id);
    return;
  }
  const rows = await rawLines(cart.id);
  const goods = rows.filter((r) => r.product_kind !== 'protection').reduce((s, r) => s + r.unit_price_minor * r.quantity, 0);
  if (goods <= 0) throw badRequest('empty_cart', 'Add something to protect first.');
  const rung = protectionRungFor(goods);
  const variant = await getVariantBySku(rung.sku);
  await query(
    `DELETE FROM cart_line l USING variant v, product p
      WHERE l.variant_id = v.id AND v.product_id = p.id AND p.kind = 'protection' AND l.cart_id = $1`,
    [cart.id],
  );
  await query(
    `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1, $2, 1, $3)`,
    [cart.id, variant.id, variant.price_minor],
  );
  await touch(cart.id);
}

// Protection follows the rung the cart is currently on.
async function resyncProtection(cartId) {
  const rows = await rawLines(cartId);
  const protectionLine = rows.find((r) => r.product_kind === 'protection');
  if (!protectionLine) return;
  const goods = rows.filter((r) => r.product_kind !== 'protection').reduce((s, r) => s + r.unit_price_minor * r.quantity, 0);
  if (goods <= 0) {
    await query('DELETE FROM cart_line WHERE id = $1', [protectionLine.id]);
    return;
  }
  const rung = protectionRungFor(goods);
  if (protectionLine.sku !== rung.sku) {
    const variant = await getVariantBySku(rung.sku);
    await query('UPDATE cart_line SET variant_id = $2, unit_price_minor = $3 WHERE id = $1', [
      protectionLine.id,
      variant.id,
      variant.price_minor,
    ]);
  }
}

export async function setDelivery(cart, { email, shipping_address, shipping_method, marketing_consent }) {
  const patch = [];
  const params = [cart.id];
  if (email !== undefined) {
    const clean = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw badRequest('invalid_email', 'Email is required.');
    params.push(clean.toLowerCase());
    patch.push(`email = $${params.length}`);
  }
  if (marketing_consent !== undefined) {
    params.push(Boolean(marketing_consent));
    patch.push(`marketing_consent = $${params.length}`);
  }
  if (shipping_address !== undefined) {
    const a = shipping_address || {};
    for (const [field, label] of [
      ['name', 'Name'],
      ['line1', 'Address'],
      ['city', 'City'],
      ['region', 'Region'],
      ['postal_code', 'Postal code'],
      ['country', 'Country'],
    ]) {
      if (!String(a[field] || '').trim()) throw badRequest('missing_field', `${label} is required.`, { field });
    }
    params.push(
      JSON.stringify({
        name: String(a.name).trim(),
        line1: String(a.line1).trim(),
        line2: String(a.line2 || '').trim(),
        city: String(a.city).trim(),
        region: String(a.region).trim(),
        postal_code: String(a.postal_code).trim(),
        country: String(a.country).trim().toUpperCase(),
        phone: String(a.phone || '').trim(),
      }),
    );
    patch.push(`shipping_address = $${params.length}::jsonb`);
  }
  if (shipping_method !== undefined) {
    const code = String(shipping_method || '').toLowerCase();
    const methods = await deliveryMethods('US');
    if (!methods.some((m) => m.code === code)) throw badRequest('invalid_method', 'Choose a delivery method.');
    params.push(code);
    patch.push(`shipping_method = $${params.length}`);
  }
  if (!patch.length) return;
  await query(`UPDATE cart SET ${patch.join(', ')}, updated_at = now() WHERE id = $1`, params);
}

async function touch(cartId) {
  await query('UPDATE cart SET updated_at = now() WHERE id = $1', [cartId]);
}

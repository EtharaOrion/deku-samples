import { query, withTransaction } from './db.mjs';
import { newOpaqueToken } from './tokens.mjs';
import { formatMinor, protectionRungFor, taxOn } from './money.mjs';
import { availabilityFor } from './catalogue.mjs';
import { badRequest, conflict, notFound } from './errors.mjs';

export async function createCart({ customerId = null, email = null } = {}) {
  const token = newOpaqueToken(24);
  const { rows } = await query(
    `INSERT INTO cart (token, customer_id, email) VALUES ($1,$2,$3) RETURNING *`,
    [token, customerId, email]);
  return rows[0];
}

export async function findCartByToken(token) {
  if (!token) return null;
  const { rows } = await query(`SELECT * FROM cart WHERE token = $1 AND expires_at > now()`, [token]);
  return rows[0] || null;
}

export async function getOrCreateCart(token, { customerId = null } = {}) {
  const found = await findCartByToken(token);
  if (found) {
    if (customerId && !found.customer_id) {
      await query(`UPDATE cart SET customer_id = $1, updated_at = now() WHERE id = $2`, [customerId, found.id]);
      found.customer_id = customerId;
    }
    return found;
  }
  return createCart({ customerId });
}

async function loadLines(cartId) {
  const { rows } = await query(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor, cl.created_at,
            v.sku, v.option_value, v.price_minor AS current_price_minor, v.currency,
            p.handle, p.title, p.kind, p.status AS product_status,
            COALESCE(i.available,0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.id ASC`, [cartId]);
  return rows;
}

/**
 * Every cart read compares the snapshotted unit price to the current price and
 * renders a notice naming the item, the old price and the new.
 */
export function noticesFor(lines) {
  const notices = [];
  for (const l of lines) {
    if (Number(l.unit_price_minor) !== Number(l.current_price_minor)) {
      notices.push({
        kind: 'price_changed',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        was_minor: Number(l.unit_price_minor),
        now_minor: Number(l.current_price_minor),
        message: `The price of ${l.title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(l.current_price_minor)} since you added it.`,
      });
    }
    const availability = availabilityFor({ status: l.product_status }, l);
    if (!availability.purchasable) {
      notices.push({
        kind: 'unavailable',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        message: `${l.title} is no longer available.`,
      });
    } else if (Number(l.available) < Number(l.quantity)) {
      notices.push({
        kind: 'quantity_unavailable',
        line_id: l.id,
        sku: l.sku,
        title: l.title,
        message: `Only ${l.available} of ${l.title} remain. Lower the quantity to continue.`,
      });
    }
  }
  return notices;
}

/** Everything the cart is, derived from its lines. Nothing here is stored. */
export async function readCart(cart) {
  const lines = await loadLines(cart.id);
  const notices = noticesFor(lines);

  const items = lines.map((l) => ({
    id: l.id,
    variant_id: l.variant_id,
    sku: l.sku,
    handle: l.handle,
    title: l.title,
    option_value: l.option_value,
    kind: l.kind,
    quantity: Number(l.quantity),
    unit_price_minor: Number(l.unit_price_minor),
    current_price_minor: Number(l.current_price_minor),
    line_total_minor: Number(l.unit_price_minor) * Number(l.quantity),
    available: Number(l.available),
    product_status: l.product_status,
  }));

  const subtotal_minor = items.reduce((n, l) => n + l.line_total_minor, 0);
  const rung = protectionRungFor(subtotal_minor);
  const protection_minor = cart.protection_enabled && rung ? rung.price_minor : 0;

  const method = cart.shipping_method
    ? (await query(
        `SELECT m.code, m.title, m.price_minor, m.window_text FROM shipping_method m
           JOIN shipping_zone z ON z.id = m.zone_id
          WHERE z.code = 'us-domestic' AND m.code = $1`, [cart.shipping_method])).rows[0]
    : null;
  const shipping_minor = method ? Number(method.price_minor) : 0;

  // Shipment protection is excluded from tax.
  const tax_minor = taxOn(subtotal_minor);
  const total_minor = subtotal_minor + protection_minor + shipping_minor + tax_minor;

  return {
    token: cart.token,
    id: cart.id,
    email: cart.email,
    customer_id: cart.customer_id,
    lines: items,
    notices,
    currency: 'usd',
    protection_enabled: cart.protection_enabled,
    protection_rung: rung ? { ...rung, enabled: cart.protection_enabled } : null,
    protection_minor,
    shipping_method: cart.shipping_method,
    shipping_method_title: method ? method.title : null,
    shipping_address: cart.shipping_address,
    marketing_consent: cart.marketing_consent,
    subtotal_minor,
    shipping_minor,
    tax_minor,
    total_minor,
    item_count: items.reduce((n, l) => n + l.quantity, 0),
    priced: Boolean(cart.shipping_method && cart.shipping_address),
  };
}

export async function addLine(cart, { sku, quantity }) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number between 1 and 10.');
  }
  const variant = await (await import('./catalogue.mjs')).getVariantBySku(sku);
  if (!variant) throw notFound('That item does not exist.', 'variant_not_found');
  if (variant.kind === 'protection') {
    throw badRequest('not_purchasable', 'Shipment protection is added from the cart.');
  }
  if (variant.product_status === 'discontinued') {
    throw conflict('discontinued', 'We no longer sell this.');
  }
  if (Number(variant.available) <= 0) {
    throw conflict('sold_out', `${variant.product_title} is sold out.`);
  }

  await withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT id, quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2 FOR UPDATE`,
      [cart.id, variant.id]);
    const already = existing.length ? Number(existing[0].quantity) : 0;
    const next = Math.min(10, already + qty);
    if (next > Number(variant.available)) {
      throw conflict('insufficient_stock', `Only ${variant.available} of ${variant.product_title} remain.`);
    }
    if (existing.length) {
      await client.query(`UPDATE cart_line SET quantity = $1 WHERE id = $2`, [next, existing[0].id]);
    } else {
      // The unit price is snapshotted at add time.
      await client.query(
        `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)`,
        [cart.id, variant.id, next, variant.price_minor]);
    }
    await client.query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  });

  return readCart(cart);
}

export async function updateLine(cart, lineId, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number between 1 and 10.');
  }
  const { rows } = await query(
    `SELECT cl.id, cl.variant_id, p.title, COALESCE(i.available,0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE cl.id = $1 AND cl.cart_id = $2`, [lineId, cart.id]);
  if (!rows.length) throw notFound('That line is not in your cart.', 'line_not_found');
  if (qty > Number(rows[0].available)) {
    throw conflict('insufficient_stock', `Only ${rows[0].available} of ${rows[0].title} remain.`);
  }
  await query(`UPDATE cart_line SET quantity = $1 WHERE id = $2`, [qty, lineId]);
  await query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return readCart(cart);
}

export async function removeLine(cart, lineId) {
  const { rowCount } = await query(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cart.id]);
  if (!rowCount) throw notFound('That line is not in your cart.', 'line_not_found');
  await query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return readCart(cart);
}

export async function setProtection(cart, enabled) {
  await query(`UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE id = $2`,
    [Boolean(enabled), cart.id]);
  const fresh = await findCartByToken(cart.token);
  return readCart(fresh);
}

const REQUIRED_ADDRESS_FIELDS = [
  ['name', 'Name'], ['line1', 'Address'], ['city', 'City'],
  ['region', 'Region'], ['postal_code', 'Postal code'], ['country', 'Country'],
];

export async function setDelivery(cart, { email, shipping_address, shipping_method, marketing_consent }) {
  const patch = {};
  if (email !== undefined) {
    const value = String(email || '').trim();
    if (!value) throw badRequest('email_required', 'Email is required.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
    patch.email = value;
  }
  if (shipping_address !== undefined) {
    const a = shipping_address || {};
    for (const [field, label] of REQUIRED_ADDRESS_FIELDS) {
      if (!String(a[field] || '').trim()) throw badRequest('address_incomplete', `${label} is required.`, { field });
    }
    if (String(a.country).toUpperCase() !== 'US') {
      throw badRequest('country_unsupported', 'We only deliver inside the United States.');
    }
    patch.shipping_address = {
      name: String(a.name).trim(), line1: String(a.line1).trim(), line2: String(a.line2 || '').trim(),
      city: String(a.city).trim(), region: String(a.region).trim(),
      postal_code: String(a.postal_code).trim(), country: 'US', phone: String(a.phone || '').trim(),
    };
  }
  if (shipping_method !== undefined) {
    const code = String(shipping_method || '').trim();
    const { rows } = await query(
      `SELECT m.code FROM shipping_method m JOIN shipping_zone z ON z.id = m.zone_id
        WHERE z.code = 'us-domestic' AND m.code = $1`, [code]);
    if (!rows.length) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');
    patch.shipping_method = code;
  }
  if (marketing_consent !== undefined) patch.marketing_consent = Boolean(marketing_consent);

  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(patch)) {
    params.push(k === 'shipping_address' ? JSON.stringify(v) : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (sets.length) {
    params.push(cart.id);
    await query(`UPDATE cart SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  }
  const fresh = await findCartByToken(cart.token);
  return readCart(fresh);
}

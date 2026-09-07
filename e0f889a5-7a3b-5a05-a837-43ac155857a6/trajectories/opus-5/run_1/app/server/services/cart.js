import { many, one, query, tx } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { formatMinor, protectionRungFor, taxFor } from '../lib/money.js';
import { randomToken } from '../lib/crypto.js';
import { availabilityFor } from './catalogue.js';
import { SHIPPING_METHODS } from '../seed.js';

export function shippingMethod(code) {
  if (!code) return null;
  return SHIPPING_METHODS.find((m) => m.code === String(code).toLowerCase()) || null;
}

export async function createCart(customerId = null) {
  const token = randomToken(24);
  const row = await one(
    'INSERT INTO cart (token, customer_id) VALUES ($1,$2) RETURNING id, token',
    [token, customerId],
  );
  return row;
}

export async function cartByToken(token, { create = false, customerId = null } = {}) {
  if (token) {
    const row = await one('SELECT * FROM cart WHERE token = $1', [token]);
    if (row && !row.converted_order_id) return row;
  }
  if (!create) return null;
  const created = await createCart(customerId);
  return one('SELECT * FROM cart WHERE id = $1', [created.id]);
}

async function cartLineRows(cartId) {
  return many(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor, cl.shown_price_minor, cl.created_at,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            v.inventory_policy, p.id AS product_id, p.handle, p.title AS product_title,
            p.status AS product_status, p.kind, i.available
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level i ON i.variant_id = v.id
     WHERE cl.cart_id = $1
     ORDER BY cl.id`,
    [cartId],
  );
}

// Every cart read compares the price stored at add time to the current price;
// a difference renders as a notice naming the item, the old price and the new.
export function buildCart(cartRow, lineRows) {
  const notices = [];
  const lines = lineRows.map((r) => {
    const unit = Number(r.unit_price_minor);
    const current = Number(r.current_price_minor);
    const available = Number(r.available ?? 0);
    const availability = availabilityFor({
      productStatus: r.product_status,
      available,
      inventoryPolicy: r.inventory_policy,
    });
    if (current !== unit) {
      notices.push({
        kind: 'price_change',
        sku: r.sku,
        line_id: Number(r.id),
        title: r.product_title,
        old_price_minor: unit,
        new_price_minor: current,
        message: `The price of ${r.product_title} changed from ${formatMinor(unit)} to ${formatMinor(current)} since you added it.`,
      });
    }
    if (!availability.purchasable) {
      notices.push({
        kind: 'availability_change',
        sku: r.sku,
        line_id: Number(r.id),
        title: r.product_title,
        message:
          availability.state === 'discontinued'
            ? `${r.product_title} is no longer sold. Remove it to carry on.`
            : `${r.product_title} sold out since you added it. Remove it to carry on.`,
      });
    } else if (available < Number(r.quantity)) {
      notices.push({
        kind: 'availability_change',
        sku: r.sku,
        line_id: Number(r.id),
        title: r.product_title,
        message: `Only ${available} of ${r.product_title} remain. Lower the quantity to carry on.`,
      });
    }
    return {
      id: Number(r.id),
      variant_id: Number(r.variant_id),
      sku: r.sku,
      handle: r.handle,
      title: r.product_title,
      variant_title: r.variant_title,
      option_value: r.option_value,
      kind: r.kind,
      quantity: Number(r.quantity),
      unit_price_minor: unit,
      current_price_minor: current,
      total_minor: unit * Number(r.quantity),
      available,
      availability,
    };
  });

  const subtotal_minor = lines.reduce((s, l) => s + l.total_minor, 0);
  const rung = protectionRungFor(subtotal_minor);
  const protection_enabled = Boolean(cartRow.protection_enabled) && Boolean(rung);
  const protection_minor = protection_enabled && rung ? rung.price_minor : 0;

  const method = shippingMethod(cartRow.shipping_method);
  const shipping_minor = method ? method.price_minor : 0;
  // Shipment protection is excluded from tax.
  const tax_minor = taxFor(subtotal_minor);
  const total_minor = subtotal_minor + protection_minor + shipping_minor + tax_minor;

  return {
    token: cartRow.token,
    email: cartRow.email,
    lines,
    item_count: lines.reduce((s, l) => s + l.quantity, 0),
    notices,
    subtotal_minor,
    protection_rung: rung
      ? { sku: rung.sku, price_minor: rung.price_minor, enabled: protection_enabled,
          label: `Protect this shipment against loss, theft and damage for ${formatMinor(rung.price_minor)}` }
      : null,
    protection_enabled,
    protection_minor,
    shipping_method: method ? method.code : null,
    shipping_method_label: method ? method.label : null,
    shipping_minor,
    tax_minor,
    total_minor,
    currency: 'usd',
    shipping_address: cartRow.shipping_address || null,
    marketing_consent: Boolean(cartRow.marketing_consent),
    estimated: !method || !cartRow.shipping_address,
  };
}

// Reading a cart never changes it. Recording what a reader was actually shown
// is a separate, explicit act, so that placing an order can still tell whether
// a line changed since the cart was last put in front of them.
export async function readCart(cartRow) {
  const lines = await cartLineRows(cartRow.id);
  return buildCart(cartRow, lines);
}

export async function markCartShown(cartId) {
  await query(
    `UPDATE cart_line cl SET shown_price_minor = v.price_minor
     FROM variant v WHERE v.id = cl.variant_id AND cl.cart_id = $1
       AND (cl.shown_price_minor IS DISTINCT FROM v.price_minor)`,
    [cartId],
  );
}

// What the surfaces that actually display a cart use.
export async function showCart(cartRow) {
  const cart = await readCart(cartRow);
  await markCartShown(cartRow.id);
  return cart;
}

export async function addLine(cartRow, sku, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number between 1 and 10.');
  }
  const variant = await one(
    `SELECT v.id, v.price_minor, v.inventory_policy, p.status AS product_status, p.kind, p.title,
            i.available
     FROM variant v JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level i ON i.variant_id = v.id
     WHERE upper(v.sku) = upper($1)`,
    [String(sku || '')],
  );
  if (!variant) throw notFound('That item does not exist.', 'variant_not_found');
  if (variant.kind === 'protection') {
    throw badRequest('protection_not_addable', 'Shipment protection is chosen in the cart rather than added as an item.');
  }
  const availability = availabilityFor({
    productStatus: variant.product_status,
    available: Number(variant.available ?? 0),
    inventoryPolicy: variant.inventory_policy,
  });
  if (!availability.purchasable) {
    throw conflict('not_purchasable', `${variant.title} cannot be bought right now.`);
  }

  await tx(async (c) => {
    const existing = await c.query('SELECT id, quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2', [cartRow.id, variant.id]);
    if (existing.rows.length) {
      const next = Math.min(10, Number(existing.rows[0].quantity) + qty);
      await c.query('UPDATE cart_line SET quantity = $1 WHERE id = $2', [next, existing.rows[0].id]);
    } else {
      // The unit price is snapshotted at add time.
      await c.query(
        'INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1,$2,$3,$4)',
        [cartRow.id, variant.id, qty, Number(variant.price_minor)],
      );
    }
    await c.query('UPDATE cart SET updated_at = now() WHERE id = $1', [cartRow.id]);
  });

  return showCart(cartRow);
}

export async function updateLine(cartRow, lineId, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number between 1 and 10.');
  }
  const line = await one('SELECT * FROM cart_line WHERE id = $1 AND cart_id = $2', [Number(lineId) || 0, cartRow.id]);
  if (!line) throw notFound('That line is not in this cart.', 'line_not_found');

  const stock = await one('SELECT i.available FROM inventory_level i WHERE i.variant_id = $1', [line.variant_id]);
  if (stock && qty > Number(stock.available)) {
    throw conflict('insufficient_stock', `Only ${Number(stock.available)} remain.`, { available: Number(stock.available) });
  }
  await query('UPDATE cart_line SET quantity = $1 WHERE id = $2', [qty, line.id]);
  await query('UPDATE cart SET updated_at = now() WHERE id = $1', [cartRow.id]);
  return showCart(cartRow);
}

export async function removeLine(cartRow, lineId) {
  const line = await one('SELECT * FROM cart_line WHERE id = $1 AND cart_id = $2', [Number(lineId) || 0, cartRow.id]);
  if (!line) throw notFound('That line is not in this cart.', 'line_not_found');
  await query('DELETE FROM cart_line WHERE id = $1', [line.id]);
  await query('UPDATE cart SET updated_at = now() WHERE id = $1', [cartRow.id]);
  return showCart(cartRow);
}

export async function setProtection(cartRow, enabled) {
  await query('UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE id = $2', [Boolean(enabled), cartRow.id]);
  const fresh = await one('SELECT * FROM cart WHERE id = $1', [cartRow.id]);
  return showCart(fresh);
}

const REQUIRED_ADDRESS = [
  ['name', 'Name'],
  ['line1', 'Address'],
  ['city', 'City'],
  ['region', 'Region'],
  ['postal_code', 'Postal code'],
  ['country', 'Country'],
];

export async function setDelivery(cartRow, { email, shipping_address, shipping_method: methodCode, marketing_consent }) {
  const patch = {};
  if (email !== undefined) {
    const value = String(email || '').trim();
    if (!value) throw badRequest('email_required', 'Email is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw badRequest('email_invalid', 'That did not work. Check the email address.');
    patch.email = value.toLowerCase();
  }
  if (marketing_consent !== undefined) patch.marketing_consent = Boolean(marketing_consent);
  if (shipping_address !== undefined && shipping_address !== null) {
    const addr = shipping_address || {};
    for (const [key, label] of REQUIRED_ADDRESS) {
      if (!String(addr[key] || '').trim()) throw badRequest('address_incomplete', `${label} is required.`, { field: key });
    }
    if (String(addr.country).trim().toUpperCase() !== 'US') {
      throw badRequest('country_unsupported', 'We deliver within the United States only.');
    }
    patch.shipping_address = {
      name: String(addr.name).trim(),
      line1: String(addr.line1).trim(),
      line2: String(addr.line2 || '').trim(),
      city: String(addr.city).trim(),
      region: String(addr.region).trim(),
      postal_code: String(addr.postal_code).trim(),
      country: 'US',
      phone: String(addr.phone || '').trim(),
    };
  }
  if (methodCode !== undefined && methodCode !== null && methodCode !== '') {
    const method = shippingMethod(methodCode);
    if (!method) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');
    patch.shipping_method = method.code;
  }

  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(patch)) {
    params.push(key === 'shipping_address' ? JSON.stringify(value) : value);
    sets.push(`${key} = $${params.length}${key === 'shipping_address' ? '::jsonb' : ''}`);
  }
  if (sets.length) {
    params.push(cartRow.id);
    await query(`UPDATE cart SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  }
  const fresh = await one('SELECT * FROM cart WHERE id = $1', [cartRow.id]);
  return showCart(fresh);
}

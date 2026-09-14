import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { errors } from './errors.js';
import { formatUsd, taxFor } from './money.js';
import { methodsForCountry, findMethod, methodByName } from './delivery.js';

// Shipment protection: four rungs chosen from the cart subtotal in minor units.
const PROTECTION_BANDS = [
  { sku: 'VELA-PROTECT-1', priceMinor: 98, from: 1, to: 9999 },
  { sku: 'VELA-PROTECT-2', priceMinor: 298, from: 10000, to: 49999 },
  { sku: 'VELA-PROTECT-3', priceMinor: 598, from: 50000, to: 99999 },
  { sku: 'VELA-PROTECT-4', priceMinor: 1198, from: 100000, to: null }
];

export function newCartToken() {
  return randomBytes(24).toString('hex');
}

export async function findCartByToken(token) {
  if (!token) return null;
  const sql = db();
  const [cart] = await sql`SELECT * FROM cart WHERE token = ${token} LIMIT 1`;
  return cart || null;
}

export async function ensureCart(token, { customerId = null } = {}) {
  const sql = db();
  const existing = token ? await findCartByToken(token) : null;
  if (existing) {
    if (customerId && existing.customerId !== customerId) {
      await sql`UPDATE cart SET customer_id = ${customerId}, updated_at = now() WHERE id = ${existing.id}`;
      existing.customerId = customerId;
    }
    return existing;
  }
  const [created] = await sql`
    INSERT INTO cart (token, customer_id)
    VALUES (${token || newCartToken()}, ${customerId})
    RETURNING *
  `;
  return created;
}

export async function cartLines(cartId) {
  const sql = db();
  return sql`
    SELECT cl.id AS line_id, cl.variant_id, cl.quantity, cl.unit_price_minor,
           v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
           v.inventory_policy, i.available,
           p.id AS product_id, p.handle AS product_handle, p.title AS product_title,
           p.kind AS product_kind, p.status AS product_status, p.support_until
    FROM cart_line cl
    JOIN variant v ON v.id = cl.variant_id
    JOIN product p ON p.id = v.product_id
    JOIN inventory_level i ON i.variant_id = v.id
    WHERE cl.cart_id = ${cartId}
    ORDER BY cl.id ASC
  `;
}

// The rung for a subtotal; protection is never offered on an empty cart.
export function rungForSubtotal(subtotalMinor) {
  const n = Number(subtotalMinor);
  if (n <= 0) return null;
  return PROTECTION_BANDS.find((b) => n >= b.from && (b.to === null || n <= b.to)) || null;
}

export async function protectionVariant(sku) {
  const sql = db();
  const [v] = await sql`SELECT id, sku, title, option_value, price_minor FROM variant WHERE sku = ${sku}`;
  return v || null;
}

export function derivedNotices(lines) {
  const notices = [];
  for (const l of lines) {
    if (Number(l.unitPriceMinor) !== Number(l.currentPriceMinor)) {
      notices.push({
        kind: 'price_changed',
        line_id: l.lineId,
        sku: l.sku,
        item: l.productTitle,
        message: `The price of ${l.productTitle} changed from ${formatUsd(l.unitPriceMinor)} to ${formatUsd(l.currentPriceMinor)} since you added it.`
      });
    }
    if (l.available <= 0) {
      notices.push({
        kind: 'unavailable',
        line_id: l.lineId,
        sku: l.sku,
        item: l.productTitle,
        message: `${l.productTitle} in ${l.optionValue} (${l.sku}) was taken while you were checking out. Remove it to continue.`
      });
    } else if (l.available < l.quantity) {
      notices.push({
        kind: 'low_stock',
        line_id: l.lineId,
        sku: l.sku,
        item: l.productTitle,
        message: `Only ${l.available} of ${l.productTitle} (${l.sku}) are left, so the quantity has to come down.`
      });
    }
  }
  return notices;
}

export async function readCart(cart, { markSeen = false } = {}) {
  const sql = db();
  const lines = await cartLines(cart.id);
  const subtotal = lines.reduce((acc, l) => acc + Number(l.unitPriceMinor) * l.quantity, 0);
  const itemCount = lines.reduce((acc, l) => acc + l.quantity, 0);

  const rung = rungForSubtotal(subtotal);
  const protectionRow = cart.protectionEnabled && rung ? await protectionVariant(rung.sku) : null;
  const protectionPrice = protectionRow ? Number(protectionRow.priceMinor) : 0;

  const address = cart.shippingAddress || null;
  const method = cart.shippingMethod ? findMethod(cart.shippingMethod) : null;
  const country = address ? String(address.country || '').toUpperCase() : null;
  const methods = country ? methodsForCountry(country) : null;

  const shipping = method ? method.priceMinor : null;
  const tax = method ? taxFor(subtotal) : null;
  const total =
    method && shipping !== null && tax !== null
      ? subtotal + protectionPrice + shipping + tax
      : null;

  if (markSeen) {
    await sql`UPDATE cart SET seen_at = now() WHERE id = ${cart.id} AND seen_at IS NULL`;
  }

  const storedNotices = Array.isArray(cart.notices) ? cart.notices : [];

  return {
    token: cart.token,
    email: cart.email || null,
    customer_id: cart.customerId || null,
    marketing_consent: !!cart.marketingConsent,
    shipping_address: address,
    shipping_method: cart.shippingMethod || null,
    shipping_methods: methods,
    lines: lines.map((l) => ({
      id: l.lineId,
      variant_id: l.variantId,
      sku: l.sku,
      title: l.productTitle,
      variant_title: l.variantTitle,
      option_value: l.optionValue,
      product_handle: l.productHandle,
      product_kind: l.productKind,
      product_status: l.productStatus,
      quantity: l.quantity,
      unit_price_minor: Number(l.unitPriceMinor),
      current_price_minor: Number(l.currentPriceMinor),
      line_total_minor: Number(l.unitPriceMinor) * l.quantity,
      available: l.available
    })),
    item_count: itemCount,
    subtotal_minor: subtotal,
    protection: {
      enabled: !!cart.protectionEnabled,
      rung: rung ? { sku: rung.sku, price_minor: rung.priceMinor } : null,
      price_minor: protectionPrice,
      price_display: protectionPrice ? formatUsd(protectionPrice) : null
    },
    shipping_minor: shipping,
    tax_minor: tax,
    total_minor: total,
    notices: [...storedNotices, ...derivedNotices(lines)].filter(
      (n, i, arr) => arr.findIndex((o) => o.message === n.message) === i
    )
  };
}

export async function addLine(cart, sku, quantity) {
  const sql = db();
  const q = normaliseQuantity(quantity);
  const [variant] = await sql`
    SELECT v.id, v.sku, v.price_minor, v.title, p.status AS product_status,
           i.available, v.inventory_policy
    FROM variant v
    JOIN product p ON p.id = v.product_id
    JOIN inventory_level i ON i.variant_id = v.id
    WHERE v.sku = ${sku}
  `;
  if (!variant) throw errors.notFound('We do not sell that item.', 'unknown_sku');
  if (variant.productStatus === 'discontinued') {
    throw errors.conflict('We no longer sell that item.', 'discontinued');
  }
  if (variant.inventoryPolicy === 'deny' && variant.available <= 0) {
    throw errors.conflict(`${variant.title} is sold out.`, 'sold_out');
  }
  const [existing] = await sql`
    SELECT id, quantity FROM cart_line WHERE cart_id = ${cart.id} AND variant_id = ${variant.id}
  `;
  const nextQuantity = Math.min(10, (existing ? existing.quantity : 0) + q);
  if (variant.inventoryPolicy === 'deny' && nextQuantity > variant.available) {
    throw errors.conflict(`Only ${variant.available} of ${variant.title} are left.`, 'insufficient_stock');
  }
  if (existing) {
    await sql`
      UPDATE cart_line SET quantity = ${nextQuantity}, unit_price_minor = ${variant.priceMinor}
      WHERE id = ${existing.id}
    `;
  } else {
    await sql`
      INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
      VALUES (${cart.id}, ${variant.id}, ${nextQuantity}, ${variant.priceMinor})
    `;
  }
  await sql`UPDATE cart SET updated_at = now(), notices = '[]'::jsonb WHERE id = ${cart.id}`;
}

export async function updateLine(cart, lineId, quantity) {
  const sql = db();
  const q = normaliseQuantity(quantity);
  const [line] = await sql`
    SELECT cl.id, cl.variant_id, i.available, v.title, v.inventory_policy
    FROM cart_line cl
    JOIN variant v ON v.id = cl.variant_id
    JOIN inventory_level i ON i.variant_id = v.id
    WHERE cl.id = ${lineId} AND cl.cart_id = ${cart.id}
  `;
  if (!line) throw errors.notFound('That line is not in this cart.', 'unknown_line');
  if (line.inventoryPolicy === 'deny' && q > line.available) {
    throw errors.conflict(`Only ${line.available} of ${line.title} are left.`, 'insufficient_stock');
  }
  await sql`UPDATE cart_line SET quantity = ${q} WHERE id = ${line.id}`;
  await sql`UPDATE cart SET updated_at = now() WHERE id = ${cart.id}`;
}

export async function removeLine(cart, lineId) {
  const sql = db();
  const rows = await sql`
    DELETE FROM cart_line WHERE id = ${lineId} AND cart_id = ${cart.id} RETURNING id
  `;
  if (rows.length === 0) throw errors.notFound('That line is not in this cart.', 'unknown_line');
  await sql`UPDATE cart SET updated_at = now() WHERE id = ${cart.id}`;
}

export async function setProtection(cart, enabled) {
  const sql = db();
  await sql`
    UPDATE cart SET protection_enabled = ${!!enabled}, updated_at = now() WHERE id = ${cart.id}
  `;
}

function normaliseQuantity(quantity) {
  const n = Number(quantity);
  if (!Number.isInteger(n) || n < 1 || n > 10) {
    throw errors.badRequest('Quantity must be a whole number from 1 to 10.', 'invalid_quantity');
  }
  return n;
}

export async function setDelivery(cart, { email, shippingAddress, shippingMethod }) {
  const sql = db();
  const updates = {};
  if (email !== undefined) {
    if (!isValidEmail(email)) throw errors.badRequest('Email is required.', 'email_required');
    updates.email = String(email).trim().toLowerCase();
  }
  if (shippingAddress !== undefined) {
    const a = shippingAddress || {};
    const required = ['name', 'line1', 'city', 'postalCode', 'country'];
    for (const field of required) {
      if (!a[field] || !String(a[field]).trim()) {
        throw errors.badRequest(`${labelFor(field)} is required.`, `${field}_required`);
      }
    }
    updates.shippingAddress = normaliseAddress(a);
  }
  if (shippingMethod !== undefined) {
    const method = methodByName(shippingMethod) || findMethod(shippingMethod);
    if (!method) throw errors.badRequest('Choose a delivery method.', 'method_required');
    updates.shippingMethod = method.code;
  }
  if (Object.keys(updates).length === 0) return;

  const address = updates.shippingAddress !== undefined ? updates.shippingAddress : cart.shippingAddress;
  if (updates.shippingMethod && address) {
    const country = String(address.country || '').toUpperCase();
    if (!methodsForCountry(country).some((m) => m.code === updates.shippingMethod)) {
      throw errors.badRequest('We ship to the United States only.', 'unsupported_country');
    }
  }

  await sql`
    UPDATE cart SET
      email = ${updates.email !== undefined ? updates.email : cart.email},
      shipping_address = ${updates.shippingAddress !== undefined ? sql.json(updates.shippingAddress) : cart.shippingAddress},
      shipping_method = ${updates.shippingMethod !== undefined ? updates.shippingMethod : cart.shippingMethod},
      updated_at = now()
    WHERE id = ${cart.id}
  `;
}

function labelFor(field) {
  const map = {
    name: 'Name', line1: 'Address', line2: 'Address line 2', city: 'City',
    region: 'Region', postalCode: 'Postal code', country: 'Country', phone: 'Phone'
  };
  return map[field] || field;
}

export function normaliseAddress(a) {
  return {
    name: String(a.name || '').trim(),
    line1: String(a.line1 || '').trim(),
    line2: String(a.line2 || '').trim(),
    city: String(a.city || '').trim(),
    region: String(a.region || '').trim(),
    postalCode: String(a.postalCode || '').trim(),
    country: String(a.country || '').trim().toUpperCase(),
    phone: String(a.phone || '').trim()
  };
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

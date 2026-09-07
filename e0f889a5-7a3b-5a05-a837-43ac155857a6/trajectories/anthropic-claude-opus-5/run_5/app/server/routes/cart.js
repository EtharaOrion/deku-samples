import { Hono } from 'hono';
import { one, query } from '../lib/db.js';
import { optionalCustomer } from '../lib/auth.js';
import {
  createCart, cartByToken, readCart, touchCart, validateQuantity, requireLine,
  SHIPPING_METHODS, shippingMethod, priceSignature,
} from '../lib/cart.js';
import { requireVariantBySku } from '../lib/catalogue.js';
import { badRequest, unprocessable } from '../lib/errors.js';

const routes = new Hono();

export const CART_COOKIE = 'vela_cart';

function cartTokenFrom(c) {
  const cookie = c.req.header('cookie') || '';
  const m = new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]+)`).exec(cookie);
  if (m) return decodeURIComponent(m[1]);
  return c.req.header('x-cart-token') || null;
}

function setCartCookie(c, token) {
  c.header(
    'Set-Cookie',
    `${CART_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    { append: true },
  );
}

/** A visitor never reads another cart: the token is the only handle. */
async function loadCart(c, { create = false } = {}) {
  const token = cartTokenFrom(c);
  let cart = token ? await cartByToken(token) : null;
  if (!cart && create) {
    const customer = c.get('customer');
    cart = await createCart({ customerId: customer?.id ?? null, email: customer?.email ?? null });
    setCartCookie(c, cart.token);
  }
  return cart;
}

routes.use('*', optionalCustomer);

routes.get('/', async (c) => {
  const cart = await loadCart(c, { create: true });
  return c.json(await readCart(cart));
});

routes.post('/lines', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sku = String(body?.sku ?? '').trim();
  if (!sku) throw badRequest('sku_required', 'Choose an option first.');
  const quantity = validateQuantity(body?.quantity ?? 1);

  const variant = await requireVariantBySku(sku);
  if (variant.kind === 'protection') {
    throw badRequest('protection_not_addable', 'Shipment protection is a toggle on the cart.');
  }
  if (variant.product_status === 'discontinued') {
    throw unprocessable('discontinued', 'We no longer sell this.');
  }
  if (variant.inventory_policy === 'deny' && variant.available < quantity) {
    throw unprocessable('out_of_stock', variant.available > 0
      ? `Only ${variant.available} left.`
      : 'Sold out.');
  }

  const cart = await loadCart(c, { create: true });
  // One line per cart and variant. The unit price is snapshotted at add time.
  await one(
    `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (cart_id, variant_id) DO UPDATE
       SET quantity = LEAST(10, cart_line.quantity + EXCLUDED.quantity)
     RETURNING id`,
    [cart.id, variant.id, quantity, variant.price_minor],
  );
  await touchCart(cart.id);
  return c.json(await readCart(cart), 201);
});

routes.patch('/lines/:id', async (c) => {
  const cart = await loadCart(c);
  if (!cart) throw badRequest('no_cart', 'Your cart is empty.');
  const body = await c.req.json().catch(() => ({}));
  const quantity = validateQuantity(body?.quantity);
  const line = await requireLine(cart.id, c.req.param('id'));

  const variant = await one(
    `SELECT v.id, v.sku, v.inventory_policy, p.title, COALESCE(i.available,0) AS available
       FROM variant v JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id WHERE v.id = $1`,
    [line.variant_id],
  );
  // Quantities are authoritative on the server: a rejection states the reason.
  if (variant.inventory_policy === 'deny' && quantity > variant.available) {
    throw unprocessable('out_of_stock', variant.available > 0
      ? `Only ${variant.available} of ${variant.title} left.`
      : `${variant.title} is sold out.`);
  }

  await query(`UPDATE cart_line SET quantity = $2 WHERE id = $1`, [line.id, quantity]);
  await touchCart(cart.id);
  return c.json(await readCart(cart));
});

routes.delete('/lines/:id', async (c) => {
  const cart = await loadCart(c);
  if (!cart) throw badRequest('no_cart', 'Your cart is empty.');
  const line = await requireLine(cart.id, c.req.param('id'));
  await query(`DELETE FROM cart_line WHERE id = $1`, [line.id]);
  await touchCart(cart.id);
  return c.json(await readCart(cart));
});

routes.post('/protection', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);
  const cart = await loadCart(c, { create: true });
  await query(`UPDATE cart SET protection_enabled = $2, updated_at = now() WHERE id = $1`, [cart.id, enabled]);
  const fresh = await cartByToken(cart.token);
  return c.json(await readCart(fresh));
});

routes.get('/shipping-methods', (c) =>
  c.json({ data: SHIPPING_METHODS, next_cursor: null, has_more: false }),
);

routes.post('/delivery', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await loadCart(c, { create: true });

  const patch = {};
  if (body.email !== undefined) {
    const email = String(body.email ?? '').trim();
    if (!email) throw badRequest('email_required', 'Email is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw badRequest('invalid_email', 'That did not work. Check the email address.');
    }
    patch.email = email;
  }
  if (body.marketing_consent !== undefined) patch.marketing_consent = Boolean(body.marketing_consent);

  if (body.shipping_address !== undefined) {
    patch.shipping_address = validateAddress(body.shipping_address);
  }
  if (body.shipping_method !== undefined) {
    const method = shippingMethod(body.shipping_method);
    if (!method) throw badRequest('invalid_shipping_method', 'Choose Standard or Express.');
    patch.shipping_method = method.code;
  }

  if (Object.keys(patch).length) {
    const sets = [];
    const params = [cart.id];
    for (const [key, value] of Object.entries(patch)) {
      params.push(key === 'shipping_address' ? JSON.stringify(value) : value);
      sets.push(`${key} = $${params.length}`);
    }
    await query(`UPDATE cart SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
  }

  const fresh = await cartByToken(cart.token);
  const view = await readCart(fresh);
  // The figure the final step shows is the figure the order authorizes.
  await query(`UPDATE cart SET priced_signature = $2 WHERE id = $1`, [cart.id, view.price_signature]);
  return c.json({ ...view, priced_signature: view.price_signature });
});

const REQUIRED_ADDRESS_FIELDS = [
  ['name', 'Name'],
  ['line1', 'Address'],
  ['city', 'City'],
  ['region', 'Region'],
  ['postal_code', 'Postal code'],
  ['country', 'Country'],
];

function validateAddress(input) {
  const a = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const [field, label] of REQUIRED_ADDRESS_FIELDS) {
    const value = String(a[field] ?? '').trim();
    if (!value) throw badRequest('address_incomplete', `${label} is required.`, { field });
    out[field] = value;
  }
  if (out.country.toUpperCase() !== 'US') {
    throw unprocessable('unsupported_country', 'We only deliver inside the United States today.');
  }
  out.country = out.country.toUpperCase();
  out.line2 = String(a.line2 ?? '').trim();
  out.phone = String(a.phone ?? '').trim();
  return out;
}

export { loadCart, cartTokenFrom, setCartCookie };
export default routes;

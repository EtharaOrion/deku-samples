import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { query } from '../lib/db.mjs';
import { findOrCreateCart, summariseCart, CART_COOKIE } from '../lib/cart.mjs';
import { customerForToken, bearerFrom } from '../lib/auth.mjs';
import { badRequest, notFound, unprocessable } from '../lib/errors.mjs';

const app = new Hono();

function cartTokenFrom(c) {
  const header = c.req.header('x-cart-token');
  if (header) return header;
  const cookie = c.req.header('cookie') || '';
  const found = new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]+)`).exec(cookie);
  return found ? decodeURIComponent(found[1]) : null;
}

async function loadCart(c) {
  const customer = await customerForToken(bearerFrom(c));
  const cart = await findOrCreateCart(cartTokenFrom(c), customer ? customer.id : null);
  return cart;
}

function respond(c, summary, status = 200) {
  // The cart is held by an opaque token; a visitor never reads another cart.
  setCookie(c, CART_COOKIE, summary.token, {
    path: '/', httpOnly: false, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30,
  });
  return c.json(summary, status);
}

app.get('/', async (c) => {
  const cart = await loadCart(c);
  return respond(c, await summariseCart(cart));
});

app.post('/lines', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sku = String(body.sku || '').trim();
  const quantity = Number(body.quantity ?? 1);
  if (!sku) throw badRequest('sku_required', 'SKU is required.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw badRequest('quantity_invalid', 'Quantity must be a whole number between 1 and 10.');
  }

  const cart = await loadCart(c);
  const { rows } = await query(
    `SELECT v.id, v.price_minor, p.status AS product_status, p.kind, p.title, il.available
       FROM variant v JOIN product p ON p.id = v.product_id
       JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.sku = $1`,
    [sku],
  );
  const variant = rows[0];
  if (!variant) throw notFound('That product does not exist.');
  if (variant.kind === 'protection') {
    throw badRequest('protection_not_addable', 'Shipment protection is a cart option, not a catalogue item.');
  }
  if (variant.product_status === 'discontinued') {
    throw unprocessable('discontinued', 'We no longer sell this.');
  }

  const existing = await query('SELECT id, quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2', [cart.id, variant.id]);
  const nextQty = Math.min(10, (existing.rows[0]?.quantity || 0) + quantity);
  if (variant.available < nextQty) {
    throw unprocessable('insufficient_stock', variant.available === 0
      ? `${variant.title} is sold out.`
      : `Only ${variant.available} left. Reduce the quantity to continue.`);
  }

  // The unit price is snapshotted at add time.
  await query(
    `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = $3`,
    [cart.id, variant.id, nextQty, variant.price_minor],
  );
  await query('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return respond(c, await summariseCart(cart), 201);
});

app.patch('/lines/:lineId', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw badRequest('quantity_invalid', 'Quantity must be a whole number between 1 and 10.');
  }
  const cart = await loadCart(c);
  const { rows } = await query(
    `SELECT cl.id, il.available, p.title FROM cart_line cl
       JOIN inventory_level il ON il.variant_id = cl.variant_id
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
      WHERE cl.id = $1 AND cl.cart_id = $2`,
    [c.req.param('lineId'), cart.id],
  );
  const line = rows[0];
  if (!line) throw notFound('That line is not in this cart.');
  if (line.available < quantity) {
    throw unprocessable('insufficient_stock', `Only ${line.available} left. Reduce the quantity to continue.`);
  }
  await query('UPDATE cart_line SET quantity = $1 WHERE id = $2', [quantity, line.id]);
  await query('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return respond(c, await summariseCart(cart));
});

app.delete('/lines/:lineId', async (c) => {
  const cart = await loadCart(c);
  const res = await query('DELETE FROM cart_line WHERE id = $1 AND cart_id = $2', [c.req.param('lineId'), cart.id]);
  if (res.rowCount === 0) throw notFound('That line is not in this cart.');
  await query('UPDATE cart SET updated_at = now() WHERE id = $1', [cart.id]);
  return respond(c, await summariseCart(cart));
});

app.post('/protection', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  const cart = await loadCart(c);
  await query('UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE id = $2', [enabled, cart.id]);
  cart.protection_enabled = enabled;
  return respond(c, await summariseCart(cart));
});

/** Step one and step two of checkout persist here, so a back navigation survives. */
app.post('/delivery', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cart = await loadCart(c);

  const patch = {};
  if (body.email !== undefined) {
    const email = String(body.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw badRequest('email_invalid', 'That did not work. Enter an email address.');
    }
    patch.email = email || null;
  }
  if (body.marketing_consent !== undefined) patch.marketing_consent = Boolean(body.marketing_consent);
  if (body.shipping_address !== undefined) {
    const a = body.shipping_address || {};
    patch.shipping_address = a && Object.keys(a).length ? JSON.stringify(a) : null;
  }
  if (body.shipping_method !== undefined) {
    const code = body.shipping_method ? String(body.shipping_method) : null;
    if (code) {
      const { rowCount } = await query('SELECT 1 FROM delivery_method WHERE code = $1', [code]);
      if (!rowCount) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');
    }
    patch.shipping_method = code;
  }

  const keys = Object.keys(patch);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    await query(
      `UPDATE cart SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => patch[k]), cart.id],
    );
  }
  const { rows } = await query('SELECT * FROM cart WHERE id = $1', [cart.id]);
  return respond(c, await summariseCart(rows[0]));
});

export default app;

import { Hono } from 'hono';
import { tx } from '../lib/db.mjs';
import { optionalAuth } from '../lib/auth.mjs';
import { badRequest, conflict, notFound } from '../lib/errors.mjs';
import { createCart, findCartByToken, readCart, syncProtection, touchCart, shippingMethods } from '../lib/cart.mjs';

const app = new Hono();
app.use('*', optionalAuth);

async function body(c) {
  try { return (await c.req.json()) || {}; } catch { return {}; }
}

function cartTokenFrom(c) {
  return c.req.header('x-cart-token') || c.req.query('cart_token') || null;
}

/** A visitor never reads another cart: the opaque token is the only handle. */
async function loadOrCreate(client, c) {
  const token = cartTokenFrom(c);
  const customer = c.get('customer');
  let cart = await findCartByToken(client, token);
  if (!cart) {
    cart = await createCart(client, {
      customerId: customer ? customer.id : null,
      email: customer ? customer.email : null,
    });
  } else if (customer && !cart.customer_id) {
    const { rows } = await client.query(
      'UPDATE cart SET customer_id = $2, email = COALESCE(cart.email, $3) WHERE id = $1 RETURNING *',
      [cart.id, customer.id, customer.email],
    );
    cart = rows[0];
  }
  return cart;
}

async function respond(client, c, cart, status = 200) {
  const { rows: [fresh] } = await client.query('SELECT * FROM cart WHERE id = $1', [cart.id]);
  const shaped = await readCart(client, fresh);
  return c.json({ cart: shaped, delivery_methods: await shippingMethods(client) }, status);
}

app.get('/', async (c) =>
  tx(async (client) => {
    const cart = await loadOrCreate(client, c);
    return respond(client, c, cart);
  }),
);

app.post('/lines', async (c) => {
  const { sku, quantity } = await body(c);
  const qty = Number(quantity ?? 1);
  if (!sku) throw badRequest('sku_required', 'Choose an option first.');
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number between 1 and 10.');
  }

  return tx(async (client) => {
    const cart = await loadOrCreate(client, c);
    const { rows: [variant] } = await client.query(
      `SELECT v.*, p.status AS product_status, p.kind, p.title,
              COALESCE(il.available,0) AS available
         FROM variant v JOIN product p ON p.id = v.product_id
         LEFT JOIN inventory_level il ON il.variant_id = v.id
        WHERE v.sku = $1`,
      [sku],
    );
    if (!variant) throw notFound('That option does not exist.');
    if (variant.kind === 'protection') throw badRequest('not_purchasable', 'That is not sold on its own.');
    if (variant.product_status === 'discontinued') {
      throw badRequest('discontinued', 'We no longer sell this.');
    }

    const { rows: [existing] } = await client.query(
      'SELECT * FROM cart_line WHERE cart_id = $1 AND variant_id = $2',
      [cart.id, variant.id],
    );
    const wanted = Math.min(10, (existing ? existing.quantity : 0) + qty);
    if (variant.inventory_policy === 'deny' && variant.available < wanted) {
      throw conflict('insufficient_stock',
        variant.available === 0 ? 'That option is sold out.' : `Only ${variant.available} left.`,
        { resource: variant.sku, available: variant.available });
    }

    // The line stores the unit price at add time.
    await client.query(
      `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (cart_id, variant_id) DO UPDATE
         SET quantity = $3, unit_price_minor = EXCLUDED.unit_price_minor,
             previous_price_minor = NULL`,
      [cart.id, variant.id, wanted, variant.price_minor],
    );

    await syncProtection(client, cart);
    await touchCart(client, cart.id);
    return respond(client, c, cart, 201);
  });
});

app.patch('/lines/:id', async (c) => {
  const { quantity } = await body(c);
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw badRequest('invalid_quantity', 'Quantity must be a whole number between 1 and 10.');
  }

  return tx(async (client) => {
    const cart = await loadOrCreate(client, c);
    const { rows: [line] } = await client.query(
      `SELECT cl.*, v.sku, v.inventory_policy, COALESCE(il.available,0) AS available
         FROM cart_line cl JOIN variant v ON v.id = cl.variant_id
         LEFT JOIN inventory_level il ON il.variant_id = v.id
        WHERE cl.id = $1 AND cl.cart_id = $2`,
      [Number(c.req.param('id')), cart.id],
    );
    if (!line) throw notFound('That line is not in your cart.');

    if (line.inventory_policy === 'deny' && line.available < qty) {
      throw conflict('insufficient_stock', `Only ${line.available} left.`, {
        resource: line.sku, available: line.available,
      });
    }

    // Editing the line acknowledges the current price, so the notice clears.
    await client.query(
      `UPDATE cart_line cl SET quantity = $2, unit_price_minor = v.price_minor,
              previous_price_minor = NULL
         FROM variant v WHERE v.id = cl.variant_id AND cl.id = $1`,
      [line.id, qty],
    );
    await syncProtection(client, cart);
    await touchCart(client, cart.id);
    return respond(client, c, cart);
  });
});

app.delete('/lines/:id', async (c) =>
  tx(async (client) => {
    const cart = await loadOrCreate(client, c);
    const { rowCount } = await client.query('DELETE FROM cart_line WHERE id = $1 AND cart_id = $2', [
      Number(c.req.param('id')), cart.id,
    ]);
    if (!rowCount) throw notFound('That line is not in your cart.');
    await syncProtection(client, cart);
    await touchCart(client, cart.id);
    return respond(client, c, cart);
  }),
);

app.post('/protection', async (c) => {
  const { enabled } = await body(c);
  return tx(async (client) => {
    const cart = await loadOrCreate(client, c);
    const { rows: [updated] } = await client.query(
      'UPDATE cart SET protection_enabled = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [cart.id, Boolean(enabled)],
    );
    await syncProtection(client, updated);
    return respond(client, c, updated);
  });
});

app.post('/delivery', async (c) => {
  const { email, shipping_address, shipping_method, marketing_consent } = await body(c);

  return tx(async (client) => {
    const cart = await loadOrCreate(client, c);

    if (email !== undefined && email !== null && String(email).trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
        throw badRequest('invalid_email', 'Email is required.');
      }
    }
    if (shipping_method !== undefined && shipping_method !== null && String(shipping_method)) {
      const { rows } = await client.query('SELECT 1 FROM shipping_method WHERE code = $1', [String(shipping_method)]);
      if (!rows.length) throw badRequest('invalid_shipping_method', 'Choose a delivery method.');
    }

    const { rows: [updated] } = await client.query(
      `UPDATE cart SET
         email = COALESCE($2, email),
         shipping_address = COALESCE($3::jsonb, shipping_address),
         shipping_method = COALESCE($4, shipping_method),
         marketing_consent = COALESCE($5, marketing_consent),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        cart.id,
        email ? String(email).trim() : null,
        shipping_address ? JSON.stringify(shipping_address) : null,
        shipping_method || null,
        marketing_consent === undefined ? null : Boolean(marketing_consent),
      ],
    );
    await syncProtection(client, updated);
    return respond(client, c, updated);
  });
});

export default app;

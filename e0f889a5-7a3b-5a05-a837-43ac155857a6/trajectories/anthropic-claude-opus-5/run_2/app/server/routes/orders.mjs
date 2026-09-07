import { Hono } from 'hono';
import { query } from '../lib/db.mjs';
import { customerForToken, bearerFrom } from '../lib/auth.mjs';
import { findOrCreateCart, CART_COOKIE } from '../lib/cart.mjs';
import { placeOrder, orderWithLines, orderChip, hashAccessToken } from '../lib/orders.mjs';
import { notFound, badRequest } from '../lib/errors.mjs';

const app = new Hono();

function cartTokenFrom(c) {
  const header = c.req.header('x-cart-token');
  if (header) return header;
  const cookie = c.req.header('cookie') || '';
  const found = new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]+)`).exec(cookie);
  return found ? decodeURIComponent(found[1]) : null;
}

app.post('/', async (c) => {
  const customer = await customerForToken(bearerFrom(c));
  const body = await c.req.json().catch(() => ({}));
  const idempotencyKey = c.req.header('idempotency-key') || body.idempotency_key || null;

  const token = cartTokenFrom(c);
  if (!token) throw badRequest('cart_missing', 'Your cart is empty.');
  const cart = await findOrCreateCart(token, customer ? customer.id : null);

  const expected = body.expected_total_minor;
  const { order, accessToken, replayed } = await placeOrder({
    cart,
    customer,
    idempotencyKey,
    expectedTotalMinor: Number.isInteger(expected) ? expected : null,
    logger: (fields) => c.get('log')?.(fields),
  });

  const shaped = await orderWithLines(order);
  return c.json({ ...shaped, access_token: accessToken, replayed }, replayed ? 200 : 201);
});

/** One order by its access token, or by a bearer token belonging to its customer. */
app.get('/:number', async (c) => {
  const number = c.req.param('number');
  const { rows } = await query('SELECT * FROM "order" WHERE number = $1', [number]);
  const order = rows[0];
  // Another customer's order reads as not found, never forbidden.
  if (!order) throw notFound('That order does not exist.');

  const accessToken = c.req.query('access_token') || c.req.header('x-order-access-token');
  const customer = await customerForToken(bearerFrom(c));

  const byToken = accessToken && order.access_token_hash === hashAccessToken(accessToken);
  const byOwner = customer && order.customer_id === customer.id;
  if (!byToken && !byOwner) throw notFound('That order does not exist.');

  const shaped = await orderWithLines(order);
  return c.json({ ...shaped, chip: orderChip(order) });
});

export default app;

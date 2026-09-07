import { Hono } from 'hono';
import { optionalCustomer } from '../lib/auth.js';
import { loadCart } from './cart.js';
import { placeOrder, readableOrder, orderView } from '../lib/orders.js';
import { badRequest } from '../lib/errors.js';

const routes = new Hono();

routes.use('*', optionalCustomer);

routes.post('/', async (c) => {
  const cart = await loadCart(c);
  if (!cart) throw badRequest('no_cart', 'Your cart is empty.');
  const body = await c.req.json().catch(() => ({}));
  const idempotencyKey =
    c.req.header('idempotency-key') || c.req.header('Idempotency-Key') || body?.idempotency_key || null;

  const { order, replayed } = await placeOrder({
    cart,
    customer: c.get('customer') ?? null,
    idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 200) : null,
    expectedSignature: cart.priced_signature,
    requestId: c.get('requestId'),
  });

  return c.json(order, replayed ? 200 : 201);
});

routes.get('/:number', async (c) => {
  const accessToken = c.req.query('access_token') || c.req.header('x-order-token') || null;
  const { order, lines } = await readableOrder({
    number: c.req.param('number'),
    customer: c.get('customer') ?? null,
    accessToken,
  });
  return c.json(await orderView({ order, lines }));
});

export default routes;

import type { Hono } from 'hono';
import { placeOrder, confirmOrder, orderViewByNumber, orderView, OrderError } from '../orders.ts';
import { customerForToken, bearerFrom } from '../auth.ts';
import { q } from '../db/pool.ts';
import { clientError, ApiEnv } from './util.ts';
import { cartCookie } from './cart.ts';
import { findOrCreateCart } from '../cart.ts';
import { sha256Hex } from '../crypto.ts';

function orderErrorToResponse(c: any, err: OrderError) {
  return clientError(c, err.status, err.code, err.message, err.extra ?? {});
}

export function registerOrderRoutes(app: Hono<ApiEnv>) {
  app.post('/api/orders', async (c) => {
    // A signed-in customer's order is attached to their account; a guest's is not.
    const headerToken = bearerFrom(c.req.header('authorization'));
    const cookieToken = readCookie(c.req.header('cookie'), 'vela_token');
    const customer = await customerForToken(headerToken || cookieToken);
    const cartToken = cartCookie(c);
    if (!cartToken) return clientError(c, 400, 'unknown_cart', 'Your cart is empty.', { resource: 'cart' });
    const idempotencyKey = c.req.header('idempotency-key') || null;

    let placed;
    try {
      placed = await placeOrder({ cartToken, idempotencyKey, customerId: customer ? String(customer.id) : null });
    } catch (err: any) {
      if (err instanceof OrderError) return orderErrorToResponse(c, err);
      throw err;
    }

    if (placed.replayed) {
      return c.json({ order: placed.order });
    }

    try {
      const confirmed = await confirmOrder(placed.order.id);
      return c.json({ order: confirmed, access_token: placed.accessToken }, 201);
    } catch (err: any) {
      // The order exists and is confirmed; the invoice or the mail can be retried.
      if (err instanceof OrderError) {
        return c.json({ order: await orderView(placed.order), access_token: placed.accessToken, warning: err.message }, 201);
      }
      throw err;
    }
  });

  app.get('/api/orders/:number', async (c) => {
    const number = c.req.param('number');
    const accessToken = c.req.query('access_token');
    const headerToken = bearerFrom(c.req.header('authorization'));
    const cookieToken = readCookie(c.req.header('cookie'), 'vela_token');
    const customer = await customerForToken(headerToken || cookieToken);

    const row = await q(`SELECT * FROM order_row WHERE number = $1`, [number]);
    if (row.rows.length === 0) return clientError(c, 404, 'not_found', 'That page does not exist.');
    const order = row.rows[0];

    const tokenHash = order.access_token_hash;
    const matches = accessToken && sha256Hex(accessToken) === tokenHash;
    const owns = customer && order.customer_id && String(order.customer_id) === String(customer.id);

    if (!matches && !owns) return clientError(c, 404, 'not_found', 'That page does not exist.');
    return c.json({ order: await orderView(order) });
  });
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

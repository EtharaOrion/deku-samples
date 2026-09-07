import { Hono } from 'hono';
import { query, one, tx } from '../lib/db.mjs';
import { optionalAuth } from '../lib/auth.mjs';
import { AppError, badRequest, notFound, conflict } from '../lib/errors.mjs';
import { placeOrder, confirmOrder, orderPayload, findOrderByNumber, accessTokenMatches, repriceCart } from '../lib/orders.mjs';

const app = new Hono();
app.use('*', optionalAuth);

/**
 * Place an order. A replayed Idempotency-Key returns the order it returned the
 * first time and creates no second invoice, mail or order.
 */
app.post('/', async (c) => {
  const customer = c.get('customer');
  const payload = await bodyOnce(c);
  const idempotencyKey = c.req.header('idempotency-key') || payload.idempotency_key || null;
  const token = c.req.header('x-cart-token') || payload.cart_token;
  if (!token) throw badRequest('cart_required', 'Your cart is empty.');

  const scope = 'orders';

  if (idempotencyKey) {
    // Claim the key first. The unique index makes the claim the race.
    let claimed = false;
    try {
      await query('INSERT INTO idempotency_key (scope, key, state) VALUES ($1,$2,$3)', [
        scope, idempotencyKey, 'in_progress',
      ]);
      claimed = true;
    } catch (err) {
      if (!err || err.code !== '23505') throw err;
    }

    if (!claimed) {
      // Somebody already used this key: return exactly what they got.
      const replay = await waitForReplay(scope, idempotencyKey);
      if (replay) return c.json(replay, 200);
      throw conflict('in_progress', 'That order is still being placed. Try again in a moment.', {
        resource: idempotencyKey,
      });
    }

    try {
      const result = await runPlacement({ token, customer, payload, c });
      await query(
        `UPDATE idempotency_key SET state = 'done', response = $3, order_id = $4
          WHERE scope = $1 AND key = $2`,
        [scope, idempotencyKey, JSON.stringify(result.json), result.orderId],
      );
      return c.json(result.json, 201);
    } catch (err) {
      // A failed attempt must not wedge the key forever.
      await query('DELETE FROM idempotency_key WHERE scope = $1 AND key = $2 AND state = $3', [
        scope, idempotencyKey, 'in_progress',
      ]);
      throw err;
    }
  }

  const result = await runPlacement({ token, customer, payload, c });
  return c.json(result.json, 201);
});

async function bodyOnce(c) {
  try { return (await c.req.json()) || {}; } catch { return {}; }
}

async function waitForReplay(scope, key, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const row = await one('SELECT state, response FROM idempotency_key WHERE scope = $1 AND key = $2', [scope, key]);
    if (!row) return null;
    if (row.state === 'done' && row.response) return row.response;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function runPlacement({ token, customer, payload, c }) {
  const expected = payload.expected_total_minor ?? payload.total_minor ?? null;

  let placed;
  try {
    placed = await placeOrder({
      cartToken: token,
      customerId: customer ? customer.id : null,
      expectedTotalMinor: expected === null || expected === undefined ? null : Number(expected),
    });
  } catch (err) {
    // The refusal rolled its transaction back; apply the re-pricing now so the
    // person returns to a re-priced cart carrying the notice.
    if (err instanceof AppError && err.code === 'price_changed' && err.extra?.reprice_cart_id) {
      await repriceCart(err.extra.reprice_cart_id);
    }
    throw err;
  }

  const log = {
    warn: (o) => process.stdout.write(JSON.stringify({ level: 'warn', request_id: c.get('requestId'), ...o }) + '\n'),
    error: (o) => process.stdout.write(JSON.stringify({ level: 'error', request_id: c.get('requestId'), ...o }) + '\n'),
  };

  let confirmed;
  try {
    confirmed = await confirmOrder(placed.order, placed.lines, log);
  } catch (err) {
    // The invoice could not be raised: release the stock this order committed and
    // cancel it, so no confirmed order exists without an invoice behind it.
    await releaseOrder(placed.order.id);
    log.error({ msg: 'billing failed, order released', order: placed.order.number, error: String(err) });
    throw new AppError(
      502, 'billing_unavailable',
      'We could not reach the billing system, so nothing was charged. Try again in a moment.',
    );
  }

  const shaped = await orderPayload(confirmed.order, { includeAccessToken: placed.accessToken });
  return {
    orderId: Number(confirmed.order.id),
    json: {
      order: {
        ...shaped,
        killbill_external_key: confirmed.order.killbill_external_key,
        killbill_invoice_amount: confirmed.invoiceAmount,
      },
      access_token: placed.accessToken,
      request_id: c.get('requestId'),
    },
  };
}

async function releaseOrder(orderId) {
  await tx(async (client) => {
    const { rows: lines } = await client.query(
      `SELECT ol.variant_id, ol.quantity, v.inventory_policy, p.kind
         FROM order_line ol JOIN variant v ON v.id = ol.variant_id
         JOIN product p ON p.id = v.product_id
        WHERE ol.order_id = $1`,
      [orderId],
    );
    for (const l of lines) {
      if (l.inventory_policy === 'continue' || l.kind === 'protection') continue;
      await client.query(
        `UPDATE inventory_level SET available = available + $2, committed = GREATEST(0, committed - $2)
          WHERE variant_id = $1`,
        [l.variant_id, l.quantity],
      );
    }
    await client.query('DELETE FROM device WHERE order_id = $1', [orderId]);
    await client.query(`UPDATE "order" SET status = 'cancelled' WHERE id = $1`, [orderId]);
  });
}

/** One order by its access token, or by a bearer token for the customer who owns it. */
app.get('/:number', async (c) => {
  const number = c.req.param('number');
  const order = await findOrderByNumber(number);
  const customer = c.get('customer');
  const accessToken = c.req.query('access_token') || c.req.header('x-order-token');

  // Another customer's order reads as not found, never forbidden.
  if (!order) throw notFound('That order does not exist.');

  const byToken = accessTokenMatches(order, accessToken);
  const byOwner = customer && order.customer_id && Number(order.customer_id) === Number(customer.id);
  if (!byToken && !byOwner) throw notFound('That order does not exist.');

  return c.json({ order: await orderPayload(order) });
});

export default app;

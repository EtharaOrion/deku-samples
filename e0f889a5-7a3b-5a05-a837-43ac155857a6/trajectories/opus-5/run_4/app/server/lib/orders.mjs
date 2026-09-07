import { query, withTransaction } from './db.mjs';
import { hashToken, newOpaqueToken } from './tokens.mjs';
import { formatMinor, taxOn, protectionRungFor } from './money.mjs';
import { badRequest, conflict, notFound, unprocessable } from './errors.mjs';
import { billOrder } from './killbill.mjs';
import { sendOrderConfirmation } from './mail.mjs';
import { log } from './log.mjs';
import { readCart, findCartByToken } from './cart.mjs';

const ORDER_SCOPE = 'orders.create';

/** VE-<year>-<four digits>, allocated in sequence under a row lock. */
async function allocateNumber(client, year) {
  const { rows } = await client.query(
    `INSERT INTO order_number_seq (year, last_number) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_number = order_number_seq.last_number + 1
     RETURNING last_number`, [year]);
  return `VE-${year}-${String(rows[0].last_number).padStart(4, '0')}`;
}

/**
 * Place an order.
 *
 * Re-prices every line against the catalogue; a line that changed since the cart
 * was last shown refuses the order and hands back a re-priced cart. Commits
 * stock in the same statement that checks it, so two concurrent checkouts for
 * the last unit cannot both succeed. Raises the invoice in killbill and sends
 * exactly one mail, both only once per idempotency key.
 */
export async function placeOrder({ cartToken, customerId = null, idempotencyKey = null, requestId }) {
  // A replay of a key the server has already seen returns the same order it
  // returned the first time. This is settled before the cart is even read,
  // because a successful first attempt spends the cart.
  if (idempotencyKey) {
    const replay = await claimIdempotencyKey(idempotencyKey);
    if (replay.replayed) {
      // A double click sends two requests at once, so the second may arrive
      // while the first is still being billed. Wait for the winner rather than
      // refusing, so both submissions answer with the same order.
      const settled = replay.state === 'done'
        ? replay
        : await waitForIdempotentOrder(idempotencyKey);
      if (settled && settled.order_id) {
        const existing = await getOrderById(settled.order_id);
        if (existing) return { order: existing, replayed: true, access_token: null };
      }
      throw conflict('order_in_progress', 'That order is still being placed. Try again in a moment.');
    }
  }

  const cart = await findCartByToken(cartToken);
  if (!cart) {
    await releaseIdempotencyKey(idempotencyKey);
    throw notFound('Your cart is empty.', 'cart_not_found');
  }

  // A cart that has already become an order never becomes a second one.
  if (cart.converted_order_id) {
    const existing = await getOrderById(cart.converted_order_id);
    return { order: existing, replayed: true, access_token: null };
  }

  const view = await readCart(cart);
  if (!view.lines.length) throw unprocessable('cart_empty', 'Your cart is empty.');
  if (!cart.email) throw unprocessable('email_required', 'Email is required.');
  if (!cart.shipping_address) throw unprocessable('address_required', 'An address is required.');
  if (!cart.shipping_method) throw unprocessable('shipping_method_required', 'Choose a delivery method.');

  // Re-price: a line whose price moved refuses the order.
  const changed = view.notices.filter((n) => n.kind === 'price_changed');
  if (changed.length) {
    await releaseIdempotencyKey(idempotencyKey);
    throw new (await import('./errors.mjs')).AppError(409, 'price_changed',
      changed[0].message, { notices: view.notices, cart: view });
  }
  const unavailable = view.notices.filter((n) => n.kind !== 'price_changed');
  if (unavailable.length) {
    await releaseIdempotencyKey(idempotencyKey);
    throw new (await import('./errors.mjs')).AppError(409, 'line_unavailable',
      unavailable[0].message, { notices: view.notices, cart: view });
  }

  const accessToken = newOpaqueToken(24);
  let created;
  try {
    created = await withTransaction(async (client) => {
      // Commit stock for every physical line. available falls and committed
      // rises in one statement whose WHERE clause is the check, so the loser of
      // a race writes nothing and available never goes negative.
      for (const line of view.lines) {
        const { rowCount } = await client.query(
          `UPDATE inventory_level
              SET available = available - $2, committed = committed + $2
            WHERE variant_id = $1 AND available >= $2`,
          [line.variant_id, line.quantity]);
        if (!rowCount) {
          throw conflict('insufficient_stock',
            `${line.title} sold out while you were checking out.`, { sku: line.sku });
        }
      }

      const subtotal_minor = view.subtotal_minor;
      const protection_minor = view.protection_minor;
      const shipping_minor = view.shipping_minor;
      // Protection is excluded from tax; tax is ten percent of the line subtotal.
      const tax_minor = taxOn(subtotal_minor);
      const total_minor = subtotal_minor + protection_minor + shipping_minor + tax_minor;

      const year = new Date().getUTCFullYear();
      const number = await allocateNumber(client, year);

      const { rows } = await client.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
                              discount_minor, total_minor, currency, status, payment_status,
                              fulfilment_status, shipping_method, shipping_address, access_token_hash,
                              killbill_external_key)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11)
         RETURNING *`,
        [number, customerId || cart.customer_id, cart.email,
         subtotal_minor, shipping_minor + protection_minor, tax_minor, total_minor,
         cart.shipping_method, cart.shipping_address, hashToken(accessToken),
         String(cart.email).toLowerCase()]);
      const order = rows[0];

      let position = 1;
      for (const line of view.lines) {
        await client.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot,
                                   quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [order.id, line.variant_id, line.title, line.sku, line.option_value,
           line.quantity, line.unit_price_minor, line.line_total_minor, position]);
        position += 1;
      }
      // Shipment protection rides as a shipping-side charge, never a taxed line.
      if (protection_minor > 0) {
        const rung = protectionRungFor(subtotal_minor);
        const { rows: pv } = await client.query(`SELECT id FROM variant WHERE sku = $1`, [rung.sku]);
        if (pv.length) {
          await client.query(
            `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot,
                                     quantity, unit_price_minor, total_minor, position)
             VALUES ($1,$2,'Shipment protection',$3,'',1,$4,$4,$5)`,
            [order.id, pv[0].id, rung.sku, protection_minor, position]);
        }
      }

      // The cart is spent.
      await client.query(`UPDATE cart SET converted_order_id = $1, updated_at = now() WHERE id = $2`,
        [order.id, cart.id]);

      return order;
    });
  } catch (err) {
    await releaseIdempotencyKey(idempotencyKey);
    throw err;
  }

  // Bill and confirm. The invoice must exist in killbill before the order reads
  // as confirmed, so a confirmation this app returns is never ahead of the money.
  let billing;
  try {
    billing = await billOrder({
      email: created.email,
      name: (created.shipping_address && created.shipping_address.name) || created.email,
      number: created.number,
      totalMinor: created.total_minor,
      requestId,
    });
  } catch (err) {
    log({ level: 'error', msg: 'killbill.failed', request_id: requestId, order: created.number, error: String(err && err.message) });
    await query(`UPDATE "order" SET status = 'cancelled' WHERE id = $1`, [created.id]);
    for (const line of view.lines) {
      await query(
        `UPDATE inventory_level SET available = available + $2, committed = GREATEST(committed - $2, 0)
          WHERE variant_id = $1`, [line.variant_id, line.quantity]);
    }
    await query(`UPDATE cart SET converted_order_id = NULL WHERE id = $1`, [cart.id]);
    await releaseIdempotencyKey(idempotencyKey);
    throw new (await import('./errors.mjs')).AppError(502, 'billing_unavailable',
      'We could not reach billing, so we did not take the order. Nothing was charged. Try again.');
  }

  const { rows: confirmedRows } = await query(
    `UPDATE "order"
        SET status = 'confirmed', payment_status = 'invoiced',
            killbill_account_id = $2, killbill_invoice_id = $3, killbill_invoice_amount = $4
      WHERE id = $1 RETURNING *`,
    [created.id, billing.accountId, billing.invoiceId, billing.amount]);
  const order = confirmedRows[0];

  const lines = await orderLines(order.id);

  // The order exists and is billed, so the key is settled now: a second submit
  // waiting on it gets this order rather than waiting on the mail server.
  await finishIdempotencyKey(idempotencyKey, order.id);

  // Exactly one mail, and only for a confirmed order.
  try {
    await sendOrderConfirmation({ order, lines, requestId });
  } catch (err) {
    log({ level: 'error', msg: 'mail.failed', request_id: requestId, order: order.number, error: String(err && err.message) });
  }

  // Allocate serials to camera lines from stock that is already manufactured.
  await allocateSerials(order, lines);

  const full = await getOrderById(order.id);
  return { order: full, replayed: false, access_token: accessToken };
}

/** A camera line hands over real device rows, so a serial is a record in its own right. */
async function allocateSerials(order, lines) {
  for (const line of lines) {
    const { rows: variant } = await query(`SELECT id, product_id FROM variant WHERE sku = $1`, [line.sku_snapshot]);
    if (!variant.length) continue;
    const { rows: isCamera } = await query(`SELECT kind FROM product WHERE id = $1`, [variant[0].product_id]);
    if (!isCamera.length || isCamera[0].kind !== 'camera') continue;
    for (let i = 0; i < line.quantity; i += 1) {
      await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT id FROM device
            WHERE variant_id = $1 AND status = 'manufactured' AND order_id IS NULL
            ORDER BY id ASC FOR UPDATE SKIP LOCKED LIMIT 1`, [variant[0].id]);
        if (!rows.length) return;
        await client.query(
          `UPDATE device SET status = 'sold', order_id = $2,
                  warranty_until = (CURRENT_DATE + interval '2 years')::date
            WHERE id = $1`, [rows[0].id, order.id]);
      });
    }
  }
}

async function claimIdempotencyKey(key, cartId) {
  const { rows } = await query(
    `INSERT INTO idempotency_key (scope, key, state) VALUES ($1,$2,'in_progress')
     ON CONFLICT (scope, key) DO NOTHING
     RETURNING id`, [ORDER_SCOPE, key]);
  if (rows.length) return { replayed: false };
  const { rows: existing } = await query(
    `SELECT order_id, state FROM idempotency_key WHERE scope = $1 AND key = $2`, [ORDER_SCOPE, key]);
  if (!existing.length) return { replayed: false };
  return { replayed: true, order_id: existing[0].order_id, state: existing[0].state };
}

/**
 * Wait for the request that won this key to finish, so the loser of a double
 * submit answers with the winner's order rather than a refusal. Gives up if the
 * winner disappeared, in which case the key is free for a fresh attempt.
 */
async function waitForIdempotentOrder(key, { attempts = 60, delayMs = 250 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((r) => setTimeout(r, delayMs));
    const { rows } = await query(
      `SELECT order_id, state FROM idempotency_key WHERE scope = $1 AND key = $2`,
      [ORDER_SCOPE, key]);
    // The winner failed and released the key: this request may now try itself.
    if (!rows.length) return null;
    if (rows[0].state === 'done') return { order_id: rows[0].order_id, state: 'done' };
  }
  return null;
}

async function finishIdempotencyKey(key, orderId) {
  if (!key) return;
  await query(
    `UPDATE idempotency_key SET state = 'done', order_id = $3 WHERE scope = $1 AND key = $2`,
    [ORDER_SCOPE, key, orderId]);
}

async function releaseIdempotencyKey(key) {
  if (!key) return;
  await query(`DELETE FROM idempotency_key WHERE scope = $1 AND key = $2 AND state = 'in_progress'`,
    [ORDER_SCOPE, key]);
}

export async function orderLines(orderId) {
  const { rows } = await query(
    `SELECT ol.*, p.handle, p.kind
       FROM order_line ol
       JOIN variant v ON v.id = ol.variant_id
       JOIN product p ON p.id = v.product_id
      WHERE ol.order_id = $1 ORDER BY ol.position ASC, ol.id ASC`, [orderId]);
  return rows;
}

async function serialsForOrder(orderId) {
  const { rows } = await query(
    `SELECT d.serial, d.status, p.title AS model,
            (SELECT o2.customer_id FROM device_ownership o2
              WHERE o2.device_id = d.id AND o2.released_at IS NULL) AS owner_id
       FROM device d JOIN product p ON p.id = d.product_id
      WHERE d.order_id = $1 ORDER BY d.id ASC`, [orderId]);
  return rows.map((r) => ({ serial: r.serial, model: r.model, registered: r.owner_id !== null }));
}

function decorate(order, lines, serials) {
  return {
    ...order,
    subtotal_minor: Number(order.subtotal_minor),
    shipping_minor: Number(order.shipping_minor),
    tax_minor: Number(order.tax_minor),
    discount_minor: Number(order.discount_minor),
    total_minor: Number(order.total_minor),
    lines: lines.map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      total_minor: Number(l.total_minor),
    })),
    serials,
    state_phrase: statePhrase(order),
  };
}

/** One chip combining the order, payment and fulfilment states. */
export function statePhrase(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'pending') return 'Placing';
  if (order.fulfilment_status === 'fulfilled') return 'Confirmed and delivered';
  if (order.payment_status === 'invoiced') return 'Confirmed, on its way';
  return 'Confirmed';
}

export async function getOrderById(id) {
  if (!id) return null;
  const { rows } = await query(`SELECT * FROM "order" WHERE id = $1`, [id]);
  if (!rows.length) return null;
  return decorate(rows[0], await orderLines(id), await serialsForOrder(id));
}

export async function getOrderByNumber(number) {
  const { rows } = await query(`SELECT * FROM "order" WHERE number = $1`, [number]);
  if (!rows.length) return null;
  return decorate(rows[0], await orderLines(rows[0].id), await serialsForOrder(rows[0].id));
}

/**
 * The rows an account may read: the ones placed while signed in, and the ones
 * checked out as a guest against this account's own address. An email belongs
 * to exactly one account, because signup refuses a registered address, so this
 * widens nobody's reach beyond their own orders.
 */
export const ACCOUNT_ORDER_PREDICATE = `(customer_id = $1 OR lower(email) = lower($2))`;

/**
 * An order reads either with its access token or as the customer whose orders
 * it is among. Another customer's order reads as not found, never as forbidden.
 */
export async function readOrderFor(number, { accessToken = null, customerId = null, customerEmail = null }) {
  const order = await getOrderByNumber(number);
  if (!order) return null;
  if (accessToken && order.access_token_hash === hashToken(accessToken)) return order;
  if (customerId && String(order.customer_id) === String(customerId)) return order;
  if (customerEmail && String(order.email).toLowerCase() === String(customerEmail).toLowerCase()) {
    return order;
  }
  return null;
}

export function publicOrder(order) {
  if (!order) return null;
  const { access_token_hash, killbill_account_id, ...rest } = order;
  return {
    ...rest,
    total_display: formatMinor(order.total_minor, order.currency),
    killbill_invoice_amount: order.killbill_invoice_amount === null || order.killbill_invoice_amount === undefined
      ? null : String(order.killbill_invoice_amount),
  };
}

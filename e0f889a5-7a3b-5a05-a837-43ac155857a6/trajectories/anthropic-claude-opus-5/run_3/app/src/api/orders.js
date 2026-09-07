import crypto from 'node:crypto';
import { many, one, query, tx, PG_UNIQUE_VIOLATION } from '../lib/db.js';
import { taxFor, protectionRungFor, formatMoney } from '../lib/money.js';
import { deliveryMethod } from '../lib/domain.js';
import { randomToken, hashOpaque } from '../lib/auth.js';
import { AppError, badRequest, conflict, notFound, unprocessable } from '../lib/errors.js';
import { cartLines } from './carts.js';
import { ensureAccount, createInvoiceCharge, getInvoice } from '../lib/killbill.js';
import { sendOrderConfirmation } from '../lib/mail.js';
import { logEvent, logError } from '../lib/log.js';

/** VE-<year>-<four digits>, allocated in sequence by the store. */
async function allocateNumber(client) {
  const { rows } = await client.query(`SELECT nextval('order_number_seq') AS n`);
  const n = Number(rows[0].n);
  const year = new Date().getUTCFullYear();
  return `VE-${year}-${String(n).padStart(4, '0')}`;
}

/**
 * Place an order.
 *
 * Re-prices every line, commits stock in one atomic step per line so two
 * concurrent checkouts for the last unit cannot both succeed, then raises the
 * invoice and sends the mail exactly once.
 */
export async function placeOrder({ cart, customer, idempotencyKey, expectedTotalMinor, requestId }) {
  const lines = await cartLines(cart.id);
  if (lines.length === 0) {
    throw unprocessable('cart_empty', 'Your cart is empty.');
  }

  const email = (cart.email || customer?.email || '').trim();
  if (!email) throw unprocessable('email_required', 'Email is required.');
  if (!cart.shipping_address) throw unprocessable('address_required', 'A delivery address is required.');
  const method = deliveryMethod(cart.shipping_method);
  if (!method) throw unprocessable('shipping_method_required', 'Choose how it gets there.');

  // Placing an order re-prices every line. If a line changed since the cart was
  // last shown the order is refused and the person returns to a re-priced cart.
  const changed = lines.filter((l) => l.unit_price_minor !== l.current_price_minor);
  if (changed.length > 0) {
    throw new AppError(409, 'price_changed', changed
      .map((l) => `The price of ${l.title} changed from ${formatMoney(l.unit_price_minor)} to ${formatMoney(l.current_price_minor)} since you added it.`)
      .join(' '), {
      notices: changed.map((l) => ({
        sku: l.sku,
        title: l.title,
        old_price_minor: l.unit_price_minor,
        new_price_minor: l.current_price_minor,
      })),
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
  const rung = protectionRungFor(subtotal);
  const protectionMinor = cart.protection_enabled && rung ? rung.price_minor : 0;
  const shipping = method.price_minor;
  const tax = taxFor(subtotal); // protection is excluded from tax
  const total = subtotal + protectionMinor + shipping + tax;

  // The total authorized is the figure the final step showed.
  if (expectedTotalMinor !== undefined && expectedTotalMinor !== null && Number(expectedTotalMinor) !== total) {
    throw new AppError(409, 'total_changed',
      `The total changed from ${formatMoney(expectedTotalMinor)} to ${formatMoney(total)}. Check the order and place it again.`,
      { expected_total_minor: Number(expectedTotalMinor), total_minor: total });
  }

  const accessToken = randomToken(24);

  /**
   * Guest checkout is the default, but an order placed with the address of a
   * registered account belongs to that account: it is the same person, and
   * they should find it in their own history rather than only by the token in
   * their mail. The link is made once, here, so the row states the truth.
   */
  let ownerId = customer?.id ?? cart.customer_id ?? null;
  if (!ownerId) {
    const match = await one(
      `SELECT id FROM customer WHERE lower(email) = lower($1) AND status = 'active'`,
      [email],
    );
    if (match) ownerId = match.id;
  }

  let created;
  try {
    created = await tx(async (c) => {
      // A replayed Idempotency-Key returns the order it returned the first time.
      if (idempotencyKey) {
        const { rows: prior } = await c.query(
          `SELECT * FROM "order" WHERE idempotency_key = $1`, [idempotencyKey],
        );
        if (prior[0]) return { order: prior[0], replayed: true };
      }

      // Commit stock in one step: available falls and committed rises per line.
      // The guard lives in the UPDATE itself, so the loser of a race writes
      // nothing and available never goes negative.
      for (const l of lines) {
        if (l.kind === 'protection') continue;
        const { rows } = await c.query(
          `UPDATE inventory_level
              SET available = available - $2, committed = committed + $2
            WHERE variant_id = $1
              AND (available >= $2 OR $3 = 'continue')
            RETURNING available`,
          [l.variant_id, l.quantity, l.inventory_policy],
        );
        if (rows.length === 0) {
          throw conflict('out_of_stock',
            `${l.title} ${l.option_value} is no longer available in that quantity.`,
            { sku: l.sku, resource: l.sku });
        }
      }

      const number = await allocateNumber(c);
      const { rows: or } = await c.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
             discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
             shipping_method, shipping_address, access_token_hash, idempotency_key,
             killbill_external_key, protection_minor)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          number, ownerId, email,
          subtotal + protectionMinor, shipping, tax, total,
          method.code, cart.shipping_address, hashOpaque(accessToken),
          idempotencyKey || null, email.toLowerCase(), protectionMinor,
        ],
      );
      const order = or[0];

      for (const [i, l] of lines.entries()) {
        await c.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity,
              unit_price_minor, total_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            order.id, l.variant_id, `${l.title} ${l.option_value}`.trim(), l.sku,
            l.quantity, l.unit_price_minor, l.unit_price_minor * l.quantity, i + 1,
          ],
        );
      }

      if (protectionMinor > 0 && rung) {
        const { rows: pv } = await c.query(`SELECT id FROM variant WHERE sku = $1`, [rung.sku]);
        if (pv[0]) {
          await c.query(
            `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity,
                unit_price_minor, total_minor, position)
             VALUES ($1,$2,'Shipment protection',$3,1,$4,$4,$5)`,
            [order.id, pv[0].id, rung.sku, protectionMinor, lines.length + 1],
          );
        }
      }

      // The cart is emptied so a reload cannot place it twice.
      await c.query(`DELETE FROM cart_line WHERE cart_id = $1`, [cart.id]);
      await c.query(`UPDATE cart SET protection_enabled = false, updated_at = now() WHERE id = $1`, [cart.id]);

      return { order, replayed: false };
    });
  } catch (err) {
    if (err?.code === PG_UNIQUE_VIOLATION && String(err.constraint || '').includes('idempotency')) {
      const prior = await one(`SELECT * FROM "order" WHERE idempotency_key = $1`, [idempotencyKey]);
      if (prior) created = { order: prior, replayed: true };
      else throw err;
    } else {
      throw err;
    }
  }

  if (created.replayed) {
    const settled = await waitForSettled(created.order.id);
    return { order: settled, lines: await orderLines(settled.id), access_token: null, replayed: true };
  }

  const order = await confirmOrder(created.order, requestId);
  return { order, lines: await orderLines(order.id), access_token: accessToken, replayed: false };
}

/**
 * Raise the invoice and send the mail, exactly once. The order row is locked and
 * only the caller that finds it pending does the outside work, so a replay
 * creates no second account, invoice or mail.
 */
async function confirmOrder(orderRow, requestId) {
  const lines = await orderLines(orderRow.id);
  const externalKey = orderRow.email.toLowerCase();

  let invoice;
  try {
    // One killbill account keyed by the order email lowercased, created or reused.
    const account = await ensureAccount({
      externalKey,
      email: orderRow.email,
      name: orderRow.shipping_address?.name || orderRow.email,
    });

    invoice = await createInvoiceCharge({
      accountId: account.accountId,
      totalMinor: orderRow.total_minor,
      description: `Vela order ${orderRow.number}`,
    });

    // Read the figure back from the platform, so the app never reports a total
    // it has only told itself.
    const confirmed = invoice.invoiceId ? await getInvoice(invoice.invoiceId) : null;

    await query(
      `UPDATE "order"
          SET status = 'confirmed', payment_status = 'invoiced',
              killbill_account_id = $2, killbill_invoice_id = $3, killbill_invoice_amount = $4
        WHERE id = $1`,
      [orderRow.id, account.accountId, invoice.invoiceId, confirmed?.amount ?? invoice.amount],
    );
    logEvent('order invoiced', {
      request_id: requestId, order: orderRow.number,
      killbill_account_id: account.accountId, killbill_invoice_id: invoice.invoiceId,
      amount: invoice.amount,
    });
  } catch (err) {
    // The invoice could not be raised: release the stock this order committed
    // and leave the order cancelled rather than pretending it was paid.
    logError('order billing failed', { request_id: requestId, order: orderRow.number, error: String(err?.message || err) });
    await releaseStock(orderRow.id);
    await query(`UPDATE "order" SET status = 'cancelled' WHERE id = $1`, [orderRow.id]);
    throw new AppError(502, 'billing_unavailable',
      'We could not raise the invoice for this order, so we have not taken it. Nothing was charged. Try again in a moment.');
  }

  // A confirmed order sends exactly one mail. Mail failure does not unmake a
  // confirmed order or a raised invoice; it is logged and the order stands.
  try {
    const fresh = await one(`SELECT * FROM "order" WHERE id = $1`, [orderRow.id]);
    await sendOrderConfirmation(fresh, lines.filter((l) => l.sku_snapshot !== 'VELA-PROTECT-1'));
    logEvent('order mail sent', { request_id: requestId, order: orderRow.number, to: orderRow.email });
  } catch (err) {
    logError('order mail failed', { request_id: requestId, order: orderRow.number, error: String(err?.message || err) });
  }

  return one(`SELECT * FROM "order" WHERE id = $1`, [orderRow.id]);
}

async function releaseStock(orderId) {
  try {
    await query(
      `UPDATE inventory_level il
          SET available = il.available + ol.quantity, committed = GREATEST(il.committed - ol.quantity, 0)
         FROM order_line ol
        WHERE ol.order_id = $1 AND ol.variant_id = il.variant_id`,
      [orderId],
    );
  } catch (err) {
    logError('stock release failed', { order_id: orderId, error: String(err?.message || err) });
  }
}

/**
 * Look up the order a previously seen Idempotency-Key produced. A replay that
 * arrives while the first request is still at the billing platform waits for it
 * to settle rather than reporting a half-made order.
 */
export async function replayOrder(idempotencyKey) {
  const prior = await one(`SELECT * FROM "order" WHERE idempotency_key = $1`, [idempotencyKey]);
  if (!prior) return null;
  const settled = await waitForSettled(prior.id);
  return { order: settled ?? prior, lines: await orderLines(prior.id) };
}

/** A replay may arrive while the first request is still at the billing platform. */
async function waitForSettled(orderId, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let row = await one(`SELECT * FROM "order" WHERE id = $1`, [orderId]);
  while (row && row.status === 'pending' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    row = await one(`SELECT * FROM "order" WHERE id = $1`, [orderId]);
  }
  return row;
}

export async function orderLines(orderId) {
  return many(
    `SELECT ol.*, v.sku, p.handle, p.kind, p.title AS product_title
       FROM order_line ol
       JOIN variant v ON v.id = ol.variant_id
       JOIN product p ON p.id = v.product_id
      WHERE ol.order_id = $1
      ORDER BY ol.position, ol.id`,
    [orderId],
  );
}

export async function orderSerials(orderId) {
  return many(
    `SELECT d.serial, d.status, d.firmware_version, p.title AS model,
            EXISTS (SELECT 1 FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS owned
       FROM device d JOIN product p ON p.id = d.product_id
      WHERE d.order_id = $1
      ORDER BY d.serial`,
    [orderId],
  );
}

export async function findOrderByNumber(number) {
  return one(`SELECT * FROM "order" WHERE number = $1`, [number]);
}

/**
 * One order, readable by its access token or by the customer who owns it.
 * Another customer's order reads as not found, never as forbidden.
 */
export async function readableOrder(number, { accessToken, customer }) {
  const order = await findOrderByNumber(number);
  if (!order) throw notFound('That order does not exist.', 'order_not_found');
  if (accessToken && order.access_token_hash === hashOpaque(accessToken)) return order;
  if (customer && order.customer_id === customer.id) return order;
  throw notFound('That order does not exist.', 'order_not_found');
}

export function orderPayload(order, lines, serials = []) {
  return {
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    currency: order.currency,
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    placed_at: order.placed_at,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    lines: lines.map((l) => ({
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
      kind: l.kind,
      handle: l.handle,
    })),
    serials: serials.map((s) => ({
      serial: s.serial,
      model: s.model,
      status: s.status,
      registered: s.owned,
    })),
  };
}

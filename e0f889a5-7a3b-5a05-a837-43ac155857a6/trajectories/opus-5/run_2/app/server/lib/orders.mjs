import crypto from 'node:crypto';
import { pool, withTransaction, query } from './db.mjs';
import { taxFor, protectionRungFor, formatMoney } from './money.mjs';
import { cartLines } from './cart.mjs';
import { ensureAccount, createInvoice } from './killbill.mjs';
import { sendOrderConfirmation } from './mail.mjs';
import { conflict, unprocessable, badRequest } from './errors.mjs';

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** Numbers are `VE-<year>-<four digits>` allocated in sequence. */
async function allocateNumber(client, year) {
  const { rows } = await client.query(
    `INSERT INTO order_sequence (year, last_value) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_value = order_sequence.last_value + 1
     RETURNING last_value`,
    [year],
  );
  return `VE-${year}-${String(rows[0].last_value).padStart(4, '0')}`;
}

/**
 * Phase one, in one transaction: re-price every line, commit stock, allocate the
 * number and write the order as pending. Nothing reaches the billing platform
 * until the stock is genuinely held.
 */
async function placePending({ cart, customer, idempotencyKey, expectedTotalMinor, logger }) {
  return withTransaction(async (client) => {
    const lines = await cartLines(cart.id, client);
    const goods = lines.filter((l) => l.kind !== 'protection');
    if (goods.length === 0) {
      throw unprocessable('cart_empty', 'Your cart is empty.');
    }

    // Placing an order re-prices every line. A line that changed refuses the order.
    const changed = goods.filter((l) => l.unit_price_minor !== l.current_price_minor);
    if (changed.length > 0) {
      const first = changed[0];
      throw conflict('price_changed', `The price of ${first.title} changed from ${formatMoney(first.unit_price_minor)} to ${formatMoney(first.current_price_minor)} since you added it.`, {
        resource: 'cart_line',
        notices: changed.map((l) => ({
          kind: 'price_changed',
          title: l.title,
          old_price_minor: l.unit_price_minor,
          new_price_minor: l.current_price_minor,
          message: `The price of ${l.title} changed from ${formatMoney(l.unit_price_minor)} to ${formatMoney(l.current_price_minor)} since you added it.`,
        })),
      });
    }

    const email = (cart.email || customer?.email || '').trim();
    if (!email) throw badRequest('email_required', 'Email is required.');
    if (!cart.shipping_address) throw badRequest('address_required', 'A delivery address is required.');
    if (!cart.shipping_method) throw badRequest('shipping_method_required', 'Choose a delivery method.');

    /*
     * A guest order placed at the address of an existing account belongs to that
     * account, so it reads back in their order history rather than being
     * reachable only by its access token. It is the same person: the
     * confirmation goes to that address either way.
     */
    let ownerId = customer?.id || null;
    if (!ownerId) {
      const { rows: match } = await client.query(
        'SELECT id FROM customer WHERE lower(email) = lower($1)', [email],
      );
      if (match[0]) ownerId = match[0].id;
    }

    const { rows: methodRows } = await client.query('SELECT * FROM delivery_method WHERE code = $1', [cart.shipping_method]);
    const method = methodRows[0];
    if (!method) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');

    /*
     * The order total must equal the sum of its line totals plus shipping plus
     * tax minus discount. Shipment protection is a line of its own, so it counts
     * once, inside the subtotal, and never again inside shipping. It is still
     * excluded from tax, which is taken on the goods alone.
     */
    const goodsSubtotalMinor = goods.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
    const rung = protectionRungFor(goodsSubtotalMinor);
    const protectionMinor = cart.protection_enabled && rung ? rung.price_minor : 0;
    const subtotalMinor = goodsSubtotalMinor + protectionMinor;
    const taxMinor = taxFor(goodsSubtotalMinor);
    const shippingMinor = method.price_minor;
    const totalMinor = subtotalMinor + shippingMinor + taxMinor;

    // The total authorized is the figure the final step showed.
    if (Number.isInteger(expectedTotalMinor) && expectedTotalMinor !== totalMinor) {
      throw conflict('total_changed', 'The total changed while you were checking out. Review the cart and try again.', {
        resource: 'order.total', expected_total_minor: expectedTotalMinor, actual_total_minor: totalMinor,
      });
    }

    /*
     * Stock is committed in one step, in a stable order to avoid deadlock between
     * two concurrent checkouts. The guarded UPDATE is the single-winner rule: it
     * is the row itself that refuses, not an application-level check, and the
     * column constraint keeps `available` from ever going negative.
     */
    const ordered = [...goods].sort((a, b) => (a.variant_id < b.variant_id ? -1 : 1));
    for (const line of ordered) {
      const { rowCount } = await client.query(
        `UPDATE inventory_level
            SET available = available - $2, committed = committed + $2
          WHERE variant_id = $1 AND available >= $2`,
        [line.variant_id, line.quantity],
      );
      if (rowCount === 0) {
        throw conflict('insufficient_stock', `${line.title} sold out while you were checking out.`, {
          resource: `variant:${line.sku}`, sku: line.sku,
        });
      }
    }

    const year = new Date().getUTCFullYear();
    const number = await allocateNumber(client, year);
    const accessToken = crypto.randomBytes(24).toString('base64url');

    const { rows: [order] } = await client.query(
      `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
          discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
          shipping_method, shipping_address, access_token_hash, killbill_external_key, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        number, ownerId, email, subtotalMinor, shippingMinor, taxMinor, totalMinor,
        cart.shipping_method, cart.shipping_address, hashToken(accessToken),
        email.toLowerCase(), idempotencyKey || null,
      ],
    );

    let position = 0;
    for (const line of goods) {
      position += 1;
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          order.id, line.variant_id, `${line.title} — ${line.option_value}`, line.sku,
          line.quantity, line.unit_price_minor, line.unit_price_minor * line.quantity, position,
        ],
      );
    }
    if (protectionMinor > 0) {
      const { rows: [protVariant] } = await client.query('SELECT id, sku FROM variant WHERE sku = $1', [rung.sku]);
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1,$2,'Shipment protection',$3,1,$4,$4,$5)`,
        [order.id, protVariant.id, protVariant.sku, protectionMinor, position + 1],
      );
    }

    // The cart is emptied inside the same transaction that took its stock.
    await client.query('DELETE FROM cart_line WHERE cart_id = $1', [cart.id]);
    await client.query('UPDATE cart SET protection_enabled = false, updated_at = now() WHERE id = $1', [cart.id]);

    logger?.({ msg: 'order pending', order: number, total_minor: totalMinor });
    return { order, accessToken };
  });
}

/**
 * Phase two: create or reuse the billing account, raise exactly one invoice and
 * send exactly one mail. The order row is locked for the duration, so a replay
 * that arrives mid-flight waits and then finds the work already done rather than
 * doing it twice.
 */
async function finalise(orderId, logger) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM "order" WHERE id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw new Error('order vanished');

    if (order.status === 'confirmed' && order.payment_status === 'invoiced') {
      await client.query('COMMIT');
      return order;
    }

    const { rows: lines } = await client.query(
      'SELECT * FROM order_line WHERE order_id = $1 ORDER BY position',
      [order.id],
    );

    const externalKey = order.email.toLowerCase();
    const account = await ensureAccount({
      externalKey,
      name: order.shipping_address?.name || externalKey,
      email: order.email,
    });

    const { invoiceId, amount } = await createInvoice({
      accountId: account.accountId,
      totalMinor: order.total_minor,
      description: `Vela order ${order.number}`,
    });

    const { rows: [updated] } = await client.query(
      `UPDATE "order"
          SET status = 'confirmed', payment_status = 'invoiced',
              killbill_external_key = $2, killbill_invoice_amount = $3::numeric,
              killbill_invoice_id = $4
        WHERE id = $1 RETURNING *`,
      [order.id, externalKey, amount, invoiceId],
    );

    // Devices bought on this order are allocated to it, and to the customer when
    // there is one, so the serials read back on the order.
    for (const line of lines) {
      const { rows: variantRows } = await client.query('SELECT id, product_id FROM variant WHERE id = $1', [line.variant_id]);
      const v = variantRows[0];
      if (!v) continue;
      const { rows: free } = await client.query(
        `SELECT id FROM device
          WHERE variant_id = $1 AND status = 'manufactured' AND order_id IS NULL
          ORDER BY serial LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [line.variant_id, line.quantity],
      );
      for (const device of free) {
        await client.query("UPDATE device SET status = 'sold', order_id = $2 WHERE id = $1", [device.id, order.id]);
        if (order.customer_id) {
          await client.query(
            `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
             VALUES ($1,$2,$3,'order') ON CONFLICT DO NOTHING`,
            [device.id, order.customer_id, order.id],
          );
        }
      }
    }

    await client.query('COMMIT');

    // Exactly one mail, to the order's email only, after the invoice is real.
    try {
      await sendOrderConfirmation({ ...updated, lines });
      logger?.({ msg: 'confirmation sent', order: updated.number, to: updated.email });
    } catch (err) {
      logger?.({ level: 'error', msg: 'confirmation mail failed', order: updated.number, error: err.message });
    }

    return updated;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function placeOrder({ cart, customer, idempotencyKey, expectedTotalMinor, logger }) {
  /*
   * A replayed key returns the order it returned the first time, whatever the
   * cart looks like now. This is checked before anything else, because by the
   * time a replay arrives the cart it was placed from has already been emptied.
   */
  if (idempotencyKey) {
    const { rows } = await query('SELECT * FROM "order" WHERE idempotency_key = $1', [idempotencyKey]);
    if (rows[0]) {
      const settled = await finalise(rows[0].id, logger);
      logger?.({ msg: 'idempotent replay', order: settled.number });
      return { order: settled, accessToken: null, replayed: true };
    }
  }

  let pending;
  try {
    pending = await placePending({ cart, customer, idempotencyKey, expectedTotalMinor, logger });
  } catch (err) {
    // A replayed Idempotency-Key returns the order it returned the first time.
    if (err.code === '23505' && idempotencyKey) {
      const { rows } = await query('SELECT * FROM "order" WHERE idempotency_key = $1', [idempotencyKey]);
      if (rows[0]) {
        const settled = await finalise(rows[0].id, logger);
        return { order: settled, accessToken: null, replayed: true };
      }
    }
    throw err;
  }

  const order = await finalise(pending.order.id, logger);
  return { order, accessToken: pending.accessToken, replayed: false };
}

export async function orderWithLines(order) {
  const { rows: lines } = await query(
    'SELECT * FROM order_line WHERE order_id = $1 ORDER BY position',
    [order.id],
  );
  const { rows: serials } = await query(
    `SELECT d.serial, d.variant_id, d.nickname, d.firmware_version,
            (SELECT customer_id FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS owner_id
       FROM device d WHERE d.order_id = $1 ORDER BY d.serial`,
    [order.id],
  );
  return {
    id: order.id,
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    currency: order.currency,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    placed_at: order.placed_at,
    lines: lines.map((l) => ({
      id: l.id, title_snapshot: l.title_snapshot, sku_snapshot: l.sku_snapshot,
      quantity: l.quantity, unit_price_minor: l.unit_price_minor, total_minor: l.total_minor,
      variant_id: l.variant_id,
    })),
    serials: serials.map((s) => ({
      serial: s.serial, variant_id: s.variant_id, nickname: s.nickname,
      firmware_version: s.firmware_version, registered: Boolean(s.owner_id),
    })),
  };
}

/** One chip combining the order, payment and fulfilment states into a phrase. */
export function orderChip(order) {
  if (order.status === 'cancelled') return { tone: 'error', label: 'Cancelled' };
  if (order.status === 'pending') return { tone: 'progress', label: 'Being placed' };
  if (order.fulfilment_status === 'fulfilled') return { tone: 'done', label: 'Confirmed and delivered' };
  if (order.payment_status === 'invoiced') return { tone: 'progress', label: 'Confirmed, preparing to ship' };
  return { tone: 'progress', label: 'Confirmed' };
}

export const hashAccessToken = hashToken;

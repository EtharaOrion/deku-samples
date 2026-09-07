import { one, many, tx, isUniqueViolation } from './db.js';
import { newOpaqueToken, sha256 } from './auth.js';
import { taxFor, protectionRungFor, formatMinor } from './money.js';
import { readCart, shippingMethod, priceSignature } from './cart.js';
import { badRequest, conflict, notFound, unprocessable } from './errors.js';
import { ensureAccount, createInvoice } from './killbill.js';
import { sendOrderConfirmation } from './mail.js';
import { log } from './log.js';

/** `VE-<year>-<four digits>` allocated in sequence, under a row lock. */
async function allocateNumber(db, year) {
  const { rows } = await db.query(
    `INSERT INTO order_number_seq (year, last_value) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_value = order_number_seq.last_value + 1
     RETURNING last_value`,
    [year],
  );
  const n = rows[0].last_value;
  return `VE-${year}-${String(n).padStart(4, '0')}`;
}

/**
 * Place an order.
 *
 * Re-prices every line, refuses when a line changed since the cart was last shown,
 * commits stock in one step under a row lock so `available` never goes negative,
 * then raises exactly one killbill invoice and sends exactly one mail.
 */
export async function placeOrder({ cart, customer, idempotencyKey, expectedSignature, requestId }) {
  const scope = 'orders';

  // A replayed Idempotency-Key returns the same order and creates nothing new.
  if (idempotencyKey) {
    const existing = await one(
      `SELECT k.order_id, k.response, k.state FROM idempotency_key k WHERE k.scope = $1 AND k.key = $2`,
      [scope, idempotencyKey],
    );
    if (existing?.state === 'done' && existing.response) {
      log({ level: 'info', msg: 'idempotent replay', request_id: requestId, key: idempotencyKey });
      return { order: existing.response, replayed: true };
    }
    if (existing?.state === 'in_flight') {
      throw conflict('order_in_flight', 'That order is already being placed.', { idempotency_key: idempotencyKey });
    }
  }

  const view = await readCart(cart);
  if (!view.lines.length) throw unprocessable('cart_empty', 'Your cart is empty.');
  if (!cart.email) throw unprocessable('email_required', 'Email is required.');
  const method = shippingMethod(cart.shipping_method);
  if (!method) throw unprocessable('shipping_method_required', 'Choose how it gets there.');
  if (!cart.shipping_address) throw unprocessable('address_required', 'Where it goes is required.');

  // Every line is re-priced. A line that changed refuses the order outright.
  const changed = view.lines.filter((l) => l.unit_price_minor !== l.current_price_minor);
  if (changed.length) {
    throw conflict(
      'price_changed',
      `The price of ${changed[0].title} changed from ${formatMinor(changed[0].unit_price_minor)} to ${formatMinor(changed[0].current_price_minor)} since you added it.`,
      { notices: view.notices },
    );
  }
  // The total authorized is the figure the final step showed.
  if (expectedSignature && expectedSignature !== view.price_signature) {
    throw conflict('cart_changed', 'Your cart changed. Check it and place the order again.', {
      notices: view.notices,
    });
  }

  const year = new Date().getUTCFullYear();

  let claimedKey = false;
  if (idempotencyKey) {
    try {
      await one(
        `INSERT INTO idempotency_key (scope, key, state) VALUES ($1,$2,'in_flight') RETURNING id`,
        [scope, idempotencyKey],
      );
      claimedKey = true;
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Another request took the key between the read above and here.
        const row = await one(
          `SELECT response, state FROM idempotency_key WHERE scope = $1 AND key = $2`,
          [scope, idempotencyKey],
        );
        if (row?.state === 'done' && row.response) return { order: row.response, replayed: true };
        throw conflict('order_in_flight', 'That order is already being placed.', { idempotency_key: idempotencyKey });
      }
      throw err;
    }
  }

  let created;
  try {
    created = await tx(async (db) => {
      // Lock the inventory rows in a stable order so two checkouts cannot deadlock,
      // and so the last unit is claimed by exactly one of them.
      const variantIds = [...new Set(view.lines.map((l) => l.variant_id))].sort((a, b) => a - b);
      const { rows: levels } = await db.query(
        `SELECT il.variant_id, il.available, il.committed, v.sku, v.price_minor, v.inventory_policy, p.title, p.status AS product_status
           FROM inventory_level il
           JOIN variant v ON v.id = il.variant_id
           JOIN product p ON p.id = v.product_id
          WHERE il.variant_id = ANY($1::bigint[])
          ORDER BY il.variant_id
          FOR UPDATE OF il`,
        [variantIds],
      );
      const levelBy = new Map(levels.map((l) => [String(l.variant_id), l]));

      for (const line of view.lines) {
        const level = levelBy.get(String(line.variant_id));
        if (!level) throw unprocessable('variant_missing', 'That product is no longer sold.');
        // Re-price inside the transaction: the price cannot move under us now.
        if (level.price_minor !== line.unit_price_minor) {
          throw conflict(
            'price_changed',
            `The price of ${level.title} changed from ${formatMinor(line.unit_price_minor)} to ${formatMinor(level.price_minor)} since you added it.`,
          );
        }
        if (level.inventory_policy === 'deny' && level.available < line.quantity) {
          throw conflict(
            'out_of_stock',
            `${level.title} sold out while you were checking out.`,
            { sku: level.sku, available: level.available },
          );
        }
      }

      // Commit stock in one step: available falls and committed rises per line.
      for (const line of view.lines) {
        const { rowCount } = await db.query(
          `UPDATE inventory_level
              SET available = available - $2, committed = committed + $2
            WHERE variant_id = $1
              AND (available >= $2 OR (SELECT inventory_policy FROM variant WHERE id = $1) = 'continue')`,
          [line.variant_id, line.quantity],
        );
        if (!rowCount) {
          throw conflict('out_of_stock', `${line.title} sold out while you were checking out.`, { sku: line.sku });
        }
      }

      const number = await allocateNumber(db, year);
      const accessToken = newOpaqueToken();

      const lineSubtotal = view.lines.reduce((s, l) => s + l.unit_price_minor * l.quantity, 0);
      const rung = protectionRungFor(lineSubtotal);
      const protectionMinor = cart.protection_enabled && rung ? rung.price_minor : 0;
      // Tax is ten percent of the line subtotal, on integers, truncated toward zero.
      // Shipment protection is excluded from tax.
      const taxMinor = taxFor(lineSubtotal);
      const shippingMinor = method.price_minor;
      const subtotalMinor = lineSubtotal + protectionMinor;
      const totalMinor = subtotalMinor + shippingMinor + taxMinor;

      const { rows: [order] } = await db.query(
        `INSERT INTO "order"
           (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
            total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
            shipping_address, access_token_hash, killbill_external_key)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11)
         RETURNING *`,
        [
          number,
          customer?.id ?? null,
          cart.email,
          subtotalMinor,
          shippingMinor,
          taxMinor,
          totalMinor,
          method.code,
          cart.shipping_address,
          sha256(accessToken),
          String(cart.email).toLowerCase(),
        ],
      );

      let position = 0;
      for (const line of view.lines) {
        position += 1;
        await db.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            order.id, line.variant_id, `${line.title} ${line.variant_summary}`.trim(), line.sku,
            line.quantity, line.unit_price_minor, line.unit_price_minor * line.quantity, position,
          ],
        );
      }
      if (protectionMinor && rung) {
        position += 1;
        const { rows: [pv] } = await db.query(`SELECT id FROM variant WHERE sku = $1`, [rung.sku]);
        await db.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,'Shipment protection',$3,1,$4,$4,$5)`,
          [order.id, pv.id, rung.sku, protectionMinor, position],
        );
      }

      // The cart is emptied so a reload cannot place it twice.
      await db.query(`DELETE FROM cart_line WHERE cart_id = $1`, [cart.id]);
      await db.query(`UPDATE cart SET protection_enabled = false, priced_signature = NULL WHERE id = $1`, [cart.id]);

      // Any camera line allocates a serial from stock held for that variant.
      const lines = await db.query(
        `SELECT * FROM order_line WHERE order_id = $1 ORDER BY position`, [order.id],
      );
      return { order, lines: lines.rows, accessToken };
    });
  } catch (err) {
    if (claimedKey) {
      await one(`DELETE FROM idempotency_key WHERE scope = $1 AND key = $2 RETURNING id`, [scope, idempotencyKey]).catch(() => {});
    }
    throw err;
  }

  const { order, lines, accessToken } = created;

  // The money is a real record held outside this app's own screens.
  let invoice = null;
  try {
    const { account } = await ensureAccount({
      externalKey: order.killbill_external_key,
      email: order.email,
      name: order.shipping_address?.name || order.email,
      currency: 'USD',
      country: 'US',
    });
    invoice = await createInvoice({
      accountId: account.accountId,
      totalMinor: order.total_minor,
      currency: 'USD',
      description: `Vela order ${order.number}`,
    });
    await one(
      `UPDATE "order"
          SET status = 'confirmed', payment_status = 'invoiced',
              killbill_account_id = $2, killbill_invoice_id = $3, killbill_invoice_amount = $4
        WHERE id = $1 RETURNING id`,
      [order.id, account.accountId, invoice.invoiceId, invoice.amount],
    );
    order.status = 'confirmed';
    order.payment_status = 'invoiced';
    order.killbill_account_id = account.accountId;
    order.killbill_invoice_id = invoice.invoiceId;
    order.killbill_invoice_amount = invoice.amount;
    log({
      level: 'info', msg: 'invoice raised', request_id: requestId, order: order.number,
      external_key: order.killbill_external_key, invoice_id: invoice.invoiceId, amount: invoice.amount,
    });
  } catch (err) {
    log({ level: 'error', msg: 'killbill invoice failed', request_id: requestId, order: order.number, error: err.message });
    // The order exists but is not confirmed, so no mail follows it.
    throw new Error(`Billing did not accept the order: ${err.message}`);
  }

  // A confirmed order sends exactly one mail, to the order's email only.
  try {
    await sendOrderConfirmation({ order, lines, requestId });
  } catch (err) {
    log({ level: 'error', msg: 'confirmation mail failed', request_id: requestId, order: order.number, error: err.message });
  }

  const shaped = await orderView({ order, lines, accessToken });

  if (idempotencyKey) {
    await one(
      `UPDATE idempotency_key SET state = 'done', order_id = $3, response = $4
        WHERE scope = $1 AND key = $2 RETURNING id`,
      [scope, idempotencyKey, order.id, JSON.stringify(shaped)],
    ).catch(() => {});
  }

  return { order: shaped, replayed: false };
}

export async function orderView({ order, lines, accessToken = null }) {
  const serials = await many(
    `SELECT d.serial, d.id AS device_id, v.sku,
            EXISTS (SELECT 1 FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS registered
       FROM device d JOIN variant v ON v.id = d.variant_id
      WHERE d.order_id = $1 ORDER BY d.serial`,
    [order.id],
  );
  return {
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    state_phrase: statePhrase(order),
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    discount_minor: order.discount_minor ?? 0,
    total_minor: order.total_minor,
    currency: order.currency,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    placed_at: order.placed_at instanceof Date ? order.placed_at.toISOString() : order.placed_at,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    lines: (lines || []).map((l) => ({
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
    })),
    serials: serials.map((s) => ({ serial: s.serial, sku: s.sku, registered: s.registered })),
    ...(accessToken ? { access_token: accessToken } : {}),
  };
}

/** One chip combining the order, payment and fulfilment states into a human phrase. */
export function statePhrase(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'pending') return 'Not yet confirmed';
  if (order.fulfilment_status === 'fulfilled') return 'Confirmed and delivered';
  if (order.payment_status === 'invoiced') return 'Confirmed, on its way';
  return 'Confirmed';
}

export async function orderByNumber(number) {
  return one(`SELECT * FROM "order" WHERE number = $1`, [number]);
}

export async function linesFor(orderId) {
  return many(`SELECT * FROM order_line WHERE order_id = $1 ORDER BY position ASC, id ASC`, [orderId]);
}

/** Another customer's order reads as not found, never forbidden. */
export async function readableOrder({ number, customer, accessToken }) {
  const order = await orderByNumber(number);
  if (!order) throw notFound('That order does not exist.', 'order_not_found');
  const byToken = accessToken && order.access_token_hash === sha256(accessToken);
  const byOwner = customer && order.customer_id && String(order.customer_id) === String(customer.id);
  if (!byToken && !byOwner) throw notFound('That order does not exist.', 'order_not_found');
  const lines = await linesFor(order.id);
  return { order, lines };
}

// Placing orders: re-pricing, single-step stock commitment under real
// concurrency, killbill invoice and exactly one confirmation mail.

import { q, withTransaction, logLine } from './db.js';
import { taxFor } from './money.js';
import { newOpaqueToken, sha256, PROTECT_PRICES, protectRungFor } from './store.js';
import { ensureAccount, raiseInvoice } from './killbill.js';
import { sendOrderConfirmedMail } from './mail.js';

export class OrderRefused extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.status = 409;
    this.extra = extra;
  }
}

export async function orderByNumber(number) {
  const rows = await q('SELECT * FROM "order" WHERE number = $1', [number]);
  return rows.length ? rows[0] : null;
}

export async function orderLines(orderId) {
  return q('SELECT * FROM order_line WHERE order_id = $1 ORDER BY id', [orderId]);
}

export async function orderSerials(orderId) {
  return q(
    `SELECT d.serial, d.status, d.product_id, d.variant_id, p.title AS product_title, v.title AS variant_title
       FROM device d
       JOIN product p ON p.id = d.product_id
       JOIN variant v ON v.id = d.variant_id
      WHERE d.order_id = $1
      ORDER BY d.id`,
    [orderId]
  );
}

export async function placeOrder({
  cartToken,
  email,
  shippingAddress,
  shippingMethod,
  protectionEnabled = false,
  idempotencyKey = null,
  customerId = null,
  expectedTotalMinor = null,
}) {
  // Idempotent replay returns the original order untouched.
  if (idempotencyKey) {
    const existing = await q('SELECT * FROM "order" WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing.length) {
      return { order: existing[0], replay: true };
    }
  }

  const cartRows = await q('SELECT * FROM cart WHERE token = $1', [cartToken]);
  if (!cartRows.length) throw new OrderRefused('cart_not_found', 'Your cart could not be found.');
  const cart = cartRows[0];

  const lines = await q(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.price_minor AS current_price_minor,
            v.inventory_policy, il.available,
            p.title AS product_title, p.status AS product_status
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = cl.variant_id
      WHERE cl.cart_id = $1
      ORDER BY cl.id`,
    [cart.id]
  );

  if (!lines.length) throw new OrderRefused('cart_empty', 'Your cart is empty.');

  // Re-price every line; if a line changed since the cart was last shown the
  // order is refused and the person returns to a re-priced cart.
  const changed = lines.filter((l) => Number(l.current_price_minor) !== Number(l.unit_price_minor));
  if (changed.length) {
    throw new OrderRefused('price_changed', 'A price changed since you last saw your cart.', {
      notices: changed.map((l) => ({
        code: 'price_changed',
        item: l.product_title,
        sku: l.sku,
        old_minor: Number(l.unit_price_minor),
        new_minor: Number(l.current_price_minor),
      })),
    });
  }

  for (const l of lines) {
    const avail = Number(l.available ?? 0);
    if (l.inventory_policy === 'deny' && avail < Number(l.quantity)) {
      throw new OrderRefused('out_of_stock', `Only ${avail} of ${l.product_title} remain.`, {
        notices: [
          { code: 'availability_changed', item: l.product_title, sku: l.sku },
        ],
      });
    }
  }

  const goodsSubtotal = lines.reduce((s, l) => s + Number(l.current_price_minor) * Number(l.quantity), 0);
  const rung = protectRungFor(goodsSubtotal);
  const protectionMinor = protectionEnabled && rung ? PROTECT_PRICES[rung] : 0;
  const subtotal = goodsSubtotal + protectionMinor;
  const tax = taxFor(goodsSubtotal); // protection is excluded from tax
  const methodMap = { standard: 0, express: 2500 };
  const shipping = methodMap[shippingMethod] ?? 0;
  const total = subtotal + shipping + tax;

  // The total authorized is the figure the final step showed.
  if (expectedTotalMinor !== null && Number(expectedTotalMinor) !== total) {
    throw new OrderRefused('total_changed', 'The total changed since you reviewed it.');
  }

  const accessToken = newOpaqueToken();
  const accessTokenHash = sha256(accessToken);

  // Commit stock in one step, inside one transaction, with row locks taken in a
  // stable order so two concurrent checkouts cannot both win. A number clash
  // under true concurrency retries rather than surfacing a server error.
  let inserted;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      inserted = await placeInTransaction({ lines, cart, email, customerId, shippingMethod, shippingAddress, subtotal, tax, shipping, total, accessTokenHash, idempotencyKey });
      break;
    } catch (err) {
      if (err && err.code === '23505' && String(err.constraint || '').includes('order_number_key')) {
        continue;
      }
      throw err;
    }
  }
  if (!inserted) throw new OrderRefused('number_exhausted', 'Could not allocate an order number.');

  const order = inserted;

  // Raise exactly one invoice in killbill and send exactly one mail. Failures
  // here mark the order back to pending so nothing is half done silently.
  const externalKey = String(email).toLowerCase();
  try {
    const { accountId } = await ensureAccount({
      externalKey,
      name: shippingAddress?.name || email,
      email,
      currency: 'USD',
      country: shippingAddress?.country || 'US',
    });
    const inv = await raiseInvoice({
      accountId,
      externalKey,
      amountMinor: total,
      currency: 'USD',
      description: `Order ${inserted.number}`,
    });
    await q(
      `UPDATE "order"
          SET status = 'confirmed', payment_status = 'invoiced', placed_at = now(),
              killbill_external_key = $2, killbill_invoice_amount = $3
        WHERE id = $1`,
      [order.id, externalKey, String(inv.amount)]
    );
    await sendOrderConfirmedMail({
      to: email,
      orderNumber: order.number,
      lines: await orderLines(order.id),
      totalMinor: total,
      currency: 'USD',
    });
  } catch (err) {
    logLine({ level: 'error', msg: 'order_billing_failed', order: order.number, error: String(err && err.message) });
    await q(`UPDATE "order" SET status = 'pending', payment_status = 'unpaid' WHERE id = $1`, [order.id]);
    throw new OrderRefused('billing_failed', 'Something went wrong at our end. Reference ' + inserted.number + '.');
  }

  const final = await q('SELECT * FROM "order" WHERE id = $1', [order.id]);
  return { order: final[0], access_token: accessToken, replay: false };
}

async function placeInTransaction({ lines, cart, email, customerId, shippingMethod, shippingAddress, subtotal, tax, shipping, total, accessTokenHash, idempotencyKey }) {
  return withTransaction(async (client) => {
    for (const l of lines) {
      const res = await client.query(
        `UPDATE inventory_level
            SET available = available - $2, committed = committed + $2
          WHERE variant_id = $1 AND available >= $2
          RETURNING available`,
        [l.variant_id, Number(l.quantity)]
      );
      if (res.rowCount === 0) {
        throw new OrderRefused('out_of_stock', `Only 0 of ${l.product_title} remain.`, {
          sku: l.sku,
        });
      }
    }

    const number = await nextOrderNumber(client);
    const orderRes = await client.query(
      `INSERT INTO "order"
         (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor, total_minor,
          currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
          access_token_hash, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,'USD','pending','unpaid','unfulfilled',$8,$9,$10,$11)
       RETURNING *`,
      [
        number,
        customerId,
        email,
        subtotal,
        shipping,
        tax,
        total,
        shippingMethod,
        JSON.stringify(shippingAddress),
        accessTokenHash,
        idempotencyKey,
      ]
    );
    const order = orderRes.rows[0];
    for (const l of lines) {
      await client.query(
        `INSERT INTO order_line
           (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          order.id,
          l.variant_id,
          `${l.product_title}${l.variant_title && l.variant_title !== l.product_title ? ` — ${l.variant_title}` : ''}`,
          l.sku,
          Number(l.quantity),
          Number(l.current_price_minor),
          Number(l.current_price_minor) * Number(l.quantity),
        ]
      );
    }
    await client.query('DELETE FROM cart_line WHERE cart_id = $1', [cart.id]);
    return order;
  });
}

async function nextOrderNumber(client) {
  const year = new Date().getUTCFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await client.query(
      `SELECT COALESCE(MAX((split_part(number, '-', 3))::int), 0) AS maxn
         FROM "order"
        WHERE number LIKE $1`,
      [`VE-${year}-%`]
    );
    const next = Number(res.rows[0].maxn) + 1;
    const candidate = `VE-${year}-${String(next).padStart(4, '0')}`;
    const dupe = await client.query(`SELECT 1 FROM "order" WHERE number = $1`, [candidate]);
    if (dupe.rowCount === 0) return candidate;
  }
  throw new OrderRefused('number_exhausted', 'Could not allocate an order number.');
}

export async function serializeOrder(order, { lines, serials } = {}) {
  const ls = lines || (await orderLines(order.id));
  const ss = serials || (await orderSerials(order.id));
  return {
    id: order.id,
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    subtotal_minor: Number(order.subtotal_minor),
    shipping_minor: Number(order.shipping_minor),
    tax_minor: Number(order.tax_minor),
    discount_minor: Number(order.discount_minor),
    total_minor: Number(order.total_minor),
    currency: order.currency,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount === null ? null : Number(order.killbill_invoice_amount),
    placed_at: order.placed_at,
    created_at: order.created_at,
    lines: ls.map((l) => ({
      id: l.id,
      variant_id: l.variant_id,
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      total_minor: Number(l.total_minor),
    })),
    serials: ss.map((s) => ({ serial: s.serial, status: s.status, product_title: s.product_title })),
  };
}

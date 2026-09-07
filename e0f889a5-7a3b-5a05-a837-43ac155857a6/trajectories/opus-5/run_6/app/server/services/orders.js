import { many, one, query, withTransaction } from '../db.js';
import { randomToken, sha256 } from '../passwords.js';
import { AppError, badRequest, conflict, notFound } from '../errors.js';
import { formatMinor, taxFor } from '../money.js';
import { deliveryMethods } from './catalogue.js';
import { lineTitle, readCart } from './cart.js';
import * as killbill from '../killbill.js';
import { sendOrderConfirmation } from '../mail.js';
import { log } from '../log.js';

const IDEMPOTENCY_SCOPE = 'orders.create';

function orderYear() {
  return new Date().getUTCFullYear();
}

async function allocateNumber(client) {
  const year = orderYear();
  await client.query(
    `INSERT INTO order_number_counter (year, last_number) VALUES ($1, 0) ON CONFLICT (year) DO NOTHING`,
    [year],
  );
  const r = await client.query(
    `UPDATE order_number_counter SET last_number = last_number + 1 WHERE year = $1 RETURNING last_number`,
    [year],
  );
  const n = r.rows[0].last_number;
  return `VE-${year}-${String(n).padStart(4, '0')}`;
}

export function orderChip(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'pending') return 'Placed, awaiting confirmation';
  if (order.fulfilment_status === 'fulfilled') return 'Confirmed, invoiced and delivered';
  if (order.payment_status === 'invoiced') return 'Confirmed and invoiced, not yet shipped';
  return 'Confirmed, not yet invoiced';
}

export async function serialiseOrder(order, { includeAccessToken } = {}) {
  const lines = await many(
    `SELECT id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position
       FROM order_line WHERE order_id = $1 ORDER BY position, id`,
    [order.id],
  );
  const devices = await many(
    `SELECT d.serial, d.variant_id, d.firmware_version,
            (SELECT count(*) FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS live_owners
       FROM device d WHERE d.order_id = $1 ORDER BY d.serial`,
    [order.id],
  );
  const methods = await deliveryMethods('US');
  const method = methods.find((m) => m.code === order.shipping_method);
  return {
    id: String(order.id),
    number: order.number,
    email: order.email,
    customer_id: order.customer_id ? String(order.customer_id) : null,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    state_chip: orderChip(order),
    currency: order.currency,
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    shipping_method: order.shipping_method,
    shipping_method_title: method ? method.title : order.shipping_method,
    shipping_address: order.shipping_address,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount === null ? null : String(order.killbill_invoice_amount),
    placed_at: order.placed_at instanceof Date ? order.placed_at.toISOString() : order.placed_at,
    lines: lines.map((l) => ({
      id: String(l.id),
      variant_id: String(l.variant_id),
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
    })),
    serials: devices.map((d) => ({
      serial: d.serial,
      variant_id: String(d.variant_id),
      firmware_version: d.firmware_version,
      registered: Number(d.live_owners) > 0,
    })),
    ...(includeAccessToken ? { access_token: includeAccessToken } : {}),
  };
}

export async function orderByNumber(number) {
  return one(`SELECT * FROM "order" WHERE upper(number) = upper($1)`, [String(number || '')]);
}

export function orderTokenMatches(order, token) {
  return Boolean(token) && order.access_token_hash === sha256(String(token));
}

async function releaseCommittedStock(commits) {
  for (const c of commits) {
    await query(
      `UPDATE inventory_level SET available = available + $2, committed = GREATEST(committed - $2, 0) WHERE variant_id = $1`,
      [c.variantId, c.quantity],
    );
  }
}

async function waitForIdempotentOrder(key) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const row = await one(`SELECT order_id, access_token FROM idempotency_key WHERE scope = $1 AND key = $2`, [
      IDEMPOTENCY_SCOPE,
      key,
    ]);
    if (!row) return null;
    if (row.order_id) {
      const order = await one(`SELECT * FROM "order" WHERE id = $1`, [row.order_id]);
      if (order) return { order, accessToken: row.access_token };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new AppError(409, 'in_flight', 'That order is still being placed. Try again in a moment.');
}

export async function placeOrder({ cart, customer, idempotencyKey, requestId }) {
  // A replay of a key the server has already seen returns the same order it
  // returned the first time, before anything else is looked at.
  let claimedKey = false;
  if (idempotencyKey) {
    const inserted = await one(
      `INSERT INTO idempotency_key (scope, key) VALUES ($1, $2)
       ON CONFLICT (scope, key) DO NOTHING RETURNING id`,
      [IDEMPOTENCY_SCOPE, idempotencyKey],
    );
    if (!inserted) {
      const replay = await waitForIdempotentOrder(idempotencyKey);
      if (replay) return { order: replay.order, accessToken: replay.accessToken, replayed: true };
      throw conflict('replay_failed', 'That order was not placed. Start again from your cart.');
    }
    claimedKey = true;
  }

  const releaseKey = async () => {
    if (!claimedKey) return;
    await query('DELETE FROM idempotency_key WHERE scope = $1 AND key = $2 AND order_id IS NULL', [
      IDEMPOTENCY_SCOPE,
      idempotencyKey,
    ]);
  };

  let view;
  try {
    view = await validateCart(cart);
  } catch (err) {
    await releaseKey();
    throw err;
  }

  const accessToken = randomToken(24);
  const commits = [];
  let created;

  try {
    created = await buildOrder({ cart, customer, view, accessToken, commits });
  } catch (err) {
    await releaseKey();
    throw err;
  }

  // The money is a record outside this app: one account keyed by the order email,
  // one invoice on it for the order total in USD.
  try {
    const account = await killbill.ensureAccount(
      {
        externalKey: created.killbill_external_key,
        email: created.email,
        name: created.shipping_address && created.shipping_address.name ? created.shipping_address.name : created.email,
      },
      requestId,
    );
    const invoice = await killbill.createInvoice(
      { accountId: account.accountId, totalMinor: created.total_minor, description: `Order ${created.number}` },
      requestId,
    );
    created = await one(
      `UPDATE "order" SET status = 'confirmed', payment_status = 'invoiced',
              killbill_invoice_amount = $2::numeric, killbill_invoice_id = $3
        WHERE id = $1 RETURNING *`,
      [created.id, invoice.amount, invoice.invoiceId],
    );
  } catch (err) {
    await releaseCommittedStock(commits);
    await query(`UPDATE "order" SET status = 'cancelled' WHERE id = $1`, [created.id]);
    await releaseKey();
    log({
      level: 'error',
      request_id: requestId,
      msg: 'billing failed, order cancelled',
      order: created.number,
      error: String(err.message),
    });
    throw new AppError(502, 'billing_unavailable', 'We could not raise the invoice, so nothing was charged. Try again.');
  }

  if (claimedKey) {
    await query(`UPDATE idempotency_key SET order_id = $3, access_token = $4 WHERE scope = $1 AND key = $2`, [
      IDEMPOTENCY_SCOPE,
      idempotencyKey,
      created.id,
      accessToken,
    ]);
  }

  // Exactly one mail per confirmed order, to the order's email alone.
  try {
    const lines = await many(
      `SELECT title_snapshot, quantity, total_minor FROM order_line WHERE order_id = $1 ORDER BY position`,
      [created.id],
    );
    await sendOrderConfirmation(created, lines, requestId);
  } catch (err) {
    log({
      level: 'error',
      request_id: requestId,
      msg: 'confirmation mail failed',
      order: created.number,
      error: String(err.message),
    });
  }

  return { order: created, accessToken, replayed: false };
}

async function validateCart(cart) {
  const view = await readCart(cart);
  if (!view.lines.length) throw badRequest('empty_cart', 'Your cart is empty.');
  if (!view.email) throw badRequest('missing_email', 'Email is required.');
  if (!view.shipping_address) throw badRequest('missing_address', 'Address is required.');
  if (!view.shipping_method) throw badRequest('missing_method', 'Choose a delivery method.');
  if (view.notices.length) {
    const priceNotice = view.notices.find((n) => n.code === 'price_changed');
    throw conflict(
      priceNotice ? 'price_changed' : 'availability_changed',
      priceNotice ? priceNotice.message : view.notices[0].message,
      { notices: view.notices },
    );
  }

  return view;
}

async function buildOrder({ cart, customer, view, accessToken, commits }) {
  return withTransaction(async (client) => {
    // Re-price every line against the live price inside the transaction.
    const lines = await client.query(
      `SELECT l.id, l.variant_id, l.quantity, l.unit_price_minor, v.sku, v.price_minor, v.inventory_policy,
              p.title AS product_title, p.kind AS product_kind, v.option_value
         FROM cart_line l JOIN variant v ON v.id = l.variant_id JOIN product p ON p.id = v.product_id
        WHERE l.cart_id = $1 ORDER BY l.created_at, l.id`,
      [cart.id],
    );
    for (const l of lines.rows) {
      if (l.unit_price_minor !== l.price_minor) {
        throw conflict(
          'price_changed',
          `The price of ${l.product_title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(
            l.price_minor,
          )} since you added it.`,
        );
      }
    }

    // Commit stock in one step per line: available falls, committed rises, never below zero.
    for (const l of lines.rows) {
      if (l.product_kind === 'protection' || l.inventory_policy === 'continue') continue;
      const upd = await client.query(
        `UPDATE inventory_level SET available = available - $2, committed = committed + $2
          WHERE variant_id = $1 AND available >= $2 RETURNING available`,
        [l.variant_id, l.quantity],
      );
      if (!upd.rows.length) {
        throw conflict('out_of_stock', `${l.product_title} — ${l.option_value} (${l.sku}) is no longer available.`, {
          sku: l.sku,
        });
      }
      commits.push({ variantId: l.variant_id, quantity: l.quantity });
    }

    const goodsSubtotal = lines.rows
      .filter((l) => l.product_kind !== 'protection')
      .reduce((s, l) => s + l.unit_price_minor * l.quantity, 0);
    const subtotal = lines.rows.reduce((s, l) => s + l.unit_price_minor * l.quantity, 0);
    const methods = await deliveryMethods('US');
    const method = methods.find((m) => m.code === cart.shipping_method);
    const shipping = method ? method.price_minor : 0;
    const tax = taxFor(goodsSubtotal);
    const total = subtotal + shipping + tax;

    const number = await allocateNumber(client);
    const orderRow = await client.query(
      `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
                            total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
                            shipping_address, access_token_hash, killbill_external_key)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'usd', 'pending', 'unpaid', 'unfulfilled', $8, $9, $10, $11)
       RETURNING *`,
      [
        number,
        customer ? customer.id : cart.customer_id,
        view.email,
        subtotal,
        shipping,
        tax,
        total,
        cart.shipping_method,
        JSON.stringify(cart.shipping_address),
        sha256(accessToken),
        String(view.email).toLowerCase(),
      ],
    );
    const order = orderRow.rows[0];

    let pos = 0;
    for (const l of lines.rows) {
      pos += 1;
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          l.variant_id,
          lineTitle({ product_kind: l.product_kind, product_title: l.product_title, option_value: l.option_value }),
          l.sku,
          l.quantity,
          l.unit_price_minor,
          l.unit_price_minor * l.quantity,
          pos,
        ],
      );
      // Allocate built cameras to the order where the factory has them.
      if (l.product_kind === 'camera') {
        await client.query(
          `UPDATE device SET order_id = $1, status = 'sold'
            WHERE id IN (SELECT id FROM device
                          WHERE variant_id = $2 AND order_id IS NULL AND status = 'manufactured'
                          ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $3)`,
          [order.id, l.variant_id, l.quantity],
        );
      }
    }

    await client.query('DELETE FROM cart_line WHERE cart_id = $1', [cart.id]);
    await client.query(`UPDATE cart SET shipping_method = NULL, updated_at = now() WHERE id = $1`, [cart.id]);
    return order;
  });
}

export async function listCustomerOrders({ customerId, pageSize, cursor }) {
  const params = [customerId, pageSize + 1];
  let where = 'customer_id = $1';
  if (cursor) {
    params.push(cursor.placed_at, cursor.id);
    where += ` AND (placed_at, id) < ($3::timestamptz, $4::bigint)`;
  }
  const rows = await many(
    `SELECT * FROM "order" WHERE ${where} ORDER BY placed_at DESC, id DESC LIMIT $2`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const data = [];
  for (const o of page) {
    const s = await serialiseOrder(o);
    const first = s.lines[0];
    data.push({
      ...s,
      summary_title: first ? first.title : 'No lines',
      extra_line_count: Math.max(s.lines.length - 1, 0),
    });
  }
  const last = page[page.length - 1];
  return {
    data,
    hasMore,
    lastKey: last ? { placed_at: (last.placed_at instanceof Date ? last.placed_at.toISOString() : last.placed_at), id: String(last.id) } : null,
  };
}

export async function requireReadableOrder({ number, accessToken, customer }) {
  const order = await orderByNumber(number);
  if (!order) throw notFound('That order does not exist.');
  if (customer && order.customer_id && String(order.customer_id) === String(customer.id)) return order;
  if (orderTokenMatches(order, accessToken)) return order;
  // Another customer's order reads as not found, never as forbidden.
  throw notFound('That order does not exist.');
}


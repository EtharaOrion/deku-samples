import { query, one, withTransaction } from './db.js';
import { errors } from './errors.js';
import { taxFromSubtotal, dollars, centsToDecimalString } from './money.js';
import { randomToken, sha256 } from './ids.js';
import { encodeCursor, decodeCursor } from './pagination.js';
import { sendOrderConfirmationMail } from './mail-order.js';
import { raiseInvoiceForOrder } from './billing-order.js';

const ORDER_RE = /^VE-(\d{4})-(\d{4})$/;

export function isValidOrderNumber(number) {
  return ORDER_RE.test(String(number || ''));
}

/** Allocate the next order number inside the transaction, serialised on the row. */
async function nextOrderNumber(client) {
  const year = new Date().getUTCFullYear();
  // The prefix is fixed length, so the numeric suffix is a stable slice.
  const prefix = `VE-${year}-`;
  const r = await client.query(
    `SELECT COALESCE(MAX((SUBSTRING(number FROM ${prefix.length + 1}))::int), 0) AS n
     FROM "order" WHERE number LIKE ${'$1'}`,
    [prefix + '%']
  );
  const seq = Number(r.rows[0].n) + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Place an order. Runs in a single transaction that locks every variant row
 * FOR UPDATE so two concurrent checkouts cannot both take the last unit.
 */
export async function placeOrder({ cart, customer, idempotencyKey, requestId }) {
  if (idempotencyKey) {
    const prior = await one(
      `SELECT response FROM idempotency_key WHERE scope = 'order' AND key_text = $1`,
      [idempotencyKey]
    );
    if (prior) return replayOrderResponse(prior.response);
  }

  const lines = await query(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            v.inventory_policy, v.product_id,
            p.title AS product_title, p.status AS product_status, p.kind AS product_kind,
            il.available, il.committed
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE cl.cart_id = $1
     ORDER BY cl.id`,
    [cart.id]
  );
  if (lines.rows.length === 0) throw errors.validation('Your cart is empty.');

  const email = (cart.email || (customer && customer.email) || '').trim().toLowerCase();
  if (!email) throw errors.required('Email');

  // Re-price: refuse when a line changed since the cart was last shown.
  const changed = lines.rows.find((l) => l.current_price_minor !== l.unit_price_minor);
  if (changed) {
    const err = errors.conflict(
      `The price of ${changed.product_title} changed since you added it.`
    );
    err.code = 'price_changed';
    err.reprice = true;
    throw err;
  }

  const method = cart.shipping_method;
  if (!method || !(method in SHIPPING_PRICE)) throw errors.required('Delivery method');

  const shippingAddress = cart.shipping_address;
  if (!shippingAddress) throw errors.required('Address');

  const shipping = SHIPPING_PRICE[method];
  const subtotal = lines.rows.reduce((s, l) => s + l.current_price_minor * l.quantity, 0);
  const tax = taxFromSubtotal(subtotal);
  const rung = protectionRungFor(subtotal);
  const protection = cart.protection_enabled && rung ? rung.price_minor : 0;
  const total = subtotal + shipping + tax + protection;

  const accessToken = randomToken(24);
  const accessTokenHash = sha256(accessToken);

  const placed = await withTransaction(async (client) => {
    // Lock variant rows in a stable order to avoid deadlock and to make the
    // stock commitment atomic across concurrent checkouts.
    const variantIds = lines.rows.map((l) => l.variant_id).sort((a, b) => a - b);
    const locks = await client.query(
      `SELECT v.id, il.available, il.committed, v.inventory_policy
       FROM variant v JOIN inventory_level il ON il.variant_id = v.id
       WHERE v.id = ANY($1::bigint[]) ORDER BY v.id FOR UPDATE`,
      [variantIds]
    );
    const byId = new Map(locks.rows.map((r) => [r.id, r]));
    for (const l of lines.rows) {
      const inv = byId.get(l.variant_id);
      const policy = inv ? inv.inventory_policy : 'deny';
      if (policy === 'deny' && (inv?.available ?? 0) < l.quantity) {
        throw Object.assign(
          new Error(`Only ${inv?.available ?? 0} left`),
          { status: 409, code: 'out_of_stock', outOfStock: true, variantId: l.variant_id }
        );
      }
    }

    // Idempotency under the lock too.
    if (idempotencyKey) {
      const p = await client.query(
        `SELECT response FROM idempotency_key WHERE scope = 'order' AND key_text = $1`,
        [idempotencyKey]
      );
      if (p.rows[0]) return { replay: true, response: p.rows[0].response };
    }

    const number = await nextOrderNumber(client);
    const orderRow = await client.query(
      `INSERT INTO "order"
        (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor,
         currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
         access_token_hash, placed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'usd','confirmed','unpaid','unfulfilled',$8,$9,$10, now())
       RETURNING *`,
      [
        number, customer ? customer.id : null, email, subtotal, shipping, tax, total,
        method, JSON.stringify(shippingAddress), accessTokenHash,
      ]
    );
    const order = orderRow.rows[0];

    for (const l of lines.rows) {
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, l.variant_id, l.product_title, l.sku, l.quantity, l.current_price_minor, l.current_price_minor * l.quantity]
      );
    }

    for (const l of lines.rows) {
      await client.query(
        `UPDATE inventory_level SET available = available - $1, committed = committed + $1
         WHERE variant_id = $2`,
        [l.quantity, l.variant_id]
      );
    }

    // Allocate serials for camera lines.
    await allocateSerialsForOrder(client, order.id, lines.rows);

    await client.query(`DELETE FROM cart_line WHERE cart_id = $1`, [cart.id]);

    const responseBody = orderResponse(order, accessToken);

    if (idempotencyKey) {
      await client.query(
        `INSERT INTO idempotency_key (scope, key_text, response) VALUES ('order', $1, $2)
         ON CONFLICT (scope, key_text) DO NOTHING`,
        [idempotencyKey, JSON.stringify(responseBody)]
      );
    }

    return { replay: false, order, response: responseBody };
  });

  if (placed.replay) {
    return placed.response;
  }

  const order = placed.order;

  // Billing and mail happen after the order row exists. Failures are logged
  // but never block the confirmation the customer already has.
  let killbillExternalKey = null;
  let invoiceAmount = null;
  try {
    const result = await raiseInvoiceForOrder(order);
    killbillExternalKey = result.externalKey;
    invoiceAmount = result.amount;
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: 'killbill failed', request_id: requestId, error: String(err) }));
  }
  if (killbillExternalKey) {
    await query(
      `UPDATE "order" SET payment_status='invoiced', killbill_external_key=$1, killbill_invoice_amount=$2 WHERE id=$3`,
      [killbillExternalKey, invoiceAmount, order.id]
    );
  }

  try {
    await sendOrderConfirmationMail({ order, lines: lines.rows });
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: 'mail failed', request_id: requestId, error: String(err) }));
  }

  const finalResponse = orderResponse(order, accessToken, {
    killbill_external_key: killbillExternalKey,
    killbill_invoice_amount: invoiceAmount,
  });
  if (idempotencyKey) {
    await query(
      `UPDATE idempotency_key SET response = $1 WHERE scope = 'order' AND key_text = $2`,
      [JSON.stringify(finalResponse), idempotencyKey]
    );
  }
  return finalResponse;
}

async function allocateSerialsForOrder(client, orderId, lines) {
  for (const l of lines) {
    if (l.product_kind !== 'camera') continue;
    const sold = await client.query(
      `SELECT d.id FROM device d WHERE d.variant_id = $1 AND d.status IN ('manufactured','sold') AND d.order_id IS NULL
       ORDER BY d.id LIMIT $2 FOR UPDATE`,
      [l.variant_id, l.quantity]
    );
    if (sold.rows.length < l.quantity) continue;
    sold.rows.forEach((row, i) => (row.line_index = i));
    for (const d of sold.rows) {
      await client.query(`UPDATE device SET status='sold', order_id=$1 WHERE id=$2`, [orderId, d.id]);
    }
  }
}

const SHIPPING_PRICE = { Standard: 0, Express: 2500 };

function protectionRungFor(subtotalMinor) {
  if (subtotalMinor < 1) return null;
  if (subtotalMinor <= 9999) return { price_minor: 98, sku: 'VELA-PROTECT-1' };
  if (subtotalMinor <= 49999) return { price_minor: 298, sku: 'VELA-PROTECT-2' };
  if (subtotalMinor <= 99999) return { price_minor: 598, sku: 'VELA-PROTECT-3' };
  return { price_minor: 1198, sku: 'VELA-PROTECT-4' };
}

export function orderResponse(order, accessToken, extra = {}) {
  return {
    id: order.id,
    number: order.number,
    email: order.email,
    customer_id: order.customer_id,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    total_minor: order.total_minor,
    currency: order.currency,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    placed_at: order.placed_at,
    access_token: accessToken || null,
    killbill_external_key: order.killbill_external_key || extra.killbill_external_key || null,
    killbill_invoice_amount: order.killbill_invoice_amount ?? extra.killbill_invoice_amount ?? null,
  };
}

/** A replayed idempotent request returns the stored response unchanged. */
function replayOrderResponse(stored) {
  return typeof stored === 'string' ? JSON.parse(stored) : stored;
}

export async function orderByNumber(number) {
  return one(`SELECT * FROM "order" WHERE number = $1`, [number]);
}

/** Orders for one customer, newest first, keyset cursor on the order id. */
export async function listOrdersForCustomer(customerId, pageSize, cursor) {
  const after = decodeCursor(cursor);
  const params = [customerId];
  let where = '';
  if (after !== null) {
    params.push(Number(after));
    where = ` AND id < $${params.length}`;
  }
  params.push(pageSize + 1);
  const r = await query(
    `SELECT * FROM "order" WHERE customer_id = $1${where} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = r.rows.length > pageSize;
  const page = hasMore ? r.rows.slice(0, pageSize) : r.rows;
  const last = page[page.length - 1];
  return {
    data: page.map((o) => orderResponse(o, null)),
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeCursor(last.id) : null,
  };
}

export async function serializeOrder(order, { includeToken = false } = {}) {
  const lines = await query(
    `SELECT ol.*, v.option_value FROM order_line ol JOIN variant v ON v.id = ol.variant_id WHERE ol.order_id = $1 ORDER BY ol.id`,
    [order.id]
  );
  const serials = await query(
    `SELECT d.serial, d.status, ol.id AS order_line_id FROM device d
     JOIN order_line ol ON ol.variant_id = d.variant_id AND ol.order_id = $1
     WHERE d.order_id = $1 ORDER BY d.id`,
    [order.id]
  );
  const serialByLine = new Map();
  for (const s of serials.rows) {
    if (!serialByLine.has(s.order_line_id)) serialByLine.set(s.order_line_id, []);
    serialByLine.get(s.order_line_id).push(s.serial);
  }
  return {
    ...orderResponse(order, null),
    lines: lines.rows.map((l) => ({
      id: l.id,
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      option_value: l.option_value,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
      serials: serialByLine.get(l.id) || [],
    })),
    serials: serials.rows.map((s) => s.serial),
  };
}

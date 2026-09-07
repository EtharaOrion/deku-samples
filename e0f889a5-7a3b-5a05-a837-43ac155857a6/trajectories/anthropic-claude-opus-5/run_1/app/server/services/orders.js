import { many, one, query, tx } from '../db.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { taxFor } from '../lib/money.js';
import { randomToken, sha256hex } from '../lib/crypto.js';
import { readCart, shippingMethod } from './cart.js';
import { invoiceOrder } from './killbill.js';
import { sendOrderConfirmation } from './mail.js';
import { generateSerial } from './devices.js';
import { error as logError, info } from '../lib/log.js';

// Allocated in sequence: VE-<year>-<four digits>.
async function allocateNumber(client, year) {
  const r = await client.query(
    `INSERT INTO order_counter (year, last_value) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_value = order_counter.last_value + 1
     RETURNING last_value`,
    [year],
  );
  const n = Number(r.rows[0].last_value);
  return `VE-${year}-${String(n).padStart(4, '0')}`;
}

export async function orderByNumber(number) {
  const row = await one('SELECT * FROM "order" WHERE upper(number) = upper($1)', [String(number || '')]);
  return row;
}

// A replay must be answered before anything else is required of the request,
// because the first attempt already emptied the cart it is asking about.
export async function orderForIdempotencyKey(key) {
  if (!key) return null;
  const row = await one(
    `SELECT o.* FROM idempotency_key k JOIN "order" o ON o.id = k.order_id
     WHERE k.key = $1 AND k.state = 'completed'`,
    [key],
  );
  return row || null;
}

export async function shapeOrder(row, { includeAccessToken = null } = {}) {
  if (!row) return null;
  const lines = await many(
    'SELECT * FROM order_line WHERE order_id = $1 ORDER BY position, id',
    [row.id],
  );
  const serials = await many(
    `SELECT d.serial, d.status, d.firmware_version, v.sku,
            (SELECT count(*)::int FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS owned
     FROM device d LEFT JOIN variant v ON v.id = d.variant_id
     WHERE d.order_id = $1 ORDER BY d.id`,
    [row.id],
  );
  return {
    number: row.number,
    email: row.email,
    status: row.status,
    payment_status: row.payment_status,
    fulfilment_status: row.fulfilment_status,
    state_phrase: statePhrase(row),
    subtotal_minor: Number(row.subtotal_minor),
    shipping_minor: Number(row.shipping_minor),
    tax_minor: Number(row.tax_minor),
    discount_minor: Number(row.discount_minor),
    total_minor: Number(row.total_minor),
    currency: row.currency,
    shipping_method: row.shipping_method,
    shipping_method_label: shippingMethod(row.shipping_method)?.label || row.shipping_method,
    shipping_address: row.shipping_address,
    placed_at: row.placed_at instanceof Date ? row.placed_at.toISOString() : row.placed_at,
    killbill_external_key: row.killbill_external_key,
    killbill_invoice_id: row.killbill_invoice_id,
    killbill_invoice_amount: row.killbill_invoice_amount == null ? null : String(row.killbill_invoice_amount),
    lines: lines.map((l) => ({
      id: Number(l.id),
      variant_id: Number(l.variant_id),
      title_snapshot: l.title_snapshot,
      sku_snapshot: l.sku_snapshot,
      option_snapshot: l.option_snapshot,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      total_minor: Number(l.total_minor),
    })),
    serials: serials.map((s) => ({
      serial: s.serial,
      sku: s.sku,
      status: s.status,
      firmware_version: s.firmware_version,
      registered: Number(s.owned) > 0,
    })),
    ...(includeAccessToken ? { access_token: includeAccessToken } : {}),
  };
}

export function statePhrase(row) {
  if (row.status === 'cancelled') return 'Cancelled';
  if (row.status === 'pending') return 'Placed, not yet confirmed';
  if (row.fulfilment_status === 'fulfilled') return 'Confirmed and delivered';
  if (row.payment_status === 'invoiced') return 'Confirmed, invoiced, not yet shipped';
  return 'Confirmed';
}

class PriceChanged extends AppError {
  constructor(changes) {
    super(409, 'price_changed', 'Prices changed while you were checking out. Look at the cart again before placing the order.', { changes });
  }
}

// Placing an order: re-price every line, commit stock in one step, allocate a
// number, raise one invoice in the billing platform and send exactly one mail.
export async function placeOrder({ cartRow, customerId = null, idempotencyKey = null, expectedTotalMinor = null }) {
  if (idempotencyKey) {
    const replay = await claimIdempotencyKey(idempotencyKey);
    if (replay.replayed) return replay;
  }

  try {
    const result = await placeOrderInner({ cartRow, customerId, expectedTotalMinor });
    if (idempotencyKey) {
      await query(
        `UPDATE idempotency_key SET state = 'completed', order_id = $2 WHERE key = $1`,
        [idempotencyKey, result.orderId],
      );
    }
    return result;
  } catch (err) {
    // A failed attempt must not lock the key: release it so a retry can run.
    if (idempotencyKey) {
      await query(`DELETE FROM idempotency_key WHERE key = $1 AND state = 'in_progress'`, [idempotencyKey]).catch(() => {});
    }
    throw err;
  }
}

// A repeated Idempotency-Key returns the original order and creates no second
// account, invoice or mail. The unique index is what makes one request the winner.
async function claimIdempotencyKey(key) {
  const inserted = await one(
    `INSERT INTO idempotency_key (key, scope, state) VALUES ($1,'place_order','in_progress')
     ON CONFLICT (key) DO NOTHING RETURNING id`,
    [key],
  );
  if (inserted) return { replayed: false };

  // Someone already holds this key. Wait for their order, then return it.
  for (let i = 0; i < 100; i++) {
    const row = await one('SELECT state, order_id FROM idempotency_key WHERE key = $1', [key]);
    if (!row) {
      // The holder failed and released the key; take it.
      const retry = await one(
        `INSERT INTO idempotency_key (key, scope, state) VALUES ($1,'place_order','in_progress')
         ON CONFLICT (key) DO NOTHING RETURNING id`,
        [key],
      );
      if (retry) return { replayed: false };
    } else if (row.state === 'completed' && row.order_id) {
      const order = await one('SELECT * FROM "order" WHERE id = $1', [row.order_id]);
      info('order_idempotent_replay', { order: order?.number, key });
      return { replayed: true, orderId: Number(row.order_id), order, accessToken: null };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw conflict('idempotency_in_flight', 'That order is still being placed. Ask again in a moment.');
}

async function placeOrderInner({ cartRow, customerId, expectedTotalMinor }) {
  const fresh = await one('SELECT * FROM cart WHERE id = $1', [cartRow.id]);
  if (!fresh) throw notFound('That cart does not exist.', 'cart_not_found');
  if (fresh.converted_order_id) {
    const existing = await one('SELECT * FROM "order" WHERE id = $1', [fresh.converted_order_id]);
    if (existing) return { replayed: true, orderId: existing.id, order: existing, accessToken: null };
  }

  const cart = await readCart(fresh);
  if (!cart.lines.length) throw badRequest('cart_empty', 'Your cart is empty.');
  if (!fresh.email) throw badRequest('email_required', 'Email is required.');
  if (!fresh.shipping_address) throw badRequest('address_required', 'Address is required.');
  const method = shippingMethod(fresh.shipping_method);
  if (!method) throw badRequest('shipping_method_required', 'Choose a delivery method.');

  // Re-price every line against the current catalogue.
  const priced = await many(
    `SELECT cl.id, cl.quantity, cl.unit_price_minor, cl.shown_price_minor, cl.variant_id,
            v.sku, v.price_minor AS current_price_minor, v.option_value, v.inventory_policy,
            p.title AS product_title, p.status AS product_status
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     JOIN product p ON p.id = v.product_id
     WHERE cl.cart_id = $1 ORDER BY cl.id`,
    [fresh.id],
  );

  const changes = [];
  for (const line of priced) {
    const shown = line.shown_price_minor == null ? null : Number(line.shown_price_minor);
    const current = Number(line.current_price_minor);
    if (shown === null || shown !== current) {
      changes.push({ sku: line.sku, title: line.product_title, old_price_minor: shown, new_price_minor: current });
    }
  }
  if (changes.length) {
    // Return the person to a re-priced cart carrying that notice.
    await query(
      `UPDATE cart_line cl SET shown_price_minor = v.price_minor
       FROM variant v WHERE v.id = cl.variant_id AND cl.cart_id = $1`,
      [fresh.id],
    );
    throw new PriceChanged(changes);
  }

  const subtotal_minor = priced.reduce((s, l) => s + Number(l.current_price_minor) * Number(l.quantity), 0);
  const rung = cart.protection_rung;
  const protection_minor = cart.protection_enabled && rung ? rung.price_minor : 0;
  const shipping_minor = method.price_minor;
  const tax_minor = taxFor(subtotal_minor); // protection is excluded from tax
  const total_minor = subtotal_minor + protection_minor + shipping_minor + tax_minor;

  if (expectedTotalMinor != null && Number(expectedTotalMinor) !== total_minor) {
    throw conflict('total_changed', 'The total changed while you were checking out. Look at the cart again before placing the order.', {
      expected_total_minor: Number(expectedTotalMinor), total_minor,
    });
  }

  const accessToken = randomToken(24);
  const year = new Date().getUTCFullYear();

  const created = await tx(async (c) => {
    // Commit stock in one step: available falls and committed rises per line.
    for (const line of priced) {
      if (line.product_status === 'discontinued') {
        throw conflict('not_purchasable', `${line.product_title} is no longer sold.`, { sku: line.sku });
      }
      const upd = await c.query(
        `UPDATE inventory_level SET available = available - $2, committed = committed + $2
         WHERE variant_id = $1 AND available >= $2
         RETURNING available, committed`,
        [line.variant_id, Number(line.quantity)],
      );
      if (!upd.rows.length) {
        // The loser of a race is refused, naming the resource already taken.
        throw conflict('insufficient_stock', `${line.sku} is no longer available in that quantity.`, { sku: line.sku });
      }
    }

    const number = await allocateNumber(c, year);
    const orderRow = await c.query(
      `INSERT INTO "order"
         (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
          total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
          shipping_address, access_token_hash, killbill_external_key)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9::jsonb,$10,$11)
       RETURNING *`,
      [
        number, customerId, String(fresh.email).toLowerCase(), subtotal_minor + protection_minor,
        shipping_minor, tax_minor, total_minor, method.code,
        JSON.stringify(fresh.shipping_address), sha256hex(accessToken),
        String(fresh.email).toLowerCase(),
      ],
    );
    const order = orderRow.rows[0];

    let pos = 1;
    for (const line of priced) {
      const unit = Number(line.current_price_minor);
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot,
                                 quantity, unit_price_minor, total_minor, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [order.id, line.variant_id, line.product_title, line.sku, line.option_value,
          Number(line.quantity), unit, unit * Number(line.quantity), pos++],
      );
    }

    if (protection_minor > 0 && rung) {
      const pv = await c.query('SELECT id, option_value FROM variant WHERE sku = $1', [rung.sku]);
      if (pv.rows.length) {
        await c.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot,
                                   quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,'Shipment protection',$3,$4,1,$5,$5,$6)`,
          [order.id, pv.rows[0].id, rung.sku, pv.rows[0].option_value, protection_minor, pos++],
        );
      }
    }

    // A camera line allocates a serial, which is a record in its own right.
    for (const line of priced) {
      const cam = await c.query(
        `SELECT v.id AS variant_id, p.id AS product_id, p.handle, p.kind
         FROM variant v JOIN product p ON p.id = v.product_id WHERE v.id = $1`,
        [line.variant_id],
      );
      const info_ = cam.rows[0];
      if (!info_ || info_.kind !== 'camera') continue;
      const prefix = info_.handle === 'flagship' ? 'VA' : 'VC';
      for (let i = 0; i < Number(line.quantity); i++) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const serial = generateSerial(prefix);
          const ins = await c.query(
            `INSERT INTO device (serial, product_id, variant_id, status, order_id, warranty_until)
             VALUES ($1,$2,$3,'sold',$4, (now() at time zone 'utc')::date + interval '2 years')
             ON CONFLICT (upper(serial)) DO NOTHING RETURNING id`,
            [serial, info_.product_id, info_.variant_id, order.id],
          );
          if (ins.rows.length) break;
        }
      }
    }

    await c.query('UPDATE cart SET converted_order_id = $1, updated_at = now() WHERE id = $2', [order.id, fresh.id]);
    return order;
  });

  // The money is a real record held outside this app's own screens.
  let billing;
  try {
    billing = await invoiceOrder({
      email: created.email,
      name: fresh.shipping_address?.name || created.email,
      orderNumber: created.number,
      totalMinor: total_minor,
    });
  } catch (err) {
    logError('order_billing_failed', { order: created.number, error: String(err && err.message) });
    await releaseOrder(created.id, priced);
    throw new AppError(502, 'billing_unavailable', 'We could not raise the invoice for this order. Nothing was charged and nothing was kept. Try again.');
  }

  const confirmed = await one(
    `UPDATE "order" SET status = 'confirmed', payment_status = 'invoiced',
        killbill_account_id = $2, killbill_invoice_id = $3, killbill_invoice_amount = $4::numeric
     WHERE id = $1 RETURNING *`,
    [created.id, billing.accountId, billing.invoiceId, billing.amount],
  );

  // Exactly one mail follows a confirmed order.
  try {
    const shaped = await shapeOrder(confirmed);
    await sendOrderConfirmation({ ...shaped, lines: shaped.lines });
  } catch (err) {
    logError('order_mail_failed', { order: confirmed.number, error: String(err && err.message) });
  }

  info('order_placed', { order: confirmed.number, total_minor, invoice_id: billing.invoiceId });
  return { replayed: false, orderId: Number(confirmed.id), order: confirmed, accessToken };
}

async function releaseOrder(orderId, lines) {
  await tx(async (c) => {
    for (const line of lines) {
      await c.query(
        `UPDATE inventory_level SET available = available + $2, committed = greatest(committed - $2, 0)
         WHERE variant_id = $1`,
        [line.variant_id, Number(line.quantity)],
      );
    }
    await c.query('DELETE FROM device WHERE order_id = $1', [orderId]);
    await c.query('UPDATE cart SET converted_order_id = NULL WHERE converted_order_id = $1', [orderId]);
    await c.query(`UPDATE "order" SET status = 'cancelled' WHERE id = $1`, [orderId]);
  }).catch(() => {});
}

export function accessTokenMatches(order, token) {
  if (!order || !token) return false;
  return order.access_token_hash === sha256hex(token);
}

export async function listCustomerOrders(customerId, { pageSize = 20, cursor = null } = {}) {
  const params = [customerId, pageSize + 1];
  let where = 'WHERE o.customer_id = $1';
  if (cursor) {
    params.push(cursor.placed_at, cursor.id);
    where += ' AND (o.placed_at, o.id) < ($3::timestamptz, $4::bigint)';
  }
  const rows = await many(
    `SELECT o.* FROM "order" o ${where} ORDER BY o.placed_at DESC, o.id DESC LIMIT $2`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const shaped = [];
  for (const row of data) shaped.push(await shapeOrder(row));
  const last = data[data.length - 1];
  return {
    data: shaped,
    next_cursor: hasMore && last
      ? { placed_at: (last.placed_at instanceof Date ? last.placed_at.toISOString() : last.placed_at), id: Number(last.id) }
      : null,
    has_more: hasMore,
  };
}

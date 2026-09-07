import { randomInt, randomUUID, createHash } from 'node:crypto';
import { tx, one, many, query } from './db.js';
import { opaqueToken, sha256 } from './auth.js';
import { taxOn, formatMinor } from './money.js';
import { rungFor } from './cart.js';
import { AppError, badRequest, conflict, notFound, unprocessable } from './errors.js';
import * as killbill from './killbill.js';
import { sendOrderConfirmation } from './mail.js';
import { logLine } from './log.js';

const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MODEL_CODE = { flagship: 'VA', compact: 'VC' };

export function serialShapeOk(serial) {
  return /^[A-Z]{2}\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(String(serial ?? '').toUpperCase());
}

function mintSerial(handle) {
  const code = MODEL_CODE[handle] || 'VA';
  const now = new Date();
  const year = String(now.getUTCFullYear() % 100).padStart(2, '0');
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const week = String(Math.min(52, Math.floor((now.getTime() - start) / 604800000) + 1)).padStart(2, '0');
  let tail = '';
  for (let i = 0; i < 6; i += 1) tail += SERIAL_ALPHABET[randomInt(SERIAL_ALPHABET.length)];
  return `${code}${year}${week}${tail}`;
}

function cartFingerprint(cart) {
  const h = createHash('sha256');
  h.update(cart.token);
  h.update(JSON.stringify(cart.lines.map((l) => [l.sku, l.quantity, l.unit_price_minor])));
  h.update(String(cart.protection_enabled));
  h.update(String(cart.shipping_method ?? ''));
  return h.digest('hex').slice(0, 40);
}

async function readOrder(orderId) {
  const o = await one('SELECT * FROM "order" WHERE id = $1', [orderId]);
  if (!o) return null;
  const lines = await many(
    `SELECT ol.*, v.sku, p.handle, p.kind
       FROM order_line ol JOIN variant v ON v.id = ol.variant_id JOIN product p ON p.id = v.product_id
      WHERE ol.order_id = $1 ORDER BY ol.position, ol.id`,
    [orderId]
  );
  return { ...o, lines };
}

export function shapeOrder(order, { access_token = null, serials = [] } = {}) {
  return {
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    state_phrase: statePhrase(order),
    currency: order.currency,
    subtotal_minor: order.subtotal_minor,
    shipping_minor: order.shipping_minor,
    tax_minor: order.tax_minor,
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    placed_at: new Date(order.placed_at).toISOString(),
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    lines: (order.lines || []).map((l) => ({
      id: String(l.id),
      title_snapshot: l.title_snapshot,
      sku_snapshot: l.sku_snapshot,
      handle: l.handle,
      kind: l.kind,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
    })),
    serials,
    ...(access_token ? { access_token } : {}),
  };
}

export function statePhrase(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'pending') return 'Placed, not yet confirmed';
  if (order.fulfilment_status === 'fulfilled') return 'Confirmed, paid and shipped';
  if (order.payment_status === 'invoiced') return 'Confirmed and invoiced, not yet shipped';
  return 'Confirmed, awaiting invoice';
}

export async function serialsForOrder(orderId) {
  return many(
    `SELECT d.serial, d.id, p.title AS model, v.sku,
            (SELECT customer_id FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL) AS owner_id
       FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
      WHERE d.order_id = $1 ORDER BY d.id`,
    [orderId]
  );
}

// Placing an order: re-price, commit stock atomically, allocate the number, write the rows.
// Then raise the invoice in killbill and send exactly one mail, and only then confirm.
export async function placeOrder({ cart, cartRow, customer, idempotencyKey }) {
  const key = idempotencyKey || `cart:${cartFingerprint(cart)}`;

  // A replay of a key we have already finished returns the order we returned the first time.
  const seen = await one('SELECT * FROM idempotency_key WHERE key = $1', [key]);
  if (seen) {
    const settled = await waitForKey(key);
    if (settled) return settled;
  }

  if (!cart.lines.length) throw badRequest('cart_empty', 'Your cart is empty.');
  const email = String(cart.email ?? '').trim().toLowerCase();
  if (!email) throw badRequest('email_required', 'Email is required.');
  if (!cart.shipping_address) throw badRequest('address_required', 'A delivery address is required.');
  if (!cart.shipping_method) throw badRequest('shipping_method_required', 'Choose a delivery method.');

  let created;
  try {
    created = await tx(async (c) => {
      // Claim the key inside the same transaction that writes the order.
      const claim = await c.query(
        `INSERT INTO idempotency_key (key, scope, state) VALUES ($1,'orders','in_progress')
         ON CONFLICT (key) DO NOTHING RETURNING key`,
        [key]
      );
      if (claim.rowCount === 0) throw new AppError(409, 'idempotency_replay', 'That order is already being placed.', { resource: key, replay: key });

      // Re-price every line against the current price.
      const priced = [];
      for (const l of cart.lines) {
        const v = await c.query(
          `SELECT v.id, v.sku, v.price_minor, v.inventory_policy, p.title, p.handle, p.kind, p.status
             FROM variant v JOIN product p ON p.id = v.product_id WHERE v.sku = $1`,
          [l.sku]
        );
        const row = v.rows[0];
        if (!row) throw unprocessable('line_gone', `${l.title} is no longer sold.`, { resource: l.sku });
        if (row.price_minor !== l.unit_price_minor) {
          throw unprocessable('price_changed', `The price of ${row.title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(row.price_minor)} since you added it.`, {
            resource: l.sku, old_price_minor: l.unit_price_minor, new_price_minor: row.price_minor, title: row.title,
          });
        }
        priced.push({ ...row, quantity: l.quantity, option_value: l.option_value });
      }

      // Commit stock in one step. One statement per line: available falls and committed
      // rises together, guarded by the row itself, so two racing checkouts cannot both win.
      for (const p of priced) {
        if (p.inventory_policy === 'continue') continue;
        const upd = await c.query(
          `UPDATE inventory_level SET available = available - $2, committed = committed + $2
            WHERE variant_id = $1 AND available >= $2
            RETURNING available`,
          [p.id, p.quantity]
        );
        if (upd.rowCount === 0) {
          throw conflict('insufficient_stock', `${p.title} sold out while you were checking out.`, { resource: p.sku });
        }
      }

      const goodsSubtotal = priced.reduce((s, p) => s + p.price_minor * p.quantity, 0);
      const rung = rungFor(goodsSubtotal || 1);
      const protectionMinor = cartRow.protection_enabled ? rung.price_minor : 0;
      const ship = await c.query('SELECT * FROM shipping_method WHERE code = $1', [cart.shipping_method]);
      if (!ship.rows[0]) throw badRequest('shipping_method_invalid', 'Choose a delivery method.');
      const shippingMinor = ship.rows[0].price_minor;
      const taxMinor = taxOn(goodsSubtotal); // protection is excluded from tax
      const subtotalMinor = goodsSubtotal + protectionMinor;
      const totalMinor = subtotalMinor + shippingMinor + taxMinor;

      // Numbers are allocated in sequence. The counter row is the lock.
      const year = new Date().getUTCFullYear();
      const cnt = await c.query(
        `INSERT INTO order_counter (year, last_value) VALUES ($1, 1)
         ON CONFLICT (year) DO UPDATE SET last_value = order_counter.last_value + 1
         RETURNING last_value`,
        [year]
      );
      const number = `VE-${year}-${String(cnt.rows[0].last_value).padStart(4, '0')}`;

      const accessToken = opaqueToken();
      // Unique to this order row, so a retry finds its own charge and a later
      // database generation reusing this number never adopts an older invoice.
      const chargeKey = `${number}/${randomUUID()}`;

      // A guest checkout that names a registered address is that person's order,
      // so it belongs in their history as well as behind its access token.
      let ownerId = customer?.id ?? null;
      if (!ownerId) {
        const match = await c.query('SELECT id FROM customer WHERE lower(email) = $1', [email]);
        ownerId = match.rows[0]?.id ?? null;
      }
      const orderRow = await c.query(
        `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor,
                              total_minor, currency, status, payment_status, fulfilment_status, shipping_method,
                              shipping_address, access_token_hash, killbill_external_key, killbill_charge_key)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11,$12)
         RETURNING id, number`,
        [number, ownerId, email, subtotalMinor, shippingMinor, taxMinor, totalMinor,
         cart.shipping_method, JSON.stringify(cart.shipping_address), sha256(accessToken), email, chargeKey]
      );
      const orderId = orderRow.rows[0].id;

      let pos = 0;
      for (const p of priced) {
        pos += 1;
        await c.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [orderId, p.id, `${p.title} — ${p.option_value}`, p.sku, p.quantity, p.price_minor, p.price_minor * p.quantity, pos]
        );
      }
      if (protectionMinor > 0) {
        pos += 1;
        const pv = await c.query('SELECT id, sku FROM variant WHERE sku = $1', [rung.sku]);
        await c.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor, position)
           VALUES ($1,$2,'Shipment protection',$3,1,$4,$4,$5)`,
          [orderId, pv.rows[0].id, pv.rows[0].sku, protectionMinor, pos]
        );
      }

      // A camera is a record in its own right: mint the serial the order allocated.
      for (const p of priced) {
        if (p.kind !== 'camera') continue;
        for (let i = 0; i < p.quantity; i += 1) {
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const serial = mintSerial(p.handle);
            const ins = await c.query(
              `INSERT INTO device (serial, product_id, variant_id, status, order_id, warranty_until)
               SELECT $1, v.product_id, v.id, 'sold', $2, (now() + interval '2 years')::date
                 FROM variant v WHERE v.id = $3
               ON CONFLICT (upper(serial)) DO NOTHING RETURNING id`,
              [serial, orderId, p.id]
            );
            if (ins.rowCount > 0) break;
          }
        }
      }

      await c.query('UPDATE idempotency_key SET order_id = $2 WHERE key = $1', [key, orderId]);
      await c.query('DELETE FROM cart_line WHERE cart_id = $1', [cartRow.id]);
      await c.query('UPDATE cart SET updated_at = now(), protection_enabled = false WHERE id = $1', [cartRow.id]);

      return { orderId, number, accessToken, totalMinor, email };
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'idempotency_replay') {
      const settled = await waitForKey(key);
      if (settled) return settled;
      throw conflict('idempotency_in_progress', 'That order is already being placed.', { resource: key });
    }
    throw err;
  }

  // The order exists and the stock is committed. Now the money and the mail, which
  // live outside this app entirely.
  const order = await readOrder(created.orderId);
  const externalKey = created.email;
  // The description the invoice carries names the order; the key that makes a
  // retry idempotent is unique to this row and travels in the item details.
  const description = `Order ${created.number}`;
  const chargeKey = order.killbill_charge_key;

  const account = await killbill.ensureAccount({
    externalKey,
    email: created.email,
    name: order.shipping_address?.name || created.email,
  });

  let invoice = await killbill.findInvoiceByChargeKey(account.accountId, chargeKey);
  if (!invoice) {
    invoice = await killbill.raiseInvoice({
      accountId: account.accountId,
      totalMinor: created.totalMinor,
      description,
      chargeKey,
    });
  }

  await query(
    `UPDATE "order" SET status='confirmed', payment_status='invoiced',
            killbill_account_id=$2, killbill_invoice_id=$3, killbill_invoice_amount=$4
      WHERE id = $1`,
    [created.orderId, account.accountId, invoice.invoiceId, invoice.amount]
  );

  const confirmed = await readOrder(created.orderId);
  await sendOrderConfirmation(confirmed);

  const serials = await serialsForOrder(created.orderId);
  const shaped = shapeOrder(confirmed, { access_token: created.accessToken, serials: serials.map(serialShape) });

  await query(
    `UPDATE idempotency_key SET state='done', response=$2 WHERE key = $1`,
    [key, JSON.stringify(shaped)]
  );
  logLine({ level: 'info', msg: 'order confirmed', order: created.number, total_minor: created.totalMinor, invoice_id: invoice.invoiceId });
  return shaped;
}

function serialShape(d) {
  return { serial: d.serial, model: d.model, registered: d.owner_id !== null };
}

async function waitForKey(key, timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await one('SELECT state, response, order_id FROM idempotency_key WHERE key = $1', [key]);
    if (row && row.state === 'done' && row.response) return row.response;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

export async function orderByNumber(number) {
  const o = await one('SELECT * FROM "order" WHERE number = $1', [String(number ?? '')]);
  if (!o) return null;
  return readOrder(o.id);
}

export async function orderReadableBy(number, { accessToken, customer }) {
  const o = await orderByNumber(number);
  // Another customer's order reads as not found, never forbidden.
  if (!o) throw notFound('That order does not exist.');
  if (customer && o.customer_id && String(o.customer_id) === String(customer.id)) return o;
  if (accessToken && o.access_token_hash === sha256(accessToken)) return o;
  throw notFound('That order does not exist.');
}

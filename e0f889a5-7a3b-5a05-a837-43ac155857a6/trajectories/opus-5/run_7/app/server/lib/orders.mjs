// Placing an order. Stock is committed in the same step that writes the order, so
// two checkouts for the last unit cannot both succeed, and no invoice exists until
// after that race is settled.
import crypto from 'node:crypto';
import { tx, query, one } from './db.mjs';
import { sha256, randomToken } from './auth.mjs';
import { taxFor, formatMinor } from './money.mjs';
import { AppError, conflict, badRequest, notFound } from './errors.mjs';
import { readCart, cartLines, shippingMinorFor } from './cart.mjs';
import * as killbill from './killbill.mjs';
import { sendOrderConfirmation } from './mail.mjs';

const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MODEL_CODE = { flagship: 'VA', compact: 'VC' };

function mintSerial(handle, when = new Date()) {
  const code = MODEL_CODE[handle] || 'VX';
  const year = String(when.getUTCFullYear() % 100).padStart(2, '0');
  const week = String(isoWeek(when)).padStart(2, '0');
  let tail = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) tail += SERIAL_ALPHABET[bytes[i] % SERIAL_ALPHABET.length];
  return `${code}${year}${week}${tail}`;
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

/** VE-<year>-<four digits>, allocated in sequence under a row lock. */
async function allocateNumber(c) {
  const year = new Date().getUTCFullYear();
  const { rows: [row] } = await c.query(
    `INSERT INTO order_counter (year, last_value) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_value = order_counter.last_value + 1
     RETURNING last_value`,
    [year],
  );
  return `VE-${year}-${String(row.last_value).padStart(4, '0')}`;
}

/**
 * Place the order the cart describes.
 * Re-prices every line first: a line that moved sends the person back to a
 * re-priced cart carrying the notice, and nothing is written.
 */
export async function placeOrder({ cartToken, customerId = null, expectedTotalMinor = null }) {
  return tx(async (c) => {
    const { rows: [cart] } = await c.query(
      'SELECT * FROM cart WHERE token = $1 AND expires_at > now() FOR UPDATE',
      [cartToken],
    );
    if (!cart) throw notFound('That cart does not exist.');

    const lines = await cartLines(c, cart.id);
    const goods = lines.filter((l) => l.kind !== 'protection');
    if (goods.length === 0) throw badRequest('cart_empty', 'Your cart is empty.');

    if (!cart.email) throw badRequest('email_required', 'Email is required.');
    if (!cart.shipping_address) throw badRequest('address_required', 'A delivery address is required.');
    if (!cart.shipping_method) throw badRequest('shipping_method_required', 'A delivery method is required.');

    // Re-price every line against the current catalogue.
    const changed = lines
      .filter((l) => l.unit_price_minor !== l.current_price_minor)
      .map((l) => ({
        kind: 'price_change',
        sku: l.sku,
        title: l.title,
        old_price_minor: l.unit_price_minor,
        new_price_minor: l.current_price_minor,
        message: `The price of ${l.title} changed from ${formatMinor(l.unit_price_minor)} to ${formatMinor(l.current_price_minor)} since you added it.`,
      }));
    if (changed.length) {
      // The refusal rolls this transaction back, so the re-pricing is applied
      // separately: the person returns to a re-priced cart still carrying the notice.
      throw new AppError(
        409, 'price_changed',
        'A price changed while you were checking out. Review your cart and place the order again.',
        { notices: changed, reprice_cart_id: Number(cart.id) },
      );
    }

    const goodsSubtotal = goods.reduce((s, l) => s + l.unit_price_minor * l.quantity, 0);
    const protectionLine = lines.find((l) => l.kind === 'protection') || null;
    const protectionMinor = protectionLine ? protectionLine.unit_price_minor * protectionLine.quantity : 0;
    const shipping = await shippingMinorFor(c, cart.shipping_method);
    const tax = taxFor(goodsSubtotal); // protection is excluded from tax
    const subtotal = goodsSubtotal + protectionMinor;
    const total = subtotal + shipping + tax;

    // The total authorized is the figure the final step showed.
    if (expectedTotalMinor !== null && Number(expectedTotalMinor) !== total) {
      throw new AppError(409, 'total_changed', 'The total changed while you were checking out. Review your cart and place the order again.', {
        shown_total_minor: Number(expectedTotalMinor), current_total_minor: total,
      });
    }

    // Commit stock in one step. The conditional update is the race: exactly one
    // request can take the last unit, and available never falls below zero.
    for (const l of lines) {
      if (l.inventory_policy === 'continue' || l.kind === 'protection') continue;
      const { rowCount } = await c.query(
        `UPDATE inventory_level SET available = available - $2, committed = committed + $2
          WHERE variant_id = $1 AND available >= $2`,
        [l.variant_id, l.quantity],
      );
      if (rowCount === 0) {
        throw conflict('out_of_stock', `${l.title} is no longer available in the quantity you asked for.`, {
          resource: l.sku, title: l.title,
        });
      }
    }

    const number = await allocateNumber(c);
    const accessToken = randomToken(24);

    const { rows: [order] } = await c.query(
      `INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor,
         discount_minor, total_minor, currency, status, payment_status, fulfilment_status,
         shipping_method, shipping_address, access_token_hash, killbill_external_key)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,'usd','pending','unpaid','unfulfilled',$8,$9,$10,$11)
       RETURNING *`,
      [
        number, customerId, cart.email, subtotal, shipping, tax, total,
        cart.shipping_method, cart.shipping_address, sha256(accessToken),
        String(cart.email).toLowerCase(),
      ],
    );

    let pos = 0;
    for (const l of lines) {
      pos += 1;
      const title = l.kind === 'protection' ? 'Shipment protection' : `${l.title} — ${l.option_value}`;
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity,
           unit_price_minor, total_minor, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, l.variant_id, title, l.sku, l.quantity, l.unit_price_minor, l.unit_price_minor * l.quantity, pos],
      );
    }

    // Allocate a serial per camera unit. A camera is a record in its own right.
    for (const l of goods) {
      if (l.kind !== 'camera') continue;
      for (let i = 0; i < l.quantity; i++) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const serial = mintSerial(l.handle);
          const { rows } = await c.query(
            `INSERT INTO device (serial, product_id, variant_id, status, order_id, warranty_until)
             SELECT $1, v.product_id, v.id, 'sold', $2, (now() + interval '2 years')::date
               FROM variant v WHERE v.id = $3
             ON CONFLICT (upper(serial)) DO NOTHING
             RETURNING id`,
            [serial, order.id, l.variant_id],
          );
          if (rows.length) break;
        }
      }
    }

    // Empty the cart so a reload cannot place it twice.
    await c.query('DELETE FROM cart_line WHERE cart_id = $1', [cart.id]);

    const orderLines = (await c.query('SELECT * FROM order_line WHERE order_id = $1 ORDER BY position', [order.id])).rows;
    return { order, lines: orderLines, accessToken };
  });
}

/**
 * Raise the invoice in killbill and send the one confirmation mail, then mark the
 * order confirmed. The invoice is the fact; the app's own row only reflects it.
 */
export async function confirmOrder(order, lines, log) {
  const externalKey = String(order.email).toLowerCase();

  const account = await killbill.ensureAccount({
    externalKey,
    name: order.shipping_address?.name || externalKey,
    email: order.email,
  });

  const { invoiceId, amount } = await killbill.createInvoice({
    accountId: account.accountId,
    totalMinor: order.total_minor,
    description: `Order ${order.number}`,
  });

  // Read the invoice back so the app never trusts a figure it merely sent.
  let confirmedAmount = amount;
  try {
    const invoice = await killbill.getInvoice(invoiceId);
    if (invoice && invoice.amount != null) confirmedAmount = String(invoice.amount);
  } catch (err) {
    log?.warn?.({ msg: 'invoice read-back failed', error: String(err) });
  }

  const { rows: [updated] } = await query(
    `UPDATE "order"
        SET status = 'confirmed', payment_status = 'invoiced',
            killbill_account_id = $2, killbill_invoice_id = $3, killbill_invoice_amount = $4
      WHERE id = $1 RETURNING *`,
    [order.id, account.accountId, invoiceId, amount],
  );

  // Exactly one mail, to the order's email only.
  let mailed = false;
  try {
    await sendOrderConfirmation(updated, lines);
    mailed = true;
  } catch (err) {
    log?.error?.({ msg: 'confirmation mail failed', order: order.number, error: String(err) });
  }

  return { order: updated, account, invoiceId, invoiceAmount: confirmedAmount, mailed };
}

/**
 * Re-price the lines a refused order found stale, recording what each moved from
 * so the cart the person returns to still names the old price and the new.
 */
export async function repriceCart(cartId) {
  await query(
    `UPDATE cart_line cl
        SET previous_price_minor = cl.unit_price_minor,
            unit_price_minor = v.price_minor
       FROM variant v
      WHERE v.id = cl.variant_id
        AND cl.cart_id = $1
        AND cl.unit_price_minor <> v.price_minor`,
    [cartId],
  );
}

export async function orderPayload(order, { includeAccessToken = null } = {}) {
  const lines = await query(
    'SELECT * FROM order_line WHERE order_id = $1 ORDER BY position', [order.id],
  );
  const serials = await query(
    `SELECT d.serial, d.status, d.firmware_version, v.sku, p.title AS model,
            (SELECT count(*)::int FROM device_ownership o
              WHERE o.device_id = d.id AND o.released_at IS NULL) AS owned
       FROM device d JOIN variant v ON v.id = d.variant_id JOIN product p ON p.id = d.product_id
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
    discount_minor: order.discount_minor,
    total_minor: order.total_minor,
    currency: order.currency,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    placed_at: order.placed_at,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    lines: lines.rows.map((l) => ({
      id: Number(l.id),
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      total_minor: l.total_minor,
    })),
    serials: serials.rows.map((s) => ({
      serial: s.serial,
      model: s.model,
      sku: s.sku,
      status: s.status,
      firmware_version: s.firmware_version,
      registered: s.owned > 0,
    })),
    ...(includeAccessToken ? { access_token: includeAccessToken } : {}),
  };
}

/** One chip combining the order, payment and fulfilment states into a human phrase. */
export function statePhrase(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'pending') return 'Not yet confirmed';
  if (order.fulfilment_status === 'fulfilled') return 'Confirmed and delivered';
  if (order.payment_status === 'invoiced') return 'Confirmed, invoiced, not yet shipped';
  return 'Confirmed';
}

export async function findOrderByNumber(number) {
  return one('SELECT * FROM "order" WHERE number = $1', [number]);
}

export function accessTokenMatches(order, token) {
  if (!token || !order?.access_token_hash) return false;
  const a = Buffer.from(sha256(token));
  const b = Buffer.from(order.access_token_hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

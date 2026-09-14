import { q, one, tx, isUniqueViolation } from './db.js';
import { taxOf, dollars, decimal } from './money.js';
import { getCartState, type CartState, type ShippingAddress } from './cart.js';
import { deliveryMethod, protectionRungFor } from './catalogue.js';
import { sha256Hex, randomToken } from './auth.js';
import { ensureAccount, raiseInvoice } from './billing.js';
import { sendMail } from './mail.js';
import { logEvent } from './log.js';

export class OrderError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type OrderView = ReturnType<typeof toOrderView>;

export function toOrderView(o: any, lines: any[], serials: Record<number, string[]> = {}) {
  const chip =
    o.status === 'cancelled' ? 'Cancelled'
    : o.status === 'confirmed' && o.fulfilment_status === 'fulfilled' ? 'Confirmed and fulfilled'
    : o.status === 'confirmed' ? 'Confirmed, not yet sent'
    : 'Awaiting payment';
  return {
    id: o.id,
    number: o.number,
    email: o.email,
    customer_id: o.customer_id,
    status: o.status,
    payment_status: o.payment_status,
    fulfilment_status: o.fulfilment_status,
    status_chip: chip,
    subtotal_minor: Number(o.subtotal_minor),
    shipping_minor: Number(o.shipping_minor),
    tax_minor: Number(o.tax_minor),
    protection_minor: Number(o.protection_minor ?? 0),
    discount_minor: Number(o.discount_minor ?? 0),
    total_minor: Number(o.total_minor),
    currency: o.currency,
    total_dollars: dollars(Number(o.total_minor)),
    shipping_method: o.shipping_method,
    shipping_address: o.shipping_address,
    marketing_consent: o.marketing_consent,
    killbill_external_key: o.killbill_external_key,
    killbill_invoice_amount: o.killbill_invoice_amount == null ? null : Number(o.killbill_invoice_amount),
    placed_at: o.placed_at,
    lines: lines.map((l) => ({
      id: l.id,
      variant_id: l.variant_id,
      title: l.title_snapshot,
      sku: l.sku_snapshot,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      total_minor: Number(l.total_minor),
      serials: serials[l.id] ?? [],
    })),
  };
}

export async function loadOrderLines(orderId: number) {
  return q<any>(`SELECT * FROM order_line WHERE order_id = $1 ORDER BY id ASC`, [orderId]);
}

export async function getOrder(number: string): Promise<any | null> {
  return one<any>(`SELECT * FROM "order" WHERE number = $1`, [number]);
}

export async function orderSerials(orderId: number): Promise<Record<number, string[]>> {
  const rows = await q<{ order_line_id: number; serial: string }>(
    `SELECT order_line_id, serial FROM device_serial WHERE order_id = $1`, [orderId]);
  const out: Record<number, string[]> = {};
  for (const r of rows) (out[r.order_line_id] ||= []).push(r.serial);
  return out;
}

export async function orderView(number: string): Promise<OrderView | null> {
  const o = await getOrder(number);
  if (!o) return null;
  const lines = await loadOrderLines(o.id);
  const serials = await orderSerials(o.id);
  return toOrderView(o, lines, serials);
}

/**
 * Place an order. Stock is committed in one atomic step per line, the order is
 * written once, one invoice is raised in the billing platform for the exact
 * total, and one confirmation mail is sent. A repeated Idempotency-Key returns
 * the original order and creates nothing new.
 */
export async function placeOrder(input: {
  cartToken: string;
  customerId: number | null;
  idempotencyKey?: string | null;
  email: string;
  shippingAddress: ShippingAddress;
  shippingMethod: string;
  marketingConsent: boolean;
  expectedTotalMinor?: number | null;
}): Promise<{ order: OrderView; replayed: boolean; access_token: string }> {
  const existing = input.idempotencyKey
    ? await one<{ order_id: number; response: any }>(
        `SELECT order_id, response FROM idempotency_key WHERE key = $1 AND scope = 'order'`, [input.idempotencyKey])
    : null;
  if (existing) {
    const view = await orderView((await one<any>(`SELECT number FROM "order" WHERE id = $1`, [existing.order_id])).number);
    return { order: view!, replayed: true, access_token: existing.response.access_token };
  }

  const cart = await getCartState(input.cartToken);
  if (!cart || cart.lines.length === 0) throw new OrderError('cart_empty', 'Your cart is empty.', 400);

  // Re-price every line. A line that changed since the cart was last shown refuses the order.
  const changed = cart.notices.find((n) => n.kind === 'price_change');
  if (changed) {
    throw new OrderError('price_changed', changed.message, 409, { notice: changed, cart });
  }
  const unavailable = cart.notices.find((n) => n.kind === 'availability');
  if (unavailable) {
    throw new OrderError('unavailable', unavailable.message, 409, { notice: unavailable, cart });
  }

  const method = deliveryMethod(input.shippingMethod);
  if (!method) throw new OrderError('unknown_method', 'Choose a delivery method.', 400);

  const subtotal = cart.subtotal_minor;
  const tax = taxOf(subtotal);
  const shipping = method.price_minor;
  const rung = protectionRungFor(subtotal);
  const protection = cart.protection.enabled && rung ? rung.price_minor : 0;
  const total = subtotal + protection + shipping + tax;

  // The total authorized is the figure the final step showed.
  if (input.expectedTotalMinor != null && Number(input.expectedTotalMinor) !== total) {
    throw new OrderError('total_changed', 'The total changed. Please review your cart.', 409, { cart });
  }

  // Stock is committed in one step: available falls and committed rises per line.
  const committed = await tx(async (client) => {
    for (const line of cart.lines) {
      const res = await client.query(
        `UPDATE inventory_level SET available = available - $1, committed = committed + $1
          WHERE variant_id = $2 AND available >= $1
          RETURNING variant_id`,
        [line.quantity, line.variant_id]);
      if (res.rowCount === 0) {
        throw new OrderError('out_of_stock',
          `${line.product_title} is sold out. ${line.available > 0 ? `Only ${line.available} left.` : ''}`.trim(), 409);
      }
    }

    const seq = (await client.query(
      `SELECT nextval('order_number_seq') AS n`)).rows[0].n as number;
    const number = `VE-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
    const accessToken = randomToken(18);
    const address = JSON.stringify(input.shippingAddress);

    const order = (await client.query(
      `INSERT INTO "order"
         (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor, currency,
          status, payment_status, fulfilment_status, shipping_method, shipping_address, marketing_consent,
          protection_minor, discount_minor, access_token_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'USD','pending','unpaid','unfulfilled',$8,$9,$10,$11,0,$12)
       RETURNING *`,
      [number, input.customerId, input.email.toLowerCase(), subtotal, shipping, tax, total,
       method.name, address, input.marketingConsent, protection, sha256Hex(accessToken)])).rows[0];

    for (const line of cart.lines) {
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, line.variant_id, `${line.product_title} — ${line.option_value}`, line.sku,
         line.quantity, line.unit_price_minor, line.unit_price_minor * line.quantity]);
    }

    if (input.idempotencyKey) {
      await client.query(
        `INSERT INTO idempotency_key (key, scope, order_id, response) VALUES ($1,'order',$2,$3)`,
        [input.idempotencyKey, order.id, JSON.stringify({ number, access_token: accessToken })]);
    }

    return { order, accessToken };
  }).catch((err) => {
    if (isUniqueViolation(err)) {
      throw new OrderError('conflict', 'That order was already taken. Try again.', 409);
    }
    throw err;
  });

  // One billing account keyed by the order email lowercased, one invoice on it.
  const externalKey = input.email.toLowerCase();
  let invoiceAmount: number | null = null;
  let invoiceError: string | null = null;
  try {
    const account = await ensureAccount(externalKey, externalKey, input.shippingAddress.name || externalKey);
    const invoice = await raiseInvoice(account.accountId, total, `Vela order ${committed.order.number}`);
    invoiceAmount = invoice.amount;
    await q(
      `UPDATE "order" SET status='confirmed', payment_status='invoiced',
              killbill_external_key=$1, killbill_invoice_amount=$2, placed_at=now()
        WHERE id=$3`, [externalKey, decimal(total), committed.order.id]);
  } catch (err) {
    invoiceError = String(err);
    logEvent('order.invoice_failed', { order: committed.order.number, error: invoiceError });
    await q(
      `UPDATE "order" SET killbill_external_key=$1, killbill_invoice_amount=NULL WHERE id=$2`,
      [externalKey, committed.order.id]);
    throw new OrderError('billing_failed', 'Something went wrong at our end. Your order was not placed.', 502);
  }

  const finalOrder = await one<any>(`SELECT * FROM "order" WHERE id = $1`, [committed.order.id]);
  const lines = await loadOrderLines(committed.order.id);
  const view = toOrderView(finalOrder, lines);

  // Exactly one mail to the order's email only: no cc and no bcc.
  try {
    await sendMail({
      to: finalOrder.email,
      subject: `Order confirmed: ${finalOrder.number}`,
      text: mailText(view),
      html: mailHtml(view),
    });
  } catch (err) {
    logEvent('order.mail_failed', { order: finalOrder.number, error: String(err) });
  }

  // The cart is consumed.
  await q(`DELETE FROM cart_line WHERE cart_id = $1`, [cart.id]);

  return { order: view, replayed: false, access_token: committed.accessToken };
}

function mailText(order: OrderView): string {
  const lines = order.lines
    .map((l) => `${l.title} × ${l.quantity} — ${dollars(l.total_minor)}`)
    .join('\n');
  return [
    `Order ${order.number} is confirmed.`,
    '',
    lines,
    '',
    `Subtotal ${dollars(order.subtotal_minor)}`,
    order.protection_minor > 0 ? `Shipment protection ${dollars(order.protection_minor)}` : '',
    `Delivery ${order.shipping_method} ${dollars(order.shipping_minor)}`,
    `Tax ${dollars(order.tax_minor)}`,
    `Total ${dollars(order.total_minor)}`,
    '',
    'The Vela team.',
  ].filter((s) => s !== '').join('\n');
}

function mailHtml(order: OrderView): string {
  const rows = order.lines
    .map((l) => `<tr><td>${escapeHtml(l.title)}</td><td>${l.quantity}</td><td>${dollars(l.total_minor)}</td></tr>`)
    .join('');
  return `<p>Order ${escapeHtml(order.number)} is confirmed.</p>
<table>
<thead><tr><th>Item</th><th>Quantity</th><th>Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p>Subtotal ${dollars(order.subtotal_minor)}<br>
Delivery ${escapeHtml(order.shipping_method ?? '')} ${dollars(order.shipping_minor)}<br>
Tax ${dollars(order.tax_minor)}<br>
Total ${dollars(order.total_minor)}</p>
<p>The Vela team.</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/* ------------------------------- access control ------------------------------ */

export async function canSeeOrder(order: any, opts: { accessToken?: string | null; customerId?: number | null }): Promise<boolean> {
  if (opts.accessToken && sha256Hex(opts.accessToken) === order.access_token_hash) return true;
  if (opts.customerId && order.customer_id === opts.customerId) return true;
  return false;
}

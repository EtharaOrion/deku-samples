import { q, one, tx } from '../db/index.js';
import { sha256, randomToken, taxOf, money, minorToDecimal } from '../util.js';
import { ApiError } from './helpers.js';
import { cartState, protectionRung } from './cart_core.js';
import { getAccountByExternalKey, createAccount, createInvoice } from '../kb/client.js';
import { sendOrderConfirmation } from '../mailer.js';

export async function placeOrder({ cart, customer, idempotencyKey, requestId }) {
  // Idempotent replay: return the original order untouched.
  if (idempotencyKey) {
    const existing = await one('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing) {
      return { order: existing, replayed: true, access_token: null };
    }
  }

  const state = await cartState(cart.id);
  if (!state.lines.length) throw new ApiError(409, 'cart_empty', 'Your cart is empty.');

  // Re-price: if a line changed since it was last shown, refuse the order.
  const changed = state.notices.find((n) => n.kind === 'price_change');
  if (changed) {
    throw new ApiError(409, 'cart_reprice', `The price of ${changed.item} changed from ${money(changed.old_minor)} to ${money(changed.new_minor)} since you added it.`, { notice: changed });
  }

  const email = (state.email || customer?.email || '').toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApiError(400, 'email_required', 'Email is required.');
  }
  const address = state.shipping_address;
  if (!address || !address.line1 || !address.city || !address.country) {
    throw new ApiError(400, 'address_required', 'Tell us where the order goes before placing it.');
  }
  if (!state.shipping_method) {
    throw new ApiError(400, 'shipping_method_required', 'Choose how the order gets there.');
  }

  const subtotal = state.subtotal_minor;
  const rung = protectionRung(subtotal);
  const protection = state.protection.enabled && rung ? rung.price_minor : 0;
  const shipping = state.shipping_minor || 0;
  const tax = taxOf(subtotal);
  const total = subtotal + protection + shipping + tax;

  const accessToken = randomToken(24);

  let order;
  try {
    order = await placeInTx({ cart, customer, state, subtotal, shipping, tax, total, protection, accessToken, idempotencyKey, address, email });
  } catch (e) {
    if (idempotencyKey && e && e.code === '23505') {
      const existing = await one('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
      if (existing) return { order: existing, replayed: true, access_token: null };
    }
    throw e;
  }
  return await finalizeOrder({ order, cart, email, address, total, accessToken, requestId });

  async function placeInTx({ cart, customer, state, subtotal, shipping, tax, total, protection, accessToken, idempotencyKey, address, email }) {
    return await tx(async (db) => {
    // Lock the cart row, then commit stock per line in the same step.
    const lockedCart = await db.one('SELECT * FROM cart WHERE id = $1 FOR UPDATE', [cart.id]);

    for (const l of state.lines) {
      const inv = await db.one('SELECT * FROM inventory_level WHERE variant_id = $1 FOR UPDATE', [l.variant_id]);
      if (!inv) throw new ApiError(409, 'stock_unavailable', `${l.product_title} is not available.`);
      if (l.inventory_policy === 'deny') {
        if (inv.available < l.quantity) {
          throw new ApiError(409, 'insufficient_stock', `${l.product_title} has ${inv.available} left.`, {
            sku: l.sku, available: inv.available,
          });
        }
      }
      await db.query(
        `UPDATE inventory_level SET available = available - $2, committed = committed + $2 WHERE variant_id = $1`,
        [l.variant_id, l.quantity]
      );
    }

    const num = await db.one(`SELECT 'VE-' || to_char(now(),'YYYY') || '-' || lpad(nextval('order_number_seq')::text,4,'0') AS number`);

    const inserted = await db.one(
      `INSERT INTO orders
         (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor, currency, status, payment_status, fulfilment_status,
          shipping_method, shipping_address, marketing_opt_in, protection_minor, access_token_hash, idempotency_key, placed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'USD','pending','unpaid','unfulfilled',$8,$9,$10,$11,$12,$13, now())
       RETURNING *`,
      [
        num.number, customer ? customer.id : null, email, subtotal, shipping, tax, total,
        state.shipping_method.toLowerCase(), JSON.stringify(address), !!state.marketing_opt_in, protection,
        sha256(accessToken), idempotencyKey || null,
      ]
    );

    for (const l of state.lines) {
      await db.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [inserted.id, l.variant_id, l.product_title, l.sku, l.quantity, l.current_price_minor, l.quantity * l.current_price_minor]
      );
    }

    // Allocate serials for camera lines: devices in `sold` with no live owner.
    for (const l of state.lines) {
      if (l.product_kind !== 'camera') continue;
      const allocated = await db.query(
        `SELECT d.id FROM device d
         WHERE d.product_id = $1 AND d.status = 'sold' AND d.order_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL)
         ORDER BY d.id LIMIT $2 FOR UPDATE`,
        [l.product_id, l.quantity]
      );
      for (const d of allocated) {
        await db.query('UPDATE device SET order_id = $1 WHERE id = $2', [inserted.id, d.id]);
      }
    }

    await db.query('DELETE FROM cart_line WHERE cart_id = $1', [cart.id]);
    await db.query('DELETE FROM cart_protection WHERE cart_id = $1', [cart.id]);
    await db.query(`UPDATE cart SET shipping_minor = 0, shipping_method = NULL, shipping_address = NULL, email = NULL WHERE id = $1`, [cart.id]);

      return inserted;
    });
  }
}

async function finalizeOrder({ order, cart, email, address, total, accessToken, requestId }) {
  const externalKey = email;
  let invoiceId = null;
  let invoiceAmount = null;
  let confirmed = order;
  try {
    let account = await getAccountByExternalKey(externalKey);
    if (!account) {
      account = await createAccount({
        name: address.name || email,
        externalKey,
        email,
        currency: 'USD',
        country: address.country || 'US',
      });
    }
    const inv = await createInvoice({
      accountId: account.accountId,
      amountDecimal: Number(minorToDecimal(total)),
      description: `Vela order ${order.number}`,
    });
    invoiceId = inv.invoiceId;
    invoiceAmount = inv.amount;
    confirmed = await one(
      `UPDATE orders SET status='confirmed', payment_status='invoiced', killbill_external_key=$2, killbill_invoice_id=$3, killbill_invoice_amount=$4
       WHERE id=$1 RETURNING *`,
      [order.id, externalKey, invoiceId, String(inv.amount)]
    );
  } catch (e) {
    console.log(JSON.stringify({ event: 'billing_error', request_id: requestId, order: order.number, error: String(e) }));
    confirmed = order;
  }

  // Exactly one mail per confirmed order.
  const lines = await q('SELECT * FROM order_line WHERE order_id = $1 ORDER BY id', [confirmed.id]);
  if (confirmed.status === 'confirmed') {
    try {
      await sendOrderConfirmation({
        to: confirmed.email,
        number: confirmed.number,
        lines,
        totalMinor: confirmed.total_minor,
        url: `${process.env.APP_PUBLIC_URL || ''}/orders/${confirmed.number}?access_token=${accessToken}`,
      });
    } catch (e) {
      console.log(JSON.stringify({ event: 'mail_error', request_id: requestId, order: confirmed.number, error: String(e) }));
    }
  }

  return { order: confirmed, replayed: false, access_token: accessToken };
}

export async function orderWithDetails(order) {
  const lines = await q('SELECT * FROM order_line WHERE order_id = $1 ORDER BY id', [order.id]);
  const serials = await q(
    `SELECT d.serial, v.sku, d.status AS device_status FROM device d
     JOIN variant v ON v.id = d.variant_id WHERE d.order_id = $1 ORDER BY d.id`,
    [order.id]
  );
  return { ...order, lines, serials };
}

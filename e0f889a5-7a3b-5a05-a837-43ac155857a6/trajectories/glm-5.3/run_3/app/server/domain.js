import { q, one, rows } from './db.js';
import { ApiError, taxOf } from './util.js';

// ---------- cart ----------

export async function ensureCart({ token, customer } = {}) {
  if (token) {
    const c = await one(`SELECT * FROM cart WHERE token = $1`, [token]);
    if (c) {
      if (customer && !c.customer_id) await q(`UPDATE cart SET customer_id=$2, updated_at=now() WHERE id=$1`, [c.id, customer.id]);
      return c;
    }
  }
  const t = token || ('c_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const c = await one(
    `INSERT INTO cart (token, customer_id) VALUES ($1, $2) RETURNING *`, [t, customer ? customer.id : null]);
  return c;
}

export function protectionRung(subtotalMinor) {
  if (subtotalMinor < 1) return null;
  if (subtotalMinor <= 9999) return { sku: 'VELA-PROTECT-1', price_minor: 98, label: '$0.98' };
  if (subtotalMinor <= 49999) return { sku: 'VELA-PROTECT-2', price_minor: 298, label: '$2.98' };
  if (subtotalMinor <= 99999) return { sku: 'VELA-PROTECT-3', price_minor: 598, label: '$5.98' };
  return { sku: 'VELA-PROTECT-4', price_minor: 1198, label: '$11.98' };
}

export async function cartView(cart) {
  const lines = await rows(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor, cl.added_at,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            p.title AS product_title, p.handle AS product_handle, p.kind AS product_kind,
            il.available, il.committed, v.inventory_policy
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = cl.variant_id
      WHERE cl.cart_id = $1
      ORDER BY cl.added_at ASC, cl.id ASC`, [cart.id]);
  const notices = [];
  let subtotal = 0;
  for (const l of lines) {
    subtotal += l.current_price_minor * l.quantity;
    if (Number(l.current_price_minor) !== Number(l.unit_price_minor)) {
      notices.push({
        kind: 'price_changed',
        item: l.product_title,
        from_minor: Number(l.unit_price_minor),
        to_minor: Number(l.current_price_minor)
      });
    } else if (Number(l.available) <= 0) {
      notices.push({ kind: 'out_of_stock', item: l.product_title, sku: l.sku });
    }
  }
  const itemsSubtotal = lines.reduce((s, l) => s + Number(l.current_price_minor) * l.quantity, 0);
  const rung = protectionRung(itemsSubtotal);
  const protection = (cart.protection_enabled && rung) ? rung.price_minor : 0;
  const addressKnown = !!(cart.shipping_address && cart.shipping_address.country);
  const email = cart.email || (cart.shipping_address ? cart.shipping_address.email : null);
  const method = cart.shipping_method;
  let shippingMinor = null, taxBase = null, taxMinor = null, totalMinor = null;
  if (addressKnown && method) {
    const rate = await one(`SELECT * FROM shipping_rate WHERE method = $1 AND zone = $2`, [method, zoneForCountry(cart.shipping_address.country)]);
    shippingMinor = rate ? Number(rate.price_minor) : 0;
    taxBase = itemsSubtotal;
    taxMinor = taxOf(taxBase);
    totalMinor = taxBase + taxMinor + shippingMinor + protection;
  }
  return {
    token: cart.token,
    email: cart.email || null,
    shipping_method: method || null,
    shipping_address: cart.shipping_address || null,
    marketing_consent: cart.marketing_consent,
    protection_enabled: cart.protection_enabled,
    protection_rung: rung ? { sku: rung.sku, price_minor: rung.price_minor } : null,
    protection_minor: protection,
    lines: lines.map((l) => ({
      id: l.id, variant_id: l.variant_id, sku: l.sku, title: l.product_title, variant_title: l.variant_title,
      option_value: l.option_value, quantity: l.quantity,
      unit_price_minor: Number(l.unit_price_minor), current_price_minor: Number(l.current_price_minor),
      line_total_minor: Number(l.current_price_minor) * l.quantity,
      available: l.available === null ? null : Number(l.available),
      inventory_policy: l.inventory_policy
    })),
    notices,
    subtotal_minor: itemsSubtotal,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: totalMinor,
    address_known: addressKnown,
    estimated: !addressKnown
  };
}

export function zoneForCountry(country) {
  return (country || '').toUpperCase() === 'US' ? 'us-domestic' : null;
}

export async function deliveryQuote(cart) {
  const addr = cart.shipping_address || {};
  const zone = zoneForCountry(addr.country);
  if (!zone) return [];
  const rates = await rows(`SELECT method, label, price_minor, min_days, max_days FROM shipping_rate WHERE zone = $1 ORDER BY price_minor ASC`, [zone]);
  return rates.map((r) => ({ ...r, price_minor: Number(r.price_minor) }));
}

// ---------- checkout ----------

const VALID_METHODS = new Set(['Standard', 'Express']);

export async function placeOrder({ cartToken, customer, idempotencyKey, requestId }) {
  const client = await (await import('./db.js')).default.connect();
  try {
    await client.query('BEGIN');
    const cart = (await client.query(`SELECT * FROM cart WHERE token=$1 FOR UPDATE`, [cartToken])).rows[0];
    if (!cart) throw new ApiError(404, 'cart_not_found', 'We could not find that cart.');

    if (idempotencyKey) {
      const prior = (await client.query(`SELECT * FROM orders WHERE idempotency_key=$1`, [idempotencyKey])).rows[0];
      if (prior) {
        await client.query('COMMIT');
        return { order: prior, replay: true };
      }
    }

    const addr = cart.shipping_address || {};
    const email = (cart.email || addr.email || '').trim().toLowerCase();
    if (!email) throw new ApiError(400, 'email_required', 'An email is required to place an order.');
    if (!cart.shipping_method || !VALID_METHODS.has(cart.shipping_method)) {
      throw new ApiError(400, 'shipping_method_required', 'Choose how the order gets there.');
    }
    if (!addr.country) throw new ApiError(400, 'address_required', 'Tell us where the order goes.');

    const lines = (await client.query(
      `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor, v.sku, v.title AS variant_title, v.option_value,
              v.price_minor AS current_price_minor, p.title AS product_title, p.kind AS product_kind,
              il.available, il.committed, v.inventory_policy, p.handle AS product_handle
         FROM cart_line cl
         JOIN variant v ON v.id = cl.variant_id
         JOIN product p ON p.id = v.product_id
         LEFT JOIN inventory_level il ON il.variant_id = cl.variant_id
        WHERE cl.cart_id = $1 ORDER BY cl.id`, [cart.id])).rows;
    if (lines.length === 0) throw new ApiError(400, 'cart_empty', 'Your cart is empty.');

    // Re-price every line; refuse if anything moved since it was last shown.
    const stale = lines.filter((l) => Number(l.current_price_minor) !== Number(l.unit_price_minor));
    if (stale.length > 0) {
      await client.query('COMMIT');
      const e = new ApiError(409, 'prices_changed', 'A price changed since you last saw the cart. We have updated it.');
      e.cartNotices = stale.map((l) => ({ kind: 'price_changed', item: l.product_title, from_minor: Number(l.unit_price_minor), to_minor: Number(l.current_price_minor) }));
      throw e;
    }

    // Commit stock one step per line, under row locks, never below zero.
    for (const l of lines) {
      const upd = (await client.query(
        `UPDATE inventory_level SET available = available - $2, committed = committed + $2
          WHERE variant_id = $1 AND available >= $2 RETURNING available, committed`,
        [l.variant_id, l.quantity])).rows[0];
      if (!upd) {
        await client.query('ROLLBACK');
        const short = lines.find((x) => x.variant_id === l.variant_id);
        throw new ApiError(409, 'out_of_stock', `${short.product_title} in ${short.option_value} sold out while you were checking out. Nothing was charged.`);
      }
    }

    const itemsSubtotal = lines.reduce((s, l) => s + Number(l.current_price_minor) * l.quantity, 0);
    const rung = protectionRung(itemsSubtotal);
    const protection = (cart.protection_enabled && rung) ? rung.price_minor : 0;
    const rate = (await client.query(`SELECT price_minor FROM shipping_rate WHERE method=$1`, [cart.shipping_method])).rows[0];
    const shippingMinor = rate ? Number(rate.price_minor) : 0;
    const taxMinor = taxOf(itemsSubtotal); // protection is excluded from tax
    const subtotalMinor = itemsSubtotal + protection; // the sum of the line totals, protection included
    const totalMinor = subtotalMinor + shippingMinor + taxMinor;

    const year = new Date().getUTCFullYear();
    const seq = (await client.query(
      `UPDATE order_sequence SET last_seq = last_seq + 1 WHERE year = $1 RETURNING last_seq`, [year])).rows[0];
    let nextSeq;
    if (!seq) {
      const ins = (await client.query(
        `INSERT INTO order_sequence (year, last_seq) VALUES ($1, 1) ON CONFLICT (year) DO UPDATE SET last_seq = order_sequence.last_seq + 1 RETURNING last_seq`, [year])).rows[0];
      nextSeq = ins.last_seq;
    } else nextSeq = seq.last_seq;
    const number = `VE-${year}-${String(nextSeq).padStart(4, '0')}`;

    const accessToken = (await import('./util.js')).randomToken(24);
    const accessTokenHash = (await import('./util.js')).sha256(accessToken);

    const order = (await client.query(
      `INSERT INTO orders (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor, total_minor, currency,
                           status, payment_status, fulfilment_status, shipping_method, shipping_address, access_token_hash, access_token,
                           marketing_consent, placed_at, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,'USD','pending','unpaid','unfulfilled',$8,$9,$10,$11,$12, now(), $13) RETURNING *`,
      [number, customer ? customer.id : null, email, subtotalMinor, shippingMinor, taxMinor, totalMinor,
       cart.shipping_method, JSON.stringify({ ...addr, email }), accessTokenHash, accessToken, cart.marketing_consent, idempotencyKey || null])).rows[0];

    for (const l of lines) {
      const ol = (await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [order.id, l.variant_id, l.product_title, l.sku, l.option_value, l.quantity, Number(l.current_price_minor), Number(l.current_price_minor) * l.quantity])).rows[0];
      if (l.product_kind === 'camera') {
        // Allocate serials from devices tied to this variant, unowned.
        const devs = (await client.query(
          `SELECT d.id, d.serial FROM device d
            WHERE d.variant_id = $1 AND d.order_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM device_ownership o WHERE o.device_id = d.id AND o.released_at IS NULL)
            ORDER BY d.id LIMIT $2 FOR UPDATE`, [l.variant_id, l.quantity])).rows;
        for (const d of devs) {
          await client.query(`UPDATE device SET status='sold', order_id=$2 WHERE id=$1`, [d.id, order.id]);
          await client.query(`INSERT INTO order_line_serial (order_line_id, serial) VALUES ($1,$2) ON CONFLICT (serial) DO NOTHING`, [ol.id, d.serial]);
        }
      }
    }

    await client.query(`DELETE FROM cart_line WHERE cart_id=$1`, [cart.id]);
    await client.query(`UPDATE cart SET shipping_method=NULL, shipping_address=NULL, email=NULL, protection_enabled=false, updated_at=now() WHERE id=$1`, [cart.id]);

    const orderOut = { ...order, access_token: accessToken };

    await client.query('COMMIT');
    return { order: orderOut, replay: false };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// ---------- orders ----------

export async function confirmOrder(orderRow, { requestId } = {}) {
  // Killbill account + invoice, then mail, then mark confirmed.
  const { ensureAccountAndInvoice } = await import('./killbill.js');
  const { sendOrderConfirmed } = await import('./mail.js');
  const email = orderRow.email.toLowerCase();
  const lines = await rows(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id`, [orderRow.id]);

  const { account, invoice } = await ensureAccountAndInvoice({
    externalKey: email, name: orderRow.shipping_address?.name || email, email,
    orderNumber: orderRow.number, totalMinor: Number(orderRow.total_minor)
  });

  const mailInfo = await sendOrderConfirmed({
    to: email, number: orderRow.number, lines,
    totalMinor: Number(orderRow.total_minor), currency: orderRow.currency
  });

  await q(`UPDATE orders SET status='confirmed', payment_status='invoiced',
                  killbill_external_key=$2, killbill_invoice_amount=$3, placed_at=now()
            WHERE id=$1`, [orderRow.id, email, invoice.amount]);

  return { invoice, mailInfo };
}

export async function orderView(orderRow, { withSerials = true } = {}) {
  const lines = await rows(
    `SELECT ol.*, v.sku AS live_sku FROM order_line ol LEFT JOIN variant v ON v.id=ol.variant_id WHERE ol.order_id=$1 ORDER BY ol.id`,
    [orderRow.id]);
  const out = {
    number: orderRow.number,
    email: orderRow.email,
    customer_id: orderRow.customer_id,
    status: orderRow.status,
    payment_status: orderRow.payment_status,
    fulfilment_status: orderRow.fulfilment_status,
    subtotal_minor: Number(orderRow.subtotal_minor),
    shipping_minor: Number(orderRow.shipping_minor),
    tax_minor: Number(orderRow.tax_minor),
    discount_minor: Number(orderRow.discount_minor || 0),
    total_minor: Number(orderRow.total_minor),
    currency: orderRow.currency,
    shipping_method: orderRow.shipping_method,
    shipping_address: orderRow.shipping_address,
    marketing_consent: orderRow.marketing_consent,
    placed_at: orderRow.placed_at,
    killbill_external_key: orderRow.killbill_external_key || null,
    killbill_invoice_amount: orderRow.killbill_invoice_amount !== null && orderRow.killbill_invoice_amount !== undefined ? Number(orderRow.killbill_invoice_amount) : null,
    lines: lines.map((l) => ({
      id: l.id, title: l.title_snapshot, sku: l.sku_snapshot, option: l.option_snapshot,
      quantity: l.quantity, unit_price_minor: Number(l.unit_price_minor), total_minor: Number(l.total_minor)
    }))
  };
  if (withSerials) {
    const serials = await rows(
      `SELECT ols.serial, ols.order_line_id, d.product_id, p.title AS model
         FROM order_line_serial ols
         JOIN order_line ol ON ol.id = ols.order_line_id
         JOIN device d ON d.serial = ols.serial
         JOIN product p ON p.id = d.product_id
        WHERE ol.order_id = $1 ORDER BY ols.serial`, [orderRow.id]);
    out.serials = serials.map((s) => ({ serial: s.serial, model: s.model, order_line_id: s.order_line_id }));
  }
  return out;
}

// ---------- devices ----------

export async function deviceView(d, customerId) {
  const latest = await one(
    `SELECT version, build FROM firmware WHERE product_id=$1 AND channel='general' ORDER BY build DESC LIMIT 1`, [d.product_id]);
  const owns = customerId ? await one(
    `SELECT 1 FROM device_ownership WHERE device_id=$1 AND customer_id=$2 AND released_at IS NULL`, [d.id, customerId]) : null;
  const product = await one(`SELECT handle, title FROM product WHERE id=$1`, [d.product_id]);
  return {
    serial: d.serial,
    model: product.title,
    model_handle: product.handle,
    nickname: d.nickname,
    status: d.status,
    blocked_reason: d.blocked_reason || null,
    firmware_version: d.firmware_version,
    firmware_reported_at: d.firmware_reported_at,
    update_available: !!(latest && d.firmware_version && (await import('./util.js')).compareVersion(latest.version, d.firmware_version) > 0),
    latest_firmware: latest ? latest.version : null,
    warranty_until: d.warranty_until,
    owned: !!owns
  };
}

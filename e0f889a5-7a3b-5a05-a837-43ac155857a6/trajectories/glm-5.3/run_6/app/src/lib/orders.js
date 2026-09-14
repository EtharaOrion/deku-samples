import { createHmac } from 'node:crypto';
import { db, tx } from './db.js';
import { errors, ApiError } from './errors.js';
import { numericCursor } from './pagination.js';
import { taxFor, minorToDecimalString, formatUsd } from './money.js';
import { findMethod, methodsForCountry } from './delivery.js';
import { ensureAccount, raiseInvoice, externalKeyForEmail, hashToken } from './billing.js';
import { sendOrderConfirmation } from './mail.js';
import { derivedNotices, cartLines, rungForSubtotal, protectionVariant, isValidEmail } from './cart.js';
import { randomSerialTail } from './serials.js';
import { logEvent, logError } from './log.js';

function accessTokenFor(orderId, number) {
  const secret = process.env.AUTH_SECRET || process.env.DATABASE_URL || 'vela-local';
  const mac = createHmac('sha256', secret).update(`order:${orderId}:${number}`).digest('hex');
  return `vela_${mac.slice(0, 40)}`;
}

function modelCodeFor(handle) {
  if (handle === 'flagship') return 'VA';
  if (handle === 'compact') return 'VC';
  return 'VA';
}

function generateSerial(handle) {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const week = String(isoWeek(now)).padStart(2, '0');
  return `${modelCodeFor(handle)}${year}${week}${randomSerialTail(6)}`;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export async function nextOrderNumber(client) {
  const sql = client || db();
  const year = new Date().getUTCFullYear();
  const rows = await sql`
    SELECT number FROM "order"
    WHERE number LIKE ${`VE-${year}-%`}
    ORDER BY number DESC LIMIT 1
  `;
  let seq = 1;
  if (rows.length) {
    const current = parseInt(rows[0].number.split('-')[2], 10);
    if (Number.isFinite(current)) seq = current + 1;
  }
  return `VE-${year}-${String(seq).padStart(4, '0')}`;
}

export async function placeOrder({ cart, idempotencyKey, expectedTotalMinor }) {
  // Idempotent replay: the same key returns the original order and creates no
  // second account, invoice or mail.
  if (idempotencyKey) {
    const existing = await findOrderBy.IdempotencyKey(idempotencyKey);
    if (existing) {
      const token = accessTokenFor(existing.id, existing.number);
      return { order: existing, access_token: token, replayed: true };
    }
  }

  const lines = await cartLines(cart.id);
  if (lines.length === 0) throw errors.badRequest('Your cart is empty.', 'empty_cart');

  const email = cart.email;
  if (!email || !isValidEmail(email)) {
    throw errors.badRequest('Email is required.', 'email_required');
  }
  const address = cart.shippingAddress;
  if (!address || !address.country) {
    throw errors.badRequest('We need to know where it is going.', 'address_required');
  }
  const method = cart.shippingMethod ? findMethod(cart.shippingMethod) : null;
  if (!method) throw errors.badRequest('Choose a delivery method.', 'method_required');
  if (!methodsForCountry(address.country).some((m) => m.code === method.code)) {
    throw errors.badRequest('We ship to the United States only.', 'unsupported_country');
  }

  // Re-price every line. A line that changed since the cart was last shown
  // refuses the order.
  const changed = derivedNotices(lines).filter((n) => n.kind === 'price_changed');
  if (changed.length > 0) {
    const sql = db();
    for (const line of lines) {
      if (Number(line.unitPriceMinor) !== Number(line.currentPriceMinor)) {
        await sql`UPDATE cart_line SET unit_price_minor = ${line.currentPriceMinor} WHERE id = ${line.lineId}`;
      }
    }
    await sql`
      UPDATE cart SET notices = ${sql.json(changed)}::jsonb, updated_at = now() WHERE id = ${cart.id}
    `;
    throw errors.conflict('A price changed since you saw this cart. Look it over and place the order again.', 'price_changed', {
      notices: changed
    });
  }

  const stockProblem = derivedNotices(lines).find((n) => n.kind === 'unavailable' || n.kind === 'low_stock');
  if (stockProblem) {
    throw errors.conflict(stockProblem.message, 'insufficient_stock');
  }

  const subtotal = lines.reduce((acc, l) => acc + Number(l.unitPriceMinor) * l.quantity, 0);
  const rung = cart.protectionEnabled ? rungForSubtotal(subtotal) : null;
  const protectionRow = rung ? await protectionVariant(rung.sku) : null;
  const protectionPrice = protectionRow ? Number(protectionRow.priceMinor) : 0;

  const shipping = method.priceMinor;
  // Tax is ten percent of the line subtotal; shipment protection is excluded.
  const taxable = subtotal;
  const tax = taxFor(taxable);
  const total = subtotal + protectionPrice + shipping + tax;

  if (expectedTotalMinor !== undefined && Number(expectedTotalMinor) !== total) {
    throw errors.conflict('The total changed. Check the new total and place the order again.', 'total_changed', {
      shown_total_minor: Number(expectedTotalMinor),
      current_total_minor: total
    });
  }

  // Stock commits in one step per line: available falls, committed rises, and
  // available never goes negative. Concurrent checkouts for the last unit
  // resolve here: one wins, the other is rejected before any invoice exists.
  const committed = [];
  const order = await tx(async (client) => {
    await client`SELECT pg_advisory_xact_lock(hashtext('vela-order-number'))`;
    let number;
    for (let attempt = 0; attempt < 5; attempt++) {
      number = await nextOrderNumber(client);
      const taken = await client`SELECT 1 FROM "order" WHERE number = ${number}`;
      if (taken.length === 0) break;
    }
    const [row] = await client`
      INSERT INTO "order" (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor,
        currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
        access_token_hash, idempotency_key, placed_at)
      VALUES (${number}, ${cart.customerId || null}, ${email.toLowerCase()},
        ${subtotal + protectionPrice}, ${shipping}, ${tax}, ${total}, 'usd', 'pending', 'unpaid', 'unfulfilled',
        ${method.code}, ${client.json(address)}, 'pending', ${idempotencyKey || null}, now())
      RETURNING *
    `;
    const inserted = [];
    for (const l of lines) {
      const [lineRow] = await client`
        INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
        VALUES (${row.id}, ${l.variantId}, ${l.productTitle}, ${l.sku}, ${l.quantity},
          ${Number(l.unitPriceMinor)}, ${Number(l.unitPriceMinor) * l.quantity})
        RETURNING *
      `;
      inserted.push(lineRow);
    }
    if (protectionRow) {
      const [lineRow] = await client`
        INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
        VALUES (${row.id}, ${protectionRow.id}, ${protectionRow.title}, ${protectionRow.sku}, 1, ${protectionPrice}, ${protectionPrice})
        RETURNING *
      `;
      inserted.push(lineRow);
    }

    for (const l of lines) {
      const updated = await client`
        UPDATE inventory_level
        SET available = available - ${l.quantity}, committed = committed + ${l.quantity}
        WHERE variant_id = ${l.variantId} AND available >= ${l.quantity}
        RETURNING variant_id
      `;
      if (updated.length === 0) {
        throw errors.conflict(`${l.sku} was taken while you were checking out.`, 'insufficient_stock', {
          resource: l.sku
        });
      }
      committed.push(l.sku);
    }

    // Serials are allocated to camera lines when the order is confirmed.
    for (const l of lines) {
      if (l.productKind !== 'camera') continue;
      const warranty = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      for (let i = 0; i < l.quantity; i++) {
        let placed = false;
        for (let attempt = 0; attempt < 6 && !placed; attempt++) {
          const serial = generateSerial(l.productHandle);
          const res = await client`
            INSERT INTO device (serial, product_id, variant_id, status, order_id, warranty_until)
            VALUES (${serial}, ${l.productId}, ${l.variantId}, 'sold', ${row.id}, ${warranty})
            ON CONFLICT DO NOTHING
            RETURNING id
          `;
          placed = res.length > 0;
        }
      }
    }

    await client`
      UPDATE "order" SET access_token_hash = ${hashToken('pending')} WHERE id = ${row.id}
    `;
    return { order: row, lines: inserted };
  });

  const externalKey = externalKeyForEmail(email);
  const accessToken = accessTokenFor(order.order.id, order.order.number);

  try {
    const account = await ensureAccount({
      externalKey,
      name: address.name || email,
      email: email.toLowerCase()
    });
    const invoice = await raiseInvoice({
      accountId: account.accountId,
      orderNumber: order.order.number,
      amountMinor: total,
      currency: 'USD'
    });
    const sql = db();
    const [confirmed] = await sql`
      UPDATE "order"
      SET status = 'confirmed', payment_status = 'invoiced',
          access_token_hash = ${hashToken(accessToken)},
          killbill_external_key = ${externalKey},
          killbill_invoice_amount = ${minorToDecimalString(total)},
          placed_at = now()
      WHERE id = ${order.order.id} AND status = 'pending'
      RETURNING *
    `;
    if (!confirmed) {
      throw new Error('order could not be confirmed');
    }
    await sendOrderConfirmation({
      to: email.toLowerCase(),
      orderNumber: confirmed.number,
      lines: order.lines,
      totalMinor: total
    });
    const sql2 = db();
    await sql2`DELETE FROM cart WHERE id = ${cart.id}`;
    return { order: confirmed, access_token: accessToken, replayed: false, invoice };
  } catch (err) {
    // Roll the whole attempt back: no order, no invoice, stock released.
    logError('order.place_failed', { order_id: order.order.id, error: err.message });
    try {
      await tx(async (client) => {
        for (const l of lines) {
          await client`
            UPDATE inventory_level
            SET available = available + ${l.quantity}, committed = committed - ${l.quantity}
            WHERE variant_id = ${l.variantId}
          `;
        }
        await client`DELETE FROM device WHERE order_id = ${order.order.id}`;
        await client`DELETE FROM "order" WHERE id = ${order.order.id}`;
      });
    } catch (rollbackErr) {
      logError('order.rollback_failed', { order_id: order.order.id, error: rollbackErr.message });
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      502,
      'billing_unavailable',
      'We could not reach the billing service. Nothing was charged. Try again in a moment.'
    );
  }
}

const findOrderBy = {
  IdempotencyKey: async (key) => {
    const sql = db();
    const [order] = await sql`SELECT * FROM "order" WHERE idempotency_key = ${key} LIMIT 1`;
    return order || null;
  }
};

export function verifyAccessToken(order, token) {
  if (!token || !order) return false;
  const expected = accessTokenFor(order.id, order.number);
  if (expected === token) return true;
  return order.accessTokenHash === hashToken(token);
}

export async function getOrderRow(number) {
  const sql = db();
  const [order] = await sql`SELECT * FROM "order" WHERE number = ${number} LIMIT 1`;
  return order || null;
}

export async function readOrder(number, { accessToken, customerId } = {}) {
  const sql = db();
  const order = await getOrderRow(number);
  if (!order) throw errors.notFound('That order does not exist.', 'order_not_found');
  const allowed =
    (customerId && order.customerId === customerId) || verifyAccessToken(order, accessToken);
  if (!allowed) throw errors.notFound('That order does not exist.', 'order_not_found');

  const lines = await sql`
    SELECT ol.*, v.sku AS live_sku, p.kind AS product_kind, p.handle AS product_handle
    FROM order_line ol
    JOIN variant v ON v.id = ol.variant_id
    JOIN product p ON p.id = v.product_id
    WHERE ol.order_id = ${order.id}
    ORDER BY ol.id ASC
  `;
  const serials = await sql`
    SELECT d.serial, d.status, d.firmware_version, d.nickname, v.sku, p.title AS model,
           o.customer_id AS owner_customer_id
    FROM device d
    JOIN variant v ON v.id = d.variant_id
    JOIN product p ON p.id = d.product_id
    LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
    WHERE d.order_id = ${order.id}
    ORDER BY d.id ASC
  `;
  const liveSerials = serials.map((s) => ({
    serial: s.serial,
    model: s.model,
    sku: s.sku,
    registered_to_customer_id: s.ownerCustomerId || null,
    firmware_version: s.firmwareVersion,
    nickname: s.nickname
  }));

  return {
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.paymentStatus,
    fulfilment_status: order.fulfilmentStatus,
    state_chip: stateChip(order),
    subtotal_minor: Number(order.subtotalMinor),
    shipping_minor: Number(order.shippingMinor),
    tax_minor: Number(order.taxMinor),
    total_minor: Number(order.totalMinor),
    currency: order.currency,
    shipping_method: order.shippingMethod,
    shipping_address: order.shippingAddress,
    killbill_external_key: order.killbillExternalKey,
    killbill_invoice_amount: order.killbillInvoiceAmount,
    placed_at: order.placedAt,
    lines: lines.map((l) => ({
      id: l.id,
      title: l.titleSnapshot,
      sku: l.skuSnapshot,
      quantity: l.quantity,
      unit_price_minor: Number(l.unitPriceMinor),
      total_minor: Number(l.totalMinor),
      product_kind: l.productKind,
      product_handle: l.productHandle
    })),
    serials: liveSerials
  };
}

export function stateChip(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  const payment = order.paymentStatus === 'invoiced' ? 'invoiced' : 'unpaid';
  if (order.fulfilmentStatus === 'fulfilled') return `Confirmed, ${payment} and fulfilled`;
  return `Confirmed and ${payment}`;
}

export async function listOrdersForCustomer(customerId, { pageSize, cursor }) {
  const sql = db();
  const cursorId = numericCursor(cursor);
  const rows = await sql`
    SELECT o.*, (
      SELECT ol.title_snapshot FROM order_line ol WHERE ol.order_id = o.id ORDER BY ol.id ASC LIMIT 1
    ) AS first_line_title, (
      SELECT count(*)::int FROM order_line ol WHERE ol.order_id = o.id
    ) AS line_count
    FROM "order" o
    WHERE o.customer_id = ${customerId}
      AND (${cursorId}::bigint IS NULL OR o.id < ${cursorId})
    ORDER BY o.id DESC
    LIMIT ${pageSize + 1}
  `;
  const hasMore = rows.length > pageSize;
  const data = rows.slice(0, pageSize);
  return {
    data: data.map((o) => ({
      number: o.number,
      placed_at: o.placedAt,
      total_minor: Number(o.totalMinor),
      currency: o.currency,
      status: o.status,
      payment_status: o.paymentStatus,
      fulfilment_status: o.fulfilmentStatus,
      state_chip: stateChip(o),
      first_line_title: o.firstLineTitle,
      line_count: o.lineCount
    })),
    hasMore,
    nextCursor: hasMore ? String(data[data.length - 1].id) : null
  };
}

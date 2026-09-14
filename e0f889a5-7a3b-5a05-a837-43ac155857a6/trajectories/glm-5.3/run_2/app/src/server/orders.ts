import { q, pool } from './db/pool.ts';
import { randomToken, sha256Hex } from './crypto.ts';
import { taxOf, protectionRung, protectionPriceMinor, minorToDecimalString } from './money.ts';
import { SHIPPING_METHODS } from './cart.ts';
import { getAccountByExternalKey, createAccount, createInvoiceItem, accountIdFromLocation } from './killbill.ts';
import { sendMail } from './mail.ts';

export class OrderError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export function money(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  return `${minor < 0 ? '-' : ''}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export type OrderLineView = {
  id: string;
  sku_snapshot: string;
  title_snapshot: string;
  quantity: number;
  unit_price_minor: number;
  total_minor: number;
};

export type OrderView = {
  id: string;
  number: string;
  email: string;
  customer_id: string | null;
  subtotal_minor: number;
  shipping_minor: number;
  tax_minor: number;
  discount_minor: number;
  protection_minor: number;
  total_minor: number;
  currency: string;
  status: string;
  payment_status: string;
  fulfilment_status: string;
  shipping_method: string | null;
  shipping_address: any;
  killbill_external_key: string | null;
  killbill_invoice_amount: string | null;
  placed_at: string | null;
  lines: OrderLineView[];
  serials: { sku: string; serial: string; registered: boolean }[];
  access_token?: string;
};

export async function loadCartRow(cartToken: string) {
  const res = await q(`SELECT * FROM cart WHERE token = $1`, [cartToken]);
  return res.rows[0] ?? null;
}

function protectionOf(row: any): number {
  // Protection is stored as a negative discount so that
  // total == subtotal + shipping + tax - discount holds on every order.
  return Math.max(0, -Number(row.discount_minor ?? 0));
}

export async function orderViewByNumber(number: string): Promise<OrderView | null> {
  const res = await q(`SELECT * FROM order_row WHERE number = $1`, [number]);
  if (res.rows.length === 0) return null;
  return orderView(res.rows[0]);
}

export async function orderView(row: any, accessToken?: string): Promise<OrderView> {
  const lines = await q(
    `SELECT id, sku_snapshot, title_snapshot, quantity, unit_price_minor, total_minor
       FROM order_line WHERE order_id = $1 ORDER BY id`,
    [row.id]
  );
  const serials = await q(
    `SELECT v.sku, d.serial, (o.id IS NOT NULL) AS registered
       FROM device d
       JOIN variant v ON v.id = d.variant_id
       LEFT JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL
      WHERE d.order_id = $1 ORDER BY d.id`,
    [row.id]
  );
  return {
    id: String(row.id),
    number: row.number,
    email: row.email,
    customer_id: row.customer_id ? String(row.customer_id) : null,
    subtotal_minor: Number(row.subtotal_minor),
    shipping_minor: Number(row.shipping_minor),
    tax_minor: Number(row.tax_minor),
    discount_minor: Number(row.discount_minor ?? 0),
    protection_minor: protectionOf(row),
    total_minor: Number(row.total_minor),
    currency: row.currency,
    status: row.status,
    payment_status: row.payment_status,
    fulfilment_status: row.fulfilment_status,
    shipping_method: row.shipping_method,
    shipping_address: row.shipping_address,
    killbill_external_key: row.killbill_external_key,
    killbill_invoice_amount: row.killbill_invoice_amount === null ? null : String(row.killbill_invoice_amount),
    placed_at: row.placed_at ? new Date(row.placed_at).toISOString() : null,
    lines: lines.rows.map((l: any) => ({
      id: String(l.id),
      sku_snapshot: l.sku_snapshot,
      title_snapshot: l.title_snapshot,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      total_minor: Number(l.total_minor),
    })),
    serials: serials.rows.map((s: any) => ({ sku: s.sku, serial: s.serial, registered: Boolean(s.registered) })),
    ...(accessToken ? { access_token: accessToken } : {}),
  };
}

export type PlaceOrderInput = {
  cartToken: string;
  idempotencyKey?: string | null;
  customerId?: string | null;
};

export async function placeOrder(input: PlaceOrderInput): Promise<{ order: OrderView; accessToken: string; replayed: boolean }> {
  // An Idempotency-Key seen before returns the first order and creates nothing new.
  if (input.idempotencyKey) {
    const existing = await q(`SELECT * FROM order_row WHERE idempotency_key = $1`, [input.idempotencyKey]);
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const tokenRes = await q(`SELECT value FROM app_meta WHERE key = $1`, [`order_access:${row.id}`]);
      const accessToken = tokenRes.rows[0]?.value ?? '';
      return { order: await orderView(row, accessToken), accessToken, replayed: true };
    }
  }

  const cart = await loadCartRow(input.cartToken);
  if (!cart) throw new OrderError('unknown_cart', 'That cart is no longer here.', 404);

  const lines = await q(
    `SELECT cl.id AS cart_line_id, cl.variant_id, cl.quantity, cl.unit_price_minor AS snapshot_price,
            v.sku, v.price_minor AS current_price, p.title AS product_title, p.kind,
            v.inventory_policy AS policy,
            (SELECT available FROM inventory_level WHERE variant_id = v.id) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
      WHERE cl.cart_id = $1
      ORDER BY cl.id`,
    [cart.id]
  );

  if (lines.rows.length === 0) throw new OrderError('empty_cart', 'Your cart is empty.', 400);

  // The order is refused when a line changed since the cart was last shown.
  const changed = lines.rows.find((l: any) => Number(l.snapshot_price) !== Number(l.current_price));
  if (changed) {
    throw new OrderError(
      'price_changed',
      `The price of ${changed.product_title} changed from ${money(Number(changed.snapshot_price))} to ${money(Number(changed.current_price))} since you added it.`,
      409
    );
  }

  const email = (cart.email || '').trim().toLowerCase();
  if (!email) throw new OrderError('missing_email', 'We need an email to send the order to.', 400);
  if (!cart.shipping_method || !SHIPPING_METHODS[cart.shipping_method]) {
    throw new OrderError('missing_shipping_method', 'Choose how it gets there.', 400);
  }
  const address = cart.shipping_address || {};
  for (const field of ['name', 'line1', 'city', 'postal_code', 'country']) {
    if (!address[field]) throw new OrderError('missing_address', 'We need the whole address.', 400);
  }

  const merchandise = lines.rows.filter((l: any) => l.kind !== 'protection');
  const subtotal = merchandise.reduce((sum: number, l: any) => sum + Number(l.current_price) * Number(l.quantity), 0);
  const shippingMinor = SHIPPING_METHODS[cart.shipping_method].price_minor;
  const taxMinor = taxOf(subtotal);
  const rung = protectionRung(subtotal);
  const protectionMinor = cart.protection_enabled ? protectionPriceMinor(rung) : 0;
  const total = subtotal + shippingMinor + taxMinor + protectionMinor;

  const accessToken = randomToken(24);
  const accessTokenHash = sha256Hex(accessToken);
  const killbillExternalKey = email;
  const year = new Date().getUTCFullYear();

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Stock commits in one step, guarded on the row so two concurrent checkouts cannot both win.
    for (const line of lines.rows) {
      if (line.kind === 'protection' || line.policy !== 'deny') continue;
      const res = await c.query(
        `UPDATE inventory_level SET available = available - $2, committed = committed + $2
          WHERE variant_id = $1 AND available >= $2 RETURNING variant_id`,
        [line.variant_id, Number(line.quantity)]
      );
      if (res.rowCount === 0) {
        const inv = await c.query(`SELECT available FROM inventory_level WHERE variant_id = $1`, [line.variant_id]);
        const available = inv.rows[0] ? Number(inv.rows[0].available) : 0;
        throw new OrderError(
          'out_of_stock',
          available > 0 ? `Only ${available} left of ${line.product_title}.` : `${line.product_title} is sold out.`,
          409
        );
      }
    }

    const seq = await c.query(
      `UPDATE order_number_seq SET next_number = next_number + 1 WHERE year = $1 RETURNING next_number`,
      [year]
    );
    let nextNumber: number;
    if (seq.rows.length === 0) {
      const ins = await c.query(
        `INSERT INTO order_number_seq (year, next_number) VALUES ($1, 2)
         ON CONFLICT (year) DO UPDATE SET next_number = order_number_seq.next_number + 1 RETURNING next_number`,
        [year]
      );
      nextNumber = Number(ins.rows[0].next_number) - 1;
    } else {
      nextNumber = Number(seq.rows[0].next_number) - 1;
    }
    const orderNumber = `VE-${year}-${String(nextNumber).padStart(4, '0')}`;

    const inserted = await c.query(
      `INSERT INTO order_row
         (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor, total_minor,
          currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
          access_token_hash, killbill_external_key, idempotency_key, placed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'USD','confirmed','unpaid','unfulfilled',$9,$10,$11,$12,$13, now())
       RETURNING *`,
      [
        orderNumber, input.customerId ?? null, email, subtotal, shippingMinor, taxMinor, -protectionMinor, total,
        cart.shipping_method, JSON.stringify(address), accessTokenHash, killbillExternalKey, input.idempotencyKey ?? null,
      ]
    );
    const orderRow = inserted.rows[0];

    for (const line of lines.rows) {
      if (line.kind === 'protection') continue;
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderRow.id, line.variant_id, line.product_title, line.sku, Number(line.quantity), Number(line.current_price), Number(line.current_price) * Number(line.quantity)]
      );
    }

    await c.query(
      `INSERT INTO app_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`order_access:${orderRow.id}`, accessToken]
    );

    await c.query('COMMIT');
    return { order: await orderView(orderRow, accessToken), accessToken, replayed: false };
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

export async function confirmOrder(orderId: string | number): Promise<OrderView> {
  const res = await q(`SELECT * FROM order_row WHERE id = $1`, [orderId]);
  const row = res.rows[0];
  if (!row) throw new OrderError('unknown_order', 'That order is not here.', 404);
  if (row.payment_status === 'invoiced') return orderView(row);

  const externalKey = row.killbill_external_key || row.email;
  const email = row.email;

  const accountId = await ensureAccount(externalKey, {
    name: row.shipping_address?.name || email,
    email,
    currency: row.currency,
    country: row.shipping_address?.country || 'US',
  });

  if (!accountId) {
    throw new OrderError('billing_unavailable', 'Something went wrong at our end. Try again.', 502);
  }

  const amount = minorToDecimalString(Number(row.total_minor));
  const invoice = await createInvoiceItem(accountId, {
    description: `Vela order ${row.number}`,
    amount: Number(amount),
    currency: row.currency,
    startDate: (row.placed_at ? new Date(row.placed_at) : new Date()).toISOString().slice(0, 10),
  });

  if (invoice.status !== 200 && invoice.status !== 201) {
    throw new OrderError('invoice_failed', 'Something went wrong at our end. Try again.', 502);
  }

  await q(`UPDATE order_row SET payment_status = 'invoiced', killbill_invoice_amount = $2 WHERE id = $1`, [orderId, amount]);

  await sendMail({
    to: email,
    subject: `Order confirmed: ${row.number}`,
    text: await mailBody(orderId),
  });

  const refreshed = await q(`SELECT * FROM order_row WHERE id = $1`, [orderId]);
  return orderView(refreshed.rows[0]);
}

async function ensureAccount(externalKey: string, details: { name: string; email: string; currency: string; country: string }): Promise<string | null> {
  const existing = await getAccountByExternalKey(externalKey);
  if (existing.status === 200 && existing.body?.accountId) return existing.body.accountId;

  const created = await createAccount({
    name: details.name, externalKey, email: details.email, currency: details.currency, country: details.country,
  });
  if (created.status === 201) {
    return accountIdFromLocation(created.headers.location) || created.body?.accountId || null;
  }
  if (created.status === 400 || created.status === 409) {
    const again = await getAccountByExternalKey(externalKey);
    if (again.status === 200 && again.body?.accountId) return again.body.accountId;
  }
  return null;
}

async function mailBody(orderId: string | number): Promise<string> {
  const order = await orderViewByNumberRaw(orderId);
  const lines = order.lines
    .map((l: any) => `${l.title_snapshot} x ${l.quantity} at ${money(Number(l.unit_price_minor))}`)
    .join('\n');
  const address = order.shipping_address || {};
  return [
    `Order ${order.number} is confirmed.`,
    '',
    lines,
    '',
    `Subtotal ${money(Number(order.subtotal_minor))}`,
    `Shipping ${money(Number(order.shipping_minor))}`,
    `Tax ${money(Number(order.tax_minor))}`,
    `Total ${money(Number(order.total_minor))}`,
    '',
    'It goes to:',
    address.name || '',
    [address.line1, address.line2, address.city, address.region, address.postal_code, address.country].filter(Boolean).join(', '),
    '',
    `We will write to ${order.email} when it ships.`,
    '',
    'The Vela team.'
  ].join('\n');
}

async function orderViewByNumberRaw(orderId: string | number) {
  const res = await q(`SELECT * FROM order_row WHERE id = $1`, [orderId]);
  const row = res.rows[0];
  const lines = await q(
    `SELECT title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor FROM order_line WHERE order_id = $1 ORDER BY id`,
    [orderId]
  );
  return { ...row, lines: lines.rows };
}

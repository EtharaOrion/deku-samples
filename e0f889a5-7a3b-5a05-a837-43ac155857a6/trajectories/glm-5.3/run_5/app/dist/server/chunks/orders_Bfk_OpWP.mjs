import { o as one, q, t as tx, i as isUniqueViolation } from "./db_C-9WqIXq.mjs";
import { d as dollars, m as sha256Hex, b as getCartState, a as deliveryMethod, p as protectionRungFor, n as decimal, o as randomToken, t as taxOf } from "./cart_BmbV16eC.mjs";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
const env = {
  get smtpHost() {
    return need("SMTP_HOST");
  },
  get smtpPort() {
    return Number(process.env.SMTP_PORT || 587);
  },
  get smtpUser() {
    return process.env.SMTP_USER || "";
  },
  get smtpPass() {
    return process.env.SMTP_PASS || "";
  },
  get paymentsUrl() {
    return need("PAYMENTS_API_URL").replace(/\/+$/, "");
  },
  get paymentsKey() {
    return need("PAYMENTS_API_KEY");
  },
  get paymentsSecret() {
    return need("PAYMENTS_API_SECRET");
  },
  get paymentsAdminUser() {
    return need("PAYMENTS_ADMIN_USER");
  },
  get paymentsAdminPassword() {
    return need("PAYMENTS_ADMIN_PASSWORD");
  }
};
function newRequestId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}
function logLine(obj) {
  process.stdout.write(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), ...obj }) + "\n");
}
function logEvent(event, fields = {}) {
  process.stdout.write(JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event, ...fields }) + "\n");
}
function headers(extra = {}) {
  return {
    Authorization: "Basic " + Buffer.from(`${env.paymentsAdminUser}:${env.paymentsAdminPassword}`).toString("base64"),
    "X-Killbill-ApiKey": env.paymentsKey,
    "X-Killbill-ApiSecret": env.paymentsSecret,
    "X-Killbill-CreatedBy": env.paymentsAdminUser,
    ...extra
  };
}
async function request(path, init = {}) {
  const started = Date.now();
  const res = await fetch(`${env.paymentsUrl}${path}`, {
    ...init,
    headers: { ...init.headers, ...headers() },
    signal: AbortSignal.timeout(2e4)
  });
  logEvent("billing.request", { path, status: res.status, ms: Date.now() - started });
  return res;
}
async function findAccount(externalKey) {
  const res = await request(`/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`billing account lookup failed: ${res.status}`);
  return await res.json();
}
async function createAccount(input) {
  const res = await request("/1.0/kb/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      externalKey: input.externalKey,
      email: input.email,
      currency: "USD",
      country: "US"
    })
  });
  if (res.status === 409 || res.status === 400) {
    const existing = await findAccount(input.externalKey);
    if (existing) return existing;
  }
  if (!res.ok && res.status !== 201) throw new Error(`billing account create failed: ${res.status}`);
  const location = res.headers.get("Location") || "";
  const accountId = location.split("/").filter(Boolean).pop() || "";
  if (accountId) return { accountId, externalKey: input.externalKey, email: input.email, currency: "USD" };
  const found = await findAccount(input.externalKey);
  if (!found) throw new Error("billing account create returned no account");
  return found;
}
async function ensureAccount(externalKey, email, name) {
  const existing = await findAccount(externalKey);
  if (existing) return existing;
  return createAccount({ externalKey, email, name });
}
async function raiseInvoice(accountId, totalMinor, description) {
  const amount = (Math.trunc(totalMinor) / 100).toFixed(2);
  const res = await request(`/1.0/kb/invoices/charges/${accountId}?autoCommit=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { amount: Number(amount), currency: "USD", itemType: "EXTERNAL_CHARGE", description, quantity: 1 }
    ])
  });
  if (!res.ok) throw new Error(`billing invoice create failed: ${res.status}`);
  const items = await res.json();
  const invoiceId = items?.[0]?.invoiceId;
  if (!invoiceId) throw new Error("billing invoice create returned no invoice");
  return { invoiceId, amount: Number(amount), currency: "USD", status: "COMMITTED" };
}
let cached = null;
function transport() {
  const key = `${env.smtpHost}:${env.smtpPort}:${env.smtpUser}:${env.smtpPass}`;
  if (cached && cached.key === key) return cached.transport;
  const t = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: false,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : void 0
  });
  cached = { key, transport: t };
  return t;
}
async function sendMail(input) {
  const started = Date.now();
  try {
    const info = await transport().sendMail({
      from: process.env.MAIL_FROM || "Vela <orders@vela.example>",
      to: [input.to],
      cc: void 0,
      bcc: void 0,
      subject: input.subject,
      text: input.text,
      html: input.html
    });
    logEvent("mail.sent", { to: input.to, subject: input.subject, ms: Date.now() - started, response: info?.response ?? null });
  } catch (err) {
    logEvent("mail.failed", { to: input.to, subject: input.subject, ms: Date.now() - started, error: String(err) });
    throw err;
  }
}
class OrderError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}
function toOrderView(o, lines, serials = {}) {
  const chip = o.status === "cancelled" ? "Cancelled" : o.status === "confirmed" && o.fulfilment_status === "fulfilled" ? "Confirmed and fulfilled" : o.status === "confirmed" ? "Confirmed, not yet sent" : "Awaiting payment";
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
      serials: serials[l.id] ?? []
    }))
  };
}
async function loadOrderLines(orderId) {
  return q(`SELECT * FROM order_line WHERE order_id = $1 ORDER BY id ASC`, [orderId]);
}
async function getOrder(number) {
  return one(`SELECT * FROM "order" WHERE number = $1`, [number]);
}
async function orderSerials(orderId) {
  const rows = await q(
    `SELECT order_line_id, serial FROM device_serial WHERE order_id = $1`,
    [orderId]
  );
  const out = {};
  for (const r of rows) (out[r.order_line_id] ||= []).push(r.serial);
  return out;
}
async function orderView(number) {
  const o = await getOrder(number);
  if (!o) return null;
  const lines = await loadOrderLines(o.id);
  const serials = await orderSerials(o.id);
  return toOrderView(o, lines, serials);
}
async function placeOrder(input) {
  const existing = input.idempotencyKey ? await one(
    `SELECT order_id, response FROM idempotency_key WHERE key = $1 AND scope = 'order'`,
    [input.idempotencyKey]
  ) : null;
  if (existing) {
    const view2 = await orderView((await one(`SELECT number FROM "order" WHERE id = $1`, [existing.order_id])).number);
    return { order: view2, replayed: true, access_token: existing.response.access_token };
  }
  const cart = await getCartState(input.cartToken);
  if (!cart || cart.lines.length === 0) throw new OrderError("cart_empty", "Your cart is empty.", 400);
  const changed = cart.notices.find((n) => n.kind === "price_change");
  if (changed) {
    throw new OrderError("price_changed", changed.message, 409, { notice: changed, cart });
  }
  const unavailable = cart.notices.find((n) => n.kind === "availability");
  if (unavailable) {
    throw new OrderError("unavailable", unavailable.message, 409, { notice: unavailable, cart });
  }
  const method = deliveryMethod(input.shippingMethod);
  if (!method) throw new OrderError("unknown_method", "Choose a delivery method.", 400);
  const subtotal = cart.subtotal_minor;
  const tax = taxOf(subtotal);
  const shipping = method.price_minor;
  const rung = protectionRungFor(subtotal);
  const protection = cart.protection.enabled && rung ? rung.price_minor : 0;
  const total = subtotal + protection + shipping + tax;
  if (input.expectedTotalMinor != null && Number(input.expectedTotalMinor) !== total) {
    throw new OrderError("total_changed", "The total changed. Please review your cart.", 409, { cart });
  }
  const committed = await tx(async (client) => {
    for (const line of cart.lines) {
      const res = await client.query(
        `UPDATE inventory_level SET available = available - $1, committed = committed + $1
          WHERE variant_id = $2 AND available >= $1
          RETURNING variant_id`,
        [line.quantity, line.variant_id]
      );
      if (res.rowCount === 0) {
        throw new OrderError(
          "out_of_stock",
          `${line.product_title} is sold out. ${line.available > 0 ? `Only ${line.available} left.` : ""}`.trim(),
          409
        );
      }
    }
    const seq = (await client.query(
      `SELECT nextval('order_number_seq') AS n`
    )).rows[0].n;
    const number = `VE-${(/* @__PURE__ */ new Date()).getUTCFullYear()}-${String(seq).padStart(4, "0")}`;
    const accessToken = randomToken(18);
    const address = JSON.stringify(input.shippingAddress);
    const order = (await client.query(
      `INSERT INTO "order"
         (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, total_minor, currency,
          status, payment_status, fulfilment_status, shipping_method, shipping_address, marketing_consent,
          protection_minor, discount_minor, access_token_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'USD','pending','unpaid','unfulfilled',$8,$9,$10,$11,0,$12)
       RETURNING *`,
      [
        number,
        input.customerId,
        input.email.toLowerCase(),
        subtotal,
        shipping,
        tax,
        total,
        method.name,
        address,
        input.marketingConsent,
        protection,
        sha256Hex(accessToken)
      ]
    )).rows[0];
    for (const line of cart.lines) {
      await client.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          order.id,
          line.variant_id,
          `${line.product_title} — ${line.option_value}`,
          line.sku,
          line.quantity,
          line.unit_price_minor,
          line.unit_price_minor * line.quantity
        ]
      );
    }
    if (input.idempotencyKey) {
      await client.query(
        `INSERT INTO idempotency_key (key, scope, order_id, response) VALUES ($1,'order',$2,$3)`,
        [input.idempotencyKey, order.id, JSON.stringify({ number, access_token: accessToken })]
      );
    }
    return { order, accessToken };
  }).catch((err) => {
    if (isUniqueViolation(err)) {
      throw new OrderError("conflict", "That order was already taken. Try again.", 409);
    }
    throw err;
  });
  const externalKey = input.email.toLowerCase();
  let invoiceAmount = null;
  let invoiceError = null;
  try {
    const account = await ensureAccount(externalKey, externalKey, input.shippingAddress.name || externalKey);
    const invoice = await raiseInvoice(account.accountId, total, `Vela order ${committed.order.number}`);
    invoiceAmount = invoice.amount;
    await q(
      `UPDATE "order" SET status='confirmed', payment_status='invoiced',
              killbill_external_key=$1, killbill_invoice_amount=$2, placed_at=now()
        WHERE id=$3`,
      [externalKey, decimal(total), committed.order.id]
    );
  } catch (err) {
    invoiceError = String(err);
    logEvent("order.invoice_failed", { order: committed.order.number, error: invoiceError });
    await q(
      `UPDATE "order" SET killbill_external_key=$1, killbill_invoice_amount=NULL WHERE id=$2`,
      [externalKey, committed.order.id]
    );
    throw new OrderError("billing_failed", "Something went wrong at our end. Your order was not placed.", 502);
  }
  const finalOrder = await one(`SELECT * FROM "order" WHERE id = $1`, [committed.order.id]);
  const lines = await loadOrderLines(committed.order.id);
  const view = toOrderView(finalOrder, lines);
  try {
    await sendMail({
      to: finalOrder.email,
      subject: `Order confirmed: ${finalOrder.number}`,
      text: mailText(view),
      html: mailHtml(view)
    });
  } catch (err) {
    logEvent("order.mail_failed", { order: finalOrder.number, error: String(err) });
  }
  await q(`DELETE FROM cart_line WHERE cart_id = $1`, [cart.id]);
  return { order: view, replayed: false, access_token: committed.accessToken };
}
function mailText(order) {
  const lines = order.lines.map((l) => `${l.title} × ${l.quantity} — ${dollars(l.total_minor)}`).join("\n");
  return [
    `Order ${order.number} is confirmed.`,
    "",
    lines,
    "",
    `Subtotal ${dollars(order.subtotal_minor)}`,
    order.protection_minor > 0 ? `Shipment protection ${dollars(order.protection_minor)}` : "",
    `Delivery ${order.shipping_method} ${dollars(order.shipping_minor)}`,
    `Tax ${dollars(order.tax_minor)}`,
    `Total ${dollars(order.total_minor)}`,
    "",
    "The Vela team."
  ].filter((s) => s !== "").join("\n");
}
function mailHtml(order) {
  const rows = order.lines.map((l) => `<tr><td>${escapeHtml(l.title)}</td><td>${l.quantity}</td><td>${dollars(l.total_minor)}</td></tr>`).join("");
  return `<p>Order ${escapeHtml(order.number)} is confirmed.</p>
<table>
<thead><tr><th>Item</th><th>Quantity</th><th>Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p>Subtotal ${dollars(order.subtotal_minor)}<br>
Delivery ${escapeHtml(order.shipping_method ?? "")} ${dollars(order.shipping_minor)}<br>
Tax ${dollars(order.tax_minor)}<br>
Total ${dollars(order.total_minor)}</p>
<p>The Vela team.</p>`;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
async function canSeeOrder(order, opts) {
  if (opts.accessToken && sha256Hex(opts.accessToken) === order.access_token_hash) return true;
  if (opts.customerId && order.customer_id === opts.customerId) return true;
  return false;
}
export {
  OrderError as O,
  logEvent as a,
  logLine as b,
  canSeeOrder as c,
  getOrder as g,
  loadOrderLines as l,
  newRequestId as n,
  orderSerials as o,
  placeOrder as p,
  toOrderView as t
};

import { q } from "./pool_DifDkjYx.mjs";
import { s as sha256Hex, r as randomToken, v as verifyPassword } from "./crypto_BsBBFoSY.mjs";
const TOKEN_TTL_DAYS = 14;
function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}
async function customerByEmail(email) {
  const res = await q(`SELECT id, email, name, status, created_at, password_hash FROM customer WHERE lower(email) = lower($1)`, [normalizeEmail(email)]);
  return res.rows[0] ?? null;
}
async function createCustomer(input) {
  const res = await q(
    `INSERT INTO customer (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id, email, name, status, created_at`,
    [normalizeEmail(input.email), input.name, input.passwordHash]
  );
  return res.rows[0];
}
async function issueToken(customerId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1e3);
  await q(`INSERT INTO auth_token (token_hash, customer_id, expires_at) VALUES ($1, $2, $3)`, [sha256Hex(token), customerId, expires.toISOString()]);
  return { token, expires_at: expires.toISOString() };
}
async function customerForToken(token) {
  if (!token) return null;
  const res = await q(
    `SELECT c.id, c.email, c.name, c.status, c.created_at
       FROM auth_token t JOIN customer c ON c.id = t.customer_id
      WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [sha256Hex(token)]
  );
  return res.rows[0] ?? null;
}
async function authenticate(email, password) {
  const customer = await customerByEmail(email);
  if (!customer) return null;
  if (customer.status !== "active") return null;
  const ok = await verifyPassword(password, customer.password_hash);
  return ok ? customer : null;
}
function bearerFrom(header) {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
async function lastSeenReleaseBuild(customerId) {
  const res = await q(`SELECT value FROM app_meta WHERE key = $1`, [`last_seen_build:${customerId}`]);
  if (res.rows.length === 0) return null;
  const parsed = Number(res.rows[0].value);
  return Number.isFinite(parsed) ? parsed : null;
}
function minorToDecimalString(minor) {
  const abs = Math.abs(Math.trunc(minor));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return minor < 0 ? `-${s}` : s;
}
function taxOf(subtotal) {
  return Math.trunc(subtotal * 10 / 100);
}
function protectionRung(subtotal) {
  if (subtotal < 1e4) return subtotal >= 1 ? "VELA-PROTECT-1" : "VELA-PROTECT-1";
  if (subtotal < 5e4) return "VELA-PROTECT-2";
  if (subtotal < 1e5) return "VELA-PROTECT-3";
  return "VELA-PROTECT-4";
}
function protectionPriceMinor(sku) {
  switch (sku) {
    case "VELA-PROTECT-1":
      return 98;
    case "VELA-PROTECT-2":
      return 298;
    case "VELA-PROTECT-3":
      return 598;
    case "VELA-PROTECT-4":
      return 1198;
    default:
      return 0;
  }
}
const SHIPPING_METHODS = {
  Standard: { title: "Standard", price_minor: 0, window: "5 to 7 days", zone: "us-domestic" },
  Express: { title: "Express", price_minor: 2500, window: "2 days", zone: "us-domestic" }
};
async function findOrCreateCart(input) {
  if (input.token) {
    const res2 = await q(`SELECT * FROM cart WHERE token = $1 AND expires_at > now()`, [input.token]);
    if (res2.rows.length > 0) return res2.rows[0];
  }
  const token = input.token || randomToken(24);
  const res = await q(
    `INSERT INTO cart (token, customer_id, email) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [token, input.customerId ?? null, input.email ?? null]
  );
  return res.rows[0];
}
async function touchCart(cartId) {
  await q(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cartId]);
}
async function loadLines(cartId) {
  const res = await q(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            p.handle AS product_handle, p.title AS product_title, p.kind,
            il.available, il.committed
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.id`,
    [cartId]
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    variant_id: String(r.variant_id),
    sku: r.sku,
    title: r.product_title,
    variant_title: r.variant_title,
    option_value: r.option_value,
    product_handle: r.product_handle,
    product_title: r.product_title,
    quantity: r.quantity,
    unit_price_minor: Number(r.unit_price_minor),
    line_total_minor: Number(r.unit_price_minor) * r.quantity,
    current_price_minor: Number(r.current_price_minor),
    available: r.available === null ? 0 : Number(r.available),
    price_changed: Number(r.unit_price_minor) !== Number(r.current_price_minor),
    availability_changed: false,
    kind: r.kind,
    is_protection: r.kind === "protection"
  }));
}
function noticesFor(lines, previouslyAvailable) {
  const notices = [];
  for (const line of lines) {
    if (line.price_changed) {
      notices.push({
        code: "price_changed",
        message: `The price of ${line.title} changed from ${money(line.unit_price_minor)} to ${money(line.current_price_minor)} since you added it.`
      });
    }
  }
  return notices;
}
function money(minor) {
  const abs = Math.abs(Math.trunc(minor));
  return `${minor < 0 ? "-" : ""}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
async function cartView(cart) {
  const lines = await loadLines(cart.id);
  const merchandise = lines.filter((l) => !l.is_protection);
  const subtotal = merchandise.reduce((sum, l) => sum + l.current_price_minor * l.quantity, 0);
  merchandise.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
  const rung = merchandise.length > 0 ? protectionRung(subtotal) : null;
  const protectionLine = lines.find((l) => l.is_protection);
  const hasProtectionLine = Boolean(protectionLine);
  const protectionEnabled = cart.protection_enabled === true;
  const protectionMinor = protectionEnabled && rung ? protectionPriceMinor(rung) : 0;
  const shippingMethod = cart.shipping_method && SHIPPING_METHODS[cart.shipping_method] ? cart.shipping_method : null;
  const shippingMinor = shippingMethod ? SHIPPING_METHODS[shippingMethod].price_minor : null;
  const taxBase = subtotal;
  const taxMinor = taxOf(taxBase);
  const total = subtotal + protectionMinor + (shippingMinor ?? 0) + taxMinor;
  return {
    token: cart.token,
    email: cart.email,
    shipping_address: cart.shipping_address,
    shipping_method: shippingMethod,
    protection_enabled: protectionEnabled,
    lines,
    notices: noticesFor(lines),
    subtotal_minor: subtotal,
    estimated_tax_minor: taxMinor,
    protection_minor: protectionMinor,
    protection_rung: rung,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: total,
    delivery_estimate: shippingMethod ? SHIPPING_METHODS[shippingMethod].window : null,
    has_protection_line: hasProtectionLine
  };
}
async function addLine(cartId, sku, quantity) {
  const variant = await q(
    `SELECT v.id, v.price_minor, v.product_id, p.kind, p.status, v.inventory_policy AS policy,
            (SELECT available FROM inventory_level WHERE variant_id = v.id) AS available
       FROM variant v JOIN product p ON p.id = v.product_id
      WHERE v.sku = $1`,
    [sku]
  );
  if (variant.rows.length === 0) throw new CartError("unknown_variant", "We do not sell that item.");
  const v = variant.rows[0];
  const available = v.available === null ? 0 : Number(v.available);
  if (v.policy === "deny" && available < 1) throw new CartError("sold_out", "That item is sold out.");
  const clampedQuantity = Math.max(1, Math.min(10, quantity));
  await q(
    `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cart_id, variant_id)
     DO UPDATE SET quantity = LEAST(cart_line.quantity + EXCLUDED.quantity, 10), unit_price_minor = EXCLUDED.unit_price_minor`,
    [cartId, v.id, clampedQuantity, v.price_minor]
  );
  await touchCart(cartId);
}
async function setLineQuantity(cartId, lineId, quantity) {
  if (quantity < 1 || quantity > 10) throw new CartError("invalid_quantity", "Quantity must be between 1 and 10.");
  const line = await q(
    `SELECT cl.*, v.sku, (SELECT available FROM inventory_level WHERE variant_id = cl.variant_id) AS available
       FROM cart_line cl WHERE cl.id = $1 AND cl.cart_id = $2`,
    [lineId, cartId]
  );
  if (line.rows.length === 0) throw new CartError("unknown_line", "That line is not in this cart.");
  const available = line.rows[0].available === null ? 0 : Number(line.rows[0].available);
  if (available < quantity) throw new CartError("insufficient_stock", `Only ${available} left.`);
  await q(`UPDATE cart_line SET quantity = $3 WHERE id = $1 AND cart_id = $2`, [lineId, cartId, quantity]);
  await touchCart(cartId);
}
async function removeLine(cartId, lineId) {
  const res = await q(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cartId]);
  if (res.rowCount === 0) throw new CartError("unknown_line", "That line is not in this cart.");
  await touchCart(cartId);
}
async function setProtection(cartId, enabled) {
  await q(`UPDATE cart SET protection_enabled = $2, updated_at = now() WHERE id = $1`, [cartId, enabled]);
}
async function setDelivery(cartId, input) {
  const method = input.shipping_method && SHIPPING_METHODS[input.shipping_method] ? input.shipping_method : input.shipping_method;
  await q(
    `UPDATE cart SET email = COALESCE($2, email), shipping_address = COALESCE($3, shipping_address),
            shipping_method = $4, updated_at = now() WHERE id = $1`,
    [cartId, input.email ?? null, input.shipping_address ? JSON.stringify(input.shipping_address) : null, method ?? null]
  );
}
class CartError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export {
  CartError as C,
  SHIPPING_METHODS as S,
  cartView as a,
  bearerFrom as b,
  customerForToken as c,
  customerByEmail as d,
  createCustomer as e,
  findOrCreateCart as f,
  authenticate as g,
  addLine as h,
  issueToken as i,
  setProtection as j,
  setDelivery as k,
  lastSeenReleaseBuild as l,
  minorToDecimalString as m,
  protectionRung as n,
  protectionPriceMinor as p,
  removeLine as r,
  setLineQuantity as s,
  taxOf as t
};

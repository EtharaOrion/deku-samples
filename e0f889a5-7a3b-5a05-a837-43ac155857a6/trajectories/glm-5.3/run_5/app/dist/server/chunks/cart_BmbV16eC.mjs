import { timingSafeEqual, createHmac, randomBytes, createHash } from "node:crypto";
import { q, o as one, t as tx } from "./db_C-9WqIXq.mjs";
let argon = null;
try {
  const mod = await import("@node-rs/argon2");
  if (typeof mod.hash === "function" && typeof mod.verify === "function") argon = mod;
} catch {
  argon = null;
}
const FALLBACK_PREFIX = "pbkdf2$";
async function fallbackHash(password) {
  const { pbkdf2 } = await import("node:crypto");
  const salt = randomBytes(16);
  const dk = pbkdf2(password, salt, 12e4, 32, "sha256");
  return `${FALLBACK_PREFIX}${salt.toString("hex")}$${dk.toString("hex")}`;
}
async function fallbackVerify(hash, password) {
  const { pbkdf2, timingSafeEqual: tse } = await import("node:crypto");
  const [tag, saltHex, wantHex] = hash.split("$");
  if (tag !== "pbkdf2" || !saltHex || !wantHex) return false;
  const got = pbkdf2(password, Buffer.from(saltHex, "hex"), 12e4, 32, "sha256");
  const want = Buffer.from(wantHex, "hex");
  return got.length === want.length && tse(got, want);
}
async function hashPassword(password) {
  if (argon) return argon.hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  return fallbackHash(password);
}
async function verifyPassword(hash, password) {
  if (hash.startsWith(FALLBACK_PREFIX)) return fallbackVerify(hash, password);
  if (argon) return argon.verify(hash, password);
  return false;
}
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
function b64url(input) {
  return Buffer.from(input).toString("base64url");
}
function sign(data) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}
function secret() {
  return process.env.TOKEN_SECRET || process.env.DATABASE_URL || "vela-dev-token-secret";
}
function issueToken(customerId, email) {
  const exp = Math.floor(Date.now() / 1e3) + TOKEN_TTL_SECONDS;
  const payload = { sub: customerId, email, exp };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1e3).toISOString() };
}
function readToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp * 1e3 < Date.now()) return null;
    const sub = Number(payload.sub);
    if (!Number.isFinite(sub) || sub < 1) return null;
    return { ...payload, sub };
  } catch {
    return null;
  }
}
function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}
function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
function dollars(minor) {
  const n = Number(minor ?? 0);
  const sign2 = n < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(n));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign2}$${whole}.${String(rest).padStart(2, "0")}`;
}
function decimal(minor) {
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign2 = minor < 0 ? "-" : "";
  return `${sign2}${whole}.${String(rest).padStart(2, "0")}`;
}
function taxOf(subtotalMinor) {
  return Math.trunc(subtotalMinor * 10 / 100);
}
const PROTECTION_PRODUCT_HANDLE = "shipment-protection";
async function listProducts(opts = {}) {
  const products = await q(
    `SELECT * FROM product ${opts.includeProtection ? "" : "WHERE handle <> $1"} ORDER BY position ASC, id ASC`,
    opts.includeProtection ? [] : [PROTECTION_PRODUCT_HANDLE]
  );
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const variants = await q(
    `SELECT v.*, COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[]) ORDER BY v.position ASC, v.id ASC`,
    [ids]
  );
  const blocks = await q(
    `SELECT id, product_id, kind, position, payload FROM product_block
      WHERE product_id = ANY($1::bigint[]) ORDER BY position ASC, id ASC`,
    [ids]
  );
  return products.map((p) => {
    const vs = variants.filter((v) => v.product_id === p.id);
    return {
      ...p,
      variants: vs,
      blocks: blocks.filter((b) => b.product_id === p.id),
      availability: productAvailability(p, vs)
    };
  });
}
function productAvailability(p, vs) {
  if (p.status === "discontinued") return { state: "discontinued", support_until: p.support_until };
  const lowest = vs.length ? Math.min(...vs.map((v) => v.available)) : 0;
  if (lowest <= 0) return { state: "sold_out" };
  if (lowest <= 10) return { state: "low", count: lowest };
  return { state: "available" };
}
async function getProduct(handle) {
  const products = await listProducts({ includeProtection: true });
  return products.find((p) => p.handle === handle) ?? null;
}
async function variantBySku(sku) {
  return one(
    `SELECT v.*, COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed,
            jsonb_build_object('id', p.id, 'handle', p.handle, 'title', p.title, 'subtitle', p.subtitle,
                               'kind', p.kind, 'status', p.status, 'support_until', p.support_until,
                               'position', p.position) AS product
       FROM variant v
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.sku = $1`,
    [sku]
  );
}
const PROTECTION_RUNGS = [
  { sku: "VELA-PROTECT-1", price_minor: 98, from: 1, to: 9999 },
  { sku: "VELA-PROTECT-2", price_minor: 298, from: 1e4, to: 49999 },
  { sku: "VELA-PROTECT-3", price_minor: 598, from: 5e4, to: 99999 },
  { sku: "VELA-PROTECT-4", price_minor: 1198, from: 1e5, to: Number.MAX_SAFE_INTEGER }
];
function protectionRungFor(subtotalMinor) {
  return PROTECTION_RUNGS.find((r) => subtotalMinor >= r.from && subtotalMinor <= r.to) ?? null;
}
const DELIVERY_ZONE = "us-domestic";
const DELIVERY_METHODS = [
  { code: "standard", name: "Standard", price_minor: 0, min_days: 5, max_days: 7, zone: DELIVERY_ZONE },
  { code: "express", name: "Express", price_minor: 2500, min_days: 2, max_days: 2, zone: DELIVERY_ZONE }
];
function deliveryMethod(name) {
  if (!name) return null;
  const folded = String(name).toLowerCase();
  return DELIVERY_METHODS.find((m) => m.name.toLowerCase() === folded || m.code === folded) ?? null;
}
const CART_COOKIE = "vela_cart";
async function ensureCart(cartToken, customerId) {
  if (cartToken) {
    const existing = await one(
      `SELECT token FROM cart WHERE token = $1 AND expires_at > now()`,
      [cartToken]
    );
    if (existing) {
      if (customerId) await q(`UPDATE cart SET customer_id = $1, updated_at = now() WHERE token = $2 AND customer_id IS DISTINCT FROM $1`, [customerId, cartToken]);
      return existing.token;
    }
  }
  const token = randomToken(18);
  await q(`INSERT INTO cart (token, customer_id) VALUES ($1, $2)`, [token, customerId]);
  return token;
}
async function getCartState(token, opts = {}) {
  const cart = await one(`SELECT * FROM cart WHERE token = $1`, [token]);
  if (!cart) return null;
  const lines = await q(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title, v.option_value, v.price_minor AS current_price_minor,
            p.title AS product_title, p.handle AS product_handle,
            COALESCE(i.available, 0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.id ASC`,
    [cart.id]
  );
  const notices = [];
  for (const line of lines) {
    if (Number(line.unit_price_minor) !== Number(line.current_price_minor)) {
      notices.push({
        kind: "price_change",
        item: line.product_title,
        line_title: line.title,
        sku: line.sku,
        old_price: dollars(Number(line.unit_price_minor)),
        new_price: dollars(Number(line.current_price_minor)),
        message: `The price of ${line.product_title} changed from ${dollars(Number(line.unit_price_minor))} to ${dollars(Number(line.current_price_minor))} since you added it.`
      });
    }
    if (Number(line.available) <= 0) {
      notices.push({
        kind: "availability",
        item: line.product_title,
        sku: line.sku,
        old_price: "",
        new_price: "",
        message: `${line.product_title} is no longer available.`
      });
    }
  }
  const subtotal = lines.reduce((sum, l) => sum + Number(l.unit_price_minor) * Number(l.quantity), 0);
  const rung = protectionRungFor(subtotal);
  const protectionPrice = cart.protection_enabled && rung ? rung.price_minor : 0;
  const method = deliveryMethod(cart.shipping_method);
  const shipping = method ? method.price_minor : 0;
  const tax = taxOf(subtotal);
  const total = subtotal + protectionPrice + shipping + tax;
  return {
    id: cart.id,
    token: cart.token,
    email: cart.email,
    lines: lines.map((l) => ({
      id: l.id,
      variant_id: l.variant_id,
      sku: l.sku,
      title: l.title,
      product_title: l.product_title,
      option_value: l.option_value,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      current_price_minor: Number(l.current_price_minor),
      line_total_minor: Number(l.unit_price_minor) * Number(l.quantity),
      available: Number(l.available),
      image: `/assets/${l.product_handle}.png`
    })),
    subtotal_minor: subtotal,
    protection: { enabled: !!cart.protection_enabled, rung: rung ? { sku: rung.sku, price_minor: rung.price_minor } : null },
    protection_rung: rung ? { sku: rung.sku, price_minor: rung.price_minor } : null,
    shipping_method: cart.shipping_method,
    shipping_address: cart.shipping_address ?? null,
    marketing_consent: !!cart.marketing_consent,
    shipping_minor: shipping,
    tax_minor: tax,
    total_minor: total,
    notices
  };
}
async function addLine(token, sku, quantity) {
  const variant = await variantBySku(sku);
  if (!variant) return { error: "unknown_sku" };
  const product = variant.product;
  if (product.status === "discontinued") return { error: "discontinued" };
  const result = await tx(async (client) => {
    const cart = (await client.query(`SELECT id FROM cart WHERE token = $1 FOR UPDATE`, [token])).rows[0];
    if (!cart) throw new Error("cart missing");
    const existing = (await client.query(
      `SELECT id, quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2 FOR UPDATE`,
      [cart.id, variant.id]
    )).rows[0];
    const nextQty = Math.min(10, (existing ? Number(existing.quantity) : 0) + quantity);
    if (existing) {
      await client.query(`UPDATE cart_line SET quantity = $1 WHERE id = $2`, [nextQty, existing.id]);
    } else {
      await client.query(
        `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1, $2, $3, $4)`,
        [cart.id, variant.id, nextQty, variant.price_minor]
      );
    }
    await client.query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
    return { quantity: nextQty };
  });
  return { ok: true, ...result };
}
async function setLineQuantity(token, lineId, quantity) {
  const cart = await one(`SELECT id FROM cart WHERE token = $1`, [token]);
  if (!cart) return { error: "no_cart" };
  if (quantity <= 0) {
    await q(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cart.id]);
    return { ok: true };
  }
  const updated = await one(
    `UPDATE cart_line SET quantity = $1 WHERE id = $2 AND cart_id = $3 RETURNING id`,
    [Math.min(10, Math.max(1, quantity)), lineId, cart.id]
  );
  if (!updated) return { error: "no_line" };
  await q(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return { ok: true };
}
async function removeLine(token, lineId) {
  const cart = await one(`SELECT id FROM cart WHERE token = $1`, [token]);
  if (!cart) return { error: "no_cart" };
  await q(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cart.id]);
  await q(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return { ok: true };
}
async function setProtection(token, enabled) {
  await q(`UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE token = $2`, [enabled, token]);
  return { ok: true };
}
async function setDelivery(token, input) {
  const method = deliveryMethod(input.shipping_method);
  if (input.shipping_method && !method) return { error: "unknown_method" };
  await q(
    `UPDATE cart SET email = COALESCE($1, email), shipping_address = COALESCE($2, shipping_address),
            shipping_method = COALESCE($3, shipping_method),
            marketing_consent = COALESCE($4, marketing_consent), updated_at = now()
      WHERE token = $5`,
    [
      input.email ?? null,
      input.shipping_address ? JSON.stringify(input.shipping_address) : null,
      method ? method.name : null,
      typeof input.marketingConsent === "boolean" ? input.marketingConsent : null,
      token
    ]
  );
  return { ok: true };
}
export {
  CART_COOKIE as C,
  DELIVERY_METHODS as D,
  PROTECTION_PRODUCT_HANDLE as P,
  deliveryMethod as a,
  getCartState as b,
  addLine as c,
  dollars as d,
  ensureCart as e,
  removeLine as f,
  getProduct as g,
  hashPassword as h,
  issueToken as i,
  setProtection as j,
  setDelivery as k,
  listProducts as l,
  sha256Hex as m,
  decimal as n,
  randomToken as o,
  protectionRungFor as p,
  readToken as r,
  setLineQuantity as s,
  taxOf as t,
  verifyPassword as v
};

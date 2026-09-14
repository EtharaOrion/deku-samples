import { one, q } from "./index_CC0DBeZe.mjs";
import { s as sha256, t as taxOf } from "./util_DjyUBxV_.mjs";
import { randomBytes } from "node:crypto";
const newRequestId = () => randomBytes(8).toString("hex");
class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
function pageSizeParams(url) {
  let sp;
  try {
    sp = new URL(url, "http://x").searchParams;
  } catch {
    sp = new URLSearchParams("");
  }
  const raw = sp.get("page_size") ?? sp.get("limit");
  if (raw === null || raw === "") return {
    page_size: 20,
    explicit: false
  };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError(400, "invalid_page_size", "page_size must be a whole number of at least 1.");
  }
  if (n > 100) {
    throw new ApiError(400, "page_size_too_large", `page_size is capped at 100. ${n} is above the cap.`);
  }
  return {
    page_size: n,
    explicit: true
  };
}
function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function decodeCursor(s) {
  if (!s) return null;
  try {
    return JSON.parse(Buffer.from(String(s), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
function listEnvelope(rows, {
  pageSize,
  cursorKey,
  extra = {}
}) {
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const next_cursor = hasMore && last ? encodeCursor({
    [cursorKey]: last[cursorKey]
  }) : null;
  return {
    data: page,
    next_cursor,
    has_more: hasMore,
    ...extra
  };
}
function bearerFrom(req) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/vela_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
async function customerFromRequest(req) {
  const token = bearerFrom(req);
  if (!token) return null;
  const row = await one(`SELECT c.id, c.email, c.name, c.status FROM auth_token t JOIN customer c ON c.id = t.customer_id
     WHERE t.token_hash = $1 AND t.expires_at > now()`, [sha256(token)]);
  return row || null;
}
async function requireCustomer(req) {
  const cust = await customerFromRequest(req);
  if (!cust) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return cust;
}
async function findCart(req) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/vela_cart=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]) : null;
  if (!token) return {
    cart: null,
    token: null
  };
  const cart = await one("SELECT * FROM cart WHERE token = $1 AND expires_at > now()", [token]);
  return {
    cart,
    token
  };
}
async function createCart() {
  return await one("INSERT INTO cart (token) VALUES ($1) RETURNING *", [randomBytes(18).toString("base64url")]);
}
async function cartFromContext(c) {
  const found = await findCart(c.req.raw);
  if (found.cart) return found;
  const fresh = await createCart();
  c.header("Set-Cookie", `vela_cart=${encodeURIComponent(fresh.token)}; Path=/; Max-Age=2592000; SameSite=Lax`, {
    append: true
  });
  return {
    cart: fresh,
    token: fresh.token
  };
}
async function cartLines(cartId) {
  return q(`SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            v.inventory_policy, p.id AS product_id, p.handle, p.title AS product_title, p.kind AS product_kind, p.status AS product_status,
            il.available, il.committed
     FROM cart_line cl
     JOIN variant v ON v.id = cl.variant_id
     JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = cl.variant_id
     WHERE cl.cart_id = $1
     ORDER BY cl.id`, [cartId]);
}
async function cartState(cartId) {
  const cart = await one("SELECT * FROM cart WHERE id = $1", [cartId]);
  const lines = await cartLines(cartId);
  const prot = await one("SELECT enabled FROM cart_protection WHERE cart_id = $1", [cartId]);
  const protectionEnabled = !!prot?.enabled;
  const notices = [];
  let subtotal = 0;
  for (const l of lines) {
    subtotal += l.quantity * l.current_price_minor;
    if (l.unit_price_minor !== l.current_price_minor) {
      notices.push({
        kind: "price_change",
        code: "price_changed",
        sku: l.sku,
        item: l.product_title,
        old_minor: l.unit_price_minor,
        new_minor: l.current_price_minor,
        message: `The price of ${l.product_title} changed from ${money(l.unit_price_minor)} to ${money(l.current_price_minor)} since you added it.`
      });
    }
  }
  const rung = protectionRung(subtotal);
  const protection = protectionEnabled && rung ? rung.price_minor : 0;
  const shipping = cart.shipping_minor || 0;
  await one(`SELECT dm.* FROM delivery_method dm WHERE lower(dm.title) = lower($1)`, [cart.shipping_method || ""]);
  const address = cart.shipping_address || null;
  const taxable = subtotal;
  const tax = address ? taxOf(taxable) : null;
  const total = subtotal + protection + shipping + (tax || 0);
  return {
    cart,
    lines,
    notices,
    subtotal_minor: subtotal,
    protection: {
      enabled: protectionEnabled,
      rung: rung ? {
        sku: rung.sku,
        price_minor: rung.price_minor,
        covers_minor: rung.covers_minor
      } : null
    },
    shipping_minor: shipping,
    shipping_method: cart.shipping_method || null,
    shipping_address: address,
    email: cart.email,
    tax_minor: tax,
    total_minor: total
  };
}
function money(minor) {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
function protectionRung(subtotalMinor) {
  if (subtotalMinor < 1) return null;
  if (subtotalMinor <= 9999) return {
    sku: "VELA-PROTECT-1",
    price_minor: 98,
    covers_minor: 9999
  };
  if (subtotalMinor <= 49999) return {
    sku: "VELA-PROTECT-2",
    price_minor: 298,
    covers_minor: 49999
  };
  if (subtotalMinor <= 99999) return {
    sku: "VELA-PROTECT-3",
    price_minor: 598,
    covers_minor: 99999
  };
  return {
    sku: "VELA-PROTECT-4",
    price_minor: 1198,
    covers_minor: null
  };
}
async function variantBySku(sku) {
  return one(`SELECT v.*, p.handle, p.title AS product_title, p.kind AS product_kind, p.status AS product_status, p.support_until,
            il.available, il.committed
     FROM variant v JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE upper(v.sku) = upper($1)`, [sku]);
}
async function assertVariantPurchasable(v) {
  if (!v) throw new ApiError(404, "unknown_variant", "We do not sell that item.");
  if (v.product_status === "discontinued") {
    throw new ApiError(409, "product_discontinued", `${v.product_title} is no longer sold.`);
  }
  if (v.inventory_policy === "deny" && (v.available ?? 0) <= 0) {
    throw new ApiError(409, "sold_out", `${v.product_title} is sold out.`);
  }
}
export {
  ApiError as A,
  pageSizeParams as a,
  cartFromContext as b,
  cartState as c,
  decodeCursor as d,
  assertVariantPurchasable as e,
  customerFromRequest as f,
  listEnvelope as l,
  newRequestId as n,
  protectionRung as p,
  requireCustomer as r,
  variantBySku as v
};

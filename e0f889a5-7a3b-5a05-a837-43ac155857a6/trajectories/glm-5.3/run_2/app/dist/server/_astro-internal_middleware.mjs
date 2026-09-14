import { e as defineMiddleware, s as sequence } from "./chunks/render-context_PdTwtXI7.mjs";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { d as customerByEmail, e as createCustomer, i as issueToken, g as authenticate, l as lastSeenReleaseBuild, b as bearerFrom, c as customerForToken, f as findOrCreateCart, a as cartView, h as addLine, C as CartError, s as setLineQuantity, r as removeLine, j as setProtection, k as setDelivery } from "./chunks/cart_CB9dsG5b.mjs";
import { h as hashPassword, s as sha256Hex } from "./chunks/crypto_BsBBFoSY.mjs";
import { q, pool, setMissingSchemaHandler } from "./chunks/pool_DifDkjYx.mjs";
import { l as listProducts, v as variantsForProducts, b as availabilityOf, p as productByHandle, a as productView } from "./chunks/catalog_BnA2aLlY.mjs";
import { p as placeOrder, O as OrderError, c as confirmOrder, o as orderView, k as killbillConfigured, b as kbFetch } from "./chunks/orders_CMRlzCpx.mjs";
import { b as devicesForCustomer, a as deviceView, r as registerDevice, D as DeviceError, d as deviceOwnedBy, c as renameDevice, e as releaseDevice, f as deviceBySerial, S as SEED_DEVICES, g as SEED_FIRMWARE, h as digestFor } from "./chunks/devices_BeE0c41C.mjs";
import { l as latestRelease, a as listReleases, r as releaseView, b as releaseByVersion } from "./chunks/releases_CuqIRam6.mjs";
import { f as firmwareForProduct, s as startFlashSession, F as FlashError, c as completeFlashSession, a as failFlashSession } from "./chunks/flash_ChrB-_fE.mjs";
import "es-module-lexer";
import "./chunks/astro-designed-error-pages_TSXCrXfu.mjs";
import "@astrojs/internal-helpers/path";
import "cookie";
function makeApiApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("requestId", c.req.header("x-request-id") || randomUUID());
    await next();
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "That page does not exist.", request_id: c.get("requestId") } }, 404));
  app.onError((err, c) => {
    const anyErr = err;
    const status = typeof anyErr.status === "number" ? anyErr.status : 500;
    const code = anyErr.code || "internal_error";
    const message = status >= 500 ? "Something went wrong at our end." : anyErr.message || "That did not work.";
    if (status >= 500) console.error(JSON.stringify({ level: "error", msg: "api_error", error: err.message, stack: err.stack, request_id: c.get("requestId"), time: (/* @__PURE__ */ new Date()).toISOString() }));
    return c.json({ error: { code, message, request_id: c.get("requestId") } }, status);
  });
  return app;
}
function requestId(c) {
  return c.get("requestId");
}
function clientError(c, status, code, message, extra = {}) {
  return c.json({ error: { code, message, request_id: requestId(c), ...extra } }, status);
}
function listResponse(c, data, nextCursor, hasMore) {
  return c.json({ data, next_cursor: nextCursor, has_more: hasMore });
}
function parsePagination(c) {
  const url = new URL(c.req.url);
  const params = url.searchParams;
  const rawPageSize = params.get("page_size") ?? params.get("limit") ?? void 0;
  if (rawPageSize !== void 0 && rawPageSize !== null && rawPageSize !== "") {
    const parsed = Number(rawPageSize);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new PaginationError(`page_size must be a positive whole number.`);
    }
    if (parsed > 100) {
      throw new PaginationError(`page_size is capped at 100.`);
    }
    return { pageSize: parsed, cursor: params.get("cursor") };
  }
  return { pageSize: 20, cursor: params.get("cursor") };
}
class PaginationError extends Error {
}
async function requireCustomer$1(c) {
  const token = bearerFrom(c.req.header("authorization"));
  const customer = await customerForToken(token);
  return customer;
}
function customerView(customer) {
  return { id: String(customer.id), email: customer.email, name: customer.name, status: customer.status, created_at: new Date(customer.created_at).toISOString() };
}
function registerAuthRoutes(app) {
  app.post("/api/auth/signup", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return clientError(c, 400, "invalid_email", "That email address does not look right.");
    if (password.length < 8) return clientError(c, 400, "weak_password", "A password needs at least eight characters.");
    if (!name) return clientError(c, 400, "missing_name", "Name is required.");
    const existing = await customerByEmail(email);
    if (existing) return clientError(c, 409, "email_taken", "That email address is already registered.");
    const passwordHash = await hashPassword(password);
    const customer = await createCustomer({ email, name, passwordHash });
    const token = await issueToken(customer.id);
    return c.json({ access_token: token.token, customer: customerView(customer) }, 201);
  });
  app.post("/api/auth/login", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const customer = await authenticate(email, password);
    if (!customer) return clientError(c, 401, "invalid_credentials", "That did not work. Check the email and the password.");
    const token = await issueToken(customer.id);
    return c.json({ access_token: token.token, customer: customerView(customer) });
  });
  app.get("/api/auth/me", async (c) => {
    const customer = await requireCustomer$1(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    return c.json({ customer: customerView(customer), last_seen_release_build: await lastSeenReleaseBuild(customer.id) });
  });
  app.post("/api/auth/logout", async (c) => {
    const token = bearerFrom(c.req.header("authorization"));
    if (token) {
      await q(`DELETE FROM auth_token WHERE token_hash = $1`, [sha256Hex(token)]);
    }
    return c.json({ ok: true });
  });
}
function registerCatalogRoutes(app) {
  app.get("/api/products", async (c) => {
    let page;
    try {
      page = parsePagination(c);
    } catch (err) {
      return clientError(c, 400, "page_size_invalid", err.message);
    }
    const { rows, hasMore, nextCursor } = await listProducts(page.pageSize, page.cursor);
    const variants = await variantsForProducts(rows.map((r) => r.id));
    const data = [];
    for (const row of rows) {
      const list = variants.get(String(row.id)) || [];
      const totalAvailable = list.reduce((sum, v) => sum + Number(v.available ?? 0), 0);
      data.push({
        handle: row.handle,
        title: row.title,
        subtitle: row.subtitle,
        kind: row.kind,
        status: row.status,
        support_until: row.support_until ? new Date(row.support_until).toISOString().slice(0, 10) : null,
        position: Number(row.position),
        variants: list.map((v) => ({
          sku: v.sku,
          title: v.title,
          option_value: v.option_value,
          price_minor: Number(v.price_minor),
          available: Number(v.available ?? 0),
          inventory_policy: v.inventory_policy
        })),
        availability: availabilityOf(row, totalAvailable)
      });
    }
    return listResponse(c, data, nextCursor, hasMore);
  });
  app.get("/api/products/:handle", async (c) => {
    const handle = c.req.param("handle");
    const variantParam = c.req.query("variant");
    const row = await productByHandle(handle);
    if (!row) return clientError(c, 404, "not_found", "That page does not exist.");
    const view = await productView(row, true);
    let selected = view.variants[0]?.sku ?? null;
    if (variantParam) {
      const match = view.variants.find((v) => v.sku === variantParam);
      if (match) selected = match.sku;
    }
    return c.json({ product: view, selected_variant: selected });
  });
}
function cartCookie(c) {
  const header = c.req.header("cookie") || "";
  const match = header.match(/(?:^|;\s*)vela_cart=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
async function currentCart(c, create) {
  const token = cartCookie(c);
  const bearer = bearerFrom(c.req.header("authorization"));
  const customer = bearer ? await customerForToken(bearer) : null;
  if (!token && !create) return null;
  return findOrCreateCart({ token, customerId: customer ? String(customer.id) : null });
}
function cartErrorToResponse(c, err) {
  const status = err.code === "unknown_line" || err.code === "unknown_variant" ? 404 : 400;
  return clientError(c, status, err.code, err.message);
}
function registerCartRoutes(app) {
  app.get("/api/cart", async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) {
      const fresh = await findOrCreateCart({ token: null });
      return withCookie(c, c.json(await cartView(fresh)), fresh.token);
    }
    return c.json(await cartView(cart));
  });
  app.post("/api/cart/lines", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const sku = String(body.sku || "");
    const quantity = Number(body.quantity ?? 1);
    if (!sku) return clientError(c, 400, "missing_sku", "We need to know which item.");
    const cart = await currentCart(c, true);
    try {
      await addLine(cart.id, sku, Number.isFinite(quantity) ? quantity : 1);
    } catch (err) {
      if (err instanceof CartError) return cartErrorToResponse(c, err);
      throw err;
    }
    return withCookie(c, c.json(await cartView(cart)), cart.token);
  });
  app.patch("/api/cart/lines/:lineId", async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, "unknown_cart", "That cart is no longer here.");
    const body = await c.req.json().catch(() => ({}));
    const quantity = Number(body.quantity);
    try {
      await setLineQuantity(cart.id, c.req.param("lineId"), quantity);
    } catch (err) {
      if (err instanceof CartError) return cartErrorToResponse(c, err);
      throw err;
    }
    return c.json(await cartView(cart));
  });
  app.delete("/api/cart/lines/:lineId", async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, "unknown_cart", "That cart is no longer here.");
    try {
      await removeLine(cart.id, c.req.param("lineId"));
    } catch (err) {
      if (err instanceof CartError) return cartErrorToResponse(c, err);
      throw err;
    }
    return c.json(await cartView(cart));
  });
  app.post("/api/cart/protection", async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, "unknown_cart", "That cart is no longer here.");
    const body = await c.req.json().catch(() => ({}));
    await setProtection(cart.id, Boolean(body.enabled));
    return c.json(await cartView(await findOrCreateCart({ token: cart.token })));
  });
  app.post("/api/cart/delivery", async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, "unknown_cart", "That cart is no longer here.");
    const body = await c.req.json().catch(() => ({}));
    if (body.shipping_method && !["Standard", "Express"].includes(body.shipping_method)) {
      return clientError(c, 400, "unknown_shipping_method", "Choose how it gets there.");
    }
    await setDelivery(cart.id, {
      email: body.email !== void 0 ? body.email ? String(body.email).trim().toLowerCase() : null : void 0,
      shipping_address: body.shipping_address !== void 0 ? body.shipping_address : void 0,
      shipping_method: body.shipping_method !== void 0 ? body.shipping_method : void 0
    });
    return c.json(await cartView(await findOrCreateCart({ token: cart.token })));
  });
}
function withCookie(c, response, token) {
  response.headers.append("set-cookie", `vela_cart=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return response;
}
function orderErrorToResponse(c, err) {
  return clientError(c, err.status, err.code, err.message, err.extra ?? {});
}
function registerOrderRoutes(app) {
  app.post("/api/orders", async (c) => {
    const headerToken = bearerFrom(c.req.header("authorization"));
    const cookieToken = readCookie$1(c.req.header("cookie"), "vela_token");
    const customer = await customerForToken(headerToken || cookieToken);
    const cartToken = cartCookie(c);
    if (!cartToken) return clientError(c, 400, "unknown_cart", "Your cart is empty.", { resource: "cart" });
    const idempotencyKey = c.req.header("idempotency-key") || null;
    let placed;
    try {
      placed = await placeOrder({ cartToken, idempotencyKey, customerId: customer ? String(customer.id) : null });
    } catch (err) {
      if (err instanceof OrderError) return orderErrorToResponse(c, err);
      throw err;
    }
    if (placed.replayed) {
      return c.json({ order: placed.order });
    }
    try {
      const confirmed = await confirmOrder(placed.order.id);
      return c.json({ order: confirmed, access_token: placed.accessToken }, 201);
    } catch (err) {
      if (err instanceof OrderError) {
        return c.json({ order: await orderView(placed.order), access_token: placed.accessToken, warning: err.message }, 201);
      }
      throw err;
    }
  });
  app.get("/api/orders/:number", async (c) => {
    const number = c.req.param("number");
    const accessToken = c.req.query("access_token");
    const headerToken = bearerFrom(c.req.header("authorization"));
    const cookieToken = readCookie$1(c.req.header("cookie"), "vela_token");
    const customer = await customerForToken(headerToken || cookieToken);
    const row = await q(`SELECT * FROM order_row WHERE number = $1`, [number]);
    if (row.rows.length === 0) return clientError(c, 404, "not_found", "That page does not exist.");
    const order = row.rows[0];
    const tokenHash = order.access_token_hash;
    const matches = accessToken && sha256Hex(accessToken) === tokenHash;
    const owns = customer && order.customer_id && String(order.customer_id) === String(customer.id);
    if (!matches && !owns) return clientError(c, 404, "not_found", "That page does not exist.");
    return c.json({ order: await orderView(order) });
  });
}
function readCookie$1(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
async function requireCustomer(c) {
  const headerToken = bearerFrom(c.req.header("authorization"));
  const cookieToken = readCookie(c.req.header("cookie"), "vela_token");
  return customerForToken(headerToken || cookieToken);
}
function readCookie(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function registerAccountRoutes(app) {
  app.get("/api/account/overview", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    const devices = await devicesForCustomer(customer.id, 100, null);
    const orders = await q(
      `SELECT * FROM order_row WHERE customer_id = $1 ORDER BY placed_at DESC NULLS LAST, id DESC LIMIT 2`,
      [customer.id]
    );
    const latest = await latestRelease();
    const lastSeen = await lastSeenReleaseBuild(customer.id);
    return c.json({
      customer: { id: String(customer.id), email: customer.email, name: customer.name },
      devices: await Promise.all(devices.rows.map((d) => deviceView(d))),
      orders: await Promise.all(orders.rows.map((o) => orderView(o))),
      app: {
        latest_version: latest ? latest.version : null,
        latest_build: latest ? Number(latest.build) : null,
        last_seen_build: lastSeen,
        newer_than_last_seen: latest ? lastSeen === null || Number(latest.build) > lastSeen : false
      }
    });
  });
  app.get("/api/account/orders", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    let pageSize = 20;
    const raw = c.req.query("page_size") ?? c.req.query("limit");
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) return clientError(c, 400, "page_size_invalid", "page_size must be a positive whole number.");
      if (parsed > 100) return clientError(c, 400, "page_size_invalid", "page_size is capped at 100.");
      pageSize = parsed;
    }
    const cursor = c.req.query("cursor") || null;
    const params = [customer.id];
    let where = `customer_id = $1`;
    if (cursor) {
      params.push(Number(cursor));
      where += ` AND (placed_at, id) < (SELECT placed_at, id FROM order_row WHERE id = $${params.length})`;
    }
    params.push(pageSize + 1);
    const res = await q(
      `SELECT * FROM order_row WHERE ${where} ORDER BY placed_at DESC NULLS LAST, id DESC LIMIT $${params.length}`,
      params
    );
    const hasMore = res.rows.length > pageSize;
    const rows = hasMore ? res.rows.slice(0, pageSize) : res.rows;
    return listResponse(c, await Promise.all(rows.map((o) => orderView(o))), hasMore && rows.length > 0 ? String(rows[rows.length - 1].id) : null, hasMore);
  });
  app.get("/api/account/orders/:number", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    const res = await q(`SELECT * FROM order_row WHERE number = $1`, [c.req.param("number")]);
    if (res.rows.length === 0) return clientError(c, 404, "not_found", "That page does not exist.");
    const order = res.rows[0];
    if (!order.customer_id || String(order.customer_id) !== String(customer.id)) {
      return clientError(c, 404, "not_found", "That page does not exist.");
    }
    return c.json({ order: await orderView(order) });
  });
  app.get("/api/account/devices", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    let pageSize = 20;
    const raw = c.req.query("page_size") ?? c.req.query("limit");
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) return clientError(c, 400, "page_size_invalid", "page_size must be a1 positive whole number.");
      if (parsed > 100) return clientError(c, 400, "page_size_invalid", "page_size is capped at 100.");
      pageSize = parsed;
    }
    const { rows, hasMore, nextCursor } = await devicesForCustomer(customer.id, pageSize, c.req.query("cursor") || null);
    return listResponse(c, await Promise.all(rows.map((d) => deviceView(d))), nextCursor, hasMore);
  });
  app.post("/api/account/devices", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    const body = await c.req.json().catch(() => ({}));
    const serial = String(body.serial || "").trim();
    if (!serial) return clientError(c, 400, "missing_serial", "Serial is required.");
    try {
      const device = await registerDevice(customer.id, serial, "manual", null);
      return c.json({ device }, 201);
    } catch (err) {
      if (err instanceof DeviceError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
  app.get("/api/account/devices/:serial", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    const device = await deviceOwnedBy(customer.id, c.req.param("serial"));
    if (!device) return clientError(c, 404, "not_found", "That page does not exist.");
    return c.json({ device: await deviceView(device) });
  });
  app.patch("/api/account/devices/:serial", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    const body = await c.req.json().catch(() => ({}));
    const nickname = String(body.nickname ?? "").trim();
    try {
      const device = await renameDevice(customer.id, c.req.param("serial"), nickname);
      return c.json({ device });
    } catch (err) {
      if (err instanceof DeviceError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
  app.delete("/api/account/devices/:serial", async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, "unauthorized", "You need to sign in first.");
    try {
      const device = await releaseDevice(customer.id, c.req.param("serial"));
      return c.json({ device });
    } catch (err) {
      if (err instanceof DeviceError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
}
function registerReleaseRoutes(app) {
  app.get("/api/releases", async (c) => {
    let page;
    try {
      page = parsePagination(c);
    } catch (err) {
      return clientError(c, 400, "page_size_invalid", err.message);
    }
    const { rows, hasMore, nextCursor } = await listReleases(page.pageSize, page.cursor);
    return listResponse(c, rows.map(releaseView), nextCursor, hasMore);
  });
  app.get("/api/releases/:version", async (c) => {
    const row = await releaseByVersion(c.req.param("version"));
    if (!row) return clientError(c, 404, "not_found", "That page does not exist.");
    return c.json({ release: releaseView(row) });
  });
}
function registerFirmwareRoutes(app) {
  app.get("/api/firmware/manifest", async (c) => {
    const model = c.req.query("model");
    const channel = c.req.query("channel");
    if (!model) return clientError(c, 400, "missing_model", "We need to know which camera.");
    const product = await productByHandle(model);
    if (!product || product.kind !== "camera") return clientError(c, 404, "not_found", "That page does not exist.");
    const rows = await firmwareForProduct(product.id);
    const entries = rows.filter((f) => channel ? f.channel === channel : f.channel === "general" || f.channel === "beta").filter((f) => f.channel !== "yanked").map((f) => ({
      version: f.version,
      build: Number(f.build),
      channel: f.channel,
      min_firmware: f.min_firmware ?? null,
      min_app_version: f.min_app_version,
      size_bytes: Number(f.size_bytes),
      sha256: f.sha256
    }));
    return c.json({ product: product.title, product_handle: product.handle, generated_at: (/* @__PURE__ */ new Date()).toISOString(), entries });
  });
  app.get("/api/devices/:serial/summary", async (c) => {
    const serial = (c.req.param("serial") || "").trim().toUpperCase();
    const device = await deviceBySerial(serial);
    if (!device) return clientError(c, 404, "unknown_serial", "We do not recognise that serial number.");
    return c.json({
      serial: device.serial,
      model: device.model,
      product_handle: device.product_handle,
      firmware_version: device.firmware_version ?? null,
      blocked: device.status === "blocked"
    });
  });
  app.get("/api/firmware", async (c) => {
    const model = c.req.query("model");
    const product = model ? await productByHandle(model) : null;
    const rows = product ? await firmwareForProduct(product.id) : [];
    return c.json({ data: rows, next_cursor: null, has_more: false });
  });
  app.post("/api/flash-sessions", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const serial = String(body.serial || "").trim();
    const targetBuild = Number(body.target_build);
    if (!serial) return clientError(c, 400, "missing_serial", "Serial is required.");
    if (!Number.isFinite(targetBuild)) return clientError(c, 400, "missing_target_build", "We need to know which firmware.");
    try {
      const session = await startFlashSession({ serial, targetBuild });
      return c.json({ session }, 201);
    } catch (err) {
      if (err instanceof FlashError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
  app.post("/api/flash-sessions/:id/complete", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const reported = String(body.reported_version || "").trim();
    if (!reported) return clientError(c, 400, "missing_reported_version", "We need the version the camera reported.");
    try {
      const session = await completeFlashSession(c.req.param("id"), reported);
      return c.json({ session });
    } catch (err) {
      if (err instanceof FlashError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
  app.post("/api/flash-sessions/:id/fail", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || "unknown").trim();
    try {
      const session = await failFlashSession(c.req.param("id"), reason);
      return c.json({ session });
    } catch (err) {
      if (err instanceof FlashError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
}
function registerHealthRoute(app) {
  app.get("/api/health", async (c) => {
    try {
      await pool.query("SELECT 1");
      return c.json({ status: "ok", database: "ok", billing: killbillConfigured() ? "configured" : "absent", time: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (err) {
      return c.json({ status: "error", database: "error" }, 503);
    }
  });
  app.get("/api/health/billing", async (c) => {
    if (!killbillConfigured()) return c.json({ status: "absent" }, 200);
    try {
      const res = await kbFetch("/1.0/healthcheck");
      return c.json({ status: res.status === 200 ? "ok" : "error", http_status: res.status }, res.status === 200 ? 200 : 503);
    } catch {
      return c.json({ status: "error" }, 503);
    }
  });
}
async function handleApiRequest(request, requestId2) {
  const app = getApiApp();
  return app.fetch(request, { requestId: requestId2 });
}
let cachedApp = null;
function getApiApp() {
  if (!cachedApp) {
    const app = makeApiApp();
    registerAuthRoutes(app);
    registerCatalogRoutes(app);
    registerCartRoutes(app);
    registerOrderRoutes(app);
    registerAccountRoutes(app);
    registerReleaseRoutes(app);
    registerFirmwareRoutes(app);
    registerHealthRoute(app);
    cachedApp = app;
  }
  return cachedApp;
}
const SEED_PRODUCTS = [
  {
    handle: "flagship",
    title: "Vela A1",
    subtitle: "Our full-frame workshop camera.",
    kind: "camera",
    status: "active",
    support_until: "2032-06-01",
    position: 1,
    variants: [
      { sku: "VELA-A1-GRAPHITE", title: "Vela A1 · Graphite", option_value: "Graphite", price_minor: 89900, available: 4 },
      { sku: "VELA-A1-SAND", title: "Vela A1 · Sand", option_value: "Sand", price_minor: 89900, available: 6 },
      { sku: "VELA-A1-YELLOW", title: "Vela A1 · Yellow", option_value: "Yellow", price_minor: 89900, available: 1 }
    ],
    blocks: [
      { kind: "lede", position: 1, payload: { text: "The camera we set out to build. A full-frame sensor, a fixed prime lens and a body that can be repaired rather than replaced." } },
      { kind: "spec_group", position: 2, payload: { title: "Body", rows: [["Sensor", "Full-frame 36 x 24 mm CMOS"], ["Lens", "35 mm f/2, fixed"], ["Body", "Magnesium, 740 g"]] } },
      { kind: "spec_group", position: 3, payload: { title: "Capture", rows: [["Stills", "Raw and JPEG"], ["Video", "4K at 30 fps"], ["Storage", "CFexpress Type B"]] } },
      { kind: "in_the_box", position: 4, payload: { items: ["Vela A1 body", "Lens cap", "Strap", "USB-C cable", "Warranty card"] } },
      { kind: "compatibility", position: 5, payload: { os: "macOS 13.0 or later", app: "Arranger 2.0.0" } },
      { kind: "support_note", position: 6, payload: { text: "We will support this camera until June 1, 2032." } }
    ]
  },
  {
    handle: "compact",
    title: "Vela Cricket",
    subtitle: "The one we set out to carry.",
    kind: "camera",
    status: "active",
    position: 2,
    variants: [
      { sku: "VELA-CRICKET-GRAPHITE", title: "Vela Cricket · Graphite", option_value: "Graphite", price_minor: 29900, available: 12 },
      { sku: "VELA-CRICKET-YELLOW", title: "Vela Cricket · Yellow", option_value: "Yellow", price_minor: 29900, available: 0 }
    ],
    blocks: [
      { kind: "lede", position: 1, payload: { text: "A camera small enough to be there when the picture happens. The same sensor family as the A1, the same firmware, a body you can hold in one hand." } },
      { kind: "spec_group", position: 2, payload: { title: "Body", rows: [["Sensor", "APS-C 23.6 x 15.7 mm CMOS"], ["Lens", "28 mm f/2.8, fixed"], ["Body", "Aluminium, 340 g"]] } },
      { kind: "spec_group", position: 3, payload: { title: "Capture", rows: [["Stills", "Raw and JPEG"], ["Video", "4K at 24 fps"], ["Storage", "SD UHS-II"]] } },
      { kind: "in_the_box", position: 4, payload: { items: ["Vela Cricket body", "Wrist strap", "USB-C cable", "Warranty card"] } },
      { kind: "compatibility", position: 5, payload: { os: "macOS 13.0 or later", app: "Arranger 1.4.0" } }
    ]
  },
  {
    handle: "mount",
    title: "Monitor Mount",
    subtitle: "A clamp and a VESA plate.",
    kind: "accessory",
    status: "discontinued",
    support_until: "2029-09-01",
    position: 3,
    variants: [
      { sku: "VELA-MOUNT-CLAMP", title: "Monitor Mount · Clamp", option_value: "Clamp", price_minor: 4900, available: 0 },
      { sku: "VELA-MOUNT-VESA", title: "Monitor Mount · VESA", option_value: "VESA", price_minor: 4900, available: 0 }
    ],
    blocks: [
      { kind: "lede", position: 1, payload: { text: "A mount for the workshop bench. We no longer sell it; we still support it." } },
      { kind: "spec_group", position: 2, payload: { title: "Fit", rows: [["Clamp", "Tables 18 to 45 mm"], ["VESA", "75 x 75 and 100 x 100"]] } },
      { kind: "in_the_box", position: 3, payload: { items: ["Mount", "Hardware kit", "Hex key"] } },
      { kind: "compatibility", position: 4, payload: { os: "Not applicable", app: "Not applicable" } },
      { kind: "support_note", position: 5, payload: { text: "We no longer sell this. We will support it until September 1, 2029." } }
    ]
  },
  {
    handle: "case",
    title: "Travel Case",
    subtitle: "Fitted, padded, unremarkable.",
    kind: "accessory",
    status: "active",
    position: 4,
    variants: [
      { sku: "VELA-CASE-STD", title: "Travel Case · Standard", option_value: "Standard", price_minor: 7900, available: 15 }
    ],
    blocks: [
      { kind: "lede", position: 1, payload: { text: "A fitted case for either camera, with room for a cable and a card. It closes with a zip and it does not try to be anything else." } },
      { kind: "spec_group", position: 2, payload: { title: "Fit", rows: [["Inside", "290 x 150 x 70 mm"], ["Fits", "Vela A1 or Vela Cricket"], ["Material", "Recycled nylon, closed-cell foam"]] } },
      { kind: "in_the_box", position: 3, payload: { items: ["Travel case"] } },
      { kind: "compatibility", position: 4, payload: { os: "Not applicable", app: "Not applicable" } }
    ]
  },
  {
    handle: "cable",
    title: "Replacement Cable",
    subtitle: "USB-C, one metre or two.",
    kind: "spare",
    status: "active",
    position: 5,
    variants: [
      { sku: "VELA-CABLE-1M", title: "Replacement Cable · 1 m", option_value: "1 m", price_minor: 1900, available: 30 },
      { sku: "VELA-CABLE-2M", title: "Replacement Cable · 2 m", option_value: "2 m", price_minor: 2400, available: 30 }
    ],
    blocks: [
      { kind: "lede", position: 1, payload: { text: "The cable that ships with the cameras, sold on its own because cables get left behind." } },
      { kind: "spec_group", position: 2, payload: { title: "Detail", rows: [["Length", "1 m or 2 m"], ["Connectors", "USB-C to USB-C"], ["Power", "100 W"]] } },
      { kind: "compatibility", position: 3, payload: { os: "Not applicable", app: "Not applicable" } }
    ]
  },
  {
    handle: "protection",
    title: "Shipment protection",
    subtitle: "Covers loss, theft and damage in transit.",
    kind: "protection",
    status: "active",
    position: 99,
    variants: [
      { sku: "VELA-PROTECT-1", title: "Shipment protection · Tier 1", option_value: "Standard", price_minor: 98, available: 9999 },
      { sku: "VELA-PROTECT-2", title: "Shipment protection · Tier 2", option_value: "Standard", price_minor: 298, available: 9999 },
      { sku: "VELA-PROTECT-3", title: "Shipment protection · Tier 3", option_value: "Standard", price_minor: 598, available: 9999 },
      { sku: "VELA-PROTECT-4", title: "Shipment protection · Tier 4", option_value: "Standard", price_minor: 1198, available: 9999 }
    ],
    blocks: []
  }
];
const SEED_RELEASES = [
  {
    version: "2.0.0",
    build: 2e3,
    released_on: "2024-12-11",
    artifact_name: "arranger-2.0.0.dmg",
    size_bytes: 154876459,
    sha256: "9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2",
    description: "Arranger 2.0 brings the whole camera under one window.",
    notes: {
      "Newly Added": [
        "A single window that holds import, library and export side by side.",
        "Firmware writing over USB for every Vela camera, replacing the separate installer.",
        "Per-camera colour profiles that follow the serial rather than the library."
      ],
      "Improvements": [
        "Import from a card is about twice as fast on Apple silicon.",
        "The library grid holds its scroll position when a card is ejected."
      ],
      "Bug Fixes": [
        "Fixed a crash when a library was opened from a read-only volume. [#412]",
        "Fixed a wrong white balance read from Vela Cricket firmware 6.11. [#415]"
      ],
      "Known Issues": [
        "Exports to ProRes ignore custom LUTs on macOS 14.0 only."
      ]
    }
  },
  {
    version: "1.4.4",
    build: 1440,
    released_on: "2024-06-26",
    artifact_name: "arranger-1.4.4.dmg",
    size_bytes: 160301059,
    sha256: "0a1f0a96c8bd8e0470ac8208306431f0c6ad7d9db21c94764e4bd8db8de8820e",
    description: "A small release that fixes two things people were waiting on.",
    notes: {
      "Newly Added": [
        "Added a command to rebuild thumbnails for a whole library."
      ],
      "Improvements": [
        "The update checker reports the build number rather than the version string."
      ],
      "Bug Fixes": [
        "Fixed firmware writing for Vela A1 units running 2.0. [#398]",
        "Fixed a hang when two cameras were connected at once. [#401]"
      ],
      "Known Issues": []
    }
  },
  {
    version: "1.4.3",
    build: 1430,
    released_on: "2024-05-20",
    artifact_name: "arranger-1.4.3.dmg",
    size_bytes: 158220144,
    sha256: "7d43c4a973ee2746c37a4cf3f6f21b9b9f2e94e37f8e18dd71a6457fa1c8b02d",
    description: "Firmware updates for both cameras and a better card import.",
    notes: {
      "Newly Added": [
        "Added firmware update prompts that name the version and the build.",
        "Added a preference to keep the library on an external volume."
      ],
      "Improvements": [
        "Card import now skips files that were already imported, by content.",
        "The export sheet remembers its last-used preset."
      ],
      "Bug Fixes": [
        "Fixed a crash on launch when the default library was missing. [#377]"
      ],
      "Known Issues": [
        "Vela Cricket firmware 6.11 reports one frame short on each roll. The count is correct on the card."
      ]
    }
  },
  {
    version: "1.4.2",
    build: 1420,
    released_on: "2024-05-20",
    artifact_name: "arranger-1.4.2.dmg",
    size_bytes: 157903622,
    sha256: "3f5e0f37a1cfcb0d9c30a7ce7eb48f5c7d1a41d64f3cd8e12b7d0c8f9a2c1d60",
    description: "The release that shipped alongside Vela Cricket.",
    notes: {
      "Newly Added": [
        "Added support for Vela Cricket.",
        "Added the release notes archive, opened from the Help menu."
      ],
      "Improvements": [
        "Both cameras appear in one list, ordered by serial."
      ],
      "Bug Fixes": [
        "Fixed a wrong serial shown in the about panel. [#350]",
        "Fixed a memory leak when the library window was left open overnight. [#354]"
      ],
      "Known Issues": [
        "Vela Cricket units built in week 09 need firmware 6.11 or later to import Raw."
      ]
    }
  }
];
function versionOrd(version) {
  return version.split(".").reduce((acc, part) => acc * 1e3 + Number(part), 0);
}
const SEED_PASSWORD = "deku-demo-pw-2026";
async function migrateAndSeed() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  const { rows } = await pool.query("SELECT value FROM app_meta WHERE key = $1", ["seed_version"]);
  if (rows.length > 0) {
    const seeded = String(rows[0].value);
    if (seeded === "2") return;
  }
  const { SCHEMA_SQL } = await import("./chunks/schema_sql_dSFnCHrG.mjs");
  await pool.query(SCHEMA_SQL);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const passwordHash = await hashPassword(SEED_PASSWORD);
    for (const customer of [
      { email: "customer@example.com", name: "Iris Vantaa" },
      { email: "customer2@example.com", name: "Rune Halden" }
    ]) {
      await c.query(
        `INSERT INTO customer (email, name, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT DO NOTHING`,
        [customer.email, customer.name, passwordHash]
      );
    }
    const customerIds = {};
    {
      const res = await c.query("SELECT id, lower(email) AS email FROM customer");
      for (const row of res.rows) customerIds[row.email] = String(row.id);
    }
    const productIdByHandle = {};
    const variantIdBySku = {};
    for (const p of SEED_PRODUCTS) {
      const existing = await c.query("SELECT id FROM product WHERE handle = $1", [p.handle]);
      let productId;
      if (existing.rows.length === 0) {
        const inserted = await c.query(
          `INSERT INTO product (handle, title, subtitle, kind, status, support_until, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until ?? null, p.position]
        );
        productId = String(inserted.rows[0].id);
      } else {
        productId = String(existing.rows[0].id);
        await c.query(
          `UPDATE product SET title = $2, subtitle = $3, kind = $4, status = $5, support_until = $6, position = $7 WHERE id = $1`,
          [productId, p.title, p.subtitle, p.kind, p.status, p.support_until ?? null, p.position]
        );
        await c.query("DELETE FROM product_block WHERE product_id = $1", [productId]);
      }
      productIdByHandle[p.handle] = productId;
      for (const [index, v] of p.variants.entries()) {
        const existingVariant = await c.query("SELECT id FROM variant WHERE sku = $1", [v.sku]);
        let variantId;
        if (existingVariant.rows.length === 0) {
          const inserted = await c.query(
            `INSERT INTO variant (product_id, sku, title, option_value, price_minor, currency, position, inventory_policy)
             VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7) RETURNING id`,
            [productId, v.sku, v.title, v.option_value, v.price_minor, index + 1, v.policy ?? "deny"]
          );
          variantId = String(inserted.rows[0].id);
          await c.query(
            `INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1, $2, 0) ON CONFLICT (variant_id) DO NOTHING`,
            [variantId, v.available]
          );
        } else {
          variantId = String(existingVariant.rows[0].id);
          await c.query(
            "UPDATE variant SET title = $2, option_value = $3, price_minor = $4, position = $5 WHERE id = $1",
            [variantId, v.title, v.option_value, v.price_minor, index + 1]
          );
        }
        variantIdBySku[v.sku] = variantId;
      }
      for (const b of p.blocks) {
        await c.query(
          `INSERT INTO product_block (product_id, kind, position, payload) VALUES ($1, $2, $3, $4)`,
          [productId, b.kind, b.position, JSON.stringify(b.payload)]
        );
      }
    }
    await c.query(
      `INSERT INTO order_number_seq (year, next_number) VALUES (2026, 2)
       ON CONFLICT (year) DO UPDATE SET next_number = GREATEST(order_number_seq.next_number, 2)`
    );
    const existingOrder = await c.query(`SELECT id FROM order_row WHERE number = 'VE-2026-0001'`);
    let orderId = null;
    if (existingOrder.rows.length === 0) {
      const inserted = await c.query(
        `INSERT INTO order_row
           (number, customer_id, email, subtotal_minor, shipping_minor, tax_minor, discount_minor, total_minor,
            currency, status, payment_status, fulfilment_status, shipping_method, shipping_address,
            access_token_hash, placed_at, created_at)
         VALUES ('VE-2026-0001', $1, $2, 29900, 0, 2990, 0, 32890, 'USD', 'confirmed', 'invoiced', 'fulfilled',
                 'Standard', $3, $4, now() - interval '21 days', now() - interval '21 days')
         RETURNING id`,
        [
          customerIds["customer@example.com"],
          "customer@example.com",
          JSON.stringify({ name: "Iris Vantaa", line1: "4 Alder Row", line2: "", city: "Portland", region: "OR", postal_code: "97209", country: "US", phone: "" }),
          "seed-order-0001-access"
        ]
      );
      orderId = String(inserted.rows[0].id);
      await c.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, quantity, unit_price_minor, total_minor)
         VALUES ($1, $2, 'Vela Cricket', 'VELA-CRICKET-GRAPHITE', 1, 29900, 29900)`,
        [orderId, variantIdBySku["VELA-CRICKET-GRAPHITE"]]
      );
    } else {
      orderId = String(existingOrder.rows[0].id);
    }
    for (const d of SEED_DEVICES) {
      const productId = productIdByHandle[d.handle];
      const variantId = variantIdBySku[d.variant_sku];
      const existing = await c.query("SELECT id FROM device WHERE upper(serial) = upper($1)", [d.serial]);
      let deviceId;
      if (existing.rows.length === 0) {
        const inserted = await c.query(
          `INSERT INTO device (serial, product_id, variant_id, status, blocked_reason, firmware_version, firmware_reported_at, nickname, order_id, warranty_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            d.serial,
            productId,
            variantId,
            d.status,
            d.blocked_reason ?? null,
            d.firmware_version,
            d.firmware_reported_at,
            d.nickname,
            d.order_number === "VE-2026-0001" ? orderId : null,
            d.warranty_until
          ]
        );
        deviceId = String(inserted.rows[0].id);
      } else {
        deviceId = String(existing.rows[0].id);
      }
      if (d.owner_email) {
        const live = await c.query(
          `SELECT id FROM device_ownership WHERE device_id = $1 AND released_at IS NULL`,
          [deviceId]
        );
        if (live.rows.length === 0) {
          await c.query(
            `INSERT INTO device_ownership (device_id, customer_id, order_id, claimed_at, released_at, method)
             VALUES ($1, $2, $3, now() - interval '21 days', NULL, $4)`,
            [deviceId, customerIds[d.owner_email], d.order_number === "VE-2026-0001" ? orderId : null, d.method]
          );
        }
      }
    }
    for (const r of SEED_RELEASES) {
      await c.query(
        `INSERT INTO app_release (version, version_ord, build, released_on, channel, artifact_name, size_bytes, sha256, description, notes)
         VALUES ($1, $2, $3, $4, 'general', $5, $6, $7, $8, $9)
         ON CONFLICT (version) DO UPDATE SET
           version_ord = EXCLUDED.version_ord, build = EXCLUDED.build, released_on = EXCLUDED.released_on,
           artifact_name = EXCLUDED.artifact_name, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256,
           description = EXCLUDED.description, notes = EXCLUDED.notes`,
        [r.version, versionOrd(r.version), r.build, r.released_on, r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)]
      );
    }
    for (const f of SEED_FIRMWARE) {
      await c.query(
        `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (product_id, build) DO UPDATE SET
           version = EXCLUDED.version, min_firmware = EXCLUDED.min_firmware, min_app_version = EXCLUDED.min_app_version,
           channel = EXCLUDED.channel, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, released_on = EXCLUDED.released_on`,
        [
          productIdByHandle[f.handle],
          f.version,
          f.build,
          f.min_firmware,
          f.min_app_version,
          f.channel,
          f.size_bytes,
          digestFor("firmware", `${f.handle}:${f.build}`),
          f.released_on
        ]
      );
    }
    await c.query(`INSERT INTO app_meta (key, value) VALUES ('seed_version', '2')
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await c.query("COMMIT");
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
}
async function waitForDatabase(retries = 30, delayMs = 1e3) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("database unreachable");
}
let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await waitForDatabase(60, 1e3);
      await migrateAndSeed();
    })();
    readyPromise.catch(() => {
      readyPromise = null;
    });
  }
  return readyPromise;
}
setMissingSchemaHandler(() => {
  readyPromise = null;
});
const onRequest$1 = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const requestId2 = randomUUID();
  const start = Date.now();
  context.locals.requestId = requestId2;
  context.locals.cartToken = context.cookies.get("vela_cart")?.value ?? null;
  context.locals.bearer = request.headers.get("authorization");
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    if (url.pathname !== "/api/health") {
      try {
        await ensureReady();
      } catch (err) {
        console.error(JSON.stringify({ level: "error", msg: "startup_failed", error: String(err), time: (/* @__PURE__ */ new Date()).toISOString() }));
        const response3 = new Response(JSON.stringify({ error: { code: "not_ready", message: "Something went wrong at our end.", request_id: requestId2 } }), { status: 503, headers: { "content-type": "application/json" } });
        logRequest(request.method, url.pathname, response3.status, Date.now() - start, requestId2);
        return response3;
      }
    } else {
      ensureReady().catch(() => {
      });
    }
    let response2 = await handleApiRequest(request, requestId2);
    if (response2.status >= 500) {
      const clone = response2.clone();
      const body = await clone.json().catch(() => null);
      const code = body?.error?.code;
      if (code === "42P01" || code === "3F000") {
        try {
          readyPromise = null;
          await ensureReady();
          response2 = await handleApiRequest(request, requestId2);
        } catch {
        }
      }
    }
    logRequest(request.method, url.pathname, response2.status, Date.now() - start, requestId2);
    return response2;
  }
  try {
    await ensureReady();
  } catch {
  }
  const response = await next();
  logRequest(request.method, url.pathname, response.status, Date.now() - start, requestId2);
  return response;
});
function logRequest(method, path, status, elapsedMs, requestId2) {
  process.stdout.write(JSON.stringify({
    level: status >= 500 ? "error" : "info",
    msg: "request",
    method,
    route: path,
    status,
    elapsed_ms: elapsedMs,
    request_id: requestId2,
    time: (/* @__PURE__ */ new Date()).toISOString()
  }) + "\n");
}
const onRequest = sequence(
  onRequest$1
);
export {
  onRequest
};

import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { env } from "./env";
import { logError, logRequest, newRequestId } from "./log";
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from "./errors";
import { one, PG, pgCode, query, transaction, type Row, type Tx } from "./db";
import { ready } from "./seed";
import {
  bearerOf,
  cookieValue,
  sessionCookie,
  customerFromToken,
  hashPassword,
  issueToken,
  opaqueToken,
  requireCustomer,
  scopedToken,
  tokenMatches,
  verifyPassword,
  type Customer,
} from "./auth";
import {
  CART_COOKIE,
  createCart,
  findCartByToken,
  forgetNoticesForVariant,
  requireLine,
  viewCart,
  type CartRow,
} from "./carts";
import { DELIVERY_METHODS, deliveryMethod, formatMinor } from "./money";
import { buildPage, decodeCursor, readPageSize } from "./pagination";
import {
  accessTokenFor,
  accessTokenHash,
  orderChip,
  orderLines,
  orderSerials,
  placeOrder,
  requireIdempotencyKey,
} from "./orders";
import { isWellFormedSerial, normaliseSerial } from "./serial";
import { scopeOf, type AccountScope } from "./account";
import { compareVersions, isNewer } from "./versions";
import { healthy as billingHealthy } from "./killbill";
import { healthy as mailHealthy } from "./mailer";

type Vars = {
  requestId: string;
  customer: Customer | null;
  scope: AccountScope | null;
};

const app = new Hono<{ Variables: Vars }>().basePath("/api");

export const MESSAGES = {
  serialUnknown: "We do not recognise that serial number.",
  serialOwned: "That camera is registered to someone else.",
  serialShape: "That is not a Vela serial number.",
  serialBlocked: "That camera is blocked and cannot be registered.",
  notFound: "That page does not exist.",
  badCredentials: "That did not work.",
};

/* ------------------------------------------------------------------ plumbing */

app.use("*", async (c, next) => {
  const requestId = newRequestId();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  c.header("cache-control", "no-store");
  c.header("referrer-policy", "no-referrer");
  c.header("x-content-type-options", "nosniff");
  const started = Date.now();
  try {
    await next();
  } finally {
    logRequest({
      request_id: requestId,
      method: c.req.method,
      route: new URL(c.req.url).pathname,
      status: c.res?.status ?? 0,
      duration_ms: Date.now() - started,
    });
  }
});

app.use("*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !c.req.header("authorization")) {
    const origin = c.req.header("origin");
    const fetchSite = c.req.header("sec-fetch-site");
    // The host the request arrived on is the only value that survives a proxy
    // or a container port mapping; the reconstructed request URL may not.
    const host =
      c.req.header("x-forwarded-host") ?? c.req.header("host") ?? new URL(c.req.url).host;
    try {
      if (
        (origin && origin !== "null" && new URL(origin).host !== host) ||
        fetchSite === "cross-site"
      ) {
        throw forbidden("That request did not come from this site.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw forbidden("That request did not come from this site.");
    }
  }
  await next();
});

/** The same token identifies a customer whether it arrives as a bearer header
 *  from an API client or as the session cookie the pages set, because the
 *  browser and the API are one origin. */
function tokenOf(c: Context<{ Variables: Vars }>): string | null {
  return bearerOf(c.req.header("authorization")) ?? sessionCookie(c.req.header("cookie"));
}

app.use("*", async (c, next) => {
  const token = tokenOf(c);
  c.set("customer", token ? await customerFromToken(token) : null);
  await next();
});

app.onError((error, c) => {
  const requestId = c.get("requestId") ?? newRequestId();
  if (error instanceof AppError) {
    return c.json(
      { code: error.code, message: error.message, request_id: requestId, ...(error.detail ?? {}) },
      error.status as 400,
    );
  }
  logError("unhandled", {
    request_id: requestId,
    route: new URL(c.req.url).pathname,
    reason: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return c.json(
    {
      code: "internal_error",
      message: `Something went wrong at our end. Reference ${requestId}.`,
      request_id: requestId,
    },
    500,
  );
});

app.notFound((c) =>
  c.json(
    { code: "not_found", message: MESSAGES.notFound, request_id: c.get("requestId") ?? newRequestId() },
    404,
  ),
);

async function body(c: any): Promise<Record<string, any>> {
  try {
    const parsed = await c.req.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function requireField(source: Record<string, any>, name: string, label: string): string {
  const value = source[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw unprocessable("field_required", `${label} is required.`, { field: name });
  }
  return value.trim();
}

function cursorInteger(
  cursor: (string | number)[] | null,
  index: number,
  length: number,
): number | null {
  if (!cursor) return null;
  const value = cursor[index];
  if (
    cursor.length !== length ||
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw badRequest("cursor_invalid", "That page reference is not one we issued.");
  }
  return value;
}

/* -------------------------------------------------------------------- health */

app.get("/health", async (c) => {
  await ready();
  return c.json({ status: "ok", request_id: c.get("requestId") });
});

app.get("/health/deep", async (c) => {
  await ready();
  const rows = await query<{ n: number }>("SELECT count(*)::bigint AS n FROM product");
  const [billing, smtp] = await Promise.all([billingHealthy(), mailHealthy()]);
  const healthy = billing && smtp;
  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      products: Number(rows[0]?.n ?? 0),
      billing,
      smtp,
      ...(healthy
        ? {}
        : {
            code: "dependency_unavailable",
            message: "A required service is not ready.",
          }),
      request_id: c.get("requestId"),
    },
    healthy ? 200 : 503,
  );
});

app.use("*", async (_c, next) => {
  await ready();
  await next();
});

/* ---------------------------------------------------------------------- auth */

function publicCustomer(row: Customer) {
  return { id: String(row.id), email: row.email, name: row.name, status: row.status };
}

app.post("/auth/signup", async (c) => {
  const payload = await body(c);
  const email = requireField(payload, "email", "Email").toLowerCase();
  const password = requireField(payload, "password", "Password");
  const name = requireField(payload, "name", "Name");
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw unprocessable("email_invalid", "That did not work. Check the address and try again.");
  }
  if (password.length < 8) {
    throw unprocessable("password_too_short", "A password needs at least eight characters.");
  }
  const claimNumber = payload.order_number;
  const claimToken = payload.order_access_token;
  if (
    (claimNumber !== undefined || claimToken !== undefined) &&
    (typeof claimNumber !== "string" ||
      typeof claimToken !== "string" ||
      !claimNumber.trim() ||
      !claimToken.trim())
  ) {
    throw unprocessable(
      "order_claim_invalid",
      "Return to the order and try making the account again.",
    );
  }

  const passwordHash = await hashPassword(password);
  let created: Customer | null;
  try {
    created = await transaction(async (tx) => {
      const customer = await tx.one<Customer>(
        `INSERT INTO customer (email, name, password_hash, status) VALUES ($1,$2,$3,'active')
         RETURNING id, email, name, status, created_at`,
        [email, name, passwordHash],
      );
      if (!customer) return null;
      // A newly-created account may claim an earlier guest purchase only with
      // the capability carried by that order's confirmation page.
      if (typeof claimNumber === "string" && typeof claimToken === "string") {
        const claimed = await tx.query(
          `UPDATE "order" SET customer_id = $1
            WHERE customer_id IS NULL
              AND number = $2
              AND lower(email) = lower($3)
              AND status = 'confirmed'
              AND access_token_hash = $4
              AND placed_at > now() - interval '180 days'
            RETURNING id`,
          [customer.id, claimNumber.trim(), email, accessTokenHash(claimToken.trim())],
        );
        if (claimed.length === 0) {
          throw notFound("We cannot find that order.");
        }
      }
      return customer;
    });
  } catch (error) {
    if (pgCode(error) === PG.uniqueViolation) {
      throw conflict("email_taken", "That address already has an account. Sign in instead.");
    }
    throw error;
  }
  if (!created) throw new Error("the store refused the account");

  const { token, expiresIn } = issueToken(Number(created.id), created.email);
  const cartToken = await cartOnSignIn(c, Number(created.id));
  return c.json(
    {
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresIn,
      customer: publicCustomer(created),
      ...(cartToken ? { cart_token: cartToken } : {}),
    },
    201,
  );
});

app.post("/auth/login", async (c) => {
  const payload = await body(c);
  const email = requireField(payload, "email", "Email").toLowerCase();
  const password = requireField(payload, "password", "Password");

  const row = await one<Customer & { password_hash: string }>(
    "SELECT * FROM customer WHERE lower(email) = lower($1)",
    [email],
  );
  const ok = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !ok || row.status !== "active") {
    throw new AppError(401, "bad_credentials", MESSAGES.badCredentials);
  }

  await query(
    `UPDATE "order" SET customer_id = $1
      WHERE customer_id IS NULL
        AND lower(email) = lower($2)
        AND status = 'confirmed'
        AND placed_at >= $3`,
    [row.id, row.email, row.created_at],
  );
  const { token, expiresIn } = issueToken(Number(row.id), row.email);
  const cartToken = await cartOnSignIn(c, Number(row.id));
  return c.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    customer: publicCustomer(row),
    ...(cartToken ? { cart_token: cartToken } : {}),
  });
});

app.get("/auth/me", async (c) => {
  const customer = c.get("customer");
  if (!customer) throw new AppError(401, "unauthenticated", "Sign in to continue.");
  return c.json({ customer: publicCustomer(customer) });
});

/* ----------------------------------------------------------------- catalogue */

type VariantRow = Row & { sku: string; price_minor: number; available: number };

function variantView(row: VariantRow) {
  return {
    id: String(row.id),
    sku: row.sku,
    title: row.title,
    option_value: row.option_value,
    price_minor: Number(row.price_minor),
    price: formatMinor(Number(row.price_minor)),
    currency: "usd",
    position: Number(row.position),
    available: Number(row.available ?? 0),
    availability: availabilityState(row),
  };
}

function availabilityState(row: { available?: number; product_status?: string }): string {
  if (row.product_status === "discontinued") return "discontinued";
  const available = Number(row.available ?? 0);
  if (available <= 0) return "sold_out";
  if (available <= 10) return "low";
  return "available";
}

async function variantsOf(productIds: number[]): Promise<Map<number, VariantRow[]>> {
  if (productIds.length === 0) return new Map();
  const rows = await query<VariantRow & { product_id: number; product_status: string }>(
    `SELECT v.*, COALESCE(i.available, 0) AS available, p.status AS product_status
       FROM variant v
       LEFT JOIN inventory_level i ON i.variant_id = v.id
       JOIN product p ON p.id = v.product_id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position, v.id`,
    [productIds],
  );
  const grouped = new Map<number, VariantRow[]>();
  for (const row of rows) {
    const list = grouped.get(Number(row.product_id)) ?? [];
    list.push(row);
    grouped.set(Number(row.product_id), list);
  }
  return grouped;
}

function productAvailability(variants: VariantRow[], status: string): string {
  if (status === "discontinued") return "discontinued";
  const total = variants.reduce((sum, v) => sum + Number(v.available ?? 0), 0);
  if (total <= 0) return "sold_out";
  if (total <= 10) return "low";
  return "available";
}

app.get("/products", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const pageSize = readPageSize(params);
  const cursor = decodeCursor(params.get("cursor"));
  const afterPosition = cursorInteger(cursor, 0, 2);
  const afterId = cursorInteger(cursor, 1, 2);

  const rows = await query<Row>(
    `SELECT * FROM product
      WHERE kind <> 'protection'
        AND ($1::int IS NULL OR (position, id) > ($1::int, $2::bigint))
      ORDER BY position, id
      LIMIT $3`,
    [afterPosition, afterId, pageSize + 1],
  );

  const variants = await variantsOf(rows.map((row) => Number(row.id)));
  const page = buildPage(rows, pageSize, (row) => [Number(row.position), Number(row.id)]);

  return c.json({
    data: page.data.map((row) => {
      const own = variants.get(Number(row.id)) ?? [];
      const prices = own.map((v) => Number(v.price_minor));
      return {
        id: String(row.id),
        handle: row.handle,
        title: row.title,
        subtitle: row.subtitle,
        kind: row.kind,
        status: row.status,
        support_until: row.support_until ? String(row.support_until).slice(0, 10) : null,
        position: Number(row.position),
        from_price_minor: prices.length ? Math.min(...prices) : 0,
        price_varies: new Set(prices).size > 1,
        availability: productAvailability(own, String(row.status)),
        variants: own.map(variantView),
      };
    }),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    page_size: pageSize,
  });
});

app.get("/products/:handle", async (c) => {
  const handle = c.req.param("handle");
  const row = await one<Row>("SELECT * FROM product WHERE handle = $1 AND kind <> 'protection'", [handle]);
  if (!row) throw notFound("We do not sell that.");

  const variants = (await variantsOf([Number(row.id)])).get(Number(row.id)) ?? [];
  const blocks = await query<Row>(
    "SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id",
    [row.id],
  );

  const asked = c.req.query("variant");
  const chosen = variants.find((v) => v.sku === asked) ?? variants[0] ?? null;

  return c.json({
    id: String(row.id),
    handle: row.handle,
    title: row.title,
    subtitle: row.subtitle,
    kind: row.kind,
    status: row.status,
    support_until: row.support_until ? String(row.support_until).slice(0, 10) : null,
    availability: productAvailability(variants, String(row.status)),
    selected_variant: chosen ? chosen.sku : null,
    variant_recognised: asked ? variants.some((v) => v.sku === asked) : true,
    variants: variants.map(variantView),
    blocks: blocks.map((block) => ({ kind: block.kind, position: Number(block.position), payload: block.payload })),
  });
});

/* ---------------------------------------------------------------------- cart */

const CART_QUOTE_COOKIE = "vela_cart_quote";

function rememberCartQuote(c: any, quote: string): void {
  setCookie(c, CART_QUOTE_COOKIE, quote, {
    path: "/api",
    httpOnly: true,
    sameSite: "Strict",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
  });
}

async function cartFor(c: any, options: { create?: boolean } = {}): Promise<CartRow | null> {
  const token = cookieValue(c.req.header("cookie"), CART_COOKIE);
  const held = await findCartByToken(token);
  if (held) return held;
  if (!options.create) return null;
  const customer = c.get("customer") as Customer | null;
  const fresh = await createCart(customer ? Number(customer.id) : null);
  setCookie(c, CART_COOKIE, fresh.token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
  });
  return fresh;
}

async function anyCartFor(c: any): Promise<CartRow | null> {
  const token = cookieValue(c.req.header("cookie"), CART_COOKIE);
  if (!token) return null;
  return one<CartRow>("SELECT * FROM cart WHERE token = $1 AND expires_at > now()", [token]);
}

function setCartCookie(c: any, token: string): void {
  setCookie(c, CART_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Signing in picks the cart up where it was left. A cart with lines on this
 *  browser is kept and becomes the customer's own; a browser holding nothing
 *  takes the customer's saved open cart, so a line added on another day, at
 *  the price of that day, is still there to be read. The token the browser
 *  should hold from now on is answered so the page can set it. */
async function cartOnSignIn(c: any, customerId: number): Promise<string | null> {
  const heldToken = cookieValue(c.req.header("cookie"), CART_COOKIE);
  const token = await transaction(async (tx) => {
    const held = heldToken
      ? await tx.one<CartRow>(
          "SELECT * FROM cart WHERE token = $1 AND status = 'open' AND expires_at > now() FOR UPDATE",
          [heldToken],
        )
      : null;
    const someoneElses = Boolean(held && held.customer_id !== null && Number(held.customer_id) !== customerId);
    const saved = await tx.one<CartRow>(
      `SELECT * FROM cart
        WHERE customer_id = $1 AND status = 'open' AND expires_at > now()
          AND ($2::bigint IS NULL OR id <> $2::bigint)
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        FOR UPDATE`,
      [customerId, held && !someoneElses ? held.id : null],
    );

    if (!saved) {
      if (held && !someoneElses) {
        await tx.query(
          "UPDATE cart SET customer_id = $1, updated_at = now() WHERE id = $2 AND customer_id IS NULL",
          [customerId, held.id],
        );
        return null;
      }
      if (!someoneElses) return null;
      const fresh = await tx.one<CartRow>(
        "INSERT INTO cart (token, customer_id) VALUES ($1, $2) RETURNING *",
        [opaqueToken(24), customerId],
      );
      return fresh ? fresh.token : null;
    }

    if (held && !someoneElses) {
      await tx.query(
        `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
         SELECT $1, variant_id, quantity, unit_price_minor FROM cart_line WHERE cart_id = $2
         ON CONFLICT (cart_id, variant_id) DO UPDATE
           SET quantity = least(10, cart_line.quantity + EXCLUDED.quantity)`,
        [saved.id, held.id],
      );
      await tx.query(
        `UPDATE cart SET
           email = COALESCE(email, $2),
           shipping_address = COALESCE(shipping_address, $3::jsonb),
           shipping_method = COALESCE(shipping_method, $4),
           updated_at = now()
         WHERE id = $1`,
        [
          saved.id,
          held.email ?? null,
          held.shipping_address ? JSON.stringify(held.shipping_address) : null,
          held.shipping_method ?? null,
        ],
      );
      await tx.query("DELETE FROM cart WHERE id = $1", [held.id]);
    }
    return saved.token;
  });
  if (token) setCartCookie(c, token);
  return token;
}

async function lockOpenCart(tx: Tx, id: number): Promise<CartRow> {
  const cart = await tx.one<CartRow>("SELECT * FROM cart WHERE id = $1 FOR UPDATE", [id]);
  if (!cart) throw notFound("That cart is gone.");
  if (cart.status !== "open") {
    throw conflict("cart_already_ordered", "This cart has already been ordered.");
  }
  return cart;
}

async function emptyCartView(c: any) {
  return {
    token: null,
    status: "open",
    email: null,
    marketing_consent: false,
    shipping_address: null,
    shipping_method: null,
    lines: [],
    item_count: 0,
    subtotal_minor: 0,
    protection_enabled: false,
    protection_rung: null,
    protection_minor: 0,
    shipping_minor: 0,
    tax_minor: 0,
    total_minor: 0,
    currency: "usd",
    priced: false,
    notices: [],
    request_id: c.get("requestId"),
  };
}

app.get("/cart", async (c) => {
  const cart = await cartFor(c);
  if (!cart) return c.json(await emptyCartView(c));
  const result = await viewCart(cart);
  rememberCartQuote(c, result.quote);
  return c.json({ ...result, request_id: c.get("requestId") });
});

/** The order the browser's cart became. A checkout page walked back to after
 *  the order was placed shows that same review, and placing it again returns
 *  that same order rather than a second one. */
app.get("/cart/order", async (c) => {
  const cart = await anyCartFor(c);
  if (!cart || cart.status !== "ordered") throw notFound("This cart has not been ordered.");
  const order = await one<Row>('SELECT * FROM "order" WHERE cart_id = $1 ORDER BY id LIMIT 1', [
    cart.id,
  ]);
  if (!order) throw notFound("This cart has not been ordered.");
  const lines = await orderLines(Number(order.id));
  const serials = await orderSerials(Number(order.id));
  return c.json({
    cart_token: cart.token,
    ...orderView(order, lines, serials, accessTokenFor(order.id)),
    request_id: c.get("requestId"),
  });
});

app.post("/cart/lines", async (c) => {
  const payload = await body(c);
  const sku = requireField(payload, "sku", "A product");
  const quantity = payload.quantity === undefined ? 1 : payload.quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 10
  ) {
    throw unprocessable("quantity_invalid", "A line holds between one and ten of an item.");
  }

  const cart = (await cartFor(c, { create: true }))!;
  try {
    const result = await transaction(async (tx) => {
      const locked = await lockOpenCart(tx, cart.id);
      const variant = await tx.one<Row>(
        `SELECT v.*, p.kind, p.status AS product_status, COALESCE(i.available,0) AS available
           FROM variant v JOIN product p ON p.id = v.product_id
           LEFT JOIN inventory_level i ON i.variant_id = v.id
          WHERE v.sku = $1`,
        [sku],
      );
      if (!variant || variant.kind === "protection") throw notFound("We do not sell that.");
      if (variant.product_status === "discontinued") {
        throw unprocessable("product_discontinued", "We no longer sell that.");
      }

      const existing = await tx.one<{ quantity: number }>(
        "SELECT quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2",
        [locked.id, variant.id],
      );
      const requested = Number(existing?.quantity ?? 0) + quantity;
      if (requested > 10) {
        throw unprocessable("quantity_invalid", "A line holds between one and ten of an item.");
      }
      if (variant.inventory_policy === "deny" && Number(variant.available) < requested) {
        throw conflict(
          "stock_unavailable",
          "That quantity is no longer available.",
          { sku, resource: sku, requested },
        );
      }

      await tx.query(
        `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (cart_id, variant_id) DO UPDATE
           SET quantity = cart_line.quantity + EXCLUDED.quantity
         RETURNING id`,
        [locked.id, variant.id, quantity, variant.price_minor],
      );
      const fresh = await tx.one<CartRow>(
        "UPDATE cart SET updated_at = now() WHERE id = $1 RETURNING *",
        [locked.id],
      );
      if (!fresh) throw new Error("the store refused the cart change");
      return viewCart(fresh, tx);
    });
    rememberCartQuote(c, result.quote);
    return c.json({ ...result, request_id: c.get("requestId") }, 201);
  } catch (error) {
    if (pgCode(error) === PG.checkViolation) {
      throw unprocessable("quantity_invalid", "A line holds between one and ten of an item.");
    }
    throw error;
  }
});

app.patch("/cart/lines/:line_id", async (c) => {
  const cart = await cartFor(c);
  if (!cart) throw notFound("Your cart is empty.");
  const payload = await body(c);
  const quantity = payload.quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    quantity > 10
  ) {
    throw unprocessable("quantity_invalid", "A line holds between one and ten of an item.");
  }
  const result = await transaction(async (tx) => {
    const locked = await lockOpenCart(tx, cart.id);
    const line = await requireLine(locked.id, c.req.param("line_id"), tx);
    if (quantity === 0) {
      await tx.query("DELETE FROM cart_line WHERE id = $1", [line.id]);
    } else {
      const state = await tx.one<Row>(
        `SELECT COALESCE(i.available, 0) AS available, p.status AS product_status,
                p.title, v.sku, v.inventory_policy
           FROM variant v
           JOIN product p ON p.id = v.product_id
           LEFT JOIN inventory_level i ON i.variant_id = v.id
          WHERE v.id = $1`,
        [line.variant_id],
      );
      if (!state || state.product_status === "discontinued") {
        throw unprocessable("product_discontinued", "We no longer sell that.");
      }
      if (state.inventory_policy === "deny" && quantity > Number(state.available)) {
        throw conflict(
          "stock_unavailable",
          `${state.title} is no longer available in the quantity you asked for.`,
          { sku: state.sku, resource: state.sku, requested: quantity },
        );
      }
      await tx.query("UPDATE cart_line SET quantity = $1 WHERE id = $2", [quantity, line.id]);
    }
    await forgetNoticesForVariant(locked.id, Number(line.variant_id), tx);
    const fresh = await tx.one<CartRow>(
      "UPDATE cart SET updated_at = now() WHERE id = $1 RETURNING *",
      [locked.id],
    );
    if (!fresh) throw new Error("the store refused the cart change");
    return viewCart(fresh, tx);
  });
  rememberCartQuote(c, result.quote);
  return c.json({ ...result, request_id: c.get("requestId") });
});

app.delete("/cart/lines/:line_id", async (c) => {
  const cart = await cartFor(c);
  if (!cart) throw notFound("Your cart is empty.");
  const result = await transaction(async (tx) => {
    const locked = await lockOpenCart(tx, cart.id);
    const line = await requireLine(locked.id, c.req.param("line_id"), tx);
    await tx.query("DELETE FROM cart_line WHERE id = $1", [line.id]);
    await forgetNoticesForVariant(locked.id, Number(line.variant_id), tx);
    const fresh = await tx.one<CartRow>("SELECT * FROM cart WHERE id = $1", [locked.id]);
    if (!fresh) throw new Error("the store refused the cart change");
    return viewCart(fresh, tx);
  });
  rememberCartQuote(c, result.quote);
  return c.json({ ...result, request_id: c.get("requestId") });
});

app.post("/cart/protection", async (c) => {
  const payload = await body(c);
  if (typeof payload.enabled !== "boolean") {
    throw unprocessable(
      "protection_invalid",
      "Choose whether to protect this shipment.",
      { field: "enabled" },
    );
  }
  const enabled = payload.enabled;
  const cart = (await cartFor(c, { create: true }))!;
  const result = await transaction(async (tx) => {
    const locked = await lockOpenCart(tx, cart.id);
    const fresh = await tx.one<CartRow>(
      "UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [enabled, locked.id],
    );
    if (!fresh) throw new Error("the store refused the cart change");
    return viewCart(fresh, tx);
  });
  rememberCartQuote(c, result.quote);
  return c.json({ ...result, request_id: c.get("requestId") });
});

app.post("/cart/delivery", async (c) => {
  const payload = await body(c);

  const patch: Record<string, unknown> = {};
  if (payload.email !== undefined) {
    const email = requireField(payload, "email", "Email").toLowerCase();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      throw unprocessable("email_invalid", "That did not work. Check the address and try again.");
    }
    patch.email = email;
  }
  if (payload.marketing_consent !== undefined) {
    if (typeof payload.marketing_consent !== "boolean") {
      throw unprocessable(
        "marketing_consent_invalid",
        "Choose whether to receive occasional news.",
        { field: "marketing_consent" },
      );
    }
    patch.marketing_consent = payload.marketing_consent;
  }
  if (payload.shipping_address !== undefined) {
    const address = payload.shipping_address;
    if (!address || typeof address !== "object" || Array.isArray(address)) {
      throw unprocessable("address_invalid", "A delivery address is required.");
    }
    const normalized: Row = {};
    for (const field of ["name", "line1", "city", "region", "postal_code", "country"]) {
      const value = (address as Row)[field];
      if (typeof value !== "string" || !value.trim()) {
        throw unprocessable("field_required", `${field.replace("_", " ")} is required.`, { field });
      }
      normalized[field] = value.trim();
    }
    const line2 = (address as Row).line2;
    if (line2 !== undefined && typeof line2 !== "string") {
      throw unprocessable("address_invalid", "Address line 2 must be text.", { field: "line2" });
    }
    normalized.line2 = typeof line2 === "string" ? line2.trim() : "";
    const phone = (address as Row).phone;
    if (phone !== undefined && typeof phone !== "string") {
      throw unprocessable("address_invalid", "Phone must be text.", { field: "phone" });
    }
    normalized.phone = typeof phone === "string" ? phone.trim() : "";
    normalized.country = String(normalized.country).toUpperCase();
    if (normalized.country !== "US") {
      throw unprocessable("country_unsupported", "We deliver inside the United States only.");
    }
    patch.shipping_address = JSON.stringify(normalized);
  }
  if (payload.shipping_method !== undefined) {
    if (typeof payload.shipping_method !== "string") {
      throw unprocessable("shipping_method_invalid", "Choose Standard or Express.");
    }
    const method = deliveryMethod(payload.shipping_method);
    if (!method) throw unprocessable("shipping_method_invalid", "Choose Standard or Express.");
    patch.shipping_method = method.name;
  }

  const cart = (await cartFor(c, { create: true }))!;
  const keys = Object.keys(patch);
  const result = await transaction(async (tx) => {
    const locked = await lockOpenCart(tx, cart.id);
    let fresh = locked;
    if (keys.length > 0) {
      const assignments = keys.map(
        (key, index) =>
          `${key} = $${index + 2}${key === "shipping_address" ? "::jsonb" : ""}`,
      );
      fresh =
        (await tx.one<CartRow>(
          `UPDATE cart SET ${assignments.join(", ")}, updated_at = now()
            WHERE id = $1 RETURNING *`,
          [locked.id, ...keys.map((key) => patch[key])],
        )) ?? locked;
    }
    return viewCart(fresh, tx);
  });
  rememberCartQuote(c, result.quote);
  return c.json({ ...result, request_id: c.get("requestId") });
});

app.get("/delivery/methods", (c) => {
  const params = new URL(c.req.url).searchParams;
  const pageSize = readPageSize(params);
  const cursor = decodeCursor(params.get("cursor"));
  const afterPosition = cursorInteger(cursor, 0, 1) ?? -1;
  const methods = DELIVERY_METHODS.map((method, position) => ({
    position,
    name: method.name,
    price_minor: method.priceMinor,
    price: formatMinor(method.priceMinor),
    window: method.window,
  })).filter((method) => method.position > afterPosition);
  const page = buildPage(methods, pageSize, (method) => [method.position]);
  return c.json({
    data: page.data.map(({ position: _position, ...method }) => method),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    page_size: pageSize,
  });
});

/* -------------------------------------------------------------------- orders */

function orderView(order: Row, lines: Row[], serials: Row[], accessToken?: string) {
  return {
    id: String(order.id),
    number: order.number,
    email: order.email,
    status: order.status,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    chip: orderChip(order),
    subtotal_minor: Number(order.subtotal_minor),
    shipping_minor: Number(order.shipping_minor),
    tax_minor: Number(order.tax_minor),
    discount_minor: Number(order.discount_minor),
    total_minor: Number(order.total_minor),
    currency: order.currency,
    shipping_method: order.shipping_method,
    shipping_address: order.shipping_address,
    killbill_external_key: order.killbill_external_key,
    killbill_invoice_amount: order.killbill_invoice_amount,
    placed_at: order.placed_at,
    lines: lines.map((line) => ({
      id: String(line.id),
      title: line.title_snapshot,
      sku: line.sku_snapshot,
      option: line.option_snapshot,
      quantity: Number(line.quantity),
      unit_price_minor: Number(line.unit_price_minor),
      total_minor: Number(line.total_minor),
    })),
    serials: serials.map((device) => ({
      serial: device.serial,
      sku: device.sku,
      status: device.status,
      registered: Boolean(device.registered),
      firmware_version: device.firmware_version,
    })),
    ...(accessToken ? { access_token: accessToken } : {}),
  };
}

app.post("/orders", async (c) => {
  const cart = await anyCartFor(c);
  if (!cart) throw unprocessable("cart_empty", "Your cart is empty.");
  const customer = c.get("customer");
  const key = requireIdempotencyKey(c.req.header("Idempotency-Key") ?? null);

  const result = await placeOrder({
    cart,
    idempotencyKey: key,
    customerId: customer ? Number(customer.id) : (cart.customer_id ?? null),
    requestId: c.get("requestId")!,
    publicUrl: env.publicUrl,
    cartQuote:
      c.req.header("x-cart-quote") ??
      cookieValue(c.req.header("cookie"), CART_QUOTE_COOKIE),
  });

  const lines = await orderLines(Number(result.order.id));
  const serials = await orderSerials(Number(result.order.id));
  return c.json(
    { ...orderView(result.order, lines, serials, result.accessToken), replayed: result.replayed, request_id: c.get("requestId") },
    result.replayed ? 200 : 201,
  );
});

app.get("/orders/:number", async (c) => {
  const number = c.req.param("number");
  const order = await one<Row>('SELECT * FROM "order" WHERE number = $1', [number]);
  // Another customer's order reads as not found, never as forbidden.
  if (!order) throw notFound("We cannot find that order.");

  const customer = c.get("customer");
  const supplied = c.req.query("access_token") ?? c.req.header("x-order-access-token") ?? "";
  const tokenFresh =
    new Date(order.placed_at).getTime() + 180 * 24 * 60 * 60 * 1000 > Date.now();
  const byToken =
    tokenFresh &&
    Boolean(supplied) &&
    tokenMatches(order.access_token_hash, accessTokenHash(supplied));
  const byOwner = Boolean(customer) && Number(order.customer_id) === Number(customer!.id);
  if (!byToken && !byOwner) throw notFound("We cannot find that order.");

  const lines = await orderLines(Number(order.id));
  const serials = await orderSerials(Number(order.id));
  return c.json({ ...orderView(order, lines, serials), request_id: c.get("requestId") });
});

/* ------------------------------------------------------------------- account */

app.use("/account/*", async (c, next) => {
  c.set("scope", scopeOf(await requireCustomer(tokenOf(c))));
  await next();
});

app.get("/account/orders", async (c) => {
  const scope = c.get("scope")!;
  const params = new URL(c.req.url).searchParams;
  const pageSize = readPageSize(params);
  const cursor = decodeCursor(params.get("cursor"));
  const afterDate = cursor?.[0];
  const afterId = cursorInteger(cursor, 1, 2);
  if (
    cursor &&
    (typeof afterDate !== "string" || Number.isNaN(Date.parse(afterDate)))
  ) {
    throw badRequest("cursor_invalid", "That page reference is not one we issued.");
  }

  const rows = await scope.ordersPage(typeof afterDate === "string" ? afterDate : null, afterId, pageSize + 1);

  const page = buildPage(rows, pageSize, (row) => [new Date(row.placed_at).toISOString(), Number(row.id)]);
  const lineTitles = await query<Row>(
    `SELECT order_id, title_snapshot, position, count(*) OVER (PARTITION BY order_id) AS line_count
       FROM order_line WHERE order_id = ANY($1::bigint[]) ORDER BY order_id, position`,
    [page.data.map((row) => Number(row.id))],
  );
  const firstLine = new Map<number, { title: string; count: number }>();
  for (const line of lineTitles) {
    if (!firstLine.has(Number(line.order_id))) {
      firstLine.set(Number(line.order_id), {
        title: String(line.title_snapshot),
        count: Number(line.line_count),
      });
    }
  }

  return c.json({
    data: page.data.map((row) => {
      const summary = firstLine.get(Number(row.id));
      return {
        number: row.number,
        placed_at: row.placed_at,
        status: row.status,
        payment_status: row.payment_status,
        fulfilment_status: row.fulfilment_status,
        chip: orderChip(row),
        total_minor: Number(row.total_minor),
        currency: row.currency,
        summary: summary
          ? summary.count > 1
            ? `${summary.title} and ${summary.count - 1} more`
            : summary.title
          : "",
      };
    }),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    page_size: pageSize,
  });
});

app.get("/account/orders/:number", async (c) => {
  const order = await c.get("scope")!.order(c.req.param("number"));
  if (!order) throw notFound("We cannot find that order.");
  const lines = await orderLines(Number(order.id));
  const serials = await orderSerials(Number(order.id));
  return c.json({ ...orderView(order, lines, serials), request_id: c.get("requestId") });
});

/* ------------------------------------------------------------------- devices */

async function latestFirmwareFor(productId: number): Promise<Row | null> {
  return one<Row>(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general'
      ORDER BY build DESC LIMIT 1`,
    [productId],
  );
}

async function deviceView(row: Row) {
  const latest = await latestFirmwareFor(Number(row.product_id));
  const warrantyUntil = row.warranty_until ? String(row.warranty_until).slice(0, 10) : null;
  return {
    serial: row.serial,
    model: row.model ?? row.title,
    handle: row.handle,
    nickname: row.nickname,
    status: row.status,
    firmware_version: row.firmware_version,
    firmware_reported_at: row.firmware_reported_at,
    latest_firmware_version: latest ? latest.version : null,
    latest_firmware_build: latest ? Number(latest.build) : null,
    update_available: Boolean(row.firmware_version) && isNewer(latest?.version, row.firmware_version),
    firmware_state: !row.firmware_version
      ? "Not yet connected"
      : isNewer(latest?.version, row.firmware_version)
        ? "Update available"
        : "Up to date",
    warranty_until: warrantyUntil,
    warranty_state: warrantyUntil
      ? new Date(`${warrantyUntil}T23:59:59Z`).getTime() >= Date.now()
        ? `In warranty until ${warrantyUntil}`
        : `Warranty ended ${warrantyUntil}`
      : "No warranty on record",
    claimed_at: row.claimed_at ?? null,
  };
}

app.get("/account/devices", async (c) => {
  const scope = c.get("scope")!;
  const params = new URL(c.req.url).searchParams;
  const pageSize = readPageSize(params);
  const cursor = decodeCursor(params.get("cursor"));
  const afterDate = cursor?.[0];
  const afterId = cursorInteger(cursor, 1, 2);
  if (
    cursor &&
    (typeof afterDate !== "string" || Number.isNaN(Date.parse(afterDate)))
  ) {
    throw badRequest("cursor_invalid", "That page reference is not one we issued.");
  }

  const rows = await scope.devicesPage(typeof afterDate === "string" ? afterDate : null, afterId, pageSize + 1);

  const page = buildPage(rows, pageSize, (row) => [
    new Date(row.claimed_at).toISOString(),
    Number(row.ownership_id),
  ]);
  return c.json({
    data: await Promise.all(page.data.map(deviceView)),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    page_size: pageSize,
  });
});

app.post("/account/devices", async (c) => {
  const scope = c.get("scope")!;
  const customer = scope.customer;
  const payload = await body(c);
  const serial = normaliseSerial(payload.serial);

  // The shape is decided before any lookup, so a malformed serial never reaches
  // the store and never learns whether a device exists.
  if (!isWellFormedSerial(serial)) {
    throw unprocessable("serial_malformed", MESSAGES.serialShape, { serial });
  }

  const claim = await transaction(async (tx) => {
    const device = await tx.one<Row>(
      "SELECT * FROM device WHERE upper(serial) = upper($1) FOR UPDATE",
      [serial],
    );
    if (!device) throw notFound(MESSAGES.serialUnknown);
    if (device.status === "blocked") {
      throw unprocessable("serial_blocked", MESSAGES.serialBlocked, {
        reason: device.blocked_reason ?? "blocked",
      });
    }

    const live = await tx.one<Row>(
      "SELECT * FROM device_ownership WHERE device_id = $1 AND released_at IS NULL",
      [device.id],
    );
    if (live) {
      if (Number(live.customer_id) === Number(customer.id)) {
        return { device, replayed: true };
      }
      // The refusal never names the other owner.
      throw conflict("serial_owned", MESSAGES.serialOwned, { serial, resource: serial });
    }

    try {
      await tx.query(
        `INSERT INTO device_ownership (device_id, customer_id, claimed_at, method)
         VALUES ($1,$2, now(), 'manual')`,
        [device.id, customer.id],
      );
    } catch (error) {
      // The store, not this handler, decides two simultaneous claims.
      if (pgCode(error) === PG.uniqueViolation) {
        throw conflict("serial_owned", MESSAGES.serialOwned, { serial });
      }
      throw error;
    }
    await tx.query("UPDATE device SET status = 'registered' WHERE id = $1", [device.id]);
    return { device, replayed: false };
  });

  const row = await scope.device(String(claim.device.serial));
  const view = await deviceView(row);
  return c.json(
    {
      device: view,
      ...view,
      replayed: claim.replayed,
      message: claim.replayed
        ? "That camera is already on your account."
        : "That camera is on your account now.",
      request_id: c.get("requestId"),
    },
    claim.replayed ? 200 : 201,
  );
});

app.get("/account/devices/:serial", async (c) => {
  const row = await c.get("scope")!.device(c.req.param("serial"));
  const sessions = await query<Row>(
    "SELECT id, state, reported_version, started_at, ended_at FROM flash_session WHERE device_id = $1 ORDER BY started_at DESC LIMIT 5",
    [row.id],
  );
  return c.json({ ...(await deviceView(row)), sessions, request_id: c.get("requestId") });
});

app.patch("/account/devices/:serial", async (c) => {
  const scope = c.get("scope")!;
  const row = await scope.device(c.req.param("serial"));
  const payload = await body(c);
  if (payload.nickname !== null && typeof payload.nickname !== "string") {
    throw unprocessable("nickname_invalid", "A nickname must be text.", { field: "nickname" });
  }
  const nickname = payload.nickname === null ? null : String(payload.nickname ?? "").trim();
  if (nickname !== null && nickname.length > 60) {
    throw unprocessable("nickname_too_long", "A nickname fits in sixty characters.");
  }
  if (!(await scope.renameDevice(Number(row.id), nickname || null))) {
    throw notFound("We cannot find that camera on your account.");
  }
  const fresh = await scope.device(String(row.serial));
  return c.json({ ...(await deviceView(fresh)), request_id: c.get("requestId") });
});

app.delete("/account/devices/:serial", async (c) => {
  const scope = c.get("scope")!;
  const row = await scope.device(c.req.param("serial"));
  // Releasing ends the link and grants it to nobody.
  await transaction(async (tx) => {
    if (!(await scope.releaseDevice(Number(row.id), tx))) {
      throw conflict(
        "ownership_already_released",
        "That camera is no longer on your account.",
        { serial: row.serial, resource: row.serial },
      );
    }
    await tx.query("UPDATE device SET status = 'sold', nickname = NULL WHERE id = $1", [row.id]);
  });
  return c.json({
    serial: row.serial,
    model: row.model,
    released: true,
    message: "That camera is no longer on your account.",
    request_id: c.get("requestId"),
  });
});

/** Handing a camera over is not the same act as releasing it: the link moves to
 *  a named person in one step rather than ending and leaving the camera loose.
 *  Both sides happen in one transaction so the camera is never ownerless. */
app.post("/account/devices/:serial/hand-over", async (c) => {
  const scope = c.get("scope")!;
  const customer = scope.customer;
  const row = await scope.device(c.req.param("serial"));
  const payload = await body(c);
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) throw unprocessable("email_required", "Name the person taking it.");
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw unprocessable("email_invalid", "That did not work. Check the address and try again.");
  }
  if (email === String(customer.email).toLowerCase()) {
    throw unprocessable("same_owner", "That camera is already on your account.");
  }

  const recipient = await one<Row>(
    "SELECT id, email FROM customer WHERE lower(email) = lower($1) AND status = 'active'",
    [email],
  );
  // The other person is never described beyond whether we can hand it to them.
  if (!recipient) {
    throw unprocessable(
      "recipient_unknown",
      "Nobody with that address has an account with us yet.",
    );
  }

  try {
    await transaction(async (tx) => {
      if (!(await scope.releaseDevice(Number(row.id), tx))) {
        throw conflict(
          "ownership_changed",
          "That camera is no longer on your account.",
          { serial: row.serial, resource: row.serial },
        );
      }
      await tx.query(
        `INSERT INTO device_ownership (device_id, customer_id, method)
         VALUES ($1,$2,'manual')`,
        [row.id, recipient.id],
      );
      await tx.query("UPDATE device SET status = 'registered', nickname = NULL WHERE id = $1", [
        row.id,
      ]);
    });
  } catch (error) {
    if (pgCode(error) === PG.uniqueViolation) {
      throw conflict("device_owned", "That camera is registered to someone else.");
    }
    throw error;
  }

  return c.json({
    serial: row.serial,
    model: row.model,
    handed_over: true,
    message: "That camera is on their account now.",
    request_id: c.get("requestId"),
  });
});

app.get("/account/overview", async (c) => {
  const scope = c.get("scope")!;
  const customer = scope.customer;
  const devices = await scope.allDevices();
  const orders = await scope.recentOrders(2);
  const release = await one<Row>("SELECT * FROM app_release ORDER BY build DESC LIMIT 1");
  return c.json({
    customer: publicCustomer(customer),
    devices: await Promise.all(devices.map(deviceView)),
    orders: orders.map((row) => ({
      number: row.number,
      placed_at: row.placed_at,
      chip: orderChip(row),
      total_minor: Number(row.total_minor),
    })),
    software: release
      ? { version: release.version, build: Number(release.build), released_on: String(release.released_on).slice(0, 10) }
      : null,
    request_id: c.get("requestId"),
  });
});

/* ------------------------------------------------------------------ releases */

function releaseView(row: Row) {
  return {
    version: row.version,
    build: Number(row.build),
    released_on: String(row.released_on).slice(0, 10),
    channel: row.channel,
    artifact_name: row.artifact_name,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    description: row.description,
    notes: row.notes ?? {},
    artifact_available: false,
    download_url: null,
  };
}

app.get("/releases", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const pageSize = readPageSize(params);
  const cursor = decodeCursor(params.get("cursor"));
  const afterBuild = cursorInteger(cursor, 0, 1);

  // The archive orders by build descending. The release date is not a sort key.
  const rows = await query<Row>(
    `SELECT * FROM app_release
      WHERE ($1::int IS NULL OR build < $1::int)
      ORDER BY build DESC
      LIMIT $2`,
    [afterBuild, pageSize + 1],
  );
  const page = buildPage(rows, pageSize, (row) => [Number(row.build)]);
  return c.json({
    data: page.data.map(releaseView),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    page_size: pageSize,
  });
});

app.get("/releases/:version", async (c) => {
  const row = await one<Row>("SELECT * FROM app_release WHERE version = $1", [c.req.param("version")]);
  if (!row) throw notFound("We have no release by that number.");
  return c.json({ ...releaseView(row), request_id: c.get("requestId") });
});

/* ------------------------------------------------------------------ firmware */

async function productByModel(model: string): Promise<Row | null> {
  return one<Row>(
    "SELECT * FROM product WHERE lower(title) = lower($1) OR handle = lower($1) LIMIT 1",
    [model],
  );
}

app.get("/firmware/manifest", async (c) => {
  const model = c.req.query("model") ?? "";
  if (!model.trim()) throw badRequest("model_required", "Name the camera this manifest is for.");
  const product = await productByModel(model.trim());
  if (!product || product.kind !== "camera") throw notFound("We do not make that camera.");

  const channel = (c.req.query("channel") ?? "general").toLowerCase();
  if (!["general", "beta", "internal"].includes(channel)) {
    throw badRequest("channel_invalid", "Choose the general, beta or internal channel.");
  }
  // This public model-only request carries no device opt-in capability, so it
  // may never expose beta or internal images.
  if (channel !== "general") {
    throw unprocessable(
      "channel_not_opted_in",
      "This camera has not opted in to that firmware channel.",
    );
  }

  const rows = await query<Row>(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general'
      ORDER BY build DESC`,
    [product.id],
  );

  return c.json({
    product: product.title,
    handle: product.handle,
    generated_at: new Date().toISOString(),
    channel,
    entries: rows.map((row) => ({
      version: row.version,
      build: Number(row.build),
      channel: row.channel,
      min_firmware: row.min_firmware,
      min_app_version: row.min_app_version,
      size_bytes: Number(row.size_bytes),
      sha256: row.sha256,
      released_on: String(row.released_on).slice(0, 10),
      artifact_available: false,
      download_url: null,
    })),
  });
});

/* ------------------------------------------------------------ flash sessions */

const FLASH_COOKIE = "vela_flash";

function flashView(row: Row, device: Row, firmware: Row) {
  return {
    id: String(row.id),
    device_id: String(row.device_id),
    serial: device.serial,
    model: device.model ?? device.title,
    firmware_id: String(row.firmware_id),
    target_version: firmware.version,
    target_build: Number(firmware.build),
    state: row.state,
    reported_version: row.reported_version,
    failure_reason: row.failure_reason,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

/** The installer must work for a camera nobody has registered and for one
 *  registered to somebody else, so identifying a camera needs no account. It
 *  answers with the model and the version on record and with nothing about
 *  whoever owns it. */
app.get("/devices/:serial", async (c) => {
  const serial = normaliseSerial(c.req.param("serial"));
  if (!isWellFormedSerial(serial)) {
    throw unprocessable("serial_malformed", MESSAGES.serialShape, { serial });
  }

  const device = await one<Row>(
    `SELECT d.serial, d.status, d.firmware_version, d.firmware_reported_at,
            p.title AS model, p.handle
       FROM device d JOIN product p ON p.id = d.product_id
      WHERE upper(d.serial) = upper($1)`,
    [serial],
  );
  if (!device) throw notFound(MESSAGES.serialUnknown);
  if (device.status === "blocked") {
    throw unprocessable(
      "device_blocked",
      "That camera is blocked. Talk to us before writing firmware to it.",
    );
  }

  return c.json({
    serial: device.serial,
    model: device.model,
    handle: device.handle,
    firmware_version: device.firmware_version,
    firmware_reported_at: device.firmware_reported_at,
    request_id: c.get("requestId"),
  });
});

/** Every refusal happens here, before any row is written: the target must be an
 *  image for this camera's product, on the general channel, and never below the
 *  minimum firmware the camera can go back to, which is the version it runs.
 *  The installer's preflight and the real start read the same rules, so the
 *  reason a reader is shown is the reason the store would give. */
async function flashPreflight(
  payload: Record<string, any>,
): Promise<{ device: Row; firmware: Row }> {
  const serial = normaliseSerial(payload.serial);
  if (!isWellFormedSerial(serial)) {
    throw unprocessable("serial_malformed", MESSAGES.serialShape, { serial });
  }
  const targetBuild = payload.target_build;
  if (typeof targetBuild !== "number" || !Number.isSafeInteger(targetBuild) || targetBuild < 1) {
    throw unprocessable("target_build_invalid", "Name the firmware build to write.");
  }

  const device = await one<Row>(
    `SELECT d.*, p.title AS model, p.handle FROM device d JOIN product p ON p.id = d.product_id
      WHERE upper(d.serial) = upper($1)`,
    [serial],
  );
  if (!device) throw notFound(MESSAGES.serialUnknown);
  if (device.status === "blocked") {
    throw unprocessable("device_blocked", "That camera is blocked. Talk to us before writing firmware to it.");
  }

  const firmware = await one<Row>("SELECT * FROM firmware WHERE build = $1", [targetBuild]);
  if (!firmware) throw notFound("We have no firmware by that build number.");

  // Refused before it starts, and a refusal writes no session row.
  if (Number(firmware.product_id) !== Number(device.product_id)) {
    const owner = await one<Row>("SELECT title FROM product WHERE id = $1", [firmware.product_id]);
    throw unprocessable(
      "firmware_model_mismatch",
      `That image is for the ${owner?.title ?? "another camera"} and this camera is a ${device.model}. We do not write it to this camera.`,
    );
  }
  if (firmware.channel !== "general") {
    throw unprocessable("firmware_channel", "That image is not offered on the general channel.");
  }
  if (!device.firmware_version && firmware.min_firmware) {
    throw unprocessable(
      "firmware_version_unknown",
      `That image needs firmware ${firmware.min_firmware} or later, but this camera has not reported its current version.`,
    );
  }
  if (device.firmware_version) {
    if (compareVersions(firmware.min_firmware, device.firmware_version) > 0) {
      throw unprocessable(
        "firmware_below_minimum",
        `That image needs the camera to be running ${firmware.min_firmware} or later, and this camera reports ${device.firmware_version}.`,
      );
    }
    if (compareVersions(firmware.version, device.firmware_version) < 0) {
      throw unprocessable(
        "firmware_downgrade",
        `That image is ${firmware.version}, below the minimum firmware for this camera. It runs ${device.firmware_version} and we do not write an older version to it.`,
      );
    }
  }
  return { device, firmware };
}

/** The installer asks before it touches anything. A preflight answers with the
 *  same refusals a start would, and writes no session row either way. */
app.post("/flash-sessions/preflight", async (c) => {
  const { device, firmware } = await flashPreflight(await body(c));
  return c.json({
    ok: true,
    serial: device.serial,
    model: device.model,
    handle: device.handle,
    current_version: device.firmware_version,
    target_version: firmware.version,
    target_build: Number(firmware.build),
    min_firmware: firmware.min_firmware,
    request_id: c.get("requestId"),
  });
});

app.post("/flash-sessions", async (c) => {
  const { device, firmware } = await flashPreflight(await body(c));
  const serial = String(device.serial);

  // A write that started long ago and never reported back is not still running:
  // it is closed as abandoned so the camera can be written again.
  await query(
    `UPDATE flash_session
        SET state = 'failed', failure_reason = 'abandoned', ended_at = now()
      WHERE device_id = $1 AND state = 'started'
        AND started_at < now() - interval '15 minutes'`,
    [device.id],
  );

  let session: Row | null;
  try {
    session = await one<Row>(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1,$2,'started') RETURNING *`,
      [device.id, firmware.id],
    );
  } catch (error) {
    if (pgCode(error) === PG.uniqueViolation) {
      throw conflict("flash_in_progress", "A write is already running on that camera.", { resource: serial });
    }
    throw error;
  }
  if (!session) throw new Error("the store refused the session");

  const sessionToken = scopedToken("flash-session", session.id);
  setCookie(c, FLASH_COOKIE, sessionToken, {
    path: `/api/flash-sessions/${session.id}`,
    httpOnly: true,
    sameSite: "Strict",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: 60 * 60 * 2,
  });
  return c.json(
    {
      ...flashView(session, device, firmware),
      session_token: sessionToken,
      request_id: c.get("requestId"),
    },
    201,
  );
});

async function loadSession(
  c: Context<{ Variables: Vars }>,
  id: string,
): Promise<{ session: Row; device: Row; firmware: Row }> {
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric) || numeric < 1) {
    throw notFound("We have no record of that write.");
  }
  const supplied =
    c.req.header("x-flash-session-token") ??
    cookieValue(c.req.header("cookie"), FLASH_COOKIE);
  if (!tokenMatches(supplied, scopedToken("flash-session", numeric))) {
    throw notFound("We have no record of that write.");
  }
  const session = await one<Row>("SELECT * FROM flash_session WHERE id = $1", [numeric]);
  if (!session) throw notFound("We have no record of that write.");
  const device = await one<Row>(
    `SELECT d.*, p.title AS model FROM device d JOIN product p ON p.id = d.product_id WHERE d.id = $1`,
    [session.device_id],
  );
  const firmware = await one<Row>("SELECT * FROM firmware WHERE id = $1", [session.firmware_id]);
  if (!device || !firmware) throw notFound("We have no record of that write.");
  return { session, device, firmware };
}

app.post("/flash-sessions/:id/complete", async (c) => {
  const { session, device, firmware } = await loadSession(c, c.req.param("id"));
  if (session.state !== "started") {
    throw conflict("flash_settled", "That write already finished.", { resource: String(session.id) });
  }
  const payload = await body(c);
  // The version recorded is the one read back from the camera, never the one asked for.
  const reported =
    typeof payload.reported_version === "string" ? payload.reported_version.trim() : "";
  if (!reported) {
    throw unprocessable("reported_version_required", "The camera must report the version it is running.");
  }
  if (!/^\d+(?:\.\d+){1,2}$/.test(reported)) {
    throw unprocessable(
      "reported_version_invalid",
      "The camera did not report a version we can record.",
    );
  }

  const updated = await transaction(async (tx) => {
    const row = await tx.one<Row>(
      `UPDATE flash_session SET state = 'succeeded', reported_version = $1, ended_at = now()
        WHERE id = $2 AND state = 'started' RETURNING *`,
      [reported, session.id],
    );
    if (!row) throw conflict("flash_settled", "That write already finished.", { resource: String(session.id) });
    await tx.query(
      "UPDATE device SET firmware_version = $1, firmware_reported_at = now() WHERE id = $2",
      [reported, device.id],
    );
    return row;
  });

  return c.json(
    {
      ...flashView(updated, device, firmware),
      device_firmware_version: reported,
      message: `Done. Your camera is running ${reported}.`,
      request_id: c.get("requestId"),
    },
    200,
  );
});

app.post("/flash-sessions/:id/fail", async (c) => {
  const { session, device, firmware } = await loadSession(c, c.req.param("id"));
  if (session.state !== "started") {
    throw conflict("flash_settled", "That write already finished.", { resource: String(session.id) });
  }
  const payload = await body(c);
  if (payload.reason !== undefined && typeof payload.reason !== "string") {
    throw unprocessable("failure_reason_invalid", "The failure reason must be text.");
  }
  const reason = String(payload.reason ?? "unknown").trim() || "unknown";
  if (reason.length > 200) {
    throw unprocessable(
      "failure_reason_too_long",
      "The failure reason must fit in two hundred characters.",
    );
  }

  // A failed write leaves the recorded version exactly as it was.
  const row = await one<Row>(
    `UPDATE flash_session SET state = 'failed', failure_reason = $1, ended_at = now()
      WHERE id = $2 AND state = 'started' RETURNING *`,
    [reason, session.id],
  );
  if (!row) throw conflict("flash_settled", "That write already finished.", { resource: String(session.id) });

  return c.json({
    ...flashView(row, device, firmware),
    device_firmware_version: device.firmware_version,
    request_id: c.get("requestId"),
  });
});

export default app;
export { app };

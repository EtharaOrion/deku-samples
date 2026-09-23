import api from "../../server/api";
import type { ApiError, Cart, Customer, Order } from "./types";

export const AUTH_COOKIE = "vela_auth";
export const CART_COOKIE = "vela_cart";

/** The slice of the Astro global these helpers need. */
export type Ctx = {
  url: URL;
  request: Request;
  response: { headers: Headers };
  // Astro's project-specific Locals interface is intentionally open-ended.
  // `any` keeps this helper compatible with both AstroGlobal and APIContext
  // while the values stored below remain narrowed at each read.
  locals: any;
  /** Astro's own cookie writer. Unlike a header appended to Astro.response, a
   *  cookie set here survives Astro.redirect, which builds a fresh Response. */
  cookies: {
    set(name: string, value: string, options?: Record<string, unknown>): void;
    delete(name: string, options?: Record<string, unknown>): void;
  };
};

export type Ok<T> = { ok: true; status: number; data: T };
export type Fail = { ok: false; status: number; error: ApiError };
export type Result<T> = Ok<T> | Fail;

type Pending = { jar: Map<string, string>; out: string[] };

function pending(ctx: Ctx): Pending {
  const existing = ctx.locals.__velaCookies as Pending | undefined;
  if (existing) return existing;
  const fresh: Pending = { jar: new Map(), out: [] };
  ctx.locals.__velaCookies = fresh;
  return fresh;
}

function readCookie(ctx: Ctx, name: string): string | undefined {
  const own = pending(ctx).jar.get(name);
  if (own !== undefined) return own;
  const header = ctx.request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function outgoingCookieHeader(ctx: Ctx): string | null {
  const jar = pending(ctx).jar;
  const header = ctx.request.headers.get("cookie");
  if (jar.size === 0) return header;
  const merged = new Map<string, string>();
  if (header) {
    for (const part of header.split(";")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      merged.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  for (const [name, value] of jar) merged.set(name, encodeURIComponent(value));
  return [...merged].map(([k, v]) => `${k}=${v}`).join("; ");
}

function takeSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

/** A cart read may mint a cart, so the Set-Cookie the API answers with is
 *  carried onto the page response and into the rest of this render. */
function absorb(ctx: Ctx, response: Response): void {
  const state = pending(ctx);
  for (const raw of takeSetCookies(response)) {
    ctx.response.headers.append("set-cookie", raw);
    state.out.push(raw);
    const firstPair = raw.split(";")[0] ?? "";
    const eq = firstPair.indexOf("=");
    if (eq < 0) continue;
    state.jar.set(firstPair.slice(0, eq).trim(), decodeURIComponent(firstPair.slice(eq + 1).trim()));
  }
}

export function authToken(ctx: Ctx): string | undefined {
  return readCookie(ctx, AUTH_COOKIE);
}

export function setAuthCookie(ctx: Ctx, token: string): void {
  ctx.cookies.set(AUTH_COOKIE, token, {
    path: "/",
    maxAge: 86400,
    sameSite: "lax",
    httpOnly: true,
    secure: ctx.url.protocol === "https:",
  });
  pending(ctx).jar.set(AUTH_COOKIE, token);
}

export function clearAuthCookie(ctx: Ctx): void {
  ctx.cookies.delete(AUTH_COOKIE, { path: "/" });
  pending(ctx).jar.delete(AUTH_COOKIE);
}

export function setCartCookie(ctx: Ctx, token: string): void {
  ctx.cookies.set(CART_COOKIE, token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
    secure: ctx.url.protocol === "https:",
  });
  pending(ctx).jar.set(CART_COOKIE, token);
}

export async function call<T>(
  ctx: Ctx,
  path: string,
  init: { method?: string; body?: unknown; anonymous?: boolean } = {},
): Promise<Result<T>> {
  const headers = new Headers();
  const cookie = outgoingCookieHeader(ctx);
  if (cookie) headers.set("cookie", cookie);
  headers.set("accept", "application/json");

  const token = init.anonymous ? undefined : authToken(ctx);
  if (token) headers.set("authorization", `Bearer ${token}`);

  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }

  const requestInit: RequestInit = {
    method: init.method ?? "GET",
    headers,
  };
  if (body !== undefined) requestInit.body = body;
  const request = new Request(new URL(path, ctx.url), requestInit);

  let response: Response;
  try {
    response = await api.request(request);
  } catch {
    return { ok: false, status: 0, error: { message: "Something went wrong at our end." } };
  }
  absorb(ctx, response);

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const shape = (payload ?? {}) as Record<string, unknown>;
    const nested = (shape.error ?? shape) as Record<string, unknown>;
    const error: ApiError = {};
    if (typeof nested.code === "string") error.code = nested.code;
    if (typeof nested.message === "string") error.message = nested.message;
    if (typeof shape.request_id === "string") {
      error.request_id = shape.request_id;
    } else if (typeof nested.request_id === "string") {
      error.request_id = nested.request_id;
    }
    return {
      ok: false,
      status: response.status,
      error,
    };
  }

  return { ok: true, status: response.status, data: payload as T };
}

export function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const shape = payload as { data?: unknown } | null;
  return Array.isArray(shape?.data) ? (shape.data as T[]) : [];
}

/** The shell and the page inside it read the same two endpoints per render. */
function once<T>(ctx: Ctx, key: string, produce: () => Promise<T>): Promise<T> {
  const cache = (ctx.locals.__velaOnce ?? (ctx.locals.__velaOnce = new Map())) as Map<
    string,
    Promise<unknown>
  >;
  const held = cache.get(key);
  if (held) return held as Promise<T>;
  const fresh = produce();
  cache.set(key, fresh);
  return fresh;
}

export function currentCustomer(ctx: Ctx): Promise<Customer | null> {
  return once(ctx, "me", async () => {
    if (!authToken(ctx)) return null;
    const answer = await call<{ customer?: Customer } | Customer>(ctx, "/api/auth/me");
    if (!answer.ok) {
      if (answer.status === 401 || answer.status === 403) clearAuthCookie(ctx);
      return null;
    }
    const shape = answer.data as { customer?: Customer } & Customer;
    return shape.customer ?? (shape.email ? shape : null);
  });
}

export function readCart(ctx: Ctx): Promise<Cart | null> {
  return once(ctx, "cart", async () => {
    const answer = await call<{ cart?: Cart } & Cart>(ctx, "/api/cart");
    if (!answer.ok) return null;
    const cart = answer.data.cart ?? answer.data;
    return cart && Array.isArray(cart.lines) ? cart : null;
  });
}

export type PlacedOrder = Order & { cart_token: string };

export function placedOrderForCart(ctx: Ctx): Promise<PlacedOrder | null> {
  return once(ctx, "placed", async () => {
    const answer = await call<PlacedOrder>(ctx, "/api/cart/order");
    return answer.ok ? answer.data : null;
  });
}

export function cartCount(cart: Cart | null): number {
  if (!cart) return 0;
  if (typeof cart.item_count === "number") return cart.item_count;
  return cart.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
}

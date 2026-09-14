import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, o as renderSlot } from "./astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$Base } from "./Base_BSTyY1ZD.mjs";
import { r as readToken, e as ensureCart, b as getCartState } from "./cart_BmbV16eC.mjs";
import { o as one } from "./db_C-9WqIXq.mjs";
const CART_COOKIE_NAME = "vela_cart";
async function sessionCustomer(request, cookies) {
  const header = request.headers.get("authorization");
  let token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    const cookie = request.headers.get("cookie") ?? "";
    const m = /(?:^|;\s*)vela_token=([^;]+)/.exec(cookie);
    if (m) token = decodeURIComponent(m[1]);
  }
  const payload = readToken(token);
  if (!payload) return null;
  const row = await one(
    `SELECT id, email, name FROM customer WHERE id = $1 AND status = 'active'`,
    [payload.sub]
  );
  return row ?? null;
}
async function sessionCart(cookies, customer) {
  const existing = cookies.get(CART_COOKIE_NAME)?.value ?? null;
  const token = await ensureCart(existing ?? void 0, customer?.id ?? null);
  if (token !== existing) {
    cookies.set(CART_COOKIE_NAME, token, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  }
  const state = await getCartState(token);
  const count = state ? state.lines.reduce((n, l) => n + l.quantity, 0) : 0;
  return { token, state, count };
}
const $$Astro = createAstro();
const $$PageShell = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$PageShell;
  const { title, heading, active } = Astro2.props;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  const cart = await sessionCart(Astro2.cookies, customer);
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": title, "heading": heading, "active": active, "customer": customer ? { name: customer.name, email: customer.email } : null, "cartCount": cart.count }, { "default": async ($$result2) => renderTemplate` ${renderSlot($$result2, $$slots["default"])} ` })}`;
}, "/app/src/components/PageShell.astro", void 0);
export {
  $$PageShell as $,
  sessionCart as a,
  sessionCustomer as s
};

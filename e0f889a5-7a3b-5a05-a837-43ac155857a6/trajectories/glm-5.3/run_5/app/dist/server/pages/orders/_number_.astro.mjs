import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, n as Fragment } from "../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, $ as $$PageShell } from "../../chunks/PageShell_DYrBPb7v.mjs";
import { g as getOrder, c as canSeeOrder, l as loadOrderLines, o as orderSerials, t as toOrderView } from "../../chunks/orders_Bfk_OpWP.mjs";
import { d as dollars } from "../../chunks/cart_BmbV16eC.mjs";
/* empty css                                       */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const order = number ? await getOrder(number.toUpperCase()) : null;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  const token = Astro2.url.searchParams.get("access_token");
  const cookieToken = Astro2.cookies.get("vela_order_token")?.value ?? null;
  const allowed = order ? await canSeeOrder(order, { accessToken: token ?? cookieToken, customerId: customer?.id ?? null }) : false;
  if (!order || !allowed) return Astro2.redirect("/404");
  const lines = await loadOrderLines(order.id);
  const serials = await orderSerials(order.id);
  const view = toOrderView(order, lines, serials);
  if (token) Astro2.cookies.set("vela_order_token", token, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": `Order ${view.number} — Vela`, "heading": `Order ${view.number}`, "active": "", "data-astro-cid-cxx6wafo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="order" data-astro-cid-cxx6wafo> <div class="confirmed card" data-astro-cid-cxx6wafo> <p class="stated" data-astro-cid-cxx6wafo>Order ${view.number} is confirmed.</p> <p data-astro-cid-cxx6wafo>We have emailed ${view.email}.</p> <a class="btn" href="/account/orders" data-astro-cid-cxx6wafo>Keep track of this order</a> </div> <section class="block card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Lines</h2> <ul data-astro-cid-cxx6wafo> ${view.lines.map((l) => renderTemplate`<li data-astro-cid-cxx6wafo> <span class="line__title" data-astro-cid-cxx6wafo>${l.title}</span> <span class="tnum" data-astro-cid-cxx6wafo>×${l.quantity} · ${dollars(l.total_minor)}</span> ${l.serials.length > 0 && renderTemplate`<span class="serials" data-astro-cid-cxx6wafo> ${l.serials.map((s) => renderTemplate`<span class="serial mono" data-astro-cid-cxx6wafo>${s}</span>`)} </span>`} </li>`)} </ul> </section> <section class="block card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Totals</h2> <dl class="tnum" data-astro-cid-cxx6wafo> <dt data-astro-cid-cxx6wafo>Subtotal</dt><dd data-astro-cid-cxx6wafo>${dollars(view.subtotal_minor)}</dd> ${view.protection_minor > 0 && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-cxx6wafo": true }, { "default": async ($$result3) => renderTemplate`<dt data-astro-cid-cxx6wafo>Shipment protection</dt><dd data-astro-cid-cxx6wafo>${dollars(view.protection_minor)}</dd>` })}`} <dt data-astro-cid-cxx6wafo>Delivery, ${view.shipping_method}</dt><dd data-astro-cid-cxx6wafo>${dollars(view.shipping_minor)}</dd> <dt data-astro-cid-cxx6wafo>Tax</dt><dd data-astro-cid-cxx6wafo>${dollars(view.tax_minor)}</dd> <dt data-astro-cid-cxx6wafo>Total</dt><dd class="total" data-astro-cid-cxx6wafo>${dollars(view.total_minor)}</dd> </dl> <p class="field-hint" data-astro-cid-cxx6wafo>Invoiced in USD. Reference ${view.number}.</p> </section> <section class="block card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Address</h2> ${view.shipping_address && renderTemplate`<address data-astro-cid-cxx6wafo> ${view.shipping_address.name}<br data-astro-cid-cxx6wafo> ${view.shipping_address.line1}${view.shipping_address.line2 ? `, ${view.shipping_address.line2}` : ""}<br data-astro-cid-cxx6wafo> ${view.shipping_address.city}, ${view.shipping_address.region} ${view.shipping_address.postal_code}<br data-astro-cid-cxx6wafo> ${view.shipping_address.country} </address>`} <p class="chip chip--done" data-astro-cid-cxx6wafo>${view.status_chip}</p> </section> </div> ` })} `;
}, "/app/src/pages/orders/[number].astro", void 0);
const $$file = "/app/src/pages/orders/[number].astro";
const $$url = "/orders/[number]";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

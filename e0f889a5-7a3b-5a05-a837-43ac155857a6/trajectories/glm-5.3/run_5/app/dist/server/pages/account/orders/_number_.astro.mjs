import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, n as Fragment } from "../../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, $ as $$PageShell } from "../../../chunks/PageShell_DYrBPb7v.mjs";
import { g as getOrder, l as loadOrderLines, o as orderSerials, t as toOrderView } from "../../../chunks/orders_Bfk_OpWP.mjs";
import { d as dollars } from "../../../chunks/cart_BmbV16eC.mjs";
/* empty css                                          */
import { renderers } from "../../../renderers.mjs";
const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  if (!customer) return Astro2.redirect(`/sign-in?redirect=${encodeURIComponent(Astro2.url.pathname)}`);
  const { number } = Astro2.params;
  const order = number ? await getOrder(number.toUpperCase()) : null;
  if (!order || !order.customer_id || Number(order.customer_id) !== Number(customer.id)) {
    return Astro2.redirect("/404");
  }
  const lines = await loadOrderLines(order.id);
  const serials = await orderSerials(order.id);
  const view = toOrderView(order, lines, serials);
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": `Order ${view.number} — Vela`, "heading": `Order ${view.number}`, "active": "orders", "customer": { name: customer.name, email: customer.email }, "data-astro-cid-th46ys4i": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="order-page" data-astro-cid-th46ys4i> <p class="chip chip--done" data-astro-cid-th46ys4i>${view.status_chip}</p> <section class="block card" data-astro-cid-th46ys4i> <h2 data-astro-cid-th46ys4i>As bought</h2> <ul data-astro-cid-th46ys4i> ${view.lines.map((l) => renderTemplate`<li data-astro-cid-th46ys4i> <span class="line__title" data-astro-cid-th46ys4i>${l.title}</span> <span class="tnum" data-astro-cid-th46ys4i>×${l.quantity} · ${dollars(l.total_minor)}</span> ${l.serials.length > 0 && renderTemplate`<span class="serials" data-astro-cid-th46ys4i> ${l.serials.map((s) => renderTemplate`<span class="serial mono" data-astro-cid-th46ys4i>${s}</span>`)} </span>`} </li>`)} </ul> </section> <section class="block card" data-astro-cid-th46ys4i> <h2 data-astro-cid-th46ys4i>Totals</h2> <dl class="tnum" data-astro-cid-th46ys4i> <dt data-astro-cid-th46ys4i>Subtotal</dt><dd data-astro-cid-th46ys4i>${dollars(view.subtotal_minor)}</dd> ${view.protection_minor > 0 && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-th46ys4i": true }, { "default": async ($$result3) => renderTemplate`<dt data-astro-cid-th46ys4i>Shipment protection</dt><dd data-astro-cid-th46ys4i>${dollars(view.protection_minor)}</dd>` })}`} <dt data-astro-cid-th46ys4i>Delivery, ${view.shipping_method}</dt><dd data-astro-cid-th46ys4i>${dollars(view.shipping_minor)}</dd> <dt data-astro-cid-th46ys4i>Tax</dt><dd data-astro-cid-th46ys4i>${dollars(view.tax_minor)}</dd> <dt data-astro-cid-th46ys4i>Total</dt><dd class="total" data-astro-cid-th46ys4i>${dollars(view.total_minor)}</dd> </dl> </section> <section class="block card" data-astro-cid-th46ys4i> <h2 data-astro-cid-th46ys4i>Address as captured</h2> ${view.shipping_address && renderTemplate`<address data-astro-cid-th46ys4i> ${view.shipping_address.name}<br data-astro-cid-th46ys4i> ${view.shipping_address.line1}${view.shipping_address.line2 ? `, ${view.shipping_address.line2}` : ""}<br data-astro-cid-th46ys4i> ${view.shipping_address.city}, ${view.shipping_address.region} ${view.shipping_address.postal_code}<br data-astro-cid-th46ys4i> ${view.shipping_address.country} </address>`} </section> </div> ` })} `;
}, "/app/src/pages/account/orders/[number].astro", void 0);
const $$file = "/app/src/pages/account/orders/[number].astro";
const $$url = "/account/orders/[number]";
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

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute, F as Fragment } from "../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../chunks/App_CiTDO3Su.mjs";
import { one, q } from "../../chunks/index_CC0DBeZe.mjs";
import { s as sha256 } from "../../chunks/util_DjyUBxV_.mjs";
/* empty css                                       */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const number = Astro2.params.number;
  const token = Astro2.url.searchParams.get("access_token");
  const order = await one("SELECT * FROM orders WHERE number = $1", [number]);
  const { currentCustomer } = await import("../../chunks/session_C_3CDjrl.mjs");
  const customer = await currentCustomer(Astro2.request);
  const tokenOk = token && sha256(String(token)) === order?.access_token_hash;
  const ownerOk = customer && order && order.customer_id === customer.id;
  if (!order || !tokenOk && !ownerOk) {
    return Astro2.redirect("/404");
  }
  const lines = await q("SELECT * FROM order_line WHERE order_id = $1 ORDER BY id", [order.id]);
  const serials = await q("SELECT serial FROM device WHERE order_id = $1 ORDER BY id", [order.id]);
  const addr = order.shipping_address || {};
  const fmt = (m) => {
    const abs = Math.abs(m);
    return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  };
  const date = new Date(order.placed_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": `Order ${order.number}`, "data-astro-cid-cxx6wafo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="order-page" data-astro-cid-cxx6wafo> <h1 data-astro-cid-cxx6wafo>Order <span class="mono" data-astro-cid-cxx6wafo>${order.number}</span> is confirmed.</h1> <p data-astro-cid-cxx6wafo>We have emailed ${order.email}.</p> <p data-astro-cid-cxx6wafo><a class="btn"${addAttribute(tokenOk ? `/orders/${order.number}?access_token=${encodeURIComponent(token)}` : "/account", "href")} data-astro-cid-cxx6wafo>Keep track of this order</a></p> <section class="card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>The order</h2> <table class="spec" data-astro-cid-cxx6wafo> <tbody data-astro-cid-cxx6wafo> ${lines.map((l) => renderTemplate`<tr data-astro-cid-cxx6wafo> <th scope="row" data-astro-cid-cxx6wafo>${l.title_snapshot} <span class="muted small mono" data-astro-cid-cxx6wafo>${l.sku_snapshot}</span> x${l.quantity}</th> <td class="num tnum" data-astro-cid-cxx6wafo>${fmt(l.total_minor)}</td> </tr>`)} <tr data-astro-cid-cxx6wafo><th scope="row" data-astro-cid-cxx6wafo>Subtotal</th><td class="num tnum" data-astro-cid-cxx6wafo>${fmt(order.subtotal_minor)}</td></tr> ${order.protection_minor ? renderTemplate`<tr data-astro-cid-cxx6wafo><th scope="row" data-astro-cid-cxx6wafo>Shipment protection</th><td class="num tnum" data-astro-cid-cxx6wafo>${fmt(order.protection_minor)}</td></tr>` : null} <tr data-astro-cid-cxx6wafo><th scope="row" data-astro-cid-cxx6wafo>Delivery (${order.shipping_method})</th><td class="num tnum" data-astro-cid-cxx6wafo>${fmt(order.shipping_minor)}</td></tr> <tr data-astro-cid-cxx6wafo><th scope="row" data-astro-cid-cxx6wafo>Tax</th><td class="num tnum" data-astro-cid-cxx6wafo>${fmt(order.tax_minor)}</td></tr> <tr data-astro-cid-cxx6wafo><th scope="row" data-astro-cid-cxx6wafo>Total</th><td class="num tnum" data-astro-cid-cxx6wafo><strong data-astro-cid-cxx6wafo>${fmt(order.total_minor)}</strong></td></tr> </tbody> </table><strong data-astro-cid-cxx6wafo></strong></section><strong data-astro-cid-cxx6wafo> ${serials.length ? renderTemplate`<section class="card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Serial numbers</h2> <p data-astro-cid-cxx6wafo>The serials engraved under the cameras on this order.</p> <ul class="mono" data-astro-cid-cxx6wafo>${serials.map((s) => renderTemplate`<li data-astro-cid-cxx6wafo>${s.serial}</li>`)}</ul> </section>` : null} <section class="card" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Where it goes</h2> <address data-astro-cid-cxx6wafo> ${addr.name}<br data-astro-cid-cxx6wafo> ${addr.line1}${addr.line2 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-cxx6wafo": true }, { "default": async ($$result3) => renderTemplate`<br data-astro-cid-cxx6wafo>${addr.line2}` })}` : null}<br data-astro-cid-cxx6wafo> ${addr.city}${addr.region ? `, ${addr.region}` : ""} ${addr.postal_code}<br data-astro-cid-cxx6wafo> ${addr.country} </address> <p class="muted small" data-astro-cid-cxx6wafo>Placed ${date}. Invoiced to ${order.killbill_external_key || order.email}.</p> </section> </strong></div> ` })} `;
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

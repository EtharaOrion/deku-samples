import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute, F as Fragment } from "../../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../../chunks/App_CiTDO3Su.mjs";
import { one, q } from "../../../chunks/index_CC0DBeZe.mjs";
import { currentCustomer } from "../../../chunks/session_C_3CDjrl.mjs";
/* empty css                                          */
import { renderers } from "../../../renderers.mjs";
const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const customer = await currentCustomer(Astro2.request);
  if (!customer) return Astro2.redirect(`/sign-in?redirect=${encodeURIComponent("/account/orders")}`);
  const number = Astro2.params.number;
  const order = await one("SELECT * FROM orders WHERE number = $1 AND customer_id = $2", [number, customer.id]);
  if (!order) return Astro2.redirect("/404");
  const lines = await q("SELECT * FROM order_line WHERE order_id = $1 ORDER BY id", [order.id]);
  const serials = await q("SELECT id, serial, variant_id, status FROM device WHERE order_id = $1 ORDER BY id", [order.id]);
  const variantSku = await q("SELECT id, sku FROM variant");
  new Map(variantSku.map((v) => [v.id, v.sku]));
  const addr = order.shipping_address || {};
  const fmt = (m) => {
    const abs = Math.abs(m);
    return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  };
  const date = (d) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": `Order ${order.number}`, "data-astro-cid-th46ys4i": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" data-astro-cid-th46ys4i><a href="/account/orders" data-astro-cid-th46ys4i>Orders</a> / <span class="mono" data-astro-cid-th46ys4i>${order.number}</span></nav> <h1 data-astro-cid-th46ys4i><span class="mono" data-astro-cid-th46ys4i>${order.number}</span></h1> <p class="muted" data-astro-cid-th46ys4i>Placed ${date(order.placed_at)}. ${order.status === "confirmed" ? "Confirmed" : "Pending"}, ${order.payment_status === "invoiced" ? "invoiced" : "unpaid"}${order.fulfilment_status === "fulfilled" ? ", delivered" : ""}.</p> <section class="card" data-astro-cid-th46ys4i> <h2 data-astro-cid-th46ys4i>Lines as they were bought</h2> <table class="spec" data-astro-cid-th46ys4i> <tbody data-astro-cid-th46ys4i> ${lines.map((l) => renderTemplate`<tr data-astro-cid-th46ys4i> <th scope="row" data-astro-cid-th46ys4i>${l.title_snapshot} <span class="muted small mono" data-astro-cid-th46ys4i>${l.sku_snapshot}</span></th> <td class="num tnum" data-astro-cid-th46ys4i>x${l.quantity}</td> <td class="num tnum" data-astro-cid-th46ys4i>${fmt(l.total_minor)}</td> </tr>`)} <tr data-astro-cid-th46ys4i><th scope="row" data-astro-cid-th46ys4i>Subtotal</th><td data-astro-cid-th46ys4i></td><td class="num tnum" data-astro-cid-th46ys4i>${fmt(order.subtotal_minor)}</td></tr> ${order.protection_minor ? renderTemplate`<tr data-astro-cid-th46ys4i><th scope="row" data-astro-cid-th46ys4i>Shipment protection</th><td data-astro-cid-th46ys4i></td><td class="num tnum" data-astro-cid-th46ys4i>${fmt(order.protection_minor)}</td></tr>` : null} <tr data-astro-cid-th46ys4i><th scope="row" data-astro-cid-th46ys4i>Delivery (${order.shipping_method})</th><td data-astro-cid-th46ys4i></td><td class="num tnum" data-astro-cid-th46ys4i>${fmt(order.shipping_minor)}</td></tr> <tr data-astro-cid-th46ys4i><th scope="row" data-astro-cid-th46ys4i>Tax</th><td data-astro-cid-th46ys4i></td><td class="num tnum" data-astro-cid-th46ys4i>${fmt(order.tax_minor)}</td></tr> <tr data-astro-cid-th46ys4i><th scope="row" data-astro-cid-th46ys4i>Total</th><td data-astro-cid-th46ys4i></td><td class="num tnum" data-astro-cid-th46ys4i><strong data-astro-cid-th46ys4i>${fmt(order.total_minor)}</strong></td></tr> </tbody> </table><strong data-astro-cid-th46ys4i></strong></section><strong data-astro-cid-th46ys4i> ${serials.length ? renderTemplate`<section class="card" data-astro-cid-th46ys4i> <h2 data-astro-cid-th46ys4i>Serial numbers</h2> <p class="muted small" data-astro-cid-th46ys4i>The serials allocated to the cameras on this order. Register one to keep it on your account.</p> <ul class="serials" data-astro-cid-th46ys4i> ${serials.map((s) => renderTemplate`<li data-astro-cid-th46ys4i> <span class="mono" data-astro-cid-th46ys4i>${s.serial}</span> ${s.status === "registered" ? renderTemplate`<span class="chip chip-ok" data-astro-cid-th46ys4i>Registered</span>` : renderTemplate`<a class="btn btn-quiet"${addAttribute(`/account/cameras?register=${s.serial}`, "href")} data-astro-cid-th46ys4i>Register this camera</a>`} </li>`)} </ul> </section>` : null} <section class="card" data-astro-cid-th46ys4i> <h2 data-astro-cid-th46ys4i>Where it goes</h2> <address data-astro-cid-th46ys4i> ${addr.name}<br data-astro-cid-th46ys4i> ${addr.line1}${addr.line2 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-th46ys4i": true }, { "default": async ($$result3) => renderTemplate`<br data-astro-cid-th46ys4i>${addr.line2}` })}` : null}<br data-astro-cid-th46ys4i> ${addr.city}${addr.region ? `, ${addr.region}` : ""} ${addr.postal_code}<br data-astro-cid-th46ys4i> ${addr.country} </address> </section> </strong> ` })}`;
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

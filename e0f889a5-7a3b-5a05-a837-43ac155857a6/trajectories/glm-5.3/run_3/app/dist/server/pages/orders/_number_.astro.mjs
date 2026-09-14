import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../chunks/App_CbKyOZgE.mjs';
import { o as one, a as rows, c as orderStatusChip, m as money } from '../../chunks/queries_DE4s-KG7.mjs';
import crypto from 'crypto';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const url = new URL(Astro2.request.url);
  const accessToken = url.searchParams.get("access_token");
  const order = await one(`SELECT * FROM orders WHERE number=$1`, [number]);
  let authorized = false;
  if (order) {
    if (accessToken && sha256(accessToken) === order.access_token_hash) authorized = true;
    if (!authorized && order.access_token === null && order.customer_id === null && order.status === "pending") authorized = false;
  }
  if (!order || !authorized) {
    Astro2.response.status = 404;
    return Astro2.rewrite("/404");
  }
  const lines = await rows(`SELECT * FROM order_line WHERE order_id=$1 ORDER BY id`, [order.id]);
  const serials = await rows(
    `SELECT ols.serial, ols.order_line_id, p.title AS model FROM order_line_serial ols
     JOIN order_line ol ON ol.id = ols.order_line_id JOIN device d ON d.serial = ols.serial
     JOIN product p ON p.id = d.product_id WHERE ol.order_id=$1 ORDER BY ols.serial`,
    [order.id]
  );
  const addr = order.shipping_address || {};
  const keepHref = `/orders/${order.number}?access_token=${encodeURIComponent(order.access_token || accessToken)}`;
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": `Order ${order.number}`, "active": "orders", "data-astro-cid-cxx6wafo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<article class="order" data-astro-cid-cxx6wafo> <header class="order-head" data-astro-cid-cxx6wafo> <h1 class="page-title" data-astro-cid-cxx6wafo>Order <span class="mono" data-astro-cid-cxx6wafo>${order.number}</span> ${order.status === "confirmed" ? "is confirmed." : "is being placed."}</h1> <p class="order-sub" data-astro-cid-cxx6wafo>${order.status === "confirmed" ? `We have emailed ${order.email}.` : "We are finishing the paperwork for this order."}</p> <span class="chip"${addAttribute(order.status === "confirmed" ? "finished" : "", "data-tone")} data-astro-cid-cxx6wafo>${orderStatusChip(order)}</span> </header> <section class="block" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>What you bought</h2> <table class="spec" data-astro-cid-cxx6wafo> <thead data-astro-cid-cxx6wafo><tr data-astro-cid-cxx6wafo><th scope="col" data-astro-cid-cxx6wafo>Item</th><th scope="col" class="num" data-astro-cid-cxx6wafo>Each</th><th scope="col" class="num" data-astro-cid-cxx6wafo>Qty</th><th scope="col" class="num" data-astro-cid-cxx6wafo>Total</th></tr></thead> <tbody data-astro-cid-cxx6wafo> ${lines.map((l) => renderTemplate`<tr data-astro-cid-cxx6wafo> <td data-astro-cid-cxx6wafo> ${l.title_snapshot} <span class="line-option" data-astro-cid-cxx6wafo>${l.option_snapshot}</span><br data-astro-cid-cxx6wafo> <span class="line-sku mono" data-astro-cid-cxx6wafo>${l.sku_snapshot}</span> ${serials.filter((s) => s.order_line_id === l.id).map((s) => renderTemplate`<span class="line-serial" data-astro-cid-cxx6wafo><span class="mono" data-astro-cid-cxx6wafo>${s.serial}</span> (${s.model})</span>`)} </td> <td class="num tnum" data-astro-cid-cxx6wafo>${money(l.unit_price_minor)}</td> <td class="num tnum" data-astro-cid-cxx6wafo>${l.quantity}</td> <td class="num tnum" data-astro-cid-cxx6wafo>${money(l.total_minor)}</td> </tr>`)} </tbody> </table> </section> <section class="block" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Totals</h2> <dl class="totals" data-astro-cid-cxx6wafo> <div class="sumrow" data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Subtotal</dt><dd class="tnum" data-astro-cid-cxx6wafo>${money(order.subtotal_minor)}</dd></div> <div class="sumrow" data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Delivery, ${order.shipping_method}</dt><dd class="tnum" data-astro-cid-cxx6wafo>${money(order.shipping_minor)}</dd></div> <div class="sumrow" data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Tax</dt><dd class="tnum" data-astro-cid-cxx6wafo>${money(order.tax_minor)}</dd></div> ${Number(order.discount_minor) > 0 && renderTemplate`<div class="sumrow" data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Discount</dt><dd class="tnum" data-astro-cid-cxx6wafo>−${money(order.discount_minor)}</dd></div>`} <div class="sumrow sumrow-total" data-astro-cid-cxx6wafo><dt data-astro-cid-cxx6wafo>Total</dt><dd class="tnum" data-astro-cid-cxx6wafo>${money(order.total_minor)} ${order.currency}</dd></div> </dl> </section> <section class="block" data-astro-cid-cxx6wafo> <h2 data-astro-cid-cxx6wafo>Where it goes</h2> <address class="addr" data-astro-cid-cxx6wafo> ${addr.name}<br data-astro-cid-cxx6wafo> ${addr.line1}${addr.line2 ? `, ${addr.line2}` : ""}<br data-astro-cid-cxx6wafo> ${addr.city}${addr.region ? `, ${addr.region}` : ""} ${addr.postal_code}<br data-astro-cid-cxx6wafo> ${addr.country} </address> </section> <p class="keep" data-astro-cid-cxx6wafo><a class="btn"${addAttribute(keepHref, "href")} data-astro-cid-cxx6wafo>Keep track of this order</a></p> <p class="keep-hint" data-astro-cid-cxx6wafo>Bookmark this link. It is the only way back to this order without an account.</p> </article> ` })} `;
}, "/app/src/pages/orders/[number].astro", void 0);

const $$file = "/app/src/pages/orders/[number].astro";
const $$url = "/orders/[number]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

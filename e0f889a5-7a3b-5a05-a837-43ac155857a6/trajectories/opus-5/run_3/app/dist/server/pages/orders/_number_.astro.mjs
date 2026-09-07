import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_5xqhq6uI.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../../chunks/server-fetch_DBHxzT0a.mjs';
import { o as orderChip, b as formatMoney, a as formatDateShort } from '../../chunks/app_BbZzWQ31.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const accessToken = Astro2.url.searchParams.get("access_token");
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
  const { ok, status, body } = await apiGet(
    `/api/orders/${encodeURIComponent(number)}${query}`,
    Astro2
  );
  if (!ok) return new Response(null, { status: status === 404 ? 404 : status });
  const order = body.order;
  const chip = orderChip(order);
  const goods = order.lines.filter((l) => l.kind !== "protection");
  order.lines.find((l) => l.kind === "protection");
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Order ${order.number} \u2014 Vela`, "current": "shop", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-cxx6wafo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-cxx6wafo> <h1 class="page-title" data-astro-cid-cxx6wafo>
Order <span class="order-number" data-astro-cid-cxx6wafo>${order.number}</span> is confirmed.
</h1> <p class="page-sub" data-astro-cid-cxx6wafo>We have emailed ${order.email}.</p> </div> <div class="row confirm-row" data-astro-cid-cxx6wafo> <span${addAttribute(`chip chip--${chip.tone}`, "class")} data-astro-cid-cxx6wafo>${chip.text}</span> <!-- Signed in, the order is in the account history; signed out, the
         address carrying the access token is the way back to it. --> <a class="btn"${addAttribute(customer ? `/account/orders/${order.number}` : Astro2.url.pathname + Astro2.url.search, "href")} data-astro-cid-cxx6wafo>
Keep track of this order
</a> </div> <div class="order-grid" data-astro-cid-cxx6wafo> <section class="panel" data-astro-cid-cxx6wafo> <h2 class="section-title" data-astro-cid-cxx6wafo>What you bought</h2> <table class="table" data-astro-cid-cxx6wafo> <thead data-astro-cid-cxx6wafo> <tr data-astro-cid-cxx6wafo> <th scope="col" data-astro-cid-cxx6wafo>Item</th> <th scope="col" class="right" data-astro-cid-cxx6wafo>Quantity</th> <th scope="col" class="right" data-astro-cid-cxx6wafo>Unit</th> <th scope="col" class="right" data-astro-cid-cxx6wafo>Total</th> </tr> </thead> <tbody data-astro-cid-cxx6wafo> ${goods.map((line) => renderTemplate`<tr data-astro-cid-cxx6wafo> <td data-astro-cid-cxx6wafo> ${line.title} <br data-astro-cid-cxx6wafo> <span class="mono small faint" data-astro-cid-cxx6wafo>${line.sku}</span> </td> <td class="right num" data-astro-cid-cxx6wafo>${line.quantity}</td> <td class="right money" data-astro-cid-cxx6wafo>${formatMoney(line.unit_price_minor)}</td> <td class="right money" data-astro-cid-cxx6wafo>${formatMoney(line.total_minor)}</td> </tr>`)} </tbody> </table> ${order.serials.length > 0 && renderTemplate`<div class="serials" data-astro-cid-cxx6wafo> <h3 data-astro-cid-cxx6wafo>Serial numbers</h3> <ul class="serial-list" role="list" data-astro-cid-cxx6wafo> ${order.serials.map((s) => renderTemplate`<li data-astro-cid-cxx6wafo> <span class="serial" data-astro-cid-cxx6wafo>${s.serial}</span> <span class="muted small" data-astro-cid-cxx6wafo> ${s.model}</span> </li>`)} </ul> </div>`} </section> <aside class="panel" data-astro-cid-cxx6wafo> <h2 class="section-title" data-astro-cid-cxx6wafo>Totals</h2> <dl class="totals" data-astro-cid-cxx6wafo> <div class="totals__row" data-astro-cid-cxx6wafo> <dt data-astro-cid-cxx6wafo>Subtotal</dt> <dd class="money" data-astro-cid-cxx6wafo>${formatMoney(order.subtotal_minor)}</dd> </div> <div class="totals__row" data-astro-cid-cxx6wafo> <dt data-astro-cid-cxx6wafo>Delivery (${order.shipping_method})</dt> <dd class="money" data-astro-cid-cxx6wafo>${formatMoney(order.shipping_minor)}</dd> </div> <div class="totals__row" data-astro-cid-cxx6wafo> <dt data-astro-cid-cxx6wafo>Tax</dt> <dd class="money" data-astro-cid-cxx6wafo>${formatMoney(order.tax_minor)}</dd> </div> <div class="totals__row totals__row--total" data-astro-cid-cxx6wafo> <dt data-astro-cid-cxx6wafo>Total</dt> <dd class="money strong" data-astro-cid-cxx6wafo>${formatMoney(order.total_minor)}</dd> </div> </dl> <h3 class="addr-head" data-astro-cid-cxx6wafo>Where it goes</h3> <p class="small muted addr" data-astro-cid-cxx6wafo> ${order.shipping_address.name}<br data-astro-cid-cxx6wafo> ${order.shipping_address.line1}<br data-astro-cid-cxx6wafo> ${order.shipping_address.city}, ${order.shipping_address.region}${" "} <span class="num" data-astro-cid-cxx6wafo>${order.shipping_address.postal_code}</span><br data-astro-cid-cxx6wafo> ${order.shipping_address.country} </p> <p class="small faint" data-astro-cid-cxx6wafo>
Placed <time${addAttribute(order.placed_at, "datetime")} data-astro-cid-cxx6wafo>${formatDateShort(order.placed_at)}</time> </p> </aside> </div> ` })} `;
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

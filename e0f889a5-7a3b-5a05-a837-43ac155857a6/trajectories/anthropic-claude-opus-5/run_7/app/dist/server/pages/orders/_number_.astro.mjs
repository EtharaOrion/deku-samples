import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { r as readOrderTokens, a as apiGet, f as formatDate, b as formatMinor } from '../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const v = await viewer(Astro2);
  const placed = Astro2.url.searchParams.get("placed") === "1";
  const held = readOrderTokens(Astro2);
  const accessToken = Astro2.url.searchParams.get("access_token") || held[number] || null;
  const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
  const res = await apiGet(Astro2.request, `/orders/${encodeURIComponent(number)}${query}`, { token: v.token });
  const order = res.ok ? res.data.order : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": order ? `Order ${order.number} \u2014 Vela` : "Order \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate`${!order ? renderTemplate`${maybeRenderHead()}<div> <h1 class="page-title">That order does not exist.</h1> <p class="page-lede">
The link may have expired, or the order may belong to a different account.
</p> <p><a class="btn btn-secondary" href="/shop">Go to the shop</a></p> </div>` : renderTemplate`<div> ${placed && renderTemplate`<div class="notice notice-done" role="status" style="margin-bottom:calc(var(--unit)*6)">  <p style="font-weight:700">
Order ${order.number} is confirmed. We have emailed ${order.email}.
</p> <p class="small" style="margin-top:calc(var(--unit)*2)"> <a class="btn btn-secondary btn-sm"${addAttribute(`/account/orders/${order.number}`, "href")}>Keep track of this order</a> </p> </div>`} <h1 class="page-title">
Order <span class="order-number">${order.number}</span> </h1> <p class="page-lede">
Placed ${formatDate(order.placed_at)}. <span class="chip">${order.state_phrase}</span> </p> <section class="section" aria-labelledby="lines-h"> <h2 class="section-title" id="lines-h">What you bought</h2> <table class="data" style="max-width:60rem"> <thead> <tr> <th scope="col">Item</th> <th scope="col">SKU</th> <th scope="col" class="num">Quantity</th> <th scope="col" class="num">Unit</th> <th scope="col" class="num">Total</th> </tr> </thead> <tbody> ${order.lines.map((l) => renderTemplate`<tr> <td>${l.title}</td> <td class="mono small">${l.sku}</td> <td class="num tnum">${l.quantity}</td> <td class="num money">${formatMinor(l.unit_price_minor)}</td> <td class="num money">${formatMinor(l.total_minor)}</td> </tr>`)} </tbody> <tfoot> <tr><th scope="row" colspan="4" style="font-weight:400">Subtotal</th><td class="num money">${formatMinor(order.subtotal_minor)}</td></tr> <tr><th scope="row" colspan="4" style="font-weight:400">Delivery (${order.shipping_method})</th><td class="num money">${formatMinor(order.shipping_minor)}</td></tr> <tr><th scope="row" colspan="4" style="font-weight:400">Tax</th><td class="num money">${formatMinor(order.tax_minor)}</td></tr> <tr><th scope="row" colspan="4">Total</th><td class="num money" style="font-weight:700">${formatMinor(order.total_minor)}</td></tr> </tfoot> </table> </section> ${order.serials.length > 0 && renderTemplate`<section class="section" aria-labelledby="serials-h"> <h2 class="section-title" id="serials-h">Serial numbers</h2> <p class="small muted" style="margin-bottom:calc(var(--unit)*3)">
This is the only place you will find these without the camera in hand.
</p> <table class="data" style="max-width:48rem"> <thead> <tr> <th scope="col">Serial</th> <th scope="col">Model</th> <th scope="col">Registered</th> </tr> </thead> <tbody> ${order.serials.map((s) => renderTemplate`<tr> <td class="serial">${s.serial}</td> <td>${s.model}</td> <td> ${s.registered ? renderTemplate`<span class="chip chip-done">Registered</span>` : renderTemplate`<a class="btn btn-secondary btn-sm"${addAttribute(`/account/cameras?serial=${encodeURIComponent(s.serial)}`, "href")}>
Register this camera
</a>`} </td> </tr>`)} </tbody> </table> </section>`} <section class="section" aria-labelledby="addr-h"> <h2 class="section-title" id="addr-h">Where it goes</h2> <p class="small">${order.shipping_address.name}</p> <p class="small muted">${order.shipping_address.line1}</p> ${order.shipping_address.line2 && renderTemplate`<p class="small muted">${order.shipping_address.line2}</p>`} <p class="small muted"> ${order.shipping_address.city}, ${order.shipping_address.region}${" "} <span class="tnum">${order.shipping_address.postal_code}</span> </p> <p class="small muted">${order.shipping_address.country}</p> <p class="small muted" style="margin-top:calc(var(--unit)*2)">${order.email}</p> </section> </div>`}` })}`;
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

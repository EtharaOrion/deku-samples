import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, F as Fragment, a as addAttribute } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSteps_CH1hcmWt.mjs';
import { a as apiGet, c as formatMoney } from '../../chunks/api_eUbQd3xF.mjs';
/* empty css                                      */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Payment = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Payment;
  const viewer = await viewerFor(Astro2.request);
  const result = await apiGet(Astro2.request, "/cart");
  const cart = result.ok ? result.data : null;
  const goods = (cart?.lines || []).filter((l) => l.kind !== "protection");
  if (cart && goods.length === 0) {
    return new Response(null, { status: 302, headers: { location: "/cart" } });
  }
  if (cart && (!cart.email || !cart.shipping_address)) {
    return new Response(null, { status: 302, headers: { location: "/checkout/where-it-goes" } });
  }
  if (cart && !cart.shipping_method) {
    return new Response(null, { status: 302, headers: { location: "/checkout/how-it-gets-there" } });
  }
  const a = cart?.shipping_address || {};
  const methodLabel = cart?.shipping_method === "express" ? "Express" : "Standard";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Payment \u2014 Vela", "current": "shop", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-j4t6opjn": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-j4t6opjn>Payment</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 3, "data-astro-cid-j4t6opjn": true })} <div class="layout" data-astro-cid-j4t6opjn> <div class="review" data-astro-cid-j4t6opjn> <section class="review-block" data-astro-cid-j4t6opjn> <h2 data-astro-cid-j4t6opjn>Where it goes</h2> <address data-astro-cid-j4t6opjn> ${a.name}<br data-astro-cid-j4t6opjn> ${a.line1}${a.line2 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-j4t6opjn": true }, { "default": async ($$result3) => renderTemplate`<br data-astro-cid-j4t6opjn>${a.line2}` })}` : null}<br data-astro-cid-j4t6opjn> ${a.city}, ${a.region} <span class="tnum" data-astro-cid-j4t6opjn>${a.postal_code}</span><br data-astro-cid-j4t6opjn> ${a.country} </address> <p class="review-email" data-astro-cid-j4t6opjn>${cart?.email}</p> <a class="btn btn-quiet btn-small" href="/checkout/where-it-goes" data-astro-cid-j4t6opjn>Change</a> </section> <section class="review-block" data-astro-cid-j4t6opjn> <h2 data-astro-cid-j4t6opjn>How it gets there</h2> <p data-astro-cid-j4t6opjn>${methodLabel}</p> <a class="btn btn-quiet btn-small" href="/checkout/how-it-gets-there" data-astro-cid-j4t6opjn>Change</a> </section> <section class="review-block total-block" data-astro-cid-j4t6opjn> <h2 data-astro-cid-j4t6opjn>The total</h2> <!-- The total authorized is the figure this step shows. --> <p class="grand tnum" data-final-total${addAttribute(cart?.total_minor, "data-total-minor")} data-astro-cid-j4t6opjn>${formatMoney(cart?.total_minor ?? 0)}</p> <p class="note" data-astro-cid-j4t6opjn>There is no card to enter. We raise an invoice for this amount and send it to you.</p> </section> <p class="form-error" data-error role="alert" data-astro-cid-j4t6opjn></p> <button class="btn place" type="button" data-place data-astro-cid-j4t6opjn>Place the order</button> <p class="placing" data-placing role="status" aria-live="polite" data-astro-cid-j4t6opjn></p> </div> ${cart && renderTemplate`${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "exact": true, "data-astro-cid-j4t6opjn": true })}`} </div> ` })}  `;
}, "/app/src/pages/checkout/payment.astro", void 0);

const $$file = "/app/src/pages/checkout/payment.astro";
const $$url = "/checkout/payment";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Payment,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

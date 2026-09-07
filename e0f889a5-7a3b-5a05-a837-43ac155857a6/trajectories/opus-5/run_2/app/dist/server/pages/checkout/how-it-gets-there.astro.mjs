import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSteps_CH1hcmWt.mjs';
import { a as apiGet, c as formatMoney } from '../../chunks/api_eUbQd3xF.mjs';
/* empty css                                                */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$HowItGetsThere = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HowItGetsThere;
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
  const chosen = cart?.shipping_method || "";
  const methods = [
    { code: "standard", label: "Standard", price_minor: 0, window: "Arrives in 5 to 7 days" },
    { code: "express", label: "Express", price_minor: 2500, window: "Arrives in 2 days" }
  ];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "How it gets there \u2014 Vela", "current": "shop", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-pa2nskyo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-pa2nskyo>How it gets there</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 2, "data-astro-cid-pa2nskyo": true })} <div class="layout" data-astro-cid-pa2nskyo> <form class="form" data-step-two novalidate data-astro-cid-pa2nskyo> <fieldset class="methods" data-astro-cid-pa2nskyo> <legend data-astro-cid-pa2nskyo>Delivery</legend> ${methods.map((m) => renderTemplate`<label class="method" data-astro-cid-pa2nskyo> <input type="radio" name="shipping_method"${addAttribute(m.code, "value")}${addAttribute(chosen === m.code, "checked")} data-astro-cid-pa2nskyo> <span class="method-main" data-astro-cid-pa2nskyo> <span class="method-label" data-astro-cid-pa2nskyo>${m.label}</span> <span class="method-window" data-astro-cid-pa2nskyo>${m.window}</span> </span> <span class="method-price tnum" data-astro-cid-pa2nskyo>${m.price_minor === 0 ? "Free" : formatMoney(m.price_minor)}</span> </label>`)} </fieldset> <p class="form-error" data-error role="alert" data-astro-cid-pa2nskyo></p> <div class="actions" data-astro-cid-pa2nskyo> <a class="btn btn-secondary" href="/checkout/where-it-goes" data-astro-cid-pa2nskyo>Back</a> <button class="btn" type="submit" data-submit data-astro-cid-pa2nskyo>Continue to payment</button> </div> </form> ${cart && renderTemplate`${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "data-astro-cid-pa2nskyo": true })}`} </div> ` })}  `;
}, "/app/src/pages/checkout/how-it-gets-there.astro", void 0);

const $$file = "/app/src/pages/checkout/how-it-gets-there.astro";
const $$url = "/checkout/how-it-gets-there";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$HowItGetsThere,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

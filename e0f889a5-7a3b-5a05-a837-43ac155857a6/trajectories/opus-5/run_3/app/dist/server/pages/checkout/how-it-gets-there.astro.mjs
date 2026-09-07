import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_5xqhq6uI.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_D1__LMg2.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../../chunks/server-fetch_DBHxzT0a.mjs';
import { a as redirectKeeping } from '../../chunks/guard_CgiEvtXQ.mjs';
import { D as DELIVERY_METHODS, b as formatMoney } from '../../chunks/app_BbZzWQ31.mjs';
/* empty css                                                */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$HowItGetsThere = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HowItGetsThere;
  const customer = await pageCustomer(Astro2);
  let cart = await pageCart(Astro2);
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const method = String(form.get("shipping_method") ?? "");
    if (!method) {
      error = "Choose how it gets there.";
    } else {
      const res = await apiGet("/api/cart/delivery", Astro2, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shipping_method: method })
      });
      if (res.ok) return redirectKeeping(Astro2, "/checkout/payment");
      error = res.body?.message || "That did not work.";
    }
  }
  const empty = !cart || cart.lines.length === 0;
  if (!empty && !cart.shipping_address) {
    return redirectKeeping(Astro2, "/checkout/where-it-goes");
  }
  const chosen = cart?.shipping_method ?? "";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "How it gets there \u2014 Vela", "current": "shop", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-pa2nskyo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-pa2nskyo> <h1 class="page-title" data-astro-cid-pa2nskyo>How it gets there</h1> </div> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 2, "data-astro-cid-pa2nskyo": true })} ${empty ? renderTemplate`<div class="empty" data-astro-cid-pa2nskyo> <p data-astro-cid-pa2nskyo>Your cart is empty.</p> <p data-astro-cid-pa2nskyo> <a href="/shop" data-astro-cid-pa2nskyo>Shop</a> </p> </div>` : renderTemplate`<div class="checkout" data-astro-cid-pa2nskyo> <form class="checkout__form" method="POST" data-astro-cid-pa2nskyo> ${error && renderTemplate`<div class="notice notice--error" role="alert" data-astro-cid-pa2nskyo> <span class="notice__body" data-astro-cid-pa2nskyo>${error}</span> </div>`} <fieldset class="methods" data-astro-cid-pa2nskyo> <legend class="field__label" data-astro-cid-pa2nskyo>Delivery method</legend> ${DELIVERY_METHODS.map((method) => renderTemplate`<label class="radio-card" data-astro-cid-pa2nskyo> <input type="radio" name="shipping_method"${addAttribute(method.code, "value")}${addAttribute(chosen === method.code, "checked")} required data-astro-cid-pa2nskyo> <span class="method" data-astro-cid-pa2nskyo> <span class="method__head" data-astro-cid-pa2nskyo> <span class="strong" data-astro-cid-pa2nskyo>${method.code}</span> <span class="money" data-astro-cid-pa2nskyo>${formatMoney(method.price_minor)}</span> </span> <span class="small muted" data-astro-cid-pa2nskyo>${method.window}</span> </span> </label>`)} </fieldset> <div class="row" data-astro-cid-pa2nskyo> <a class="btn btn--secondary" href="/checkout/where-it-goes" data-astro-cid-pa2nskyo>
Back
</a> <button class="btn" type="submit" data-astro-cid-pa2nskyo>Continue to payment</button> </div> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "data-astro-cid-pa2nskyo": true })} </div>`}` })} `;
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSteps_BceEfKe0.mjs';
import { a as apiGet, c as apiSend, b as formatMinor } from '../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$HowItGetsThere = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HowItGetsThere;
  const v = await viewer(Astro2);
  const res = v.cartToken ? await apiGet(Astro2.request, "/cart", { cartToken: v.cartToken }) : null;
  let cart = res && res.ok ? res.data.cart : null;
  const methods = res && res.ok ? res.data.delivery_methods : [];
  if (!cart || cart.lines.length === 0) {
    return new Response(null, { status: 302, headers: { location: "/cart" } });
  }
  if (!cart.email || !cart.shipping_address) {
    return new Response(null, { status: 302, headers: { location: "/checkout/where-it-goes" } });
  }
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const method = String(form.get("shipping_method") || "");
    if (!method) {
      error = "Choose a delivery method.";
    } else {
      const save = await apiSend(Astro2.request, "/cart/delivery", {
        cartToken: v.cartToken,
        body: { shipping_method: method }
      });
      if (save.ok) return Astro2.redirect("/checkout/payment", 303);
      error = "That did not work. Choose a delivery method and try again.";
    }
  }
  const chosen = cart.shipping_method;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "How it gets there \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">How it gets there</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "current": 2 })} <div class="checkout-layout"> <form method="post"> ${error && renderTemplate`<div class="notice notice-danger" role="alert"><p>${error}</p></div>`} <fieldset style="border:0;padding:0;margin:0 0 calc(var(--unit)*6)"> <legend class="label" style="font-weight:700;font-size:14px;padding:0;margin-bottom:calc(var(--unit)*3)">
Delivery method
</legend> <div class="stack"> ${methods.map((m) => renderTemplate`<label class="card row" style="gap:calc(var(--unit)*3);cursor:pointer;align-items:flex-start;flex-wrap:nowrap"> <input type="radio" name="shipping_method"${addAttribute(m.code, "value")}${addAttribute(chosen === m.code, "checked")} required style="margin-top:4px"> <span style="flex:1"> <span class="row-between"> <span style="font-weight:700">${m.title}</span> <span class="money">${formatMinor(m.price_minor)}</span> </span> <span class="small muted" style="display:block;margin-top:var(--unit)">${m.window_text}</span> </span> </label>`)} </div> </fieldset> <div class="row" style="gap:calc(var(--unit)*3)"> <button type="submit" class="btn">Continue to payment</button> <a class="btn-quiet" href="/checkout/where-it-goes">Back</a> </div> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart })} </div> ` })}`;
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

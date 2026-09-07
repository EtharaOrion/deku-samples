import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_DlpHX4x4.mjs';
import { a as apiFetch, f as formatMinor } from '../../chunks/api_-Wd5sQnB.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$HowItGetsThere = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HowItGetsThere;
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const method = String(form.get("shipping_method") || "");
    if (!method) {
      error = "Choose a delivery method.";
    } else {
      const res = await apiFetch(Astro2, "/api/cart/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_method: method })
      });
      if (res.status === 200) return Astro2.redirect("/checkout/payment", 303);
      error = res.data?.message || "That did not work.";
    }
  }
  const [cartRes, methodsRes] = await Promise.all([
    apiFetch(Astro2, "/api/cart"),
    apiFetch(Astro2, "/api/shipping-methods")
  ]);
  const cart = cartRes.status === 200 ? cartRes.data : null;
  if (!cart || cart.lines.length === 0) return Astro2.redirect("/cart", 303);
  if (!cart.shipping_address) return Astro2.redirect("/checkout/where-it-goes", 303);
  const methods = methodsRes.status === 200 ? methodsRes.data.data : [];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "How it gets there", "current": "shop" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"><h1>How it gets there</h1></div> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 2 })} <div class="checkout-layout"> <form method="POST"> ${error && renderTemplate`<p class="notice notice-wrong" role="alert">${error}</p>`} <fieldset style="border: 0; padding: 0; margin: 0"> <legend class="vh">Delivery method</legend> ${methods.map((m) => renderTemplate`<label class="method"> <input type="radio" name="shipping_method"${addAttribute(m.code, "value")}${addAttribute(cart.shipping_method === m.code, "checked")} required> <span class="method-body"> <span class="method-name">${m.label}</span><br> <span class="method-window">${m.window_text}</span> </span> <span class="method-price money">${formatMinor(m.price_minor)}</span> </label>`)} </fieldset> <p class="muted small">Going to ${cart.shipping_address.city}, ${cart.shipping_address.region} ${cart.shipping_address.postal_code}. <a href="/checkout/where-it-goes">Change the address</a>.</p> <button type="submit" class="btn" style="margin-top: 1rem">Continue to payment</button> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "exact": !!cart.shipping_method })} </div> ` })}`;
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

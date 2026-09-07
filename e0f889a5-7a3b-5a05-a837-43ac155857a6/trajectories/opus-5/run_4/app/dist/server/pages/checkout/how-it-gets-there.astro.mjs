import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_CvfgCW3U.mjs';
import { C as CART_COOKIE, f as findCartByToken, e as setDelivery, d as currentCart, g as shippingMethods } from '../../chunks/server_SMyiD-DF.mjs';
import { a as formatMinor } from '../../chunks/format_y0Y9nLbA.mjs';
/* empty css                                                */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$HowItGetsThere = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HowItGetsThere;
  let errorMessage = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const token = Astro2.cookies.get(CART_COOKIE)?.value;
    const cartRow = token ? await findCartByToken(token) : null;
    if (!cartRow) return Astro2.redirect("/cart");
    try {
      await setDelivery(cartRow, { shipping_method: form.get("shipping_method") });
      return Astro2.redirect("/checkout/payment");
    } catch (err) {
      errorMessage = err.message || "Choose a delivery method.";
    }
  }
  const cart = await currentCart(Astro2);
  if (!cart || !cart.lines.length) return Astro2.redirect("/cart");
  if (!cart.email || !cart.shipping_address) return Astro2.redirect("/checkout/where-it-goes");
  const methods = await shippingMethods();
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "How it gets there \u2014 Vela", "description": "Delivery method.", "data-astro-cid-pa2nskyo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-6" data-astro-cid-pa2nskyo> <h1 data-astro-cid-pa2nskyo>Check out</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "current": "how", "data-astro-cid-pa2nskyo": true })} <div class="checkout-grid" data-astro-cid-pa2nskyo> <form method="post" class="form" data-astro-cid-pa2nskyo> <h2 data-astro-cid-pa2nskyo>How it gets there</h2> ${errorMessage && renderTemplate`<p class="notice notice-danger" role="alert" data-astro-cid-pa2nskyo>${errorMessage}</p>`} <fieldset class="methods" data-astro-cid-pa2nskyo> <legend class="visually-hidden" data-astro-cid-pa2nskyo>Delivery method</legend> ${methods.map((method) => renderTemplate`<label${addAttribute(["method", { selected: cart.shipping_method === method.code }], "class:list")} data-astro-cid-pa2nskyo> <input type="radio" name="shipping_method"${addAttribute(method.code, "value")}${addAttribute(cart.shipping_method === method.code, "checked")} required data-astro-cid-pa2nskyo> <span class="method-body" data-astro-cid-pa2nskyo> <span class="method-title" data-astro-cid-pa2nskyo>${method.title}</span> <span class="hint" data-astro-cid-pa2nskyo>${method.window_text}</span> </span> <span class="money tnum" data-astro-cid-pa2nskyo>${formatMinor(method.price_minor)}</span> </label>`)} </fieldset> <div class="row" data-astro-cid-pa2nskyo> <a class="btn" href="/checkout/where-it-goes" data-astro-cid-pa2nskyo>Back</a> <button class="btn btn-primary" type="submit" data-astro-cid-pa2nskyo>Continue to payment</button> </div> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "data-astro-cid-pa2nskyo": true })} </div> </div> ` })} `;
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

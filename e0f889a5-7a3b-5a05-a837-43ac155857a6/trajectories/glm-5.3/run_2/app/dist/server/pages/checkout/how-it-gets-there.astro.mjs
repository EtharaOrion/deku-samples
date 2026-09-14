import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { $ as $$CheckoutSummary } from "../../chunks/CheckoutSummary_D2HoMnhz.mjs";
import { g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
import { m as money } from "../../chunks/format_F6jgEW4F.mjs";
/* empty css                                                */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$HowItGetsThere = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HowItGetsThere;
  const cart = await getCartForContext(Astro2);
  if (!cart || cart.view.lines.length === 0) return Astro2.redirect("/cart");
  const view = cart.view;
  if (!view.email) return Astro2.redirect("/checkout/where-it-goes");
  const cartCount = view.lines.reduce((s, l) => s + l.quantity, 0);
  const methods = [
    { name: "Standard", price: 0, window: "5 to 7 days" },
    { name: "Express", price: 2500, window: "2 days" }
  ];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "How it gets there — Vela", "active": "", "cartCount": cartCount, "data-astro-cid-pa2nskyo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-pa2nskyo> <h1 data-astro-cid-pa2nskyo>How it gets there</h1> <p class="lede" data-astro-cid-pa2nskyo>Step two of three. Nothing is chosen yet.</p> </div> <div class="checkout-layout" data-astro-cid-pa2nskyo> <form class="card step-form" data-astro-cid-pa2nskyo> <fieldset class="methods" data-astro-cid-pa2nskyo> <legend data-astro-cid-pa2nskyo>Delivery method</legend> <div class="method-list" role="radiogroup" aria-label="Delivery method" data-astro-cid-pa2nskyo> ${methods.map((m) => renderTemplate`<label class="method" data-astro-cid-pa2nskyo> <input type="radio" name="shipping_method"${addAttribute(m.name, "value")}${addAttribute(view.shipping_method === m.name, "checked")}${addAttribute(m.name, "data-method")}${addAttribute(m.price, "data-price")} data-astro-cid-pa2nskyo> <span class="method-body" data-astro-cid-pa2nskyo> <span class="method-name" data-astro-cid-pa2nskyo>${m.name}</span> <span class="method-window" data-astro-cid-pa2nskyo>${m.window}</span> </span> <span class="num method-price" data-astro-cid-pa2nskyo>${money(m.price)}</span> </label>`)} </div> </fieldset> <p class="inline-error" data-form-error hidden data-astro-cid-pa2nskyo></p> <button class="btn btn-primary" type="submit" data-astro-cid-pa2nskyo>Continue to payment</button> <a class="btn" href="/checkout/where-it-goes" data-astro-cid-pa2nskyo>Back</a> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "view": view, "step": 2, "data-astro-cid-pa2nskyo": true })} </div> ` })}  `;
}, "/app/src/pages/checkout/how-it-gets-there.astro", void 0);
const $$file = "/app/src/pages/checkout/how-it-gets-there.astro";
const $$url = "/checkout/how-it-gets-there";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$HowItGetsThere,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

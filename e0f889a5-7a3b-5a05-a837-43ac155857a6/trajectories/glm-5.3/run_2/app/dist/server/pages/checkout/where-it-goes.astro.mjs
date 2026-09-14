import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { $ as $$CheckoutSummary } from "../../chunks/CheckoutSummary_D2HoMnhz.mjs";
import { g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
/* empty css                                            */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$WhereItGoes = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WhereItGoes;
  const cart = await getCartForContext(Astro2);
  if (!cart || cart.view.lines.length === 0) return Astro2.redirect("/cart");
  const view = cart.view;
  const address = view.shipping_address || {};
  const cartCount = view.lines.reduce((s, l) => s + l.quantity, 0);
  const value = (k) => address[k] ?? "";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Where it goes — Vela", "active": "", "cartCount": cartCount, "data-astro-cid-25lwhesj": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-25lwhesj> <h1 data-astro-cid-25lwhesj>Where it goes</h1> <p class="lede" data-astro-cid-25lwhesj>Step one of three.</p> </div> <div class="checkout-layout" data-astro-cid-25lwhesj> <form class="card step-form" method="post" action="/checkout/where-it-goes" novalidate data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="email" data-astro-cid-25lwhesj>Email</label> <input id="email" name="email" type="email" required autocomplete="email"${addAttribute(view.email || "", "value")} data-persist="email" data-astro-cid-25lwhesj> </div> <label class="consent" data-astro-cid-25lwhesj> <input type="checkbox" name="marketing" data-astro-cid-25lwhesj> <span data-astro-cid-25lwhesj>Email me when there is news about my camera. Not marketing.</span> </label> <div class="field" data-astro-cid-25lwhesj> <label for="name" data-astro-cid-25lwhesj>Name</label> <input id="name" name="name" required autocomplete="name"${addAttribute(value("name"), "value")} data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="line1" data-astro-cid-25lwhesj>Address</label> <input id="line1" name="line1" required autocomplete="address-line1"${addAttribute(value("line1"), "value")} data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="line2" data-astro-cid-25lwhesj>Address line 2 <span class="opt" data-astro-cid-25lwhesj>(optional)</span></label> <input id="line2" name="line2" autocomplete="address-line2"${addAttribute(value("line2"), "value")} data-astro-cid-25lwhesj> </div> <div class="grid-2" data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="city" data-astro-cid-25lwhesj>City</label> <input id="city" name="city" required autocomplete="address-level2"${addAttribute(value("city"), "value")} data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="region" data-astro-cid-25lwhesj>Region</label> <input id="region" name="region" autocomplete="address-level1"${addAttribute(value("region"), "value")} data-astro-cid-25lwhesj> </div> </div> <div class="grid-2" data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="postal_code" data-astro-cid-25lwhesj>Postal code</label> <input id="postal_code" name="postal_code" required autocomplete="postal-code"${addAttribute(value("postal_code"), "value")} data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="country" data-astro-cid-25lwhesj>Country</label> <select id="country" name="country" required autocomplete="country" data-astro-cid-25lwhesj> <option value="US"${addAttribute(value("country") === "US" || !value("country"), "selected")} data-astro-cid-25lwhesj>United States</option> </select> </div> </div> <div class="field" data-astro-cid-25lwhesj> <label for="phone" data-astro-cid-25lwhesj>Phone <span class="opt" data-astro-cid-25lwhesj>(optional)</span></label> <input id="phone" name="phone" type="tel" autocomplete="tel"${addAttribute(value("phone"), "value")} data-astro-cid-25lwhesj> </div> <p class="inline-error" data-form-error hidden data-astro-cid-25lwhesj></p> <button class="btn btn-primary" type="submit" data-astro-cid-25lwhesj>Continue to delivery</button> <a class="btn" href="/cart" data-astro-cid-25lwhesj>Back to the cart</a> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "view": view, "step": 1, "data-astro-cid-25lwhesj": true })} </div> ` })}  `;
}, "/app/src/pages/checkout/where-it-goes.astro", void 0);
const $$file = "/app/src/pages/checkout/where-it-goes.astro";
const $$url = "/checkout/where-it-goes";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$WhereItGoes,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSteps_CH1hcmWt.mjs';
import { a as apiGet } from '../../chunks/api_eUbQd3xF.mjs';
/* empty css                                            */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$WhereItGoes = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WhereItGoes;
  const viewer = await viewerFor(Astro2.request);
  const result = await apiGet(Astro2.request, "/cart");
  const cart = result.ok ? result.data : null;
  const goods = (cart?.lines || []).filter((l) => l.kind !== "protection");
  if (cart && goods.length === 0) {
    return new Response(null, { status: 302, headers: { location: "/cart" } });
  }
  const a = cart?.shipping_address || {};
  const email = cart?.email || viewer.customer?.email || "";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Where it goes \u2014 Vela", "current": "shop", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-25lwhesj": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-25lwhesj>Where it goes</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 1, "data-astro-cid-25lwhesj": true })} <div class="layout" data-astro-cid-25lwhesj> <form class="form" data-step-one novalidate data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="email" data-astro-cid-25lwhesj>Email</label> <input id="email" name="email" type="email" autocomplete="email"${addAttribute(email, "value")} required data-astro-cid-25lwhesj> <p class="hint" data-astro-cid-25lwhesj>We send the confirmation here.</p> </div> <label class="check" data-astro-cid-25lwhesj> <input type="checkbox" name="marketing_consent"${addAttribute(Boolean(cart?.marketing_consent), "checked")} data-astro-cid-25lwhesj> <span data-astro-cid-25lwhesj>Send me occasional mail about new cameras and firmware.</span> </label> <div class="field" data-astro-cid-25lwhesj> <label for="name" data-astro-cid-25lwhesj>Name</label> <input id="name" name="name" type="text" autocomplete="name"${addAttribute(a.name || viewer.customer?.name || "", "value")} required data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="line1" data-astro-cid-25lwhesj>Address</label> <input id="line1" name="line1" type="text" autocomplete="address-line1"${addAttribute(a.line1 || "", "value")} required data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="line2" data-astro-cid-25lwhesj>Address line 2</label> <input id="line2" name="line2" type="text" autocomplete="address-line2"${addAttribute(a.line2 || "", "value")} data-astro-cid-25lwhesj> </div> <div class="pair" data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="city" data-astro-cid-25lwhesj>City</label> <input id="city" name="city" type="text" autocomplete="address-level2"${addAttribute(a.city || "", "value")} required data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="region" data-astro-cid-25lwhesj>Region</label> <input id="region" name="region" type="text" autocomplete="address-level1"${addAttribute(a.region || "", "value")} required data-astro-cid-25lwhesj> </div> </div> <div class="pair" data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="postal_code" data-astro-cid-25lwhesj>Postal code</label> <input id="postal_code" name="postal_code" type="text" autocomplete="postal-code" class="tnum"${addAttribute(a.postal_code || "", "value")} required data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="country" data-astro-cid-25lwhesj>Country</label> <select id="country" name="country" autocomplete="country" data-astro-cid-25lwhesj> <option value="US"${addAttribute((a.country || "US") === "US", "selected")} data-astro-cid-25lwhesj>United States</option> </select> </div> </div> <div class="field" data-astro-cid-25lwhesj> <label for="phone" data-astro-cid-25lwhesj>Phone (optional)</label> <input id="phone" name="phone" type="tel" autocomplete="tel" class="tnum"${addAttribute(a.phone || "", "value")} data-astro-cid-25lwhesj> </div> <p class="form-error" data-error role="alert" data-astro-cid-25lwhesj></p> <div class="actions" data-astro-cid-25lwhesj> <a class="btn btn-secondary" href="/cart" data-astro-cid-25lwhesj>Back to cart</a> <button class="btn" type="submit" data-submit data-astro-cid-25lwhesj>Continue to delivery</button> </div> </form> ${cart && renderTemplate`${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "data-astro-cid-25lwhesj": true })}`} </div> ` })}  `;
}, "/app/src/pages/checkout/where-it-goes.astro", void 0);

const $$file = "/app/src/pages/checkout/where-it-goes.astro";
const $$url = "/checkout/where-it-goes";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$WhereItGoes,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

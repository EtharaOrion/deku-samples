import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_CvfgCW3U.mjs';
import { C as CART_COOKIE, f as findCartByToken, e as setDelivery, d as currentCart, c as currentCustomer } from '../../chunks/server_SMyiD-DF.mjs';
/* empty css                                            */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$WhereItGoes = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WhereItGoes;
  let errorMessage = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const token = Astro2.cookies.get(CART_COOKIE)?.value;
    const cartRow = token ? await findCartByToken(token) : null;
    if (!cartRow) {
      return Astro2.redirect("/cart");
    }
    try {
      await setDelivery(cartRow, {
        email: form.get("email"),
        marketing_consent: form.get("marketing_consent") === "on",
        shipping_address: {
          name: form.get("name"),
          line1: form.get("line1"),
          line2: form.get("line2"),
          city: form.get("city"),
          region: form.get("region"),
          postal_code: form.get("postal_code"),
          country: form.get("country") || "US",
          phone: form.get("phone")
        }
      });
      return Astro2.redirect("/checkout/how-it-gets-there");
    } catch (err) {
      errorMessage = err.message || "That did not work.";
      err.extra?.field || null;
    }
  }
  const cart = await currentCart(Astro2);
  if (!cart || !cart.lines.length) {
    return Astro2.redirect("/cart");
  }
  const customer = await currentCustomer(Astro2);
  const address = cart.shipping_address || {};
  const email = cart.email || customer?.email || "";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Where it goes \u2014 Vela", "description": "Contact and address.", "data-astro-cid-25lwhesj": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-6" data-astro-cid-25lwhesj> <h1 data-astro-cid-25lwhesj>Check out</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "current": "where", "data-astro-cid-25lwhesj": true })} <div class="checkout-grid" data-astro-cid-25lwhesj> <form method="post" class="form" novalidate data-astro-cid-25lwhesj> <h2 data-astro-cid-25lwhesj>Where it goes</h2> ${errorMessage && renderTemplate`<p class="notice notice-danger" role="alert" data-astro-cid-25lwhesj>${errorMessage}</p>`} <div class="field" data-astro-cid-25lwhesj> <label for="email" data-astro-cid-25lwhesj>Email</label> <input class="input" id="email" name="email" type="email"${addAttribute(email, "value")} required autocomplete="email" aria-describedby="email-hint" data-astro-cid-25lwhesj> <span class="hint" id="email-hint" data-astro-cid-25lwhesj>We send the confirmation here.</span> </div> <label class="check" data-astro-cid-25lwhesj> <input type="checkbox" name="marketing_consent"${addAttribute(Boolean(cart.marketing_consent), "checked")} data-astro-cid-25lwhesj> <span data-astro-cid-25lwhesj>Send me the occasional note about what we are building.</span> </label> <div class="field" data-astro-cid-25lwhesj> <label for="name" data-astro-cid-25lwhesj>Name</label> <input class="input" id="name" name="name"${addAttribute(address.name || customer?.name || "", "value")} required autocomplete="name" data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="line1" data-astro-cid-25lwhesj>Address</label> <input class="input" id="line1" name="line1"${addAttribute(address.line1 || "", "value")} required autocomplete="address-line1" data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="line2" data-astro-cid-25lwhesj>Address line two <span class="hint" data-astro-cid-25lwhesj>optional</span></label> <input class="input" id="line2" name="line2"${addAttribute(address.line2 || "", "value")} autocomplete="address-line2" data-astro-cid-25lwhesj> </div> <div class="pair" data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="city" data-astro-cid-25lwhesj>City</label> <input class="input" id="city" name="city"${addAttribute(address.city || "", "value")} required autocomplete="address-level2" data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="region" data-astro-cid-25lwhesj>Region</label> <input class="input" id="region" name="region"${addAttribute(address.region || "", "value")} required autocomplete="address-level1" data-astro-cid-25lwhesj> </div> </div> <div class="pair" data-astro-cid-25lwhesj> <div class="field" data-astro-cid-25lwhesj> <label for="postal_code" data-astro-cid-25lwhesj>Postal code</label> <input class="input tnum" id="postal_code" name="postal_code"${addAttribute(address.postal_code || "", "value")} required autocomplete="postal-code" data-astro-cid-25lwhesj> </div> <div class="field" data-astro-cid-25lwhesj> <label for="country" data-astro-cid-25lwhesj>Country</label> <select class="input" id="country" name="country" autocomplete="country" data-astro-cid-25lwhesj> <option value="US" selected data-astro-cid-25lwhesj>United States</option> </select> </div> </div> <div class="field" data-astro-cid-25lwhesj> <label for="phone" data-astro-cid-25lwhesj>Phone <span class="hint" data-astro-cid-25lwhesj>optional</span></label> <input class="input tnum" id="phone" name="phone" type="tel"${addAttribute(address.phone || "", "value")} autocomplete="tel" data-astro-cid-25lwhesj> </div> <button class="btn btn-primary" type="submit" data-astro-cid-25lwhesj>Continue to delivery</button> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "data-astro-cid-25lwhesj": true })} </div> </div> ` })} `;
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

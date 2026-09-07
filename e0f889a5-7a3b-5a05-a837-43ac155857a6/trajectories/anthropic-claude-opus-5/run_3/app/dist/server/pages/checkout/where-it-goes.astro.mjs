import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_5xqhq6uI.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_D1__LMg2.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../../chunks/server-fetch_DBHxzT0a.mjs';
import { a as redirectKeeping } from '../../chunks/guard_CgiEvtXQ.mjs';
/* empty css                                            */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$WhereItGoes = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WhereItGoes;
  const customer = await pageCustomer(Astro2);
  let cart = await pageCart(Astro2);
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const payload = {
      email: String(form.get("email") ?? "").trim(),
      marketing_consent: form.get("marketing_consent") === "on",
      shipping_address: {
        name: String(form.get("name") ?? ""),
        line1: String(form.get("line1") ?? ""),
        line2: String(form.get("line2") ?? ""),
        city: String(form.get("city") ?? ""),
        region: String(form.get("region") ?? ""),
        postal_code: String(form.get("postal_code") ?? ""),
        country: String(form.get("country") ?? "US"),
        phone: String(form.get("phone") ?? "")
      }
    };
    const res = await apiGet("/api/cart/delivery", Astro2, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return redirectKeeping(Astro2, "/checkout/how-it-gets-there");
    }
    error = res.body?.message || "That did not work.";
    cart = { ...cart, email: payload.email, shipping_address: payload.shipping_address };
  }
  const address = cart?.shipping_address ?? {};
  const email = cart?.email ?? customer?.email ?? "";
  const empty = !cart || cart.lines.length === 0;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Where it goes \u2014 Vela", "current": "shop", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-25lwhesj": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-25lwhesj> <h1 class="page-title" data-astro-cid-25lwhesj>Where it goes</h1> </div> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 1, "data-astro-cid-25lwhesj": true })} ${empty ? renderTemplate`<div class="empty" data-astro-cid-25lwhesj> <p data-astro-cid-25lwhesj>Your cart is empty.</p> <p data-astro-cid-25lwhesj> <a href="/shop" data-astro-cid-25lwhesj>Shop</a> </p> </div>` : renderTemplate`<div class="checkout" data-astro-cid-25lwhesj> <form class="checkout__form" method="POST" data-astro-cid-25lwhesj> ${error && renderTemplate`<div class="notice notice--error" role="alert" data-astro-cid-25lwhesj> <span class="notice__body" data-astro-cid-25lwhesj>${error}</span> </div>`} <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Email</span> <input class="input" type="email" name="email"${addAttribute(email, "value")} required autocomplete="email" data-astro-cid-25lwhesj> </label> <label class="checkbox-row" data-astro-cid-25lwhesj> <input type="checkbox" name="marketing_consent" data-astro-cid-25lwhesj> <span data-astro-cid-25lwhesj>Send me an email when there is a new firmware or release.</span> </label> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Name</span> <input class="input" name="name"${addAttribute(address.name ?? customer?.name ?? "", "value")} required autocomplete="name" data-astro-cid-25lwhesj> </label> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Address</span> <input class="input" name="line1"${addAttribute(address.line1 ?? "", "value")} required autocomplete="address-line1" data-astro-cid-25lwhesj> </label> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Address line 2</span> <input class="input" name="line2"${addAttribute(address.line2 ?? "", "value")} autocomplete="address-line2" data-astro-cid-25lwhesj> </label> <div class="grid grid--2" data-astro-cid-25lwhesj> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>City</span> <input class="input" name="city"${addAttribute(address.city ?? "", "value")} required autocomplete="address-level2" data-astro-cid-25lwhesj> </label> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Region</span> <input class="input" name="region"${addAttribute(address.region ?? "", "value")} required autocomplete="address-level1" data-astro-cid-25lwhesj> </label> </div> <div class="grid grid--2" data-astro-cid-25lwhesj> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Postal code</span> <input class="input num" name="postal_code"${addAttribute(address.postal_code ?? "", "value")} required autocomplete="postal-code" data-astro-cid-25lwhesj> </label> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Country</span> <input class="input" name="country"${addAttribute(address.country ?? "US", "value")} required autocomplete="country" data-astro-cid-25lwhesj> </label> </div> <label class="field" data-astro-cid-25lwhesj> <span class="field__label" data-astro-cid-25lwhesj>Phone (optional)</span> <input class="input num" name="phone"${addAttribute(address.phone ?? "", "value")} autocomplete="tel" data-astro-cid-25lwhesj> </label> <button class="btn" type="submit" data-astro-cid-25lwhesj>Continue to delivery</button> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "data-astro-cid-25lwhesj": true })} </div>`}` })} `;
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

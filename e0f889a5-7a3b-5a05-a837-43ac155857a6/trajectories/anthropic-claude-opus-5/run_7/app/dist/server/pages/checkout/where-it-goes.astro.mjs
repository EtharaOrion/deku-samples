import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSteps_BceEfKe0.mjs';
import { a as apiGet, c as apiSend } from '../../chunks/api_D4zreuKm.mjs';
/* empty css                                            */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$WhereItGoes = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WhereItGoes;
  const v = await viewer(Astro2);
  const res = v.cartToken ? await apiGet(Astro2.request, "/cart", { cartToken: v.cartToken }) : null;
  const cart = res && res.ok ? res.data.cart : null;
  if (!cart || cart.lines.length === 0) {
    return new Response(null, { status: 302, headers: { location: "/cart" } });
  }
  const a = cart.shipping_address || {};
  const errors = {};
  let formError = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const get = (k) => String(form.get(k) || "").trim();
    const email = get("email");
    const name = get("name");
    const line1 = get("line1");
    const city = get("city");
    const region = get("region");
    const postal = get("postal_code");
    const country = get("country") || "US";
    if (!email) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Email is required.";
    if (!name) errors.name = "Name is required.";
    if (!line1) errors.line1 = "Address is required.";
    if (!city) errors.city = "City is required.";
    if (!region) errors.region = "Region is required.";
    if (!postal) errors.postal_code = "Postal code is required.";
    if (Object.keys(errors).length === 0) {
      const save = await apiSend(Astro2.request, "/cart/delivery", {
        cartToken: v.cartToken,
        body: {
          email,
          marketing_consent: form.get("marketing_consent") === "on",
          shipping_address: {
            name,
            line1,
            line2: get("line2"),
            city,
            region,
            postal_code: postal,
            country,
            phone: get("phone")
          }
        }
      });
      if (save.ok) return Astro2.redirect("/checkout/how-it-gets-there", 303);
      formError = "That did not work. Check the fields and try again.";
    }
    Object.assign(a, {
      name: get("name"),
      line1: get("line1"),
      line2: get("line2"),
      city: get("city"),
      region: get("region"),
      postal_code: get("postal_code"),
      country: get("country") || "US",
      phone: get("phone")
    });
    cart.email = get("email");
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Where it goes \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Where it goes</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "current": 1 })} <div class="checkout-layout"> <form method="post" novalidate> ${formError && renderTemplate`<div class="notice notice-danger" role="alert"><p>${formError}</p></div>`} <label class="field"> <span class="label">Email</span> <input class="input" type="email" name="email"${addAttribute(cart.email || "", "value")} autocomplete="email" required${addAttribute(errors.email ? "true" : void 0, "aria-invalid")}${addAttribute(errors.email ? "err-email" : void 0, "aria-describedby")}> ${errors.email && renderTemplate`<span class="field-error" id="err-email">${errors.email}</span>`} <span class="field-hint">We send the order confirmation here.</span> </label> <label class="row" style="gap:calc(var(--unit)*2);margin-bottom:calc(var(--unit)*5);align-items:flex-start;flex-wrap:nowrap"> <input type="checkbox" name="marketing_consent" style="margin-top:4px"${addAttribute(cart.marketing_consent, "checked")}> <span class="small">Send me an email when we ship something new. Two or three a year.</span> </label> <label class="field"> <span class="label">Name</span> <input class="input" name="name"${addAttribute(a.name || "", "value")} autocomplete="name" required${addAttribute(errors.name ? "true" : void 0, "aria-invalid")}${addAttribute(errors.name ? "err-name" : void 0, "aria-describedby")}> ${errors.name && renderTemplate`<span class="field-error" id="err-name">${errors.name}</span>`} </label> <label class="field"> <span class="label">Address</span> <input class="input" name="line1"${addAttribute(a.line1 || "", "value")} autocomplete="address-line1" required${addAttribute(errors.line1 ? "true" : void 0, "aria-invalid")}${addAttribute(errors.line1 ? "err-line1" : void 0, "aria-describedby")}> ${errors.line1 && renderTemplate`<span class="field-error" id="err-line1">${errors.line1}</span>`} </label> <label class="field"> <span class="label">Apartment, suite or floor <span class="muted">(optional)</span></span> <input class="input" name="line2"${addAttribute(a.line2 || "", "value")} autocomplete="address-line2"> </label> <div class="grid-2"> <label class="field"> <span class="label">City</span> <input class="input" name="city"${addAttribute(a.city || "", "value")} autocomplete="address-level2" required${addAttribute(errors.city ? "true" : void 0, "aria-invalid")}${addAttribute(errors.city ? "err-city" : void 0, "aria-describedby")}> ${errors.city && renderTemplate`<span class="field-error" id="err-city">${errors.city}</span>`} </label> <label class="field"> <span class="label">Region</span> <input class="input" name="region"${addAttribute(a.region || "", "value")} autocomplete="address-level1" required${addAttribute(errors.region ? "true" : void 0, "aria-invalid")}${addAttribute(errors.region ? "err-region" : void 0, "aria-describedby")}> ${errors.region && renderTemplate`<span class="field-error" id="err-region">${errors.region}</span>`} </label> </div> <div class="grid-2"> <label class="field"> <span class="label">Postal code</span> <input class="input tnum" name="postal_code"${addAttribute(a.postal_code || "", "value")} autocomplete="postal-code" required${addAttribute(errors.postal_code ? "true" : void 0, "aria-invalid")}${addAttribute(errors.postal_code ? "err-postal" : void 0, "aria-describedby")}> ${errors.postal_code && renderTemplate`<span class="field-error" id="err-postal">${errors.postal_code}</span>`} </label> <label class="field"> <span class="label">Country</span> <select class="input" name="country" autocomplete="country"> <option value="US"${addAttribute((a.country || "US") === "US", "selected")}>United States</option> </select> <span class="field-hint">We ship within the United States.</span> </label> </div> <label class="field"> <span class="label">Phone <span class="muted">(optional)</span></span> <input class="input tnum" name="phone"${addAttribute(a.phone || "", "value")} autocomplete="tel" type="tel"> <span class="field-hint">Only used if the carrier cannot find the address.</span> </label> <div class="row" style="gap:calc(var(--unit)*3)"> <button type="submit" class="btn">Continue to delivery</button> <a class="btn-quiet" href="/cart">Back to the cart</a> </div> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart })} </div> ` })} `;
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_DlpHX4x4.mjs';
import { a as apiFetch } from '../../chunks/api_-Wd5sQnB.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$WhereItGoes = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WhereItGoes;
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const address = {
      name: String(form.get("name") || "").trim(),
      line1: String(form.get("line1") || "").trim(),
      line2: String(form.get("line2") || "").trim(),
      city: String(form.get("city") || "").trim(),
      region: String(form.get("region") || "").trim(),
      postal_code: String(form.get("postal_code") || "").trim(),
      country: String(form.get("country") || "US").trim().toUpperCase(),
      phone: String(form.get("phone") || "").trim()
    };
    const email = String(form.get("email") || "").trim();
    const required = [
      ["Email", email],
      ["Name", address.name],
      ["Address", address.line1],
      ["City", address.city],
      ["Region", address.region],
      ["Postal code", address.postal_code]
    ];
    const missing = required.find(([, v]) => !v);
    if (missing) {
      error = `${missing[0]} is required.`;
    } else {
      const res2 = await apiFetch(Astro2, "/api/cart/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          shipping_address: address,
          contact: { marketing_consent: form.get("marketing") === "on" }
        })
      });
      if (res2.status === 200) return Astro2.redirect("/checkout/how-it-gets-there", 303);
      error = res2.data?.message || "That did not work.";
    }
  }
  const res = await apiFetch(Astro2, "/api/cart");
  const cart = res.status === 200 ? res.data : null;
  if (!cart || cart.lines.length === 0) return Astro2.redirect("/cart", 303);
  const a = cart.shipping_address || {};
  const consent = cart.contact?.marketing_consent === true;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Where it goes", "current": "shop" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"><h1>Where it goes</h1></div> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 1 })} <div class="checkout-layout"> <form method="POST" novalidate> ${error && renderTemplate`<p class="notice notice-wrong" role="alert">${error}</p>`} <label class="field"> <span>Email</span> <input type="email" name="email"${addAttribute(cart.email || "", "value")} required autocomplete="email"> </label> <label class="check"> <input type="checkbox" name="marketing"${addAttribute(consent, "checked")}> <span>Write to me when there is something new. We send a few letters a year.</span> </label> <label class="field"> <span>Name</span> <input type="text" name="name"${addAttribute(a.name || "", "value")} required autocomplete="name"> </label> <label class="field"> <span>Address</span> <input type="text" name="line1"${addAttribute(a.line1 || "", "value")} required autocomplete="address-line1"> </label> <label class="field"> <span>Apartment, suite, or similar</span> <input type="text" name="line2"${addAttribute(a.line2 || "", "value")} autocomplete="address-line2"> </label> <div class="field-row"> <label class="field"> <span>City</span> <input type="text" name="city"${addAttribute(a.city || "", "value")} required autocomplete="address-level2"> </label> <label class="field"> <span>State or region</span> <input type="text" name="region"${addAttribute(a.region || "", "value")} required autocomplete="address-level1"> </label> </div> <div class="field-row"> <label class="field"> <span>Postal code</span> <input type="text" name="postal_code"${addAttribute(a.postal_code || "", "value")} required autocomplete="postal-code" inputmode="numeric"> </label> <label class="field"> <span>Country</span> <select name="country" autocomplete="country"> <option value="US" selected>United States</option> </select> </label> </div> <label class="field"> <span>Phone, if you would like a text when it ships</span> <input type="tel" name="phone"${addAttribute(a.phone || "", "value")} autocomplete="tel"> </label> <button type="submit" class="btn">Continue to delivery</button> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart })} </div> ` })}`;
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

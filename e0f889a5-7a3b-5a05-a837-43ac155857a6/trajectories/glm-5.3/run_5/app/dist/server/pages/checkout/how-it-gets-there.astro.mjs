import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, n as Fragment } from "../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, a as sessionCart, $ as $$PageShell } from "../../chunks/PageShell_DYrBPb7v.mjs";
import { D as DELIVERY_METHODS, d as dollars } from "../../chunks/cart_BmbV16eC.mjs";
/* empty css                                                */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$HowItGetsThere = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$HowItGetsThere;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  const { state: cart } = await sessionCart(Astro2.cookies, customer);
  const lines = cart?.lines ?? [];
  if (lines.length === 0) return Astro2.redirect("/cart");
  const address = cart?.shipping_address ?? {};
  const email = cart?.email ?? "";
  if (!email || !address?.line1) return Astro2.redirect("/checkout/where-it-goes");
  const chosen = cart?.shipping_method ?? null;
  const rung = cart?.protection_rung ?? null;
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "How it gets there — Vela", "heading": "Checkout", "active": "", "data-astro-cid-pa2nskyo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="checkout" data-astro-cid-pa2nskyo> <form class="step" data-step="how" data-astro-cid-pa2nskyo> <h2 data-astro-cid-pa2nskyo>How it gets there</h2> <ol class="steps" aria-label="Checkout steps" data-astro-cid-pa2nskyo> <li data-astro-cid-pa2nskyo><a href="/checkout/where-it-goes" data-astro-cid-pa2nskyo>Where it goes</a></li> <li aria-current="step" data-astro-cid-pa2nskyo>How it gets there</li> <li data-astro-cid-pa2nskyo>Payment</li> </ol> <fieldset class="methods" data-astro-cid-pa2nskyo> <legend data-astro-cid-pa2nskyo>Delivery method</legend> <div class="method-grid" data-astro-cid-pa2nskyo> ${DELIVERY_METHODS.map((m) => renderTemplate`<label${addAttribute(["method", { "is-selected": chosen === m.name }], "class:list")}${addAttribute(m.code, "data-method")} data-astro-cid-pa2nskyo> <input type="radio" name="shipping_method"${addAttribute(m.name, "value")}${addAttribute(chosen === m.name, "checked")} data-method-radio data-astro-cid-pa2nskyo> <span class="method__body" data-astro-cid-pa2nskyo> <span class="method__name" data-astro-cid-pa2nskyo>${m.name}</span> <span class="method__window tnum" data-astro-cid-pa2nskyo>${m.min_days === m.max_days ? `${m.max_days} days` : `${m.min_days} to ${m.max_days} days`}</span> </span> <span class="method__price tnum" data-astro-cid-pa2nskyo>${m.price_minor === 0 ? "Free" : dollars(m.price_minor)}</span> </label>`)} </div> <p class="field-hint" data-astro-cid-pa2nskyo>No method is selected until you choose one.</p> </fieldset> <div class="address card" data-astro-cid-pa2nskyo> <h3 data-astro-cid-pa2nskyo>Going to</h3> <p data-astro-cid-pa2nskyo>${address.name}<br data-astro-cid-pa2nskyo>${address.line1}${address.line2 ? `, ${address.line2}` : ""}<br data-astro-cid-pa2nskyo>${address.city}, ${address.region} ${address.postal_code}<br data-astro-cid-pa2nskyo>${address.country}</p> <p class="field-hint" data-astro-cid-pa2nskyo>${email}</p> <a class="btn btn--quiet" href="/checkout/where-it-goes" data-astro-cid-pa2nskyo>Change</a> </div> <button class="btn btn--primary" type="submit" disabled data-continue data-astro-cid-pa2nskyo>Continue to payment</button> <p class="field-hint" data-continue-hint data-astro-cid-pa2nskyo>Choose a delivery method to continue.</p> <p class="status" role="status" aria-live="polite" data-step-status data-astro-cid-pa2nskyo></p> </form> <aside class="summary card" aria-label="Order summary" data-astro-cid-pa2nskyo> <h2 data-astro-cid-pa2nskyo>Summary</h2> <ul class="summary__lines" data-astro-cid-pa2nskyo> ${lines.map((l) => renderTemplate`<li data-astro-cid-pa2nskyo><span data-astro-cid-pa2nskyo>${l.product_title} — ${l.option_value}</span><span class="tnum" data-astro-cid-pa2nskyo>×${l.quantity}</span></li>`)} </ul> <dl class="tnum" data-astro-cid-pa2nskyo> <dt data-astro-cid-pa2nskyo>Subtotal</dt><dd data-summary-subtotal data-astro-cid-pa2nskyo>${dollars(cart.subtotal_minor)}</dd> ${rung && cart.protection.enabled && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-pa2nskyo": true }, { "default": async ($$result3) => renderTemplate`<dt data-astro-cid-pa2nskyo>Shipment protection</dt><dd data-summary-protection data-astro-cid-pa2nskyo>${dollars(rung.price_minor)}</dd>` })}`} <dt data-astro-cid-pa2nskyo>Delivery</dt><dd data-summary-shipping data-astro-cid-pa2nskyo>Chosen here</dd> <dt data-astro-cid-pa2nskyo>Tax</dt><dd data-summary-tax data-astro-cid-pa2nskyo>${dollars(cart.tax_minor)}</dd> <dt data-astro-cid-pa2nskyo>Total</dt><dd class="summary__total" data-summary-total data-astro-cid-pa2nskyo>${dollars(cart.total_minor)}</dd> </dl> </aside> </div> ` })} ${renderScript($$result, "/app/src/pages/checkout/how-it-gets-there.astro?astro&type=script&index=0&lang.ts")} `;
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

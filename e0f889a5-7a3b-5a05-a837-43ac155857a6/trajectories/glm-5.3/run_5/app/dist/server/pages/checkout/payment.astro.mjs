import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, n as Fragment, g as addAttribute, u as unescapeHTML, m as maybeRenderHead } from "../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, a as sessionCart, $ as $$PageShell } from "../../chunks/PageShell_DYrBPb7v.mjs";
import { a as deliveryMethod, d as dollars } from "../../chunks/cart_BmbV16eC.mjs";
/* empty css                                      */
import { renderers } from "../../renderers.mjs";
var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Astro = createAstro();
const $$Payment = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Payment;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  const { state: cart } = await sessionCart(Astro2.cookies, customer);
  const lines = cart?.lines ?? [];
  if (lines.length === 0) return Astro2.redirect("/cart");
  const address = cart?.shipping_address ?? {};
  const email = cart?.email ?? "";
  const method = deliveryMethod(cart?.shipping_method ?? null);
  if (!email || !address?.line1) return Astro2.redirect("/checkout/where-it-goes");
  if (!method) return Astro2.redirect("/checkout/how-it-gets-there");
  const rung = cart?.protection_rung ?? null;
  const protection = cart?.protection.enabled && rung ? rung.price_minor : 0;
  const total = cart.subtotal_minor + protection + method.price_minor + cart.tax_minor;
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Payment — Vela", "heading": "Checkout", "active": "", "data-astro-cid-j4t6opjn": true }, { "default": async ($$result2) => renderTemplate(_a || (_a = __template([" ", '<div class="checkout" data-astro-cid-j4t6opjn> <form class="step" data-step="payment" data-astro-cid-j4t6opjn> <h2 data-astro-cid-j4t6opjn>Payment</h2> <ol class="steps" aria-label="Checkout steps" data-astro-cid-j4t6opjn> <li data-astro-cid-j4t6opjn><a href="/checkout/where-it-goes" data-astro-cid-j4t6opjn>Where it goes</a></li> <li data-astro-cid-j4t6opjn><a href="/checkout/how-it-gets-there" data-astro-cid-j4t6opjn>How it gets there</a></li> <li aria-current="step" data-astro-cid-j4t6opjn>Payment</li> </ol> <p class="review" data-astro-cid-j4t6opjn>Check this over. The order goes to the address below and the invoice follows by email.</p> <div class="address card" data-astro-cid-j4t6opjn> <h3 data-astro-cid-j4t6opjn>Going to</h3> <p data-astro-cid-j4t6opjn>', "<br data-astro-cid-j4t6opjn>", "", "<br data-astro-cid-j4t6opjn>", ", ", " ", "<br data-astro-cid-j4t6opjn>", '</p> <p class="field-hint" data-astro-cid-j4t6opjn><span data-order-email data-astro-cid-j4t6opjn>', '</span></p> <a class="btn btn--quiet" href="/checkout/where-it-goes" data-astro-cid-j4t6opjn>Change</a> <script type="application/json" data-order-address>', '<\/script> </div> <div class="address card" data-astro-cid-j4t6opjn> <h3 data-astro-cid-j4t6opjn>Delivery</h3> <p data-astro-cid-j4t6opjn><span data-order-method data-astro-cid-j4t6opjn>', "</span>, ", '</p> <a class="btn btn--quiet" href="/checkout/how-it-gets-there" data-astro-cid-j4t6opjn>Change</a> </div> <div class="lines card" data-astro-cid-j4t6opjn> <h3 data-astro-cid-j4t6opjn>In this order</h3> <ul data-astro-cid-j4t6opjn> ', ' </ul> </div> <button class="btn btn--primary" type="submit" data-place-order', ' data-astro-cid-j4t6opjn>Place order</button> <p class="status" role="status" aria-live="polite" data-step-status data-astro-cid-j4t6opjn></p> </form> <aside class="summary card" aria-label="Order summary" data-astro-cid-j4t6opjn> <h2 data-astro-cid-j4t6opjn>Total</h2> <dl class="tnum" data-astro-cid-j4t6opjn> <dt data-astro-cid-j4t6opjn>Subtotal</dt><dd data-astro-cid-j4t6opjn>', "</dd> ", " <dt data-astro-cid-j4t6opjn>Delivery, ", "</dt><dd data-astro-cid-j4t6opjn>", "</dd> <dt data-astro-cid-j4t6opjn>Tax</dt><dd data-astro-cid-j4t6opjn>", '</dd> <dt data-astro-cid-j4t6opjn>Total</dt><dd class="summary__total" data-final-total data-astro-cid-j4t6opjn>', '</dd> </dl> <p class="field-hint" data-astro-cid-j4t6opjn>The total authorized is the figure shown here.</p> </aside> </div> '])), maybeRenderHead(), address.name, address.line1, address.line2 ? `, ${address.line2}` : "", address.city, address.region, address.postal_code, address.country, email, unescapeHTML(JSON.stringify(address)), method.name, method.min_days === method.max_days ? `${method.max_days} days` : `${method.min_days} to ${method.max_days} days`, lines.map((l) => renderTemplate`<li data-astro-cid-j4t6opjn><span data-astro-cid-j4t6opjn>${l.product_title} — ${l.option_value}</span><span class="tnum" data-astro-cid-j4t6opjn>×${l.quantity} · ${dollars(l.line_total_minor)}</span></li>`), addAttribute(total, "data-total-minor"), dollars(cart.subtotal_minor), protection > 0 && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-j4t6opjn": true }, { "default": async ($$result3) => renderTemplate`<dt data-astro-cid-j4t6opjn>Shipment protection</dt><dd data-astro-cid-j4t6opjn>${dollars(protection)}</dd>` })}`, method.name, method.price_minor === 0 ? "Free" : dollars(method.price_minor), dollars(cart.tax_minor), dollars(total)) })} ${renderScript($$result, "/app/src/pages/checkout/payment.astro?astro&type=script&index=0&lang.ts")} `;
}, "/app/src/pages/checkout/payment.astro", void 0);
const $$file = "/app/src/pages/checkout/payment.astro";
const $$url = "/checkout/payment";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Payment,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { $ as $$CheckoutSummary } from "../../chunks/CheckoutSummary_D2HoMnhz.mjs";
import { g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
import { m as money } from "../../chunks/format_F6jgEW4F.mjs";
/* empty css                                      */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$Payment = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Payment;
  const cart = await getCartForContext(Astro2);
  if (!cart || cart.view.lines.length === 0) return Astro2.redirect("/cart");
  const view = cart.view;
  if (!view.email) return Astro2.redirect("/checkout/where-it-goes");
  if (!view.shipping_method) return Astro2.redirect("/checkout/how-it-gets-there");
  const cartCount = view.lines.reduce((s, l) => s + l.quantity, 0);
  const protectionPrice = view.protection_rung ? { "VELA-PROTECT-1": 98, "VELA-PROTECT-2": 298, "VELA-PROTECT-3": 598, "VELA-PROTECT-4": 1198 }[view.protection_rung] ?? 0 : 0;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Payment — Vela", "active": "", "cartCount": cartCount, "data-astro-cid-j4t6opjn": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-j4t6opjn> <h1 data-astro-cid-j4t6opjn>Payment</h1> <p class="lede" data-astro-cid-j4t6opjn>Step three of three. No card is taken; the invoice follows by email.</p> </div> <div class="checkout-layout" data-astro-cid-j4t6opjn> <form class="card step-form" data-place-form data-astro-cid-j4t6opjn> <h2 data-astro-cid-j4t6opjn>Review</h2> <dl class="review" data-astro-cid-j4t6opjn> <div data-astro-cid-j4t6opjn><dt data-astro-cid-j4t6opjn>Delivering to</dt><dd data-astro-cid-j4t6opjn>${view.shipping_address?.name}<br data-astro-cid-j4t6opjn>${[view.shipping_address?.line1, view.shipping_address?.line2, view.shipping_address?.city, view.shipping_address?.region, view.shipping_address?.postal_code, view.shipping_address?.country].filter(Boolean).join(", ")}</dd></div> <div data-astro-cid-j4t6opjn><dt data-astro-cid-j4t6opjn>Email</dt><dd data-astro-cid-j4t6opjn>${view.email}</dd></div> <div data-astro-cid-j4t6opjn><dt data-astro-cid-j4t6opjn>Delivery</dt><dd data-astro-cid-j4t6opjn>${view.shipping_method} · ${view.delivery_estimate}</dd></div> ${view.protection_enabled ? renderTemplate`<div data-astro-cid-j4t6opjn><dt data-astro-cid-j4t6opjn>Shipment protection</dt><dd data-astro-cid-j4t6opjn>Included for ${money(protectionPrice)}</dd></div>` : null} <div class="total-row" data-astro-cid-j4t6opjn><dt data-astro-cid-j4t6opjn>Total to authorise</dt><dd class="num" data-authorise data-astro-cid-j4t6opjn>${money(view.total_minor)}</dd></div> </dl> <button class="btn btn-primary" type="submit" data-place data-astro-cid-j4t6opjn>Place the order</button> <p class="placing" role="status" data-placing hidden data-astro-cid-j4t6opjn>Placing your order</p> <p class="inline-error" data-form-error hidden data-astro-cid-j4t6opjn></p> <a class="btn" href="/checkout/how-it-gets-there" data-astro-cid-j4t6opjn>Back</a> </form> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "view": view, "step": 3, "data-astro-cid-j4t6opjn": true })} </div> ` })}  `;
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

import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, n as Fragment } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, a as sessionCart, $ as $$PageShell } from "../chunks/PageShell_DYrBPb7v.mjs";
import { d as dollars } from "../chunks/cart_BmbV16eC.mjs";
/* empty css                                */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Cart = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Cart;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  const { state: cart } = await sessionCart(Astro2.cookies, customer);
  const lines = cart?.lines ?? [];
  const notices = cart?.notices ?? [];
  const rung = cart?.protection_rung ?? null;
  const shipping = cart?.shipping_minor ?? 0;
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Cart — Vela", "heading": "Cart", "active": "", "data-astro-cid-h3zw4u6d": true }, { "default": async ($$result2) => renderTemplate`${lines.length === 0 ? renderTemplate`${maybeRenderHead()}<div class="empty" data-astro-cid-h3zw4u6d> <p data-astro-cid-h3zw4u6d>Your cart is empty.</p> <a class="btn" href="/shop" data-astro-cid-h3zw4u6d>Shop</a> </div>` : renderTemplate`<div class="cart" data-astro-cid-h3zw4u6d> <div class="lines" data-astro-cid-h3zw4u6d> ${notices.length > 0 && renderTemplate`<div class="notices" data-astro-cid-h3zw4u6d> ${notices.map((n) => renderTemplate`<p class="notice notice--error" data-notice data-astro-cid-h3zw4u6d>${n.message}</p>`)} </div>`} <ul class="list" data-astro-cid-h3zw4u6d> ${lines.map((line) => renderTemplate`<li class="cart-line card" data-line${addAttribute(line.id, "data-line-id")} data-astro-cid-h3zw4u6d> <img class="cart-line__thumb media"${addAttribute(line.image, "src")} alt="" width="160" height="105" data-astro-cid-h3zw4u6d> <div class="cart-line__info" data-astro-cid-h3zw4u6d> <p class="cart-line__title" data-astro-cid-h3zw4u6d>${line.product_title}</p> <p class="cart-line__variant" data-astro-cid-h3zw4u6d>${line.option_value}</p> <p class="cart-line__unit tnum" data-astro-cid-h3zw4u6d>${dollars(line.unit_price_minor)} each</p> </div> <div class="cart-line__qty" data-astro-cid-h3zw4u6d> <div class="stepper" data-qty${addAttribute(line.id, "data-line-id")}${addAttribute(Math.min(10, line.available), "data-max")} data-astro-cid-h3zw4u6d> <button type="button" class="btn"${addAttribute(`Decrease quantity of ${line.product_title}`, "aria-label")} data-qty-decrease data-astro-cid-h3zw4u6d>−</button> <input class="tnum" type="number" min="1"${addAttribute(Math.min(10, Math.max(1, line.available)), "max")}${addAttribute(line.quantity, "value")} data-qty-input${addAttribute(`Quantity of ${line.product_title}`, "aria-label")} data-astro-cid-h3zw4u6d> <button type="button" class="btn"${addAttribute(`Increase quantity of ${line.product_title}`, "aria-label")} data-qty-increase data-astro-cid-h3zw4u6d>+</button> </div> <button type="button" class="btn btn--quiet" data-remove${addAttribute(line.id, "data-line-id")} data-astro-cid-h3zw4u6d>Remove</button> </div> <p class="cart-line__total tnum" data-line-total data-astro-cid-h3zw4u6d>${dollars(line.line_total_minor)}</p> </li>`)} </ul> </div> <aside class="summary card" aria-label="Order summary" data-astro-cid-h3zw4u6d> <h2 data-astro-cid-h3zw4u6d>Summary</h2> <dl class="tnum" data-astro-cid-h3zw4u6d> <dt data-astro-cid-h3zw4u6d>Subtotal</dt><dd data-subtotal data-astro-cid-h3zw4u6d>${dollars(cart?.subtotal_minor ?? 0)}</dd> ${rung && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-h3zw4u6d": true }, { "default": async ($$result3) => renderTemplate` <dt data-astro-cid-h3zw4u6d>Shipment protection</dt> <dd data-protection data-astro-cid-h3zw4u6d>${cart?.protection.enabled ? dollars(rung.price_minor) : dollars(0)}</dd> ` })}`} <dt data-astro-cid-h3zw4u6d>Estimated delivery</dt><dd data-shipping data-astro-cid-h3zw4u6d>${shipping > 0 ? dollars(shipping) : "Free"}</dd> <dt data-astro-cid-h3zw4u6d>Estimated tax</dt><dd data-tax data-astro-cid-h3zw4u6d>${dollars(cart?.tax_minor ?? 0)}</dd> <dt data-total-dt data-astro-cid-h3zw4u6d>Total</dt><dd class="summary__total" data-total data-astro-cid-h3zw4u6d>${dollars(cart?.total_minor ?? 0)}</dd> </dl> <p class="field-hint" data-astro-cid-h3zw4u6d>Estimated. We will show the exact amount once we know where it is going.</p> ${rung && renderTemplate`<label class="protect" data-astro-cid-h3zw4u6d> <input type="checkbox" data-protection-toggle${addAttribute(cart?.protection.enabled ?? false, "checked")} data-astro-cid-h3zw4u6d> <span data-astro-cid-h3zw4u6d>Protect this shipment against loss, theft and damage for ${dollars(rung.price_minor)}</span> </label>`} <a class="btn btn--primary" href="/checkout/where-it-goes" data-astro-cid-h3zw4u6d>Check out</a> <p class="status" role="status" aria-live="polite" data-cart-status data-astro-cid-h3zw4u6d></p> </aside> </div>`}` })} ${renderScript($$result, "/app/src/pages/cart.astro?astro&type=script&index=0&lang.ts")} `;
}, "/app/src/pages/cart.astro", void 0);
const $$file = "/app/src/pages/cart.astro";
const $$url = "/cart";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Cart,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

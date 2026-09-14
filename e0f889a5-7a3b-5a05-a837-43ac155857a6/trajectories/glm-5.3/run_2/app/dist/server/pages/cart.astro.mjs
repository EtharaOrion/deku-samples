import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
import { e as ensureCartCookie, g as getCartForContext } from "../chunks/context_Bm1YOHfv.mjs";
import { a as cartView } from "../chunks/cart_CB9dsG5b.mjs";
import { m as money } from "../chunks/format_F6jgEW4F.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  await ensureCartCookie(Astro2);
  const cart = await getCartForContext(Astro2);
  const view = cart ? cart.view : await cartView(cart.row);
  const cartCount = view.lines.reduce((s, l) => s + l.quantity, 0);
  const hasAddress = Boolean(view.shipping_address && view.shipping_address.country);
  const images = { flagship: "/img/a1.svg", compact: "/img/cricket.svg", mount: "/img/mount.svg", case: "/img/case.svg", cable: "/img/cable.svg" };
  const protectionPrice = view.protection_rung ? { "VELA-PROTECT-1": 98, "VELA-PROTECT-2": 298, "VELA-PROTECT-3": 598, "VELA-PROTECT-4": 1198 }[view.protection_rung] : 0;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cart — Vela", "active": "", "cartCount": cartCount, "data-astro-cid-qsvkvazo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-qsvkvazo> <h1 data-astro-cid-qsvkvazo>Cart</h1> </div> ${view.lines.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-qsvkvazo> <p data-astro-cid-qsvkvazo>Your cart is empty.</p> <a class="btn" href="/shop" data-astro-cid-qsvkvazo>See the shop</a> </div>` : renderTemplate`<div class="cart-layout" data-astro-cid-qsvkvazo> <section aria-label="Cart lines" class="lines-wrap" data-astro-cid-qsvkvazo> ${view.notices.length > 0 ? renderTemplate`<div class="notices" data-astro-cid-qsvkvazo> ${view.notices.map((n) => renderTemplate`<p class="notice" data-notice data-astro-cid-qsvkvazo>${n.message}</p>`)} </div>` : null} <ul class="lines" data-cart-lines data-astro-cid-qsvkvazo> ${view.lines.map((line) => renderTemplate`<li class="card line"${addAttribute(line.id, "data-line-id")}${addAttribute(line.sku, "data-line-sku")}${addAttribute(line.title, "data-line-title")} data-astro-cid-qsvkvazo> <img class="thumb"${addAttribute(images[line.product_handle] || "/img/cricket.svg", "src")} alt="" aria-hidden="true" data-astro-cid-qsvkvazo> <div class="line-main" data-astro-cid-qsvkvazo> <p class="line-title" data-astro-cid-qsvkvazo>${line.title}</p> <p class="line-variant" data-astro-cid-qsvkvazo>${line.option_value} · <span class="mono" data-astro-cid-qsvkvazo>${line.sku}</span></p> <p class="line-unit num" data-unit-price data-astro-cid-qsvkvazo>${money(line.current_price_minor)} each</p> </div> <div class="line-qty" data-astro-cid-qsvkvazo> <div class="stepper" role="group"${addAttribute(`Quantity for ${line.title}`, "aria-label")} data-astro-cid-qsvkvazo> <button type="button" class="btn stepper-btn" data-qty-dec${addAttribute(`Decrease quantity of ${line.title}`, "aria-label")} data-astro-cid-qsvkvazo>−</button> <output class="qty-value num" data-qty-value aria-live="polite" data-astro-cid-qsvkvazo>${line.quantity}</output> <button type="button" class="btn stepper-btn" data-qty-inc${addAttribute(`Increase quantity of ${line.title}`, "aria-label")} data-astro-cid-qsvkvazo>+</button> </div> <p class="line-error inline-error" data-line-error hidden data-astro-cid-qsvkvazo></p> </div> <p class="line-total num" data-line-total data-astro-cid-qsvkvazo>${money(line.line_total_minor)}</p> <button type="button" class="btn line-remove" data-remove${addAttribute(`Remove ${line.title} from the cart`, "aria-label")} data-astro-cid-qsvkvazo>Remove</button> </li>`)} </ul> <div class="protection card" data-astro-cid-qsvkvazo> <label class="protection-label" data-astro-cid-qsvkvazo> <input type="checkbox" data-protection${addAttribute(view.protection_enabled, "checked")} data-astro-cid-qsvkvazo> <span data-astro-cid-qsvkvazo>Protect this shipment against loss, theft and damage for <span class="num" data-astro-cid-qsvkvazo>${money(protectionPrice)}</span></span> </label> </div> </section> <aside class="summary card" aria-label="Summary" data-astro-cid-qsvkvazo> <h2 data-astro-cid-qsvkvazo>Summary</h2> <dl class="totals" data-astro-cid-qsvkvazo> <div data-astro-cid-qsvkvazo><dt data-astro-cid-qsvkvazo>Subtotal</dt><dd class="num" data-subtotal data-astro-cid-qsvkvazo>${money(view.subtotal_minor)}</dd></div> <div data-astro-cid-qsvkvazo><dt data-astro-cid-qsvkvazo>Estimated delivery</dt><dd class="num" data-astro-cid-qsvkvazo>${view.shipping_minor !== null ? money(view.shipping_minor) : "To be chosen"}</dd></div> <div data-astro-cid-qsvkvazo><dt data-astro-cid-qsvkvazo>Estimated tax</dt><dd class="num" data-tax data-astro-cid-qsvkvazo>${money(view.tax_minor)}</dd></div> <div class="total-row" data-astro-cid-qsvkvazo><dt data-astro-cid-qsvkvazo>Total</dt><dd class="num" data-total data-astro-cid-qsvkvazo>${money(view.total_minor)}</dd></div> </dl> <p class="estimate-note" data-astro-cid-qsvkvazo> ${hasAddress ? "Estimated. We will show the exact amount once we know where it is going." : "Estimated. We will show the exact amount once we know where it is going."} </p> <a class="btn btn-primary checkout-btn" href="/checkout/where-it-goes" data-astro-cid-qsvkvazo>Check out</a> </aside> </div>`}` })}  `;
}, "/app/src/pages/cart/index.astro", void 0);
const $$file = "/app/src/pages/cart/index.astro";
const $$url = "/cart";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

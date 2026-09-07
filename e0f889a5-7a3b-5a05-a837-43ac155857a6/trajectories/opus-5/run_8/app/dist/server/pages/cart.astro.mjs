import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, n as renderScript } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$ProductMedia } from '../chunks/ProductMedia_CT5FDNyL.mjs';
import { a as apiFetch, f as formatMinor } from '../chunks/api_-Wd5sQnB.mjs';
/* empty css                                    */
/* empty css                                */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Cart = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Cart;
  const res = await apiFetch(Astro2, "/api/cart");
  const cart = res.status === 200 ? res.data : null;
  const lines = cart ? cart.lines : [];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cart", "current": "shop" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Cart</h1> </div> ${!cart && renderTemplate`<p class="notice notice-wrong">We could not load your cart. Reload the page and it will try again.</p>`}${cart && lines.length === 0 && renderTemplate`<p class="empty">Your cart is empty. <a href="/shop">Look at what we build.</a></p>`}${cart && lines.length > 0 && renderTemplate`<div class="cart-layout" data-cart> <div> <!-- A price or availability change renders above the lines as a
             persistent notice that cannot be dismissed. --> ${cart.notices.map((n) => renderTemplate`<p class="notice notice-progress" role="status">${n.message}</p>`)} <p class="vh" role="status" aria-live="polite" data-live></p> <ul style="list-style: none; padding: 0; margin: 0"> ${lines.map((l) => renderTemplate`<li class="cart-line"${addAttribute(l.id, "data-line")}${addAttribute(l.unit_price_minor, "data-unit")}${addAttribute(l.title, "data-title")}> <div class="cart-thumb">${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": l.handle, "label": "" })}</div> <div> <p class="cart-line-title"><a${addAttribute(`/shop/${l.handle}?variant=${l.sku}`, "href")}>${l.title}</a></p> <p class="cart-line-meta"> ${l.option_value} · <span class="mono">${l.sku}</span> · ${formatMinor(l.unit_price_minor)} each
</p> <div class="stepper" role="group"${addAttribute(`Quantity of ${l.title}`, "aria-label")}> <button type="button" data-dec${addAttribute(`One fewer ${l.title}`, "aria-label")}${addAttribute(l.quantity <= 1, "disabled")}>−</button> <input type="number" data-qty${addAttribute(l.quantity, "value")} min="1" max="10"${addAttribute(`Quantity of ${l.title}`, "aria-label")}> <button type="button" data-inc${addAttribute(`One more ${l.title}`, "aria-label")}>+</button> </div> <p class="small" style="color: var(--state-wrong); margin: 0.5rem 0 0" data-line-error hidden></p> </div> <div class="cart-line-right"> <span class="cart-line-total money" data-line-total>${formatMinor(l.total_minor)}</span> <button type="button" class="btn btn-quiet btn-small" data-remove>Remove</button> </div> </li>`)} </ul> </div> <aside class="summary" aria-labelledby="summary-head"> <h2 id="summary-head">Summary</h2> <label class="check"> <input type="checkbox" data-protection${addAttribute(cart.protection_enabled, "checked")}> <span>${cart.protection_rung.label}</span> </label> <table class="totals" data-totals> <tbody> <tr> <td>${cart.estimated ? "Subtotal" : "Subtotal"}</td> <td class="money" data-total="subtotal">${formatMinor(cart.subtotal_minor)}</td> </tr> <tr> <td>${cart.estimated ? "Estimated delivery" : "Delivery"}</td> <td class="money" data-total="shipping">${formatMinor(cart.shipping_minor)}</td> </tr> <tr> <td>${cart.estimated ? "Estimated tax" : "Tax"}</td> <td class="money" data-total="tax">${formatMinor(cart.tax_minor)}</td> </tr> <tr class="total-row"> <td>Total</td> <td class="money" data-total="total">${formatMinor(cart.total_minor)}</td> </tr> </tbody> </table> ${cart.estimated && renderTemplate`<p class="muted small" style="margin-top: 1rem">
Estimated. We will show the exact amount once we know where it is going.
</p>`} <a class="btn" href="/checkout/where-it-goes" style="width: 100%; margin-top: 1.5rem">Check out</a> </aside> </div>`}${renderScript($$result2, "/app/src/pages/cart.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/app/src/pages/cart.astro", void 0);

const $$file = "/app/src/pages/cart.astro";
const $$url = "/cart";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Cart,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

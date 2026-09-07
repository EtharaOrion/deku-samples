import { c as createComponent, m as maybeRenderHead, a as addAttribute, r as renderTemplate, d as renderComponent, b as createAstro } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
import { c as formatMoney, a as apiGet } from '../chunks/api_eUbQd3xF.mjs';
import { $ as $$ProductMedia } from '../chunks/ProductMedia_Ctf_7hXL.mjs';
/* empty css                                */
export { renderers } from '../renderers.mjs';

const $$Astro$1 = createAstro();
const $$CartLines = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$CartLines;
  const { cart } = Astro2.props;
  const goods = (cart.lines || []).filter((l) => l.kind !== "protection");
  const rung = cart.protection_rung;
  return renderTemplate`${maybeRenderHead()}<div class="cart" data-cart data-astro-cid-g3tdgip3> <!-- A price or availability change renders above the lines as a persistent
       notice that cannot be dismissed. --> <div class="notices" data-notices data-astro-cid-g3tdgip3> ${(cart.notices || []).map((n) => renderTemplate`<p${addAttribute(`notice ${n.kind === "price_changed" ? "" : "notice-error"}`, "class")} role="status" data-astro-cid-g3tdgip3>${n.message}</p>`)} </div> <ul class="lines" data-lines data-astro-cid-g3tdgip3> ${goods.map((line) => renderTemplate`<li class="line" data-line${addAttribute(line.id, "data-line-id")}${addAttribute(line.unit_price_minor, "data-unit")} data-astro-cid-g3tdgip3> <div class="thumb" data-astro-cid-g3tdgip3> ${renderComponent($$result, "ProductMedia", $$ProductMedia, { "handle": line.handle, "option": line.option_value, "title": line.title, "ratio": "1 / 1", "data-astro-cid-g3tdgip3": true })} </div> <div class="line-main" data-astro-cid-g3tdgip3> <p class="line-title" data-astro-cid-g3tdgip3>${line.title}</p> <p class="line-variant" data-astro-cid-g3tdgip3>${line.option_value} · <span class="mono" data-astro-cid-g3tdgip3>${line.sku}</span></p> <p class="line-unit tnum" data-astro-cid-g3tdgip3>${formatMoney(line.unit_price_minor)} each</p> </div> <div class="line-qty" data-astro-cid-g3tdgip3> <label class="visually-hidden"${addAttribute(`qty-${line.id}`, "for")} data-astro-cid-g3tdgip3>Quantity of ${line.title}</label> <div class="stepper" data-astro-cid-g3tdgip3> <button type="button" class="btn btn-secondary btn-small" data-dec${addAttribute(`One fewer ${line.title}`, "aria-label")} data-astro-cid-g3tdgip3>&minus;</button> <input${addAttribute(`qty-${line.id}`, "id")} class="tnum" type="number" min="1" max="10" step="1"${addAttribute(line.quantity, "value")} data-qty inputmode="numeric" data-astro-cid-g3tdgip3> <button type="button" class="btn btn-secondary btn-small" data-inc${addAttribute(`One more ${line.title}`, "aria-label")} data-astro-cid-g3tdgip3>+</button> </div> </div> <p class="line-total tnum" data-line-total data-astro-cid-g3tdgip3>${formatMoney(line.total_minor)}</p> <button type="button" class="btn btn-quiet btn-small" data-remove${addAttribute(`Remove ${line.title}`, "aria-label")} data-astro-cid-g3tdgip3>Remove</button> </li>`)} </ul> <aside class="summary" aria-labelledby="summary-heading" data-astro-cid-g3tdgip3> <h2 id="summary-heading" data-astro-cid-g3tdgip3>Summary</h2> <label class="protection" data-astro-cid-g3tdgip3> <input type="checkbox" data-protection${addAttribute(cart.protection_enabled, "checked")} data-astro-cid-g3tdgip3> <span data-astro-cid-g3tdgip3>Protect this shipment against loss, theft and damage for <span class="tnum" data-astro-cid-g3tdgip3>${formatMoney(rung?.price_minor ?? 0)}</span></span> </label> <dl class="totals" data-totals data-astro-cid-g3tdgip3> <div data-astro-cid-g3tdgip3><dt data-astro-cid-g3tdgip3>Estimated subtotal</dt><dd class="tnum" data-subtotal data-astro-cid-g3tdgip3>${formatMoney(cart.subtotal_minor)}</dd></div> <div data-astro-cid-g3tdgip3><dt data-astro-cid-g3tdgip3>Estimated delivery</dt><dd class="tnum" data-shipping data-astro-cid-g3tdgip3>${formatMoney(cart.shipping_minor)}</dd></div> <div data-astro-cid-g3tdgip3><dt data-astro-cid-g3tdgip3>Estimated tax</dt><dd class="tnum" data-tax data-astro-cid-g3tdgip3>${formatMoney(cart.tax_minor)}</dd></div> <div class="grand" data-astro-cid-g3tdgip3><dt data-astro-cid-g3tdgip3>Estimated total</dt><dd class="tnum" data-total data-astro-cid-g3tdgip3>${formatMoney(cart.total_minor)}</dd></div> </dl> <p class="estimate-note" data-astro-cid-g3tdgip3>Estimated. We will show the exact amount once we know where it is going.</p> <a class="btn checkout" href="/checkout/where-it-goes" data-astro-cid-g3tdgip3>Check out</a> <p class="cart-status" data-status role="status" aria-live="polite" data-astro-cid-g3tdgip3></p> </aside> </div>  `;
}, "/app/src/islands/CartLines.astro", void 0);

const $$Astro = createAstro();
const $$Cart = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Cart;
  const viewer = await viewerFor(Astro2.request);
  const result = await apiGet(Astro2.request, "/cart");
  const cart = result.ok ? result.data : null;
  const goods = (cart?.lines || []).filter((l) => l.kind !== "protection");
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cart \u2014 Vela", "current": "shop", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-h3zw4u6d": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<header class="head" data-astro-cid-h3zw4u6d> <h1 data-astro-cid-h3zw4u6d>Cart</h1> </header> ${!result.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-h3zw4u6d> ${result.error.message} ${result.error.request_id && renderTemplate`<span class="mono" data-astro-cid-h3zw4u6d> Reference ${result.error.request_id}.</span>`} </p>`}${cart && goods.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-h3zw4u6d> <p data-astro-cid-h3zw4u6d>Your cart is empty.</p> <a class="btn btn-secondary" href="/shop" data-astro-cid-h3zw4u6d>Go to the shop</a> </div>`}${cart && goods.length > 0 && renderTemplate`${renderComponent($$result2, "CartLines", $$CartLines, { "cart": cart, "data-astro-cid-h3zw4u6d": true })}`}` })} `;
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

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
import { $ as $$ProductMedia } from '../chunks/ProductMedia_Ctf_7hXL.mjs';
import { a as apiGet, c as formatMoney } from '../chunks/api_eUbQd3xF.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const viewer = await viewerFor(Astro2.request);
  const result = await apiGet(Astro2.request, "/products?page_size=100");
  const products = result.ok ? result.data.data : [];
  const cameras = products.filter((p) => p.kind === "camera");
  const rest = products.filter((p) => p.kind !== "camera");
  function priceLabel(product) {
    const prices = product.variants.map((v) => v.price_minor);
    const low = Math.min(...prices);
    const varies = prices.some((p) => p !== low);
    return varies ? `From ${formatMoney(low)}` : formatMoney(low);
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Shop \u2014 Vela", "current": "shop", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-2eaphvki": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<header class="head" data-astro-cid-2eaphvki> <h1 data-astro-cid-2eaphvki>Shop</h1> <p class="sub" data-astro-cid-2eaphvki>Two cameras, the parts that go with them, and the spares.</p> </header> ${!result.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-2eaphvki> ${result.error.message} ${result.error.request_id && renderTemplate`<span class="mono" data-astro-cid-2eaphvki> Reference ${result.error.request_id}.</span>`} </p>`}${result.ok && products.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki>Nothing is on the table right now.</p> <a class="btn btn-secondary" href="/downloads" data-astro-cid-2eaphvki>Go to downloads</a> </div>`}${cameras.length > 0 && renderTemplate`<ul class="grid grid-wide" data-astro-cid-2eaphvki> ${cameras.map((product) => renderTemplate`<li data-astro-cid-2eaphvki> <a class="card product-card"${addAttribute(`/shop/${product.handle}`, "href")} data-astro-cid-2eaphvki> ${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": product.handle, "option": product.variants[0]?.option_value, "title": product.title, "ratio": "16 / 9", "data-astro-cid-2eaphvki": true })} <div class="card-body" data-astro-cid-2eaphvki> <div class="card-head" data-astro-cid-2eaphvki> <h2 data-astro-cid-2eaphvki>${product.title}</h2> ${product.availability.state !== "available" && renderTemplate`<span class="chip chip-neutral" data-astro-cid-2eaphvki>${product.availability.label}</span>`} </div> <p class="subtitle" data-astro-cid-2eaphvki>${product.subtitle}</p> <p class="price tnum" data-astro-cid-2eaphvki>${priceLabel(product)}</p> </div> </a> </li>`)} </ul>`}${rest.length > 0 && renderTemplate`<ul class="grid grid-dense" data-astro-cid-2eaphvki> ${rest.map((product) => renderTemplate`<li data-astro-cid-2eaphvki> <a class="card product-card"${addAttribute(`/shop/${product.handle}`, "href")} data-astro-cid-2eaphvki> ${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": product.handle, "option": product.variants[0]?.option_value, "title": product.title, "data-astro-cid-2eaphvki": true })} <div class="card-body" data-astro-cid-2eaphvki> <div class="card-head" data-astro-cid-2eaphvki> <h2 class="small" data-astro-cid-2eaphvki>${product.title}</h2> ${product.availability.state !== "available" && renderTemplate`<span class="chip chip-neutral" data-astro-cid-2eaphvki>${product.availability.label}</span>`} </div> <p class="subtitle" data-astro-cid-2eaphvki>${product.subtitle}</p> <p class="price tnum" data-astro-cid-2eaphvki>${priceLabel(product)}</p> </div> </a> </li>`)} </ul>`}` })} `;
}, "/app/src/pages/shop/index.astro", void 0);

const $$file = "/app/src/pages/shop/index.astro";
const $$url = "/shop";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

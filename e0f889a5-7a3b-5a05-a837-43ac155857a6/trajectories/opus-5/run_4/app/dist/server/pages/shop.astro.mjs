import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, n as Fragment, g as addAttribute } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
import { $ as $$ProductMedia } from '../chunks/ProductMedia_D-pdKNOp.mjs';
import { v as listProducts } from '../chunks/server_SMyiD-DF.mjs';
import { a as formatMinor } from '../chunks/format_y0Y9nLbA.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  let products = [];
  let failed = false;
  try {
    products = await listProducts();
  } catch {
    failed = true;
  }
  const cameras = products.filter((p) => p.kind === "camera");
  const rest = products.filter((p) => p.kind !== "camera");
  function priceLabel(product) {
    const prices = product.variants.map((v) => Number(v.price_minor));
    const low = Math.min(...prices);
    const varies = prices.some((p) => p !== low);
    return varies ? `From ${formatMinor(low)}` : formatMinor(low);
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Shop \u2014 Vela", "description": "Two cameras, the accessories and the spares.", "data-astro-cid-2eaphvki": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-8" data-astro-cid-2eaphvki> <header class="stack stack-2" data-astro-cid-2eaphvki> <h1 data-astro-cid-2eaphvki>Shop</h1> <p class="hint" data-astro-cid-2eaphvki>Two cameras, the accessories that fit them and the spares that keep them running.</p> </header> ${failed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-2eaphvki>We could not load the catalogue. Reload the page to try again.</p>` : products.length === 0 ? renderTemplate`<div class="empty card" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki>Nothing is on the table right now.</p> <a href="/downloads" data-astro-cid-2eaphvki>Downloads</a> </div>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-2eaphvki": true }, { "default": async ($$result3) => renderTemplate` <ul class="grid grid-wide" data-astro-cid-2eaphvki> ${cameras.map((product) => renderTemplate`<li class="card cell" data-astro-cid-2eaphvki> <a class="cell-link"${addAttribute(`/shop/${product.handle}`, "href")} data-astro-cid-2eaphvki> ${renderComponent($$result3, "ProductMedia", $$ProductMedia, { "handle": product.handle, "option": product.variants[0]?.option_value, "ratio": "16 / 9", "data-astro-cid-2eaphvki": true })} <div class="cell-body" data-astro-cid-2eaphvki> <div class="row-between" data-astro-cid-2eaphvki> <h2 class="cell-title" data-astro-cid-2eaphvki>${product.title}</h2> <span class="money tnum" data-astro-cid-2eaphvki>${priceLabel(product)}</span> </div> <p class="hint" data-astro-cid-2eaphvki>${product.subtitle}</p> ${product.availability.state !== "available" && renderTemplate`<span${addAttribute(["chip", { "chip-danger": product.availability.state === "sold_out" }], "class:list")} data-astro-cid-2eaphvki> ${product.availability.label} </span>`} </div> </a> </li>`)} </ul> <ul class="grid grid-dense" data-astro-cid-2eaphvki> ${rest.map((product) => renderTemplate`<li class="card cell" data-astro-cid-2eaphvki> <a class="cell-link"${addAttribute(`/shop/${product.handle}`, "href")} data-astro-cid-2eaphvki> ${renderComponent($$result3, "ProductMedia", $$ProductMedia, { "handle": product.handle, "option": product.variants[0]?.option_value, "ratio": "4 / 3", "data-astro-cid-2eaphvki": true })} <div class="cell-body" data-astro-cid-2eaphvki> <div class="row-between" data-astro-cid-2eaphvki> <h2 class="cell-title" data-astro-cid-2eaphvki>${product.title}</h2> <span class="money tnum" data-astro-cid-2eaphvki>${priceLabel(product)}</span> </div> <p class="hint" data-astro-cid-2eaphvki>${product.subtitle}</p> ${product.availability.state !== "available" && renderTemplate`<span${addAttribute(["chip", { "chip-danger": product.availability.state === "sold_out" }], "class:list")} data-astro-cid-2eaphvki> ${product.availability.label} </span>`} </div> </a> </li>`)} </ul> ` })}`} </div> ` })} `;
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

import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, g as addAttribute } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$PageShell } from "../chunks/PageShell_DYrBPb7v.mjs";
import { l as listProducts, d as dollars } from "../chunks/cart_BmbV16eC.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const products = await listProducts();
  const cameras = products.filter((p) => p.kind === "camera");
  const others = products.filter((p) => p.kind !== "camera");
  function priceOf(p) {
    const prices = p.variants.map((v) => v.price_minor);
    const low = Math.min(...prices);
    const range = new Set(prices).size > 1;
    return { label: range ? `From ${dollars(low)}` : dollars(low), range };
  }
  function chipOf(p) {
    if (p.availability.state === "discontinued") return "Discontinued";
    if (p.availability.state === "sold_out") return "Sold out";
    return null;
  }
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Shop — Vela", "heading": "Shop", "active": "shop", "data-astro-cid-2eaphvki": true }, { "default": async ($$result2) => renderTemplate`${products.length === 0 ? renderTemplate`${maybeRenderHead()}<div class="empty" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki>Nothing is on the table right now.</p> <a class="btn" href="/downloads" data-astro-cid-2eaphvki>Downloads</a> </div>` : renderTemplate`<div class="catalogue" data-astro-cid-2eaphvki> <ul class="row row--cameras" data-astro-cid-2eaphvki> ${cameras.map((p) => renderTemplate`<li class="card card--camera" data-astro-cid-2eaphvki> <a class="card__link"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-2eaphvki> <span class="card__media media" data-astro-cid-2eaphvki><img${addAttribute(`/assets/${p.handle}.png`, "src")} alt="" width="640" height="420" data-astro-cid-2eaphvki></span> <span class="card__body" data-astro-cid-2eaphvki> <span class="card__title" data-astro-cid-2eaphvki>${p.title}</span> <span class="card__subtitle" data-astro-cid-2eaphvki>${p.subtitle}</span> <span class="card__meta" data-astro-cid-2eaphvki> <span class="card__price tnum" data-astro-cid-2eaphvki>${priceOf(p).label}</span> ${chipOf(p) && renderTemplate`<span class="chip" data-astro-cid-2eaphvki>${chipOf(p)}</span>`} </span> </span> </a> </li>`)} </ul> <ul class="row row--accessories" data-astro-cid-2eaphvki> ${others.map((p) => renderTemplate`<li class="card card--accessory" data-astro-cid-2eaphvki> <a class="card__link"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-2eaphvki> <span class="card__media media" data-astro-cid-2eaphvki><img${addAttribute(`/assets/${p.handle}.png`, "src")} alt="" width="640" height="420" data-astro-cid-2eaphvki></span> <span class="card__body" data-astro-cid-2eaphvki> <span class="card__title" data-astro-cid-2eaphvki>${p.title}</span> <span class="card__subtitle" data-astro-cid-2eaphvki>${p.subtitle}</span> <span class="card__meta" data-astro-cid-2eaphvki> <span class="card__price tnum" data-astro-cid-2eaphvki>${priceOf(p).label}</span> ${chipOf(p) && renderTemplate`<span class="chip" data-astro-cid-2eaphvki>${chipOf(p)}</span>`} </span> </span> </a> </li>`)} </ul> </div>`}` })} `;
}, "/app/src/pages/shop/index.astro", void 0);
const $$file = "/app/src/pages/shop/index.astro";
const $$url = "/shop";
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

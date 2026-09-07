import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_5xqhq6uI.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../chunks/server-fetch_DBHxzT0a.mjs';
import { b as formatMoney } from '../chunks/app_BbZzWQ31.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  const { ok, body } = await apiGet("/api/products?page_size=100", Astro2);
  const products = ok ? body.data : [];
  const cameras = products.filter((p) => p.kind === "camera");
  const rest = products.filter((p) => p.kind !== "camera");
  function priceLabel(p) {
    return p.price_varies ? `From ${formatMoney(p.price_minor)}` : formatMoney(p.price_minor);
  }
  function chipFor(p) {
    if (p.status === "discontinued") return { text: "Discontinued", tone: "neutral" };
    const total = p.variants.reduce((n, v) => n + v.available, 0);
    if (total <= 0) return { text: "Sold out", tone: "neutral" };
    if (total <= 10) return { text: `Only ${total} left`, tone: "progress" };
    return null;
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Shop \u2014 Vela", "description": "Two cameras, a case, a mount and the cable.", "current": "shop", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-2eaphvki": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-2eaphvki> <h1 class="page-title" data-astro-cid-2eaphvki>Shop</h1> <p class="page-sub" data-astro-cid-2eaphvki>Everything we make fits on one page.</p> </div> ${products.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki>Nothing is on the table right now.</p> <p data-astro-cid-2eaphvki> <a href="/downloads" data-astro-cid-2eaphvki>Downloads</a> </p> </div>` : renderTemplate`<div class="stack" data-astro-cid-2eaphvki> <ul class="card-grid card-grid--wide" role="list" data-astro-cid-2eaphvki> ${cameras.map((p) => {
    const chip = chipFor(p);
    return renderTemplate`<li class="product-card" data-astro-cid-2eaphvki> <a class="product-card__link"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-2eaphvki> <img class="product-card__media"${addAttribute(`/media/products/${p.handle}.svg`, "src")} alt="" width="480" height="400" loading="lazy" data-astro-cid-2eaphvki> <div class="product-card__body" data-astro-cid-2eaphvki> <div class="row row--between" data-astro-cid-2eaphvki> <h2 class="product-card__title" data-astro-cid-2eaphvki>${p.title}</h2> ${chip && renderTemplate`<span${addAttribute(`chip chip--${chip.tone}`, "class")} data-astro-cid-2eaphvki>${chip.text}</span>`} </div> <p class="product-card__subtitle muted" data-astro-cid-2eaphvki>${p.subtitle}</p> <p class="product-card__price money strong" data-astro-cid-2eaphvki>${priceLabel(p)}</p> </div> </a> </li>`;
  })} </ul> <ul class="card-grid card-grid--dense" role="list" data-astro-cid-2eaphvki> ${rest.map((p) => {
    const chip = chipFor(p);
    return renderTemplate`<li class="product-card product-card--dense" data-astro-cid-2eaphvki> <a class="product-card__link"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-2eaphvki> <img class="product-card__media product-card__media--dense"${addAttribute(`/media/products/${p.handle}.svg`, "src")} alt="" width="480" height="400" loading="lazy" data-astro-cid-2eaphvki> <div class="product-card__body" data-astro-cid-2eaphvki> <div class="row row--between" data-astro-cid-2eaphvki> <h2 class="product-card__title" data-astro-cid-2eaphvki>${p.title}</h2> ${chip && renderTemplate`<span${addAttribute(`chip chip--${chip.tone}`, "class")} data-astro-cid-2eaphvki>${chip.text}</span>`} </div> <p class="product-card__subtitle muted small" data-astro-cid-2eaphvki>${p.subtitle}</p> <p class="product-card__price money strong" data-astro-cid-2eaphvki>${priceLabel(p)}</p> </div> </a> </li>`;
  })} </ul> </div>`}` })} `;
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

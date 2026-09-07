import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$ProductMedia } from '../chunks/ProductMedia_CT5FDNyL.mjs';
import { a as apiFetch, f as formatMinor } from '../chunks/api_-Wd5sQnB.mjs';
/* empty css                                */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const res = await apiFetch(Astro2, "/api/products?page_size=100");
  const products = res.status === 200 ? res.data.data : [];
  const failed = res.status !== 200;
  const cameras = products.filter((p) => p.kind === "camera");
  const rest = products.filter((p) => p.kind !== "camera");
  function chip(p) {
    if (p.status === "discontinued") return { label: "Discontinued", cls: "chip-neutral" };
    if (p.availability.state === "sold_out") return { label: "Sold out", cls: "chip-wrong" };
    if (p.availability.state === "low") return { label: p.availability.label, cls: "chip-progress" };
    return null;
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Shop", "current": "shop" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Shop</h1> <p>Two cameras, the things that go with them and the parts that wear out. Everything is built and sold by us.</p> </div> ${failed && renderTemplate`<p class="notice notice-wrong">We could not load the catalogue. Reload the page and it will try again.</p>`}${!failed && products.length === 0 && renderTemplate`<p class="empty">Nothing is on the table right now. <a href="/downloads">The downloads are still here.</a></p>`}${cameras.length > 0 && renderTemplate`<section aria-labelledby="cameras-head"> <h2 class="section-head" id="cameras-head">Cameras</h2> <div class="grid-cameras"> ${cameras.map((p) => {
    const c = chip(p);
    return renderTemplate`<a class="pcard"${addAttribute(`/shop/${p.handle}`, "href")}> <div class="pcard-media">${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": p.handle, "label": p.title })}</div> <div class="pcard-body"> <h3 class="pcard-title">${p.title}</h3> <p class="pcard-sub">${p.subtitle}</p> ${c && renderTemplate`<p><span${addAttribute(`chip ${c.cls}`, "class")}>${c.label}</span></p>`} <p class="pcard-price money">${p.price_from ? "From " : ""}${formatMinor(p.price_minor)}</p> </div> </a>`;
  })} </div> </section>`}${rest.length > 0 && renderTemplate`<section aria-labelledby="rest-head"> <h2 class="section-head" id="rest-head">Accessories and spares</h2> <div class="grid-rest"> ${rest.map((p) => {
    const c = chip(p);
    return renderTemplate`<a class="pcard pcard-dense"${addAttribute(`/shop/${p.handle}`, "href")}> <div class="pcard-media">${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": p.handle, "label": p.title })}</div> <div class="pcard-body"> <h3 class="pcard-title">${p.title}</h3> <p class="pcard-sub">${p.subtitle}</p> ${c && renderTemplate`<p><span${addAttribute(`chip ${c.cls}`, "class")}>${c.label}</span></p>`} <p class="pcard-price money">${p.price_from ? "From " : ""}${formatMinor(p.price_minor)}</p> </div> </a>`;
  })} </div> </section>`}` })}`;
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

import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead, a as addAttribute } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../chunks/App_CbKyOZgE.mjs';
import { d as catalogueProducts, m as money, e as availabilityOf } from '../chunks/queries_DE4s-KG7.mjs';
/* empty css                                */
export { renderers } from '../renderers.mjs';

const $$Shop = createComponent(async ($$result, $$props, $$slots) => {
  const products = await catalogueProducts();
  const stateOf = (p) => {
    const a = availabilityOf(p);
    if (a.state === "discontinued") return { label: "Discontinued", tone: "" };
    if (a.state === "sold_out") return { label: "Sold out", tone: "wrong" };
    return null;
  };
  const fromPrice = (p) => Math.min(...p.variants.map((v) => v.price_minor));
  const differs = (p) => new Set(p.variants.map((v) => v.price_minor)).size > 1;
  const cameras = products.filter((p) => p.kind === "camera");
  const rest = products.filter((p) => p.kind !== "camera");
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Shop", "active": "shop", "data-astro-cid-5w43p2qc": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title" data-astro-cid-5w43p2qc>Shop</h1> <p class="page-sub" data-astro-cid-5w43p2qc>Cameras first, then what goes with them. Ordered as we make them.</p> ${products.length === 0 && renderTemplate`<p class="empty-note" data-astro-cid-5w43p2qc>Nothing is on the table right now. <a href="/downloads" data-astro-cid-5w43p2qc>The downloads are here.</a></p>`}${cameras.length > 0 && renderTemplate`<section aria-label="Cameras" class="grid grid-cameras" data-astro-cid-5w43p2qc> ${cameras.map((p) => renderTemplate`<a class="card product-card"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-5w43p2qc> <div class="media media-camera"${addAttribute(p.handle, "data-tone")} data-astro-cid-5w43p2qc></div> <div class="card-row" data-astro-cid-5w43p2qc> <h2 class="title" data-astro-cid-5w43p2qc>${p.title}</h2> ${stateOf(p) && renderTemplate`<span class="chip"${addAttribute(stateOf(p).tone, "data-tone")} data-astro-cid-5w43p2qc>${stateOf(p).label}</span>`} </div> <p class="subtitle" data-astro-cid-5w43p2qc>${p.subtitle}</p> <p class="price tnum" data-astro-cid-5w43p2qc>${differs(p) ? "From " : ""}${money(fromPrice(p))}</p> </a>`)} </section>`}${rest.length > 0 && renderTemplate`<section aria-label="Accessories and spares" class="grid grid-rest" data-astro-cid-5w43p2qc> ${rest.map((p) => renderTemplate`<a class="card product-card product-card-dense"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-5w43p2qc> <div class="media media-small"${addAttribute(p.handle, "data-tone")} data-astro-cid-5w43p2qc></div> <div class="card-row" data-astro-cid-5w43p2qc> <h2 class="title" data-astro-cid-5w43p2qc>${p.title}</h2> ${stateOf(p) && renderTemplate`<span class="chip"${addAttribute(stateOf(p).tone, "data-tone")} data-astro-cid-5w43p2qc>${stateOf(p).label}</span>`} </div> <p class="subtitle" data-astro-cid-5w43p2qc>${p.subtitle}</p> <p class="price tnum" data-astro-cid-5w43p2qc>${differs(p) ? "From " : ""}${money(fromPrice(p))}</p> </a>`)} </section>`}` })} `;
}, "/app/src/pages/shop.astro", void 0);

const $$file = "/app/src/pages/shop.astro";
const $$url = "/shop";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Shop,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

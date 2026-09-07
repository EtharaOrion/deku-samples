import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
import { a as apiGet, m as mediaFor, b as formatMinor } from '../chunks/api_D4zreuKm.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const v = await viewer(Astro2);
  const res = await apiGet(Astro2.request, "/products?page_size=50");
  const products = res.ok ? res.data.data : [];
  const failed = !res.ok;
  const cameras = products.filter((p) => p.kind === "camera");
  const rest = products.filter((p) => p.kind !== "camera");
  function chipFor(p) {
    if (p.status === "discontinued") return { label: "Discontinued", cls: "chip" };
    if (p.availability.state === "sold_out") return { label: "Sold out", cls: "chip chip-danger" };
    if (p.availability.state === "low") return { label: p.availability.label, cls: "chip" };
    return null;
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Shop \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount, "data-astro-cid-2eaphvki": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title" data-astro-cid-2eaphvki>Shop</h1> <p class="page-lede" data-astro-cid-2eaphvki>Two cameras, the accessories that go with them and the spares we keep on the shelf.</p> ${failed && renderTemplate`<div class="notice notice-danger" role="alert" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki><strong data-astro-cid-2eaphvki>We could not load the catalogue.</strong></p> <p class="small" data-astro-cid-2eaphvki>Something went wrong at our end. Reload the page to try again.</p> </div>`}${!failed && products.length === 0 && renderTemplate`<div class="empty" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki>Nothing is on the table right now.</p> <p class="small" data-astro-cid-2eaphvki><a href="/downloads" data-astro-cid-2eaphvki>Downloads are still here.</a></p> </div>`}${cameras.length > 0 && renderTemplate`<section class="section" aria-labelledby="cameras-h" data-astro-cid-2eaphvki> <h2 class="section-title" id="cameras-h" data-astro-cid-2eaphvki>Cameras</h2> <div class="stack" style="gap:calc(var(--unit) * 4)" data-astro-cid-2eaphvki> ${cameras.map((p) => {
    const chip = chipFor(p);
    return renderTemplate`<article class="card" data-astro-cid-2eaphvki> <a${addAttribute(`/shop/${p.handle}`, "href")} class="card-wide-link" data-astro-cid-2eaphvki> <img class="media"${addAttribute(mediaFor(p.handle), "src")}${addAttribute(`${p.title}`, "alt")} width="800" height="600" loading="lazy" data-astro-cid-2eaphvki> <div data-astro-cid-2eaphvki> <div class="row-between" style="align-items:flex-start" data-astro-cid-2eaphvki> <div data-astro-cid-2eaphvki> <h3 style="font-size:22px;line-height:28px" data-astro-cid-2eaphvki>${p.title}</h3> <p class="muted small" style="margin-top:var(--unit)" data-astro-cid-2eaphvki>${p.subtitle}</p> </div> ${chip && renderTemplate`<span${addAttribute(chip.cls, "class")} data-astro-cid-2eaphvki>${chip.label}</span>`} </div> <p class="money" style="margin-top:calc(var(--unit) * 3);font-size:20px;font-weight:700" data-astro-cid-2eaphvki> ${p.price_from ? "From " : ""}${formatMinor(p.price_minor)} </p> <p class="small muted" style="margin-top:calc(var(--unit) * 2)" data-astro-cid-2eaphvki> ${p.variants.length} ${p.variants.length === 1 ? "option" : "options"} </p> </div> </a> </article>`;
  })} </div> </section>`}${rest.length > 0 && renderTemplate`<section class="section" aria-labelledby="rest-h" data-astro-cid-2eaphvki> <h2 class="section-title" id="rest-h" data-astro-cid-2eaphvki>Accessories and spares</h2> <div class="grid-3" data-astro-cid-2eaphvki> ${rest.map((p) => {
    const chip = chipFor(p);
    return renderTemplate`<article class="card" data-astro-cid-2eaphvki> <a${addAttribute(`/shop/${p.handle}`, "href")} style="text-decoration:none;display:block" data-astro-cid-2eaphvki> <img class="media"${addAttribute(mediaFor(p.handle), "src")}${addAttribute(p.title, "alt")} width="800" height="600" loading="lazy" style="aspect-ratio:16/10" data-astro-cid-2eaphvki> <div class="row-between" style="margin-top:calc(var(--unit) * 3);align-items:flex-start" data-astro-cid-2eaphvki> <h3 style="font-size:16px;line-height:24px" data-astro-cid-2eaphvki>${p.title}</h3> ${chip && renderTemplate`<span${addAttribute(chip.cls, "class")} data-astro-cid-2eaphvki>${chip.label}</span>`} </div> <p class="muted small" style="margin-top:var(--unit)" data-astro-cid-2eaphvki>${p.subtitle}</p> <p class="money" style="margin-top:calc(var(--unit) * 2);font-weight:700" data-astro-cid-2eaphvki> ${p.price_from ? "From " : ""}${formatMinor(p.price_minor)} </p> </a> </article>`;
  })} </div> </section>`}` })} `;
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

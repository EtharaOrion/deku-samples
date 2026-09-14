import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, F as Fragment, a as addAttribute } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
import { l as listProducts, v as variantsForProducts, b as availabilityOf } from "../chunks/catalog_BnA2aLlY.mjs";
import { m as money } from "../chunks/format_F6jgEW4F.mjs";
import { g as getCartForContext } from "../chunks/context_Bm1YOHfv.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const { rows } = await listProducts(100, null);
  const variants = await variantsForProducts(rows.map((r) => r.id));
  const cards = rows.map((row) => {
    const list = variants.get(String(row.id)) || [];
    const prices = list.map((v) => Number(v.price_minor));
    const totalAvailable = list.reduce((s, v) => s + Number(v.available ?? 0), 0);
    return {
      handle: row.handle,
      title: row.title,
      subtitle: row.subtitle,
      kind: row.kind,
      status: row.status,
      support_until: row.support_until ? new Date(row.support_until).toISOString().slice(0, 10) : null,
      availability: availabilityOf(row, totalAvailable),
      prices,
      totalAvailable
    };
  });
  const cameras = cards.filter((c) => c.kind === "camera");
  const accessories = cards.filter((c) => c.kind !== "camera");
  function priceLabel(c) {
    if (c.prices.length === 0) return "—";
    const min = Math.min(...c.prices);
    const uniq = new Set(c.prices);
    return (uniq.size > 1 ? "From " : "") + money(min);
  }
  function chipFor(a) {
    if (!a || a.state === "available") return null;
    if (a.state === "discontinued") return { text: "Discontinued", cls: "chip" };
    if (a.state === "sold_out") return { text: "Sold out", cls: "chip chip-sold" };
    return { text: a.label, cls: "chip chip-low" };
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Shop — Vela", "active": "shop", "cartCount": cartCount, "data-astro-cid-2eaphvki": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-2eaphvki> <h1 data-astro-cid-2eaphvki>Shop</h1> <p class="lede" data-astro-cid-2eaphvki>Two cameras, what goes with them and what keeps them going.</p> </div> ${cards.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki>Nothing is on the table right now.</p> <a class="btn" href="/downloads" data-astro-cid-2eaphvki>See the downloads</a> </div>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-2eaphvki": true }, { "default": async ($$result3) => renderTemplate` <section aria-labelledby="cameras-h" data-astro-cid-2eaphvki> <h2 id="cameras-h" class="section-h" data-astro-cid-2eaphvki>Cameras</h2> <ul class="grid grid-cameras" data-astro-cid-2eaphvki> ${cameras.map((c) => {
    const chip = chipFor(c.availability);
    return renderTemplate`<li class="card product-card" data-astro-cid-2eaphvki> <a class="product-link"${addAttribute(`/shop/${c.handle}`, "href")} data-astro-cid-2eaphvki> <span class="media" aria-hidden="true"${addAttribute(c.handle, "data-media")} data-astro-cid-2eaphvki></span> <span class="card-body" data-astro-cid-2eaphvki> <span class="card-title" data-astro-cid-2eaphvki>${c.title}</span> <span class="card-sub" data-astro-cid-2eaphvki>${c.subtitle}</span> <span class="card-price num" data-astro-cid-2eaphvki>${priceLabel(c)}</span> ${chip ? renderTemplate`<span${addAttribute(chip.cls, "class")} data-astro-cid-2eaphvki>${chip.text}</span>` : null} </span> </a> </li>`;
  })} </ul> </section> <section aria-labelledby="accessories-h" data-astro-cid-2eaphvki> <h2 id="accessories-h" class="section-h" data-astro-cid-2eaphvki>Accessories and parts</h2> <ul class="grid grid-accessories" data-astro-cid-2eaphvki> ${accessories.map((c) => {
    const chip = chipFor(c.availability);
    return renderTemplate`<li class="card product-card" data-astro-cid-2eaphvki> <a class="product-link"${addAttribute(`/shop/${c.handle}`, "href")} data-astro-cid-2eaphvki> <span class="media media-small" aria-hidden="true"${addAttribute(c.handle, "data-media")} data-astro-cid-2eaphvki></span> <span class="card-body" data-astro-cid-2eaphvki> <span class="card-title" data-astro-cid-2eaphvki>${c.title}</span> <span class="card-sub" data-astro-cid-2eaphvki>${c.subtitle}</span> <span class="card-price num" data-astro-cid-2eaphvki>${priceLabel(c)}</span> ${chip ? renderTemplate`<span${addAttribute(chip.cls, "class")} data-astro-cid-2eaphvki>${chip.text}</span>` : null} </span> </a> </li>`;
  })} </ul> </section> ` })}`}` })} `;
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

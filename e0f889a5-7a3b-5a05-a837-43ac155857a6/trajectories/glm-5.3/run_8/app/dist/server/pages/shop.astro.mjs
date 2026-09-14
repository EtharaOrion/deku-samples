import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead, F as Fragment, a as addAttribute } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { q } from "../chunks/index_CC0DBeZe.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const products = await q(
    `SELECT p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until,
          COALESCE(MIN(v.price_minor), 0) AS price_from_minor,
          SUM(CASE WHEN v.inventory_policy = 'deny' THEN GREATEST(il.available, 0) ELSE 999 END) AS total_available,
          COUNT(v.id) AS variant_count,
          MAX(CASE WHEN v.inventory_policy = 'deny' AND il.available > 0 THEN il.available ELSE NULL END) AS best_available
   FROM product p
   JOIN variant v ON v.product_id = p.id
   LEFT JOIN inventory_level il ON il.variant_id = v.id
   WHERE p.kind <> 'protection'
   GROUP BY p.id ORDER BY p.position`
  );
  const cameras = products.filter((p) => p.kind === "camera");
  const others = products.filter((p) => p.kind !== "camera");
  const fmt = (minor) => {
    const abs = Math.abs(minor);
    return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  };
  const chipFor = (p) => {
    if (p.status === "discontinued") return { cls: "chip-warn", text: "Discontinued" };
    if (Number(p.total_available) <= 0) return { cls: "chip-err", text: "Sold out" };
    if (p.best_available != null && Number(p.best_available) <= 10) return { cls: "chip-warn", text: `Only ${p.best_available} left` };
    return null;
  };
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Shop", "data-astro-cid-2eaphvki": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-2eaphvki>Shop</h1> <p class="muted" data-astro-cid-2eaphvki>Two cameras and what makes them better. Nothing else.</p> ${products.length === 0 ? renderTemplate`<div class="card empty" data-astro-cid-2eaphvki> <p data-astro-cid-2eaphvki>Nothing is on the table right now.</p> <a class="btn" href="/downloads" data-astro-cid-2eaphvki>Go to downloads</a> </div>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-2eaphvki": true }, { "default": async ($$result3) => renderTemplate` <section aria-label="Cameras" class="grid cameras" data-astro-cid-2eaphvki> ${cameras.map((p) => renderTemplate`<a class="card product-card"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-2eaphvki> <div class="media media-camera" aria-hidden="true" data-astro-cid-2eaphvki></div> <h2 data-astro-cid-2eaphvki>${p.title}</h2> <p class="muted" data-astro-cid-2eaphvki>${p.subtitle}</p> <p class="price tnum" data-astro-cid-2eaphvki>From ${fmt(p.price_from_minor)}</p> ${chipFor(p) ? renderTemplate`<span${addAttribute(`chip ${chipFor(p).cls}`, "class")} data-astro-cid-2eaphvki>${chipFor(p).text}</span>` : null} </a>`)} </section> <section aria-label="Accessories and spares" class="grid accessories" data-astro-cid-2eaphvki> ${others.map((p) => renderTemplate`<a class="card product-card"${addAttribute(`/shop/${p.handle}`, "href")} data-astro-cid-2eaphvki> <div class="media media-small" aria-hidden="true" data-astro-cid-2eaphvki></div> <h2 data-astro-cid-2eaphvki>${p.title}</h2> <p class="muted" data-astro-cid-2eaphvki>${p.subtitle}</p> <p class="price tnum" data-astro-cid-2eaphvki>From ${fmt(p.price_from_minor)}</p> ${chipFor(p) ? renderTemplate`<span${addAttribute(`chip ${chipFor(p).cls}`, "class")} data-astro-cid-2eaphvki>${chipFor(p).text}</span>` : null} </a>`)} </section> ` })}`}` })} `;
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

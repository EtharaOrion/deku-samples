import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
/* empty css                               */
import { renderers } from "../renderers.mjs";
const $$404 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Not found — Vela", "active": "", "data-astro-cid-zetdm5md": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="notfound" data-astro-cid-zetdm5md> <h1 data-astro-cid-zetdm5md>That page does not exist.</h1> <p data-astro-cid-zetdm5md>The address may be wrong, or the page may have moved.</p> <div class="actions" data-astro-cid-zetdm5md> <a class="btn" href="/shop" data-astro-cid-zetdm5md>See the shop</a> <a class="btn" href="/downloads" data-astro-cid-zetdm5md>See the downloads</a> </div> </div> ` })} `;
}, "/app/src/pages/404.astro", void 0);
const $$file = "/app/src/pages/404.astro";
const $$url = "/404";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$404,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

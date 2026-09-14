import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$PageShell } from "../chunks/PageShell_DYrBPb7v.mjs";
/* empty css                               */
import { renderers } from "../renderers.mjs";
const $$404 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Not found — Vela", "heading": "That page does not exist.", "data-astro-cid-zetdm5md": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="missing" data-astro-cid-zetdm5md> <p data-astro-cid-zetdm5md>The address is wrong or the page has moved.</p> <a class="btn" href="/" data-astro-cid-zetdm5md>Start again</a> </div> ` })} `;
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

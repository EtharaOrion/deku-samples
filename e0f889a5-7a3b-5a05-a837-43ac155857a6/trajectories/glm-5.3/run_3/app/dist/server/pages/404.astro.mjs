import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../chunks/App_CbKyOZgE.mjs';
export { renderers } from '../renderers.mjs';

const $$404 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Not found" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">That page does not exist.</h1> <p><a class="btn" href="/">Back to the letter</a></p> ` })}`;
}, "/app/src/pages/404.astro", void 0);

const $$file = "/app/src/pages/404.astro";
const $$url = "/404";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$404,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

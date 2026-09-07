import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$500 = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$500;
  const requestId = Astro2.locals?.requestId || "unknown";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Something went wrong", "current": "" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Something went wrong at our end. Reference <span class="mono">${requestId}</span>.</h1> <p>Reload the page. If it happens again, write to us with that reference and we will find it in the log.</p> </div> ` })}`;
}, "/app/src/pages/500.astro", void 0);

const $$file = "/app/src/pages/500.astro";
const $$url = "/500";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$500,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

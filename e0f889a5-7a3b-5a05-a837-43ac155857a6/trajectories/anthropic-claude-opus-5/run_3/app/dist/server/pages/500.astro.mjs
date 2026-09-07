import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Base } from '../chunks/Base_CnCPTmfg.mjs';
/* empty css                               */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$500 = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$500;
  const requestId = Astro2.request.headers.get("x-request-id") ?? "unavailable";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Something went wrong \u2014 Vela", "data-astro-cid-5v2qf5k4": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<main id="main" class="error-page" data-astro-cid-5v2qf5k4> <h1 class="page-title" data-astro-cid-5v2qf5k4>Something went wrong at our end.</h1> <p class="page-sub" data-astro-cid-5v2qf5k4>Reference <span class="mono" data-astro-cid-5v2qf5k4>${requestId}</span>.</p> <p data-astro-cid-5v2qf5k4><a class="btn" href="/" data-astro-cid-5v2qf5k4>Back to the front</a></p> </main>  ` })}`;
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

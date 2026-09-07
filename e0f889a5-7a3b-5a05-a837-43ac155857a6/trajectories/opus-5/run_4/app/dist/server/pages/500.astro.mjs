import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
/* empty css                               */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$500 = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$500;
  const requestId = Astro2.locals?.requestId || Astro2.request.headers.get("x-request-id") || "unknown";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Something went wrong \u2014 Vela", "description": "Something went wrong at our end.", "data-astro-cid-5v2qf5k4": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-4 narrow" data-astro-cid-5v2qf5k4> <h1 data-astro-cid-5v2qf5k4>Something went wrong at our end. Reference <span class="ident" data-astro-cid-5v2qf5k4>${requestId}</span>.</h1> <p data-astro-cid-5v2qf5k4>Nothing you were doing has been lost. Reload the page, or go back to the shop.</p> <p class="row" data-astro-cid-5v2qf5k4> <a class="btn" href="/shop" data-astro-cid-5v2qf5k4>Shop</a> <a class="btn" href="/" data-astro-cid-5v2qf5k4>The letter</a> </p> </div> ` })} `;
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

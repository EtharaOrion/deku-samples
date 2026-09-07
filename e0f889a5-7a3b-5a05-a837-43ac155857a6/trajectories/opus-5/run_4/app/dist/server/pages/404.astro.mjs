import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
/* empty css                               */
export { renderers } from '../renderers.mjs';

const $$404 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Not found \u2014 Vela", "description": "That page does not exist.", "data-astro-cid-zetdm5md": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-4 narrow" data-astro-cid-zetdm5md> <h1 data-astro-cid-zetdm5md>That page does not exist.</h1> <p data-astro-cid-zetdm5md>The address may have changed, or it may never have been one of ours.</p> <p class="row" data-astro-cid-zetdm5md> <a class="btn" href="/shop" data-astro-cid-zetdm5md>Shop</a> <a class="btn" href="/downloads" data-astro-cid-zetdm5md>Downloads</a> </p> </div> ` })} `;
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

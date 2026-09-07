import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
/* empty css                               */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$404 = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$404;
  const viewer = await viewerFor(Astro2.request);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "That page does not exist \u2014 Vela", "current": "", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-zetdm5md": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="not-found" data-astro-cid-zetdm5md> <h1 data-astro-cid-zetdm5md>That page does not exist.</h1> <p data-astro-cid-zetdm5md>Check the address, or start again from one of these.</p> <div class="links" data-astro-cid-zetdm5md> <a class="btn btn-secondary" href="/" data-astro-cid-zetdm5md>The front page</a> <a class="btn btn-secondary" href="/shop" data-astro-cid-zetdm5md>Shop</a> <a class="btn btn-secondary" href="/downloads" data-astro-cid-zetdm5md>Downloads</a> </div> </div> ` })} `;
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

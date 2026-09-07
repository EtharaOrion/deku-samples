import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$404 = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$404;
  const v = await viewer(Astro2);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Not found \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">That page does not exist.</h1> <p class="page-lede">The address may be mistyped, or the page may have moved.</p> <div class="row" style="gap:calc(var(--unit)*3)"> <a class="btn btn-secondary" href="/shop">Go to the shop</a> <a class="btn-quiet" href="/">Read the letter</a> </div> ` })}`;
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_5xqhq6uI.mjs';
import { p as pageCustomer, a as pageCart } from '../chunks/server-fetch_DBHxzT0a.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$404 = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$404;
  const customer = await pageCustomer(Astro2).catch(() => null);
  const cart = await pageCart(Astro2).catch(() => null);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Not found \u2014 Vela", "current": "", "customer": customer, "cartCount": cart?.item_count ?? 0 }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1 class="page-title">That page does not exist.</h1> <p class="page-sub">The address may be mistyped, or the thing it named has moved.</p> </div> <div class="row"> <a class="btn" href="/shop">Shop</a> <a class="btn btn--secondary" href="/downloads">Downloads</a> </div> ` })}`;
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

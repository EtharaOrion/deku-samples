import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../chunks/App_CbKyOZgE.mjs';
/* empty css                                */
export { renderers } from '../renderers.mjs';

const $$Cart = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Cart", "active": "cart" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "cart-view", "cart-view", {}, { "default": () => renderTemplate` ${maybeRenderHead()}<div class="skeleton" style="height:12rem" aria-busy="true"></div> ` })} ` })}  `;
}, "/app/src/pages/cart.astro", void 0);

const $$file = "/app/src/pages/cart.astro";
const $$url = "/cart";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Cart,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

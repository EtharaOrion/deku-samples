import { c as createComponent, d as renderComponent, r as renderTemplate } from '../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../chunks/App_CbKyOZgE.mjs';
/* empty css                                                */
export { renderers } from '../../renderers.mjs';

const $$HowItGetsThere = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "How it gets there", "active": "cart" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "checkout-steps", "checkout-steps", { "step": "2" })} ${renderComponent($$result2, "checkout-delivery", "checkout-delivery", {})} ` })}  `;
}, "/app/src/pages/checkout/how-it-gets-there.astro", void 0);

const $$file = "/app/src/pages/checkout/how-it-gets-there.astro";
const $$url = "/checkout/how-it-gets-there";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$HowItGetsThere,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

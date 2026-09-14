import { c as createComponent, d as renderComponent, r as renderTemplate } from '../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../chunks/App_CbKyOZgE.mjs';
/* empty css                                            */
export { renderers } from '../../renderers.mjs';

const $$WhereItGoes = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Where it goes", "active": "cart" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "checkout-steps", "checkout-steps", { "step": "1" })} ${renderComponent($$result2, "checkout-address", "checkout-address", {})} ` })}  `;
}, "/app/src/pages/checkout/where-it-goes.astro", void 0);

const $$file = "/app/src/pages/checkout/where-it-goes.astro";
const $$url = "/checkout/where-it-goes";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$WhereItGoes,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

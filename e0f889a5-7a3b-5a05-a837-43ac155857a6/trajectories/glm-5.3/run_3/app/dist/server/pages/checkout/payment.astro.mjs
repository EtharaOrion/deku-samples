import { c as createComponent, d as renderComponent, r as renderTemplate } from '../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../chunks/App_CbKyOZgE.mjs';
/* empty css                                      */
export { renderers } from '../../renderers.mjs';

const $$Payment = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Payment", "active": "cart" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "checkout-steps", "checkout-steps", { "step": "3" })} ${renderComponent($$result2, "checkout-place", "checkout-place", {})} ` })}  `;
}, "/app/src/pages/checkout/payment.astro", void 0);

const $$file = "/app/src/pages/checkout/payment.astro";
const $$url = "/checkout/payment";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Payment,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

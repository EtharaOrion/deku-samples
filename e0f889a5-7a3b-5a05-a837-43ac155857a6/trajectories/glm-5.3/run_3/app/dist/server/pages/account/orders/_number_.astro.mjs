import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead } from '../../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../../chunks/App_CbKyOZgE.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Order", "active": "orders" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "account-guard", "account-guard", { "section": "order", "number": Astro2.params.number }, { "default": () => renderTemplate` ${maybeRenderHead()}<div class="skeleton" style="height:14rem"></div> ` })} ` })}  `;
}, "/app/src/pages/account/orders/[number].astro", void 0);

const $$file = "/app/src/pages/account/orders/[number].astro";
const $$url = "/account/orders/[number]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

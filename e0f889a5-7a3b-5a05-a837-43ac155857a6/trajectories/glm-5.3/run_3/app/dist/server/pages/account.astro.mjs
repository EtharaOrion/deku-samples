import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../chunks/App_CbKyOZgE.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Account", "active": "account" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "account-guard", "account-guard", {}, { "default": () => renderTemplate` ${maybeRenderHead()}<div class="skeleton" style="height:20rem"></div> ` })} ` })}  `;
}, "/app/src/pages/account/index.astro", void 0);

const $$file = "/app/src/pages/account/index.astro";
const $$url = "/account";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

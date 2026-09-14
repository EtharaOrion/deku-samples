import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead } from '../../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../../chunks/App_CbKyOZgE.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$serial = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Camera", "active": "cameras" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "account-guard", "account-guard", { "section": "camera", "serial": Astro2.params.serial }, { "default": () => renderTemplate` ${maybeRenderHead()}<div class="skeleton" style="height:14rem"></div> ` })} ` })}  `;
}, "/app/src/pages/account/cameras/[serial].astro", void 0);

const $$file = "/app/src/pages/account/cameras/[serial].astro";
const $$url = "/account/cameras/[serial]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$serial,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

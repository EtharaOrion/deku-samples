import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../chunks/App_CbKyOZgE.mjs';
/* empty css                                  */
export { renderers } from '../renderers.mjs';

const $$Doctor = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Firmware installer", "active": "doctor" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "doctor-installer", "doctor-installer", {}, { "default": () => renderTemplate` ${maybeRenderHead()}<div class="skeleton" style="height:16rem"></div> ` })} ` })}  `;
}, "/app/src/pages/doctor.astro", void 0);

const $$file = "/app/src/pages/doctor.astro";
const $$url = "/doctor";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Doctor,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

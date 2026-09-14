import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../chunks/App_CbKyOZgE.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignUp = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  const url = new URL(Astro2.request.url);
  const next = url.searchParams.get("next") || "/account";
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Sign up", "active": "signin" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "auth-form", "auth-form", { "mode": "signup", "next": next })} ` })}  `;
}, "/app/src/pages/sign-up.astro", void 0);

const $$file = "/app/src/pages/sign-up.astro";
const $$url = "/sign-up";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$SignUp,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

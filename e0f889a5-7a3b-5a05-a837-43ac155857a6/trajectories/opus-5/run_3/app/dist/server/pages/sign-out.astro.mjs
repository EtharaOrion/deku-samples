import { e as createComponent } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import 'clsx';
import { b as redirectWithCookies } from '../chunks/guard_CgiEvtXQ.mjs';
export { renderers } from '../renderers.mjs';

const $$SignOut = createComponent(($$result, $$props, $$slots) => {
  return redirectWithCookies("/", [
    "vela_token=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly"
  ]);
}, "/app/src/pages/sign-out.astro", void 0);

const $$file = "/app/src/pages/sign-out.astro";
const $$url = "/sign-out";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$SignOut,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

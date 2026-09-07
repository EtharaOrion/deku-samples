import { e as createComponent, h as createAstro } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import 'clsx';
import { e as readSession, c as apiSend, S as SESSION_COOKIE } from '../chunks/api_D4zreuKm.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignOut = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignOut;
  const token = readSession(Astro2);
  if (token) {
    try {
      await apiSend(Astro2.request, "/auth/logout", { token });
    } catch {
    }
  }
  Astro2.cookies.delete(SESSION_COOKIE, { path: "/" });
  return Astro2.redirect("/", 303);
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

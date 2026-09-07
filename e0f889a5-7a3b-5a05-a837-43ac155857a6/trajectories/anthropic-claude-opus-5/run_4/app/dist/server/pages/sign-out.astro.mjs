import { e as createComponent, h as createAstro } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import 'clsx';
import { S as SESSION_COOKIE, y as signOut } from '../chunks/server_SMyiD-DF.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignOut = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignOut;
  const token = Astro2.cookies.get(SESSION_COOKIE)?.value;
  if (token) await signOut(token);
  Astro2.cookies.delete(SESSION_COOKIE, { path: "/" });
  return Astro2.redirect("/");
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

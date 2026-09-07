import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignIn = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn;
  const viewer = await viewerFor(Astro2.request);
  const next = Astro2.url.searchParams.get("next") || "/account";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Sign in \u2014 Vela", "current": "", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-4d26bl7g": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="auth" data-astro-cid-4d26bl7g> <h1 data-astro-cid-4d26bl7g>Sign in</h1> <form class="form" data-sign-in${addAttribute(safeNext, "data-next")} novalidate data-astro-cid-4d26bl7g> <div class="field" data-astro-cid-4d26bl7g> <label for="email" data-astro-cid-4d26bl7g>Email</label> <input id="email" name="email" type="email" autocomplete="email" required data-astro-cid-4d26bl7g> </div> <div class="field" data-astro-cid-4d26bl7g> <label for="password" data-astro-cid-4d26bl7g>Password</label> <input id="password" name="password" type="password" autocomplete="current-password" required data-astro-cid-4d26bl7g> </div> <p class="form-error" data-error role="alert" data-astro-cid-4d26bl7g></p> <button class="btn" type="submit" data-submit data-astro-cid-4d26bl7g>Sign in</button> </form> <p class="alt" data-astro-cid-4d26bl7g>No account yet? <a${addAttribute(`/sign-up?next=${encodeURIComponent(safeNext)}`, "href")} data-astro-cid-4d26bl7g>Create one</a>.</p> </div> ` })}  `;
}, "/app/src/pages/sign-in.astro", void 0);

const $$file = "/app/src/pages/sign-in.astro";
const $$url = "/sign-in";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$SignIn,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

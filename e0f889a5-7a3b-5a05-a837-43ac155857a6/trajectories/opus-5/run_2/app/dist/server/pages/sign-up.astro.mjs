import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignUp = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  const viewer = await viewerFor(Astro2.request);
  const next = Astro2.url.searchParams.get("next") || "/account";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Create an account \u2014 Vela", "current": "", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-eti64xk7": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="auth" data-astro-cid-eti64xk7> <h1 data-astro-cid-eti64xk7>Create an account</h1> <p class="lede" data-astro-cid-eti64xk7>You do not need an account to buy a camera. An account is where your cameras live.</p> <form class="form" data-sign-up${addAttribute(safeNext, "data-next")} novalidate data-astro-cid-eti64xk7> <div class="field" data-astro-cid-eti64xk7> <label for="name" data-astro-cid-eti64xk7>Name</label> <input id="name" name="name" type="text" autocomplete="name" required data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="email" data-astro-cid-eti64xk7>Email</label> <input id="email" name="email" type="email" autocomplete="email" required data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="password" data-astro-cid-eti64xk7>Password</label> <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" data-astro-cid-eti64xk7> <p class="hint" data-astro-cid-eti64xk7>At least eight characters.</p> </div> <p class="form-error" data-error role="alert" data-astro-cid-eti64xk7></p> <button class="btn" type="submit" data-submit data-astro-cid-eti64xk7>Create the account</button> </form> <p class="alt" data-astro-cid-eti64xk7>Already have one? <a${addAttribute(`/sign-in?next=${encodeURIComponent(safeNext)}`, "href")} data-astro-cid-eti64xk7>Sign in</a>.</p> </div> ` })}  `;
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

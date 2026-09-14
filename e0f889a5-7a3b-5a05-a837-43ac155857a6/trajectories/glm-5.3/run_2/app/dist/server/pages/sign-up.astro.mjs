import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
/* empty css                                   */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$SignUp = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  const redirectTo = Astro2.url.searchParams.get("redirect") || "/account";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Create an account — Vela", "active": "", "data-astro-cid-eti64xk7": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="auth-wrap" data-astro-cid-eti64xk7> <form class="card auth" data-auth-form data-mode="signup"${addAttribute(redirectTo, "data-redirect")} data-astro-cid-eti64xk7> <h1 data-astro-cid-eti64xk7>Create an account</h1> <p class="lede" data-astro-cid-eti64xk7>For your cameras and your orders.</p> <div class="field" data-astro-cid-eti64xk7> <label for="name" data-astro-cid-eti64xk7>Name</label> <input id="name" name="name" required autocomplete="name" data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="email" data-astro-cid-eti64xk7>Email</label> <input id="email" name="email" type="email" required autocomplete="email" data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="password" data-astro-cid-eti64xk7>Password</label> <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" data-astro-cid-eti64xk7> <p class="hint" data-astro-cid-eti64xk7>At least eight characters.</p> </div> <p class="inline-error" data-form-error hidden data-astro-cid-eti64xk7></p> <button class="btn btn-primary" type="submit" data-astro-cid-eti64xk7>Create the account</button> <p class="muted" data-astro-cid-eti64xk7>Already have one? <a href="/sign-in" data-astro-cid-eti64xk7>Sign in</a>.</p> </form> </div> ` })}  `;
}, "/app/src/pages/sign-up.astro", void 0);
const $$file = "/app/src/pages/sign-up.astro";
const $$url = "/sign-up";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$SignUp,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

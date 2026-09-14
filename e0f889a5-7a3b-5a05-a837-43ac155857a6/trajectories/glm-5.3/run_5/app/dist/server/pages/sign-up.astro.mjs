import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$PageShell } from "../chunks/PageShell_DYrBPb7v.mjs";
/* empty css                                   */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$SignUp = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  const redirectTo = Astro2.url.searchParams.get("redirect") ?? "/account";
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Create an account — Vela", "heading": "Create an account", "data-astro-cid-eti64xk7": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="auth" data-astro-cid-eti64xk7> <form method="post" data-signup-form${addAttribute(redirectTo, "data-redirect-to")} data-astro-cid-eti64xk7> <div class="field" data-astro-cid-eti64xk7> <label for="name" data-astro-cid-eti64xk7>Name</label> <input id="name" name="name" type="text" required autocomplete="name" data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="email" data-astro-cid-eti64xk7>Email</label> <input id="email" name="email" type="email" required autocomplete="email" data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="password" data-astro-cid-eti64xk7>Password</label> <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" data-astro-cid-eti64xk7> <p class="field-hint" data-astro-cid-eti64xk7>At least eight characters.</p> </div> <button class="btn btn--primary" type="submit" data-astro-cid-eti64xk7>Create account</button> <p class="status" role="status" aria-live="polite" data-auth-status data-astro-cid-eti64xk7></p> <p class="field-hint" data-astro-cid-eti64xk7>Already have one? <a href="/sign-in" data-astro-cid-eti64xk7>Sign in</a>.</p> </form> </div> ` })} ${renderScript($$result, "/app/src/pages/sign-up.astro?astro&type=script&index=0&lang.ts")} `;
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

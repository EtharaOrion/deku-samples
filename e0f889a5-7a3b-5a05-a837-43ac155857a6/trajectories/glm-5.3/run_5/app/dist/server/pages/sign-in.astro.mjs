import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$PageShell } from "../chunks/PageShell_DYrBPb7v.mjs";
/* empty css                                   */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$SignIn = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn;
  const redirectTo = Astro2.url.searchParams.get("redirect") ?? "/account";
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Sign in — Vela", "heading": "Sign in", "data-astro-cid-4d26bl7g": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="auth" data-astro-cid-4d26bl7g> <form method="post" data-auth-form${addAttribute(redirectTo, "data-redirect-to")} data-astro-cid-4d26bl7g> <div class="field" data-astro-cid-4d26bl7g> <label for="email" data-astro-cid-4d26bl7g>Email</label> <input id="email" name="email" type="email" required autocomplete="email" data-astro-cid-4d26bl7g> </div> <div class="field" data-astro-cid-4d26bl7g> <label for="password" data-astro-cid-4d26bl7g>Password</label> <input id="password" name="password" type="password" required autocomplete="current-password" data-astro-cid-4d26bl7g> </div> <button class="btn btn--primary" type="submit" data-astro-cid-4d26bl7g>Sign in</button> <p class="status" role="status" aria-live="polite" data-auth-status data-astro-cid-4d26bl7g></p> <p class="field-hint" data-astro-cid-4d26bl7g>No account? <a href="/sign-up" data-astro-cid-4d26bl7g>Create one</a>.</p> </form> </div> ` })} ${renderScript($$result, "/app/src/pages/sign-in.astro?astro&type=script&index=0&lang.ts")} `;
}, "/app/src/pages/sign-in.astro", void 0);
const $$file = "/app/src/pages/sign-in.astro";
const $$url = "/sign-in";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$SignIn,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

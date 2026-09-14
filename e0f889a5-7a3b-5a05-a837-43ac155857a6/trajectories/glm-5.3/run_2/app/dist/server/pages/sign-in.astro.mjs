import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
/* empty css                                   */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$SignIn = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn;
  const redirectTo = Astro2.url.searchParams.get("redirect") || "/account";
  const error = Astro2.url.searchParams.get("error");
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Sign in — Vela", "active": "", "data-astro-cid-4d26bl7g": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="auth-wrap" data-astro-cid-4d26bl7g> <form class="card auth" method="post" action="/sign-in" data-auth-form data-mode="login"${addAttribute(redirectTo, "data-redirect")} data-astro-cid-4d26bl7g> <h1 data-astro-cid-4d26bl7g>Sign in</h1> <p class="lede" data-astro-cid-4d26bl7g>For your cameras and your orders.</p> ${error ? renderTemplate`<p class="inline-error" data-astro-cid-4d26bl7g>That did not work. Check the email and the password.</p>` : null} <div class="field" data-astro-cid-4d26bl7g> <label for="email" data-astro-cid-4d26bl7g>Email</label> <input id="email" name="email" type="email" required autocomplete="email" data-astro-cid-4d26bl7g> </div> <div class="field" data-astro-cid-4d26bl7g> <label for="password" data-astro-cid-4d26bl7g>Password</label> <input id="password" name="password" type="password" required autocomplete="current-password" data-astro-cid-4d26bl7g> </div> <p class="inline-error" data-form-error hidden data-astro-cid-4d26bl7g></p> <button class="btn btn-primary" type="submit" data-astro-cid-4d26bl7g>Sign in</button> <p class="muted" data-astro-cid-4d26bl7g>No account yet? <a href="/sign-up" data-astro-cid-4d26bl7g>Create one</a>.</p> </form> </div> ` })}  `;
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

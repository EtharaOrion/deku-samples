import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
import { x as login, S as SESSION_COOKIE } from '../chunks/server_SMyiD-DF.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignIn = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn;
  let errorMessage = null;
  const rawNext = Astro2.url.searchParams.get("next") || "";
  let next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";
  let email = "";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    email = String(form.get("email") || "");
    const target = String(form.get("next") || "/account");
    next = target.startsWith("/") && !target.startsWith("//") ? target : "/account";
    try {
      const result = await login({ email, password: form.get("password") });
      Astro2.cookies.set(SESSION_COOKIE, result.access_token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 72
      });
      return Astro2.redirect(next);
    } catch (err) {
      errorMessage = err.message || "That did not work.";
    }
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Sign in \u2014 Vela", "description": "Sign in to your account.", "data-astro-cid-4d26bl7g": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="narrow stack stack-6" data-astro-cid-4d26bl7g> <h1 data-astro-cid-4d26bl7g>Sign in</h1> ${errorMessage && renderTemplate`<p class="notice notice-danger" role="alert" data-astro-cid-4d26bl7g>${errorMessage}</p>`} <form method="post" class="form" data-astro-cid-4d26bl7g> <input type="hidden" name="next"${addAttribute(next, "value")} data-astro-cid-4d26bl7g> <div class="field" data-astro-cid-4d26bl7g> <label for="email" data-astro-cid-4d26bl7g>Email</label> <input class="input" id="email" name="email" type="email"${addAttribute(email, "value")} required autocomplete="email" data-astro-cid-4d26bl7g> </div> <div class="field" data-astro-cid-4d26bl7g> <label for="password" data-astro-cid-4d26bl7g>Password</label> <input class="input" id="password" name="password" type="password" required autocomplete="current-password" data-astro-cid-4d26bl7g> </div> <button class="btn btn-primary" type="submit" data-astro-cid-4d26bl7g>Sign in</button> </form> <p class="hint" data-astro-cid-4d26bl7g>
No account yet? <a${addAttribute(`/sign-up${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`, "href")} data-astro-cid-4d26bl7g>Create one</a>.
</p> </div> ` })} `;
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

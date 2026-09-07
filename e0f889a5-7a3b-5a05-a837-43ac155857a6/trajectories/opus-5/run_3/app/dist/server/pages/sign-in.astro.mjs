import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_5xqhq6uI.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../chunks/server-fetch_DBHxzT0a.mjs';
import { b as redirectWithCookies, s as sessionCookie } from '../chunks/guard_CgiEvtXQ.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignIn = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn;
  const next = Astro2.url.searchParams.get("next") || "/account";
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  let error = null;
  let email = "";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const target = String(form.get("next") ?? "/account");
    const res = await apiGet("/api/auth/login", Astro2, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const safe = target.startsWith("/") && !target.startsWith("//") ? target : "/account";
      return redirectWithCookies(safe, [sessionCookie(res.body.access_token)]);
    }
    error = res.body?.message || "That email and password do not match.";
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Sign in \u2014 Vela", "current": "", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-4d26bl7g": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-4d26bl7g> <h1 class="page-title" data-astro-cid-4d26bl7g>Sign in</h1> </div> <div class="auth" data-astro-cid-4d26bl7g> <form class="panel" method="POST" data-astro-cid-4d26bl7g> ${error && renderTemplate`<div class="notice notice--error" role="alert" data-astro-cid-4d26bl7g> <span class="notice__body" data-astro-cid-4d26bl7g>${error}</span> </div>`} <input type="hidden" name="next"${addAttribute(next, "value")} data-astro-cid-4d26bl7g> <label class="field" data-astro-cid-4d26bl7g> <span class="field__label" data-astro-cid-4d26bl7g>Email</span> <input class="input" type="email" name="email"${addAttribute(email, "value")} required autocomplete="email" data-astro-cid-4d26bl7g> </label> <label class="field" data-astro-cid-4d26bl7g> <span class="field__label" data-astro-cid-4d26bl7g>Password</span> <input class="input" type="password" name="password" required autocomplete="current-password" data-astro-cid-4d26bl7g> </label> <button class="btn" type="submit" data-astro-cid-4d26bl7g>Sign in</button> <p class="small muted auth__alt" data-astro-cid-4d26bl7g>
No account yet? <a href="/sign-up" data-astro-cid-4d26bl7g>Create one</a>.
</p> </form> </div> ` })} `;
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

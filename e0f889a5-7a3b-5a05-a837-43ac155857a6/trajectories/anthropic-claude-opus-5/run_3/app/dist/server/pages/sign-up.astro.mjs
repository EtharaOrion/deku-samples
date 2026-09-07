import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_5xqhq6uI.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../chunks/server-fetch_DBHxzT0a.mjs';
import { b as redirectWithCookies, s as sessionCookie } from '../chunks/guard_CgiEvtXQ.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignUp = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  let error = null;
  let email = "";
  let name = "";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    email = String(form.get("email") ?? "").trim();
    name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const res = await apiGet("/api/auth/signup", Astro2, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name, password })
    });
    if (res.ok) {
      return redirectWithCookies("/account", [sessionCookie(res.body.access_token)]);
    }
    error = res.body?.message || "That did not work.";
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Create an account \u2014 Vela", "current": "", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-eti64xk7": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-eti64xk7> <h1 class="page-title" data-astro-cid-eti64xk7>Create an account</h1> <p class="page-sub" data-astro-cid-eti64xk7>An account keeps your cameras and your orders in one place.</p> </div> <div class="auth" data-astro-cid-eti64xk7> <form class="panel" method="POST" data-astro-cid-eti64xk7> ${error && renderTemplate`<div class="notice notice--error" role="alert" data-astro-cid-eti64xk7> <span class="notice__body" data-astro-cid-eti64xk7>${error}</span> </div>`} <label class="field" data-astro-cid-eti64xk7> <span class="field__label" data-astro-cid-eti64xk7>Name</span> <input class="input" name="name"${addAttribute(name, "value")} required autocomplete="name" data-astro-cid-eti64xk7> </label> <label class="field" data-astro-cid-eti64xk7> <span class="field__label" data-astro-cid-eti64xk7>Email</span> <input class="input" type="email" name="email"${addAttribute(email, "value")} required autocomplete="email" data-astro-cid-eti64xk7> </label> <label class="field" data-astro-cid-eti64xk7> <span class="field__label" data-astro-cid-eti64xk7>Password</span> <input class="input" type="password" name="password" required minlength="8" autocomplete="new-password" data-astro-cid-eti64xk7> <span class="small muted" data-astro-cid-eti64xk7>At least 8 characters.</span> </label> <button class="btn" type="submit" data-astro-cid-eti64xk7>Create account</button> <p class="small muted auth__alt" data-astro-cid-eti64xk7>
Already have one? <a href="/sign-in" data-astro-cid-eti64xk7>Sign in</a>.
</p> </form> </div> ` })} `;
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

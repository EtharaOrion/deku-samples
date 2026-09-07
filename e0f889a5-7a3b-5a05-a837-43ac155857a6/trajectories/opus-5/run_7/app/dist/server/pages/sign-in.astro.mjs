import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
import { c as apiSend, S as SESSION_COOKIE } from '../chunks/api_D4zreuKm.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignIn = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn;
  const v = await viewer(Astro2);
  const nextRaw = Astro2.url.searchParams.get("next") || "/account";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/account";
  let error = null;
  let email = "";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const target = String(form.get("next") || next);
    if (!email) error = "Email is required.";
    else if (!password) error = "Password is required.";
    else {
      const res = await apiSend(Astro2.request, "/auth/login", { body: { email, password } });
      if (res.ok) {
        Astro2.cookies.set(SESSION_COOKIE, res.data.access_token, {
          path: "/",
          httpOnly: false,
          sameSite: "lax",
          maxAge: 60 * 60 * 72
        });
        return Astro2.redirect(target.startsWith("/") && !target.startsWith("//") ? target : "/account", 303);
      }
      error = res.data?.message || "That did not work.";
    }
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Sign in \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div style="max-width:26rem"> <h1 class="page-title">Sign in</h1> <p class="page-lede">Your cameras, your orders and the application.</p> ${v.signedIn && renderTemplate`<div class="notice"><p>You are already signed in. <a href="/account">Go to your account</a>.</p></div>`} <form method="post"> <input type="hidden" name="next"${addAttribute(next, "value")}> ${error && renderTemplate`<div class="notice notice-danger" role="alert"><p>${error}</p></div>`} <label class="field"> <span class="label">Email</span> <input class="input" type="email" name="email"${addAttribute(email, "value")} autocomplete="email" required autofocus> </label> <label class="field"> <span class="label">Password</span> <input class="input" type="password" name="password" autocomplete="current-password" required> </label> <button type="submit" class="btn" style="width:100%">Sign in</button> </form> <p class="small muted" style="margin-top:calc(var(--unit)*5)">
No account? <a href="/sign-up">Create one</a>. You can also check out as a guest.
</p> </div> ` })}`;
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

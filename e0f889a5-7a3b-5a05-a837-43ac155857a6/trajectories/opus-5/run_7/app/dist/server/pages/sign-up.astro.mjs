import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
import { c as apiSend, S as SESSION_COOKIE } from '../chunks/api_D4zreuKm.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignUp = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  const v = await viewer(Astro2);
  let error = null;
  let email = "";
  let name = "";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    email = String(form.get("email") || "").trim();
    name = String(form.get("name") || "").trim();
    const password = String(form.get("password") || "");
    if (!name) error = "Name is required.";
    else if (!email) error = "Email is required.";
    else if (password.length < 8) error = "Password must be at least 8 characters.";
    else {
      const res = await apiSend(Astro2.request, "/auth/signup", { body: { email, password, name } });
      if (res.ok) {
        Astro2.cookies.set(SESSION_COOKIE, res.data.access_token, {
          path: "/",
          httpOnly: false,
          sameSite: "lax",
          maxAge: 60 * 60 * 72
        });
        return Astro2.redirect("/account", 303);
      }
      error = res.data?.message || "That did not work.";
    }
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Create an account \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div style="max-width:26rem"> <h1 class="page-title">Create an account</h1> <p class="page-lede">You do not need one to buy something. It is where your cameras live.</p> <form method="post"> ${error && renderTemplate`<div class="notice notice-danger" role="alert"><p>${error}</p></div>`} <label class="field"> <span class="label">Name</span> <input class="input" name="name"${addAttribute(name, "value")} autocomplete="name" required autofocus> </label> <label class="field"> <span class="label">Email</span> <input class="input" type="email" name="email"${addAttribute(email, "value")} autocomplete="email" required> </label> <label class="field"> <span class="label">Password</span> <input class="input" type="password" name="password" autocomplete="new-password" required minlength="8"> <span class="field-hint">At least 8 characters.</span> </label> <button type="submit" class="btn" style="width:100%">Create the account</button> </form> <p class="small muted" style="margin-top:calc(var(--unit)*5)">
Already have one? <a href="/sign-in">Sign in</a>.
</p> </div> ` })}`;
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

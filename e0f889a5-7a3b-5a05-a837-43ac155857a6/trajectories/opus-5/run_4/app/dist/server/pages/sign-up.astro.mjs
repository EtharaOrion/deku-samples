import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
import { z as signup, S as SESSION_COOKIE } from '../chunks/server_SMyiD-DF.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignUp = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  let errorMessage = null;
  const rawNext = Astro2.url.searchParams.get("next") || "";
  let next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";
  let values = { email: "", name: "" };
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    values = { email: String(form.get("email") || ""), name: String(form.get("name") || "") };
    const target = String(form.get("next") || "/account");
    next = target.startsWith("/") && !target.startsWith("//") ? target : "/account";
    try {
      const result = await signup({
        email: values.email,
        name: values.name,
        password: form.get("password")
      });
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
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Create an account \u2014 Vela", "description": "Create a Vela account.", "data-astro-cid-eti64xk7": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="narrow stack stack-6" data-astro-cid-eti64xk7> <h1 data-astro-cid-eti64xk7>Create an account</h1> <p class="hint" data-astro-cid-eti64xk7>You do not need an account to buy. It is for keeping your cameras together.</p> ${errorMessage && renderTemplate`<p class="notice notice-danger" role="alert" data-astro-cid-eti64xk7>${errorMessage}</p>`} <form method="post" class="form" data-astro-cid-eti64xk7> <input type="hidden" name="next"${addAttribute(next, "value")} data-astro-cid-eti64xk7> <div class="field" data-astro-cid-eti64xk7> <label for="name" data-astro-cid-eti64xk7>Name</label> <input class="input" id="name" name="name"${addAttribute(values.name, "value")} required autocomplete="name" data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="email" data-astro-cid-eti64xk7>Email</label> <input class="input" id="email" name="email" type="email"${addAttribute(values.email, "value")} required autocomplete="email" data-astro-cid-eti64xk7> </div> <div class="field" data-astro-cid-eti64xk7> <label for="password" data-astro-cid-eti64xk7>Password</label> <input class="input" id="password" name="password" type="password" required minlength="8" autocomplete="new-password" aria-describedby="pw-hint" data-astro-cid-eti64xk7> <span class="hint" id="pw-hint" data-astro-cid-eti64xk7>At least eight characters.</span> </div> <button class="btn btn-primary" type="submit" data-astro-cid-eti64xk7>Create account</button> </form> <p class="hint" data-astro-cid-eti64xk7>Already have one? <a href="/sign-in" data-astro-cid-eti64xk7>Sign in</a>.</p> </div> ` })} `;
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

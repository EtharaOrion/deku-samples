import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
import { a as apiFetch } from '../chunks/api_-Wd5sQnB.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignIn = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn;
  const nextRaw = Astro2.url.searchParams.get("next") || "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/account";
  let error = null;
  let email = "";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const target = String(form.get("next") || "/account");
    const res = await apiFetch(Astro2, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (res.status === 200) {
      return Astro2.redirect(target.startsWith("/") && !target.startsWith("//") ? target : "/account", 303);
    }
    error = res.data?.message || "That did not work.";
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Sign in", "current": "" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div style="max-width: 34rem"> <div class="page-head"> <h1>Sign in</h1> <p>Your orders and your cameras live behind this. Buying does not need it.</p> </div> <form method="POST"> ${error && renderTemplate`<p class="notice notice-wrong" role="alert">${error}</p>`} <input type="hidden" name="next"${addAttribute(next, "value")}> <label class="field"> <span>Email</span> <input type="email" name="email"${addAttribute(email, "value")} required autocomplete="email" autofocus> </label> <label class="field"> <span>Password</span> <input type="password" name="password" required autocomplete="current-password"> </label> <button type="submit" class="btn">Sign in</button> </form> <p class="small" style="margin-top: 2rem">
No account yet? <a${addAttribute(`/sign-up${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`, "href")}>Create one</a>.
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

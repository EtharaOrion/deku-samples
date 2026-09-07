import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
import { a as apiFetch } from '../chunks/api_-Wd5sQnB.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$SignUp = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignUp;
  const nextRaw = Astro2.url.searchParams.get("next") || "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/account";
  let error = null;
  let email = "";
  let name = "";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    email = String(form.get("email") || "").trim();
    name = String(form.get("name") || "").trim();
    const password = String(form.get("password") || "");
    const target = String(form.get("next") || "/account");
    const res = await apiFetch(Astro2, "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name })
    });
    if (res.status === 201) {
      return Astro2.redirect(target.startsWith("/") && !target.startsWith("//") ? target : "/account", 303);
    }
    error = res.data?.message || "That did not work.";
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Create an account", "current": "" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div style="max-width: 34rem"> <div class="page-head"> <h1>Create an account</h1> <p>An account keeps your orders and lets you register a camera to your name. It is not needed to buy.</p> </div> <form method="POST"> ${error && renderTemplate`<p class="notice notice-wrong" role="alert">${error}</p>`} <input type="hidden" name="next"${addAttribute(next, "value")}> <label class="field"> <span>Name</span> <input type="text" name="name"${addAttribute(name, "value")} required autocomplete="name" autofocus> </label> <label class="field"> <span>Email</span> <input type="email" name="email"${addAttribute(email, "value")} required autocomplete="email"> </label> <label class="field"> <span>Password, at least eight characters</span> <input type="password" name="password" required minlength="8" autocomplete="new-password"> </label> <button type="submit" class="btn">Create the account</button> </form> <p class="small" style="margin-top: 2rem">
Already have one? <a${addAttribute(`/sign-in${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`, "href")}>Sign in</a>.
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

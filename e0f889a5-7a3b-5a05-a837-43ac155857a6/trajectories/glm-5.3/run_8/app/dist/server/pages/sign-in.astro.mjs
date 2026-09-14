import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { useState } from "preact/hooks";
import { jsxs, jsx } from "preact/jsx-runtime";
import { renderers } from "../renderers.mjs";
function SignIn({
  redirectTo = "/account"
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || "That did not work.");
        return;
      }
      localStorage.setItem("vela_token", body.access_token);
      document.cookie = `vela_token=${encodeURIComponent(body.access_token)}; Path=/; Max-Age=604800; SameSite=Lax`;
      window.location.href = redirectTo || "/account";
    } catch {
      setErr("That did not work.");
    } finally {
      setBusy(false);
    }
  };
  return jsxs("div", {
    class: "auth",
    children: [jsx("h1", {
      children: "Sign in"
    }), jsx("p", {
      class: "muted",
      children: "Your cameras and your orders live behind this."
    }), jsxs("form", {
      onSubmit: submit,
      class: "step-form",
      children: [jsxs("div", {
        class: "field",
        children: [jsx("label", {
          for: "email",
          children: "Email"
        }), jsx("input", {
          id: "email",
          type: "email",
          required: true,
          value: email,
          onInput: (e) => setEmail(e.target.value),
          autocomplete: "email"
        })]
      }), jsxs("div", {
        class: "field",
        children: [jsx("label", {
          for: "password",
          children: "Password"
        }), jsx("input", {
          id: "password",
          type: "password",
          required: true,
          value: password,
          onInput: (e) => setPassword(e.target.value),
          autocomplete: "current-password"
        })]
      }), err ? jsx("p", {
        class: "error-text",
        role: "alert",
        children: err
      }) : null, jsx("button", {
        class: "btn btn-primary",
        type: "submit",
        disabled: busy,
        children: busy ? "Signing in" : "Sign in"
      })]
    }), jsxs("p", {
      class: "muted",
      children: ["No account? ", jsx("a", {
        href: "/sign-up",
        children: "Create one"
      }), "."]
    })]
  });
}
const $$Astro = createAstro();
const $$Index = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const redirectTo = Astro2.url.searchParams.get("redirect") || "/account";
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Sign in" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SignIn", SignIn, { "client:load": true, "redirectTo": redirectTo, "client:component-hydration": "load", "client:component-path": "@components/SignIn.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/sign-in/index.astro", void 0);
const $$file = "/app/src/pages/sign-in/index.astro";
const $$url = "/sign-in";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

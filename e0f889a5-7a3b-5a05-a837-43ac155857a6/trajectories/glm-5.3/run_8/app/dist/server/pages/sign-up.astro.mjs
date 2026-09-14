import { c as createComponent, d as renderComponent, r as renderTemplate } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { useState } from "preact/hooks";
import { jsxs, jsx } from "preact/jsx-runtime";
import { renderers } from "../renderers.mjs";
function SignUp() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          name
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || "That did not work.");
        return;
      }
      localStorage.setItem("vela_token", body.access_token);
      document.cookie = `vela_token=${encodeURIComponent(body.access_token)}; Path=/; Max-Age=604800; SameSite=Lax`;
      window.location.href = "/account";
    } catch {
      setErr("That did not work.");
    } finally {
      setBusy(false);
    }
  };
  return jsxs("div", {
    class: "auth",
    children: [jsx("h1", {
      children: "Create an account"
    }), jsx("p", {
      class: "muted",
      children: "An account holds your cameras and your orders. Checkout works without one."
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
          for: "name",
          children: "Name"
        }), jsx("input", {
          id: "name",
          type: "text",
          required: true,
          value: name,
          onInput: (e) => setName(e.target.value),
          autocomplete: "name"
        })]
      }), jsxs("div", {
        class: "field",
        children: [jsx("label", {
          for: "password",
          children: "Password, eight characters or more"
        }), jsx("input", {
          id: "password",
          type: "password",
          required: true,
          minLength: "8",
          value: password,
          onInput: (e) => setPassword(e.target.value),
          autocomplete: "new-password"
        })]
      }), err ? jsx("p", {
        class: "error-text",
        role: "alert",
        children: err
      }) : null, jsx("button", {
        class: "btn btn-primary",
        type: "submit",
        disabled: busy,
        children: busy ? "Creating" : "Create account"
      })]
    }), jsxs("p", {
      class: "muted",
      children: ["Already have one? ", jsx("a", {
        href: "/sign-in",
        children: "Sign in"
      }), "."]
    })]
  });
}
const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Sign up" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "SignUp", SignUp, { "client:load": true, "client:component-hydration": "load", "client:component-path": "@components/SignUp.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/sign-up/index.astro", void 0);
const $$file = "/app/src/pages/sign-up/index.astro";
const $$url = "/sign-up";
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

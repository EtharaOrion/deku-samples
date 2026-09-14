import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, setSession, getSession } from "../lib/api.mjs";

export default function Login({ navigate }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [state, setState] = useState({ kind: "idle" });
  document.title = "Sign in — Ravel";
  async function submit(e) {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const r = await api("/auth/login", { method: "POST", body: { email, password: pw } });
      const s = { access_token: r.access_token, token_type: r.token_type, email, me: r.me };
      setSession(s);
      sessionStorage.setItem("ravel.session", JSON.stringify(s));
      setState({ kind: "ok" });
      navigate("/console");
    } catch (err) {
      setState({ kind: "failed", message: err.status === 401 ? "The email or the password was not accepted." : "Sign-in is unavailable right now. Try again." });
    }
  }
  return h("div", { class: "page login-page" }, [
    h("main", { id: "main", class: "frame login-frame" }, [
      h("a", { class: "wordmark login-mark", href: "/" }, "Ravel"),
      h("h1", { class: "h3" }, "Sign in to the console"),
      h("p", { class: "quiet" }, "Accounts are issued by Ravel. There is no signup and no password reset on this page."),
      h("form", { class: "form", onSubmit: submit }, [
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Email"), h("input", { type: "email", autocomplete: "username", value: email, onInput: (e) => setEmail(e.target.value), required: true })]),
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Password"), h("input", { type: "password", autocomplete: "current-password", value: pw, onInput: (e) => setPw(e.target.value), required: true })]),
        state.kind === "failed" ? h("div", { class: "banner banner-refused", role: "alert" }, h("p", null, state.message)) : null,
        h("button", { class: "btn btn-primary", type: "submit", disabled: state.kind === "sending" }, state.kind === "sending" ? "Signing in…" : "Sign in"),
      ]),
    ]),
  ]);
}

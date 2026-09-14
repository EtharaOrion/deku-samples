import { h } from "preact";
import { useState } from "preact/hooks";
import { api, setToken, getToken, DocMeta, Banner } from "../api.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api("/auth/login", { method: "POST", body: { email, password } });
      setToken(res.access_token);
      location.href = "/console";
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="container narrow">
      <DocMeta title="Sign in — Ravel console" description="Sign in to the Ravel operational console." />
      <p class="eyebrow">Console</p>
      <h1>Sign in</h1>
      <p class="body-regular">
        Signup is closed. Accounts are issued by Ravel and every grant ends on a stated date.
      </p>
      {error && (
        <Banner refusal>
          Sign-in failed. Check the address and password, or ask Ravel to confirm your
          account is still live.
        </Banner>
      )}
      <form onSubmit={submit} class="card" style="margin-top:1.2rem">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="username" required value={email} onInput={(e) => setEmail(e.target.value)} />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" required value={password} onInput={(e) => setPassword(e.target.value)} />
        </div>
        <button class="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p class="body-small">
        Signing a certificate asks for the password again at the moment of signing; a
        session alone is not a signing credential.
      </p>
    </div>
  );
}

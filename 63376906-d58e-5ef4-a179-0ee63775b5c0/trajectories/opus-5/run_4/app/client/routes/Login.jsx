import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { login, api } from '../api.js';
import { useTitle, Refusal } from '../ui.jsx';

export default function Login({ onSession }) {
  useTitle('Sign in — Ravel console', 'Sign in to the Ravel operational console.');
  const { route } = useLocation();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.target);
    try {
      await login(f.get('email'), f.get('password'));
      const me = await api('/auth/me');
      onSession && onSession(me);
      route('/console');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="page narrow" style="padding:4rem 1.5rem 0">
      <p class="t-eyebrow">Console</p>
      <h1 class="t-h3">Sign in</h1>
      <p class="t-big">
        Signup is closed. An account is granted, scoped to a site, and carries an end date.
      </p>

      <Refusal error={error} />

      <form onSubmit={submit} class="sheet" style="margin-top:1.5rem">
        <div class="field">
          <label class="t-label" for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label class="t-label" for="password">Password</label>
          <input id="password" name="password" type="password" required autocomplete="current-password" />
        </div>
        <p style="margin-top:1.25rem;margin-bottom:0">
          <button class="btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <span class="btn-arrow" aria-hidden="true">→</span>
          </button>
        </p>
      </form>

      <p class="t-small" style="margin-top:1.5rem;color:var(--muted)">
        There is no password reset and no self-service account creation. A session expires twelve
        hours after it is issued. Signing a certificate re-authenticates: a session alone is not a
        signing credential.
      </p>
    </div>
  );
}

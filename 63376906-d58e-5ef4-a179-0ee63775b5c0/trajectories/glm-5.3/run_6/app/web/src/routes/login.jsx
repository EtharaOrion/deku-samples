import { useState } from 'preact/hooks';
import { login } from '../lib/api.js';
import { navigate } from '../lib/router.jsx';
import { useDoc } from '../lib/ui.jsx';

export function Login() {
  useDoc('Sign in | Ravel', 'Sign in to the Ravel console.');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const ok = await login(f.get('email'), f.get('password'));
    setBusy(false);
    if (ok) navigate('/console');
    else setError('The email or the password was not accepted. Every seeded account signs in with deku-demo-pw-2026.');
  }
  return (
    <main id="main" class="page public">
      <section class="hero measure">
        <p class="eyebrow">Console</p>
        <h1>Sign in</h1>
        <p class="big">Signup is closed. The seeded accounts are the only accounts.</p>
        <form class="stack" onSubmit={onSubmit}>
          <label>Email <input type="email" name="email" required autocomplete="username" /></label>
          <label>Password <input type="password" name="password" required autocomplete="current-password" /></label>
          <button class="btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {error && (
          <div class="banner" role="alert">
            <p class="banner-title">Sign in was refused.</p>
            <p>{error}</p>
          </div>
        )}
      </section>
    </main>
  );
}

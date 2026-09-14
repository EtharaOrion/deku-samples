import { useState } from 'preact/hooks';

export default function SignIn({ redirectTo = '/account' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error?.message || 'That did not work.'); return; }
      localStorage.setItem('vela_token', body.access_token);
      document.cookie = `vela_token=${encodeURIComponent(body.access_token)}; Path=/; Max-Age=604800; SameSite=Lax`;
      window.location.href = redirectTo || '/account';
    } catch {
      setErr('That did not work.');
    } finally { setBusy(false); }
  };

  return (
    <div class="auth">
      <h1>Sign in</h1>
      <p class="muted">Your cameras and your orders live behind this.</p>
      <form onSubmit={submit} class="step-form">
        <div class="field"><label for="email">Email</label>
          <input id="email" type="email" required value={email} onInput={(e) => setEmail(e.target.value)} autocomplete="email" /></div>
        <div class="field"><label for="password">Password</label>
          <input id="password" type="password" required value={password} onInput={(e) => setPassword(e.target.value)} autocomplete="current-password" /></div>
        {err ? <p class="error-text" role="alert">{err}</p> : null}
        <button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
      </form>
      <p class="muted">No account? <a href="/sign-up">Create one</a>.</p>
    </div>
  );
}

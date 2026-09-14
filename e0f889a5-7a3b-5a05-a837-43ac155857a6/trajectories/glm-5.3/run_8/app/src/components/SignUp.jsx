import { useState } from 'preact/hooks';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error?.message || 'That did not work.'); return; }
      localStorage.setItem('vela_token', body.access_token);
      document.cookie = `vela_token=${encodeURIComponent(body.access_token)}; Path=/; Max-Age=604800; SameSite=Lax`;
      window.location.href = '/account';
    } catch {
      setErr('That did not work.');
    } finally { setBusy(false); }
  };

  return (
    <div class="auth">
      <h1>Create an account</h1>
      <p class="muted">An account holds your cameras and your orders. Checkout works without one.</p>
      <form onSubmit={submit} class="step-form">
        <div class="field"><label for="email">Email</label>
          <input id="email" type="email" required value={email} onInput={(e) => setEmail(e.target.value)} autocomplete="email" /></div>
        <div class="field"><label for="name">Name</label>
          <input id="name" type="text" required value={name} onInput={(e) => setName(e.target.value)} autocomplete="name" /></div>
        <div class="field"><label for="password">Password, eight characters or more</label>
          <input id="password" type="password" required minLength="8" value={password} onInput={(e) => setPassword(e.target.value)} autocomplete="new-password" /></div>
        {err ? <p class="error-text" role="alert">{err}</p> : null}
        <button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Creating' : 'Create account'}</button>
      </form>
      <p class="muted">Already have one? <a href="/sign-in">Sign in</a>.</p>
    </div>
  );
}

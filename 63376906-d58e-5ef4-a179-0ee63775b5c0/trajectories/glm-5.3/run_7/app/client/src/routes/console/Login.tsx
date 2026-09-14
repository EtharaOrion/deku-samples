import { useState } from 'preact/hooks';
import { login, ApiError, clearToken, me } from '../../lib/api';
import { Banner } from '../../components/Figures';
import { navigate } from '../../router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      const m = await me();
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') || '/console';
      navigate(next.startsWith('/console') ? next : '/console');
    } catch (err) {
      const ae = err as ApiError;
      clearToken();
      setError(ae.body?.message || 'The email and password were not accepted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="shell hero">
      <div class="card measure">
        <h1>Sign in</h1>
        <p class="lede" style="font-size:var(--step-body-size)">Signup is closed. The seven seeded accounts are the only accounts, and each authenticates at the identity provider.</p>
        {error ? <Banner kind="refused" title="Sign-in refused"><p>{error}</p></Banner> : null}
        <form onSubmit={submit}>
          <label class="field">
            <span class="label">Email</span>
            <input type="email" required autocomplete="username" value={email} onInput={(e: any) => setEmail(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span class="label">Password</span>
            <input type="password" required autocomplete="current-password" value={password} onInput={(e: any) => setPassword(e.currentTarget.value)} />
          </label>
          <button class="button solid" type="submit" disabled={busy}>{busy ? 'Signing in' : 'Sign in'} <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
        </form>
      </div>
    </section>
  );
}

import { useState } from 'preact/hooks';
import { login } from '../lib/api.js';
import { navigate, useMeta } from '../lib/router.jsx';
import { Reveal, Refusal } from '../components/common.jsx';

export function Login({ next = '/console' }) {
  useMeta('Ravel — Sign in', 'Sign in to the Ravel operational console.', { noindex: true });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(email.trim(), password);
      navigate(next);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="wrap-narrow stack-loose" style="padding-top:4rem;max-width:32rem">
      <header>
        <p class="eyebrow">Operational console</p>
        <Reveal as="h1" class="t-h3">Sign in</Reveal>
      </header>
      <Refusal error={error} title="This sign-in was refused" />
      <form onSubmit={submit} class="sheet">
        <label class="field">
          <span class="label">Email</span>
          <input type="email" autocomplete="username" required value={email}
            onInput={(e) => setEmail(e.target.value)} />
        </label>
        <label class="field">
          <span class="label">Password</span>
          <input type="password" autocomplete="current-password" required value={password}
            onInput={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" class="button-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p class="note">
        Signup is closed and there is no password reset. Seven accounts exist and each is granted
        to a named person for a scope that ends on a stated date.
      </p>
    </div>
  );
}

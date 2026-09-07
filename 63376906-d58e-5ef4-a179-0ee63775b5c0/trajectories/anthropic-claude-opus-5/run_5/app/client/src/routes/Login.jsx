import { useState } from 'preact/hooks';
import { api, setToken, navigate, useMeta } from '../lib.jsx';

export function Login() {
  useMeta('Sign in — Ravel', 'Sign in to the Ravel console.');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ status: 'idle', error: null });

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', error: null });
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(r.access_token);
      navigate('/console');
    } catch (error) {
      setState({ status: 'failed', error });
    }
  };

  return (
    <section class="section">
      <div class="page" style="max-width:32rem">
        <h1 class="display-2">Sign in</h1>
        <p class="note" style="margin-top:0.75rem">
          Signup is closed. The seeded accounts are the only accounts, and each authenticates at the identity server.
        </p>
        <form onSubmit={submit} style="margin-top:1.5rem" novalidate>
          <div class="field">
            <label for="li-email">Email address</label>
            <input id="li-email" type="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} required autocomplete="username" />
          </div>
          <div class="field">
            <label for="li-pw">Password</label>
            <input id="li-pw" type="password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-primary" disabled={state.status === 'sending'}>
            {state.status === 'sending' ? 'Signing in' : 'Sign in'} <span class="arrow" aria-hidden="true">→</span>
          </button>
        </form>
        {state.status === 'failed' ? (
          <div class="banner" role="alert">
            <h3>You were not signed in.</h3>
            <p>{state.error?.body?.detail || state.error?.message}</p>
            <p class="note">There is no password reset and no self-service account creation. Ask an administrator.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

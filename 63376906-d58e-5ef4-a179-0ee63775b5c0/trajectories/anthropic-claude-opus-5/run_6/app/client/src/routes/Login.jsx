import { useState } from 'preact/hooks';
import { login } from '../lib/api.js';
import { navigate } from '../lib/router.jsx';
import { Refusal } from '../components/common.jsx';

// Signup is closed. There is no password reset and no self-service account creation.
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/console');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-narrow section" style={{ paddingTop: '4rem', maxWidth: '32rem' }}>
      <h1 className="t-h3">Sign in</h1>
      <p style={{ marginTop: '1rem' }}>
        The console is reached only with a session. Accounts are issued by Ravel; there is no signup
        and no password reset on this site.
      </p>

      <Refusal error={error} title="Sign-in was refused" />

      <form onSubmit={submit} className="stack" style={{ marginTop: '1.5rem' }}>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>

      <p className="t-small" style={{ marginTop: '2rem', color: 'var(--muted)' }}>
        A session expires twelve hours after it is issued. Signing a certificate asks for the password
        again, because a session alone is not a signing credential.
      </p>
    </section>
  );
}

import { useState } from 'preact/hooks';
import { route } from 'preact-router';
import { TopBar } from '../components/Chrome.jsx';
import { api, setToken } from '../api.js';

export default function Login({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    if (r.ok) {
      setToken(r.data.access_token);
      setUser({ email });
      route('/console');
    } else {
      setError((r.data && r.data.error) || 'invalid_credentials');
    }
  }

  return (
    <div>
      <TopBar />
      <main>
        <section class="hero">
          <h1 class="reveal">Sign in</h1>
          <p class="lede">Signup is closed. Seven accounts exist and no others.</p>
        </section>
        <section>
          <form class="form" onSubmit={submit}>
            <label class="field">
              <span class="field-label">Email</span>
              <input type="email" required value={email} onInput={(e) => setEmail(e.target.value)} />
            </label>
            <label class="field">
              <span class="field-label">Password</span>
              <input type="password" required value={password} onInput={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p class="banner" role="alert">Those credentials were not accepted. Signup is closed and passwords are not reset from this screen.</p>}
            <button class="btn" type="submit">Sign in</button>
          </form>
        </section>
      </main>
    </div>
  );
}

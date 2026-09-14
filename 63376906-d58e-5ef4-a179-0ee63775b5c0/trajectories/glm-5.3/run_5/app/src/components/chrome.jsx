import { useEffect, useState } from 'preact/hooks';
import { api, getToken, clearToken } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading } from './bits.jsx';
export { Banner, Empty, Loading };

export function TopBar({ me, path }) {
  const isConsole = path.startsWith('/console');
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <Link href="/" class="wordmark" aria-label="Ravel home">Ravel</Link>
        {isConsole && me ? (
          <nav class="nav" aria-label="Console">
            <Link href="/console" current={path === '/console'}>Board</Link>
            <Link href="/console/batches" current={path.startsWith('/console/batches')}>Batches</Link>
            <Link href="/console/runs" current={path.startsWith('/console/runs') && !path.startsWith('/console/runs/')}>Runs</Link>
            <Link href="/console/lots" current={path.startsWith('/console/lots')}>Lots</Link>
            <Link href="/console/balance" current={path.startsWith('/console/balance')}>Balance</Link>
            <Link href="/console/certificates" current={path.startsWith('/console/certificates')}>Certificates</Link>
            <Link href="/console/quality" current={path.startsWith('/console/quality')}>Quality</Link>
            <Link href="/console/record" current={path.startsWith('/console/record')}>Record</Link>
            <Link href="/console/reconciliation" current={path.startsWith('/console/reconciliation')}>Reconciliation</Link>
            <Link href="/console/contracts" current={path.startsWith('/console/contracts')}>Contracts</Link>
          </nav>
        ) : (
          <nav class="nav" aria-label="Public">
            <Link href="/product" current={path === '/product'}>Product</Link>
            <Link href="/technology" current={path === '/technology'}>Technology</Link>
            <Link href="/about" current={path === '/about'}>About</Link>
            <Link href="/careers" current={path === '/careers'}>Careers</Link>
            <Link href="/news" current={path === '/news'}>News</Link>
            <Link href="/contact" current={path === '/contact'}>Contact</Link>
          </nav>
        )}
        <span class="who">
          {me ? `${me.name} · ${me.roles.join(', ')}` : (isConsole ? null : <Link href="/login">Sign in</Link>)}
          {me ? <Link href="/logout" aria-label="Sign out" style="margin-left:1rem">Sign out</Link> : null}
        </span>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="cols">
        <div>
          <div class="wordmark" style="font-size:var(--step-body-big);line-height:var(--lh-body-big)">Ravel</div>
          <p class="small" style="margin-top:0.75rem;max-width:none">Ravel Materials SAS<br />
            14 rue des Pêcheurs, 69002 Lyon, France</p>
        </div>
        <div>
          <p class="eyebrow">Site</p>
          <ul style="list-style:none;padding:0;margin:0">
            <li><Link href="/product">Product</Link></li>
            <li><Link href="/technology">Technology</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/careers">Careers</Link></li>
          </ul>
        </div>
        <div>
          <p class="eyebrow">Company</p>
          <ul style="list-style:none;padding:0;margin:0">
            <li><Link href="/news">News</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
          </ul>
        </div>
        <div>
          <p class="eyebrow">Verification</p>
          <p class="small" style="max-width:none">Every certificate we issue can be checked by anybody, with no account:<br />
            <span class="mono">ravel.example.com/verify/&lt;number&gt;</span></p>
        </div>
      </div>
    </footer>
  );
}

export function useMe() {
  const [me, setMe] = useState(undefined);
  useEffect(() => {
    if (!getToken()) { setMe(null); return; }
    api('/api/auth/me').then((r) => setMe(r.ok ? r.data : null));
  }, []);
  return me;
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { api: apiFn, setToken } = await import('../api.js');
    const r = await apiFn('/api/auth/login', { method: 'POST', body: { email, password } });
    setBusy(false);
    if (!r.ok) {
      setError('Sign in was refused. Check the address and password, or contact your administrator.');
      return;
    }
    setToken(r.data.access_token);
    location.href = '/console';
  }

  return (
    <main style="max-width:26rem">
      <h1>Sign in</h1>
      <p>Signup is closed. The seeded accounts are the only accounts.</p>
      {error ? <Banner kind="refused" title="Sign in refused">{error}</Banner> : null}
      <form onSubmit={submit}>
        <div style="margin-bottom:1rem">
          <label for="email">Email</label>
          <input id="email" type="email" required value={email} onInput={(e) => setEmail(e.target.value)} autocomplete="username" />
        </div>
        <div style="margin-bottom:1.5rem">
          <label for="password">Password</label>
          <input id="password" type="password" required value={password} onInput={(e) => setPassword(e.target.value)} autocomplete="current-password" />
        </div>
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

export function Logout() {
  useEffect(() => {
    clearToken();
    location.href = '/login';
  }, []);
  return <main><p>Signing out.</p></main>;
}


import { useEffect, useState } from 'preact/hooks';
import { Link } from './lib/router.jsx';
import { meNow, logout, getStoredToken } from './lib/api.js';

export function Shell({ children }) {
  const [me, setMe] = useState(null);
  const [checked, setChecked] = useState(false);
  const isConsole = window.location.pathname.startsWith('/console');

  useEffect(() => {
    let alive = true;
    if (getStoredToken()) {
      meNow().then((m) => { if (alive) { setMe(m); setChecked(true); } });
    } else {
      setChecked(true);
    }
    const onNav = () => {
      const p = window.location.pathname;
      if (p.startsWith('/console') && getStoredToken()) {
        meNow().then((m) => { if (alive) setMe(m); });
      }
    };
    return () => { alive = false; };
  }, []);

  return (
    <div class="shell">
      <a class="skip-link" href="#main">Skip to content</a>
      <header class="topbar">
        <div class="topbar-inner">
          <Link href="/" class="brand" aria-label="Ravel home">Ravel</Link>
          <nav class="topnav" aria-label="Main">
            <Link href="/product">Product</Link>
            <Link href="/technology">Technology</Link>
            <Link href="/about">About</Link>
            <Link href="/news">News</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <div class="topbar-right">
            {me ? (
              <>
                <Link href="/console" class="nav-me">{typeof me.name === 'string' && me.name ? me.name : me.email}</Link>
                <button type="button" class="btn-quiet" onClick={() => { logout(); window.location.href = '/'; }}>Sign out</button>
              </>
            ) : (
              <Link href="/login" class="btn-quiet">Sign in</Link>
            )}
          </div>
        </div>
      </header>
      
      {children}
      <footer class="footer">
        <div class="footer-inner">
          <p class="footer-line">Ravel Materials SAS, 12 rue de la Récupération, 69003 Lyon, France.</p>
          <nav aria-label="Footer">
            <Link href="/privacy">Privacy</Link>
            <Link href="/contact">Contact</Link>
            <span class="footer-note">Verify a certificate at ravel.example.com/verify/{''}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

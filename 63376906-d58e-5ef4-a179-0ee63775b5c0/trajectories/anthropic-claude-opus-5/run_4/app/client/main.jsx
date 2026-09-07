import { render } from 'preact';
import { LocationProvider, Router, Route, useLocation, lazy, ErrorBoundary } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';
import './styles.css';
import { api, getToken, logout } from './api.js';

import Home from './routes/Home.jsx';
import Product from './routes/Product.jsx';
import Technology from './routes/Technology.jsx';
import About from './routes/About.jsx';
import Careers from './routes/Careers.jsx';
import News from './routes/News.jsx';
import Contact from './routes/Contact.jsx';
import Privacy from './routes/Privacy.jsx';
import Verify from './routes/Verify.jsx';
import Login from './routes/Login.jsx';

const Console = lazy(() => import('./console/Console.jsx'));

const PUBLIC_NAV = [
  ['/product', 'Product'],
  ['/technology', 'Technology'],
  ['/about', 'About'],
  ['/careers', 'Careers'],
  ['/news', 'News'],
  ['/contact', 'Contact'],
];

const CONSOLE_NAV = [
  ['/console', 'Board'],
  ['/console/intake', 'Intake'],
  ['/console/record', 'Record'],
  ['/console/reconciliation', 'Reconciliation'],
  ['/console/certificates', 'Certificates'],
];

function TopBar({ session, onSignOut }) {
  const { path } = useLocation();
  const inConsole = path.startsWith('/console');
  const nav = inConsole ? CONSOLE_NAV : PUBLIC_NAV;
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href={inConsole ? '/console' : '/'}>Ravel</a>
        <nav class="nav" aria-label={inConsole ? 'Console' : 'Site'}>
          {nav.map(([href, label]) => (
            <a
              key={href}
              class="nav-link"
              href={href}
              aria-current={path === href || (href !== '/console' && path.startsWith(href)) ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
          {session ? (
            <>
              <span class="nav-link" style="color:var(--ink)">{session.name}</span>
              <button class="btn btn-quiet" type="button" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <a class="nav-link" href="/login">Sign in</a>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="footer">
      <div class="page">
        <div class="grid grid-3">
          <div>
            <p class="t-eyebrow">Ravel</p>
            <p class="t-small">
              Ravel Materials SAS produces low-carbon, virgin-quality recycled polymers,
              starting with nylon.
            </p>
          </div>
          <div>
            <p class="t-eyebrow">Routes</p>
            <p class="t-small">
              {PUBLIC_NAV.map(([h, l]) => <><a href={h}>{l}</a><br /></>)}
              <a href="/privacy">Privacy</a>
            </p>
          </div>
          <div>
            <p class="t-eyebrow">Contact</p>
            <p class="t-small">
              Enquiries: <a href="/contact">the contact route</a><br />
              Privacy and rights requests: <a href="mailto:privacy@example.com">privacy@example.com</a><br />
              Disclosure: <a href="mailto:security@example.com">security@example.com</a>
            </p>
          </div>
        </div>
        <hr />
        <p class="t-small">
          Verify a certificate at ravel.example.com/verify/&#123;number&#125;. Ravel Materials SAS,
          14 rue des Fabriques, 69007 Lyon, France.
        </p>
      </div>
    </footer>
  );
}

function Guard({ children }) {
  const { route } = useLocation();
  useEffect(() => {
    // The console is reached only with a session.
    if (!getToken()) route('/login', true);
  }, []);
  if (!getToken()) return <p class="loading page">Redirecting to sign in…</p>;
  return children;
}

function NotFound() {
  return (
    <main class="page public" style="padding:4rem 1.5rem">
      <p class="t-eyebrow">Not found</p>
      <h1>There is no page at this address.</h1>
      <p class="t-big">Return to <a href="/">the home route</a>, or verify a certificate at
        <code> /verify/&#123;number&#125;</code>.</p>
    </main>
  );
}

function App() {
  const { path } = useLocation();
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!getToken()) { setSession(null); return; }
    api('/auth/me').then(setSession).catch(() => { logout(); setSession(null); });
  }, [path]);

  const inConsole = path.startsWith('/console');

  return (
    <>
      <a class="skip" href="#main">Skip to content</a>
      <TopBar session={session} onSignOut={() => { logout(); setSession(null); location.href = '/'; }} />
      <main id="main" class={inConsole ? 'console' : 'public'}>
        <ErrorBoundary>
          <Router>
            <Route path="/" component={Home} />
            <Route path="/product" component={Product} />
            <Route path="/technology" component={Technology} />
            <Route path="/about" component={About} />
            <Route path="/careers" component={Careers} />
            <Route path="/news" component={News} />
            <Route path="/contact" component={Contact} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/verify/:number" component={Verify} />
            <Route path="/login" component={() => <Login onSession={setSession} />} />
            <Route path="/console" component={() => <Guard><Console session={session} /></Guard>} />
            <Route
              path="/console/:rest*"
              component={() => <Guard><Console session={session} /></Guard>}
            />
            <Route default component={NotFound} />
          </Router>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}

render(
  <LocationProvider><App /></LocationProvider>,
  document.getElementById('app')
);

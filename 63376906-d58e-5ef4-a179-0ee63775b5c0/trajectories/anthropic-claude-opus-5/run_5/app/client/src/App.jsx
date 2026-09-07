import { useEffect, useState } from 'preact/hooks';
import { useRoute, Link, api, getToken, setToken, navigate } from './lib.jsx';
import { Home, Product, Technology, About, Careers, News, Contact, Privacy, Verify, NotFound } from './routes/Public.jsx';
import { Login } from './routes/Login.jsx';

// The console is loaded only when a console route is opened, so no public route
// loads a chunk it does not use.
let ConsoleComponent = null;
let consolePromise = null;
function loadConsole() {
  if (!consolePromise) consolePromise = import('./console/Console.jsx').then((m) => { ConsoleComponent = m.Console; return m.Console; });
  return consolePromise;
}

function LazyConsole(props) {
  const [ready, setReady] = useState(!!ConsoleComponent);
  useEffect(() => {
    if (!ConsoleComponent) loadConsole().then(() => setReady(true));
  }, []);
  if (!ready || !ConsoleComponent) {
    return (
      <div class="page section">
        <p class="loading" role="status">Loading the console.</p>
      </div>
    );
  }
  const C = ConsoleComponent;
  return <C {...props} />;
}

const PUBLIC_NAV = [
  ['/', 'Home'],
  ['/product', 'Product'],
  ['/technology', 'Technology'],
  ['/about', 'About'],
  ['/careers', 'Careers'],
  ['/news', 'News'],
  ['/contact', 'Contact'],
];

export function App() {
  const path = useRoute();
  const token = getToken();
  const [session, setSession] = useState({ loading: !!token, me: null, forToken: null });

  useEffect(() => {
    if (!token) {
      setSession({ loading: false, me: null, forToken: null });
      return;
    }
    if (session.forToken === token) return;
    setSession((s) => ({ ...s, loading: true }));
    api('/auth/me')
      .then((me) => setSession({ loading: false, me, forToken: token }))
      .catch(() => {
        setToken(null);
        setSession({ loading: false, me: null, forToken: null });
      });
  }, [token, path]);

  const isConsole = path === '/console' || path.startsWith('/console/');

  // The console is reached only with a session; an anonymous reader is
  // redirected to /login. A reader who has just signed in holds a token whose
  // identity has not resolved yet, and waits rather than being bounced.
  useEffect(() => {
    if (isConsole && !token) navigate('/login', true);
  }, [isConsole, token]);

  if (isConsole) {
    if (!session.me) {
      return (
        <div class="page section">
          <p class="loading" role="status">
            {token ? 'Loading the console.' : 'Redirecting to the sign-in route.'}
          </p>
        </div>
      );
    }
    return (
      <LazyConsole
        path={path}
        me={session.me}
        onSignOut={() => {
          setToken(null);
          setSession({ loading: false, me: null, forToken: null });
          navigate('/login');
        }}
      />
    );
  }

  return (
    <div class="public">
      <a class="skip" href="#main">Skip to the main content</a>
      <TopBar path={path} me={session.me} />
      <main id="main">{renderPublic(path)}</main>
      <Footer />
    </div>
  );
}

function renderPublic(path) {
  if (path === '/') return <Home />;
  if (path === '/product') return <Product />;
  if (path === '/technology') return <Technology />;
  if (path === '/about') return <About />;
  if (path === '/careers') return <Careers />;
  if (path === '/news') return <News />;
  if (path === '/contact') return <Contact />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/login') return <Login />;
  const m = /^\/verify\/([^/]+)$/.exec(path);
  if (m) return <Verify number={decodeURIComponent(m[1])} />;
  return <NotFound path={path} />;
}

function TopBar({ path, me }) {
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <Link href="/" class="brand">Ravel</Link>
        <nav class="nav" aria-label="Main">
          {PUBLIC_NAV.map(([href, label]) => (
            <Link key={href} href={href} class="nav-link" aria-current={path === href ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <span class="spacer" />
        {me ? (
          <Link href="/console" class="nav-link">Console</Link>
        ) : (
          <Link href="/login" class="nav-link">Sign in</Link>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="footer">
      <div class="page">
        <div class="grid-3">
          <div>
            <p class="t-eyebrow">Ravel Materials SAS</p>
            <p class="t-body-small">
              Low-carbon, virgin-quality recycled polymers.
              <br />
              14 rue des Fabriques, 69007 Lyon, France
            </p>
          </div>
          <div>
            <p class="t-eyebrow">Routes</p>
            <p class="t-body-small">
              {PUBLIC_NAV.map(([href, label]) => (
                <span key={href}>
                  <Link href={href}>{label}</Link>
                  <br />
                </span>
              ))}
              <Link href="/privacy">Privacy</Link>
            </p>
          </div>
          <div>
            <p class="t-eyebrow">Verification</p>
            <p class="t-body-small">
              A certificate is verified at <span class="mono">ravel.example.com/verify/&#123;number&#125;</span> without an account.
              <br />
              Disclosure: <a href="mailto:security@example.com">security@example.com</a>
              <br />
              Privacy: <a href="mailto:privacy@example.com">privacy@example.com</a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

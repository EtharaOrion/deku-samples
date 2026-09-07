import { useEffect } from 'preact/hooks';
import { useRoute, match, Link, navigate } from './lib/router.jsx';
import { getUser, getToken, clearSession } from './lib/api.js';

import { Home, Product, Technology, About, Careers, News, Contact, Privacy } from './pages/public.jsx';
import { Verify } from './pages/verify.jsx';
import { Login } from './pages/login.jsx';
import { Board, RunDetail } from './console/board.jsx';
import { BalanceList, Balance } from './console/balance.jsx';
import { Genealogy, Impact } from './console/genealogy.jsx';
import {
  WizardLot, WizardClaim, WizardRecipient, WizardReview, CertificateList, CertificateDetail,
} from './console/certificates.jsx';
import { Intake, BatchDetail, LotList, RecordView, Reconciliation } from './console/views.jsx';

const PUBLIC_NAV = [
  ['/', 'Home'], ['/product', 'Product'], ['/technology', 'Technology'], ['/about', 'About'],
  ['/careers', 'Careers'], ['/news', 'News'], ['/contact', 'Contact'], ['/privacy', 'Privacy'],
];

// Navigation across the console is a persistent top bar.
const CONSOLE_NAV = [
  ['/console', 'Board'],
  ['/console/intake', 'Intake'],
  ['/console/record', 'Record'],
  ['/console/reconciliation', 'Reconciliation'],
  ['/console/certificates', 'Certificates'],
  ['/console/balance', 'Balance'],
  ['/console/lots', 'Lots'],
];

export function App() {
  const path = useRoute();
  const isConsole = path === '/console' || path.startsWith('/console/');
  const user = getUser();

  // The console is reached only with a session: everything under it redirects
  // an anonymous reader to /login.
  useEffect(() => {
    if (isConsole && !getToken()) navigate('/login', { replace: true });
  }, [isConsole, path]);

  return (
    <>
      <a class="skip-link" href="#main">Skip to content</a>
      <TopBar path={path} isConsole={isConsole} user={user} />
      <main id="main">
        <Routes path={path} isConsole={isConsole} />
      </main>
      <Footer />
    </>
  );
}

function TopBar({ path, isConsole, user }) {
  const items = isConsole ? CONSOLE_NAV : PUBLIC_NAV;
  const current = (href) =>
    href === '/console' || href === '/'
      ? path === href
      : path === href || path.startsWith(href + '/');
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <Link href={isConsole ? '/console' : '/'} class="brand">Ravel</Link>
        <nav class="nav" aria-label={isConsole ? 'Console' : 'Site'}>
          {items.map(([href, label]) => (
            <Link key={href} href={href} class="nav-link"
              aria-current={current(href) ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        <div style="margin-left:auto;display:flex;gap:.75rem;align-items:center">
          {user ? (
            <>
              <span class="label" style="text-transform:none">
                {user.name} · {(user.roles || []).map((r) => r.replace(/_/g, ' ')).join(', ')}
              </span>
              <button onClick={() => { clearSession(); navigate('/'); }}>Sign out</button>
            </>
          ) : (
            <Link href="/login" class="nav-link">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="footer">
      <div class="wrap">
        <p style="margin:0 0 .5rem">
          Ravel Materials SAS · 14 rue des Fabriques, 69007 Lyon, France
        </p>
        <p class="note" style="margin:0">
          <Link href="/privacy">Privacy</Link> ·{' '}
          <span class="mono">privacy@example.com</span> ·{' '}
          <span class="mono">security@example.com</span>
        </p>
      </div>
    </footer>
  );
}

function Routes({ path, isConsole }) {
  let m;

  /* ------------------------------------------------------ public routes */
  if (path === '/') return <Home />;
  if (path === '/product') return <Product />;
  if (path === '/technology') return <Technology />;
  if (path === '/about') return <About />;
  if (path === '/careers') return <Careers />;
  if (path === '/news') return <News />;
  if (path === '/contact') return <Contact />;
  if (path === '/privacy') return <Privacy />;
  if ((m = match('/verify/:number', path))) return <Verify number={m.number} />;
  if (path === '/login') return <Login />;

  /* ----------------------------------------------------- console routes */
  if (isConsole && !getToken()) {
    return <div class="wrap" style="padding-top:3rem"><p class="note">Redirecting to sign in…</p></div>;
  }
  if (path === '/console') return <Board />;
  if (path === '/console/intake') return <Intake />;
  if (path === '/console/record') return <RecordView />;
  if (path === '/console/reconciliation') return <Reconciliation />;
  if (path === '/console/certificates') return <CertificateList />;
  if (path === '/console/certificates/new/lot') return <WizardLot />;
  if (path === '/console/certificates/new/claim') return <WizardClaim />;
  if (path === '/console/certificates/new/recipient') return <WizardRecipient />;
  if (path === '/console/certificates/new/review') return <WizardReview />;
  if (path === '/console/balance') return <BalanceList />;
  if (path === '/console/lots') return <LotList />;
  if ((m = match('/console/certificates/:number', path))) return <CertificateDetail number={m.number} />;
  if ((m = match('/console/balance/:id', path))) return <Balance id={m.id} />;
  if ((m = match('/console/lots/:reference/genealogy', path))) return <Genealogy reference={m.reference} />;
  if ((m = match('/console/batches/:reference/impact', path))) return <Impact reference={m.reference} />;
  if ((m = match('/console/batches/:reference', path))) return <BatchDetail reference={m.reference} />;
  if ((m = match('/console/runs/:reference', path))) return <RunDetail reference={m.reference} />;

  return (
    <div class="wrap stack" style="padding-top:3rem">
      <h1 class="t-h3">There is no such page</h1>
      <p class="note">
        The address <span class="mono">{path}</span> does not resolve.{' '}
        <Link href="/">Return to the home page</Link>.
      </p>
    </div>
  );
}

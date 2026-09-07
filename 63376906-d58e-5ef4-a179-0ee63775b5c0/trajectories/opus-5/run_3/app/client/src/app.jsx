import { useEffect, useState } from 'preact/hooks';
import { storedSession, clearSession, api } from './api.js';
import { Link, navigate, useRoute, match } from './router.jsx';
import {
  Home, Product, Technology, About, Careers, News, Contact, Privacy, Verify, NotFound
} from './routes/public.jsx';
import { Login, Board, Intake, BatchDetail, Lots, LotDetail } from './routes/console.jsx';
import { Genealogy } from './routes/genealogy.jsx';
import { BalanceList, BalanceDetail } from './routes/balance.jsx';
import { CertificateWizard, CertificateList, CertificateDetail } from './routes/certificates.jsx';
import {
  RecordView, Reconciliation, OverrideDetail, RunDetail, DeviationDetail,
  SiteDetail, Contracts, Collectors, Inbound
} from './routes/record.jsx';
import { StateWord } from './components/primitives.jsx';

const PUBLIC_NAV = [
  ['/', 'Home'], ['/product', 'Product'], ['/technology', 'Technology'],
  ['/about', 'About'], ['/careers', 'Careers'], ['/news', 'News'], ['/contact', 'Contact']
];

const CONSOLE_NAV = [
  ['/console', 'Board'],
  ['/console/intake', 'Intake'],
  ['/console/record', 'Record'],
  ['/console/reconciliation', 'Reconciliation'],
  ['/console/certificates', 'Certificates']
];

/** The chrome is one persistent top bar and one footer, identical on every
 *  route. Navigation across the console is that same top bar. */
function TopBar({ path, session, onSignOut }) {
  const inConsole = path.startsWith('/console');
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);

  return (
    <header class="top-bar">
      <div class="top-bar-inner">
        <Link href={inConsole ? '/console' : '/'} class="wordmark">
          Ravel
          {inConsole && <span class="wordmark-console">console</span>}
        </Link>

        <button type="button" class="nav-toggle" aria-expanded={open}
          aria-controls="primary-nav" onClick={() => setOpen((o) => !o)}>
          {/* An icon-only control carries a label. */}
          <span class="nav-toggle-bars" aria-hidden="true"><span /><span /><span /></span>
          <span class="visually-hidden">{open ? 'Close the menu' : 'Open the menu'}</span>
        </button>

        <nav id="primary-nav" class={`primary-nav ${open ? 'primary-nav-open' : ''}`}
          aria-label={inConsole ? 'Console sections' : 'Site sections'}>
          <ul>
            {(inConsole ? CONSOLE_NAV : PUBLIC_NAV).map(([href, label]) => {
              const current = href === '/console' || href === '/'
                ? path === href
                : path.startsWith(href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={current ? 'page' : undefined}
                    class={current ? 'nav-current' : ''}>{label}</Link>
                </li>
              );
            })}
          </ul>
          <div class="top-bar-session">
            {session ? (
              <>
                <span class="t-label session-who">
                  {session.name}
                  <span class="session-roles">{(session.roles || []).join(', ').replace(/_/g, ' ')}</span>
                </span>
                <button type="button" onClick={onSignOut}>Sign out</button>
              </>
            ) : (
              !inConsole && <Link href="/login" class="button">Sign in</Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="site-footer">
      <div class="page footer-inner">
        <div>
          <p class="t-label">Ravel Materials SAS</p>
          <p class="t-small t-muted">
            14 rue des Fabriques, 69007 Lyon, France. Scheme RCS-2026, producer registration
            REG-RAVEL-0042.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul class="footer-links">
            {PUBLIC_NAV.map(([href, label]) => (
              <li key={href}><Link href={href}>{label}</Link></li>
            ))}
            <li><Link href="/privacy">Privacy</Link></li>
          </ul>
        </nav>
        <p class="t-small t-muted">
          Verify a certificate at <span class="t-mono">ravel.example.com/verify/&#123;number&#125;</span>.
          Report a security issue to{' '}
          <a href="mailto:security@example.com" class="t-mono">security@example.com</a>.
        </p>
      </div>
    </footer>
  );
}

/** Where a site's certification is suspended, every surface that can issue
 *  anything says so, names the effective window and links to the enumeration of
 *  affected certificates. It is not dismissible: there is no control to
 *  dismiss it. */
function SchemeBanner({ session }) {
  const [suspensions, setSuspensions] = useState([]);
  useEffect(() => {
    if (!session) return;
    api('/sites').then(async (sites) => {
      const out = [];
      for (const s of sites) {
        try {
          const periods = await api(`/sites/${s.reference}/certification`);
          const today = new Date().toISOString().slice(0, 10);
          const live = periods.filter((p) => p.state === 'suspended'
            && p.effective_from <= today && (!p.effective_to || p.effective_to >= today));
          for (const p of live) out.push({ site: s.reference, ...p });
        } catch { /* a site without a certification history is not suspended */ }
      }
      setSuspensions(out);
    }).catch(() => {});
  }, [session]);

  if (!suspensions.length) return null;
  return (
    <div class="scheme-banner" role="alert">
      {suspensions.map((s) => (
        <div key={`${s.site}-${s.reference}`}>
          <StateWord word="certification suspended" />
          <p class="statement">
            {s.site} certification is suspended from {s.effective_from}
            {s.effective_to ? ` to ${s.effective_to}` : ''}. Reason: {s.reason || 'not stated'}.
            Issuing has stopped for this site.
          </p>
          <Link href={`/console/sites/${s.site}`}>
            The certificates signed inside that window
          </Link>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const path = useRoute();
  const [session, setSession] = useState(storedSession);

  useEffect(() => { setSession(storedSession()); }, [path]);

  // The console is reached only with a session: /console and everything under
  // it redirect an anonymous reader to /login.
  useEffect(() => {
    if (path.startsWith('/console') && !storedSession()) {
      navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
    }
  }, [path]);

  function signOut() {
    clearSession();
    setSession(null);
    navigate('/');
  }

  const inConsole = path.startsWith('/console');

  return (
    <>
      <a href="#main" class="skip-link">Skip to the main content</a>
      <TopBar path={path} session={session} onSignOut={signOut} />
      <main id="main" class={inConsole ? 'main-console' : 'main-public'}>
        {inConsole && <SchemeBanner session={session} />}
        <Routes path={path} session={session} />
      </main>
      <Footer />
    </>
  );
}

function Routes({ path, session }) {
  let m;

  /* ---------------------------------------------------------- public site */
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

  /* -------------------------------------------------------------- console */
  if (path.startsWith('/console') && !session) {
    return <p class="page t-muted">Redirecting to sign in.</p>;
  }

  if (path === '/console') return <Board />;
  if (path === '/console/intake') return <Intake />;
  if (path === '/console/record') return <RecordView />;
  if (path === '/console/reconciliation') return <Reconciliation />;
  if (path === '/console/lots') return <Lots />;
  if (path === '/console/balance') return <BalanceList />;
  if (path === '/console/contracts') return <Contracts />;
  if (path === '/console/collectors') return <Collectors />;
  if (path === '/console/inbound') return <Inbound />;
  if (path === '/console/certificates') return <CertificateList />;

  // Four steps, four addresses.
  if ((m = match('/console/certificates/new/:step', path))) {
    if (['lot', 'claim', 'recipient', 'review'].includes(m.step)) {
      return <CertificateWizard step={m.step} />;
    }
  }
  if ((m = match('/console/certificates/:number', path))) {
    return <CertificateDetail number={m.number} />;
  }
  if ((m = match('/console/lots/:reference/genealogy', path))) {
    return <Genealogy reference={m.reference} />;
  }
  if ((m = match('/console/lots/:reference', path))) return <LotDetail reference={m.reference} />;
  if ((m = match('/console/batches/:reference', path))) return <BatchDetail reference={m.reference} />;
  if ((m = match('/console/balance/:id', path))) return <BalanceDetail id={m.id} />;
  if ((m = match('/console/overrides/:reference', path))) return <OverrideDetail reference={m.reference} />;
  if ((m = match('/console/runs/:reference', path))) return <RunDetail reference={m.reference} />;
  if ((m = match('/console/deviations/:reference', path))) return <DeviationDetail reference={m.reference} />;
  if ((m = match('/console/sites/:reference', path))) return <SiteDetail reference={m.reference} />;

  return <NotFound />;
}

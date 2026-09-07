import { useEffect } from 'preact/hooks';
import { useRoute, Link, navigate, match } from './router.jsx';
import { storedSession, clearSession, api } from './api.js';
import {
  Home, Product, Technology, About, Careers, News, Contact, Privacy, Verify, NotFound,
} from './pages/public.jsx';
import { Login, Board, Intake, BatchDetail, RunDetail } from './console/console.jsx';
import { Genealogy } from './console/genealogy.jsx';
import { Balance, BalanceList } from './console/balance.jsx';
import {
  WizardLot, WizardClaim, WizardRecipient, WizardReview, CertificateList, CertificateDetail,
} from './console/certificates.jsx';
import { RecordView, Reconciliation, LotList } from './console/record.jsx';

const PUBLIC_NAV = [
  ['/', 'Home'], ['/product', 'Product'], ['/technology', 'Technology'], ['/about', 'About'],
  ['/careers', 'Careers'], ['/news', 'News'], ['/contact', 'Contact'], ['/privacy', 'Privacy'],
];

const CONSOLE_NAV = [
  ['/console', 'Board'], ['/console/intake', 'Intake'], ['/console/lots', 'Lots'],
  ['/console/balance', 'Balance'], ['/console/certificates', 'Certificates'],
  ['/console/record', 'Record'], ['/console/reconciliation', 'Reconciliation'],
];

const META = {
  '/': ['Ravel — Tomorrow\'s materials. Made from today\'s waste.',
        'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.'],
  '/product': ['Product — Ravel',
               'Low-carbon, virgin-quality recycled Nylon 6 and 6,6, with the specification and the claim beside the grade.'],
  '/technology': ['Technology — Ravel',
                  'Dissolution, depolymerisation, purification and repolymerisation, with mass in and mass out per stage.'],
  '/about': ['About — Ravel',
             'Who we are, and the published figures with their source, year and geography.'],
  '/careers': ['Careers — Ravel', 'Why this problem matters, and the roles open at Ravel.'],
  '/news': ['News — Ravel', 'Coverage of Ravel, one event listed once with its outlet and date.'],
  '/contact': ['Contact — Ravel',
               'Four enquiry types, four destinations and four stated response times.'],
  '/privacy': ['Privacy — Ravel',
               'Who controls your data, what it is used for, how long it is kept and how to have it removed.'],
};

function setMeta(path) {
  let entry = META[path];
  let noindex = false;
  if (path.startsWith('/verify/')) {
    entry = [`Verify ${path.slice(8)} — Ravel`,
             'Check a Ravel certificate by its number.'];
    noindex = true;
  } else if (path.startsWith('/console') || path === '/login') {
    entry = ['Console — Ravel', 'The Ravel operational record.'];
    noindex = true;
  } else if (!entry) {
    entry = ['Not found — Ravel', 'There is no page at this address.'];
    noindex = true;
  }
  document.title = entry[0];
  let d = document.querySelector('meta[name="description"]');
  if (!d) {
    d = document.createElement('meta');
    d.setAttribute('name', 'description');
    document.head.appendChild(d);
  }
  d.setAttribute('content', entry[1]);
  let r = document.querySelector('meta[name="robots"]');
  if (noindex) {
    if (!r) {
      r = document.createElement('meta');
      r.setAttribute('name', 'robots');
      document.head.appendChild(r);
    }
    r.setAttribute('content', 'noindex');
  } else if (r) {
    r.remove();
  }
}

function TopBar({ path }) {
  const inConsole = path.startsWith('/console');
  const session = storedSession();
  const items = inConsole ? CONSOLE_NAV : PUBLIC_NAV;
  return (
    <header class="topbar">
      <div class="topbar__inner">
        <Link href={inConsole ? '/console' : '/'} class="wordmark">Ravel</Link>
        <nav class="nav" aria-label={inConsole ? 'Console' : 'Site'}>
          {items.map(([href, label]) => (
            <Link href={href} key={href}
                  aria-current={href === path || (href !== '/' && href !== '/console' && path.startsWith(href))
                    ? 'page' : undefined}>
              {label}
            </Link>
          ))}
          {inConsole && session ? (
            <>
              <span class="note body-small" style="padding:0 0.5rem">
                {session.name} · {(session.roles || []).join(', ').replace(/_/g, ' ')}
              </span>
              <a href="/login" onClick={(e) => { e.preventDefault(); clearSession(); navigate('/login'); }}>
                Sign out
              </a>
            </>
          ) : null}
          {!inConsole ? <Link href="/console">Console</Link> : null}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="footer">
      <div class="footer__inner">
        <div class="stack-s">
          <p class="wordmark" style="font-size:var(--body-big-size);line-height:var(--body-big-line)">Ravel</p>
          <p class="note">
            Ravel Materials SAS<br />14 rue de la Manufacture<br />69007 Lyon, France
          </p>
        </div>
        <div class="stack-s">
          <p class="label">The site</p>
          {PUBLIC_NAV.slice(0, 4).map(([href, label]) => (
            <p key={href}><Link href={href} class="body-small">{label}</Link></p>
          ))}
        </div>
        <div class="stack-s">
          <p class="label">More</p>
          {PUBLIC_NAV.slice(4).map(([href, label]) => (
            <p key={href}><Link href={href} class="body-small">{label}</Link></p>
          ))}
        </div>
        <div class="stack-s">
          <p class="label">Contact</p>
          <p class="note"><a href="mailto:privacy@example.com">privacy@example.com</a></p>
          <p class="note"><a href="mailto:security@example.com">security@example.com</a></p>
          <p class="note">Verify a certificate at ravel.example.com/verify/&#123;number&#125;.</p>
        </div>
      </div>
    </footer>
  );
}

function route(path) {
  if (path === '/') return <Home />;
  if (path === '/product') return <Product />;
  if (path === '/technology') return <Technology />;
  if (path === '/about') return <About />;
  if (path === '/careers') return <Careers />;
  if (path === '/news') return <News />;
  if (path === '/contact') return <Contact />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/login') return <Login />;

  let m = match('/verify/:number', path);
  if (m) return <Verify number={m.number} />;

  // The console is reached only with a session.
  if (path.startsWith('/console')) {
    if (!storedSession()) {
      navigate('/login', true);
      return <Login />;
    }
    if (path === '/console') return <Board />;
    if (path === '/console/intake') return <Intake />;
    if (path === '/console/lots') return <LotList />;
    if (path === '/console/record') return <RecordView />;
    if (path === '/console/reconciliation') return <Reconciliation />;
    if (path === '/console/balance') return <BalanceList />;
    if (path === '/console/certificates') return <CertificateList />;
    if (path === '/console/certificates/new/lot') return <WizardLot />;
    if (path === '/console/certificates/new/claim') return <WizardClaim />;
    if (path === '/console/certificates/new/recipient') return <WizardRecipient />;
    if (path === '/console/certificates/new/review') return <WizardReview />;
    m = match('/console/balance/:id', path);
    if (m) return <Balance id={m.id} />;
    m = match('/console/batches/:reference', path);
    if (m) return <BatchDetail reference={m.reference} />;
    m = match('/console/runs/:reference', path);
    if (m) return <RunDetail reference={m.reference} />;
    m = match('/console/lots/:reference/genealogy', path);
    if (m) return <Genealogy reference={m.reference} />;
    m = match('/console/certificates/:number', path);
    if (m) return <CertificateDetail number={m.number} />;
  }
  return <NotFound />;
}

export function App() {
  const path = useRoute();
  useEffect(() => { setMeta(path); }, [path]);
  return (
    <>
      <a class="skip-link" href="#main">Skip to the main content</a>
      <TopBar path={path} />
      <main id="main" tabindex="-1">{route(path)}</main>
      <Footer />
    </>
  );
}

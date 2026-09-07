import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import './styles.css';

import { readSession, writeSession, words } from './api.js';
import {
  About, Careers, Contact, Home, News, Privacy, Product, PublicNotFound, Technology, Verify,
} from './public.jsx';
import {
  BatchDetail, Board, Intake, Login, Reconciliation, Record, RecordEntry, RunDetail,
} from './console.jsx';
import { Balance, BalancePeriod, Genealogy, LotDetail, Lots } from './balance.jsx';
import {
  CertificateDetail, Certificates, WizardClaim, WizardLot, WizardRecipient, WizardReview,
} from './certificates.jsx';
import {
  ConsoleNotFound, Contracts, Deviations, Inbound, Overrides, Queries, Sites,
} from './more.jsx';

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
  ['/console/lots', 'Lots'],
  ['/console/balance', 'Balance'],
  ['/console/certificates', 'Certificates'],
  ['/console/record', 'Record'],
  ['/console/reconciliation', 'Reconciliation'],
];

// The chrome is one persistent top bar and one footer, identical on every route.
function TopBar() {
  const { path } = useLocation();
  const [session, setSession] = useState(readSession());
  const inConsole = path.startsWith('/console');
  useEffect(() => { setSession(readSession()); }, [path]);
  const signOut = () => { writeSession(null); location.assign('/'); };
  const items = inConsole ? CONSOLE_NAV : PUBLIC_NAV;
  const current = (href) => (href === '/console'
    ? path === '/console'
    : path === href || path.startsWith(`${href}/`));
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <a class="wordmark" href={inConsole ? '/console' : '/'}>Ravel</a>
        <nav class="nav" aria-label={inConsole ? 'Console' : 'Site'}>
          {items.map(([href, label]) => (
            <a key={href} href={href} aria-current={current(href) ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
        <div class="nav nav-spacer">
          {session ? (
            <>
              <span class="label" style="padding:0.35rem 0.6rem">
                {session.name} · {(session.roles || []).map(words).join(', ')}
              </span>
              {!inConsole && <a href="/console">Console</a>}
              <button class="btn btn-quiet" type="button" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <a href="/login">Sign in</a>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="footer">
      <div class="page">
        <p style="margin-bottom:0.5rem">
          Ravel Materials SAS, 14 rue des Fabriques, 69007 Lyon, France. Producer
          registration REG-RAVEL-0042 under the scheme RCS-2026.
        </p>
        <p style="margin-bottom:0.5rem">
          <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a> ·{' '}
          <a href="/news">News</a> · <a href="/careers">Careers</a> ·{' '}
          Report a vulnerability to <a href="mailto:security@example.com">security@example.com</a>
        </p>
        <p style="margin:0">
          Verify any certificate at ravel.example.com/verify/&#123;number&#125;, with no account.
        </p>
      </div>
    </footer>
  );
}

// The console is reached only with a session: everything under /console
// redirects an anonymous reader to /login.
function Guard({ children }) {
  const { path } = useLocation();
  const session = readSession();
  useEffect(() => {
    if (!session) location.assign(`/login?next=${encodeURIComponent(path)}`);
  }, [session, path]);
  if (!session) return <div class="page" style="padding-top:3rem"><p class="loading">Taking you to sign in…</p></div>;
  return children;
}

const guarded = (Component) => () => <Guard><Component /></Guard>;

function App() {
  return (
    <LocationProvider>
      <a class="skip-link" href="#main">Skip to the content</a>
      <TopBar />
      <main id="main" tabindex="-1">
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
          <Route path="/login" component={Login} />

          <Route path="/console" component={guarded(Board)} />
          <Route path="/console/intake" component={guarded(Intake)} />
          <Route path="/console/batches/:reference" component={guarded(BatchDetail)} />
          <Route path="/console/runs/:reference" component={guarded(RunDetail)} />
          <Route path="/console/lots" component={guarded(Lots)} />
          <Route path="/console/lots/:reference" component={guarded(LotDetail)} />
          <Route path="/console/lots/:reference/genealogy" component={guarded(Genealogy)} />
          <Route path="/console/balance" component={guarded(Balance)} />
          <Route path="/console/balance/:id" component={guarded(BalancePeriod)} />
          <Route path="/console/certificates" component={guarded(Certificates)} />
          <Route path="/console/certificates/new/lot" component={guarded(WizardLot)} />
          <Route path="/console/certificates/new/claim" component={guarded(WizardClaim)} />
          <Route path="/console/certificates/new/recipient" component={guarded(WizardRecipient)} />
          <Route path="/console/certificates/new/review" component={guarded(WizardReview)} />
          <Route path="/console/certificates/:number" component={guarded(CertificateDetail)} />
          <Route path="/console/record" component={guarded(Record)} />
          <Route path="/console/record/queries" component={guarded(Queries)} />
          <Route path="/console/record/:seq" component={guarded(RecordEntry)} />
          <Route path="/console/reconciliation" component={guarded(Reconciliation)} />
          <Route path="/console/overrides" component={guarded(Overrides)} />
          <Route path="/console/overrides/:reference" component={guarded(Overrides)} />
          <Route path="/console/deviations" component={guarded(Deviations)} />
          <Route path="/console/deviations/:reference" component={guarded(Deviations)} />
          <Route path="/console/contracts" component={guarded(Contracts)} />
          <Route path="/console/inbound" component={guarded(Inbound)} />
          <Route path="/console/sites" component={guarded(Sites)} />
          <Route path="/console/:rest*" component={guarded(ConsoleNotFound)} />
          <Route default component={PublicNotFound} />
        </Router>
      </main>
      <Footer />
    </LocationProvider>
  );
}

render(<App />, document.getElementById('app'));

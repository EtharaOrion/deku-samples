import { useState, useEffect } from 'preact/hooks';
import { api, getToken, logout, setSession } from './api.js';
import { useRoute, match, navigate, useMeta } from './router.jsx';
import {
  PublicChrome, Home, Product, Technology, About, Careers, News, Contact, Privacy, Verify
} from './public.jsx';
import { Loading } from './components.jsx';

// The console is a separate chunk. A reader on a public route never downloads the
// operational record's surfaces, so no route loads a library it does not use.
let consoleModules = null;
let consolePromise = null;
function loadConsole() {
  if (consoleModules) return Promise.resolve(consoleModules);
  if (!consolePromise) {
    consolePromise = Promise.all([import('./console.jsx'), import('./certificates.jsx')])
      .then(([c, k]) => { consoleModules = { ...c, ...k }; return consoleModules; });
  }
  return consolePromise;
}

const PUBLIC_ROUTES = [
  ['/', Home], ['/product', Product], ['/technology', Technology], ['/about', About],
  ['/careers', Careers], ['/news', News], ['/contact', Contact], ['/privacy', Privacy]
];

const CONSOLE_ROUTES = [
  ['/console', 'Board'],
  ['/console/intake', 'Intake'],
  ['/console/record', 'RecordView'],
  ['/console/reconciliation', 'Reconciliation'],
  ['/console/certificates', 'Certificates'],
  ['/console/lots', 'Lots'],
  ['/console/balance', 'BalancePeriods'],
  ['/console/contracts', 'Contracts'],
  ['/console/certificates/new/lot', 'WizardLot'],
  ['/console/certificates/new/claim', 'WizardClaim'],
  ['/console/certificates/new/recipient', 'WizardRecipient'],
  ['/console/certificates/new/review', 'WizardReview'],
  ['/console/runs/:reference', 'RunDetail'],
  ['/console/batches/:reference', 'BatchDetail'],
  ['/console/batches/:reference/impact', 'BatchImpact'],
  ['/console/lots/:reference', 'LotDetail'],
  ['/console/lots/:reference/genealogy', 'Genealogy'],
  ['/console/lots/:reference/carbon', 'LotCarbon'],
  ['/console/balance/:id', 'Balance'],
  ['/console/certificates/:number', 'CertificateDetail'],
  ['/console/certificates/:number/replay', 'Replay'],
  ['/console/overrides/:reference', 'OverrideDetail'],
  ['/console/deviations/:reference', 'DeviationDetail'],
  ['/console/record/queries/:name', 'RecordQuery'],
  ['/console/record/:seq', 'RecordEntry']
];

function NotFound({ path }) {
  useMeta('Not found', 'There is nothing at this address.');
  return (
    <section class="section">
      <div class="wrap wrap-narrow">
        <h1>Nothing at this address</h1>
        <p class="t-big">
          There is no route at <span class="mono">{path}</span>. That is the whole answer.
        </p>
      </div>
    </section>
  );
}

export function App() {
  const path = useRoute();
  const [session, setSessionRaw] = useState(null);
  const setSessionState = (s) => { setSession(s); setSessionRaw(s); };
  const [checking, setChecking] = useState(true);
  const [mods, setMods] = useState(consoleModules);

  const needsConsole = path === '/login' || path === '/console' || path.startsWith('/console/');
  useEffect(() => {
    if (needsConsole && !mods) loadConsole().then(setMods);
  }, [needsConsole, mods]);

  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    api.get('/auth/me')
      .then((me) => { setSessionState(me); setChecking(false); })
      .catch(() => { logout(); setSessionState(null); setChecking(false); });
  }, []);

  function signOut() {
    logout();
    setSessionState(null);
    navigate('/login');
  }

  /* -------------------------------------------------- public verification */
  const verify = match('/verify/:number', path);
  if (verify) {
    return (
      <PublicChrome path={path}>
        <Verify number={verify.number} />
      </PublicChrome>
    );
  }

  /* ---------------------------------------------------------------- login */
  if (path === '/login') {
    if (session) { navigate('/console'); return null; }
    const next = new URLSearchParams(location.search).get('next');
    if (!mods) {
      return (
        <div class="shell">
          <main class="wrap section"><Loading what="the sign-in form" /></main>
        </div>
      );
    }
    const LoginView = mods.Login;
    return <LoginView onSignedIn={setSessionState} next={next} />;
  }

  /* -------------------------------------------------------------- console */
  if (path === '/console' || path.startsWith('/console/')) {
    if (checking) {
      return (
        <div class="shell">
          <main class="wrap section"><Loading what="your session" /></main>
        </div>
      );
    }
    // The console is reached only with a session.
    if (!session) {
      navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
      return null;
    }
    if (!mods) {
      return (
        <div class="shell">
          <main class="wrap section"><Loading what="the console" /></main>
        </div>
      );
    }
    let view = <NotFound path={path} />;
    for (const [pattern, name] of CONSOLE_ROUTES) {
      const params = match(pattern, path);
      if (params) {
        const Component = mods[name];
        view = <Component key={path} {...params} session={session} />;
        break;
      }
    }
    const ConsoleChrome = mods.ConsoleChrome;
    return (
      <ConsoleChrome path={path} session={session} onSignOut={signOut}>
        {view}
      </ConsoleChrome>
    );
  }

  /* --------------------------------------------------------- public site */
  const route = PUBLIC_ROUTES.find(([p]) => p === path);
  const View = route ? route[1] : null;
  return (
    <PublicChrome path={path}>
      {View ? <View /> : <NotFound path={path} />}
    </PublicChrome>
  );
}

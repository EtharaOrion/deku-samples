import { Link, useMeta, useApi, words } from '../lib.jsx';
import { Board } from './Board.jsx';
import { Intake } from './Intake.jsx';
import { RecordView } from './RecordView.jsx';
import { Reconciliation } from './Reconciliation.jsx';
import { Balance, BalanceIndex } from './Balance.jsx';
import { Genealogy, LotIndex, LotView } from './Lots.jsx';
import { Certificates, CertificateView, Wizard } from './Certificates.jsx';
import { RunView } from './RunView.jsx';

const SECTIONS = [
  ['/console', 'Board'],
  ['/console/intake', 'Intake'],
  ['/console/record', 'Record'],
  ['/console/reconciliation', 'Reconciliation'],
  ['/console/balance', 'Balance'],
  ['/console/lots', 'Lots'],
  ['/console/certificates', 'Certificates'],
];

export function Console({ path, me, onSignOut }) {
  return (
    <div class="console">
      <a class="skip" href="#console-main">Skip to the main content</a>
      <ConsoleBar path={path} me={me} onSignOut={onSignOut} />
      <SchemeBanner />
      <main id="console-main" class="page" style="padding-top:1.5rem;padding-bottom:3rem">
        {route(path, me)}
      </main>
    </div>
  );
}

function ConsoleBar({ path, me, onSignOut }) {
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <Link href="/console" class="brand">Ravel</Link>
        <span class="t-label-small muted">Console</span>
        <nav class="nav" aria-label="Console sections">
          {SECTIONS.map(([href, label]) => {
            const active = href === '/console' ? path === '/console' : path.startsWith(href);
            return (
              <Link key={href} href={href} class="nav-link" aria-current={active ? 'page' : undefined}>
                {label}
              </Link>
            );
          })}
        </nav>
        <span class="spacer" />
        <span class="t-label-small muted" style="max-width:22rem">
          {me.name} · {(me.roles || []).map(words).join(', ')} · {(me.sites || []).join(', ') || 'no site'}
        </span>
        <button type="button" class="btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}

// Where a site's certification is suspended, every surface that can issue
// anything says so. It is not dismissible.
function SchemeBanner() {
  const sites = useApi('/sites');
  const suspended = (sites.data || []).filter((s) => s.certification_state === 'suspended');
  if (!suspended.length) return null;
  return (
    <div class="page" style="padding-top:1rem">
      {suspended.map((s) => (
        <div key={s.reference} class="banner" role="alert">
          <h3>Certification suspended at {s.reference}</h3>
          <p>
            Issuing has stopped for this site. The suspension is named as the blocking condition on every certificate
            attempt at {s.name}.
          </p>
          <p class="note">
            <Link href={`/console/certificates?site=${s.reference}`}>The certificates signed inside the affected window</Link>
          </p>
        </div>
      ))}
    </div>
  );
}

function route(path, me) {
  if (path === '/console') return <Board />;
  if (path === '/console/intake') return <Intake me={me} />;
  if (path === '/console/record') return <RecordView me={me} />;
  if (path === '/console/reconciliation') return <Reconciliation />;
  if (path === '/console/balance') return <BalanceIndex />;
  if (path === '/console/lots') return <LotIndex />;
  if (path === '/console/certificates') return <Certificates me={me} />;

  // The reading of a period and the act of attaching claim to a lot are two
  // addresses on one surface. The reading carries no input control.
  let m = /^\/console\/balance\/([^/]+)\/allocate$/.exec(path);
  if (m) return <Balance id={decodeURIComponent(m[1])} me={me} allocating />;

  m = /^\/console\/balance\/([^/]+)$/.exec(path);
  if (m) return <Balance id={decodeURIComponent(m[1])} me={me} />;

  m = /^\/console\/lots\/([^/]+)\/genealogy$/.exec(path);
  if (m) return <Genealogy reference={decodeURIComponent(m[1])} me={me} />;

  m = /^\/console\/lots\/([^/]+)$/.exec(path);
  if (m) return <LotView reference={decodeURIComponent(m[1])} me={me} />;

  m = /^\/console\/runs\/([^/]+)$/.exec(path);
  if (m) return <RunView reference={decodeURIComponent(m[1])} />;

  m = /^\/console\/certificates\/new\/(lot|claim|recipient|review)$/.exec(path);
  if (m) return <Wizard step={m[1]} me={me} />;

  m = /^\/console\/certificates\/([^/]+)$/.exec(path);
  if (m) return <CertificateView number={decodeURIComponent(m[1])} me={me} />;

  return <ConsoleNotFound path={path} />;
}

function ConsoleNotFound({ path }) {
  useMeta('Not found — Ravel console', 'There is no console surface at this address.');
  return (
    <>
      <h1 class="display-2">There is no console surface at this address.</h1>
      <p style="margin-top:1rem">
        Nothing is served at <span class="mono">{path}</span>. The console sections are{' '}
        {SECTIONS.map(([href, label], i) => (
          <span key={href}>
            <Link href={href}>{label.toLowerCase()}</Link>
            {i < SECTIONS.length - 1 ? ', ' : '.'}
          </span>
        ))}
      </p>
    </>
  );
}

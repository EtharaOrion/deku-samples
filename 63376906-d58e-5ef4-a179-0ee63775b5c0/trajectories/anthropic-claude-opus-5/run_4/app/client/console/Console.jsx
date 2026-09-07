import { useLocation } from 'preact-iso';
import { useState, useEffect } from 'preact/hooks';
import { api } from '../api.js';
import Board from './Board.jsx';
import Intake from './Intake.jsx';
import RecordView from './RecordView.jsx';
import Reconciliation from './Reconciliation.jsx';
import Certificates from './Certificates.jsx';
import CertificateDetail from './CertificateDetail.jsx';
import Wizard from './Wizard.jsx';
import Balance from './Balance.jsx';
import BalanceIndex from './BalanceIndex.jsx';
import Genealogy from './Genealogy.jsx';
import LotView from './LotView.jsx';
import Lots from './Lots.jsx';
import RunView from './RunView.jsx';
import DeviationView from './DeviationView.jsx';
import OverrideView from './OverrideView.jsx';
import SiteView from './SiteView.jsx';
import CarbonView from './CarbonView.jsx';
import Contracts from './Contracts.jsx';

/**
 * The console's own routing. Every surface is at its own address, and each
 * address is reachable directly rather than only by clicking through.
 */
const ROUTES = [
  [/^\/console\/?$/, () => ({ C: Board, params: {} })],
  [/^\/console\/intake\/?$/, () => ({ C: Intake, params: {} })],
  [/^\/console\/record\/?$/, () => ({ C: RecordView, params: {} })],
  [/^\/console\/reconciliation\/?$/, () => ({ C: Reconciliation, params: {} })],
  [/^\/console\/certificates\/?$/, () => ({ C: Certificates, params: {} })],
  [/^\/console\/certificates\/new\/([^/]+)\/?$/, (m) => ({ C: Wizard, params: { step: m[1] } })],
  [/^\/console\/certificates\/([^/]+)\/?$/, (m) => ({ C: CertificateDetail, params: { number: m[1] } })],
  [/^\/console\/balance\/?$/, () => ({ C: BalanceIndex, params: {} })],
  [/^\/console\/balance\/([^/]+)\/?$/, (m) => ({ C: Balance, params: { id: m[1] } })],
  [/^\/console\/lots\/?$/, () => ({ C: Lots, params: {} })],
  [/^\/console\/lots\/([^/]+)\/genealogy\/?$/, (m) => ({ C: Genealogy, params: { reference: m[1] } })],
  [/^\/console\/lots\/([^/]+)\/carbon\/?$/, (m) => ({ C: CarbonView, params: { reference: m[1] } })],
  [/^\/console\/lots\/([^/]+)\/?$/, (m) => ({ C: LotView, params: { reference: m[1] } })],
  [/^\/console\/runs\/([^/]+)\/?$/, (m) => ({ C: RunView, params: { reference: m[1] } })],
  [/^\/console\/deviations\/([^/]+)\/?$/, (m) => ({ C: DeviationView, params: { reference: m[1] } })],
  [/^\/console\/overrides\/([^/]+)\/?$/, (m) => ({ C: OverrideView, params: { reference: m[1] } })],
  [/^\/console\/sites\/([^/]+)\/?$/, (m) => ({ C: SiteView, params: { reference: m[1] } })],
  [/^\/console\/contracts\/?$/, () => ({ C: Contracts, params: {} })],
];

function NoSurface({ path }) {
  return (
    <div class="page" style="padding-top:3rem">
      <p class="t-eyebrow">Console</p>
      <h1 class="t-h3">There is no console surface at this address.</h1>
      <p>
        Nothing is served at <code class="mono">{path}</code>.{' '}
        <a href="/console">Return to the board.</a>
      </p>
    </div>
  );
}

export default function Console({ session: passed }) {
  const { path } = useLocation();
  // The console reads its own session, so a surface always knows the caller's
  // role before it decides which controls it is entitled to render.
  const [own, setOwn] = useState(null);
  useEffect(() => {
    if (passed) return;
    let live = true;
    api('/auth/me').then((s) => live && setOwn(s)).catch(() => {});
    return () => { live = false; };
  }, [passed]);
  const session = passed || own;

  for (const [re, build] of ROUTES) {
    const m = path.match(re);
    if (m) {
      const { C, params } = build(m);
      if (!session) return <p class="loading page" role="status">Loading your session…</p>;
      return <C session={session} params={params} />;
    }
  }
  return <NoSurface path={path} />;
}

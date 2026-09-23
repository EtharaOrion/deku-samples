import type { Session } from '../auth/session.js';
import { byVersion, type CertificateRow, type DeviationRow, type LotRow, type RunRow } from '../db/read.js';
import { decideConditions, type Condition } from '../arithmetic/conditions.js';
import {
  certificateDocument,
  certificateView,
  replayCertificate,
  unreproducibleReplay,
  type CertificateView,
  type Replay,
} from '../arithmetic/certificates.js';
import { periodsDrawnBy } from '../arithmetic/ledger.js';
import { floorDivide } from '../arithmetic/floor.js';
import { dateOnly, todayIso } from '../arithmetic/dates.js';
import { CARBON_METHOD } from '../db/seed/ledger.js';
import { GRADE_N6 } from '../db/constants.js';
import { lotContent, upstreamBatches } from './lots.js';
import type { Sources } from './sources.js';

export {
  certificateDocument,
  permittedStatement,
  prohibitedStatement,
  unreproducibleReplay,
  withdrawalOf,
} from '../arithmetic/certificates.js';
export type { CertificateView, Replay, Withdrawal } from '../arithmetic/certificates.js';
export { firstUnsatisfied } from '../arithmetic/conditions.js';
export type { Condition } from '../arithmetic/conditions.js';

const SITE_PREFIX = /^SITE-/;
const BP_PER_PERCENT = 100;

export function contentPercent(content_bp: number): number {
  return floorDivide(content_bp, BP_PER_PERCENT);
}

/** The per-site certificate sequence: CERT-DEMO-000001, CERT-PILOT-000003. */
export function certificateNumberPrefix(site: string): string {
  return `CERT-${site.replace(SITE_PREFIX, '')}-`;
}

function producingRuns(lot: LotRow, s: Sources): RunRow[] {
  const runs: RunRow[] = [];
  const output = lot.output ? s.outputs.get(lot.output) : null;
  if (output) {
    const run = s.runs.get(output.run);
    if (run) runs.push(run);
  }
  for (const component of lot.components) {
    const componentLot = s.lots.get(component.lot);
    if (componentLot) runs.push(...producingRuns(componentLot, s));
  }
  return runs;
}

export function deviationsTouching(lot: LotRow, s: Sources): DeviationRow[] {
  const runRefs = new Set(producingRuns(lot, s).map((run) => run.reference));
  return s.deviations.filter(
    (deviation) => deviation.lots.includes(lot.reference) || deviation.runs.some((run) => runRefs.has(run)),
  );
}

export function certificationNow(site: string, s: Sources): string {
  const row = s.sites.get(site);
  const history = row?.certification_history ?? [];
  return history[history.length - 1]?.state ?? 'not_certified';
}

export function signerDataEntries(lot: LotRow, signer: string, s: Sources): string[] {
  const entries: string[] = [];
  if (lot.dispositioned_by === signer) entries.push(`disposition of ${lot.reference}`);
  for (const result of s.testResults) {
    if (result.lot === lot.reference && result.analyst === signer) entries.push(result.reference);
  }
  for (const batch of upstreamBatches(lot, s)) {
    if (batch.booked_by === signer) entries.push(batch.reference);
  }
  for (const run of producingRuns(lot, s)) {
    if (run.operator === signer) entries.push(run.reference);
  }
  return entries;
}

export function conditionsFor(lot: LotRow, session: Session, s: Sources): Condition[] {
  const periodsDrawn = periodsDrawnBy(s.movements, lot.reference)
    .map((reference) => s.periods.get(reference))
    .filter((period): period is NonNullable<typeof period> => period !== undefined);
  const figuresByPeriod = new Map(periodsDrawn.map((period) => [period.reference, s.figuresOf(period.reference)]));
  return decideConditions({
    lot,
    openDeviations: deviationsTouching(lot, s).filter((deviation) => deviation.state === 'open'),
    unreviewedOverrides: s.overrides.filter((override) => override.lot === lot.reference && !override.reviewed),
    periodsDrawn,
    figuresByPeriod,
    carbonFigure: s.figureFor(lot.reference),
    signerSites: session.sites,
    signerDataEntries: signerDataEntries(lot, session.email, s),
    certificationState: certificationNow(lot.site, s),
    signingDate: todayIso(),
  });
}

export function certView(cert: CertificateRow, s: Sources): CertificateView {
  const lot = s.lots.get(cert.lot);
  const deviations = lot ? deviationsTouching(lot, s) : [];
  return certificateView(cert, s.partyName(cert.recipient, todayIso()), deviations);
}

export function documentOf(cert: CertificateRow, s: Sources): string {
  return certificateDocument(cert, s.partyName(cert.recipient, todayIso()));
}

export function currentVersions(lot: LotRow, s: Sources): Record<string, string> {
  const versions: Record<string, string> = {};
  const factor = s.factorFor(lot.site);
  if (factor) versions.conversion_factor = `${factor.reference}/${factor.version}`;
  const method = s.methods
    .filter((row) => row.reference === CARBON_METHOD && row.state === 'current')
    .sort(byVersion)
    .at(-1);
  if (method) versions.carbon_method = `${method.reference}/${method.version}`;
  const figure = s.figureFor(lot.reference);
  if (figure) versions.carbon_figure = `${figure.reference}/${figure.version}`;
  const spec = s.specifications
    .filter((row) => row.grade === GRADE_N6 && row.state === 'current')
    .sort(byVersion)
    .at(-1);
  if (spec) versions.specification = `${spec.grade}/${spec.version}`;
  return versions;
}

export function replayOf(cert: CertificateRow, s: Sources): Replay {
  const lot = s.lots.get(cert.lot);
  if (!lot) return unreproducibleReplay(cert.number, `Lot ${cert.lot} is not on record.`);
  const figure = s.figureFor(lot.reference);
  return replayCertificate({
    cert,
    recomputedContentBp: lotContent(lot, s).content_bp,
    recomputedCarbonMgPerKg: figure ? figure.value_mg_per_kg : null,
    currentVersions: currentVersions(lot, s),
  });
}

export function verifyAnswer(cert: CertificateRow, s: Sources): Record<string, unknown> {
  return {
    found: true,
    number: cert.number,
    state: cert.state,
    issued_on: dateOnly(cert.signed_at),
    withdrawn_on: cert.withdrawn_on,
    withdrawal_reason: cert.withdrawal_reason,
    site: cert.site,
    grade: cert.grade,
    claim_type: cert.claim_type,
    recipient_name: s.partyName(cert.recipient, todayIso()),
  };
}

export function unknownVerifyAnswer(number: string): Record<string, unknown> {
  return {
    found: false,
    number,
    state: null,
    issued_on: null,
    withdrawn_on: null,
    withdrawal_reason: null,
    site: null,
    grade: null,
    claim_type: null,
    recipient_name: null,
  };
}

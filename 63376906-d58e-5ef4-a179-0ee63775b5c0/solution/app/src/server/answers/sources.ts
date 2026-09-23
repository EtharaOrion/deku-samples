import type { Queryable } from '../db/pool.js';
import {
  all,
  type ApprovalPeriodRow,
  type BatchRow,
  type CarbonFigureRow,
  type CarbonMethodRow,
  type CertificateRow,
  type ConsumptionRow,
  type DeviationRow,
  type FactorRow,
  type LotRow,
  type MovementRow,
  type OutputRow,
  type OverrideRow,
  type PartyVersionRow,
  type PeriodRow,
  type RestatementRow,
  type RunRow,
  type SiteRow,
  type SpecificationRow,
  type TestResultRow,
  type WeighingRow,
} from '../db/read.js';
import { calibrationLapsed, claimability, FLAG_LAPSED_CALIBRATION, nameInForce } from '../arithmetic/batches.js';
import { factorInForce, periodFigures, type PeriodFigures } from '../arithmetic/ledger.js';
import type { GenealogySources } from '../arithmetic/genealogy.js';

export interface Sources extends GenealogySources {
  batchList: BatchRow[];
  runList: RunRow[];
  consumptions: ConsumptionRow[];
  outputList: OutputRow[];
  lotList: LotRow[];
  approvals: ApprovalPeriodRow[];
  devices: Map<string, WeighingRow>;
  parties: PartyVersionRow[];
  movements: MovementRow[];
  movementsByPeriod: Map<string, MovementRow[]>;
  periods: Map<string, PeriodRow>;
  periodList: PeriodRow[];
  factors: FactorRow[];
  deviations: DeviationRow[];
  overrides: OverrideRow[];
  certificates: CertificateRow[];
  figures: CarbonFigureRow[];
  methods: CarbonMethodRow[];
  testResults: TestResultRow[];
  restatements: RestatementRow[];
  specifications: SpecificationRow[];
  sites: Map<string, SiteRow>;
  batchClaim(batch: BatchRow): ReturnType<typeof claimability>;
  originClosed(originSite: string | null): boolean;
  figuresOf(period: string): PeriodFigures;
  factorFor(site: string): FactorRow | null;
  figureFor(lot: string): CarbonFigureRow | null;
  methodOf(reference: string, version: string): CarbonMethodRow | null;
  partyName(party: string, on: string): string;
  partyEmail(party: string): string | null;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]));
}

export async function loadSources(q?: Queryable): Promise<Sources> {
  const [
    batchList,
    runList,
    consumptions,
    outputList,
    lotList,
    approvals,
    deviceList,
    parties,
    movements,
    periodList,
    factors,
    deviations,
    overrides,
    certificates,
    figures,
    methods,
    testResults,
    restatements,
    specifications,
    siteList,
  ] = await Promise.all([
    all<BatchRow>('batch', 'reference', q),
    all<RunRow>('run', 'reference', q),
    all<ConsumptionRow>('consumption', 'reference', q),
    all<OutputRow>('output', 'reference', q),
    all<LotRow>('lot', 'reference', q),
    all<ApprovalPeriodRow>('approval_period', 'reference', q),
    all<WeighingRow>('weighing', 'reference', q),
    all<PartyVersionRow>('party_version', 'effective_from', q),
    all<MovementRow>('credit_movement', 'reference', q),
    all<PeriodRow>('balance_period', 'reference', q),
    all<FactorRow>('conversion_factor', 'reference', q),
    all<DeviationRow>('deviation', 'reference', q),
    all<OverrideRow>('override', 'reference', q),
    all<CertificateRow>('certificate', 'number', q),
    all<CarbonFigureRow>('carbon_figure', 'reference', q),
    all<CarbonMethodRow>('carbon_method', 'reference', q),
    all<TestResultRow>('test_result', 'reference', q),
    all<RestatementRow>('restatement', 'reference', q),
    all<SpecificationRow>('specification', 'grade', q),
    all<SiteRow>('site', 'reference', q),
  ]);

  const approvalsByCollector = groupBy(approvals, (row) => row.collector);
  const devices = indexBy(deviceList, (row) => row.reference);
  const movementsByPeriod = groupBy(movements, (row) => row.period);
  const periods = indexBy(periodList, (row) => row.reference);
  const figureCache = new Map<string, PeriodFigures>();

  const originClosed = (originSite: string | null): boolean => {
    if (originSite === null) return true;
    return periodList.some(
      (period) =>
        period.site === originSite &&
        period.state === 'closed' &&
        (movementsByPeriod.get(period.reference) ?? []).some((m) => m.kind === 'transfer_out'),
    );
  };

  const batchClaim = (batch: BatchRow) => claimability(batch, approvalsByCollector.get(batch.collector) ?? []);

  const batchFlags = (batch: BatchRow): string[] => {
    const flags: string[] = [];
    const device = devices.get(batch.device);
    if (device && calibrationLapsed(device, batch.received_on)) flags.push(FLAG_LAPSED_CALIBRATION);
    const claim = batchClaim(batch);
    if (!claim.claimable && claim.claimable_reason) flags.push(claim.claimable_reason);
    return flags;
  };

  return {
    batchList,
    runList,
    consumptions,
    outputList,
    lotList,
    approvals,
    devices,
    parties,
    movements,
    movementsByPeriod,
    periods,
    periodList,
    factors,
    deviations,
    overrides,
    certificates,
    figures,
    methods,
    testResults,
    restatements,
    specifications,
    sites: indexBy(siteList, (row) => row.reference),
    batches: indexBy(batchList, (row) => row.reference),
    runs: indexBy(runList, (row) => row.reference),
    outputs: indexBy(outputList, (row) => row.reference),
    lots: indexBy(lotList, (row) => row.reference),
    consumptionsByRun: groupBy(consumptions, (row) => row.run),
    batchFlags,
    batchClaim,
    originClosed,
    figuresOf(period: string): PeriodFigures {
      const cached = figureCache.get(period);
      if (cached) return cached;
      const computed = periodFigures(movementsByPeriod.get(period) ?? [], originClosed);
      figureCache.set(period, computed);
      return computed;
    },
    factorFor(site: string): FactorRow | null {
      return factorInForce(factors, site);
    },
    figureFor(lot: string): CarbonFigureRow | null {
      const live = figures.filter((figure) => figure.lot === lot && figure.superseded_by === null);
      if (live.length === 0) return null;
      return live.reduce((best, figure) => (figure.version > best.version ? figure : best));
    },
    methodOf(reference: string, version: string): CarbonMethodRow | null {
      return methods.find((method) => method.reference === reference && method.version === version) ?? null;
    },
    partyName(party: string, on: string): string {
      return nameInForce(parties.filter((row) => row.party === party), on) ?? party;
    },
    partyEmail(party: string): string | null {
      return parties.find((row) => row.party === party && row.email)?.email ?? null;
    },
  };
}

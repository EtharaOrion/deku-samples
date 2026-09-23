import type { Category } from '../../shared/enums.js';
import type { BatchRow, LotRow, PeriodRow, RunRow } from '../db/read.js';
import { declarationDeparts } from '../arithmetic/batches.js';
import { BP_SCALE, floorDivide } from '../arithmetic/floor.js';
import { periodCovers, periodsDrawnBy, sumCategories } from '../arithmetic/ledger.js';
import { dateOnly, nowIso } from '../arithmetic/dates.js';
import type { Sources } from './sources.js';

export { carryOver, claimBasisOfLot, claimWithinAvailable, type Refused } from '../arithmetic/ledger.js';
export { BP_SCALE, floorDivide, floorShare } from '../arithmetic/floor.js';

function within(on: string | null, period: PeriodRow): boolean {
  return on !== null && on >= period.starts_on && on <= period.ends_on;
}

interface ConsumptionCredit {
  period: string;
  category: Category;
  mass_g: number;
  factor: string | null;
}

export function creditForConsumption(batch: BatchRow, mass_g: number, run: RunRow, s: Sources): ConsumptionCredit | null {
  if (!s.batchClaim(batch).claimable) return null;
  const on = dateOnly(run.started_at);
  const period = s.periodList.find((row) => row.state === 'open' && periodCovers(row, run.site, on));
  if (!period) return null;
  const factor = s.factorFor(run.site);
  const factor_bp = factor?.factor_bp ?? BP_SCALE;
  return {
    period: period.reference,
    category: batch.category,
    mass_g: floorDivide(mass_g * factor_bp, BP_SCALE),
    factor: factor ? `${factor.reference}/${factor.version}` : null,
  };
}

export function lotsOfPeriod(period: PeriodRow, s: Sources): LotRow[] {
  return s.lotList.filter(
    (lot) =>
      (lot.site === period.site && within(lot.produced_on ?? lot.effective_on, period)) ||
      periodsDrawnBy(s.movements, lot.reference).includes(period.reference),
  );
}

function nonClaimableInputG(period: PeriodRow, s: Sources): number {
  let total = 0;
  for (const consumption of s.consumptions) {
    const batch = s.batches.get(consumption.input);
    const run = s.runs.get(consumption.run);
    if (!batch || !run || run.site !== period.site) continue;
    if (!within(run.started_at.slice(0, 10), period)) continue;
    if (!s.batchClaim(batch).claimable) total += consumption.mass_g;
  }
  return total;
}

export function periodView(period: PeriodRow, s: Sources): Record<string, unknown> {
  const figures = s.figuresOf(period.reference);
  const factors = s.factors
    .filter((factor) => factor.site === period.site)
    .map((factor) => ({
      reference: factor.reference,
      version: factor.version,
      factor_bp: factor.factor_bp,
      derived_from: factor.derived_from,
      derived_to: factor.derived_to,
      derived_in_g: factor.derived_in_g,
      derived_out_g: factor.derived_out_g,
      provisional: factor.provisional,
      superseded_by: factor.superseded_by,
    }));
  const overrideCount = s.overrides.filter((override) => {
    const lot = s.lots.get(override.lot);
    return lot !== undefined && lot.site === period.site && within(override.authorised_on, period);
  }).length;
  const openRestatements = s.restatements.filter((r) => r.period === period.reference && r.state === 'open').length;
  const findings = s.batchList.filter((batch) => batch.site === period.site && within(batch.received_on, period) && declarationDeparts(batch)).length;
  const movements = s.movementsByPeriod.get(period.reference) ?? [];
  const inboundCredits = movements
    .filter((m) => m.kind === 'transfer_in')
    .map((m) => ({ reference: m.transfer, movement: m.transfer, credit_movement: m.reference, mass_g: m.mass_g, category: m.category, origin_site: m.origin_site, on: m.effective_on, fresh_credit: false }));
  return {
    ...period,
    credits_in_g: figures.credits_in_g,
    credits_out_g: figures.credits_out_g,
    credits_available_g: figures.credits_available_g,
    credit_margin_g: sumCategories(figures.credits_available_g),
    carried_forward_g: figures.carried_forward_g,
    expired_g: figures.expired_g,
    conversion_factors: factors,
    override_count: overrideCount,
    open_restatement_count: openRestatements,
    open_finding_count: findings,
    non_claimable_input_g: nonClaimableInputG(period, s),
    inbound_credits: inboundCredits,
    movements: movements.map((m) => ({ reference: m.reference, kind: m.kind, category: m.category, mass_g: m.mass_g, lot: m.lot, batch: m.batch, consumption: m.consumption, transfer: m.transfer, origin_site: m.origin_site, effective_on: m.effective_on, recorded_at: m.recorded_at })),
    lots: lotsOfPeriod(period, s).map((lot) => lot.reference),
    read_at: nowIso(),
    derivation: {
      credits_in_g: 'sum of opening, consumption and carried-in credit movements per category',
      credits_out_g: 'sum of allocation, transfer-out, carried-out and expired movements per category',
      credits_available_g: 'credits in plus transfers in from closed origin periods, less credits out',
      credit_margin_g: 'the claimable mass still available, summed across both categories and never netted between them',
      carry_over: `carried forward is limited to floor(credits in x ${period.carry_over_limit_bp} / 10000); the remainder expires at close`,
      versions: { conversion_factors: factors.map((f) => `${f.reference}/${f.version}`) },
    },
  };
}

import { CATEGORIES, type Category, type MovementKind } from '../../shared/enums.js';
import { BP_SCALE, floorDivide } from './floor.js';
import type { FactorRow, LotRow, MovementRow, PeriodRow } from '../db/read.js';

export type CategoryFigures = Record<Category, number>;

export interface PeriodFigures {
  credits_in_g: CategoryFigures;
  credits_out_g: CategoryFigures;
  credits_available_g: CategoryFigures;
  carried_forward_g: CategoryFigures;
  expired_g: CategoryFigures;
}

const FRESH_KINDS = new Set<MovementKind>(['opening', 'consumption_credit', 'carried_in']);
const OUT_KINDS = new Set<MovementKind>(['allocation', 'transfer_out', 'carried_out', 'expired']);

function zeroFigures(): CategoryFigures {
  const figures = {} as CategoryFigures;
  for (const category of CATEGORIES) figures[category] = 0;
  return figures;
}

function sumWhere(movements: MovementRow[], category: Category, keep: (m: MovementRow) => boolean): number {
  let total = 0;
  for (const movement of movements) {
    if (movement.category === category && keep(movement)) total += movement.mass_g;
  }
  return total;
}

/**
 * Period figures derived from credit movements alone.
 * A transfer-in credit becomes available only once its origin period is closed;
 * until then it is listed among inbound credits but is not spendable.
 */
export function periodFigures(
  movements: MovementRow[],
  originClosed: (origin_site: string | null) => boolean,
): PeriodFigures {
  const figures: PeriodFigures = {
    credits_in_g: zeroFigures(),
    credits_out_g: zeroFigures(),
    credits_available_g: zeroFigures(),
    carried_forward_g: zeroFigures(),
    expired_g: zeroFigures(),
  };
  for (const category of CATEGORIES) {
    const fresh = sumWhere(movements, category, (m) => FRESH_KINDS.has(m.kind));
    const out = sumWhere(movements, category, (m) => OUT_KINDS.has(m.kind));
    const settledIn = sumWhere(movements, category, (m) => m.kind === 'transfer_in' && originClosed(m.origin_site));
    figures.credits_in_g[category] = fresh;
    figures.credits_out_g[category] = out;
    figures.credits_available_g[category] = fresh + settledIn - out;
    figures.carried_forward_g[category] = sumWhere(movements, category, (m) => m.kind === 'carried_out');
    figures.expired_g[category] = sumWhere(movements, category, (m) => m.kind === 'expired');
  }
  return figures;
}

export interface Refused {
  refused: true;
  available_g: number;
  requested_g: number;
}

/**
 * The ledger invariant, expressed once: a claim drawn from a period may never
 * exceed the credit available in that period for its category.
 * Every allocation, transfer, close and restatement reaches this function.
 */
export function claimWithinAvailable(available_g: number, requested_g: number): Refused | null {
  if (requested_g > available_g) return { refused: true, available_g, requested_g };
  return null;
}

/** The margin across both categories, which are summed but never netted. */
export function sumCategories(figures: CategoryFigures): number {
  let total = 0;
  for (const category of CATEGORIES) total += figures[category];
  return total;
}

export function allocatedToLot(movements: MovementRow[], lot: string): number {
  let total = 0;
  for (const movement of movements) {
    if (movement.kind === 'allocation' && movement.lot === lot) total += movement.mass_g;
  }
  return total;
}

export function categorySplit(movements: MovementRow[], lot: string): CategoryFigures {
  const split = zeroFigures();
  for (const movement of movements) {
    if (movement.kind === 'allocation' && movement.lot === lot) {
      split[movement.category as Category] += movement.mass_g;
    }
  }
  return split;
}

/**
 * The single-basis invariant, expressed once: a lot resolves against one claim
 * basis, so a second category is refused rather than blended into its content.
 */
export function claimBasisOfLot(movements: MovementRow[], lot: string): Category | null {
  const split = categorySplit(movements, lot);
  for (const category of CATEGORIES) {
    if (split[category] > 0) return category;
  }
  return null;
}

/** Content of a lot: floored share of attached claim over lot mass. */
export function contentBp(lot: LotRow, movements: MovementRow[], factor: FactorRow | null): number {
  const claim = allocatedToLot(movements, lot.reference);
  if (claim === 0 && factor?.provisional) return factor.factor_bp;
  if (lot.mass_g === 0) return 0;
  return floorDivide(claim * BP_SCALE, lot.mass_g);
}

/** Carry-over at close: at most the limit share of what entered the period. */
export function carryOver(entered_g: number, available_g: number, limit_bp: number): { carried_g: number; expired_g: number } {
  const ceiling = floorDivide(entered_g * limit_bp, BP_SCALE);
  const carried_g = Math.min(available_g, ceiling);
  return { carried_g, expired_g: available_g - carried_g };
}

export function periodsDrawnBy(movements: MovementRow[], lot: string): string[] {
  const periods = new Set<string>();
  for (const movement of movements) {
    if (movement.kind === 'allocation' && movement.lot === lot) periods.add(movement.period);
  }
  return [...periods];
}

export function factorInForce(factors: FactorRow[], site: string): FactorRow | null {
  let chosen: FactorRow | null = null;
  for (const factor of factors) {
    if (factor.site !== site || factor.superseded_by) continue;
    if (!chosen || factor.version > chosen.version) chosen = factor;
  }
  return chosen;
}

export function periodCovers(period: PeriodRow, site: string, on: string): boolean {
  return period.site === site && period.starts_on <= on && period.ends_on >= on;
}

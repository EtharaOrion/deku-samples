import { CONDITION_NAMES, type ConditionName } from '../../shared/enums.js';
import type { CarbonFigureRow, DeviationRow, LotRow, OverrideRow, PeriodRow } from '../db/read.js';
import type { PeriodFigures } from './ledger.js';

export interface Condition {
  condition: ConditionName;
  statement: string;
  satisfied: boolean;
  blocking_reference: string | null;
}

interface ConditionInputs {
  lot: LotRow;
  openDeviations: DeviationRow[];
  unreviewedOverrides: OverrideRow[];
  periodsDrawn: PeriodRow[];
  figuresByPeriod: Map<string, PeriodFigures>;
  carbonFigure: CarbonFigureRow | null;
  signerSites: string[];
  signerDataEntries: string[];
  certificationState: string;
  signingDate: string;
}

const STATEMENTS: Record<ConditionName, string> = {
  lot_released: 'The lot has been dispositioned as released.',
  no_open_deviation: 'No open deviation touches the lot or the runs that produced it.',
  no_unreviewed_override: 'No unreviewed separation override stands against the lot.',
  period_closed: 'Every balance period the lot draws credit from is closed.',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied: attached claim never exceeds available credit.',
  carbon_figure_complete: 'A carbon figure exists for the lot with value, boundary, method version and uncertainty.',
  signer_holds_site_scope: 'The signer holds scope for the site on the signing date and the site is certified.',
  signer_did_not_enter_data: 'The signer entered none of the data the certificate rests on.',
};

export function decideConditions(input: ConditionInputs): Condition[] {
  const decided: Record<ConditionName, { satisfied: boolean; blocking: string | null }> = {
    lot_released: {
      satisfied: input.lot.disposition === 'released',
      blocking: input.lot.disposition === 'released' ? null : input.lot.reference,
    },
    no_open_deviation: {
      satisfied: input.openDeviations.length === 0,
      blocking: input.openDeviations[0]?.reference ?? null,
    },
    no_unreviewed_override: {
      satisfied: input.unreviewedOverrides.length === 0,
      blocking: input.unreviewedOverrides[0]?.reference ?? null,
    },
    period_closed: periodClosed(input.periodsDrawn),
    balance_invariant_holds: balanceHolds(input.periodsDrawn, input.figuresByPeriod),
    carbon_figure_complete: carbonComplete(input.carbonFigure, input.lot.reference),
    signer_holds_site_scope: {
      satisfied: input.signerSites.includes(input.lot.site) && input.certificationState === 'certified',
      blocking: input.signerSites.includes(input.lot.site) && input.certificationState === 'certified' ? null : input.lot.site,
    },
    signer_did_not_enter_data: {
      satisfied: input.signerDataEntries.length === 0,
      blocking: input.signerDataEntries[0] ?? null,
    },
  };
  return CONDITION_NAMES.map((name) => ({
    condition: name,
    statement: STATEMENTS[name],
    satisfied: decided[name].satisfied,
    blocking_reference: decided[name].blocking,
  }));
}

function periodClosed(periods: PeriodRow[]): { satisfied: boolean; blocking: string | null } {
  const open = periods.find((p) => p.state !== 'closed');
  return { satisfied: !open, blocking: open?.reference ?? null };
}

function balanceHolds(periods: PeriodRow[], figures: Map<string, PeriodFigures>): { satisfied: boolean; blocking: string | null } {
  for (const period of periods) {
    const f = figures.get(period.reference);
    if (!f) continue;
    for (const value of Object.values(f.credits_available_g)) {
      if (value < 0) return { satisfied: false, blocking: period.reference };
    }
  }
  return { satisfied: true, blocking: null };
}

function carbonComplete(figure: CarbonFigureRow | null, lot: string): { satisfied: boolean; blocking: string | null } {
  if (!figure) return { satisfied: false, blocking: lot };
  const complete = Number.isInteger(figure.value_mg_per_kg) && figure.method_version !== '' && Number.isInteger(figure.uncertainty_bp);
  return { satisfied: complete, blocking: complete ? null : figure.reference };
}

export function firstUnsatisfied(conditions: Condition[]): Condition | null {
  return conditions.find((c) => !c.satisfied) ?? null;
}

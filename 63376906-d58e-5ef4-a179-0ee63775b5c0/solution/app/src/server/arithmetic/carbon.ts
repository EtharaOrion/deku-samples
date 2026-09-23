import type { CarbonFigureRow, CarbonMethodRow, EnergyInstrumentRow, OutputRow } from '../db/read.js';
import { PRIMARY_THRESHOLD_BP } from '../db/constants.js';
import { BP_SCALE, floorDivide } from './floor.js';

export interface CarbonAnswer {
  lot: string;
  figure: string;
  figure_version: number;
  value_mg_per_kg: number;
  boundary: string;
  method: string;
  method_version: string;
  uncertainty_bp: number;
  allocation_basis: string;
  functional_unit: string;
  comparator: CarbonFigureRow['comparator'];
  primary_share_bp: number;
  default_led: boolean;
  breakdown: CarbonFigureRow['breakdown'];
  energy_location_mg_per_kg: number;
  energy_market_mg_per_kg: number;
  metered_kwh: number;
  retired_kwh: number;
  unmatched_kwh: number;
  cache_valid: boolean;
  computed_by: string;
  computed_on: string;
  input_versions: Record<string, string>;
  derivation: Record<string, unknown>;
}

function breakdownSum(figure: CarbonFigureRow): number {
  return figure.breakdown.reduce((sum, line) => sum + line.mg_per_kg, 0);
}

export function carbonAnswer(
  figure: CarbonFigureRow,
  method: CarbonMethodRow,
  cache_valid: boolean,
): CarbonAnswer {
  return {
    lot: figure.lot,
    figure: figure.reference,
    figure_version: figure.version,
    value_mg_per_kg: figure.value_mg_per_kg,
    boundary: method.boundary,
    method: method.reference,
    method_version: figure.method_version,
    uncertainty_bp: figure.uncertainty_bp,
    allocation_basis: method.allocation_basis,
    functional_unit: method.functional_unit,
    comparator: figure.comparator,
    primary_share_bp: figure.primary_share_bp,
    default_led: figure.primary_share_bp < PRIMARY_THRESHOLD_BP,
    breakdown: figure.breakdown,
    energy_location_mg_per_kg: figure.energy.energy_location_mg_per_kg,
    energy_market_mg_per_kg: figure.energy.energy_market_mg_per_kg,
    metered_kwh: figure.energy.metered_kwh,
    retired_kwh: figure.energy.retired_kwh,
    unmatched_kwh: figure.energy.unmatched_kwh,
    cache_valid,
    computed_by: figure.computed_by,
    computed_on: figure.computed_on,
    input_versions: figure.input_versions,
    derivation: {
      value_mg_per_kg: 'sum of breakdown lines',
      breakdown_sum_mg_per_kg: breakdownSum(figure),
      primary_share_bp: `floor(primary lines × ${BP_SCALE} / all lines)`,
      primary_threshold_bp: PRIMARY_THRESHOLD_BP,
      unmatched_kwh: 'metered_kwh − retired_kwh',
      method: `${method.reference} version ${figure.method_version}`,
      standard: method.standard,
      emission_factors: method.emission_factors,
    },
  };
}

export interface RetirementRefusal {
  rule: string;
  detail: string;
}

export function retirementRefusal(
  instrument: EnergyInstrumentRow,
  periodStartsOn: string,
  periodRegion: string,
  metered_kwh: number,
  alreadyRetired_kwh: number,
  quantity_kwh: number,
): RetirementRefusal | null {
  if (instrument.state === 'retired') return { rule: 'instrument_already_retired', detail: `${instrument.reference} is already retired; only a held instrument can be retired.` };
  const vintage = periodStartsOn.slice(0, 4);
  if (instrument.vintage !== vintage) return { rule: 'vintage_mismatch', detail: `${instrument.reference} carries vintage ${instrument.vintage}; the period requires vintage ${vintage}. Cannot retire.` };
  if (instrument.region !== periodRegion) return { rule: 'region_mismatch', detail: `${instrument.reference} covers ${instrument.region}; the period requires ${periodRegion}. Cannot retire.` };
  if (quantity_kwh > instrument.quantity_kwh) return { rule: 'quantity_exceeds_instrument', detail: `${quantity_kwh} kWh exceeds the ${instrument.quantity_kwh} kWh on ${instrument.reference}.` };
  if (alreadyRetired_kwh + quantity_kwh > metered_kwh) return { rule: 'quantity_exceeds_metered', detail: `Retiring ${quantity_kwh} kWh would exceed the ${metered_kwh} kWh metered for the period.` };
  return null;
}

interface ByproductShare {
  share_bp: number;
  claim_share_g: number;
  emissions_share_mg: number;
}

export function byproductShare(byproduct: OutputRow, runOutputs: OutputRow[], claim_g: number, emissions_mg: number): ByproductShare {
  const total = runOutputs.reduce((sum, o) => sum + o.mass_g, 0);
  const share_bp = total === 0 ? 0 : floorDivide(byproduct.mass_g * BP_SCALE, total);
  return {
    share_bp,
    claim_share_g: floorDivide(claim_g * share_bp, BP_SCALE),
    emissions_share_mg: floorDivide(emissions_mg * share_bp, BP_SCALE),
  };
}

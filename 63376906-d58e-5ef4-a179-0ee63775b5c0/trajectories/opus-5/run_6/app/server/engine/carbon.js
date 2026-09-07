import { q } from '../lib/db.js';
import { iso } from './feedstock.js';

// No route returns a carbon value without its boundary, method version and
// uncertainty, or one energy figure without the other.
export async function carbonFor(lotReference, { internal = true } = {}) {
  const figures = await q(
    'SELECT * FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL ORDER BY figure_version DESC', [lotReference]);
  const figure = figures[0];
  if (!figure) return null;

  const mv = (await q('SELECT * FROM carbon_method_version WHERE method_id = $1 AND version = $2',
    [figure.method_id, figure.method_version]))[0];
  const lot = (await q('SELECT * FROM lot WHERE reference = $1', [lotReference]))[0];
  const period = (await q(
    'SELECT * FROM balance_period WHERE site = $1 AND grade = $2 ORDER BY period_from DESC LIMIT 1',
    [lot.site, lot.grade]))[0];

  // The allocation basis is held once per period and applies to both the ledger
  // and the carbon method; a disagreement is named rather than resolved.
  if (period && mv && period.allocation_basis !== mv.allocation_basis) {
    return {
      mismatch: true,
      error: 'allocation_basis_mismatch',
      period_allocation_basis: period.allocation_basis,
      method_allocation_basis: mv.allocation_basis,
      period: period.id,
      method_version: `${figure.method_id} v${figure.method_version}`,
    };
  }

  const breakdown = figure.breakdown || [];
  const threshold = mv ? Number(mv.primary_threshold_bp) : 5000;
  const energy = figure.energy || {};

  const instruments = await q('SELECT * FROM energy_instrument WHERE applied_period = $1', [period?.id || null]);
  const retired = instruments.reduce((s, i) => s + Number(i.quantity_kwh), 0);
  const metered = Number(period?.metered_kwh || energy.metered_kwh || 0);

  const body = {
    lot: lotReference,
    figure_id: figure.id,
    figure_version: figure.figure_version,
    value_mg_per_kg: Number(figure.value_mg_per_kg),
    boundary: figure.boundary,
    method_version: `${figure.method_id} v${figure.method_version}`,
    method_id: figure.method_id,
    method_version_number: figure.method_version,
    uncertainty_bp: Number(figure.uncertainty_bp),
    primary_share_bp: Number(figure.primary_share_bp),
    primary_threshold_bp: threshold,
    default_led: Number(figure.primary_share_bp) < threshold,
    comparator: figure.comparator,
    comparison_statement: comparisonStatement(Number(figure.value_mg_per_kg), figure.comparator),
    allocation_basis: mv?.allocation_basis || null,
    standard: mv?.standard || null,
    functional_unit: mv?.functional_unit || null,
    // the two energy lines are returned together, never one alone
    energy_location_mg_per_kg: Number(energy.energy_location_mg_per_kg ?? 0),
    energy_market_mg_per_kg: Number(energy.energy_market_mg_per_kg ?? 0),
    metered_kwh: metered,
    retired_kwh: retired,
    unmatched_kwh: metered - retired,
    retired_instruments: instruments.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage, region: i.region, state: i.state,
    })),
    cache_valid: figure.cache_valid,
    input_versions: figure.input_versions,
    computed_at: figure.computed_at,
    derivation: 'sum of breakdown lines under the named method version',
  };
  // The internal view returns the breakdown always.
  if (internal) body.breakdown = breakdown;
  else body.breakdown_attached = breakdown;
  return body;
}

// A carbon figure lower than its comparator is described as lower than that
// comparator, by name.
export function comparisonStatement(value, comparator) {
  if (!comparator) return null;
  const c = Number(comparator.comparator_mg_per_kg || 0);
  if (!c) return null;
  const name = comparator.material || 'the comparator';
  if (value < c) return `Lower than ${name} (${comparator.dataset} ${comparator.dataset_year}, ${comparator.region}).`;
  if (value > c) return `Higher than ${name} (${comparator.dataset} ${comparator.dataset_year}, ${comparator.region}).`;
  return `Equal to ${name} (${comparator.dataset} ${comparator.dataset_year}, ${comparator.region}).`;
}

export async function methodVersionsFor(methodId) {
  return q('SELECT * FROM carbon_method_version WHERE method_id = $1 ORDER BY version ASC', [methodId]);
}

export function methodVersionView(mv) {
  return {
    method_id: mv.method_id,
    version: mv.version,
    standard: mv.standard,
    functional_unit: mv.functional_unit,
    boundary: mv.boundary,
    allocation_basis: mv.allocation_basis,
    reviewer: mv.reviewer,
    published_on: iso(mv.published_on),
    published_by: mv.published_by,
    data_quality_rules: mv.data_quality_rules,
    emission_factors: mv.emission_factors,
    primary_threshold_bp: Number(mv.primary_threshold_bp),
    superseded: mv.superseded,
  };
}

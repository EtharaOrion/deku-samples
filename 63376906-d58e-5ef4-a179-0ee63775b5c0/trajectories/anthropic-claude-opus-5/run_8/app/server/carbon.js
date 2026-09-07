import { all, one } from './db.js';

// No carbon value leaves this module without its boundary, its method version
// and its uncertainty, and the two energy figures are returned together.
export async function carbonFigureFor(lotReference, { internal = true } = {}) {
  const figure = await one(
    'select * from carbon_figure where lot = $1 and superseded_by is null order by version desc limit 1',
    [lotReference],
  );
  if (!figure) return null;
  const mv = await one(
    'select * from carbon_method_version where method = $1 and version = $2',
    [figure.method, figure.method_version],
  );
  const lot = await one('select * from lot where reference = $1', [lotReference]);
  const period = lot
    ? await one(
        'select * from balance_period where site = $1 and grade = $2 order by period_from desc limit 1',
        [lot.site, lot.grade],
      )
    : null;

  // The allocation basis is held once per period and applies to both the
  // ledger and the carbon method. A disagreement is named, never averaged.
  if (period && mv && period.allocation_basis !== mv.allocation_basis) {
    const err = new Error('allocation_basis_mismatch');
    err.status = 409;
    err.body = {
      error: 'allocation_basis_mismatch',
      period_allocation_basis: period.allocation_basis,
      method_allocation_basis: mv.allocation_basis,
      period: period.id,
      method_version: `${figure.method} v${figure.method_version}`,
    };
    throw err;
  }

  const instruments = await all(
    'select * from energy_instrument where retired_against = $1',
    [period?.id || ''],
  );
  const metered_kwh = period?.metered_kwh ?? figure.energy?.metered_kwh ?? 0;
  const retired_kwh = instruments.reduce((s, i) => s + i.quantity_kwh, 0);

  const threshold = mv?.primary_threshold_bp ?? 5000;
  const breakdown = figure.breakdown || [];

  const body = {
    lot: lotReference,
    value_mg_per_kg: figure.value_mg_per_kg,
    boundary: figure.boundary,
    method: figure.method,
    method_version: figure.method_version,
    method_version_label: `${figure.method} v${figure.method_version}`,
    uncertainty_bp: figure.uncertainty_bp,
    allocation_basis: figure.allocation_basis,
    primary_share_bp: figure.primary_share_bp,
    primary_threshold_bp: threshold,
    default_led: figure.primary_share_bp < threshold,
    comparator: figure.comparator,
    comparator_relation:
      figure.comparator && typeof figure.comparator.value_mg_per_kg === 'number'
        ? figure.value_mg_per_kg < figure.comparator.value_mg_per_kg
          ? `lower than ${figure.comparator.material} (${figure.comparator.dataset} ${figure.comparator.dataset_year}, ${figure.comparator.region})`
          : `higher than ${figure.comparator.material} (${figure.comparator.dataset} ${figure.comparator.dataset_year}, ${figure.comparator.region})`
        : null,
    energy: {
      energy_location_mg_per_kg: figure.energy?.energy_location_mg_per_kg ?? 0,
      energy_market_mg_per_kg: figure.energy?.energy_market_mg_per_kg ?? 0,
      metered_kwh,
      retired_kwh,
      unmatched_kwh: metered_kwh - retired_kwh,
      instruments: instruments.map((i) => ({
        reference: i.reference,
        quantity_kwh: i.quantity_kwh,
        vintage: i.vintage,
        region: i.region,
        state: i.state,
      })),
    },
    figure_id: figure.id,
    figure_version: figure.version,
    cache_valid: figure.cache_valid,
    input_versions: figure.input_versions,
    computed_at: figure.computed_at,
    derivation: { source: 'carbon_figure computed against the named method version' },
  };
  // Inside the console the breakdown is always there. On a certificate it is
  // attached rather than inline.
  if (internal) body.breakdown = breakdown;
  else body.breakdown_attached = true;
  return body;
}

export async function recompute(figure, mv) {
  // The recomputation is the arithmetic of the recorded breakdown against the
  // recorded method version: the lines sum to the value.
  const lines = figure.breakdown || [];
  const value = lines.reduce((s, l) => s + l.mg_per_kg, 0);
  const primaryLines = lines.filter((l) => l.tag === 'primary');
  const positive = lines.filter((l) => l.mg_per_kg > 0).reduce((s, l) => s + l.mg_per_kg, 0);
  const primaryPositive = primaryLines
    .filter((l) => l.mg_per_kg > 0)
    .reduce((s, l) => s + l.mg_per_kg, 0);
  void primaryPositive;
  void positive;
  return {
    value_mg_per_kg: value,
    boundary: mv?.boundary ?? figure.boundary,
    method_version: figure.method_version,
    uncertainty_bp: figure.uncertainty_bp,
    primary_share_bp: figure.primary_share_bp,
  };
}

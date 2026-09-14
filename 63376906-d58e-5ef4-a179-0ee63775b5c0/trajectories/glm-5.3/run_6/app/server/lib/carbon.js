export async function methodLatest(c) {
  const rows = (await c.query(`SELECT * FROM carbon_methods ORDER BY id ASC, version DESC`)).rows;
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.id) || r.version > latest.get(r.id).version) latest.set(r.id, r);
  return [...latest.values()];
}

export async function methodView(c, m) {
  const factors = (await c.query(`SELECT * FROM emission_factors WHERE method_id=$1 AND method_version=$2 ORDER BY id`, [m.id, m.version])).rows;
  const energy = (await c.query(`SELECT * FROM energy_lines WHERE method_id=$1 AND method_version=$2`, [m.id, m.version])).rows[0] || null;
  return {
    id: m.id,
    version: m.version,
    standard: m.standard,
    functional_unit: m.functional_unit,
    boundary: m.boundary,
    allocation_basis: m.allocation_basis,
    reviewer: m.reviewer,
    published_on: m.published_on,
    superseded_by: m.superseded_by || null,
    data_quality: {
      primary_threshold_bp: 5000,
      rule: 'A figure whose primary_share_bp falls below 5000 is reported as default led.'
    },
    emission_factors: factors.map((f) => ({ line: f.line, mg_per_kg: f.mg_per_kg, tag: f.tag, source: f.source, year: f.year })),
    energy: energy ? { energy_location_mg_per_kg: energy.energy_location_mg_per_kg, energy_market_mg_per_kg: energy.energy_market_mg_per_kg } : null
  };
}

export const comparatorView = () => ({
  material: 'virgin PA6',
  dataset: 'EcoBase 2025',
  dataset_year: 2025,
  region: 'EU-27'
});

export async function carbonFigureView(c, fig, { includeBreakdown = true } = {}) {
  const energy = (await c.query(`SELECT * FROM energy_lines WHERE method_id=$1 AND method_version=$2`, [fig.method_id, fig.method_version])).rows[0];
  let metered = null, retired = null, unmatched = null;
  if (fig.period) {
    const t = (await c.query(`SELECT metered_kwh FROM energy_period_totals WHERE period=$1`, [fig.period])).rows[0];
    if (t) {
      metered = t.metered_kwh;
      retired = (await c.query(`SELECT COALESCE(SUM(quantity_kwh),0)::int AS s FROM energy_retirements WHERE period=$1`, [fig.period])).rows[0].s;
      unmatched = metered - retired;
    }
  }
  const base = {
    lot: fig.lot,
    figure_id: fig.id,
    figure_version: fig.version,
    value_mg_per_kg: fig.value_mg_per_kg,
    boundary: fig.boundary,
    method_version: `${fig.method_id} v${fig.method_version}`,
    uncertainty_bp: fig.uncertainty_bp,
    comparator: fig.comparator,
    primary_share_bp: fig.primary_share_bp,
    default_led: fig.primary_share_bp < 5000,
    cache_valid: fig.cache_valid,
    input_versions: fig.input_versions,
    derivation: {
      description: 'Sum of the emission factors of the method version it was computed against.',
      method_version: `${fig.method_id} v${fig.method_version}`,
      input_versions: fig.input_versions
    }
  };
  if (energy) {
    base.energy_location_mg_per_kg = energy.energy_location_mg_per_kg;
    base.energy_market_mg_per_kg = energy.energy_market_mg_per_kg;
    base.energy = {
      energy_location_mg_per_kg: energy.energy_location_mg_per_kg,
      energy_market_mg_per_kg: energy.energy_market_mg_per_kg,
      metered_kwh: metered,
      retired_kwh: retired,
      unmatched_kwh: unmatched
    };
  }
  if (includeBreakdown) base.breakdown = fig.breakdown;
  return base;
}

export async function currentFigureFor(c, lotRef) {
  return (await c.query(`SELECT * FROM carbon_figures WHERE lot=$1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`, [lotRef])).rows[0] || null;
}

import { q, one } from '../lib/db.js';
import { refuse } from '../lib/refusal.js';
import { shareBp } from '../lib/num.js';

// No route returns a carbon value without its boundary, method version and
// uncertainty, or one energy figure without the other.
export async function carbonForLot(lotRef, { internal = true } = {}) {
  const fig = await one(
    'select * from carbon_figure where lot = $1 and superseded_by is null order by version desc limit 1',
    [lotRef],
  );
  if (!fig) return null;
  const lot = await one('select * from lot where reference = $1', [lotRef]);
  const mv = await one('select * from carbon_method_version where id = $1 and version = $2', [fig.method_id, fig.method_version]);
  const period = lot
    ? await one(
        'select * from balance_period where site = $1 and grade = $2 and period_from <= $3 and period_to >= $3',
        [lot.site, lot.grade, lot.produced_on],
      )
    : null;

  // The allocation basis is held once per period and applies to both the ledger
  // and the carbon method; a disagreement is a 409 rather than a quiet choice.
  if (period && mv && period.allocation_basis !== mv.allocation_basis) {
    throw refuse(
      409,
      'allocation_basis_mismatch',
      `The period's allocation basis is '${period.allocation_basis}' and the carbon method version's is '${mv.allocation_basis}'. The basis is held once per period and applies to both.`,
      { period: period.id, period_basis: period.allocation_basis, method_basis: mv.allocation_basis },
    );
  }

  const instruments = await q('select * from energy_instrument order by reference');
  const applied = instruments.filter((i) => i.applied_to === (period ? period.id : null) && i.state === 'retired');
  const metered_kwh = Number(fig.metered_kwh || period?.metered_kwh || 0);
  const retired_kwh = applied.reduce((s, i) => s + Number(i.quantity_kwh), 0);
  const unmatched_kwh = metered_kwh - retired_kwh;

  const threshold = mv ? mv.primary_threshold_bp : 5000;
  const breakdown = fig.breakdown || [];
  const comparator = fig.comparator || {};

  const base = {
    lot: lotRef,
    figure_id: fig.id,
    figure_version: fig.version,
    value_mg_per_kg: Number(fig.value_mg_per_kg),
    boundary: fig.boundary,
    method_version: `${fig.method_id} v${fig.method_version}`,
    method_id: fig.method_id,
    method_version_number: fig.method_version,
    uncertainty_bp: fig.uncertainty_bp,
    comparator: {
      material: comparator.material,
      dataset: comparator.dataset,
      dataset_year: comparator.dataset_year,
      region: comparator.region,
      value_mg_per_kg: comparator.value_mg_per_kg ?? null,
      relation:
        comparator.value_mg_per_kg != null
          ? Number(fig.value_mg_per_kg) < Number(comparator.value_mg_per_kg)
            ? `lower than ${comparator.material} from ${comparator.dataset}`
            : `higher than ${comparator.material} from ${comparator.dataset}`
          : null,
    },
    primary_share_bp: fig.primary_share_bp,
    primary_threshold_bp: threshold,
    default_led: fig.primary_share_bp < threshold,
    allocation_basis: mv ? mv.allocation_basis : null,
    standard: mv ? (await one('select standard, functional_unit from carbon_method where id = $1', [fig.method_id]))?.standard : null,
    energy_location_mg_per_kg: Number(fig.energy_location_mg_per_kg),
    energy_market_mg_per_kg: Number(fig.energy_market_mg_per_kg),
    metered_kwh,
    retired_kwh,
    unmatched_kwh,
    retired_instruments: applied.map((i) => ({ reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage, region: i.region, state: i.state })),
    cache_valid: fig.cache_valid,
    reproducible: fig.reproducible,
    unreproducible_reason: fig.unreproducible_reason,
    input_versions: fig.input_versions,
    computed_at: fig.computed_at,
    derivation: {
      value_mg_per_kg: 'the sum of the breakdown lines',
      method: `${fig.method_id} version ${fig.method_version}`,
    },
  };
  // The internal view returns the breakdown always.
  base.breakdown = breakdown;
  base.breakdown_sum_mg_per_kg = breakdown.reduce((s, l) => s + Number(l.mg_per_kg), 0);
  if (!internal) delete base.breakdown;
  return base;
}

export async function byproductShare(outputRef) {
  const out = await one('select * from output where reference = $1', [outputRef]);
  if (!out || out.kind !== 'byproduct') return null;
  const run = await one('select * from run where reference = $1', [out.run]);
  const outs = await q('select * from output where run = $1', [out.run]);
  const total = outs.reduce((s, o) => s + Number(o.mass_g), 0);
  const share_bp = shareBp(Number(out.mass_g), total);
  const period = await one(
    'select * from balance_period where site = $1 and period_from <= $2 and period_to >= $2',
    [run.site, run.effective_on],
  );
  const basis = period ? period.allocation_basis : 'mass';
  // The share of the run's claim and of its emissions.
  const { genealogyOfLot } = await import('./genealogy.js');
  const lots = await q('select * from lot where site = $1', [run.site]);
  let claim_total = 0;
  let emissions_total = 0;
  for (const l of lots) {
    const g = await genealogyOfLot(l.reference).catch(() => null);
    if (!g) continue;
    if (!g.nodes.some((n) => n.reference === out.run)) continue;
    const { creditAttachedToLot } = await import('./ledger.js');
    const c = await creditAttachedToLot(l.reference);
    claim_total += c.total_g;
    const fig = await one('select * from carbon_figure where lot = $1 and superseded_by is null limit 1', [l.reference]);
    if (fig) emissions_total += Math.floor((Number(fig.value_mg_per_kg) * Number(l.mass_g)) / 1000);
  }
  return {
    output: outputRef,
    run: out.run,
    kind: out.kind,
    disposition: out.disposition,
    mass_g: Number(out.mass_g),
    total_output_mass_g: total,
    allocation_basis: basis,
    share_bp,
    claim_share_g: Math.floor((claim_total * share_bp) / 10000),
    emissions_share_mg: Math.floor((emissions_total * share_bp) / 10000),
    derivation: {
      share_bp: 'byproduct_mass_g * 10000 / total_output_mass_g, floored',
      basis: `the period's allocation basis of '${basis}'`,
      note: out.disposition === 'disposed' ? 'A disposed byproduct is a loss and reduces the conversion factor.' : 'A sold byproduct takes a share of the input claim and of the input emissions.',
    },
  };
}

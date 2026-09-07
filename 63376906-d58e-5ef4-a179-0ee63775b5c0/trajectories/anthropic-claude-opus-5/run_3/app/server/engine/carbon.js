import { rq, rq1 } from '../db/pool.js';
import { refuse } from '../lib/http.js';
import { shareBp, applyShare } from './units.js';

/** No route returns a carbon value without its boundary, its method version and
 *  its uncertainty, and never one energy figure without the other. This shape
 *  is the only way a figure leaves the engine, so the rule cannot be forgotten
 *  by a new handler. */
function assembleFigure(fig, methodVersion, energy, opts = {}) {
  const breakdown = (fig.breakdown || []).map((l) => ({
    line: l.line, mg_per_kg: Number(l.mg_per_kg), tag: l.tag
  }));
  const sum = breakdown.reduce((s, l) => s + l.mg_per_kg, 0);
  const threshold = opts.primary_threshold_bp ?? 5000;

  const out = {
    // The three that never travel apart from the value.
    value_mg_per_kg: Number(fig.value_mg_per_kg),
    boundary: fig.boundary,
    method_version: `${fig.method} v${fig.method_version}`,
    uncertainty_bp: fig.uncertainty_bp,

    method: fig.method,
    method_version_number: fig.method_version,
    figure_version: fig.version,
    comparator: fig.comparator,
    primary_share_bp: fig.primary_share_bp,
    // A figure whose primary share falls below the stated threshold says so,
    // and is never presented as though it were metered when it is not.
    default_led: fig.primary_share_bp < threshold,
    primary_threshold_bp: threshold,
    allocation_basis: methodVersion?.allocation_basis || null,
    cache_valid: fig.cache_valid,
    // The energy lines are returned together, never one alone.
    energy: {
      energy_location_mg_per_kg: Number(fig.energy_location_mg_per_kg),
      energy_market_mg_per_kg: Number(fig.energy_market_mg_per_kg),
      metered_kwh: energy.metered_kwh,
      retired_kwh: energy.retired_kwh,
      unmatched_kwh: energy.unmatched_kwh,
      instruments: energy.instruments
    },
    input_versions: fig.input_versions || {},
    // A carbon figure lower than its comparator is described as lower than that
    // comparator, by name.
    comparison: null,
    derivation: {
      breakdown_sums_to_value: sum === Number(fig.value_mg_per_kg),
      breakdown_sum_mg_per_kg: sum,
      method: `${fig.method} version ${fig.method_version}, published ${methodVersion ? String(methodVersion.published_on).slice(0, 10) : 'unknown'}`,
      note: 'Every line in the breakdown carries its own tag and the lines sum to the value.'
    }
  };

  if (fig.comparator && fig.comparator.value_mg_per_kg) {
    const cv = Number(fig.comparator.value_mg_per_kg);
    const v = Number(fig.value_mg_per_kg);
    out.comparison = {
      comparator_name: `${fig.comparator.material} (${fig.comparator.dataset} ${fig.comparator.dataset_year}, ${fig.comparator.region})`,
      comparator_mg_per_kg: cv,
      direction: v < cv ? 'lower' : v > cv ? 'higher' : 'equal',
      difference_mg_per_kg: Math.abs(v - cv),
      statement: v < cv
        ? `Lower than ${fig.comparator.material} from ${fig.comparator.dataset} ${fig.comparator.dataset_year} (${fig.comparator.region}).`
        : v > cv
          ? `Higher than ${fig.comparator.material} from ${fig.comparator.dataset} ${fig.comparator.dataset_year} (${fig.comparator.region}).`
          : `Equal to ${fig.comparator.material} from ${fig.comparator.dataset} ${fig.comparator.dataset_year} (${fig.comparator.region}).`
    };
  }

  // The internal view returns the breakdown always. A response carrying the
  // aggregate with no breakdown behind it does not exist inside the console.
  if (!opts.omitBreakdown) out.breakdown = breakdown;
  return out;
}

async function energyFor(periodId) {
  const period = await rq1('SELECT * FROM balance_period WHERE id = $1', [periodId]);
  const instruments = await rq(
    'SELECT * FROM energy_instrument WHERE applied_to = $1 ORDER BY reference', [periodId]
  );
  const metered = Number(period?.metered_kwh || 0);
  const retired = instruments.reduce((s, i) => s + Number(i.quantity_kwh), 0);
  return {
    metered_kwh: metered,
    retired_kwh: retired,
    unmatched_kwh: metered - retired,
    instruments: instruments.map((i) => ({
      reference: i.reference, quantity_kwh: Number(i.quantity_kwh),
      vintage: i.vintage, region: i.region, state: i.state
    }))
  };
}

export async function lotCarbon(lotRef, opts = {}) {
  const lot = await rq1('SELECT * FROM lot WHERE reference = $1', [lotRef]);
  if (!lot) return null;
  const fig = await rq1(
    `SELECT * FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL
      ORDER BY version DESC LIMIT 1`, [lotRef]
  );
  if (!fig) return null;

  const mv = await rq1(
    'SELECT * FROM carbon_method_version WHERE method = $1 AND version = $2',
    [fig.method, fig.method_version]
  );
  const method = await rq1('SELECT * FROM carbon_method WHERE id = $1', [fig.method]);

  const periodId = lot.balance_period;
  const period = periodId ? await rq1('SELECT * FROM balance_period WHERE id = $1', [periodId]) : null;

  // The allocation basis is held once per period and applies to both the ledger
  // and the carbon method. Where the two disagree the figure is not returned:
  // a value computed on one basis and read on another is a wrong number with a
  // right shape.
  if (period && mv && period.allocation_basis !== mv.allocation_basis) {
    throw refuse(409, 'allocation_basis_mismatch',
      `The period ${period.id} allocates on ${period.allocation_basis} and ${fig.method} v${fig.method_version} allocates on ${mv.allocation_basis}.`,
      { period_basis: period.allocation_basis, method_basis: mv.allocation_basis });
  }

  const energy = await energyFor(periodId);
  return assembleFigure(fig, mv, energy, {
    primary_threshold_bp: method?.primary_threshold_bp ?? 5000,
    omitBreakdown: opts.omitBreakdown
  });
}

/** A sold byproduct takes a share of the input's claim and a share of the
 *  input's emissions on the period's stated allocation basis. A disposed
 *  byproduct is a loss instead, and reduces the conversion factor. */
export async function byproductShare(outputRef) {
  const out = await rq1('SELECT * FROM output WHERE reference = $1', [outputRef]);
  if (!out) return null;
  const siblings = await rq('SELECT mass_g FROM output WHERE run = $1', [out.run]);
  const totalOutput = siblings.reduce((s, o) => s + Number(o.mass_g), 0);
  const bp = shareBp(Number(out.mass_g), totalOutput);

  const run = await rq1('SELECT * FROM run WHERE reference = $1', [out.run]);
  const period = await rq1(
    `SELECT * FROM balance_period WHERE site = $1 AND $2::date BETWEEN period_from AND period_to LIMIT 1`,
    [run.site, run.effective_on]
  );

  // The claim and the emissions the run carried, so a share can be taken of it.
  const consumed = await rq('SELECT * FROM consumption WHERE run = $1', [out.run]);
  const inputMass = consumed.reduce((s, c) => s + Number(c.mass_g), 0);

  // The emissions a byproduct takes a share of are the emissions of the material
  // it came out of, which is carried by the lot this run's output eventually
  // reaches. A byproduct three hops upstream of a lot still shares that lot's
  // figure, so the walk runs forward rather than stopping at this run.
  const anyLot = await rq1(
    `WITH RECURSIVE down(ref) AS (
       SELECT reference FROM output WHERE run = $1
       UNION
       SELECT o.reference FROM output o
         JOIN consumption c ON c.run = o.run
         JOIN down ON down.ref = c.input_ref)
     SELECT l.reference FROM lot l JOIN down ON down.ref = l.output_ref LIMIT 1`,
    [out.run]
  );
  let emissionsMgPerKg = 0;
  if (anyLot) {
    const f = await rq1(
      'SELECT value_mg_per_kg FROM carbon_figure WHERE lot = $1 AND superseded_by IS NULL LIMIT 1', [anyLot.reference]
    );
    emissionsMgPerKg = Number(f?.value_mg_per_kg || 0);
  }

  return {
    reference: outputRef,
    run: out.run,
    kind: out.kind,
    disposition: out.disposition,
    mass_g: Number(out.mass_g),
    total_output_mass_g: totalOutput,
    share_bp: bp,
    allocation_basis: period?.allocation_basis || out.allocation_basis || 'mass',
    // A disposed byproduct takes no share: it is a loss.
    claim_share_g: out.disposition === 'sold' ? applyShare(inputMass, bp) : 0,
    emissions_share_mg: out.disposition === 'sold' ? applyShare(emissionsMgPerKg, bp) : 0,
    loss: out.disposition === 'disposed',
    derivation: {
      share_bp: `byproduct_mass_g ${out.mass_g} * 10000 / total_output_mass_g ${totalOutput}, floored`,
      claim_share_g: `input mass ${inputMass} g * ${bp} bp / 10000, floored`,
      emissions_share_mg: `${emissionsMgPerKg} mg/kg * ${bp} bp / 10000, floored`,
      basis: `the period's allocation basis, ${period?.allocation_basis || 'mass'}`
    }
  };
}

export { assembleFigure, energyFor };

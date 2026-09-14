// The eight issuing conditions. Decided again at the moment of signing.
import { q, one } from './db.js';

export async function eightConditions({ lotRef, signer, period, allocationMass, category }) {
  const lot = await one(`select * from lot where reference = $1`, [lotRef]);
  if (!lot) throw new Error('lot_not_found');
  const out = [];

  const disp = await one(`select disposition from lot where reference = $1`, [lotRef]);
  out.push({ condition: 'lot_released', satisfied: disp?.disposition === 'released',
    blocking_reference: disp?.disposition === 'released' ? null : `/console/lots/${lotRef}` });

  const openDev = await q(`select reference from deviation where state = 'open' and ($1 = any(affects_lots) or cardinality(affects_lots) = 0 and $2 = any(affects_runs))`, [lotRef, lotRef]);
  const devs = await q(`select reference, affects_runs from deviation where state = 'open'`);
  let devRef = null;
  for (const d of devs) {
    if ((d.affects_runs || []).length) {
      const hit = await one(`select 1 as x from output o join consumption c on c.run_ref = o.run_ref where o.lot = $1 and o.kind = 'lot' and c.run_ref = any($2) limit 1`, [lotRef, d.affects_runs]);
      if (hit) { devRef = d.reference; break; }
    }
  }
  const directDev = await one(`select reference from deviation where state = 'open' and $1 = any(affects_lots)`, [lotRef]);
  const blockingDev = directDev || (devRef ? { reference: devRef } : null);
  out.push({ condition: 'no_open_deviation', satisfied: !blockingDev, blocking_reference: blockingDev ? `/console/deviations/${blockingDev.reference}` : null });

  const ovr = await one(`select reference from override where lot = $1 and reviewed = false`, [lotRef]);
  out.push({ condition: 'no_unreviewed_override', satisfied: !ovr, blocking_reference: ovr ? `/console/overrides/${ovr.reference}` : null });

  const bp = await one(`select * from balance_period where id = $1`, [period]);
  out.push({ condition: 'period_closed', satisfied: bp?.state === 'closed', blocking_reference: bp?.state === 'closed' ? null : `/console/balance/${period}` });

  let invariant = true; let invariantRef = null;
  if (bp && allocationMass != null && category) {
    const movs = await q(`select direction, category, mass_g from credit_movement where balance_period = $1`, [period]);
    let inMass = 0, outMass = 0;
    for (const m of movs) { if (m.category !== category) continue; if (m.direction === 'in') inMass += m.mass_g; else outMass += m.mass_g; }
    invariant = outMass + allocationMass <= inMass;
    invariantRef = invariant ? null : `/console/balance/${period}`;
  }
  out.push({ condition: 'balance_invariant_holds', satisfied: invariant, blocking_reference: invariantRef });

  const fig = await one(`select * from carbon_figure where lot = $1 and superseded_by is null order by version desc limit 1`, [lotRef]);
  const complete = fig && fig.value_mg_per_kg != null && fig.boundary && fig.method_version != null && fig.uncertainty_bp != null;
  out.push({ condition: 'carbon_figure_complete', satisfied: !!complete, blocking_reference: complete ? null : `/console/lots/${lotRef}/carbon` });

  const inScope = signer && (signer.sites || []).includes(lot.site);
  out.push({ condition: 'signer_scope_covers_site', satisfied: !!inScope, blocking_reference: inScope ? null : `/console/certificates` });

  const entered = await one(`select 1 as x from test_result where subject_ref = $1 and analyst = $2 limit 1`, [lotRef, signer?.email]);
  const enteredBatch = await one(`select 1 as x from test_result t join consumption c on c.input_kind = 'batch' join output o on o.run_ref = c.run_ref where t.subject_ref = c.input_ref and o.lot = $1 and t.analyst = $2 limit 1`, [lotRef, signer?.email]);
  out.push({ condition: 'signer_did_not_enter_data', satisfied: !entered && !enteredBatch, blocking_reference: (entered || enteredBatch) ? `/console/lots/${lotRef}` : null });

  return out;
}

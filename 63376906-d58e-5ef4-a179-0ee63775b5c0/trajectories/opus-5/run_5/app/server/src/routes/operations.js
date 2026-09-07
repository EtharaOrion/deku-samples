import { Hono } from 'hono';
import { q, one, pool, tx, snapshot } from '../lib/db.js';
import { refuse, noPaging, withIdempotency, nextRef, recordRefusal } from '../lib/http.js';
import { requireSession, requireRole, requireSiteScope } from './middleware.js';
import { appendEntry } from '../lib/record.js';
import { requireInt, dryMass, creditFor, dayOf } from '../lib/num.js';
import { listBatches, batchWithFacts, genealogyOfLot, impactOfBatch, contextFor, batchFacts } from '../engine/genealogy.js';
import { lotClaim, lotYield, conversionFactorsInForce, periodFor } from '../engine/ledger.js';

const r = new Hono();

const FORBIDDEN_COMPUTED = ['content_bp', 'recycled_content_bp', 'losses_g', 'value_mg_per_kg', 'carbon_mg_per_kg', 'percentage', 'recycled_percent', 'yield_bp', 'claim_bp', 'factor_bp_override'];

function refuseComputedInput(body, allow = []) {
  for (const k of FORBIDDEN_COMPUTED) {
    if (allow.includes(k)) continue;
    if (body && Object.prototype.hasOwnProperty.call(body, k)) {
      throw refuse(400, 'computed_figure_not_accepted', `'${k}' is computed by this system and no route accepts it from a caller.`, { field: k });
    }
  }
}

async function nameOnDate(reference, on) {
  const rows = await q('select * from party_version where reference = $1 order by effective_from asc', [reference]);
  const day = dayOf(on);
  let name = null;
  for (const x of rows) if (dayOf(x.effective_from) <= day) name = x.name;
  if (name) return name;
  const col = await one('select name from collector where reference = $1', [reference]);
  return col ? col.name : reference;
}

/* ---------------------------------------------------------------- batches */

r.get('/batches', async (c) => {
  noPaging(c);
  requireSession(c);
  return c.json(await listBatches());
});

r.get('/batches/:reference', async (c) => {
  requireSession(c);
  const b = await batchWithFacts(c.req.param('reference'));
  if (!b) throw refuse(404, 'not_found', 'No such batch.');
  return c.json(b);
});

r.post('/batches', async (c) => {
  const s = await requireRole(c, 'batch_booked_in', 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /batches', body, async () => {
    refuseComputedInput(body);
    const { collector, site, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, composition = {}, contamination = {}, custody = [] } = body;
    if (!category) throw refuse(400, 'category_required', 'category is required at intake, has no default, and can never be changed after acceptance.');
    if (!['post_consumer', 'pre_consumer'].includes(category)) throw refuse(400, 'invalid_category', "category is one of 'post_consumer', 'pre_consumer'.");
    if (!collector || !site || !received_on) throw refuse(400, 'fields_required', 'A batch names its collector, its site and its receipt date.');
    for (const [k, v] of [['gross_g', gross_g], ['tare_g', tare_g], ['net_g', net_g], ['moisture_bp', moisture_bp]]) requireInt(v, k);
    await requireSiteScope(c, s, site);
    const col = await one('select * from collector where reference = $1', [collector]);
    if (!col) throw refuse(404, 'collector_not_found', 'No such collector.');
    // A plant operator books in a batch but may not approve the collector; the
    // approval in force on the receipt date is read, never written.
    const seqRef = await nextBatchRef();
    const collector_name = await nameOnDate(collector, received_on);
    const calState = await calibrationState(device, received_on);
    const eventAt = body.event_at || `${received_on}T00:00:00Z`;
    // A batch and its weighing land together or neither lands.
    await tx(async (client) => {
      await client.query(
        `insert into batch (reference, collector, collector_name, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, composition, contamination, accepted_g, rejected_g, accepted, closed, event_at, effective_on, recorded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,true,true,$17,$18,$19)`,
        [seqRef, collector, collector_name, site, body.grade || 'N6', category, gross_g, tare_g, net_g, moisture_bp, moisture_method || 'ISO 15512', device || null, received_on, JSON.stringify(composition), JSON.stringify(contamination), net_g, eventAt, received_on, s.email],
      );
      await client.query(
        'insert into weighing (reference, batch, device, gross_g, tare_g, net_g, calibration_state, weighed_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [`WGH-${seqRef.slice(6)}`, seqRef, device || null, gross_g, tare_g, net_g, calState, eventAt],
      );
      let ord = 0;
      for (const link of custody) {
        ord += 1;
        await client.query('insert into custody_link (batch, ordinal, kind, party, link_date, document) values ($1,$2,$3,$4,$5,$6)', [seqRef, ord, link.kind, link.party || null, link.date || null, link.document || null]);
      }
    });
    // A measured composition departing from the declaration by more than 500
    // basis points raises a finding against the collector, not against the plant.
    if (composition && composition.measured_fraction_bp != null && composition.fraction_bp != null) {
      const departure = Math.abs(composition.measured_fraction_bp - composition.fraction_bp);
      if (departure > 500) {
        const fref = await nextRef('FND-', 'finding');
        await pool.query(
          'insert into finding (reference, collector, batch, kind, detail, raised_on, due_on, state, departure_bp) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [fref, collector, seqRef, 'declaration_departure', `Measured ${composition.polymer || 'polymer'} fraction ${composition.measured_fraction_bp} bp against a declared ${composition.fraction_bp} bp, a departure of ${departure} basis points beyond the 500 basis point tolerance.`, received_on, null, 'open', departure],
        );
        await appendEntry(null, { act: 'finding_raised', person: s.email, person_id: s.person_id, object_kind: 'finding', object_ref: fref, content: { collector, batch: seqRef, departure_bp: departure } });
      }
    }
    await appendEntry(null, { act: 'batch_booked_in', person: s.email, person_id: s.person_id, site, object_kind: 'batch', object_ref: seqRef, content: { collector, category, net_g, moisture_bp, dry_mass_g: dryMass(net_g, moisture_bp), received_on } });
    await appendEntry(null, { act: 'weighing_recorded', person: s.email, person_id: s.person_id, site, object_kind: 'weighing', object_ref: `WGH-${seqRef.slice(6)}`, content: { device, calibration_state: calState } });
    const shaped = await batchWithFacts(seqRef);
    return { status: 201, body: { reference: seqRef, ...shaped } };
  });
  return c.json(out.body, out.status);
});

// The seeded batches run BATCH-1001 upwards, so this series is four digits with
// no padding beyond its own width. It is allocated atomically for the same
// reason every other reference is: two bookings landing at once must take two
// references rather than colliding.
async function nextBatchRef() {
  return nextRef('BATCH-', 'batch', 'reference', 4);
}

async function calibrationState(device, on) {
  if (!device) return 'unknown';
  const d = await one('select * from weighing_device where reference = $1', [device]);
  if (!d) return 'unknown';
  const months = (Date.parse(String(on)) - Date.parse(String(d.calibrated_on))) / (86400000 * 365.25 / 12);
  return months > 12 ? 'lapsed' : 'in_calibration';
}

// A batch category cannot be changed after acceptance, by anybody, through any route.
r.patch('/batches/:reference', async (c) => {
  const s = requireSession(c);
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const b = await one('select * from batch where reference = $1', [reference]);
  if (!b) throw refuse(404, 'not_found', 'No such batch.');
  if (Object.prototype.hasOwnProperty.call(body, 'category')) {
    await recordRefusal(s, 'batch_category_change_refused', 'batch', reference, { attempted_category: body.category, current_category: b.category, rule: 'A batch category cannot be changed after acceptance, by anybody, through any route.' }, b.site);
    throw refuse(409, 'category_immutable_after_acceptance', 'A batch category cannot be changed after acceptance, by anybody, through any route. A correction is a new record naming what it corrects.', {
      rule: 'category_immutable_after_acceptance',
      current_category: b.category,
      batch: reference,
    });
  }
  refuseComputedInput(body);
  if (!(s.roles || []).includes('plant_operator')) throw refuse(403, 'role_not_permitted', 'A plant operator amends a batch record.');
  const allowed = ['moisture_method', 'contamination', 'composition'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      vals.push(typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (!sets.length) throw refuse(400, 'nothing_to_change', 'No amendable field was named.');
  vals.push(reference);
  await pool.query(`update batch set ${sets.join(', ')} where reference = $${vals.length}`, vals);
  await appendEntry(null, { act: 'batch_amended', person: s.email, person_id: s.person_id, site: b.site, object_kind: 'batch', object_ref: reference, content: body });
  return c.json(await batchWithFacts(reference));
});

r.post('/batches/:reference/custody', async (c) => {
  const s = await requireRole(c, 'custody_link_attached', 'plant_operator', 'quality_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /batches/${reference}/custody`, body, async () => {
    const b = await one('select * from batch where reference = $1', [reference]);
    if (!b) throw refuse(404, 'not_found', 'No such batch.');
    const { kind, party = null, date = null, arrived_on, document = null } = body;
    if (!kind) throw refuse(400, 'kind_required', "custody kind is one of 'collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'.");
    if (!arrived_on) throw refuse(400, 'arrived_on_required', 'A late document carries the date it arrived; the batch becomes claimable from that date rather than from its receipt date.');
    const maxOrd = await one('select coalesce(max(ordinal),0) as m from custody_link where batch = $1', [reference]);
    await pool.query('insert into custody_link (batch, ordinal, kind, party, link_date, late, arrived_on, document) values ($1,$2,$3,$4,$5,true,$6,$7)', [reference, Number(maxOrd.m) + 1, kind, party, date, arrived_on, document]);
    await pool.query('update batch set claimable_from = $1 where reference = $2', [arrived_on, reference]);
    await appendEntry(null, { act: 'custody_link_attached', person: s.email, person_id: s.person_id, site: b.site, object_kind: 'batch', object_ref: reference, content: { kind, arrived_on, document, note: 'The batch becomes claimable from the date the late evidence arrived.' } });
    const shaped = await batchWithFacts(reference);
    return { status: 201, body: { reference, ...shaped } };
  });
  return c.json(out.body, out.status);
});

r.post('/batches/:reference/reject', async (c) => {
  const s = await requireRole(c, 'batch_rejected', 'plant_operator', 'quality_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /batches/${reference}/reject`, body, async () => {
    const b = await one('select * from batch where reference = $1', [reference]);
    if (!b) throw refuse(404, 'not_found', 'No such batch.');
    const { rejected_g, reason, destination } = body;
    requireInt(rejected_g, 'rejected_g');
    if (!reason || !destination) throw refuse(400, 'reason_and_destination_required', 'A partial rejection records where the rejected mass went.');
    const delivered = Number(b.net_g);
    if (rejected_g < 0 || rejected_g > delivered) {
      throw refuse(409, 'rejection_does_not_sum', `Accepted mass plus rejected mass equals delivered mass. Delivered ${delivered} g and the rejection names ${rejected_g} g.`, { delivered_g: delivered, rejected_g });
    }
    const accepted_g = delivered - rejected_g;
    await pool.query('update batch set accepted_g = $1, rejected_g = $2, rejected_reason = $3, rejected_destination = $4, accepted = $5 where reference = $6', [accepted_g, rejected_g, reason, destination, accepted_g > 0, reference]);
    await appendEntry(null, { act: 'batch_rejected', person: s.email, person_id: s.person_id, site: b.site, object_kind: 'batch', object_ref: reference, content: { rejected_g, accepted_g, reason, destination } });
    const shaped = await batchWithFacts(reference);
    return { status: 200, body: { reference, ...shaped, accepted_g, rejected_g, rejected_destination: destination, delivered_g: delivered } };
  });
  return c.json(out.body, out.status);
});

r.get('/batches/:reference/impact', async (c) => {
  noPaging(c);
  requireSession(c);
  // The traversal a withdrawal runs on the worst day the company will have. It
  // sees one state and names the moment it saw.
  const { out, at } = await snapshot(async (runner, seen) => ({ out: await impactOfBatch(c.req.param('reference'), runner), at: seen }));
  if (!out) throw refuse(404, 'not_found', 'No such batch.');
  return c.json({ ...out, read_at: at });
});

/* -------------------------------------------------------------------- runs */

function shapeRun(run, cons, outs, recipe) {
  const massIn = cons.reduce((s, x) => s + Number(x.mass_g), 0);
  const massOut = outs.reduce((s, x) => s + Number(x.mass_g), 0);
  return {
    reference: run.reference,
    run_type: run.run_type,
    site: run.site,
    equipment: run.equipment,
    recipe_version: run.recipe_version,
    recipe: recipe
      ? { reference: recipe.reference, version: recipe.version, set_points: recipe.set_points, tolerances: recipe.tolerances, reagents: recipe.reagents, residence_minutes: recipe.residence_minutes, released_by: recipe.released_by, released_on: recipe.released_on ? dayOf(recipe.released_on) : null }
      : null,
    actual_set_points: run.actual_set_points,
    within_tolerance: run.within_tolerance,
    operator: run.operator,
    started_at: run.started_at,
    closed_at: run.closed_at,
    state: run.state,
    losses_g: run.losses_g == null ? null : Number(run.losses_g),
    mass_in_g: massIn,
    mass_out_g: massOut,
    consumptions: cons.map((x) => ({ reference: x.reference, input_kind: x.input_kind, input: x.input_ref, mass_g: Number(x.mass_g), effective_on: dayOf(x.effective_on) })),
    outputs: outs.map((x) => ({ reference: x.reference, kind: x.kind, mass_g: Number(x.mass_g), disposition: x.disposition })),
    event_at: run.event_at,
    recorded_at: run.recorded_at,
    effective_on: dayOf(run.effective_on),
    derivation: { losses_g: 'mass in minus mass out, computed at close. Losses reduce the claim.' },
  };
}

r.get('/runs', async (c) => {
  noPaging(c);
  requireSession(c);
  const runs = await q('select * from run order by started_at asc, reference asc');
  const cons = await q('select * from consumption');
  const outs = await q('select * from output');
  const recipes = await q('select * from recipe_version');
  const ctx = await contextFor();
  return c.json(
    runs.map((run) => {
      const shaped = shapeRun(run, cons.filter((x) => x.run === run.reference), outs.filter((x) => x.run === run.reference), recipes.find((x) => x.reference === run.recipe_version));
      // A batch missing a custody link names the missing kind on every run that consumed it.
      const flags = [];
      for (const cn of cons.filter((x) => x.run === run.reference && x.input_kind === 'batch')) {
        const b = ctx.batches.find((x) => x.reference === cn.input_ref);
        if (!b) continue;
        const f = batchFacts(b, ctx);
        for (const fl of f.flags) flags.push({ flag: fl, batch: b.reference, missing_link: f.missing_link });
      }
      return { ...shaped, flags };
    }),
  );
});

r.get('/runs/:reference', async (c) => {
  requireSession(c);
  const run = await one('select * from run where reference = $1', [c.req.param('reference')]);
  if (!run) throw refuse(404, 'not_found', 'No such run.');
  const cons = await q('select * from consumption where run = $1 order by reference', [run.reference]);
  const outs = await q('select * from output where run = $1 order by reference', [run.reference]);
  const recipe = await one('select * from recipe_version where reference = $1', [run.recipe_version]);
  const devs = await q('select * from deviation');
  const shaped = shapeRun(run, cons, outs, recipe);
  shaped.deviations = devs.filter((d) => (d.runs || []).includes(run.reference)).map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail }));
  return c.json(shaped);
});

r.post('/runs', async (c) => {
  const s = await requireRole(c, 'run_started', 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /runs', body, async () => {
    refuseComputedInput(body);
    const { run_type, site, equipment, recipe_version, operator, started_at } = body;
    if (!['dissolution', 'depolymerisation', 'purification', 'repolymerisation'].includes(run_type)) throw refuse(400, 'invalid_run_type', "run_type is one of 'dissolution', 'depolymerisation', 'purification', 'repolymerisation'.");
    if (!site || !equipment || !recipe_version || !operator || !started_at) throw refuse(400, 'fields_required', 'A run names a site, an equipment, a recipe version, an operator and a start.');
    await requireSiteScope(c, s, site);
    const rec = await one('select * from recipe_version where reference = $1', [recipe_version]);
    if (!rec) throw refuse(404, 'recipe_version_not_found', 'No such recipe version.');
    const prefix = { dissolution: 'RUN-D-', depolymerisation: 'RUN-Y-', purification: 'RUN-U-', repolymerisation: 'RUN-R-' }[run_type];
    const reference = await nextRef(prefix, 'run');
    const day = dayOf(started_at);
    await pool.query(
      'insert into run (reference, run_type, site, equipment, recipe_version, operator, started_at, state, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [reference, run_type, site, equipment, recipe_version, operator, started_at, 'open', started_at, day, s.email],
    );
    await appendEntry(null, { act: 'run_started', person: s.email, person_id: s.person_id, site, object_kind: 'run', object_ref: reference, content: { run_type, recipe_version, equipment, started_at } });
    return { status: 201, body: { reference, run_type, site, equipment, recipe_version, operator, started_at, state: 'open' } };
  });
  return c.json(out.body, out.status);
});

r.post('/runs/:reference/consumptions', async (c) => {
  const s = await requireRole(c, 'consumption_recorded', 'plant_operator');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /runs/${reference}/consumptions`, body, async () => {
    refuseComputedInput(body);
    const run = await one('select * from run where reference = $1', [reference]);
    if (!run) throw refuse(404, 'not_found', 'No such run.');
    if (run.state === 'closed') {
      await recordRefusal(s, 'write_to_closed_run_refused', 'run', reference, { attempt: 'consumption' }, run.site);
      throw refuse(409, 'run_closed', 'A closed run refuses every write. A correction is a new record naming what it corrects.');
    }
    const { input, input_kind, mass_g, effective_on } = body;
    requireInt(mass_g, 'mass_g');
    if (!input) throw refuse(400, 'input_required', 'A consumption records one input and the mass consumed from it.');
    const kind = input_kind || (String(input).startsWith('BATCH-') ? 'batch' : 'output');
    const src = kind === 'batch' ? await one('select * from batch where reference = $1', [input]) : await one('select * from output where reference = $1', [input]);
    if (!src) throw refuse(404, 'input_not_found', 'No such input.');
    const eff = effective_on || dayOf(run.started_at);
    // A consumption whose effective date falls in a closed period is refused as
    // a write into that period and opens a restatement instead.
    const period = await periodFor(run.site, kind === 'batch' ? src.grade : 'N6', eff);
    if (period && period.state === 'closed') {
      const rref = await nextRef('RST-', 'restatement');
      await pool.query('insert into restatement (reference, period, reason, opened_by, certificates, trigger_kind) values ($1,$2,$3,$4,$5,$6)', [rref, period.id, `A consumption of ${input} effective ${eff} falls in the closed period ${period.id}.`, s.email, JSON.stringify((await q('select number from certificate where period = $1', [period.id])).map((x) => x.number)), 'late_consumption']);
      await appendEntry(null, { act: 'restatement_opened', person: s.email, person_id: s.person_id, site: run.site, object_kind: 'restatement', object_ref: rref, content: { period: period.id, reason: 'late consumption into a closed period' } });
      throw refuse(409, 'period_closed', `This period is closed. Corrections require a restatement. Restatement ${rref} has been opened against ${period.id}.`, { period: period.id, restatement: rref });
    }
    const cref = await nextRef('CNS-', 'consumption');
    await pool.query('insert into consumption (reference, run, input_kind, input_ref, mass_g, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)', [cref, reference, kind, input, mass_g, body.event_at || new Date().toISOString(), eff, s.email]);
    // Credits enter when a claimable batch is consumed.
    let credit = null;
    if (kind === 'batch' && period) {
      const ctx = await contextFor();
      const facts = batchFacts(src, ctx);
      const claimableOnDate = facts.claimable && (!facts.claimable_from || facts.claimable_from <= eff);
      if (claimableOnDate) {
        const factors = await conversionFactorsInForce(run.site, eff);
        const factor = factors.in_force;
        const dryConsumed = dryMass(mass_g, src.moisture_bp);
        const granted = creditFor(dryConsumed, factor ? factor.factor_bp : 0);
        const mref = await nextRef('CRM-', 'credit_movement');
        await pool.query(
          'insert into credit_movement (reference, period, category, direction, mass_g, source_kind, source_ref, origin_site, fresh_credit, derivation, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12)',
          [mref, period.id, src.category, 'in', granted, 'consumption', cref, run.site, JSON.stringify({ rule: 'dry_mass_consumed_g * factor_bp / 10000, floored', dry_mass_consumed_g: dryConsumed, factor_bp: factor ? factor.factor_bp : 0, factor: factor ? factor.reference : null, batch: input, consumption: cref }), body.event_at || new Date().toISOString(), eff, s.email],
        );
        credit = { reference: mref, mass_g: granted, category: src.category, derivation: { dry_mass_consumed_g: dryConsumed, factor_bp: factor ? factor.factor_bp : 0 } };
      } else {
        credit = { reference: null, mass_g: 0, category: 'non_claimable', reason: facts.claimable_reason, detail: 'Material from a lapsed collector, or with a broken custody chain, is processed as non-claimable input.' };
      }
    }
    await appendEntry(null, { act: 'consumption_recorded', person: s.email, person_id: s.person_id, site: run.site, object_kind: 'consumption', object_ref: cref, content: { run: reference, input, mass_g, credit } });
    return { status: 201, body: { reference: cref, run: reference, input, input_kind: kind, mass_g, effective_on: eff, credit } };
  });
  return c.json(out.body, out.status);
});

r.post('/runs/:reference/outputs', async (c) => {
  const s = await requireRole(c, 'output_recorded', 'plant_operator');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /runs/${reference}/outputs`, body, async () => {
    refuseComputedInput(body);
    const run = await one('select * from run where reference = $1', [reference]);
    if (!run) throw refuse(404, 'not_found', 'No such run.');
    if (run.state === 'closed') {
      await recordRefusal(s, 'write_to_closed_run_refused', 'run', reference, { attempt: 'output' }, run.site);
      throw refuse(409, 'run_closed', 'A closed run refuses every write.');
    }
    const { kind, mass_g, disposition = null, grade = 'N6', claim_type = 'mass_balance' } = body;
    if (!['intermediate', 'lot', 'byproduct'].includes(kind)) throw refuse(400, 'invalid_kind', "kind is one of 'intermediate', 'lot', 'byproduct'.");
    requireInt(mass_g, 'mass_g');
    if (kind === 'byproduct' && !['sold', 'disposed'].includes(disposition)) throw refuse(400, 'disposition_required', "A byproduct carries a disposition in 'sold', 'disposed'.");
    const prefix = { dissolution: 'OUT-D-', depolymerisation: 'OUT-Y-', purification: 'OUT-U-', repolymerisation: 'OUT-R-' }[run.run_type];
    let oref;
    if (kind === 'lot') {
      oref = await nextRef(`LOT-${grade}-`, 'lot');
    } else {
      oref = await nextRef(prefix, 'output');
    }
    const eff = dayOf(run.started_at);
    await pool.query('insert into output (reference, run, kind, mass_g, disposition, event_at, effective_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)', [oref, reference, kind, mass_g, disposition, body.event_at || new Date().toISOString(), eff, s.email]);
    if (kind === 'lot') {
      await pool.query('insert into lot (reference, grade, site, mass_g, output_ref, disposition, claim_type, specification_version, produced_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [oref, grade, run.site, mass_g, oref, 'pending', claim_type, 3, eff, s.email]);
    }
    await appendEntry(null, { act: 'output_recorded', person: s.email, person_id: s.person_id, site: run.site, object_kind: 'output', object_ref: oref, content: { run: reference, kind, mass_g, disposition } });
    return { status: 201, body: { reference: oref, run: reference, kind, mass_g, disposition } };
  });
  return c.json(out.body, out.status);
});

r.post('/runs/:reference/close', async (c) => {
  const s = await requireRole(c, 'run_closed', 'plant_operator');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /runs/${reference}/close`, body, async () => {
    const run = await one('select * from run where reference = $1', [reference]);
    if (!run) throw refuse(404, 'not_found', 'No such run.');
    if (run.state === 'closed') {
      await recordRefusal(s, 'second_close_refused', 'run', reference, { detail: 'A closed run refuses a second close, and the attempt is itself recorded.' }, run.site);
      throw refuse(409, 'run_already_closed', 'A closed run refuses a second close. This attempt is recorded.', { closed_at: run.closed_at, losses_g: Number(run.losses_g || 0) });
    }
    const cons = await q('select * from consumption where run = $1', [reference]);
    const outs = await q('select * from output where run = $1', [reference]);
    const massIn = cons.reduce((x, y) => x + Number(y.mass_g), 0);
    const massOut = outs.reduce((x, y) => x + Number(y.mass_g), 0);
    const losses = massIn - massOut;
    let recipe;
    try {
      recipe = await one('select * from recipe_version where reference = $1', [run.recipe_version]);
    } catch (e) {
      // Closing a run while the arithmetic is unavailable is queued and reported
      // as queued rather than as complete.
      const qref = await nextRef('QUE-', 'queued_work');
      await pool.query('insert into queued_work (reference, kind, payload) values ($1,$2,$3)', [qref, 'run_close', JSON.stringify({ run: reference, requested_by: s.email })]);
      await appendEntry(null, { act: 'run_close_queued', person: s.email, person_id: s.person_id, site: run.site, object_kind: 'run', object_ref: reference, outcome: 'queued', content: { queued_work: qref, reason: 'the arithmetic layer was unavailable' } });
      return { status: 202, body: { reference, state: 'queued', queued_work: qref, detail: 'This close is queued rather than complete. The arithmetic was unavailable and the run has not been frozen.' } };
    }
    const actual = body.actual_set_points || run.actual_set_points || {};
    let within = true;
    for (const [k, range] of Object.entries(recipe?.tolerances || {})) {
      const v = actual[k];
      if (v == null) continue;
      if (v < range[0] || v > range[1]) within = false;
    }
    await pool.query("update run set state = 'closed', closed_at = $1, losses_g = $2, actual_set_points = $3, within_tolerance = $4 where reference = $5", [new Date().toISOString(), losses, JSON.stringify(actual), within, reference]);
    let deviation = null;
    if (!within) {
      // A run outside its recipe tolerance raises a deviation whether or not its
      // output passed its tests.
      const dref = await nextRef('DEV-', 'deviation');
      const lots = outs.filter((o) => o.kind === 'lot').map((o) => o.reference);
      await pool.query('insert into deviation (reference, state, runs, lots, detail, raised_by, raised_at, effective_on) values ($1,$2,$3,$4,$5,$6,$7,$8)', [dref, 'open', JSON.stringify([reference]), JSON.stringify(lots), `Run ${reference} ran outside the tolerance of ${run.recipe_version}.`, s.email, new Date().toISOString(), dayOf(run.effective_on)]);
      deviation = dref;
      await appendEntry(null, { act: 'deviation_raised', person: s.email, person_id: s.person_id, site: run.site, object_kind: 'deviation', object_ref: dref, content: { run: reference, reason: 'outside recipe tolerance' } });
    }
    await appendEntry(null, { act: 'run_closed', person: s.email, person_id: s.person_id, site: run.site, object_kind: 'run', object_ref: reference, content: { losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within, deviation, note: 'Losses reduce the claim.' } });
    return { status: 200, body: { reference, state: 'closed', losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within, deviation, derivation: { losses_g: 'mass in minus mass out' } } };
  });
  return c.json(out.body, out.status);
});

r.get('/recipe-versions', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from recipe_version order by reference');
  return c.json(rows.map((x) => ({ reference: x.reference, recipe: x.recipe, version: x.version, run_type: x.run_type, set_points: x.set_points, tolerances: x.tolerances, reagents: x.reagents, residence_minutes: x.residence_minutes, released_by: x.released_by, released_on: x.released_on ? dayOf(x.released_on) : null, superseded_by: x.superseded_by })));
});

/* -------------------------------------------------------------------- lots */

r.get('/lots', async (c) => {
  noPaging(c);
  requireSession(c);
  const lots = await q('select * from lot order by reference');
  const devs = await q('select * from deviation');
  const ovrs = await q('select * from override_record');
  const out = [];
  for (const l of lots) {
    const claim = await lotClaim(l.reference);
    const g = await genealogyOfLot(l.reference).catch(() => null);
    const flags = g ? [...new Set(g.nodes.flatMap((n) => n.flags || []))] : [];
    out.push({
      reference: l.reference,
      grade: l.grade,
      site: l.site,
      mass_g: Number(l.mass_g),
      disposition: l.disposition,
      claim_type: l.claim_type,
      content_bp: claim.content_bp,
      credit_attached_g: claim.credit_attached_g,
      category_split: claim.category_split,
      provisional_factor: claim.provisional_factor,
      specification_version: l.specification_version,
      produced_on: dayOf(l.produced_on),
      flags,
      open_deviations: devs.filter((d) => d.state === 'open' && (d.lots || []).includes(l.reference)).map((d) => d.reference),
      unreviewed_overrides: ovrs.filter((o) => o.lot === l.reference && !o.reviewed).map((o) => o.reference),
      overrides: ovrs.filter((o) => o.lot === l.reference).map((o) => ({ reference: o.reference, separation: o.separation, reviewed: o.reviewed, authorised_by: o.authorised_by, effective_on: dayOf(o.effective_on), reason: o.reason })),
      blended_sites: l.blended_sites,
    });
  }
  return c.json(out);
});

r.get('/lots/:reference', async (c) => {
  requireSession(c);
  const ref = c.req.param('reference');
  const l = await one('select * from lot where reference = $1', [ref]);
  if (!l) throw refuse(404, 'not_found', 'No such lot.');
  const claim = await lotClaim(ref);
  const g = await genealogyOfLot(ref).catch(() => null);
  const devs = await q('select * from deviation');
  const ovrs = await q('select * from override_record where lot = $1', [ref]);
  const tests = await q('select * from test_result where subject_ref = $1 order by reference', [ref]);
  return c.json({
    reference: l.reference,
    grade: l.grade,
    site: l.site,
    mass_g: Number(l.mass_g),
    disposition: l.disposition,
    disposition_by: l.disposition_by,
    claim_type: l.claim_type,
    content_bp: claim.content_bp,
    credit_attached_g: claim.credit_attached_g,
    category_split: claim.category_split,
    provisional_factor: claim.provisional_factor,
    conversion_factor: claim.conversion_factor,
    specification: l.specification,
    specification_version: l.specification_version,
    produced_on: dayOf(l.produced_on),
    flags: g ? [...new Set(g.nodes.flatMap((n) => n.flags || []))] : [],
    blended_from: l.blended_from,
    blended_sites: l.blended_sites,
    deviations: devs.filter((d) => (d.lots || []).includes(ref)).map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome, detail: d.detail })),
    overrides: ovrs.map((o) => ({ reference: o.reference, separation: o.separation, reason: o.reason, authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by, effective_on: dayOf(o.effective_on) })),
    test_results: tests.map((t) => ({ reference: t.reference, property: t.property, method: t.method, value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp, analyst: t.analyst, entered_by: t.entered_by, method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release })),
    derivation: claim.derivation,
  });
});

r.get('/lots/:reference/genealogy', async (c) => {
  noPaging(c);
  requireSession(c);
  const { g, at } = await snapshot(async (runner, seen) => ({ g: await genealogyOfLot(c.req.param('reference'), runner), at: seen }));
  if (!g) throw refuse(404, 'not_found', 'No such lot.');
  return c.json({ ...g, read_at: at });
});

// A yield figure appears on no certificate. It answers for plant operations,
// quality and the claims manager, and refuses a collector and a converter.
r.get('/lots/:reference/yield', async (c) => {
  noPaging(c);
  const s = requireSession(c);
  if (!['plant_operator', 'quality_manager', 'claims_manager', 'auditor'].some((role) => (s.roles || []).includes(role))) {
    throw refuse(403, 'yield_not_visible', 'A yield figure answers for plant operations, quality and the claims manager. It is refused to a collector and to a converter.');
  }
  const y = await lotYield(c.req.param('reference'));
  if (!y) throw refuse(404, 'not_found', 'No such lot.');
  return c.json(y);
});

r.post('/lots/:reference/disposition', async (c) => {
  const s = requireSession(c);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /lots/${ref}/disposition`, body, async () => {
    const l = await one('select * from lot where reference = $1', [ref]);
    if (!l) throw refuse(404, 'not_found', 'No such lot.');
    if (!(s.roles || []).includes('quality_manager')) {
      await recordRefusal(s, 'disposition_refused', 'lot', ref, { reason: 'not_a_quality_manager' }, l.site);
      throw refuse(403, 'role_not_permitted', 'A lot disposition is set by a quality manager. A plant operator and a laboratory analyst may not set one.');
    }
    const { disposition } = body;
    if (!['pending', 'released', 'quarantined', 'rejected'].includes(disposition)) throw refuse(400, 'invalid_disposition', "disposition is one of 'pending', 'released', 'quarantined', 'rejected'.");
    // Whoever entered a test result does not disposition that lot.
    const own = await q('select * from test_result where subject_ref = $1 and entered_by = $2', [ref, s.email]);
    if (own.length) {
      await recordRefusal(s, 'disposition_refused', 'lot', ref, { separation: 'analyst_not_dispositioner', test_result: own[0].reference }, l.site);
      throw refuse(409, 'separation_analyst_not_dispositioner', `${s.email} entered test result ${own[0].reference} on this lot and therefore does not disposition it. An override names the separation broken, a reason of at least forty characters and its authoriser.`, { separation: 'analyst_not_dispositioner', blocking_reference: own[0].reference });
    }
    const devs = await q("select * from deviation where state = 'open'");
    const open = devs.find((d) => (d.lots || []).includes(ref));
    if (open) {
      await recordRefusal(s, 'disposition_refused', 'lot', ref, { deviation: open.reference }, l.site);
      throw refuse(409, 'open_deviation', `Deviation ${open.reference} touching this lot is open.`, { blocking_reference: open.reference });
    }
    await pool.query('update lot set disposition = $1, disposition_by = $2, disposition_at = $3 where reference = $4', [disposition, s.email, new Date().toISOString(), ref]);
    await appendEntry(null, { act: 'lot_disposition_set', person: s.email, person_id: s.person_id, site: l.site, object_kind: 'lot', object_ref: ref, content: { disposition } });
    return { status: 200, body: { reference: ref, disposition, disposition_by: s.email } };
  });
  return c.json(out.body, out.status);
});

// A blend takes the weaker of the two claim types and names both sites.
const CLAIM_STRENGTH = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };

r.post('/lots/:reference/blend', async (c) => {
  const s = await requireRole(c, 'lot_blended', 'plant_operator', 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /lots/${ref}/blend`, body, async () => {
    refuseComputedInput(body);
    const { with: other } = body;
    if (!other) throw refuse(400, 'with_required', 'A blend names the second lot.');
    const a = await one('select * from lot where reference = $1', [ref]);
    const b = await one('select * from lot where reference = $1', [other]);
    if (!a || !b) throw refuse(404, 'not_found', 'No such lot.');
    const ca = await lotClaim(a.reference);
    const cb = await lotClaim(b.reference);
    const massA = Number(a.mass_g);
    const massB = Number(b.mass_g);
    const total = massA + massB;
    const { floorDiv } = await import('../lib/num.js');
    const content_bp = floorDiv(BigInt(massA) * BigInt(ca.content_bp) + BigInt(massB) * BigInt(cb.content_bp), total);
    const claim_type = CLAIM_STRENGTH[a.claim_type] <= CLAIM_STRENGTH[b.claim_type] ? a.claim_type : b.claim_type;
    const sites = [...new Set([a.site, b.site])].sort();
    const siteRows = await q('select * from site where reference = any($1)', [sites]);
    const weakest = siteRows.slice().sort((x, y) => (x.certification_state === 'certified' ? 1 : 0) - (y.certification_state === 'certified' ? 1 : 0))[0];
    const provisional_factor = ca.provisional_factor || cb.provisional_factor;
    const reference = await nextRef(`LOT-${a.grade}-`, 'lot');
    await pool.query(
      'insert into lot (reference, grade, site, mass_g, disposition, claim_type, specification_version, blended_from, blended_sites, produced_on, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [reference, a.grade, a.site, total, 'pending', claim_type, a.specification_version, JSON.stringify([{ lot: a.reference, mass_g: massA, content_bp: ca.content_bp }, { lot: b.reference, mass_g: massB, content_bp: cb.content_bp }]), JSON.stringify(sites), new Date().toISOString().slice(0, 10), s.email],
    );
    await appendEntry(null, { act: 'lot_blended', person: s.email, person_id: s.person_id, site: a.site, object_kind: 'lot', object_ref: reference, content: { from: [a.reference, b.reference], mass_g: total, content_bp, claim_type, sites } });
    return {
      status: 201,
      body: {
        reference,
        mass_g: total,
        content_bp,
        claim_type,
        sites,
        certification_scope: weakest ? weakest.certification_state : null,
        provisional_factor,
        blended_from: [{ lot: a.reference, mass_g: massA, content_bp: ca.content_bp }, { lot: b.reference, mass_g: massB, content_bp: cb.content_bp }],
        derivation: { content_bp: '(mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored', claim_type: 'the weaker of the two claim types', note: 'Any non-claimable material in a blend dilutes the computed percentage.' },
      },
    };
  });
  return c.json(out.body, out.status);
});

/* ---------------------------------------------------- tests and deviations */

r.get('/test-results', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from test_result order by reference');
  return c.json(rows.map(shapeTest));
});

function shapeTest(t) {
  return {
    reference: t.reference,
    subject_kind: t.subject_kind,
    subject: t.subject_ref,
    property: t.property,
    method: t.method,
    instrument: t.instrument,
    analyst: t.analyst,
    value: t.value,
    unit: t.unit,
    uncertainty_bp: t.uncertainty_bp,
    method_mismatch: t.method_mismatch,
    usable_for_release: t.usable_for_release,
    entered_by: t.entered_by,
    effective_on: dayOf(t.effective_on),
  };
}

r.post('/test-results', async (c) => {
  const s = await requireRole(c, 'test_result_entered', 'lab_analyst', 'quality_manager');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /test-results', body, async () => {
    const { lot, batch, property, method, instrument, analyst, value, unit, uncertainty_bp = null } = body;
    if (!method) throw refuse(400, 'method_required', 'A result with no method is refused. A figure without its method is not evidence.');
    if (!property || value == null || !unit) throw refuse(400, 'fields_required', 'A test result names a property, a value and a unit.');
    const subject_kind = lot ? 'lot' : 'batch';
    const subject_ref = lot || batch;
    if (!subject_ref) throw refuse(400, 'subject_required', 'A result is recorded against a lot or a batch.');
    const subj = lot ? await one('select * from lot where reference = $1', [lot]) : await one('select * from batch where reference = $1', [batch]);
    if (!subj) throw refuse(404, 'not_found', 'No such subject.');
    // A result produced by a method other than the one the specification names
    // is kept as evidence without ever reaching a disposition.
    let method_mismatch = false;
    if (lot) {
      const spec = await one('select * from specification where grade = $1 and version = $2', [subj.specification || 'SPEC-N6', subj.specification_version]);
      const row = (spec?.rows_json || []).find((x) => x.property === property);
      if (row && row.method !== method) method_mismatch = true;
    }
    const reference = await nextRef('TST-', 'test_result');
    await pool.query(
      'insert into test_result (reference, subject_kind, subject_ref, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release, entered_by, event_at, effective_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
      [reference, subject_kind, subject_ref, property, method, instrument || null, analyst || s.email, String(value), unit, uncertainty_bp, method_mismatch, !method_mismatch, s.email, body.event_at || new Date().toISOString(), body.effective_on || new Date().toISOString().slice(0, 10)],
    );
    await appendEntry(null, { act: 'test_result_entered', person: s.email, person_id: s.person_id, site: subj.site, object_kind: 'test_result', object_ref: reference, content: { subject: subject_ref, property, method, method_mismatch } });
    return {
      status: 201,
      body: {
        reference,
        subject: subject_ref,
        property,
        method,
        value: String(value),
        unit,
        uncertainty_bp,
        method_mismatch,
        usable_for_release: !method_mismatch,
        entered_by: s.email,
        detail: method_mismatch ? 'This result was produced by a method other than the one the specification names. It is kept as evidence and never reaches a disposition.' : null,
      },
    };
  });
  return c.json(out.body, out.status);
});

r.get('/deviations', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from deviation order by reference');
  return c.json(rows.map((d) => ({ reference: d.reference, state: d.state, runs: d.runs, lots: d.lots, detail: d.detail, outcome: d.outcome, raised_by: d.raised_by, raised_at: d.raised_at, closed_by: d.closed_by, closed_at: d.closed_at })));
});

r.post('/deviations', async (c) => {
  const s = await requireRole(c, 'deviation_raised', 'quality_manager');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /deviations', body, async () => {
    const { runs = [], lots = [], detail } = body;
    if (!detail) throw refuse(400, 'detail_required', 'A deviation states what happened.');
    if (!runs.length && !lots.length) throw refuse(400, 'subject_required', 'A deviation is raised against runs and lots.');
    const reference = await nextRef('DEV-', 'deviation');
    await pool.query('insert into deviation (reference, state, runs, lots, detail, raised_by, raised_at, effective_on) values ($1,$2,$3,$4,$5,$6,$7,$8)', [reference, 'open', JSON.stringify(runs), JSON.stringify(lots), detail, s.email, new Date().toISOString(), body.effective_on || new Date().toISOString().slice(0, 10)]);
    await appendEntry(null, { act: 'deviation_raised', person: s.email, person_id: s.person_id, object_kind: 'deviation', object_ref: reference, content: { runs, lots, detail } });
    return { status: 201, body: { reference, state: 'open', runs, lots, detail } };
  });
  return c.json(out.body, out.status);
});

r.post('/deviations/:reference/close', async (c) => {
  const s = await requireRole(c, 'deviation_closed', 'quality_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /deviations/${reference}/close`, body, async () => {
    const d = await one('select * from deviation where reference = $1', [reference]);
    if (!d) throw refuse(404, 'not_found', 'No such deviation.');
    if (d.state === 'closed') throw refuse(409, 'already_closed', 'This deviation is already closed.');
    const { outcome } = body;
    if (!['root_cause_found', 'cause_not_established'].includes(outcome)) throw refuse(400, 'invalid_outcome', "outcome is one of 'root_cause_found', 'cause_not_established'. Both are honest outcomes and neither is hidden.");
    await pool.query("update deviation set state = 'closed', outcome = $1, closed_by = $2, closed_at = $3 where reference = $4", [outcome, s.email, new Date().toISOString(), reference]);
    await appendEntry(null, { act: 'deviation_closed', person: s.email, person_id: s.person_id, object_kind: 'deviation', object_ref: reference, content: { outcome } });
    return { status: 200, body: { reference, state: 'closed', outcome, closed_by: s.email } };
  });
  return c.json(out.body, out.status);
});

/* --------------------------------------------------------------- overrides */

r.get('/overrides', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from override_record order by reference');
  return c.json(rows.map((o) => ({ reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot, authorised_by: o.authorised_by, recorded_by: o.recorded_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_at: o.reviewed_at, effective_on: dayOf(o.effective_on) })));
});

r.post('/overrides', async (c) => {
  const s = await requireRole(c, 'override_recorded', 'quality_manager', 'claims_manager', 'plant_operator');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /overrides', body, async () => {
    const { separation, reason, lot, authorised_by } = body;
    if (!separation) throw refuse(400, 'separation_required', 'An override names the separation broken.');
    if (!reason || String(reason).trim().length < 40) throw refuse(400, 'reason_too_short', 'An override carries a reason of at least forty characters.', { minimum_characters: 40, given_characters: String(reason || '').trim().length });
    if (!lot) throw refuse(400, 'lot_required', 'An override names the lot it stands on.');
    if (!authorised_by) throw refuse(400, 'authoriser_required', 'An override names its authoriser.');
    const l = await one('select * from lot where reference = $1', [lot]);
    if (!l) throw refuse(404, 'not_found', 'No such lot.');
    const reference = await nextRef('OVR-', 'override_record');
    await pool.query('insert into override_record (reference, separation, reason, lot, authorised_by, recorded_by, event_at, effective_on) values ($1,$2,$3,$4,$5,$6,$7,$8)', [reference, separation, reason, lot, authorised_by, s.email, new Date().toISOString(), new Date().toISOString().slice(0, 10)]);
    await appendEntry(null, { act: 'override_recorded', person: s.email, person_id: s.person_id, site: l.site, object_kind: 'override', object_ref: reference, content: { separation, lot, authorised_by, reason } });
    return { status: 201, body: { reference, separation, reason, lot, authorised_by, reviewed: false, detail: 'It is permanent, shows on the lot for its life, is counted on the balance screen, and blocks signing until a second person reviews it.' } };
  });
  return c.json(out.body, out.status);
});

r.post('/overrides/:reference/review', async (c) => {
  const s = requireSession(c);
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /overrides/${reference}/review`, body, async () => {
    const o = await one('select * from override_record where reference = $1', [reference]);
    if (!o) throw refuse(404, 'not_found', 'No such override.');
    if (!['quality_manager', 'claims_manager'].some((role) => (s.roles || []).includes(role))) {
      await recordRefusal(s, 'override_review_refused', 'override', reference, { reason: 'not_a_reviewer' });
      throw refuse(403, 'role_not_permitted', 'An override is reviewed by a quality manager or a claims manager.');
    }
    if (o.authorised_by === s.email) {
      await recordRefusal(s, 'override_review_refused', 'override', reference, { reason: 'authoriser_cannot_review' });
      throw refuse(409, 'authoriser_cannot_review', `${s.email} authorised this override and therefore does not review it. A second person reviews it.`, { authorised_by: o.authorised_by });
    }
    await pool.query('update override_record set reviewed = true, reviewed_by = $1, reviewed_at = $2 where reference = $3', [s.email, new Date().toISOString(), reference]);
    await appendEntry(null, { act: 'override_reviewed', person: s.email, person_id: s.person_id, object_kind: 'override', object_ref: reference, content: { reviewed_by: s.email, note: 'A review sets reviewed true and removes nothing.' } });
    return { status: 200, body: { reference, reviewed: true, reviewed_by: s.email, separation: o.separation, reason: o.reason, lot: o.lot, authorised_by: o.authorised_by, detail: 'A review sets reviewed true and removes nothing.' } };
  });
  return c.json(out.body, out.status);
});

export default r;

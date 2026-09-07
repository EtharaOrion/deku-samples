import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import {
  requireSession, requireAct, withIdempotency, refuse, refusePagination,
  requireFields, requireIntegers, rejectComputedInputs, nextReference, today,
} from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { batchView, iso } from '../engine/feedstock.js';
import { creditGranted, shareBp, floorDiv } from '../engine/arithmetic.js';

const r = new Hono();

const RUN_TYPES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

async function runView(run) {
  const [cons, outs, recipe, deviations] = await Promise.all([
    q('SELECT * FROM consumption WHERE run = $1 ORDER BY reference ASC', [run.reference]),
    q('SELECT * FROM output WHERE run = $1 ORDER BY reference ASC', [run.reference]),
    q('SELECT * FROM recipe_version WHERE reference = $1', [run.recipe_version]),
    q('SELECT * FROM deviation'),
  ]);
  const massIn = cons.reduce((s, x) => s + Number(x.mass_g), 0);
  const massOut = outs.reduce((s, x) => s + Number(x.mass_g), 0);
  const touching = deviations.filter((d) => (d.runs || []).includes(run.reference));
  // flags travel from the batches a run consumed
  const flags = new Set();
  const custodyMissing = [];
  for (const cn of cons.filter((x) => x.input_kind === 'batch')) {
    const b = await batchView(cn.input_ref);
    for (const f of b?.flags || []) flags.add(f);
    if (b && !b.custody_complete) custodyMissing.push({ batch: b.reference, missing: b.custody_missing });
  }
  return {
    reference: run.reference,
    run_type: run.run_type,
    site: run.site,
    equipment: run.equipment,
    recipe_version: run.recipe_version,
    recipe: recipe[0] ? { set_points: recipe[0].set_points, tolerances: recipe[0].tolerances, reagents: recipe[0].reagents, residence_min: recipe[0].residence_min, released_by: recipe[0].released_by } : null,
    actual_set_points: run.actual_set_points,
    within_tolerance: run.within_tolerance,
    operator: run.operator,
    started_at: run.started_at,
    closed_at: run.closed_at,
    state: run.state,
    queued: run.queued,
    losses_g: run.losses_g === null ? null : Number(run.losses_g),
    mass_in_g: massIn,
    mass_out_g: massOut,
    consumptions: cons.map((x) => ({ reference: x.reference, input_kind: x.input_kind, input_ref: x.input_ref, mass_g: Number(x.mass_g), event_at: x.event_at, recorded_at: x.recorded_at, effective_on: iso(x.effective_on) })),
    outputs: outs.map((x) => ({ reference: x.reference, kind: x.kind, mass_g: Number(x.mass_g), disposition: x.disposition, allocation_basis: x.allocation_basis })),
    deviations: touching.map((d) => ({ reference: d.reference, state: d.state, outcome: d.outcome })),
    open_deviation: touching.some((d) => d.state === 'open'),
    flags: [...flags],
    custody_missing: custodyMissing,
    event_at: run.event_at,
    recorded_at: run.recorded_at,
    effective_on: iso(run.effective_on),
    derivation: run.state === 'closed'
      ? `losses_g = mass in ${massIn} minus mass out ${massOut}. Losses reduce the claim.`
      : 'losses_g is computed at close, as mass in minus mass out.',
  };
}

r.get('/runs', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM run ORDER BY started_at ASC');
  return c.json(await Promise.all(rows.map(runView)));
});

r.get('/runs/:reference', async (c) => {
  await requireSession(c);
  const run = (await q('SELECT * FROM run WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!run) refuse(404, 'not_found', { error: 'not_found', message: 'No such run.' });
  return c.json(await runView(run));
});

r.post('/runs', async (c) => {
  const actor = await requireAct(c, 'run.open');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['run_type', 'site', 'equipment', 'recipe_version', 'operator', 'started_at']);
    if (!RUN_TYPES.includes(body.run_type)) {
      refuse(400, 'unknown_run_type', { error: 'unknown_run_type', message: `A run type is one of ${RUN_TYPES.join(', ')}.` });
    }
    const recipe = (await q('SELECT * FROM recipe_version WHERE reference = $1', [body.recipe_version]))[0];
    if (!recipe) refuse(404, 'not_found', { error: 'not_found', message: 'No such recipe version.' });
    const site = (await q('SELECT * FROM site WHERE reference = $1', [body.site]))[0];
    if (!site) refuse(404, 'not_found', { error: 'not_found', message: 'No such site.' });
    const prefix = { dissolution: 'RUN-D', depolymerisation: 'RUN-Y', purification: 'RUN-U', repolymerisation: 'RUN-R' }[body.run_type];
    const reference = await nextReference(prefix, 'run');
    const effectiveOn = body.effective_on || String(body.started_at).slice(0, 10);
    await pool.query(
      `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, state, actual_set_points, event_at, recorded_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,now(),$10)`,
      [reference, body.run_type, body.site, body.equipment, body.recipe_version, body.operator,
        body.started_at, JSON.stringify(body.actual_set_points || {}), body.event_at || body.started_at, effectiveOn]);
    await appendEntry(null, {
      person: actor.email, site: body.site, object_kind: 'run', object_ref: reference,
      action: 'started', content: { run_type: body.run_type, recipe_version: body.recipe_version, equipment: body.equipment, operator: body.operator },
    });
    const run = (await q('SELECT * FROM run WHERE reference = $1', [reference]))[0];
    return { status: 201, body: { reference, ...(await runView(run)) } };
  });
  return c.json(out.body, out.status);
});

r.post('/runs/:reference/consumptions', async (c) => {
  const actor = await requireAct(c, 'run.consume');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['input_kind', 'input_ref', 'mass_g']);
    requireIntegers(body, ['mass_g']);
    const run = (await q('SELECT * FROM run WHERE reference = $1', [reference]))[0];
    if (!run) refuse(404, 'not_found', { error: 'not_found', message: 'No such run.' });
    if (run.state === 'closed') {
      await appendEntry(null, { person: actor.email, site: run.site, object_kind: 'run', object_ref: reference, action: 'write_refused', content: { attempted: 'consumption', reason: 'run_closed' } });
      refuse(409, 'run_closed', { error: 'run_closed', message: 'A closed run refuses every write. A correction is a new record naming what it corrects.' });
    }
    const effectiveOn = body.effective_on || String(body.event_at || run.started_at).slice(0, 10);

    // A consumption whose effective date falls in a closed period is refused as a
    // write into that period and opens a restatement instead.
    const period = (await q(
      `SELECT * FROM balance_period WHERE site = $1 AND period_from <= $2 AND period_to >= $2 ORDER BY period_from DESC LIMIT 1`,
      [run.site, effectiveOn]))[0];
    if (period && period.state === 'closed') {
      const rref = await nextReference('RST', 'restatement');
      const certs = await q('SELECT number FROM certificate WHERE site = $1', [run.site]);
      await pool.query(
        `INSERT INTO restatement (reference, period_id, reason, state, certificates, opened_by)
         VALUES ($1,$2,$3,'open',$4,$5)`,
        [rref, period.id,
          `A consumption on ${reference} with an effective date of ${effectiveOn} falls in the closed period ${period.id}.`,
          JSON.stringify(certs.map((x) => x.number)), actor.email]);
      await appendEntry(null, {
        person: actor.email, site: run.site, object_kind: 'consumption', object_ref: reference,
        action: 'refused_into_closed_period', content: { period: period.id, effective_on: effectiveOn, restatement: rref },
      });
      refuse(409, 'period_closed', {
        error: 'period_closed',
        message: 'This period is closed. Corrections require a restatement.',
        period: period.id, effective_on: effectiveOn, restatement_opened: rref,
      });
    }

    if (body.input_kind === 'batch') {
      const b = await batchView(body.input_ref);
      if (!b) refuse(404, 'not_found', { error: 'not_found', message: 'No such batch.' });
    } else if (body.input_kind === 'output') {
      const o = (await q('SELECT * FROM output WHERE reference = $1', [body.input_ref]))[0];
      if (!o) refuse(404, 'not_found', { error: 'not_found', message: 'No such output.' });
    } else {
      refuse(400, 'unknown_input_kind', { error: 'unknown_input_kind', message: 'An input kind is one of batch, output.' });
    }

    const cref = await nextReference('CON', 'consumption');
    await pool.query(
      `INSERT INTO consumption (reference, run, input_kind, input_ref, mass_g, recorded_by, event_at, recorded_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8)`,
      [cref, reference, body.input_kind, body.input_ref, body.mass_g, actor.email,
        body.event_at || run.started_at, effectiveOn]);

    // A credit enters when a claimable batch is consumed, in dry mass times the
    // site's conversion factor.
    let credit = null;
    if (body.input_kind === 'batch' && period) {
      const b = await batchView(body.input_ref);
      const factor = (await q(
        'SELECT * FROM conversion_factor WHERE site = $1 AND superseded = false ORDER BY version DESC LIMIT 1', [run.site]))[0];
      const consumedDry = Math.min(body.mass_g, b.dry_mass_g);
      if (b.claimable && factor && (!b.claimable_from || b.claimable_from <= effectiveOn)) {
        const grantedG = creditGranted(consumedDry, Number(factor.factor_bp));
        await pool.query(
          `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, derivation, factor_version, effective_on, event_at, recorded_by)
           VALUES ($1,$2,'in','consumption',$3,$4,$5,$6,$7,$8,$9)`,
          [period.id, b.category, grantedG, body.input_ref,
            JSON.stringify({ batch: body.input_ref, consumption: cref, dry_mass_consumed_g: consumedDry, factor_bp: Number(factor.factor_bp), formula: `${consumedDry} * ${factor.factor_bp} / 10000, floored`, factor: factor.reference }),
            factor.reference, effectiveOn, body.event_at || run.started_at, actor.email]);
        credit = { category: b.category, credit_g: grantedG, factor: factor.reference, factor_bp: Number(factor.factor_bp), dry_mass_consumed_g: consumedDry };
      } else {
        await pool.query(
          `INSERT INTO credit_movement (period_id, category, direction, kind, mass_g, ref, derivation, effective_on, event_at, recorded_by)
           VALUES ($1,$2,'note','non_claimable_input',$3,$4,$5,$6,$7,$8)`,
          [period.id, b.category, consumedDry, body.input_ref,
            JSON.stringify({ batch: body.input_ref, consumption: cref, non_claimable_input_g: consumedDry, reason: b.claimable_reason || 'not_yet_claimable', credit_g: 0 }),
            effectiveOn, body.event_at || run.started_at, actor.email]);
        credit = { category: b.category, credit_g: 0, non_claimable_input_g: consumedDry, reason: b.claimable_reason };
      }
    }

    await appendEntry(null, {
      person: actor.email, site: run.site, object_kind: 'consumption', object_ref: cref,
      action: 'recorded',
      content: { run: reference, input_kind: body.input_kind, input_ref: body.input_ref, mass_g: body.mass_g, credit },
    });
    return {
      status: 201,
      body: { reference: cref, run: reference, input_kind: body.input_kind, input_ref: body.input_ref, mass_g: body.mass_g, effective_on: effectiveOn, credit },
    };
  });
  return c.json(out.body, out.status);
});

r.post('/runs/:reference/outputs', async (c) => {
  const actor = await requireAct(c, 'run.output');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    requireFields(body, ['kind', 'mass_g']);
    requireIntegers(body, ['mass_g']);
    const run = (await q('SELECT * FROM run WHERE reference = $1', [reference]))[0];
    if (!run) refuse(404, 'not_found', { error: 'not_found', message: 'No such run.' });
    if (run.state === 'closed') {
      await appendEntry(null, { person: actor.email, site: run.site, object_kind: 'run', object_ref: reference, action: 'write_refused', content: { attempted: 'output', reason: 'run_closed' } });
      refuse(409, 'run_closed', { error: 'run_closed', message: 'A closed run refuses every write.' });
    }
    if (!['intermediate', 'lot', 'byproduct'].includes(body.kind)) {
      refuse(400, 'unknown_output_kind', { error: 'unknown_output_kind', message: 'An output kind is one of intermediate, lot, byproduct.' });
    }
    if (body.kind === 'byproduct' && !['sold', 'disposed'].includes(body.disposition)) {
      refuse(400, 'disposition_required', { error: 'disposition_required', message: 'A byproduct carries a disposition in sold, disposed.' });
    }
    let oref;
    if (body.kind === 'lot') {
      oref = body.reference || await nextLotRef(run.site);
    } else {
      const prefix = { dissolution: 'OUT-D', depolymerisation: 'OUT-Y', purification: 'OUT-U', repolymerisation: 'OUT-R' }[run.run_type];
      oref = await nextReference(prefix, 'output');
    }
    const period = (await q('SELECT allocation_basis FROM balance_period WHERE site = $1 ORDER BY period_from DESC LIMIT 1', [run.site]))[0];
    await pool.query(
      `INSERT INTO output (reference, run, kind, mass_g, disposition, allocation_basis, recorded_by, event_at, recorded_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)`,
      [oref, reference, body.kind, body.mass_g, body.disposition || null,
        body.kind === 'byproduct' ? (period?.allocation_basis || 'mass') : null,
        actor.email, body.event_at || new Date().toISOString(), body.effective_on || iso(run.effective_on)]);
    if (body.kind === 'lot') {
      await pool.query(
        `INSERT INTO lot (reference, grade, site, mass_g, disposition, claim_type, output_ref, specification_version, produced_on)
         VALUES ($1,$2,$3,$4,'pending',$5,$1,3,$6)`,
        [oref, body.grade || 'N6', run.site, body.mass_g, body.claim_type || 'mass_balance', iso(run.effective_on)]);
    }
    await appendEntry(null, {
      person: actor.email, site: run.site, object_kind: 'output', object_ref: oref,
      action: 'recorded', content: { run: reference, kind: body.kind, mass_g: body.mass_g, disposition: body.disposition || null },
    });
    return { status: 201, body: { reference: oref, run: reference, kind: body.kind, mass_g: body.mass_g, disposition: body.disposition || null } };
  });
  return c.json(out.body, out.status);
});

async function nextLotRef(site) {
  const rows = await q("SELECT reference FROM lot WHERE reference LIKE 'LOT-N6-%' ORDER BY reference DESC LIMIT 1");
  const n = rows[0] ? Number(String(rows[0].reference).split('-').pop()) : 0;
  return `LOT-N6-${String(n + 1).padStart(4, '0')}`;
}

// losses_g is computed as mass in minus mass out; a closed run refuses a second close.
r.post('/runs/:reference/close', async (c) => {
  const actor = await requireAct(c, 'run.close');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    rejectComputedInputs(body);
    const run = (await q('SELECT * FROM run WHERE reference = $1', [reference]))[0];
    if (!run) refuse(404, 'not_found', { error: 'not_found', message: 'No such run.' });
    if (run.state === 'closed') {
      // a second close is itself recorded as an attempt
      await appendEntry(null, {
        person: actor.email, site: run.site, object_kind: 'run', object_ref: reference,
        action: 'second_close_attempted', content: { closed_at: run.closed_at, losses_g: Number(run.losses_g) },
      });
      refuse(409, 'run_already_closed', {
        error: 'run_already_closed',
        message: 'A closed run refuses a second close. The attempt is itself recorded.',
        closed_at: run.closed_at, losses_g: Number(run.losses_g),
      });
    }
    const [cons, outs, recipe] = await Promise.all([
      q('SELECT * FROM consumption WHERE run = $1', [reference]),
      q('SELECT * FROM output WHERE run = $1', [reference]),
      q('SELECT * FROM recipe_version WHERE reference = $1', [run.recipe_version]),
    ]);
    const massIn = cons.reduce((s, x) => s + Number(x.mass_g), 0);
    const massOut = outs.reduce((s, x) => s + Number(x.mass_g), 0);
    const losses = massIn - massOut;
    const actual = body.actual_set_points || run.actual_set_points || {};
    const tol = recipe[0]?.tolerances || {};
    const within = Object.entries(actual).every(([k, v]) => !tol[k] || (v >= tol[k][0] && v <= tol[k][1]));
    const closedAt = body.closed_at || new Date().toISOString();

    await pool.query(
      `UPDATE run SET state = 'closed', closed_at = $1, losses_g = $2, actual_set_points = $3, within_tolerance = $4 WHERE reference = $5`,
      [closedAt, losses, JSON.stringify(actual), within, reference]);

    // A run outside its recipe tolerance raises a deviation whether or not its
    // output passed its tests.
    let deviation = null;
    if (!within) {
      deviation = await nextReference('DEV', 'deviation');
      const lotRefs = outs.filter((o) => o.kind === 'lot').map((o) => o.reference);
      await pool.query(
        `INSERT INTO deviation (reference, state, runs, lots, detail, raised_by)
         VALUES ($1,'open',$2,$3,$4,$5)`,
        [deviation, JSON.stringify([reference]), JSON.stringify(lotRefs),
          `${reference} ran outside the tolerance of ${run.recipe_version}: actual ${JSON.stringify(actual)} against ${JSON.stringify(tol)}.`,
          actor.email]);
      await appendEntry(null, {
        person: actor.email, site: run.site, object_kind: 'deviation', object_ref: deviation,
        action: 'raised', content: { run: reference, reason: 'outside_recipe_tolerance', actual, tolerances: tol },
      });
    }

    await appendEntry(null, {
      person: actor.email, site: run.site, object_kind: 'run', object_ref: reference,
      action: 'closed',
      content: { losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within, deviation, derivation: 'losses_g = mass in minus mass out. Losses reduce the claim.' },
    });

    const closed = (await q('SELECT * FROM run WHERE reference = $1', [reference]))[0];
    return { status: 201, body: { reference, ...(await runView(closed)), deviation_raised: deviation } };
  });
  return c.json(out.body, out.status);
});

// A sold byproduct takes a share of the input's claim and a share of its emissions.
r.get('/outputs/:reference', async (c) => {
  await requireSession(c);
  const o = (await q('SELECT * FROM output WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!o) refuse(404, 'not_found', { error: 'not_found', message: 'No such output.' });
  const body = {
    reference: o.reference, run: o.run, kind: o.kind, mass_g: Number(o.mass_g),
    disposition: o.disposition, allocation_basis: o.allocation_basis,
  };
  if (o.kind === 'byproduct') {
    const all = await q('SELECT * FROM output WHERE run = $1', [o.run]);
    const totalOut = all.reduce((s, x) => s + Number(x.mass_g), 0);
    const share = shareBp(Number(o.mass_g), totalOut);
    body.share_bp = share;
    body.total_output_mass_g = totalOut;
    body.derivation = `byproduct_mass_g ${o.mass_g} * 10000 / total_output_mass_g ${totalOut}, floored, on the period's allocation basis of ${o.allocation_basis}`;
    if (o.disposition === 'sold') {
      const cons = await q('SELECT * FROM consumption WHERE run = $1', [o.run]);
      const inputClaim = await inputClaimFor(cons);
      const figures = await q('SELECT * FROM carbon_figure WHERE superseded_by IS NULL ORDER BY computed_at DESC LIMIT 1');
      const emissions = figures[0] ? Number(figures[0].value_mg_per_kg) : 0;
      body.claim_share_g = floorDiv(inputClaim * share, 10000);
      body.emissions_share_mg = floorDiv(emissions * share, 10000);
      body.input_claim_g = inputClaim;
      body.emissions_basis_mg_per_kg = emissions;
    } else {
      body.loss = true;
      body.note = 'A disposed byproduct is a loss, and reduces the conversion factor.';
    }
  }
  return c.json(body);
});

async function inputClaimFor(consumptions) {
  let total = 0;
  for (const cn of consumptions) {
    if (cn.input_kind !== 'batch') continue;
    const b = await batchView(cn.input_ref);
    if (b?.claimable) total += Math.min(Number(cn.mass_g), b.dry_mass_g);
  }
  return total;
}

export default r;

import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { nextReference } from '../db.js';

export const RECIPES = {
  'RCP-DISS-2': { stage: 'dissolution', set_points: { temperature_c: 165, pressure_bar: 3 }, tolerances: { temperature_c: [160, 170], pressure_bar: [2, 4] }, reagents: [{ name: 'methanol', ratio_bp: 1200 }], residence_time_min: 90, released_by: 'quality@example.com', released_on: '2026-01-05' },
  'RCP-DEPO-4': { stage: 'depolymerisation', set_points: { temperature_c: 240, pressure_bar: 8 }, tolerances: { temperature_c: [235, 245], pressure_bar: [7, 9] }, reagents: [{ name: 'sodium hydroxide', ratio_bp: 400 }], residence_time_min: 150, released_by: 'quality@example.com', released_on: '2026-01-05' },
  'RCP-PURI-1': { stage: 'purification', set_points: { temperature_c: 180, pressure_bar: 5 }, tolerances: { temperature_c: [175, 185], pressure_bar: [4, 6] }, reagents: [{ name: 'activated carbon', ratio_bp: 200 }], residence_time_min: 60, released_by: 'quality@example.com', released_on: '2026-01-06' },
  'RCP-REPO-3': { stage: 'repolymerisation', set_points: { temperature_c: 260, pressure_bar: 12 }, tolerances: { temperature_c: [255, 265], pressure_bar: [11, 13] }, reagents: [{ name: 'caprolactam catalyst', ratio_bp: 50 }], residence_time_min: 240, released_by: 'quality@example.com', released_on: '2026-01-06' }
};

function withinTolerance(recipe, actual) {
  const notes = {};
  let ok = true;
  for (const [k, [lo, hi]] of Object.entries(recipe.tolerances)) {
    const v = actual[k];
    if (v === undefined || v === null) { notes[k] = 'not_recorded'; continue; }
    if (v < lo || v > hi) { ok = false; notes[k] = 'outside'; } else { notes[k] = 'within'; }
  }
  return { within_tolerance: ok, notes };
}

const r = new Hono();

async function runView(db, row) {
  const consumptions = (await db.query('SELECT * FROM consumption WHERE run=$1 ORDER BY id', [row.reference])).rows;
  const outputs = (await db.query('SELECT * FROM output WHERE run=$1 ORDER BY reference', [row.reference])).rows;
  const recipe = RECIPES[row.recipe_version] || null;
  const tol = recipe ? withinTolerance(recipe, row.actual_parameters || {}) : null;
  const massIn = consumptions.reduce((s, c) => s + c.mass_g, 0);
  const massOut = outputs.reduce((s, o) => s + o.mass_g, 0);
  return {
    reference: row.reference,
    run_type: row.run_type,
    site: row.site,
    equipment: row.equipment,
    recipe_version: row.recipe_version,
    recipe: recipe ? {
      stage: recipe.stage, set_points: recipe.set_points, tolerances: recipe.tolerances,
      reagents: recipe.reagents, residence_time_min: recipe.residence_time_min,
      released_by: recipe.released_by, released_on: recipe.released_on
    } : null,
    operator: row.operator,
    started_at: row.started_at,
    closed_at: row.closed_at,
    state: row.closed_at ? 'closed' : 'open',
    losses_g: row.losses_g,
    mass_in_g: massIn,
    mass_out_g: massOut,
    actual_parameters: row.actual_parameters,
    within_tolerance: tol ? tol.within_tolerance : null,
    tolerance_notes: tol ? tol.notes : null,
    consumptions: consumptions.map((c) => ({
      input_kind: c.input_kind, input_ref: c.input_ref, mass_g: c.mass_g, effective_on: c.effective_on
    })),
    outputs: outputs.map((o) => ({
      reference: o.reference, kind: o.kind, mass_g: o.mass_g, disposition: o.disposition, lot: o.lot
    }))
  };
}

r.get('/runs', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM run ORDER BY reference')).rows;
  const out = [];
  for (const row of rows) out.push(await runView(db, row));
  return c.json(out);
});

r.get('/runs/:reference', async (c) => {
  const db = c.get('db');
  const row = (await db.query('SELECT * FROM run WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await runView(db, row));
});

r.post('/runs', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    if (!['dissolution', 'depolymerisation', 'purification', 'repolymerisation'].includes(body.run_type)) {
      return Response.json({ error: 'invalid_run_type' }, { status: 400 });
    }
    if (!RECIPES[body.recipe_version]) {
      return Response.json({ error: 'unknown_recipe_version' }, { status: 400 });
    }
    const count = (await db.query('SELECT count(*)::int AS n FROM run')).rows[0].n;
    const prefix = { dissolution: 'RUN-D-', depolymerisation: 'RUN-Y-', purification: 'RUN-U-', repolymerisation: 'RUN-R-' }[body.run_type];
    const reference = `${prefix}${String(count + 1).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,losses_g,actual_parameters,recorded_at,entered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,null,null,$8,now(),$9)`,
      [reference, body.run_type, body.site, body.equipment || `EQ-${reference}`, body.recipe_version,
        body.operator || s.name, body.started_at || new Date().toISOString(),
        JSON.stringify(body.actual_parameters || {}), s.email]);
    await appendEntry(db, {
      kind: 'run_started', object_ref: reference, person: s.email, site: body.site,
      content: { reference, run_type: body.run_type, recipe_version: body.recipe_version }
    });
    const row = (await db.query('SELECT * FROM run WHERE reference=$1', [reference])).rows[0];
    return Response.json(await runView(db, row), { status: 201 });
  });
});

r.post('/runs/:reference/consumptions', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const run = (await db.query('SELECT * FROM run WHERE reference=$1', [ref])).rows[0];
    if (!run) return Response.json({ error: 'not_found' }, { status: 404 });
    if (run.closed_at) {
      return Response.json({ error: 'run_closed', message: 'A closed run refuses every write.' }, { status: 409 });
    }
    const body = await c.req.json().catch(() => ({}));
    if (!body.input_kind || !body.input_ref || !Number.isInteger(body.mass_g)) {
      return Response.json({ error: 'invalid_request', message: 'input_kind, input_ref and integer mass_g are required' }, { status: 400 });
    }
    const effective_on = body.effective_on || new Date().toISOString().slice(0, 10);
    // A consumption whose effective date falls in a closed period is refused as
    // a write into that period and opens a restatement instead.
    const period = (await db.query(
      `SELECT * FROM balance_period WHERE site=$1 AND grade='N6' AND $2 BETWEEN period_start AND period_end`,
      [run.site, effective_on])).rows[0];
    if (period && period.state === 'closed') {
      const rsRef = await nextReference(db, 'RST-', 4);
      await db.query(
        `INSERT INTO restatement (reference,period,reason,content_movements,opened_by,opened_on,state)
         VALUES ($1,$2,$3,'[]',$4,$5,'open')`,
        [rsRef, period.id, `Consumption effective ${effective_on} falls in closed period ${period.id}`, s.email, new Date().toISOString().slice(0, 10)]);
      await appendEntry(db, {
        kind: 'restatement_opened', object_ref: rsRef, person: s.email, site: run.site,
        content: { reference: rsRef, period: period.id, reason: 'late consumption into closed period' }
      });
      return Response.json({
        error: 'period_closed',
        message: 'This period is closed. Corrections require a restatement.',
        restatement: rsRef
      }, { status: 409 });
    }
    await db.query(
      `INSERT INTO consumption (run,input_kind,input_ref,mass_g,effective_on,recorded_at)
       VALUES ($1,$2,$3,$4,$5,now())`,
      [ref, body.input_kind, body.input_ref, body.mass_g, effective_on]);
    await appendEntry(db, {
      kind: 'consumption_recorded', object_ref: `${ref}:${body.input_ref}`, person: s.email, site: run.site,
      content: { run: ref, input_kind: body.input_kind, input_ref: body.input_ref, mass_g: body.mass_g }
    });
    // Credit enters when a claimable batch is consumed.
    if (body.input_kind === 'batch') {
      const b = (await db.query(
        `SELECT b.*, w.calibrated_on FROM batch b LEFT JOIN weighing_device w ON w.reference=b.device WHERE b.reference=$1`,
        [body.input_ref])).rows[0];
      if (b) {
        const view = await (await import('../lib/engine.js')).batchView(db, b);
        if (period && view.claimable) {
          const cf = (await db.query(
            `SELECT * FROM conversion_factor WHERE site=$1 ORDER BY provisional, published_on DESC LIMIT 1`, [run.site])).rows[0];
          const factor = cf ? cf.factor_bp : 8000;
          const dry = Math.floor(body.mass_g * (10000 - b.moisture_bp) / 10000);
          const credit = Math.floor(dry * factor / 10000);
          await db.query(
            `INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
             VALUES ($1,$2,'in','consumption',$3,$4,$5,now())`,
            [period.id, b.category, credit,
              JSON.stringify({ batch: b.reference, run: ref, dry_mass_consumed_g: dry, factor_bp: factor, note: 'dry mass consumed times the conversion factor, floored' }),
              effective_on]);
          await appendEntry(db, {
            kind: 'credit_granted', object_ref: `${period.id}:${b.reference}`, person: s.email, site: run.site,
            content: { period: period.id, batch: b.reference, category: b.category, mass_g: credit }
          });
        } else if (period) {
          await db.query(
            `INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
             VALUES ($1,'non_claimable','in','consumption',0,$2,$3,now())`,
            [period.id, JSON.stringify({ batch: b.reference, run: ref, reason: view.claimable_reason, dry_mass_consumed_g: body.mass_g }), effective_on]);
          await db.query(
            `UPDATE balance_period SET id=id WHERE id=$1`, [period.id]);
          await db.query(
            `INSERT INTO credit_movement (period,category,direction,kind,mass_g,derivation,effective_on,recorded_at)
             VALUES ($1,'non_claimable','in','non_claimable_input',$2,$3,$4,now())`,
            [period.id, body.mass_g, JSON.stringify({ batch: b.reference, run: ref, note: 'non-claimable input tracked separately' }), effective_on]);
        }
      }
    }
    const row = (await db.query('SELECT * FROM run WHERE reference=$1', [ref])).rows[0];
    return Response.json(await runView(db, row), { status: 201 });
  });
});

r.post('/runs/:reference/outputs', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const run = (await db.query('SELECT * FROM run WHERE reference=$1', [ref])).rows[0];
    if (!run) return Response.json({ error: 'not_found' }, { status: 404 });
    if (run.closed_at) {
      return Response.json({ error: 'run_closed', message: 'A closed run refuses every write.' }, { status: 409 });
    }
    const body = await c.req.json().catch(() => ({}));
    if (!['intermediate', 'lot', 'byproduct'].includes(body.kind)) {
      return Response.json({ error: 'invalid_kind' }, { status: 400 });
    }
    if (!Number.isInteger(body.mass_g) || body.mass_g <= 0) {
      return Response.json({ error: 'invalid_request', message: 'integer mass_g is required' }, { status: 400 });
    }
    if (body.kind === 'byproduct' && !['sold', 'disposed'].includes(body.disposition)) {
      return Response.json({ error: 'invalid_request', message: 'a byproduct carries disposition in sold, disposed' }, { status: 400 });
    }
    const stagePrefix = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[run.run_type];
    const count = (await db.query('SELECT count(*)::int AS n FROM output')).rows[0].n;
    const reference = body.kind === 'lot'
      ? `LOT-${body.grade || 'N6'}-${String(count + 1).padStart(4, '0')}`
      : `OUT-${stagePrefix}-${String(count + 1).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO output (reference,run,kind,mass_g,disposition,lot,recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())`,
      [reference, ref, body.kind, body.mass_g, body.disposition || null, body.kind === 'lot' ? reference : null]);
    if (body.kind === 'lot') {
      await db.query(
        `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,produced_by_run,provisional_factor,recorded_at)
         VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,now())`,
        [reference, body.grade || 'N6', run.site, body.mass_g, body.cl_type || 'mass_balance', ref,
          Boolean(body.provisional_factor)]);
    }
    await appendEntry(db, {
      kind: 'output_recorded', object_ref: reference, person: s.email, site: run.site,
      content: { run: ref, reference, kind: body.kind, mass_g: body.mass_g, disposition: body.disposition || null }
    });
    const row = (await db.query('SELECT * FROM run WHERE reference=$1', [ref])).rows[0];
    const view = await runView(db, row);
    return Response.json({ reference, ...view }, { status: 201 });
  });
});

r.post('/runs/:reference/close', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const run = (await db.query('SELECT * FROM run WHERE reference=$1', [ref])).rows[0];
    if (!run) return Response.json({ error: 'not_found' }, { status: 404 });
    if (run.closed_at) {
      await appendEntry(db, {
        kind: 'second_close_attempt', object_ref: ref, person: s.email, site: run.site,
        content: { run: ref, refused: true, reason: 'run already closed' }
      });
      return Response.json({ error: 'run_already_closed', message: 'A closed run refuses a second close.' }, { status: 409 });
    }
    const consumptions = (await db.query('SELECT * FROM consumption WHERE run=$1', [ref])).rows;
    const outputs = (await db.query('SELECT * FROM output WHERE run=$1', [ref])).rows;
    const massIn = consumptions.reduce((s2, c2) => s2 + c2.mass_g, 0);
    const massOut = outputs.reduce((s2, o) => s2 + o.mass_g, 0);
    const losses = massIn - massOut;
    await db.query('UPDATE run SET closed_at=now(), losses_g=$1 WHERE reference=$2', [losses, ref]);

    const recipe = RECIPES[run.recipe_version];
    const tol = recipe ? withinTolerance(recipe, run.actual_parameters || {}) : null;
    if (tol && !tol.within_tolerance) {
      const dref = await nextReference(db, 'DEV-', 4);
      const lots = outputs.filter((o) => o.kind === 'lot').map((o) => o.reference);
      await db.query(
        `INSERT INTO deviation (reference,state,affects_runs,affects_lots,outcome,raised_by,raised_on,description)
         VALUES ($1,'open',$2,$3,null,$4,now(),$5)`,
        [dref, JSON.stringify([ref]), JSON.stringify(lots), s.email,
          `Run closed outside recipe tolerance: ${JSON.stringify(tol.notes)}`]);
      await appendEntry(db, {
        kind: 'deviation_raised', object_ref: dref, person: s.email, site: run.site,
        content: { reference: dref, run: ref, reason: 'outside tolerance at close' }
      });
    }
    await appendEntry(db, {
      kind: 'run_closed', object_ref: ref, person: s.email, site: run.site,
      content: { reference: ref, losses_g: losses, mass_in_g: massIn, mass_out_g: massOut }
    });
    const row = (await db.query('SELECT * FROM run WHERE reference=$1', [ref])).rows[0];
    const view = await runView(db, row);
    return Response.json({ ...view, losses_g: losses }, { status: 201 });
  });
});

export default r;

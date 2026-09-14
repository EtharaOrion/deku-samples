import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys, intOr } from '../lib/http.js';
import { nowIso } from '../lib/util.js';

const runs = new Hono();
runs.use('*', requireSession());

async function nextRef(kind, prefix, width) {
  const r = await q('INSERT INTO ref_seq (kind, n) VALUES ($1, 1) ON CONFLICT (kind) DO UPDATE SET n = ref_seq.n + 1 RETURNING n', [kind]);
  return prefix + '-' + String(r.rows[0].n).padStart(width, '0');
}

function withinTolerance(recipe, actual) {
  if (!recipe || !actual) return { within_tolerance: true, excursions: [] };
  const excursions = [];
  for (const a of actual) {
    const sp = recipe.set_points.find((s) => s.parameter === a.parameter);
    if (!sp) continue;
    if (Number(a.value) < Number(sp.min) || Number(a.value) > Number(sp.max)) {
      excursions.push({ parameter: a.parameter, value: a.value, min: sp.min, max: sp.max });
    }
  }
  return { within_tolerance: excursions.length === 0, excursions };
}

runs.get('/', async (c) => {
  const r = await q('SELECT * FROM run ORDER BY reference');
  return c.json(r.rows.map(runView));
});

runs.get('/:reference', async (c) => {
  const r = await q('SELECT * FROM run WHERE reference = $1', [c.req.param('reference')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  const recipe = await q('SELECT * FROM recipe WHERE version = $1', [r.rows[0].recipe_version]);
  const cons = await q('SELECT * FROM consumption WHERE run = $1', [r.rows[0].reference]);
  const outs = await q('SELECT * FROM output WHERE run = $1', [r.rows[0].reference]);
  const tol = withinTolerance(recipe.rows[0], r.rows[0].set_points);
  return c.json({
    ...runView(r.rows[0]),
    recipe_version: r.rows[0].recipe_version,
    recipe: recipe.rows[0] || null,
    actual_set_points: r.rows[0].set_points || [],
    within_tolerance: tol.within_tolerance,
    tolerance_excursions: tol.excursions,
    consumptions: cons.rows.map((x) => ({ batch: x.batch, mass_g: Number(x.mass_g), effective_on: x.effective_on })),
    outputs: outs.rows.map((o) => ({ reference: o.reference, kind: o.kind, mass_g: Number(o.mass_g), disposition: o.disposition, lot: o.lot }))
  });
});

function runView(r) {
  return {
    reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
    recipe_version: r.recipe_version, operator: r.operator, started_at: r.started_at,
    closed: r.closed, closed_at: r.closed_at, losses_g: r.losses_g === null ? null : Number(r.losses_g),
    within_tolerance: r.within_tolerance, stage: r.run_type,
    state_word: r.closed ? 'closed' : 'open'
  };
}

runs.post('/', async (c) => {
  const user = c.get('user');
  if (!['plant_operator', 'quality_manager'].includes(user.role)) {
    refuse(403, 'forbidden', { message: 'A plant operator opens a run.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['run_type', 'site', 'equipment', 'recipe_version', 'operator', 'started_at']);
    if (!['dissolution', 'depolymerisation', 'purification', 'repolymerisation'].includes(body.run_type)) {
      refuse(400, 'unknown_run_type');
    }
    const reference = await nextRef('run_' + body.run_type[0].toUpperCase(), 'RUN-' + body.run_type[0].toUpperCase(), 4);
    await tx(async (client) => {
      await client.query(
        `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [reference, body.run_type, body.site, body.equipment, body.recipe_version, body.operator || user.email, body.started_at, user.email]
      );
      await recordTx(client, { user, act: 'run_started', object: reference, site: body.site, event_at: body.started_at, effective_on: String(body.started_at).slice(0, 10), payload: { run_type: body.run_type, recipe_version: body.recipe_version } });
    });
    return { reference };
  });
});

runs.post('/:reference/consumptions', async (c) => {
  const user = c.get('user');
  if (!['plant_operator', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden', { message: 'A plant operator records a consumption.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['batch', 'mass_g']);
    const r = await q('SELECT * FROM run WHERE reference = $1', [c.req.param('reference')]);
    if (!r.rows.length) refuse(404, 'not_found');
    const run = r.rows[0];
    if (run.closed) refuse(409, 'run_closed', { message: 'A closed run refuses every write.' });
    const effective = body.effective_on || String(body.started_at || run.started_at).slice(0, 10);
    // a consumption whose effective date falls in a closed period opens a restatement
    const period = await q(`SELECT * FROM balance_period WHERE site = $1 AND $2 BETWEEN period_from AND period_to`, [run.site, effective]);
    if (period.rows.length && period.rows[0].state === 'closed') {
      const ref = await nextRef('rst', 'RST', 3);
      await tx(async (client) => {
        await client.query(`INSERT INTO restatement (reference, balance_period, reason, opened_on, opened_by) VALUES ($1,$2,$3,$4,$5)`,
          [ref, period.rows[0].id, 'A consumption whose effective date falls in a closed period was refused as a write into that period and opened a restatement instead.', nowIso(), user.email]);
        await recordTx(client, { user, act: 'restatement_opened', object: ref, site: run.site, payload: { balance_period: period.rows[0].id, cause: 'consumption_into_closed_period' } });
      });
      refuse(409, 'period_closed_restatement_opened', { restatement: ref, message: 'A consumption whose effective date falls in a closed period is refused as a write into that period and opens a restatement instead.' });
    }
    return await tx(async (client) => {
      await client.query('INSERT INTO consumption (run, batch, mass_g, effective_on) VALUES ($1,$2,$3,$4)', [run.reference, body.batch, intOr(body.mass_g), effective]);
      await recordTx(client, { user, act: 'consumption_recorded', object: run.reference, site: run.site, event_at: nowIso(), effective_on: effective, payload: { batch: body.batch, mass_g: intOr(body.mass_g) } });
      return { reference: run.reference, batch: body.batch, mass_g: intOr(body.mass_g) };
    });
  });
});

runs.post('/:reference/outputs', async (c) => {
  const user = c.get('user');
  if (!['plant_operator', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden', { message: 'A plant operator records an output.' });
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['kind', 'mass_g']);
    if (!['intermediate', 'lot', 'byproduct'].includes(body.kind)) refuse(400, 'unknown_output_kind');
    if (body.kind === 'byproduct' && !['sold', 'disposed'].includes(body.disposition)) {
      refuse(400, 'byproduct_disposition_required', { message: 'A byproduct also carries a disposition in sold, disposed.' });
    }
    const r = await q('SELECT * FROM run WHERE reference = $1', [c.req.param('reference')]);
    if (!r.rows.length) refuse(404, 'not_found');
    const run = r.rows[0];
    if (run.closed) refuse(409, 'run_closed', { message: 'A closed run refuses every write.' });
    let lotRef = body.lot || null;
    const outputRef = body.reference || await nextRef('out_' + run.run_type[0].toUpperCase(), 'OUT-' + run.run_type[0].toUpperCase(), 4);
    await tx(async (client) => {
      if (body.kind === 'lot') {
        lotRef = body.lot || await nextRef('lot', 'LOT-' + (body.grade || 'N6'), 4);
        await client.query(
          `INSERT INTO lot (reference, run, site, grade, mass_g, disposition, claim_type, specification_version, created_by)
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8)`,
          [lotRef, run.reference, body.site || run.site, body.grade || 'N6', intOr(body.mass_g), body.claim_type || 'mass_balance', body.specification_version || null, user.email]
        );
        await client.query(`INSERT INTO output (reference, run, kind, mass_g, disposition, lot, created_by) VALUES ($1,$2,'lot',$3,null,$4,$5)`,
          [outputRef, run.reference, intOr(body.mass_g), lotRef, user.email]);
      } else {
        await client.query(`INSERT INTO output (reference, run, kind, mass_g, disposition, lot, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [outputRef, run.reference, body.kind, intOr(body.mass_g), body.disposition || null, lotRef, user.email]);
      }
      await recordTx(client, { user, act: 'output_recorded', object: run.reference, site: run.site, event_at: nowIso(), effective_on: nowIso().slice(0, 10), payload: { output: outputRef, kind: body.kind, mass_g: intOr(body.mass_g), lot: lotRef } });
    });
    return { reference: outputRef, lot: lotRef };
  });
});

runs.post('/:reference/close', async (c) => {
  const user = c.get('user');
  if (!['plant_operator', 'quality_manager'].includes(user.role)) refuse(403, 'forbidden', { message: 'A plant operator closes a run.' });
  return idempotent(c, async () => {
    const r = await q('SELECT * FROM run WHERE reference = $1', [c.req.param('reference')]);
    if (!r.rows.length) refuse(404, 'not_found');
    const run = r.rows[0];
    const recipe = await q('SELECT * FROM recipe WHERE version = $1', [run.recipe_version]);
    const cons = await q('SELECT SUM(mass_g)::bigint AS m FROM consumption WHERE run = $1', [run.reference]);
    const outs = await q('SELECT SUM(mass_g)::bigint AS m FROM output WHERE run = $1', [run.reference]);
    const massIn = Number(cons.rows[0].m || 0);
    const massOut = Number(outs.rows[0].m || 0);
    const losses = massIn - massOut;
    const tol = withinTolerance(recipe.rows[0], run.set_points);
    if (run.closed) {
      await tx(async (client) => {
        await client.query('UPDATE run SET close_attempts = close_attempts + 1 WHERE reference = $1', [run.reference]);
        await recordTx(client, { user, act: 'run_close_attempted', object: run.reference, site: run.site, refused: true, payload: { message: 'A second close answers 409 and is itself recorded as an attempt.', attempt: Number(run.close_attempts) + 1 } });
      });
      refuse(409, 'already_closed', { message: 'A closed run refuses a second close.' });
    }
    return await tx(async (client) => {
      await client.query('UPDATE run SET closed = true, closed_at = $2, losses_g = $3, within_tolerance = $4 WHERE reference = $1',
        [run.reference, nowIso(), losses, tol.within_tolerance]);
      if (!tol.within_tolerance) {
        const dref = await nextRef('dev', 'DEV', 3);
        await client.query(`INSERT INTO deviation (reference, runs, lots, raised_by, raised_at, description, state) VALUES ($1,$2,$3,$4,$5,$6,'open')`,
          [dref, JSON.stringify([run.reference]), JSON.stringify([]), user.email, nowIso(), `Run ${run.reference} ran outside its recipe tolerance.`]);
      }
      await recordTx(client, { user, act: 'run_closed', object: run.reference, site: run.site, event_at: nowIso(), effective_on: nowIso().slice(0, 10), payload: { losses_g: losses, within_tolerance: tol.within_tolerance } });
      return { reference: run.reference, losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: tol.within_tolerance };
    });
  });
});

export default runs;

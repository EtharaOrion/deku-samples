import { requireSession } from '../lib/session.js';
import { HttpError } from '../lib/auth.js';
import { record } from '../lib/record.js';
import { withTx } from '../lib/tx.js';
import { idemGuard, idemStore, refusePagination } from '../lib/idem.js';
import { creditGranted, dryMass } from '../lib/units.js';
import { factorForSite } from '../lib/ledger.js';
import { claimableOf } from '../lib/engine.js';

const TYPES = ['dissolution','depolymerisation','purification','repolymerisation'];

async function grantCreditsForConsumption(client, run, cons, batch) {
  const cl = await claimableOf(client, batch);
  const bp = (await client.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND $3 BETWEEN period_from AND period_to`,
    [batch.site, batch.grade, cons.effective_on])).rows[0];
  const factor = await factorForSite(client, batch.site, cons.effective_on);
  if (!bp) return { period: null, credit: 0, claimable: cl.claimable };
  if (!cl.claimable) {
    await client.query(
      `INSERT INTO credit_movements (period,category,direction,mass_g,kind,origin_site,movement_ref,effective_on)
       VALUES ($1,'post_consumer','in',$2,'non_claimable_input','NON_CLAIMABLE',$3,$4)`,
      [bp.id, cons.mass_g, batch.reference, cons.effective_on]);
    return { period: bp.id, credit: 0, claimable: false };
  }
  const d = dryMass(cons.mass_g, batch.moisture_bp);
  const credit = creditGranted(d, factor ? factor.factor_bp : 0);
  if (credit > 0) {
    await client.query(
      `INSERT INTO credit_movements (period,category,direction,mass_g,kind,movement_ref,effective_on)
       VALUES ($1,$2,'in',$3,'consumption',$4,$5)`,
      [bp.id, batch.category, credit, batch.reference, cons.effective_on]);
  }
  return { period: bp.id, credit, claimable: true, dry_mass_g: d, factor_bp: factor ? factor.factor_bp : 0, factor_reference: factor ? factor.reference : null };
}

export async function register({ app, pool }) {
  app.get('/api/runs', async (c) => {
    refusePagination(c.req.query());
    requireSession(c);
    const rows = (await pool.query(`SELECT * FROM runs ORDER BY started_at`)).rows;
    const out = [];
    for (const r of rows) {
      const ins = (await pool.query(`SELECT * FROM consumptions WHERE run=$1 ORDER BY id`, [r.reference])).rows;
      const outs = (await pool.query(`SELECT * FROM outputs WHERE run=$1 ORDER BY reference`, [r.reference])).rows;
      const massIn = ins.reduce((a, x) => a + x.mass_g, 0);
      const massOut = outs.reduce((a, x) => a + x.mass_g, 0);
      out.push({
        reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
        recipe_version: r.recipe_version, operator: r.operator, started_at: r.started_at,
        closed_at: r.closed_at, losses_g: r.losses_g,
        state: r.closed_at ? 'closed' : 'open',
        mass_in_g: massIn, mass_out_g: massOut,
        within_tolerance: r.within_tolerance,
        consumptions: ins.map((i) => ({ input_ref: i.input_ref, input_kind: i.input_kind, mass_g: i.mass_g, effective_on: i.effective_on })),
        outputs: outs.map((o) => ({ reference: o.reference, kind: o.kind, mass_g: o.mass_g, disposition: o.disposition })),
        period: r.period
      });
    }
    return c.json(out);
  });

  app.get('/api/runs/:reference', async (c) => {
    requireSession(c);
    const ref = c.req.param('reference');
    const r = (await pool.query(`SELECT * FROM runs WHERE reference=$1`, [ref])).rows[0];
    if (!r) throw new HttpError(404, 'run_not_found');
    const recipe = (await pool.query(`SELECT * FROM recipes WHERE version=$1`, [r.recipe_version])).rows[0];
    const ins = (await pool.query(`SELECT * FROM consumptions WHERE run=$1 ORDER BY id`, [r.reference])).rows;
    const outs = (await pool.query(`SELECT * FROM outputs WHERE run=$1 ORDER BY reference`, [r.reference])).rows;
    const massIn = ins.reduce((a, x) => a + x.mass_g, 0);
    const massOut = outs.reduce((a, x) => a + x.mass_g, 0);
    return c.json({
      reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
      recipe_version: r.recipe_version, operator: r.operator, started_at: r.started_at,
      closed_at: r.closed_at, state: r.closed_at ? 'closed' : 'open',
      losses_g: r.losses_g, mass_in_g: massIn, mass_out_g: massOut,
      recipe: recipe ? {
        version: recipe.version, set_points: recipe.set_points, tolerances: recipe.tolerances,
        reagents: recipe.reagents, residence_minutes: recipe.residence_minutes, released_by: recipe.released_by
      } : null,
      achieved: r.achieved, within_tolerance: r.within_tolerance,
      consumptions: ins.map((i) => ({ input_ref: i.input_ref, input_kind: i.input_kind, mass_g: i.mass_g, effective_on: i.effective_on })),
      outputs: outs.map((o) => ({ reference: o.reference, kind: o.kind, mass_g: o.mass_g, disposition: o.disposition })),
      derivation: { losses_g: 'mass in minus mass out, computed at close' },
      period: r.period
    });
  });

  app.post('/api/runs', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('plant_operator')) throw new HttpError(403, 'plant_operator_required');
    const body = await c.req.json().catch(() => ({}));
    if (!TYPES.includes(body.run_type)) throw new HttpError(400, 'invalid_run_type');
    if (!body.site || !body.equipment || !body.recipe_version || !body.started_at) throw new HttpError(400, 'missing_fields');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, 'runs', body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const seq = (await client.query(`SELECT v FROM app_meta WHERE k='run_seq'`)).rows;
      const prefixes = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' };
      const count = (await client.query(`SELECT count(*)::int AS n FROM runs WHERE run_type=$1`, [body.run_type])).rows[0].n;
      const ref = `RUN-${prefixes[body.run_type]}-${String(count + 1).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO runs (reference,run_type,site,equipment,recipe_version,operator,started_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ref, body.run_type, body.site, body.equipment, body.recipe_version, body.operator || s.email, body.started_at]);
      await record(client, { kind: 'run_started', object_ref: ref, actor: s.email, site: body.site, content: { run_type: body.run_type, recipe_version: body.recipe_version, started_at: body.started_at } });
      const response = { reference: ref, run_type: body.run_type, site: body.site, state: 'open' };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/runs/:reference/consumptions', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('plant_operator')) throw new HttpError(403, 'plant_operator_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!body.input_ref || body.mass_g == null) throw new HttpError(400, 'input_ref_and_mass_g_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `runs:${ref}:consumptions`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const run = (await client.query(`SELECT * FROM runs WHERE reference=$1`, [ref])).rows[0];
      if (!run) throw new HttpError(404, 'run_not_found');
      if (run.closed_at) throw new HttpError(409, 'run_closed', { message: 'A closed run refuses every write.' });
      const kind = body.input_ref.startsWith('BATCH-') ? 'batch' : 'intermediate';
      const effective = body.effective_on || new Date().toISOString().slice(0, 10);
      // a consumption whose effective date falls in a closed period is refused
      const bp = (await client.query(
        `SELECT * FROM balance_periods WHERE site=$1 AND grade='N6' AND $2 BETWEEN period_from AND period_to`,
        [run.site, effective])).rows[0];
      if (bp && bp.state === 'closed') {
        throw new HttpError(409, 'period_closed', { message: 'This consumption falls in a closed balance period. Corrections require a restatement.' });
      }
      const ins = await client.query(
        `INSERT INTO consumptions (run,input_ref,input_kind,mass_g,effective_on,event_at,recorded_at)
         VALUES ($1,$2,$3,$4,$5,now(),now()) RETURNING id`,
        [ref, body.input_ref, kind, Number(body.mass_g), effective]);
      let credit = null;
      if (kind === 'batch') {
        const batch = (await client.query(`SELECT * FROM batches WHERE reference=$1`, [body.input_ref])).rows[0];
        if (!batch) throw new HttpError(404, 'batch_not_found');
        const cons = (await client.query(`SELECT * FROM consumptions WHERE id=$1`, [ins.rows[0].id])).rows[0];
        credit = await grantCreditsForConsumption(client, ref, cons, batch);
      }
      await record(client, { kind: 'consumption_recorded', object_ref: ref, actor: s.email, site: run.site, content: { input_ref: body.input_ref, mass_g: Number(body.mass_g), effective_on: effective, credit_granted_g: credit ? credit.credit : null } });
      const response = { reference: ref, consumption_id: ins.rows[0].id, input_ref: body.input_ref, mass_g: Number(body.mass_g), effective_on: effective, credit_granted: credit };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/runs/:reference/outputs', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('plant_operator')) throw new HttpError(403, 'plant_operator_required');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    if (!['intermediate','lot','byproduct'].includes(body.kind)) throw new HttpError(400, 'invalid_kind');
    if (body.mass_g == null) throw new HttpError(400, 'mass_g_required');
    if (body.kind === 'byproduct' && !['sold','disposed'].includes(body.disposition)) throw new HttpError(400, 'byproduct_disposition_required');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `runs:${ref}:outputs`, body);
      if (guard.replay) return c.json(guard.response, guard.status);
      const run = (await client.query(`SELECT * FROM runs WHERE reference=$1`, [ref])).rows[0];
      if (!run) throw new HttpError(404, 'run_not_found');
      if (run.closed_at) throw new HttpError(409, 'run_closed', { message: 'A closed run refuses every write.' });
      const prefix = body.kind === 'lot' ? null : (body.kind === 'byproduct' ? 'OUT-B' : `OUT-${run.reference.split('-')[1]}`);
      let outRef = body.reference;
      if (!outRef) {
        if (body.kind === 'lot') {
          const grade = body.grade || 'N6';
          const n = (await client.query(`SELECT count(*)::int AS n FROM lots WHERE grade=$1`, [grade])).rows[0].n + 1;
          outRef = `LOT-${grade}-${String(n).padStart(4, '0')}`;
        } else {
          const n = (await client.query(`SELECT count(*)::int AS n FROM outputs WHERE reference LIKE $1`, [`${prefix}-%`])).rows[0].n + 1;
          outRef = `${prefix}-${String(n).padStart(4, '0')}`;
        }
      }
      await client.query(`INSERT INTO outputs (reference,run,kind,mass_g,disposition) VALUES ($1,$2,$3,$4,$5)`,
        [outRef, ref, body.kind, Number(body.mass_g), body.kind === 'byproduct' ? body.disposition : null]);
      if (body.kind === 'lot') {
        await client.query(
          `INSERT INTO lots (reference,site,grade,mass_g,disposition,claim_type,produced_by,flags,created_by)
           VALUES ($1,$2,$3,$4,'pending',$5,$6,'[]',$7)`,
          [outRef, run.site, body.grade || 'N6', Number(body.mass_g), body.claim_type || 'mass_balance', ref, s.email]);
      }
      await record(client, { kind: 'output_recorded', object_ref: ref, actor: s.email, site: run.site, content: { output: outRef, kind: body.kind, mass_g: Number(body.mass_g), disposition: body.disposition || null } });
      const response = { reference: ref, output: outRef, kind: body.kind, mass_g: Number(body.mass_g), disposition: body.disposition || null };
      await idemStore(client, guard, 201, response);
      return c.json(response, 201);
    });
  });

  app.post('/api/runs/:reference/close', async (c) => {
    const s = requireSession(c);
    if (!s.roles.includes('plant_operator')) throw new HttpError(403, 'plant_operator_required');
    const ref = c.req.param('reference');
    return withTx(pool, async (client) => {
      const guard = await idemGuard(client, c.req, `runs:${ref}:close`, {});
      if (guard.replay) return c.json(guard.response, guard.status);
      const run = (await client.query(`SELECT * FROM runs WHERE reference=$1 FOR UPDATE`, [ref])).rows[0];
      if (!run) throw new HttpError(404, 'run_not_found');
      if (run.closed_at) {
        await record(client, { kind: 'run_close_attempt', object_ref: ref, actor: s.email, site: run.site, content: { refused: 'already_closed' } });
        throw new HttpError(409, 'already_closed', { message: 'A closed run refuses a second close.' });
      }
      const ins = (await client.query(`SELECT * FROM consumptions WHERE run=$1`, [ref])).rows;
      const outs = (await client.query(`SELECT * FROM outputs WHERE run=$1`, [ref])).rows;
      const massIn = ins.reduce((a, x) => a + x.mass_g, 0);
      const massOut = outs.reduce((a, x) => a + x.mass_g, 0);
      const losses = massIn - massOut;
      const recipe = (await client.query(`SELECT * FROM recipes WHERE version=$1`, [run.recipe_version])).rows[0];
      let within = true;
      const tol = recipe ? recipe.tolerances : {};
      for (const k of Object.keys(tol)) {
        const [lo, hi] = tol[k];
        const got = (run.achieved || {})[k];
        if (got != null && (got < lo || got > hi)) within = false;
      }
      await client.query(`UPDATE runs SET closed_at=now(), losses_g=$1, within_tolerance=$2 WHERE reference=$3`, [losses, within, ref]);
      if (!within) {
        const n = (await client.query(`SELECT count(*)::int AS n FROM deviations`)).rows[0].n + 1;
        const dref = `DEV-${String(n).padStart(4, '0')}`;
        await client.query(`INSERT INTO deviations (reference,state,subjects,description,raised_by,recorded_at) VALUES ($1,'open',$2,$3,$4,now())`,
          [dref, JSON.stringify([ref]), `Run ${ref} closed outside its recipe tolerance`, s.email]);
        await record(client, { kind: 'deviation_raised', object_ref: dref, actor: s.email, site: run.site, content: { subjects: [ref], reason: 'outside_recipe_tolerance' } });
      }
      await record(client, { kind: 'run_closed', object_ref: ref, actor: s.email, site: run.site, content: { losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within } });
      const response = { reference: ref, state: 'closed', losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within };
      await idemStore(client, guard, 200, response);
      return c.json(response);
    });
  });
}

import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, enumField, rememberIdempotency } from '../lib/http.js';
import { entry, entryTop } from '../record.js';
import { resolveBatch, batchImpact } from '../engine/domain.js';
import { contentBp, creditGranted, dryMass, floorDiv } from '../engine/int.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const iso = (d) => (d instanceof Date ? d.toISOString() : d);

const RECIPE_TOL = {
  RCP_DISS_2: { temperature: [160, 170], pressure: [2, 4] },
  RCP_DEPO_4: { temperature: [250, 270], pressure: [5, 8] },
  RCP_PUR_1: { temperature: [200, 220], pressure: [3, 5] },
  RCP_REPO_3: { temperature: [240, 260], pressure: [6, 9] }
};
const key = (v) => String(v).replace(/-/g, '_').toUpperCase();

r.get('/api/runs', async (c) => {
  await requireAuth(c);
  const rows = await q('SELECT * FROM runs ORDER BY reference');
  return c.json(await Promise.all(rows.map(serializeRun)));
});

async function serializeRun(x) {
  const inputs = await q('SELECT * FROM consumptions WHERE run = $1 ORDER BY id', [x.reference]);
  const outputs = await q('SELECT * FROM outputs WHERE run = $1 ORDER BY reference', [x.reference]);
  return {
    reference: x.reference, run_type: x.run_type, site: x.site, equipment: x.equipment,
    recipe_version: x.recipe_version, operator: x.operator,
    started_at: iso(x.started_at), closed_at: x.closed_at ? iso(x.closed_at) : null,
    closed: x.closed, losses_g: x.losses_g === null ? null : Number(x.losses_g),
    achieved: x.achieved, within_tolerance: x.within_tolerance,
    inputs: inputs.map(i => ({ batch: i.batch, input_output: i.input_output, mass_g: Number(i.mass_g), effective_on: isoD(i.effective_on) })),
    outputs: outputs.map(o => ({ reference: o.reference, kind: o.kind, mass_g: Number(o.mass_g), disposition: o.disposition, grade: o.grade })),
    event_at: iso(x.event_at), recorded_at: iso(x.recorded_at), effective_on: isoD(x.effective_on)
  };
}

r.get('/api/runs/:ref', async (c) => {
  await requireAuth(c);
  const x = await one('SELECT * FROM runs WHERE reference = $1', [c.req.param('ref')]);
  if (!x) throw notFound('run_not_found');
  const out = await serializeRun(x);
  const tol = RECIPE_TOL[key(x.recipe_version)] || null;
  out.recipe = tol ? { version: x.recipe_version, set_points: tol, tolerance: tol, recipe_followed: x.recipe_version } : null;
  return c.json(out);
});

r.post('/api/runs', async (c) => {
  const user = await requireRole(c, 'plant_operator');
  const b = await c.req.json();
  const run_type = enumField(b.run_type, 'run_type', ['dissolution', 'depolymerisation', 'purification', 'repolymerisation']);
  const site = reqField(b.site, 'site');
  if (!user.sites.includes(site)) throw forbidden('site_out_of_scope', { site });
  const seq = await one(`SELECT coalesce(max(substring(reference from 6)::int),0)+1 n FROM runs WHERE reference ~ '^RUN-[DYUR]-000'`);
  const letter = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[run_type];
  const ref = `RUN-${letter}-${String(seq.n).padStart(4, '0')}`;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO runs (reference, run_type, site, equipment, recipe_version, operator, started_at, event_at, recorded_at, effective_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now(),$8)`,
      [ref, run_type, site, reqField(b.equipment, 'equipment'), reqField(b.recipe_version, 'recipe_version'), reqField(b.operator, 'operator') || user.email,
       b.started_at || new Date().toISOString(), isoD(new Date(b.started_at || Date.now()))]);
    const e = await entry(tx, { person: user.email, site, object: ref, act: 'run_started', content: { reference: ref, run_type, site, recipe_version: b.recipe_version } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, record_seq: e.seq });
    const row = await one('SELECT * FROM runs WHERE reference=$1', [ref]);
    return c.json({ ...(await serializeRun(row)), reference: ref }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.post('/api/runs/:ref/consumptions', async (c) => {
  const user = await requireRole(c, 'plant_operator');
  const run = await one('SELECT * FROM runs WHERE reference = $1', [c.req.param('ref')]);
  if (!run) throw notFound('run_not_found');
  if (run.closed) throw conflict('run_closed');
  const b = await c.req.json();
  const mass_g = intField(b.mass_g, 'mass_g');
  const tx = await client();
  try {
    await tx.query('BEGIN');
    // credit is granted when a claimable batch is consumed: dry mass times the site's factor
    let credit = null;
    if (b.batch) {
      const batch = await one(tx, 'SELECT * FROM batches WHERE reference = $1', [b.batch]) || await one('SELECT * FROM batches WHERE reference = $1', [b.batch]);
      if (!batch) { await tx.query('ROLLBACK'); throw bad('batch_not_found'); }
      const rs = await resolveBatch(batch);
      const factor = await one(`SELECT * FROM conversion_factors WHERE site=$1 AND published_on <= $2 ORDER BY published_on DESC LIMIT 1`, [batch.site, isoD(batch.received_on)]);
      const dry = dryMass(mass_g, batch.moisture_bp);
      if (rs.claimable && factor) {
        credit = { batch: batch.reference, category: batch.category, dry_mass_consumed_g: dry, factor_bp: factor.factor_bp, credit_g: creditGranted(dry, factor.factor_bp), factor_reference: factor.reference };
      } else {
        credit = { batch: batch.reference, category: batch.category, dry_mass_consumed_g: dry, credit_g: 0, reason: rs.claimable ? 'no_conversion_factor' : 'non_claimable_input' };
      }
      // a consumption whose effective date falls in a closed period opens a restatement instead
      const period = await one(tx, `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND effective_date_range @> $3::date`,
        [batch.site, batch.grade, isoD(new Date(b.effective_on || Date.now()))]) || null;
    }
    await tx.query(`INSERT INTO consumptions (run, batch, input_output, mass_g, effective_on) VALUES ($1,$2,$3,$4,$5)`,
      [run.reference, b.batch || null, b.input_output || null, mass_g, b.effective_on || new Date().toISOString().slice(0, 10)]);
    if (credit && credit.credit_g > 0) {
      const period = await pickPeriod(run.site, batchGrade(b.batch));
      if (period) {
        if (period.state === 'closed') {
          const rr = await one(`SELECT reference FROM restatements WHERE balance_period=$1 AND state='open' ORDER BY id DESC LIMIT 1`, [period.id]);
          if (!rr) {
            const rref = `RST-${String((await q(`SELECT count(*) n FROM restatements`))[0].n + 1).padStart(4, '0')}`;
            await tx.query(`INSERT INTO restatements (reference, balance_period, reason, opened_on, state) VALUES ($1,$2,$3,$4,'open')`,
              [rref, period.id, 'consumption effective date falls in closed period', isoD(new Date())]);
          }
          await tx.query('ROLLBACK');
          throw conflict('write_into_closed_period', { period: period.id, remedy: 'restatement_opened' });
        }
        await tx.query(`INSERT INTO credit_movements (balance_period, category, direction, mass_g, kind, reference, effective_on, derivation)
          VALUES ($1,$2,'in',$1x,$3,$4,$5,$6)`.replace('$1x', '$7'), [period.id, credit.category, credit.credit_g, 'consumption', credit.batch, isoD(new Date()), JSON.stringify(credit)]);
      }
    }
    const e = await entry(tx, { person: user.email, site: run.site, object: run.reference, act: 'consumption_recorded', content: { run: run.reference, batch: b.batch || null, input_output: b.input_output || null, mass_g, credit } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: run.reference, mass_g, credit, record_seq: e.seq });
    return c.json({ reference: run.reference, mass_g, credit, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

const batchGrade = async (ref) => (await one('SELECT grade FROM batches WHERE reference=$1', [ref]))?.grade || 'N6';

async function pickPeriod(site, grade) {
  return one(`SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`, [site, grade]);
}

r.post('/api/runs/:ref/outputs', async (c) => {
  const user = await requireRole(c, 'plant_operator');
  const run = await one('SELECT * FROM runs WHERE reference = $1', [c.req.param('ref')]);
  if (!run) throw notFound('run_not_found');
  if (run.closed) throw conflict('run_closed');
  const b = await c.req.json();
  const kind = enumField(b.kind, 'kind', ['intermediate', 'lot', 'byproduct']);
  const mass_g = intField(b.mass_g, 'mass_g');
  const ref = b.reference;
  if (!ref) throw bad('missing_field', { field: 'reference' });
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO outputs (reference, run, kind, mass_g, disposition, grade, site, event_at, recorded_at, effective_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now(),$8)`,
      [ref, run.reference, kind, mass_g, kind === 'byproduct' ? enumField(b.disposition, 'disposition', ['sold', 'disposed']) : null,
       b.grade || 'N6', run.site, isoD(new Date())]);
    if (kind === 'lot') {
      await tx.query(`INSERT INTO lots (reference, site, grade, mass_g, produced_by, event_at, recorded_at, effective_on)
        VALUES ($1,$2,$3,$4,$5,now(),now(),$6)`, [ref, run.site, b.grade || 'N6', mass_g, run.reference, isoD(new Date())]);
    }
    const e = await entry(tx, { person: user.email, site: run.site, object: ref, act: 'output_recorded', content: { run: run.reference, output: ref, kind, mass_g, disposition: b.disposition || null } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, kind, mass_g, record_seq: e.seq });
    return c.json({ reference: ref, kind, mass_g, disposition: b.disposition || null, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.post('/api/runs/:ref/close', async (c) => {
  const user = await requireRole(c, 'plant_operator');
  const run = await one('SELECT * FROM runs WHERE reference = $1', [c.req.param('ref')]);
  if (!run) throw notFound('run_not_found');
  if (run.closed) {
    await entryTop({ person: user.email, site: run.site, object: run.reference, act: 'run_second_close_attempt',
      content: { run: run.reference, refused: true, reason: 'run_already_closed' } });
    throw conflict('run_already_closed', { reference: run.reference, closed_at: iso(run.closed_at) });
  }
  const ins = await q('SELECT * FROM consumptions WHERE run = $1', [run.reference]);
  const outs = await q('SELECT * FROM outputs WHERE run = $1', [run.reference]);
  const massIn = ins.reduce((s, x) => s + Number(x.mass_g), 0);
  const massOut = outs.reduce((s, x) => s + Number(x.mass_g), 0);
  const losses = massIn - massOut;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE runs SET closed = true, closed_at = now(), losses_g = $2 WHERE reference = $1`, [run.reference, losses]);
    const tol = RECIPE_TOL[key(run.recipe_version)];
    const within = tol ? withinTol(run.achieved, tol) : null;
    if (within === false) {
      const dref = `DEV-${String((await q(`SELECT count(*) n FROM deviations`))[0].n + 1).padStart(4, '0')}`;
      await tx.query(`INSERT INTO deviations (reference, state, runs, lots, raised_on) VALUES ($1,'open',$2,$3,$4)`,
        [dref, JSON.stringify([run.reference]), JSON.stringify([]), isoD(new Date())]);
    }
    const e = await entry(tx, { person: user.email, site: run.site, object: run.reference, act: 'run_closed',
      content: { run: run.reference, mass_in_g: massIn, mass_out_g: massOut, losses_g: losses, derivation: 'mass in minus mass out' } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: run.reference, losses_g: losses, record_seq: e.seq });
    return c.json({ reference: run.reference, mass_in_g: massIn, mass_out_g: massOut, losses_g: losses, within_tolerance: within, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

function withinTol(achieved, tol) {
  if (!achieved) return null;
  const a = typeof achieved === 'string' ? JSON.parse(achieved) : achieved;
  for (const p of ['temperature', 'pressure']) {
    if (a[p] === undefined) continue;
    const [lo, hi] = tol[p];
    if (Number(a[p]) < lo || Number(a[p]) > hi) return false;
  }
  return true;
}

r.get('/api/runs/:ref/genealogy', async (c) => {
  await requireAuth(c);
  const run = await one('SELECT * FROM runs WHERE reference = $1', [c.req.param('ref')]);
  if (!run) throw notFound('run_not_found');
  return c.json({ run: run.reference, nodes: [], edges: [], text_equivalent: null, flagged: false });
});

export default r;

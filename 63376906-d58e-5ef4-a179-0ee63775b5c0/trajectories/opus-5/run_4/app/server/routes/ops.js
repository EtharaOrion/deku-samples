import { Hono } from 'hono';
import { q, one, pool } from '../db.js';
import { requireSession, requireRole, refuseAuditorWrites } from '../auth.js';
import { appendEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, isoStamp, isInt, ref, weightedContentBp, fdiv } from '../util.js';
import {
  genealogy, lotYield, lotContent, lotCarbon, byproductShare, batchFacts,
  periodForSite, deviationsTouchingLot,
} from '../engine.js';
import { refusePaging } from './intake.js';

export const ops = new Hono();

const RUN_TYPES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

async function shapeRun(r) {
  const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1', [r.recipe_version]);
  const cons = await q('SELECT * FROM consumption WHERE run = $1 ORDER BY reference ASC', [r.reference]);
  const outs = await q('SELECT * FROM output WHERE run = $1 ORDER BY reference ASC', [r.reference]);
  const massIn = cons.reduce((s, x) => s + Number(x.mass_g), 0);
  const massOut = outs.reduce((s, x) => s + Number(x.mass_g), 0);

  let within_tolerance = true;
  const tolerance_detail = [];
  if (recipe) {
    for (const [k, band] of Object.entries(recipe.tolerances || {})) {
      const actual = (r.actual_set_points || {})[k];
      const inBand = actual != null && actual >= band[0] && actual <= band[1];
      if (actual != null && !inBand) within_tolerance = false;
      tolerance_detail.push({
        parameter: k, set_point: (recipe.set_points || {})[k], actual: actual ?? null,
        tolerance_low: band[0], tolerance_high: band[1], within: actual == null ? null : inBand,
      });
    }
  }
  const devs = await q(
    `SELECT d.* FROM deviation d JOIN deviation_link dl ON dl.deviation = d.reference WHERE dl.ref = $1`,
    [r.reference]
  );
  // A flag on a batch is repeated on every run that consumed it.
  const flags = [];
  for (const cn of cons) {
    if (cn.input_kind !== 'batch') continue;
    const b = await one('SELECT * FROM batch WHERE reference = $1', [cn.input_ref]);
    if (!b) continue;
    const f = await batchFacts(b);
    for (const x of f.flags) if (!flags.includes(x.word)) flags.push(x.word);
    if (!f.custody_complete) {
      const w = `Custody incomplete on ${b.reference}: ${f.custody_missing.join(', ')}`;
      if (!flags.includes(w)) flags.push(w);
    }
    if (!f.claimable && !flags.includes('Non-claimable input')) flags.push('Non-claimable input');
  }
  return {
    reference: r.reference,
    run_type: r.run_type,
    site: r.site,
    equipment: r.equipment,
    recipe_version: r.recipe_version,
    recipe: recipe
      ? {
          reference: recipe.reference, version: recipe.version, set_points: recipe.set_points,
          tolerances: recipe.tolerances, reagents: recipe.reagents,
          residence_min: recipe.residence_min, released_by: recipe.released_by,
          released_on: isoDate(recipe.released_on),
        }
      : null,
    actual_set_points: r.actual_set_points,
    within_tolerance,
    tolerance_detail,
    operator: r.operator,
    started_at: isoStamp(r.started_at),
    closed_at: isoStamp(r.closed_at),
    state: r.state,
    mass_in_g: massIn,
    mass_out_g: massOut,
    losses_g: r.losses_g == null ? null : Number(r.losses_g),
    consumptions: cons.map((x) => ({
      reference: x.reference, input_kind: x.input_kind, input: x.input_ref,
      mass_g: Number(x.mass_g), effective_on: isoDate(x.effective_on),
      recorded_at: isoStamp(x.recorded_at), event_at: isoStamp(x.event_at),
    })),
    outputs: outs.map((x) => ({
      reference: x.reference, kind: x.kind, mass_g: Number(x.mass_g), disposition: x.disposition,
    })),
    deviations: devs.map((d) => ({ reference: d.reference, state: d.state, title: d.title, outcome: d.outcome })),
    flags,
    event_at: isoStamp(r.event_at),
    recorded_at: isoStamp(r.recorded_at),
    effective_on: isoDate(r.effective_on),
    recorded_by: r.recorded_by,
    derivation: { losses_g: 'mass in minus mass out, at close' },
  };
}

ops.get('/runs', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM run ORDER BY started_at ASC');
  const out = [];
  for (const r of rows) out.push(await shapeRun(r));
  return c.json(out);
});

ops.get('/runs/:reference', async (c) => {
  requireSession(c);
  const r = await one('SELECT * FROM run WHERE reference = $1', [c.req.param('reference')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(await shapeRun(r));
});

ops.post('/runs', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { run_type, site, equipment, recipe_version, operator, started_at } = body;
    if (!RUN_TYPES.includes(run_type)) {
      return { status: 400, body: { error: 'run_type_not_permitted', permitted: RUN_TYPES } };
    }
    if (!site || !equipment || !recipe_version || !started_at) {
      return { status: 400, body: { error: 'field_required', message: 'site, equipment, recipe_version and started_at are all required.' } };
    }
    if (!(s.sites || []).includes(site)) {
      return { status: 403, body: { error: 'site_out_of_scope', site, scope: s.sites } };
    }
    const rec = await one('SELECT reference FROM recipe_version WHERE reference = $1', [recipe_version]);
    if (!rec) return { status: 404, body: { error: 'recipe_version_not_found', recipe_version } };
    const reference = ref('RUN');
    const effective = String(started_at).slice(0, 10);
    await one(
      `INSERT INTO run (reference,run_type,site,equipment,recipe_version,operator,started_at,state,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$7,$8,$9) RETURNING reference`,
      [reference, run_type, site, equipment, recipe_version, operator || s.email, started_at, effective, s.email]
    );
    await appendEntry(null, {
      act: 'run_started', person: s.email, site, object_kind: 'run', object_ref: reference,
      content: { run_type, recipe_version, equipment, started_at },
    });
    const r = await one('SELECT * FROM run WHERE reference = $1', [reference]);
    return { status: 201, body: { reference, ...(await shapeRun(r)) } };
  });
});

ops.post('/runs/:reference/consumptions', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator');
  const runRef = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const r = await one('SELECT * FROM run WHERE reference = $1', [runRef]);
    if (!r) return { status: 404, body: { error: 'not_found' } };
    if (r.state === 'closed') {
      await appendEntry(null, {
        act: 'write_to_closed_run_refused', person: s.email, site: r.site, object_kind: 'run',
        object_ref: runRef, outcome: 'refused', content: { attempted: 'consumption' },
      });
      return { status: 409, body: { error: 'run_closed', message: 'A closed run refuses every write.' } };
    }
    const { input_kind, input, mass_g, effective_on } = body;
    if (!['batch', 'output'].includes(input_kind)) {
      return { status: 400, body: { error: 'input_kind_not_permitted', permitted: ['batch', 'output'] } };
    }
    if (!isInt(mass_g) || mass_g <= 0) return { status: 400, body: { error: 'integer_required', field: 'mass_g' } };
    const eff = effective_on || isoDate(r.effective_on);

    // A consumption whose effective date falls in a closed period is refused as
    // a write into that period, and opens a restatement instead.
    const period = await periodForSite(r.site, eff);
    if (period && period.state === 'closed') {
      const rst = ref('RST');
      const certs = await q('SELECT number FROM certificate WHERE period = $1 ORDER BY number ASC', [period.id]);
      await one(
        `INSERT INTO restatement (reference,period,reason,opened_by,certificates)
         VALUES ($1,$2,$3,$4,$5) RETURNING reference`,
        [rst, period.id,
         `A consumption on ${runRef} effective ${eff} falls inside the closed period ${period.id}.`,
         s.email, JSON.stringify(certs.map((x) => x.number))]
      );
      await appendEntry(null, {
        act: 'restatement_opened', person: s.email, site: r.site, object_kind: 'restatement',
        object_ref: rst, content: { period: period.id, cause: 'late consumption into a closed period' },
      });
      return {
        status: 409,
        body: {
          error: 'period_closed', reference: rst, period: period.id,
          restatement: rst,
          message: 'This period is closed. Corrections require a restatement.',
          certificates: certs.map((x) => x.number),
        },
      };
    }

    const exists = input_kind === 'batch'
      ? await one('SELECT reference FROM batch WHERE reference = $1', [input])
      : await one('SELECT reference FROM output WHERE reference = $1', [input]);
    if (!exists) return { status: 404, body: { error: 'input_not_found', input } };

    const reference = ref('CON');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO consumption (reference,run,input_kind,input_ref,mass_g,event_at,effective_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [reference, runRef, input_kind, input, mass_g, body.event_at || new Date().toISOString(), eff, s.email]
      );
      // Credit enters when a claimable batch is consumed, in dry mass times the
      // site's conversion factor.
      let credit = null;
      if (input_kind === 'batch' && period) {
        const b = await one('SELECT * FROM batch WHERE reference = $1', [input]);
        const facts = await batchFacts(b);
        const factor = await one(
          `SELECT * FROM conversion_factor WHERE site = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1`,
          [r.site]
        );
        const dry = Math.floor((mass_g * (10000 - b.moisture_bp)) / 10000);
        const granted = facts.claimable && factor ? Math.floor((dry * factor.factor_bp) / 10000) : 0;
        if (granted > 0) {
          const cm = ref('CM');
          await client.query(
            `INSERT INTO credit_movement (reference,period,direction,category,mass_g,batch,consumption,factor_version,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,$2,'in',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [cm, period.id, b.category, granted, input, reference,
             `${factor.reference} v${factor.version}`,
             JSON.stringify({
               consumed_g: mass_g, moisture_bp: b.moisture_bp, dry_mass_consumed_g: dry,
               factor_bp: factor.factor_bp,
               formula: `dry_mass_consumed_g ${dry} * factor_bp ${factor.factor_bp} / 10000, floored = ${granted}`,
             }),
             body.event_at || new Date().toISOString(), eff, s.email]
          );
          credit = { reference: cm, mass_g: granted, category: b.category };
        }
      }
      await appendEntry(client, {
        act: 'consumption_recorded', person: s.email, site: r.site, object_kind: 'consumption',
        object_ref: reference,
        content: { run: runRef, input_kind, input, mass_g, credit_granted_g: credit ? credit.mass_g : 0 },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return {
      status: 201,
      body: { reference, run: runRef, input_kind, input, mass_g, effective_on: eff },
    };
  });
});

ops.post('/runs/:reference/outputs', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator');
  const runRef = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const r = await one('SELECT * FROM run WHERE reference = $1', [runRef]);
    if (!r) return { status: 404, body: { error: 'not_found' } };
    if (r.state === 'closed') {
      await appendEntry(null, {
        act: 'write_to_closed_run_refused', person: s.email, site: r.site, object_kind: 'run',
        object_ref: runRef, outcome: 'refused', content: { attempted: 'output' },
      });
      return { status: 409, body: { error: 'run_closed', message: 'A closed run refuses every write.' } };
    }
    const { kind, mass_g, disposition, grade, claim_type } = body;
    if (!['intermediate', 'lot', 'byproduct'].includes(kind)) {
      return { status: 400, body: { error: 'kind_not_permitted', permitted: ['intermediate', 'lot', 'byproduct'] } };
    }
    if (!isInt(mass_g) || mass_g <= 0) return { status: 400, body: { error: 'integer_required', field: 'mass_g' } };
    if (kind === 'byproduct' && !['sold', 'disposed'].includes(disposition)) {
      return { status: 400, body: { error: 'disposition_required', permitted: ['sold', 'disposed'], message: 'A byproduct carries a disposition.' } };
    }
    const reference = kind === 'lot' ? ref('LOT') : ref('OUT');
    const eff = isoDate(r.effective_on);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO output (reference,run,kind,mass_g,disposition,event_at,effective_on,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [reference, runRef, kind, mass_g, disposition || null,
         body.event_at || new Date().toISOString(), eff, s.email]
      );
      if (kind === 'lot') {
        await client.query(
          `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,produced_by,output_ref,sites_named,event_at,effective_on,recorded_by)
           VALUES ($1,$2,$3,$4,'pending',$5,$6,$1,$7,$8,$9,$10)`,
          [reference, grade || 'N6', r.site, mass_g, claim_type || 'mass_balance', runRef,
           JSON.stringify([r.site]), body.event_at || new Date().toISOString(), eff, s.email]
        );
      }
      await appendEntry(client, {
        act: 'output_recorded', person: s.email, site: r.site, object_kind: 'output',
        object_ref: reference, content: { run: runRef, kind, mass_g, disposition: disposition || null },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return { status: 201, body: { reference, run: runRef, kind, mass_g, disposition: disposition || null } };
  });
});

ops.post('/runs/:reference/close', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator');
  const runRef = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const r = await one('SELECT * FROM run WHERE reference = $1', [runRef]);
    if (!r) return { status: 404, body: { error: 'not_found' } };
    if (r.state === 'closed') {
      // A second close answers 409 and is itself recorded as an attempt.
      await appendEntry(null, {
        act: 'second_close_attempted', person: s.email, site: r.site, object_kind: 'run',
        object_ref: runRef, outcome: 'refused',
        content: { closed_at: isoStamp(r.closed_at) },
      });
      return {
        status: 409,
        body: {
          error: 'run_already_closed', closed_at: isoStamp(r.closed_at),
          message: 'A closed run refuses a second close. The attempt is recorded.',
        },
      };
    }
    const cons = await q('SELECT * FROM consumption WHERE run = $1', [runRef]);
    const outs = await q('SELECT * FROM output WHERE run = $1', [runRef]);
    const massIn = cons.reduce((x, y) => x + Number(y.mass_g), 0);
    const massOut = outs.reduce((x, y) => x + Number(y.mass_g), 0);
    const losses = massIn - massOut;
    const actual = body.actual_set_points || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE run SET state='closed', closed_at=$1, losses_g=$2,
           actual_set_points = COALESCE(NULLIF($3::jsonb,'{}'::jsonb), actual_set_points)
         WHERE reference = $4`,
        [body.closed_at || new Date().toISOString(), losses, JSON.stringify(actual), runRef]
      );
      await appendEntry(client, {
        act: 'run_closed', person: s.email, site: r.site, object_kind: 'run', object_ref: runRef,
        content: { losses_g: losses, mass_in_g: massIn, mass_out_g: massOut,
          derivation: 'mass in minus mass out' },
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // A run outside its recipe tolerance raises a deviation, whether or not its
    // output passed its tests.
    const closed = await one('SELECT * FROM run WHERE reference = $1', [runRef]);
    const shaped = await shapeRun(closed);
    let deviation = null;
    if (!shaped.within_tolerance) {
      const dref = ref('DEV');
      const outside = shaped.tolerance_detail.filter((t) => t.within === false);
      await one(
        `INSERT INTO deviation (reference,title,detail,state,raised_by,raised_at)
         VALUES ($1,$2,$3,'open',$4,now()) RETURNING reference`,
        [dref, `${runRef} ran outside its recipe tolerance`,
         outside.map((t) => `${t.parameter} ${t.actual} against ${t.tolerance_low} to ${t.tolerance_high}`).join('; '),
         s.email]
      );
      await one('INSERT INTO deviation_link (deviation,kind,ref) VALUES ($1,$2,$3) RETURNING id', [dref, 'run', runRef]);
      for (const o of outs.filter((x) => x.kind === 'lot')) {
        await one('INSERT INTO deviation_link (deviation,kind,ref) VALUES ($1,$2,$3) RETURNING id', [dref, 'lot', o.reference]);
      }
      await appendEntry(null, {
        act: 'deviation_raised', person: s.email, site: r.site, object_kind: 'deviation',
        object_ref: dref, content: { run: runRef, reason: 'outside recipe tolerance' },
      });
      deviation = dref;
    }
    return {
      status: 201,
      body: { reference: runRef, ...shaped, losses_g: losses, deviation_raised: deviation, queued: false },
    };
  });
});

// ---------------------------------------------------------------------------
// Lots
// ---------------------------------------------------------------------------

async function shapeLot(l) {
  const content = await lotContent(l.reference);
  const devs = await deviationsTouchingLot(l.reference, false);
  const ovr = await q('SELECT * FROM override WHERE lot = $1', [l.reference]);
  const tests = await q('SELECT * FROM test_result WHERE subject_ref = $1 ORDER BY reference ASC', [l.reference]);
  const gen = await genealogy(l.reference);
  const flags = gen ? gen.flag_words : [];
  return {
    reference: l.reference,
    grade: l.grade,
    site: l.site,
    sites_named: l.sites_named,
    mass_g: Number(l.mass_g),
    disposition: l.disposition,
    claim_type: l.claim_type,
    content_bp: content.content_bp,
    credit_attached_g: content.credit_attached_g,
    category_split: content.category_split,
    provisional_factor: content.provisional_factor,
    conversion_factor: content.conversion_factor,
    produced_by: l.produced_by,
    blended_from: l.blended_from,
    flags,
    flagged: flags.length > 0,
    deviations: devs.map((d) => ({ reference: d.reference, state: d.state, title: d.title, outcome: d.outcome })),
    open_deviation_count: devs.filter((d) => d.state === 'open').length,
    overrides: ovr.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason,
      authorised_by: o.authorised_by, authorised_on: isoDate(o.authorised_on),
      reviewed: o.reviewed, reviewed_by: o.reviewed_by,
      statement: `Separation overridden by ${o.authorised_by} on ${isoDate(o.authorised_on)}. This cannot be removed.`,
    })),
    unreviewed_override_count: ovr.filter((o) => !o.reviewed).length,
    test_results: tests.map((t) => ({
      reference: t.reference, property: t.property, method: t.method, instrument: t.instrument,
      analyst: t.analyst, value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
      entered_by: t.entered_by,
    })),
    effective_on: isoDate(l.effective_on),
    event_at: isoStamp(l.event_at),
    recorded_at: isoStamp(l.recorded_at),
    derivation: content.derivation,
  };
}

ops.get('/lots', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM lot ORDER BY reference ASC');
  const out = [];
  for (const l of rows) out.push(await shapeLot(l));
  return c.json(out);
});

ops.get('/lots/:reference', async (c) => {
  requireSession(c);
  const l = await one('SELECT * FROM lot WHERE reference = $1', [c.req.param('reference')]);
  if (!l) return c.json({ error: 'not_found' }, 404);
  return c.json(await shapeLot(l));
});

ops.get('/lots/:reference/genealogy', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const g = await genealogy(c.req.param('reference'));
  if (!g) return c.json({ error: 'not_found' }, 404);
  return c.json(g);
});

ops.get('/lots/:reference/yield', async (c) => {
  const s = requireSession(c);
  // A yield answers for plant operations, quality and the claims manager. It
  // refuses a collector and a converter, and appears on no certificate.
  const permitted = ['plant_operator', 'quality_manager', 'claims_manager', 'auditor', 'lab_analyst'];
  if (!(s.roles || []).some((r) => permitted.includes(r))) {
    return c.json({ error: 'role_not_permitted', message: 'A yield figure is not shown to a collector or a converter.' }, 403);
  }
  const y = await lotYield(c.req.param('reference'));
  if (!y) return c.json({ error: 'not_found' }, 404);
  return c.json(y);
});

ops.get('/lots/:reference/carbon', async (c) => {
  requireSession(c);
  const r = await lotCarbon(c.req.param('reference'));
  if (!r) return c.json({ error: 'not_found', message: 'No carbon figure exists for this lot.' }, 404);
  if (r.mismatch) return c.json(r, 409);
  return c.json(r);
});

ops.get('/outputs/:reference/byproduct', async (c) => {
  requireSession(c);
  const r = await byproductShare(c.req.param('reference'));
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(r);
});

ops.get('/outputs', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM output ORDER BY reference ASC');
  return c.json(rows.map((o) => ({
    reference: o.reference, run: o.run, kind: o.kind, mass_g: Number(o.mass_g),
    disposition: o.disposition, effective_on: isoDate(o.effective_on),
  })));
});

ops.post('/lots/:reference/disposition', async (c) => {
  refuseAuditorWrites(c);
  const lotRef = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { disposition, reason } = body;
    if (!['pending', 'released', 'quarantined', 'rejected'].includes(disposition)) {
      return { status: 400, body: { error: 'disposition_not_permitted', permitted: ['pending', 'released', 'quarantined', 'rejected'] } };
    }
    const l = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
    if (!l) return { status: 404, body: { error: 'not_found' } };

    // Only a quality manager sets a lot disposition.
    if (!(s.roles || []).includes('quality_manager')) {
      await appendEntry(null, {
        act: 'disposition_refused', person: s.email, site: l.site, object_kind: 'lot',
        object_ref: lotRef, outcome: 'refused', content: { reason: 'role_not_permitted', roles: s.roles },
      });
      return {
        status: 403,
        body: { error: 'role_not_permitted', required: ['quality_manager'], held: s.roles,
          message: 'A lot disposition is set by a quality manager.' },
      };
    }
    // Whoever entered a test result does not disposition that lot.
    const own = await q('SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2', [lotRef, s.email]);
    if (own.length) {
      await appendEntry(null, {
        act: 'disposition_refused', person: s.email, site: l.site, object_kind: 'lot',
        object_ref: lotRef, outcome: 'refused',
        content: { separation: 'analyst_not_dispositioner', test_result: own[0].reference },
      });
      return {
        status: 403,
        body: {
          error: 'separation_broken', separation: 'analyst_not_dispositioner',
          blocking_reference: own[0].reference,
          message: 'Whoever entered a test result does not disposition that lot.',
        },
      };
    }
    // A deviation touching the lot blocks a disposition.
    const devs = await deviationsTouchingLot(lotRef, true);
    if (devs.length) {
      await appendEntry(null, {
        act: 'disposition_refused', person: s.email, site: l.site, object_kind: 'lot',
        object_ref: lotRef, outcome: 'refused', content: { deviation: devs[0].reference },
      });
      return {
        status: 409,
        body: {
          error: 'deviation_open', blocking_reference: devs[0].reference,
          message: `Deviation ${devs[0].reference} is open and touches this lot.`,
        },
      };
    }
    const dref = ref('DSP');
    await one(
      `INSERT INTO disposition_act (reference,lot,disposition,reason,decided_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING reference`,
      [dref, lotRef, disposition, reason || null, s.email]
    );
    await one('UPDATE lot SET disposition = $1 WHERE reference = $2 RETURNING reference', [disposition, lotRef]);
    await appendEntry(null, {
      act: 'lot_dispositioned', person: s.email, site: l.site, object_kind: 'lot',
      object_ref: lotRef, content: { disposition, reason: reason || null },
    });
    const updated = await one('SELECT * FROM lot WHERE reference = $1', [lotRef]);
    return { status: 201, body: { reference: dref, ...(await shapeLot(updated)) } };
  });
});

ops.post('/lots/:reference/blend', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager');
  const aRef = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const bRef = body.lot || body.with_lot;
    const a = await one('SELECT * FROM lot WHERE reference = $1', [aRef]);
    const b = await one('SELECT * FROM lot WHERE reference = $1', [bRef]);
    if (!a || !b) return { status: 404, body: { error: 'lot_not_found', lot: !a ? aRef : bRef } };
    const ca = await lotContent(aRef);
    const cb = await lotContent(bRef);
    const massA = Number(a.mass_g);
    const massB = Number(b.mass_g);
    const mass = massA + massB;
    // Any non-claimable material in the blend dilutes the computed percentage,
    // because it enters the mass and carries no credit.
    const content = weightedContentBp(massA, ca.content_bp, massB, cb.content_bp);
    const WEAK = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };
    const claim_type = WEAK[a.claim_type] <= WEAK[b.claim_type] ? a.claim_type : b.claim_type;
    const sites = [...new Set([...(a.sites_named || [a.site]), ...(b.sites_named || [b.site])])].sort();
    const provisional = ca.provisional_factor || cb.provisional_factor;
    const reference = ref('LOT');
    await one(
      `INSERT INTO lot (reference,grade,site,mass_g,disposition,claim_type,blended_from,sites_named,event_at,effective_on,recorded_by)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,now(),$8,$9) RETURNING reference`,
      [reference, a.grade, a.site, mass, claim_type,
       JSON.stringify([{ lot: aRef, mass_g: massA, content_bp: ca.content_bp },
                       { lot: bRef, mass_g: massB, content_bp: cb.content_bp }]),
       JSON.stringify(sites), isoDate(a.effective_on), s.email]
    );
    for (const [src, m] of [[aRef, massA], [bRef, massB]]) {
      const attached = src === aRef ? ca.credit_attached_g : cb.credit_attached_g;
      if (attached > 0) {
        const period = await periodForSite(src === aRef ? a.site : b.site, isoDate((src === aRef ? a : b).effective_on));
        if (period) {
          await one(
            `INSERT INTO credit_movement (reference,period,direction,category,mass_g,lot,derivation,event_at,effective_on,recorded_by)
             VALUES ($1,$2,'out','post_consumer',0,$3,$4,now(),$5,$6) RETURNING reference`,
            [ref('CM'), period.id, reference,
             JSON.stringify({ note: `blend of ${aRef} and ${bRef}; claim carried by mass`, source_lot: src }),
             isoDate(a.effective_on), s.email]
          );
        }
      }
    }
    const bl = ref('BLD');
    await one(
      'INSERT INTO blend (reference,lot_a,lot_b,result,recorded_by) VALUES ($1,$2,$3,$4,$5) RETURNING reference',
      [bl, aRef, bRef, reference, s.email]
    );
    await appendEntry(null, {
      act: 'lots_blended', person: s.email, site: a.site, object_kind: 'lot', object_ref: reference,
      content: { from: [aRef, bRef], mass_g: mass, content_bp: content, claim_type, sites_named: sites },
    });
    return {
      status: 201,
      body: {
        reference, mass_g: mass, content_bp: content, claim_type,
        sites_named: sites, provisional_factor: provisional,
        blended_from: [
          { lot: aRef, mass_g: massA, content_bp: ca.content_bp, site: a.site, claim_type: a.claim_type },
          { lot: bRef, mass_g: massB, content_bp: cb.content_bp, site: b.site, claim_type: b.claim_type },
        ],
        certification_scope: sites,
        derivation: {
          content_bp: `(${massA} * ${ca.content_bp} + ${massB} * ${cb.content_bp}) / (${massA} + ${massB}), floored`,
          claim_type: 'the weaker of the two claim types',
          sites: 'both sites named; the weaker certification scope taken',
        },
      },
    };
  });
});

// ---------------------------------------------------------------------------
// Test results
// ---------------------------------------------------------------------------

ops.get('/test-results', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM test_result ORDER BY reference ASC');
  return c.json(rows.map((t) => ({
    reference: t.reference, subject_kind: t.subject_kind, subject: t.subject_ref,
    property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
    value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
    method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
    entered_by: t.entered_by, effective_on: isoDate(t.effective_on),
  })));
});

ops.post('/test-results', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'lab_analyst', 'quality_manager');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { subject_kind, subject, property, method, instrument, analyst, value, unit, uncertainty_bp } = body;
    const lot = body.lot || (subject_kind === 'lot' ? subject : null);
    const batch = body.batch || (subject_kind === 'batch' ? subject : null);
    const subjectRef = lot || batch || subject;
    const kind = lot ? 'lot' : batch ? 'batch' : subject_kind;
    if (!subjectRef) return { status: 400, body: { error: 'subject_required', message: 'A result is recorded against a lot or a batch.' } };
    if (!method) {
      return { status: 400, body: { error: 'method_required', message: 'A result with no method is refused.' } };
    }
    if (!property || value === undefined || !unit) {
      return { status: 400, body: { error: 'field_required', message: 'property, value and unit are all required.' } };
    }
    if (!isInt(uncertainty_bp)) return { status: 400, body: { error: 'integer_required', field: 'uncertainty_bp' } };

    const target = kind === 'lot'
      ? await one('SELECT reference, grade FROM lot WHERE reference = $1', [subjectRef])
      : await one('SELECT reference, grade FROM batch WHERE reference = $1', [subjectRef]);
    if (!target) return { status: 404, body: { error: 'subject_not_found', subject: subjectRef } };

    // A result produced by a method other than the one the specification names
    // is kept as evidence, and never reaches a disposition.
    const spec = await one(
      'SELECT * FROM specification WHERE grade = $1 AND superseded = false ORDER BY version DESC LIMIT 1',
      [target.grade || 'N6']
    );
    const specRow = spec ? (spec.properties || []).find((p) => p.property === property) : null;
    const mismatch = !!specRow && specRow.method !== method;

    const reference = ref('TST');
    await one(
      `INSERT INTO test_result (reference,subject_kind,subject_ref,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release,entered_by,event_at,effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14) RETURNING reference`,
      [reference, kind, subjectRef, property, method, instrument || 'not stated',
       analyst || s.name || s.email, String(value), unit, uncertainty_bp,
       mismatch, !mismatch, s.email, new Date().toISOString().slice(0, 10)]
    );
    await appendEntry(null, {
      act: 'test_result_entered', person: s.email, object_kind: 'test_result', object_ref: reference,
      content: { subject: subjectRef, property, method, value: String(value), unit, uncertainty_bp, method_mismatch: mismatch },
    });
    return {
      status: 201,
      body: {
        reference, subject_kind: kind, subject: subjectRef, property, method,
        instrument: instrument || 'not stated', analyst: analyst || s.name || s.email,
        value: String(value), unit, uncertainty_bp,
        method_mismatch: mismatch, usable_for_release: !mismatch,
        specification_method: specRow ? specRow.method : null,
        message: mismatch
          ? `The specification names ${specRow.method} for ${property}. This result is kept as evidence and does not reach a disposition.`
          : null,
      },
    };
  });
});

// ---------------------------------------------------------------------------
// Deviations
// ---------------------------------------------------------------------------

ops.get('/deviations', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM deviation ORDER BY raised_at ASC');
  const out = [];
  for (const d of rows) {
    const links = await q('SELECT * FROM deviation_link WHERE deviation = $1', [d.reference]);
    out.push({
      reference: d.reference, title: d.title, detail: d.detail, state: d.state,
      outcome: d.outcome, raised_by: d.raised_by, raised_at: isoStamp(d.raised_at),
      closed_by: d.closed_by, closed_at: isoStamp(d.closed_at), close_reason: d.close_reason,
      affects: links.map((l) => ({ kind: l.kind, reference: l.ref })),
    });
  }
  return c.json(out);
});

ops.get('/deviations/:reference', async (c) => {
  requireSession(c);
  const d = await one('SELECT * FROM deviation WHERE reference = $1', [c.req.param('reference')]);
  if (!d) return c.json({ error: 'not_found' }, 404);
  const links = await q('SELECT * FROM deviation_link WHERE deviation = $1', [d.reference]);
  return c.json({
    reference: d.reference, title: d.title, detail: d.detail, state: d.state, outcome: d.outcome,
    raised_by: d.raised_by, raised_at: isoStamp(d.raised_at), closed_by: d.closed_by,
    closed_at: isoStamp(d.closed_at), close_reason: d.close_reason,
    affects: links.map((l) => ({ kind: l.kind, reference: l.ref })),
  });
});

ops.post('/deviations', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { title, detail, runs, lots } = body;
    if (!title || !detail) return { status: 400, body: { error: 'title_and_detail_required' } };
    const reference = ref('DEV');
    await one(
      `INSERT INTO deviation (reference,title,detail,state,raised_by,raised_at)
       VALUES ($1,$2,$3,'open',$4,now()) RETURNING reference`,
      [reference, title, detail, s.email]
    );
    for (const r of runs || []) {
      await one('INSERT INTO deviation_link (deviation,kind,ref) VALUES ($1,$2,$3) RETURNING id', [reference, 'run', r]);
    }
    for (const l of lots || []) {
      await one('INSERT INTO deviation_link (deviation,kind,ref) VALUES ($1,$2,$3) RETURNING id', [reference, 'lot', l]);
    }
    await appendEntry(null, {
      act: 'deviation_raised', person: s.email, object_kind: 'deviation', object_ref: reference,
      content: { title, runs: runs || [], lots: lots || [] },
    });
    return { status: 201, body: { reference, title, detail, state: 'open', affects: [...(runs || []).map((r) => ({ kind: 'run', reference: r })), ...(lots || []).map((l) => ({ kind: 'lot', reference: l }))] } };
  });
});

ops.post('/deviations/:reference/close', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager');
  const reference = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { outcome, reason } = body;
    // Both outcomes are honest and neither is hidden.
    if (!['root_cause_found', 'cause_not_established'].includes(outcome)) {
      return { status: 400, body: { error: 'outcome_not_permitted', permitted: ['root_cause_found', 'cause_not_established'] } };
    }
    const d = await one('SELECT * FROM deviation WHERE reference = $1', [reference]);
    if (!d) return { status: 404, body: { error: 'not_found' } };
    if (d.state === 'closed') return { status: 409, body: { error: 'already_closed', closed_at: isoStamp(d.closed_at) } };
    await one(
      `UPDATE deviation SET state='closed', outcome=$1, closed_by=$2, closed_at=now(), close_reason=$3
       WHERE reference=$4 RETURNING reference`,
      [outcome, s.email, reason || null, reference]
    );
    await appendEntry(null, {
      act: 'deviation_closed', person: s.email, object_kind: 'deviation', object_ref: reference,
      content: { outcome, reason: reason || null },
    });
    return { status: 201, body: { reference, state: 'closed', outcome, closed_by: s.email, reason: reason || null } };
  });
});

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

const SEPARATIONS = [
  'analyst_not_dispositioner',
  'method_publisher_not_period_closer',
  'signer_not_data_enterer',
  'booker_not_collector_approver',
];

ops.get('/overrides', async (c) => {
  requireSession(c);
  const bad = refusePaging(c);
  if (bad) return c.json(bad, 400);
  const rows = await q('SELECT * FROM override ORDER BY recorded_at ASC');
  return c.json(rows.map(shapeOverride));
});

function shapeOverride(o) {
  return {
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, authorised_on: isoDate(o.authorised_on),
    recorded_by: o.recorded_by, recorded_at: isoStamp(o.recorded_at),
    reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_at: isoStamp(o.reviewed_at),
    permanent: true,
    statement: `Separation overridden by ${o.authorised_by} on ${isoDate(o.authorised_on)}. This cannot be removed.`,
    blocks_signing: !o.reviewed,
  };
}

ops.get('/overrides/:reference', async (c) => {
  requireSession(c);
  const o = await one('SELECT * FROM override WHERE reference = $1', [c.req.param('reference')]);
  if (!o) return c.json({ error: 'not_found' }, 404);
  return c.json(shapeOverride(o));
});

ops.post('/overrides', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'claims_manager', 'plant_operator');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { separation, reason, lot, authorised_by } = body;
    if (!separation) return { status: 400, body: { error: 'separation_required', permitted: SEPARATIONS } };
    if (!reason || String(reason).trim().length < 40) {
      return {
        status: 400,
        body: {
          error: 'reason_too_short', minimum_characters: 40,
          given: reason ? String(reason).trim().length : 0,
          message: 'An override names the separation broken and a reason of at least forty characters.',
        },
      };
    }
    if (!authorised_by) return { status: 400, body: { error: 'authoriser_required' } };
    const l = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
    if (!l) return { status: 404, body: { error: 'lot_not_found', lot } };
    const reference = ref('OVR');
    await one(
      `INSERT INTO override (reference,separation,reason,lot,authorised_by,recorded_by,authorised_on)
       VALUES ($1,$2,$3,$4,$5,$6,current_date) RETURNING reference`,
      [reference, separation, reason, lot, authorised_by, s.email]
    );
    await appendEntry(null, {
      act: 'override_recorded', person: s.email, site: l.site, object_kind: 'override',
      object_ref: reference, content: { separation, lot, authorised_by, reason },
    });
    const o = await one('SELECT * FROM override WHERE reference = $1', [reference]);
    return { status: 201, body: shapeOverride(o) };
  });
});

ops.post('/overrides/:reference/review', async (c) => {
  refuseAuditorWrites(c);
  const reference = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const o = await one('SELECT * FROM override WHERE reference = $1', [reference]);
    if (!o) return { status: 404, body: { error: 'not_found' } };
    // A review is refused for the authoriser, and for anybody who is neither a
    // quality manager nor a claims manager.
    if (!(s.roles || []).some((r) => ['quality_manager', 'claims_manager'].includes(r))) {
      return {
        status: 403,
        body: { error: 'role_not_permitted', required: ['quality_manager', 'claims_manager'], held: s.roles },
      };
    }
    if (o.authorised_by === s.email) {
      await appendEntry(null, {
        act: 'override_review_refused', person: s.email, object_kind: 'override',
        object_ref: reference, outcome: 'refused', content: { reason: 'authoriser_may_not_review' },
      });
      return {
        status: 403,
        body: {
          error: 'authoriser_may_not_review', authorised_by: o.authorised_by,
          message: 'A review is a second person. The authoriser may not review their own override.',
        },
      };
    }
    // A review sets reviewed true and removes nothing.
    await one(
      'UPDATE override SET reviewed = true, reviewed_by = $1, reviewed_at = now() WHERE reference = $2 RETURNING reference',
      [s.email, reference]
    );
    await appendEntry(null, {
      act: 'override_reviewed', person: s.email, object_kind: 'override', object_ref: reference,
      content: { reviewed_by: s.email, note: body.note || null },
    });
    const updated = await one('SELECT * FROM override WHERE reference = $1', [reference]);
    return { status: 201, body: shapeOverride(updated) };
  });
});

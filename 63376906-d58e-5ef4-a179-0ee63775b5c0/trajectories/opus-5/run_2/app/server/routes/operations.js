import { q, one, pool } from '../lib/db.js';
import {
  refuse, requireSession, requireRole, idempotent, record, refuseParams,
  refuseComputedInput, requireInteger, requireOneOf, refuseAuditorWrite, nextReference,
} from '../lib/http.js';
import {
  runView, genealogy, batchImpact, lotView, batchView, iso, toleranceCheck,
  lotYield, byproductShare, blendedContentBp, weakerClaim, currentFactor,
} from '../lib/engine.js';
import { dryMassG, creditGrantedG, contentBp, weakerCertification } from '../lib/arith.js';

export default function mount(app) {
  /* --------------------------------------------------------------- runs */
  app.get('/runs', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT reference FROM run ORDER BY started_at ASC');
    const out = [];
    for (const r of rows) out.push(await runView(r.reference));
    return c.json(out);
  });

  app.get('/runs/:reference', async (c) => {
    requireSession(c);
    const v = await runView(c.req.param('reference'));
    if (!v) refuse(404, 'no_such_run', { message: 'There is no such run.' });
    return c.json(v);
  });

  app.post('/runs', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const run_type = requireOneOf(body, 'run_type', ['dissolution', 'depolymerisation', 'purification', 'repolymerisation']);
    const site = await one('SELECT * FROM site WHERE reference = $1', [body.site]);
    if (!site) refuse(400, 'no_such_site', { message: 'There is no such site.', field: 'site' });
    if (!s.sites.includes(body.site)) {
      refuse(403, 'site_outside_scope', { message: `This session is scoped to ${s.sites.join(', ')}.` });
    }
    const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1', [body.recipe_version]);
    if (!recipe) refuse(400, 'no_such_recipe_version', { message: 'There is no such recipe version.', field: 'recipe_version' });
    if (!body.equipment) refuse(400, 'field_required', { message: 'equipment is required.', field: 'equipment' });
    if (!body.started_at) refuse(400, 'field_required', { message: 'started_at is required.', field: 'started_at' });

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('RUN');
      const started = new Date(body.started_at).toISOString();
      await pool.query(
        `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, state,
          event_at, effective_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$7,$8,$9)`,
        [reference, run_type, body.site, body.equipment, body.recipe_version,
          body.operator || s.identifier, started, started.slice(0, 10), s.identifier]);
      await record(c, {
        action: 'run_started', object_kind: 'run', object_ref: reference, site: body.site,
        content: { run_type, equipment: body.equipment, recipe_version: body.recipe_version, started_at: started },
      });
      return { status: 201, body: { reference, ...(await runView(reference)) } };
    });
    return c.json(result.body, result.status);
  });

  app.post('/runs/:reference/consumptions', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const run = await one('SELECT * FROM run WHERE reference = $1', [ref]);
    if (!run) refuse(404, 'no_such_run', { message: 'There is no such run.' });
    if (run.state === 'closed') {
      await record(c, {
        action: 'consumption_refused', object_kind: 'run', object_ref: ref, site: run.site,
        outcome: 'refused', content: { reason: 'run_closed' },
      });
      refuse(409, 'run_closed', { message: 'A closed run refuses every write. A correction is a new record naming what it corrects.' });
    }
    const mass_g = requireInteger(body, 'mass_g', { min: 1 });
    const input_kind = requireOneOf(body, 'input_kind', ['batch', 'output']);
    if (!body.input_ref) refuse(400, 'field_required', { message: 'input_ref is required.', field: 'input_ref' });

    const effective_on = String(body.effective_on || run.effective_on && iso(run.effective_on) || iso(new Date())).slice(0, 10);
    // A consumption whose effective date falls in a closed period is refused as a
    // write into that period and opens a restatement instead.
    const period = await one(
      `SELECT * FROM balance_period WHERE site = $1 AND period_from <= $2 AND period_to >= $2 LIMIT 1`,
      [run.site, effective_on]);
    if (period && period.state === 'closed') {
      const rref = await nextReference('RST');
      await pool.query(
        `INSERT INTO restatement (reference, period_id, reason, opened_by, certificates)
         VALUES ($1,$2,$3,$4,$5)`,
        [rref, period.id,
          `A consumption on ${ref} with effective date ${effective_on} falls in a closed period.`,
          s.identifier,
          (await q(`SELECT number FROM certificate WHERE period = $1`, [period.id])).map((x) => x.number)]);
      await record(c, {
        action: 'consumption_refused_into_closed_period', object_kind: 'balance_period', object_ref: period.id,
        outcome: 'refused', site: run.site,
        content: { run: ref, effective_on, restatement: rref },
      });
      refuse(409, 'period_closed', {
        message: 'This period is closed. Corrections require a restatement.',
        period: period.id, restatement_opened: rref, effective_on,
      });
    }

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('CON');
      let dry = mass_g, credit = 0, category = null, claimable = false, factorVersion = null;
      if (input_kind === 'batch') {
        const bv = await batchView(body.input_ref);
        if (!bv) refuse(400, 'no_such_batch', { message: 'There is no such batch.', field: 'input_ref' });
        // Every figure is computed on dry mass.
        dry = Math.min(mass_g, bv.dry_mass_g);
        claimable = bv.claimable;
        category = claimable ? bv.category : 'non_claimable';
        const factor = await currentFactor(run.site);
        factorVersion = factor?.reference || null;
        credit = claimable && factor ? creditGrantedG(dry, factor.factor_bp) : 0;
      } else {
        const out = await one('SELECT * FROM output WHERE reference = $1', [body.input_ref]);
        if (!out) refuse(400, 'no_such_output', { message: 'There is no such output.', field: 'input_ref' });
      }
      await pool.query(
        `INSERT INTO consumption (reference, run, input_kind, input_ref, mass_g, dry_mass_consumed_g, credit_granted_g,
          category, claimable, factor_version, event_at, effective_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [reference, ref, input_kind, body.input_ref, mass_g, dry, credit, category, claimable,
          factorVersion, body.event_at || new Date().toISOString(), effective_on, s.identifier]);

      if (input_kind === 'batch' && period) {
        const factor = await currentFactor(run.site);
        const mref = await nextReference('MOV');
        await pool.query(
          `INSERT INTO credit_movement (reference, period_id, category, direction, mass_g, source_kind, source_ref,
            effective_on, created_by, derivation, fresh_credit)
           VALUES ($1,$2,$3,'in',$4,'consumption',$5,$6,$7,$8,true)`,
          [mref, period.id, category, claimable ? credit : dry, reference, effective_on, s.identifier,
            JSON.stringify({
              consumption: reference, batch: body.input_ref, dry_mass_consumed_g: dry,
              factor: factorVersion, factor_bp: factor?.factor_bp,
              rule: claimable
                ? 'dry_mass_consumed_g * factor_bp / 10000, floored'
                : 'non-claimable input is recorded as mass and grants no credit',
            })]);
      }
      await record(c, {
        action: 'consumption_recorded', object_kind: 'consumption', object_ref: reference, site: run.site,
        content: { run: ref, input_kind, input_ref: body.input_ref, mass_g, dry_mass_consumed_g: dry, credit_granted_g: credit, effective_on },
      });
      return {
        status: 201,
        body: {
          reference, run: ref, input_kind, input_ref: body.input_ref, mass_g,
          dry_mass_consumed_g: dry, credit_granted_g: credit, category, claimable,
          factor_version: factorVersion, effective_on,
          derivation: { credit_granted_g: 'dry_mass_consumed_g * factor_bp / 10000, floored' },
        },
      };
    });
    return c.json(result.body, result.status);
  });

  app.post('/runs/:reference/outputs', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const run = await one('SELECT * FROM run WHERE reference = $1', [ref]);
    if (!run) refuse(404, 'no_such_run', { message: 'There is no such run.' });
    if (run.state === 'closed') refuse(409, 'run_closed', { message: 'A closed run refuses every write.' });
    const kind = requireOneOf(body, 'kind', ['intermediate', 'lot', 'byproduct']);
    const mass_g = requireInteger(body, 'mass_g', { min: 1 });
    let disposition = null;
    if (kind === 'byproduct') disposition = requireOneOf(body, 'disposition', ['sold', 'disposed']);

    const result = await idempotent(c, body, async () => {
      const prefix = kind === 'lot' ? `LOT-${run.site === 'SITE-PILOT' ? 'P' : 'N'}6` : 'OUT';
      const reference = await nextReference(kind === 'lot' ? 'LOT-N6' : 'OUT');
      const effective_on = iso(run.effective_on);
      await pool.query(
        `INSERT INTO output (reference, run, kind, mass_g, disposition, allocation_basis, event_at, effective_on, created_by)
         VALUES ($1,$2,$3,$4,$5,'mass',$6,$7,$8)`,
        [reference, ref, kind, mass_g, disposition, body.event_at || new Date().toISOString(), effective_on, s.identifier]);
      if (kind === 'lot') {
        const period = await one(
          `SELECT * FROM balance_period WHERE site = $1 AND period_from <= $2 AND period_to >= $2 LIMIT 1`,
          [run.site, effective_on]);
        await pool.query(
          `INSERT INTO lot (reference, grade, site, mass_g, disposition, claim_type, output_ref, run_ref,
            specification_version, period_id, event_at, effective_on)
           VALUES ($1,$2,$3,$4,'pending','mass_balance',$1,$5,3,$6,$7,$8)`,
          [reference, body.grade || 'N6', run.site, mass_g, ref, period?.id || null,
            body.event_at || new Date().toISOString(), effective_on]);
      }
      await record(c, {
        action: 'output_recorded', object_kind: 'output', object_ref: reference, site: run.site,
        content: { run: ref, kind, mass_g, disposition },
      });
      return { status: 201, body: { reference, run: ref, kind, mass_g, disposition } };
    });
    return c.json(result.body, result.status);
  });

  // Losses are computed as mass in minus mass out. A closed run refuses a second close.
  app.post('/runs/:reference/close', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const run = await one('SELECT * FROM run WHERE reference = $1', [ref]);
    if (!run) refuse(404, 'no_such_run', { message: 'There is no such run.' });
    if (run.state === 'closed') {
      // A second close answers 409 and is itself recorded as an attempt.
      await record(c, {
        action: 'run_close_attempted', object_kind: 'run', object_ref: ref, site: run.site,
        outcome: 'refused', content: { reason: 'already_closed', closed_at: run.closed_at },
      });
      refuse(409, 'run_already_closed', {
        message: 'This run is closed. A closed run refuses a second close and the attempt is recorded.',
        closed_at: run.closed_at,
      });
    }

    const result = await idempotent(c, body, async () => {
      const cons = await q('SELECT * FROM consumption WHERE run = $1', [ref]);
      const outs = await q('SELECT * FROM output WHERE run = $1', [ref]);
      const massIn = cons.reduce((a, x) => a + Number(x.mass_g), 0);
      const massOut = outs.reduce((a, x) => a + Number(x.mass_g), 0);
      const losses = massIn - massOut;
      const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1', [run.recipe_version]);
      const actual = body.actual_set_points || run.actual_set_points || {};
      const within = toleranceCheck(recipe, actual);
      await pool.query(
        `UPDATE run SET state = 'closed', closed_at = now(), losses_g = $1, actual_set_points = $2, within_tolerance = $3
         WHERE reference = $4`,
        [losses, JSON.stringify(actual), within, ref]);

      // A run outside its recipe tolerance raises a deviation whether or not its
      // output passed its tests.
      let deviation = null;
      if (within === false) {
        deviation = await nextReference('DEV');
        const lots = (await q(`SELECT reference FROM lot WHERE run_ref = $1`, [ref])).map((x) => x.reference);
        await pool.query(
          `INSERT INTO deviation (reference, state, detail, runs, lots, raised_by, event_at, effective_on)
           VALUES ($1,'open',$2,ARRAY[$3],$4,$5,now(),$6)`,
          [deviation, `${ref} ran outside the tolerance of ${run.recipe_version}.`, ref, lots, s.identifier, iso(run.effective_on)]);
        await record(c, {
          action: 'deviation_raised', object_kind: 'deviation', object_ref: deviation, site: run.site,
          content: { run: ref, reason: 'outside_recipe_tolerance', actual_set_points: actual },
        });
      }
      await record(c, {
        action: 'run_closed', object_kind: 'run', object_ref: ref, site: run.site,
        content: { losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within, deviation },
      });
      const view = await runView(ref);
      return { status: 200, body: { reference: ref, ...view, deviation_raised: deviation, queued: false } };
    });
    return c.json(result.body, result.status);
  });

  app.get('/recipe-versions', async (c) => {
    requireSession(c);
    const rows = await q('SELECT * FROM recipe_version ORDER BY reference');
    return c.json(rows.map((r) => ({
      reference: r.reference, run_type: r.run_type, version: r.version, set_points: r.set_points,
      tolerances: r.tolerances, reagents: r.reagents, residence_minutes: r.residence_minutes,
      released_by: r.released_by, released_on: iso(r.released_on), superseded_by: r.superseded_by,
    })));
  });

  /* --------------------------------------------------------------- lots */
  app.get('/lots', async (c) => {
    refuseParams(c);
    const s = requireSession(c);
    const rows = await q('SELECT reference FROM lot ORDER BY reference ASC');
    const out = [];
    for (const r of rows) out.push(await lotView(r.reference));
    return c.json(out);
  });

  app.get('/lots/:reference', async (c) => {
    requireSession(c);
    const v = await lotView(c.req.param('reference'));
    if (!v) refuse(404, 'no_such_lot', { message: 'There is no such lot.' });
    return c.json(v);
  });

  app.get('/lots/:reference/genealogy', async (c) => {
    refuseParams(c);
    requireSession(c);
    const g = await genealogy(c.req.param('reference'));
    if (!g) refuse(404, 'no_such_lot', { message: 'There is no such lot.' });
    return c.json(g);
  });

  app.get('/batches/:reference/impact', async (c) => {
    refuseParams(c);
    requireSession(c);
    const g = await batchImpact(c.req.param('reference'));
    if (!g) refuse(404, 'no_such_batch', { message: 'There is no such batch.' });
    return c.json(g);
  });

  // A yield figure answers for plant operations, quality and the claims manager,
  // and refuses a collector and a converter.
  app.get('/lots/:reference/yield', async (c) => {
    const s = requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager', 'auditor');
    const y = await lotYield(c.req.param('reference'));
    if (!y) refuse(404, 'no_such_lot', { message: 'There is no such lot.' });
    return c.json(y);
  });

  app.get('/outputs/:reference/share', async (c) => {
    requireSession(c);
    const v = await byproductShare(c.req.param('reference'));
    if (!v) refuse(404, 'no_such_byproduct', { message: 'There is no such byproduct output.' });
    return c.json(v);
  });

  app.get('/outputs', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM output ORDER BY reference');
    return c.json(rows.map((o) => ({
      reference: o.reference, run: o.run, kind: o.kind, mass_g: Number(o.mass_g),
      disposition: o.disposition, allocation_basis: o.allocation_basis,
    })));
  });

  // A blend names both sites and takes the weaker of the two claim types.
  app.post('/lots/:reference/blend', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const a = await lotView(ref);
    if (!a) refuse(404, 'no_such_lot', { message: 'There is no such lot.' });
    if (!body.with) refuse(400, 'field_required', { message: 'with is required: a blend names the second lot.', field: 'with' });
    const b = await lotView(body.with);
    if (!b) refuse(404, 'no_such_lot', { message: 'There is no such second lot.', field: 'with' });

    const result = await idempotent(c, body, async () => {
      const mass = a.mass_g + b.mass_g;
      const content = blendedContentBp(a.mass_g, a.content_bp, b.mass_g, b.content_bp);
      const claim_type = weakerClaim(a.claim_type, b.claim_type);
      const sitesNamed = [...new Set([...(a.sites_named || [a.site]), ...(b.sites_named || [b.site])])];
      const siteA = await one('SELECT * FROM site WHERE reference = $1', [a.site]);
      const siteB = await one('SELECT * FROM site WHERE reference = $1', [b.site]);
      const certScope = weakerCertification(siteA.certification_state, siteB.certification_state);
      const provisional = a.provisional_factor || b.provisional_factor;
      const reference = await nextReference('LOT-N6');
      await pool.query(
        `INSERT INTO lot (reference, grade, site, mass_g, disposition, claim_type, specification_version,
          period_id, blended_from, sites_named, event_at, effective_on)
         VALUES ($1,$2,$3,$4,'pending',$5,3,$6,$7,$8,now(),$9)`,
        [reference, a.grade, a.site, mass, claim_type, a.period,
          JSON.stringify([
            { lot: a.reference, mass_g: a.mass_g, content_bp: a.content_bp, claim_type: a.claim_type, site: a.site },
            { lot: b.reference, mass_g: b.mass_g, content_bp: b.content_bp, claim_type: b.claim_type, site: b.site },
          ]), sitesNamed, iso(new Date())]);
      await record(c, {
        action: 'lots_blended', object_kind: 'lot', object_ref: reference, site: a.site,
        content: { from: [a.reference, b.reference], mass_g: mass, content_bp: content, claim_type, sites_named: sitesNamed },
      });
      return {
        status: 201,
        body: {
          reference, mass_g: mass, content_bp: content, claim_type,
          sites_named: sitesNamed, certification_scope: certScope, provisional_factor: provisional,
          blended_from: [
            { lot: a.reference, mass_g: a.mass_g, content_bp: a.content_bp, claim_type: a.claim_type, site: a.site },
            { lot: b.reference, mass_g: b.mass_g, content_bp: b.content_bp, claim_type: b.claim_type, site: b.site },
          ],
          derivation: {
            content_bp: `(mass_a ${a.mass_g} * content_a ${a.content_bp} + mass_b ${b.mass_g} * content_b ${b.content_bp}) / ${mass}, floored`,
            claim_type: 'the weaker of the two claim types',
            certification_scope: 'the weaker certification scope where the two sites differ',
          },
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* ------------------------------------------------------ test results */
  app.get('/test-results', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM test_result ORDER BY recorded_at ASC');
    return c.json(rows.map((t) => ({
      reference: t.reference, subject_kind: t.subject_kind, subject_ref: t.subject_ref,
      property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
      value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
      entered_by: t.entered_by, effective_on: iso(t.effective_on),
    })));
  });

  app.post('/test-results', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'lab_analyst', 'quality_manager');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    // A result with no method is refused.
    if (!body.method) {
      refuse(400, 'method_required', { message: 'A result with no method is refused.', field: 'method' });
    }
    const subject_kind = body.lot ? 'lot' : (body.batch ? 'batch' : null);
    const subject_ref = body.lot || body.batch;
    if (!subject_ref) refuse(400, 'field_required', { message: 'A result records against a lot or a batch.', field: 'lot' });
    for (const f of ['property', 'instrument', 'analyst', 'value', 'unit']) {
      if (!body[f]) refuse(400, 'field_required', { message: `${f} is required.`, field: f });
    }
    const uncertainty_bp = requireInteger(body, 'uncertainty_bp');

    const result = await idempotent(c, body, async () => {
      // A result produced by a method other than the one the specification names
      // is kept as evidence without ever reaching a disposition.
      let method_mismatch = false;
      if (subject_kind === 'lot') {
        const lot = await one('SELECT * FROM lot WHERE reference = $1', [subject_ref]);
        if (lot) {
          const spec = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2',
            ['SPEC-' + lot.grade, lot.specification_version]);
          const prop = spec?.properties?.find((p) => p.property === body.property);
          if (prop && prop.method !== body.method) method_mismatch = true;
        }
      }
      const reference = await nextReference('TST');
      await pool.query(
        `INSERT INTO test_result (reference, subject_kind, subject_ref, property, method, instrument, analyst,
          value, unit, uncertainty_bp, method_mismatch, usable_for_release, entered_by, event_at, effective_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14)`,
        [reference, subject_kind, subject_ref, body.property, body.method, body.instrument, body.analyst,
          String(body.value), body.unit, uncertainty_bp, method_mismatch, !method_mismatch, s.identifier,
          String(body.effective_on || iso(new Date())).slice(0, 10)]);
      await record(c, {
        action: 'test_result_recorded', object_kind: 'test_result', object_ref: reference,
        content: { subject_kind, subject_ref, property: body.property, method: body.method, value: String(body.value), method_mismatch },
      });
      return {
        status: 201,
        body: {
          reference, subject_kind, subject_ref, property: body.property, method: body.method,
          instrument: body.instrument, analyst: body.analyst, value: String(body.value), unit: body.unit,
          uncertainty_bp, method_mismatch, usable_for_release: !method_mismatch, entered_by: s.identifier,
        },
      };
    });
    return c.json(result.body, result.status);
  });

  /* -------------------------------------------------------- disposition */
  // Whoever entered a test result does not disposition that lot.
  app.post('/lots/:reference/disposition', async (c) => {
    refuseAuditorWrite(c);
    const s = requireSession(c);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const lot = await one('SELECT * FROM lot WHERE reference = $1', [ref]);
    if (!lot) refuse(404, 'no_such_lot', { message: 'There is no such lot.' });
    const disposition = requireOneOf(body, 'disposition', ['pending', 'released', 'quarantined', 'rejected']);

    if (s.role !== 'quality_manager') {
      await record(c, {
        action: 'disposition_refused', object_kind: 'lot', object_ref: ref, site: lot.site,
        outcome: 'refused', content: { reason: 'role_not_permitted', role: s.role },
      });
      refuse(403, 'role_not_permitted', {
        message: 'A lot disposition is set by a quality manager. A plant operator and a laboratory analyst may not set one.',
        held_role: s.role,
      });
    }
    const own = await q(
      `SELECT reference FROM test_result WHERE subject_kind = 'lot' AND subject_ref = $1 AND entered_by = $2`,
      [ref, s.identifier]);
    if (own.length) {
      await record(c, {
        action: 'disposition_refused', object_kind: 'lot', object_ref: ref, site: lot.site,
        outcome: 'refused', content: { reason: 'analyst_not_dispositioner', test_result: own[0].reference },
      });
      refuse(403, 'separation_analyst_not_dispositioner', {
        message: 'Whoever entered a test result does not disposition that lot. An override names the separation broken, its reason and its authoriser.',
        separation: 'analyst_not_dispositioner',
        blocking_reference: own[0].reference,
      });
    }
    const openDev = await q(`SELECT reference FROM deviation WHERE $1 = ANY(lots) AND state = 'open'`, [ref]);
    if (openDev.length) {
      await record(c, {
        action: 'disposition_refused', object_kind: 'lot', object_ref: ref, site: lot.site,
        outcome: 'refused', content: { reason: 'open_deviation', deviation: openDev[0].reference },
      });
      refuse(409, 'deviation_open', {
        message: 'A deviation touching this lot is open.',
        blocking_reference: openDev[0].reference,
      });
    }

    const result = await idempotent(c, body, async () => {
      await pool.query(
        `UPDATE lot SET disposition = $1, disposition_by = $2, disposition_at = now() WHERE reference = $3`,
        [disposition, s.identifier, ref]);
      await record(c, {
        action: 'lot_disposition_set', object_kind: 'lot', object_ref: ref, site: lot.site,
        content: { disposition, previous: lot.disposition },
      });
      return { status: 200, body: { reference: ref, ...(await lotView(ref)) } };
    });
    return c.json(result.body, result.status);
  });

  /* --------------------------------------------------------- deviations */
  app.get('/deviations', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM deviation ORDER BY recorded_at ASC');
    return c.json(rows.map((d) => ({
      reference: d.reference, state: d.state, detail: d.detail, runs: d.runs, lots: d.lots,
      outcome: d.outcome, raised_by: d.raised_by, closed_by: d.closed_by,
      effective_on: iso(d.effective_on), closed_at: d.closed_at,
    })));
  });

  app.post('/deviations', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    if (!body.detail) refuse(400, 'field_required', { message: 'detail is required.', field: 'detail' });
    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('DEV');
      await pool.query(
        `INSERT INTO deviation (reference, state, detail, runs, lots, raised_by, event_at, effective_on)
         VALUES ($1,'open',$2,$3,$4,$5,now(),$6)`,
        [reference, body.detail, body.runs || [], body.lots || [], s.identifier,
          String(body.effective_on || iso(new Date())).slice(0, 10)]);
      await record(c, {
        action: 'deviation_raised', object_kind: 'deviation', object_ref: reference,
        content: { detail: body.detail, runs: body.runs || [], lots: body.lots || [] },
      });
      return { status: 201, body: { reference, state: 'open', detail: body.detail, runs: body.runs || [], lots: body.lots || [] } };
    });
    return c.json(result.body, result.status);
  });

  // Both outcomes are honest and neither is hidden.
  app.post('/deviations/:reference/close', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const dev = await one('SELECT * FROM deviation WHERE reference = $1', [ref]);
    if (!dev) refuse(404, 'no_such_deviation', { message: 'There is no such deviation.' });
    if (dev.state === 'closed') refuse(409, 'deviation_closed', { message: 'This deviation is closed.' });
    const outcome = requireOneOf(body, 'outcome', ['root_cause_found', 'cause_not_established']);
    const result = await idempotent(c, body, async () => {
      await pool.query(
        `UPDATE deviation SET state = 'closed', outcome = $1, closed_by = $2, closed_at = now() WHERE reference = $3`,
        [outcome, s.identifier, ref]);
      await record(c, {
        action: 'deviation_closed', object_kind: 'deviation', object_ref: ref,
        content: { outcome },
      });
      return { status: 200, body: { reference: ref, state: 'closed', outcome, closed_by: s.identifier } };
    });
    return c.json(result.body, result.status);
  });

  /* ---------------------------------------------------------- overrides */
  app.get('/overrides', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM separation_override ORDER BY recorded_at ASC');
    return c.json(rows.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
      authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
      reviewed_at: o.reviewed_at, effective_on: iso(o.effective_on), recorded_at: o.recorded_at,
      permanent: true,
    })));
  });

  app.post('/overrides', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager', 'plant_operator');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const separation = requireOneOf(body, 'separation', [
      'analyst_not_dispositioner', 'publisher_not_closer', 'signer_not_recorder', 'bookkeeper_not_approver',
    ]);
    if (!body.reason || String(body.reason).length < 40) {
      refuse(400, 'reason_too_short', {
        message: 'An override names the separation broken, a reason of at least forty characters and its authoriser.',
        minimum_characters: 40,
        supplied_characters: String(body.reason || '').length,
      });
    }
    if (!body.lot) refuse(400, 'field_required', { message: 'lot is required.', field: 'lot' });
    if (!body.authorised_by) refuse(400, 'field_required', { message: 'authorised_by is required.', field: 'authorised_by' });
    const lot = await one('SELECT * FROM lot WHERE reference = $1', [body.lot]);
    if (!lot) refuse(404, 'no_such_lot', { message: 'There is no such lot.', field: 'lot' });

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('OVR');
      await pool.query(
        `INSERT INTO separation_override (reference, separation, reason, lot, authorised_by, created_by, reviewed, event_at, effective_on)
         VALUES ($1,$2,$3,$4,$5,$6,false,now(),$7)`,
        [reference, separation, body.reason, body.lot, body.authorised_by, s.identifier,
          String(body.effective_on || iso(new Date())).slice(0, 10)]);
      await record(c, {
        action: 'override_recorded', object_kind: 'override', object_ref: reference, site: lot.site,
        content: { separation, lot: body.lot, authorised_by: body.authorised_by, reason: body.reason },
      });
      return {
        status: 201,
        body: {
          reference, separation, reason: body.reason, lot: body.lot,
          authorised_by: body.authorised_by, reviewed: false, permanent: true,
          note: 'This is permanent, shows on the lot for its life, is counted on the balance screen, and blocks signing until a second person reviews it.',
        },
      };
    });
    return c.json(result.body, result.status);
  });

  // A review is refused for the authoriser and for anybody who is neither a
  // quality manager nor a claims manager. It removes nothing.
  app.post('/overrides/:reference/review', async (c) => {
    refuseAuditorWrite(c);
    const s = requireSession(c);
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const o = await one('SELECT * FROM separation_override WHERE reference = $1', [ref]);
    if (!o) refuse(404, 'no_such_override', { message: 'There is no such override.' });
    if (!['quality_manager', 'claims_manager'].includes(s.role)) {
      await record(c, {
        action: 'override_review_refused', object_kind: 'override', object_ref: ref,
        outcome: 'refused', content: { reason: 'role_not_permitted', role: s.role },
      });
      refuse(403, 'role_not_permitted', {
        message: 'A review is recorded by a quality manager or a claims manager.', held_role: s.role,
      });
    }
    const person = await one('SELECT * FROM person WHERE identifier = $1 OR email = $1', [o.authorised_by]);
    if (o.authorised_by === s.identifier || o.authorised_by === s.email || person?.identifier === s.identifier) {
      await record(c, {
        action: 'override_review_refused', object_kind: 'override', object_ref: ref,
        outcome: 'refused', content: { reason: 'authoriser_may_not_review' },
      });
      refuse(403, 'authoriser_may_not_review', {
        message: 'The override blocks signing until a second person reviews it. Its authoriser is not that person.',
        authorised_by: o.authorised_by,
      });
    }
    const result = await idempotent(c, body, async () => {
      await pool.query(
        `UPDATE separation_override SET reviewed = true, reviewed_by = $1, reviewed_at = now() WHERE reference = $2`,
        [s.identifier, ref]);
      await record(c, {
        action: 'override_reviewed', object_kind: 'override', object_ref: ref,
        content: { reviewed_by: s.identifier, removes: 'nothing' },
      });
      return {
        status: 200,
        body: {
          reference: ref, separation: o.separation, reason: o.reason, lot: o.lot,
          authorised_by: o.authorised_by, reviewed: true, reviewed_by: s.identifier,
          permanent: true, note: 'A review sets reviewed true and removes nothing.',
        },
      };
    });
    return c.json(result.body, result.status);
  });
}

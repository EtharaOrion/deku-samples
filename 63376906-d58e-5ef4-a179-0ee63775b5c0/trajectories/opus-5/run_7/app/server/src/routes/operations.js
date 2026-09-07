import { Hono } from 'hono';
import { q, one, tx } from '../db.js';
import { append } from '../record.js';
import { withIdempotency, ok, requireRole, requireSession, refusePagination } from '../http.js';
import { requireInteger } from '../units.js';
import {
  batchView, decorateBatch, collectorApprovalOn, approvalExpiring, partyNameOn,
  genealogy, batchImpact, lotClaim, lotYield, byproductShare, iso, readAt
} from '../engine.js';
import { hasRole } from '../auth.js';

export const operations = new Hono();

/* ---------------------------------------------------------------- sites */

operations.get('/sites', async (c) => {
  const rows = await q('SELECT * FROM site ORDER BY name');
  return c.json(rows.map((s) => ({
    reference: s.reference, name: s.name, confidence: s.confidence,
    certification_state: s.certification_state
  })));
});

operations.get('/sites/:reference/capacity', async (c) => {
  const s = await one('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]);
  if (!s) return c.json({ error: 'not_found' }, 404);
  return c.json({
    site: s.reference,
    nameplate_kg: s.nameplate_kg,
    basis: s.basis,
    contracted_kg: s.contracted_kg,
    // computed, and allowed to be negative
    uncommitted_kg: s.nameplate_kg - s.contracted_kg,
    confidence: s.confidence,
    last_revised: iso(s.last_revised),
    derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg' }
  });
});

operations.get('/sites/:reference/certification', async (c) => {
  const rows = await q(
    'SELECT * FROM site_certification WHERE site = $1 ORDER BY effective_from ASC',
    [c.req.param('reference')]
  );
  return c.json(rows.map((r) => ({
    id: Number(r.id), site: r.site, state: r.state, grade: r.grade,
    effective_from: iso(r.effective_from), effective_to: iso(r.effective_to),
    reason: r.reason, recorded_at: r.recorded_at
  })));
});

/** A suspension whose effective_from may precede the date it was recorded. */
operations.post('/sites/:reference/certification', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const site = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/sites/${site}/certification`, body, async () => {
    const { state, effective_from, effective_to, grade, reason } = body;
    if (!['suspended', 'certified', 'not_certified', 'lifted'].includes(state)) {
      return ok({ error: 'unknown_state', accepted: ['suspended', 'certified', 'not_certified', 'lifted'] }, 400);
    }
    if (!effective_from) return ok({ error: 'effective_from_required' }, 400);
    const row = await one(
      `INSERT INTO site_certification (site, state, grade, effective_from, effective_to, reason, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [site, state === 'lifted' ? 'certified' : state, grade || null, effective_from, effective_to || null, reason || null, auth.session.email]
    );
    // Lifting closes the open suspension from the moment the lift takes effect.
    if (state === 'lifted' || state === 'certified') {
      await q(
        `UPDATE site_certification SET effective_to = $2
          WHERE site = $1 AND state = 'suspended' AND effective_to IS NULL`,
        [site, effective_from]
      );
    }
    // Every certificate signed inside the window, each individually resolvable.
    const certificates_in_window = state === 'suspended'
      ? await q(
        `SELECT number, version, state, recipient, recipient_name, signed_at, grade FROM certificate
          WHERE site = $1 AND signed_at::date >= $2 AND ($3::date IS NULL OR signed_at::date <= $3)
            AND ($4::text IS NULL OR grade = $4) ORDER BY signed_at ASC`,
        [site, effective_from, effective_to || null, grade || null]
      )
      : [];
    await append(null, {
      act: 'site_certification_recorded', person: auth.session.email, site,
      object_kind: 'site_certification', object_ref: `SCERT-${row.id}`,
      content: { state, effective_from, effective_to, grade, reason, certificates_in_window: certificates_in_window.map((x) => x.number) }
    });
    return ok({
      reference: `SCERT-${row.id}`,
      site, state, grade: grade || null,
      effective_from, effective_to: effective_to || null, reason: reason || null,
      certificates_in_window: certificates_in_window.map((x) => ({
        number: x.number, version: x.version, state: x.state, recipient: x.recipient,
        recipient_name: x.recipient_name, signed_at: x.signed_at, grade: x.grade,
        resolutions_available: ['reissued', 'withdrawn', 'unaffected']
      })),
      issuing_blocked: state === 'suspended',
      blocking_condition: state === 'suspended'
        ? `The certification for ${site}${grade ? ` grade ${grade}` : ''} is suspended from ${effective_from}.`
        : null,
      reinstates_withdrawn: false,
      note: 'Lifting a suspension does not reinstate a withdrawn certificate; the remedy is a new certificate.'
    }, 201);
  });
});

/* ----------------------------------------------------------- collectors */

async function collectorPayload(row, today) {
  const periods = await q(
    'SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from ASC', [row.reference]
  );
  const findings = await q('SELECT * FROM finding WHERE collector = $1 ORDER BY raised_on ASC', [row.reference]);
  const name = await partyNameOn(row.reference, today);
  return {
    reference: row.reference,
    name,
    country: row.country,
    registration: row.registration,
    registration_expiry: iso(row.registration_expiry),
    collection_site_types: row.collection_site_types,
    declared_streams: row.declared_streams,
    scheme_status: row.scheme_status,
    findings: findings.map((f) => ({
      reference: f.reference, description: f.description, departure_bp: f.departure_bp,
      batch: f.batch, raised_on: iso(f.raised_on), due_on: iso(f.due_on), state: f.state
    })),
    approval_periods: periods.map((p) => ({
      state: p.state,
      valid_from: iso(p.valid_from),
      valid_to: iso(p.valid_to),
      ...(p.state === 'conditional'
        ? { condition: p.condition, condition_closes_on: iso(p.condition_closes_on) }
        : {}),
      // A grant inside fourteen days of its expiry is reported as expiring.
      expiring: approvalExpiring(p, today)
    }))
  };
}

operations.get('/collectors', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await q('SELECT * FROM collector ORDER BY reference');
  const out = [];
  for (const r of rows) out.push(await collectorPayload(r, today));
  return c.json(out);
});

operations.get('/collectors/:reference', async (c) => {
  const row = await one('SELECT * FROM collector WHERE reference = $1', [c.req.param('reference')]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await collectorPayload(row, new Date().toISOString().slice(0, 10)));
});

operations.post('/collectors/:reference/approvals', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/collectors/${reference}/approvals`, body, async () => {
    const { state, valid_from, valid_to, condition, condition_closes_on } = body;
    if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(state)) {
      return ok({ error: 'unknown_state', accepted: ['approved', 'conditional', 'suspended', 'lapsed'] }, 400);
    }
    if (!valid_from || !valid_to) return ok({ error: 'dated_period_required', rule: 'An approval is a dated period.' }, 400);
    if (state === 'conditional' && (!condition || !condition_closes_on)) {
      return ok({ error: 'condition_required', rule: 'A conditional approval names its condition and the date it must be closed by.' }, 400);
    }
    const row = await one(
      `INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [reference, state, valid_from, valid_to, condition || null, condition_closes_on || null, auth.session.email]
    );
    await append(null, {
      act: `collector_${state}`, person: auth.session.email, object_kind: 'collector', object_ref: reference,
      content: { state, valid_from, valid_to, condition }
    });
    return ok({
      reference: `APR-${row.id}`, collector: reference, state,
      valid_from, valid_to, condition: condition || null, condition_closes_on: condition_closes_on || null
    }, 201);
  });
});

/* -------------------------------------------------------------- batches */

operations.get('/batches', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM batch ORDER BY received_on ASC, reference ASC');
  const out = [];
  for (const r of rows) out.push(await decorateBatch(r));
  return c.json(out);
});

operations.get('/batches/:reference', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const v = await batchView(c.req.param('reference'));
  if (!v) return c.json({ error: 'not_found' }, 404);
  return c.json(v);
});

operations.post('/batches', async (c) => {
  const auth = await requireRole(c, 'plant_operator');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/batches', body, async () => {
    // category is required at intake and has no default.
    if (!body.category) {
      return ok({ error: 'category_required', rule: 'The category is required at intake and has no default.' }, 400);
    }
    if (!['post_consumer', 'pre_consumer'].includes(body.category)) {
      return ok({ error: 'unknown_category', accepted: ['post_consumer', 'pre_consumer'] }, 400);
    }
    for (const f of ['gross_g', 'tare_g', 'net_g', 'moisture_bp']) {
      try { requireInteger(body[f], f); } catch (err) { return ok(err.body, 400); }
    }
    if (!body.collector || !body.site || !body.received_on) {
      return ok({ error: 'missing_field', required: ['collector', 'site', 'received_on'] }, 400);
    }
    const collector = await one('SELECT reference FROM collector WHERE reference = $1', [body.collector]);
    if (!collector) return ok({ error: 'unknown_collector', collector: body.collector }, 400);

    const n = await one(`SELECT count(*)::int AS n FROM batch`);
    const reference = body.reference || `BATCH-${1001 + n.n}`;
    const now = new Date().toISOString();
    await q(
      `INSERT INTO batch (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp,
        moisture_method, device, received_on, composition, contamination, accepted_g, event_at, effective_on, booked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$15,$12,$16)`,
      [reference, body.collector, body.site, body.grade || 'N6', body.category,
        body.gross_g, body.tare_g, body.net_g, body.moisture_bp, body.moisture_method || null,
        body.device || null, body.received_on, JSON.stringify(body.composition || {}),
        JSON.stringify(body.contamination || {}), body.event_at || `${body.received_on}T08:00:00Z`,
        auth.session.email]
    );
    let ordinal = 0;
    for (const link of body.custody || []) {
      await q(
        `INSERT INTO custody_link (batch, ordinal, kind, link_date, party) VALUES ($1,$2,$3,$4,$5)`,
        [reference, ordinal++, link.kind, link.date, link.party]
      );
    }
    // A batch and its weighing land together or neither lands.
    if (body.device) {
      const dev = await one('SELECT calibrated_on FROM device WHERE reference = $1', [body.device]);
      if (dev) {
        const received = new Date(body.received_on + 'T00:00:00Z');
        const cal = new Date(iso(dev.calibrated_on) + 'T00:00:00Z');
        const twelve = new Date(cal); twelve.setUTCMonth(twelve.getUTCMonth() + 12);
        await q(
          `INSERT INTO weighing (reference, batch, device, gross_g, tare_g, net_g, calibration_state, weighed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [`WGH-${reference.replace(/^BATCH-/, '')}`, reference, body.device, body.gross_g, body.tare_g,
            body.net_g, received > twelve ? 'lapsed' : 'valid', body.event_at || `${body.received_on}T08:00:00Z`]
        );
      }
    }

    const view = await batchView(reference);

    // A measured composition departing from the declaration by more than 500 basis points
    // raises a finding against the collector rather than against the plant.
    const comp = body.composition || {};
    if (comp.measured_fraction_bp !== undefined && comp.fraction_bp !== undefined) {
      const departure = Math.abs(comp.measured_fraction_bp - comp.fraction_bp);
      if (departure > 500) {
        const fn = await one(`SELECT count(*)::int AS n FROM finding`);
        const fref = `FND-${String(fn.n + 1).padStart(4, '0')}`;
        await q(
          `INSERT INTO finding (reference, collector, batch, description, departure_bp, raised_on, due_on, state)
           VALUES ($1,$2,$3,$4,$5,$6,$6::date + 90,'open')`,
          [fref, body.collector, reference,
            `Measured fraction departs from the declaration by ${departure} basis points`, departure, body.received_on]
        );
        view.finding = fref;
        await append(null, {
          act: 'finding_raised', person: auth.session.email, object_kind: 'finding', object_ref: fref,
          content: { collector: body.collector, batch: reference, departure_bp: departure }
        });
      }
    }

    await append(null, {
      act: 'batch_booked_in', person: auth.session.email, person_id: auth.session.person_id,
      site: body.site, object_kind: 'batch', object_ref: reference,
      content: { category: body.category, net_g: body.net_g, dry_mass_g: view.dry_mass_g, claimable: view.claimable }
    });
    return ok({ reference, ...view }, 201);
  });
});

/** A batch category cannot be changed after acceptance, by anybody, through any route. */
operations.patch('/batches/:reference', async (c) => {
  const auth = await requireSession(c);
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
  if (!b) return c.json({ error: 'not_found' }, 404);
  if (body.category !== undefined) {
    await append(null, {
      act: 'batch_category_change_refused', person: auth.session.email, site: b.site,
      object_kind: 'batch', object_ref: reference, outcome: 'refused',
      content: { attempted_category: body.category, held_category: b.category }
    });
    return c.json({
      error: 'category_immutable_after_acceptance',
      batch: reference,
      category: b.category,
      attempted: body.category,
      rule: 'A batch category cannot be changed after acceptance, by anybody, through any route.'
    }, 409);
  }
  if (hasRole(auth.session, 'auditor')) {
    return c.json({ error: 'not_permitted', rule: 'An auditor writes no operational record, at any route.' }, 403);
  }
  const allowed = {};
  if (body.moisture_method !== undefined) allowed.moisture_method = body.moisture_method;
  if (body.contamination !== undefined) allowed.contamination = JSON.stringify(body.contamination);
  if (body.composition !== undefined) allowed.composition = JSON.stringify(body.composition);
  const keys = Object.keys(allowed);
  if (!keys.length) return c.json({ error: 'nothing_to_change' }, 400);
  await q(
    `UPDATE batch SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE reference = $1`,
    [reference, ...keys.map((k) => allowed[k])]
  );
  await append(null, {
    act: 'batch_amended', person: auth.session.email, site: b.site,
    object_kind: 'batch', object_ref: reference, content: { fields: keys }
  });
  return c.json(await batchView(reference));
});

/** A late custody document: the batch becomes claimable from the date it arrived. */
operations.post('/batches/:reference/custody', async (c) => {
  const auth = await requireRole(c, 'plant_operator', 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/batches/${reference}/custody`, body, async () => {
    const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
    if (!b) return ok({ error: 'not_found' }, 404);
    if (!body.kind || !body.date || !body.party || !body.arrived_on) {
      return ok({ error: 'missing_field', required: ['kind', 'date', 'party', 'arrived_on'] }, 400);
    }
    const next = await one('SELECT coalesce(max(ordinal), -1) + 1 AS n FROM custody_link WHERE batch = $1', [reference]);
    await q(
      `INSERT INTO custody_link (batch, ordinal, kind, link_date, party, arrived_on, late)
       VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [reference, next.n, body.kind, body.date, body.party, body.arrived_on]
    );
    await q('UPDATE batch SET claimable_from = $2 WHERE reference = $1', [reference, body.arrived_on]);
    const view = await batchView(reference);
    await append(null, {
      act: 'custody_link_attached', person: auth.session.email, site: b.site,
      object_kind: 'batch', object_ref: reference,
      content: { kind: body.kind, arrived_on: body.arrived_on, claimable_from: view.claimable_from }
    });
    return ok({ reference, ...view }, 201);
  });
});

/** A rejection in whole or in part. Accepted plus rejected equals delivered. */
operations.post('/batches/:reference/reject', async (c) => {
  const auth = await requireRole(c, 'plant_operator', 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/batches/${reference}/reject`, body, async () => {
    const b = await one('SELECT * FROM batch WHERE reference = $1', [reference]);
    if (!b) return ok({ error: 'not_found' }, 404);
    let rejected;
    try { rejected = requireInteger(body.rejected_g, 'rejected_g'); } catch (err) { return ok(err.body, 400); }
    if (!body.reason || !body.destination) {
      return ok({ error: 'missing_field', required: ['reason', 'destination'], rule: 'A partial rejection records where the rejected mass went.' }, 400);
    }
    const accepted = b.net_g - rejected;
    if (rejected < 0 || accepted < 0) {
      return ok({
        error: 'rejection_does_not_sum', delivered_g: b.net_g, rejected_g: rejected, accepted_g: accepted,
        rule: 'Accepted mass plus rejected mass equals delivered mass.'
      }, 409);
    }
    await q(
      `UPDATE batch SET rejected_g = $2, accepted_g = $3, rejected_destination = $4, rejected_reason = $5
       WHERE reference = $1`,
      [reference, rejected, accepted, body.destination, body.reason]
    );
    await append(null, {
      act: 'batch_rejected', person: auth.session.email, site: b.site, object_kind: 'batch', object_ref: reference,
      content: { rejected_g: rejected, accepted_g: accepted, reason: body.reason, destination: body.destination }
    });
    const view = await batchView(reference);
    return ok({ reference, ...view }, 201);
  });
});

operations.get('/batches/:reference/impact', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const impact = await batchImpact(c.req.param('reference'));
  if (!impact) return c.json({ error: 'not_found' }, 404);
  return c.json(impact);
});

/* ----------------------------------------------------------------- runs */

operations.get('/runs', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM run ORDER BY started_at ASC');
  const consumptions = await q('SELECT run, input_kind, input_ref, mass_g, reference FROM consumption');
  const outputs = await q('SELECT run, reference, kind, mass_g, disposition FROM output');
  const devs = await q('SELECT reference, state, runs FROM deviation');
  return c.json(rows.map((r) => ({
    reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
    recipe_version: r.recipe_version, operator: r.operator,
    started_at: r.started_at, closed_at: r.closed_at, state: r.state, losses_g: r.losses_g,
    actual_set_points: r.actual_set_points, within_tolerance: r.within_tolerance,
    consumptions: consumptions.filter((x) => x.run === r.reference),
    outputs: outputs.filter((x) => x.run === r.reference),
    deviations: devs.filter((d) => (d.runs || []).includes(r.reference)).map((d) => ({ reference: d.reference, state: d.state })),
    effective_on: iso(r.effective_on)
  })));
});

operations.get('/runs/:reference', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const r = await one('SELECT * FROM run WHERE reference = $1', [reference]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  const [name, version] = [r.recipe_version.replace(/-(\d+)$/, ''), Number(r.recipe_version.match(/-(\d+)$/)?.[1] || 1)];
  const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1 AND version = $2', [name, version]);
  const consumptions = await q('SELECT * FROM consumption WHERE run = $1 ORDER BY reference', [reference]);
  const outputs = await q('SELECT * FROM output WHERE run = $1 ORDER BY reference', [reference]);
  // A missing custody link names itself on every run that consumed the batch.
  const custodyNotes = [];
  for (const cons of consumptions) {
    if (cons.input_kind === 'batch') {
      const v = await batchView(cons.input_ref);
      if (v && !v.custody_complete) custodyNotes.push({ batch: v.reference, missing: v.custody_missing });
    }
  }
  return c.json({
    reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
    recipe_version: r.recipe_version,
    recipe: recipe ? {
      reference: recipe.reference, version: recipe.version, set_points: recipe.set_points,
      tolerances: recipe.tolerances, reagents: recipe.reagents,
      residence_time_minutes: recipe.residence_time_minutes, released_by: recipe.released_by,
      released_on: iso(recipe.released_on)
    } : null,
    actual_set_points: r.actual_set_points,
    within_tolerance: r.within_tolerance,
    operator: r.operator, started_at: r.started_at, closed_at: r.closed_at, state: r.state,
    losses_g: r.losses_g,
    consumptions: consumptions.map((x) => ({ reference: x.reference, input_kind: x.input_kind, input_ref: x.input_ref, mass_g: x.mass_g, effective_on: iso(x.effective_on) })),
    outputs: outputs.map((x) => ({ reference: x.reference, kind: x.kind, mass_g: x.mass_g, disposition: x.disposition })),
    custody_notes: custodyNotes,
    event_at: r.event_at, recorded_at: r.recorded_at, effective_on: iso(r.effective_on),
    derivation: { losses_g: 'mass in minus mass out at close' }
  });
});

operations.post('/runs', async (c) => {
  const auth = await requireRole(c, 'plant_operator');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/runs', body, async () => {
    const types = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
    if (!types.includes(body.run_type)) return ok({ error: 'unknown_run_type', accepted: types }, 400);
    for (const f of ['site', 'equipment', 'recipe_version', 'operator', 'started_at']) {
      if (!body[f]) return ok({ error: 'missing_field', field: f }, 400);
    }
    const prefix = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[body.run_type];
    const n = await one(`SELECT count(*)::int AS n FROM run WHERE run_type = $1`, [body.run_type]);
    const reference = `RUN-${prefix}-${String(n.n + 1).padStart(4, '0')}`;
    const day = String(body.started_at).slice(0, 10);
    await q(
      `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, state,
        actual_set_points, event_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$7,$9)`,
      [reference, body.run_type, body.site, body.equipment, body.recipe_version, body.operator,
        body.started_at, JSON.stringify(body.actual_set_points || {}), body.effective_on || day]
    );
    await append(null, {
      act: 'run_started', person: auth.session.email, site: body.site,
      object_kind: 'run', object_ref: reference,
      content: { run_type: body.run_type, recipe_version: body.recipe_version, equipment: body.equipment }
    });
    return ok({ reference, run_type: body.run_type, site: body.site, state: 'open', started_at: body.started_at }, 201);
  });
});

operations.post('/runs/:reference/consumptions', async (c) => {
  const auth = await requireRole(c, 'plant_operator');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/runs/${reference}/consumptions`, body, async () => {
    const r = await one('SELECT * FROM run WHERE reference = $1', [reference]);
    if (!r) return ok({ error: 'not_found' }, 404);
    if (r.state === 'closed') {
      await append(null, {
        act: 'write_to_closed_run_refused', person: auth.session.email, site: r.site,
        object_kind: 'run', object_ref: reference, outcome: 'refused', content: { attempted: 'consumption' }
      });
      return ok({ error: 'run_closed', rule: 'A closed run refuses every write.' }, 409);
    }
    let mass;
    try { mass = requireInteger(body.mass_g, 'mass_g'); } catch (err) { return ok(err.body, 400); }
    const inputKind = body.input_kind || (String(body.input || '').startsWith('BATCH-') ? 'batch' : 'output');
    const inputRef = body.input || body.input_ref;
    if (!inputRef) return ok({ error: 'missing_field', field: 'input' }, 400);
    const effective_on = body.effective_on || String(body.event_at || r.started_at).slice(0, 10);

    // A consumption whose effective date falls in a closed period is refused as a write
    // into that period and opens a restatement instead.
    const period = await one(
      `SELECT * FROM balance_period WHERE site = $1 AND $2 BETWEEN period_from AND period_to ORDER BY period_from DESC LIMIT 1`,
      [r.site, effective_on]
    );
    if (period && period.state === 'closed') {
      const rn = await one(`SELECT count(*)::int AS n FROM restatement`);
      const rref = `RST-${String(rn.n + 1).padStart(4, '0')}`;
      const certs = await q(`SELECT number, version FROM certificate WHERE period = $1`, [period.id]);
      await q(
        `INSERT INTO restatement (reference, period, reason, certificates, opened_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [rref, period.id, `A consumption dated ${effective_on} arrived after ${period.id} closed`,
          JSON.stringify(certs.map((x) => x.number)), auth.session.email]
      );
      await append(null, {
        act: 'consumption_into_closed_period_refused', person: auth.session.email, site: r.site,
        object_kind: 'balance_period', object_ref: period.id, outcome: 'refused',
        content: { run: reference, effective_on, restatement: rref }
      });
      return ok({
        error: 'period_closed',
        period: period.id,
        restatement: rref,
        rule: 'This period is closed. Corrections require a restatement.'
      }, 409);
    }

    const cn = await one(`SELECT count(*)::int AS n FROM consumption WHERE run = $1`, [reference]);
    const cref = `CON-${reference.slice(4)}-${cn.n + 1}`;
    await q(
      `INSERT INTO consumption (reference, run, input_kind, input_ref, mass_g, event_at, effective_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [cref, reference, inputKind, inputRef, mass, body.event_at || r.started_at, effective_on, auth.session.email]
    );

    // Credits enter when a claimable batch is consumed: dry mass times the conversion factor.
    let credit = null;
    if (inputKind === 'batch' && period) {
      const view = await batchView(inputRef);
      const factor = await one(
        `SELECT * FROM conversion_factor WHERE site = $1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1`,
        [r.site]
      );
      const proportionDry = view ? Math.floor(mass * (10000 - view.moisture_bp) / 10000) : 0;
      const claimableNow = view && view.claimable &&
        (!view.claimable_from || view.claimable_from <= effective_on);
      const grams = claimableNow && factor ? Math.floor(proportionDry * factor.factor_bp / 10000) : 0;
      await q(
        `INSERT INTO credit_movement (period, direction, category, mass_g, source_kind, source_ref, fresh_credit, derivation, event_at, effective_on, created_by)
         VALUES ($1,'in',$2,$3,'consumption',$4,true,$5,$6,$7,$8)`,
        [period.id, claimableNow ? view.category : 'non_claimable', grams, cref,
          JSON.stringify({
            batch: inputRef, consumption: cref, dry_mass_g: proportionDry,
            factor: factor?.reference, factor_bp: factor?.factor_bp,
            rule: `dry_mass_consumed_g ${proportionDry} * factor_bp ${factor?.factor_bp || 0} / 10000, floored`,
            claimable: !!claimableNow, claimable_reason: view?.claimable_reason || null
          }), body.event_at || r.started_at, effective_on, auth.session.email]
      );
      credit = { category: claimableNow ? view.category : 'non_claimable', mass_g: grams, dry_mass_g: proportionDry };
    }

    await append(null, {
      act: 'consumption_recorded', person: auth.session.email, site: r.site,
      object_kind: 'consumption', object_ref: cref,
      content: { run: reference, input: inputRef, mass_g: mass, credit }
    });
    return ok({ reference: cref, run: reference, input: inputRef, mass_g: mass, credit, effective_on }, 201);
  });
});

operations.post('/runs/:reference/outputs', async (c) => {
  const auth = await requireRole(c, 'plant_operator');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/runs/${reference}/outputs`, body, async () => {
    const r = await one('SELECT * FROM run WHERE reference = $1', [reference]);
    if (!r) return ok({ error: 'not_found' }, 404);
    if (r.state === 'closed') {
      await append(null, {
        act: 'write_to_closed_run_refused', person: auth.session.email, site: r.site,
        object_kind: 'run', object_ref: reference, outcome: 'refused', content: { attempted: 'output' }
      });
      return ok({ error: 'run_closed', rule: 'A closed run refuses every write.' }, 409);
    }
    let mass;
    try { mass = requireInteger(body.mass_g, 'mass_g'); } catch (err) { return ok(err.body, 400); }
    const kinds = ['intermediate', 'lot', 'byproduct'];
    if (!kinds.includes(body.kind)) return ok({ error: 'unknown_kind', accepted: kinds }, 400);
    if (body.kind === 'byproduct' && !['sold', 'disposed'].includes(body.disposition)) {
      return ok({ error: 'disposition_required', accepted: ['sold', 'disposed'], rule: 'A byproduct carries its disposition.' }, 400);
    }
    const prefix = reference.replace('RUN-', 'OUT-');
    const on = await one(`SELECT count(*)::int AS n FROM output WHERE run = $1`, [reference]);
    const oref = body.reference || (body.kind === 'lot'
      ? `LOT-${r.site === 'SITE-PILOT' ? 'N6' : 'N6'}-${String((await one(`SELECT count(*)::int AS n FROM lot`)).n + 1).padStart(4, '0')}`
      : `${prefix}-${String(on.n + 1)}`);
    const day = String(body.event_at || r.started_at).slice(0, 10);
    await q(
      `INSERT INTO output (reference, run, kind, mass_g, disposition, allocation_basis, event_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,'mass',$6,$7)`,
      [oref, reference, body.kind, mass, body.disposition || null, body.event_at || r.started_at, day]
    );
    if (body.kind === 'lot') {
      await q(
        `INSERT INTO lot (reference, grade, site, mass_g, disposition, claim_type, run, specification_version, produced_on)
         VALUES ($1,$2,$3,$4,'pending',$5,$6,3,$7) ON CONFLICT DO NOTHING`,
        [oref, body.grade || 'N6', r.site, mass, body.claim_type || 'mass_balance', reference, day]
      );
    }
    await append(null, {
      act: 'output_recorded', person: auth.session.email, site: r.site,
      object_kind: 'output', object_ref: oref,
      content: { run: reference, kind: body.kind, mass_g: mass, disposition: body.disposition || null }
    });
    return ok({ reference: oref, run: reference, kind: body.kind, mass_g: mass, disposition: body.disposition || null }, 201);
  });
});

operations.post('/runs/:reference/close', async (c) => {
  const auth = await requireRole(c, 'plant_operator');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/runs/${reference}/close`, body, async () => {
    const r = await one('SELECT * FROM run WHERE reference = $1', [reference]);
    if (!r) return ok({ error: 'not_found' }, 404);
    if (r.state === 'closed') {
      // A second close answers 409 and is itself recorded as an attempt.
      await append(null, {
        act: 'second_close_attempted', person: auth.session.email, site: r.site,
        object_kind: 'run', object_ref: reference, outcome: 'refused',
        content: { closed_at: r.closed_at, losses_g: r.losses_g }
      });
      return ok({
        error: 'run_already_closed', run: reference, closed_at: r.closed_at,
        rule: 'A closed run refuses a second close, and the attempt is itself recorded.'
      }, 409);
    }
    const consumptions = await q('SELECT mass_g FROM consumption WHERE run = $1', [reference]);
    const outputs = await q('SELECT mass_g FROM output WHERE run = $1', [reference]);
    const inMass = consumptions.reduce((s, x) => s + x.mass_g, 0);
    const outMass = outputs.reduce((s, x) => s + x.mass_g, 0);
    const losses = inMass - outMass; // computed, never accepted from a caller

    // A run outside its recipe tolerance raises a deviation whether or not its output passed.
    const [rname, rversion] = [r.recipe_version.replace(/-(\d+)$/, ''), Number(r.recipe_version.match(/-(\d+)$/)?.[1] || 1)];
    const recipe = await one('SELECT * FROM recipe_version WHERE reference = $1 AND version = $2', [rname, rversion]);
    let within = true;
    const actual = r.actual_set_points || {};
    if (recipe) {
      for (const [k, range] of Object.entries(recipe.tolerances || {})) {
        const v = actual[k];
        if (v !== undefined && (v < range[0] || v > range[1])) within = false;
      }
    }
    const closedAt = body.closed_at || new Date().toISOString();
    await q(
      `UPDATE run SET state = 'closed', closed_at = $2, losses_g = $3, within_tolerance = $4 WHERE reference = $1`,
      [reference, closedAt, losses, within]
    );
    let deviation = null;
    if (!within) {
      const dn = await one(`SELECT count(*)::int AS n FROM deviation`);
      deviation = `DEV-${String(dn.n + 1).padStart(4, '0')}`;
      const lotRows = await q(`SELECT reference FROM output WHERE run = $1 AND kind = 'lot'`, [reference]);
      await q(
        `INSERT INTO deviation (reference, state, runs, lots, description, raised_by)
         VALUES ($1,'open',$2,$3,$4,$5)`,
        [deviation, JSON.stringify([reference]), JSON.stringify(lotRows.map((x) => x.reference)),
          `Run ${reference} ran outside its recipe tolerance`, auth.session.email]
      );
      await append(null, {
        act: 'deviation_raised', person: auth.session.email, site: r.site,
        object_kind: 'deviation', object_ref: deviation,
        content: { run: reference, reason: 'outside recipe tolerance' }
      });
    }
    await append(null, {
      act: 'run_closed', person: auth.session.email, site: r.site, object_kind: 'run', object_ref: reference,
      content: { losses_g: losses, mass_in_g: inMass, mass_out_g: outMass, within_tolerance: within, deviation }
    });
    return ok({
      reference, state: 'closed', closed_at: closedAt,
      losses_g: losses, mass_in_g: inMass, mass_out_g: outMass,
      within_tolerance: within, deviation,
      derivation: { losses_g: `mass in ${inMass} minus mass out ${outMass}` },
      note: 'Losses reduce the claim.'
    }, 201);
  });
});

/* ----------------------------------------------------------------- lots */

operations.get('/lots', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM lot ORDER BY reference');
  const out = [];
  for (const l of rows) {
    const claim = await lotClaim(l.reference);
    const devs = await q(`SELECT reference, state FROM deviation WHERE lots ? $1`, [l.reference]);
    const ovr = await q('SELECT reference, reviewed, separation, authorised_by, created_at FROM separation_override WHERE lot = $1', [l.reference]);
    const g = await genealogy(l.reference);
    out.push({
      reference: l.reference, grade: l.grade, site: l.site, mass_g: l.mass_g,
      disposition: l.disposition, claim_type: l.claim_type, run: l.run,
      specification_version: l.specification_version,
      produced_on: iso(l.produced_on),
      content_bp: claim.content_bp,
      credit_attached_g: claim.credit_attached_g,
      category_split: claim.category_split,
      blended_from: l.blended_from, sites: l.sites,
      deviations: devs,
      overrides: ovr.map((o) => ({ reference: o.reference, reviewed: o.reviewed, separation: o.separation, authorised_by: o.authorised_by, created_at: o.created_at })),
      flags: g ? g.nodes.filter((n) => n.kind === 'batch').flatMap((n) => n.flags).filter((v, i, a) => a.indexOf(v) === i) : []
    });
  }
  return c.json(out);
});

operations.get('/lots/:reference', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const l = await one('SELECT * FROM lot WHERE reference = $1', [reference]);
  if (!l) return c.json({ error: 'not_found' }, 404);
  const claim = await lotClaim(reference);
  const devs = await q(`SELECT reference, state, description, outcome FROM deviation WHERE lots ? $1`, [reference]);
  const ovr = await q('SELECT * FROM separation_override WHERE lot = $1', [reference]);
  const tests = await q(`SELECT * FROM test_result WHERE subject_ref = $1 ORDER BY entered_at`, [reference]);
  const g = await genealogy(reference);
  return c.json({
    reference: l.reference, grade: l.grade, site: l.site, mass_g: l.mass_g,
    disposition: l.disposition, claim_type: l.claim_type, run: l.run,
    specification_version: l.specification_version, produced_on: iso(l.produced_on),
    content_bp: claim.content_bp, credit_attached_g: claim.credit_attached_g,
    category_split: claim.category_split,
    blended_from: l.blended_from, sites: l.sites,
    deviations: devs,
    overrides: ovr.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason,
      authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
      created_at: o.created_at,
      statement: `Separation overridden by ${o.authorised_by} on ${iso(o.created_at)}. This cannot be removed.`
    })),
    test_results: tests.map((t) => ({
      reference: t.reference, property: t.property, method: t.method, value: t.value,
      unit: t.unit, uncertainty_bp: t.uncertainty_bp, analyst: t.analyst,
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release
    })),
    flags: g ? g.nodes.flatMap((n) => n.flags).filter((v, i, a) => a.indexOf(v) === i) : [],
    derivation: claim.derivation
  });
});

operations.get('/lots/:reference/genealogy', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const g = await genealogy(c.req.param('reference'));
  if (!g) return c.json({ error: 'not_found' }, 404);
  return c.json(g);
});

/** A yield figure answers for plant operations, quality and the claims manager only. */
operations.get('/lots/:reference/yield', async (c) => {
  const auth = await requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager', 'auditor');
  if (auth.error) return auth.error;
  const y = await lotYield(c.req.param('reference'));
  if (!y) return c.json({ error: 'not_found' }, 404);
  return c.json(y);
});

operations.get('/outputs/:reference/share', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const s = await byproductShare(c.req.param('reference'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  return c.json(s);
});

/** A disposition is refused for the person who entered a test result on that lot. */
operations.post('/lots/:reference/disposition', async (c) => {
  const auth = await requireSession(c);
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/lots/${reference}/disposition`, body, async () => {
    const l = await one('SELECT * FROM lot WHERE reference = $1', [reference]);
    if (!l) return ok({ error: 'not_found' }, 404);
    const states = ['pending', 'released', 'quarantined', 'rejected'];
    if (!states.includes(body.disposition)) return ok({ error: 'unknown_disposition', accepted: states }, 400);

    if (!hasRole(auth.session, 'quality_manager')) {
      await append(null, {
        act: 'disposition_refused', person: auth.session.email, site: l.site,
        object_kind: 'lot', object_ref: reference, outcome: 'refused',
        content: { reason: 'not_a_quality_manager', roles: auth.session.roles }
      });
      return ok({
        error: 'not_permitted', separation: 'dispositioner_is_quality_manager',
        rule: 'Only a quality manager sets a lot disposition.'
      }, 403);
    }
    const entered = await q(
      'SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2', [reference, auth.session.email]
    );
    if (entered.length) {
      await append(null, {
        act: 'disposition_refused', person: auth.session.email, site: l.site,
        object_kind: 'lot', object_ref: reference, outcome: 'refused',
        content: { reason: 'analyst_not_dispositioner', test_result: entered[0].reference }
      });
      return ok({
        error: 'separation_broken', separation: 'analyst_not_dispositioner',
        blocking_reference: entered[0].reference,
        rule: 'Whoever entered a test result does not disposition that lot.'
      }, 409);
    }
    const openDevs = await q(`SELECT reference FROM deviation WHERE state = 'open' AND lots ? $1`, [reference]);
    if (openDevs.length) {
      await append(null, {
        act: 'disposition_refused', person: auth.session.email, site: l.site,
        object_kind: 'lot', object_ref: reference, outcome: 'refused',
        content: { reason: 'open_deviation', deviation: openDevs[0].reference }
      });
      return ok({
        error: 'open_deviation', blocking_reference: openDevs[0].reference,
        rule: 'A disposition is refused while a deviation touching the lot is open.'
      }, 409);
    }
    await q(
      `UPDATE lot SET disposition = $2, dispositioned_by = $3, dispositioned_at = now() WHERE reference = $1`,
      [reference, body.disposition, auth.session.email]
    );
    await append(null, {
      act: 'lot_dispositioned', person: auth.session.email, site: l.site,
      object_kind: 'lot', object_ref: reference, content: { disposition: body.disposition }
    });
    return ok({ reference, disposition: body.disposition, dispositioned_by: auth.session.email }, 201);
  });
});

/** Blending: the claim is computed by mass and takes the weaker of the two claim types. */
const CLAIM_STRENGTH = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };

operations.post('/lots/:reference/blend', async (c) => {
  const auth = await requireRole(c, 'plant_operator', 'quality_manager', 'claims_manager');
  if (auth.error) return auth.error;
  const a = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/lots/${a}/blend`, body, async () => {
    const b = body.with || body.lot;
    if (!b) return ok({ error: 'missing_field', field: 'with' }, 400);
    const la = await one('SELECT * FROM lot WHERE reference = $1', [a]);
    const lb = await one('SELECT * FROM lot WHERE reference = $1', [b]);
    if (!la || !lb) return ok({ error: 'not_found' }, 404);
    const ca = await lotClaim(a);
    const cb = await lotClaim(b);
    const mass = la.mass_g + lb.mass_g;
    // (mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored
    const content_bp = Math.floor((la.mass_g * ca.content_bp + lb.mass_g * cb.content_bp) / mass);
    const claim_type = CLAIM_STRENGTH[la.claim_type] <= CLAIM_STRENGTH[lb.claim_type] ? la.claim_type : lb.claim_type;
    const sites = [...new Set([la.site, lb.site])];
    const fa = await one(`SELECT provisional FROM conversion_factor WHERE site = $1 ORDER BY published_on DESC LIMIT 1`, [la.site]);
    const fb = await one(`SELECT provisional FROM conversion_factor WHERE site = $1 ORDER BY published_on DESC LIMIT 1`, [lb.site]);
    const provisional_factor = !!(fa?.provisional || fb?.provisional);
    const certStates = await q('SELECT reference, certification_state FROM site WHERE reference = ANY($1)', [sites]);
    const certification_scope = certStates.some((s) => s.certification_state !== 'certified') ? 'not_certified' : 'certified';

    const n = await one(`SELECT count(*)::int AS n FROM lot`);
    const reference = body.reference || `LOT-N6-${String(n.n + 1).padStart(4, '0')}`;
    await q(
      `INSERT INTO lot (reference, grade, site, mass_g, disposition, claim_type, specification_version,
        blended_from, sites, produced_on)
       VALUES ($1,$2,$3,$4,'pending',$5,3,$6,$7,CURRENT_DATE)`,
      [reference, la.grade, la.site, mass, claim_type,
        JSON.stringify([{ lot: a, mass_g: la.mass_g, content_bp: ca.content_bp },
          { lot: b, mass_g: lb.mass_g, content_bp: cb.content_bp }]),
        JSON.stringify(sites)]
    );
    await append(null, {
      act: 'lots_blended', person: auth.session.email, object_kind: 'lot', object_ref: reference,
      content: { from: [a, b], mass_g: mass, content_bp, claim_type, sites }
    });
    return ok({
      reference, mass_g: mass, content_bp, claim_type, sites,
      provisional_factor, certification_scope,
      components: [
        { lot: a, mass_g: la.mass_g, content_bp: ca.content_bp, claim_type: la.claim_type, site: la.site },
        { lot: b, mass_g: lb.mass_g, content_bp: cb.content_bp, claim_type: lb.claim_type, site: lb.site }
      ],
      derivation: {
        content_bp: `(${la.mass_g} * ${ca.content_bp} + ${lb.mass_g} * ${cb.content_bp}) / ${mass}, floored`,
        claim_type: 'the weaker of the two claim types',
        certification_scope: 'the weaker certification scope of the named sites'
      }
    }, 201);
  });
});

/* --------------------------------------------------------- test results */

operations.get('/test-results', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM test_result ORDER BY entered_at ASC');
  return c.json(rows.map((t) => ({
    reference: t.reference, subject_kind: t.subject_kind, subject_ref: t.subject_ref,
    property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
    value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
    method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
    entered_by: t.entered_by, entered_at: t.entered_at
  })));
});

operations.post('/test-results', async (c) => {
  const auth = await requireRole(c, 'lab_analyst', 'quality_manager');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/test-results', body, async () => {
    // A result with no method is refused.
    if (!body.method) {
      return ok({ error: 'method_required', rule: 'A result with no method is refused.' }, 400);
    }
    for (const f of ['property', 'value', 'unit']) {
      if (body[f] === undefined || body[f] === null) return ok({ error: 'missing_field', field: f }, 400);
    }
    const subjectRef = body.lot || body.batch || body.subject_ref;
    if (!subjectRef) return ok({ error: 'missing_field', field: 'lot or batch' }, 400);
    const subjectKind = body.lot ? 'lot' : body.batch ? 'batch' : (body.subject_kind || 'lot');

    // A result produced by a method other than the one the specification names is recorded
    // and answers method_mismatch true with usable_for_release false.
    let method_mismatch = false;
    const spec = await one(`SELECT properties FROM specification WHERE superseded = false ORDER BY version DESC LIMIT 1`);
    if (spec) {
      const row = (spec.properties || []).find((p) => p.property === body.property);
      if (row && row.method !== body.method) method_mismatch = true;
    }
    const n = await one(`SELECT count(*)::int AS n FROM test_result`);
    const reference = `TR-${String(n.n + 1).padStart(4, '0')}`;
    await q(
      `INSERT INTO test_result (reference, subject_kind, subject_ref, property, method, instrument, analyst,
        value, unit, uncertainty_bp, method_mismatch, usable_for_release, entered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [reference, subjectKind, subjectRef, body.property, body.method, body.instrument || null,
        body.analyst || auth.session.email, String(body.value), body.unit,
        body.uncertainty_bp ?? null, method_mismatch, !method_mismatch, auth.session.email]
    );
    await append(null, {
      act: 'test_result_entered', person: auth.session.email, object_kind: 'test_result', object_ref: reference,
      content: { subject: subjectRef, property: body.property, method: body.method, method_mismatch }
    });
    return ok({
      reference, subject_kind: subjectKind, subject_ref: subjectRef, property: body.property,
      method: body.method, value: String(body.value), unit: body.unit,
      uncertainty_bp: body.uncertainty_bp ?? null,
      method_mismatch, usable_for_release: !method_mismatch,
      note: method_mismatch
        ? 'This result was produced by a method the specification does not name. It is kept as evidence and never reaches a disposition.'
        : null
    }, 201);
  });
});

/* ------------------------------------------------------------ deviations */

operations.get('/deviations', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM deviation ORDER BY raised_at ASC');
  return c.json(rows.map((d) => ({
    reference: d.reference, state: d.state, runs: d.runs, lots: d.lots,
    description: d.description, outcome: d.outcome, raised_by: d.raised_by,
    raised_at: d.raised_at, closed_by: d.closed_by, closed_at: d.closed_at
  })));
});

operations.post('/deviations', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/deviations', body, async () => {
    if (!body.description) return ok({ error: 'missing_field', field: 'description' }, 400);
    const n = await one(`SELECT count(*)::int AS n FROM deviation`);
    const reference = `DEV-${String(n.n + 1).padStart(4, '0')}`;
    await q(
      `INSERT INTO deviation (reference, state, runs, lots, description, raised_by)
       VALUES ($1,'open',$2,$3,$4,$5)`,
      [reference, JSON.stringify(body.runs || []), JSON.stringify(body.lots || []),
        body.description, auth.session.email]
    );
    await append(null, {
      act: 'deviation_raised', person: auth.session.email, object_kind: 'deviation', object_ref: reference,
      content: { runs: body.runs || [], lots: body.lots || [], description: body.description }
    });
    return ok({ reference, state: 'open', runs: body.runs || [], lots: body.lots || [] }, 201);
  });
});

operations.post('/deviations/:reference/close', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/deviations/${reference}/close`, body, async () => {
    const d = await one('SELECT * FROM deviation WHERE reference = $1', [reference]);
    if (!d) return ok({ error: 'not_found' }, 404);
    if (d.state === 'closed') return ok({ error: 'already_closed', reference }, 409);
    const outcomes = ['root_cause_found', 'cause_not_established'];
    if (!outcomes.includes(body.outcome)) {
      return ok({ error: 'unknown_outcome', accepted: outcomes, rule: 'Both are honest outcomes and neither is hidden.' }, 400);
    }
    await q(
      `UPDATE deviation SET state = 'closed', outcome = $2, closed_by = $3, closed_at = now() WHERE reference = $1`,
      [reference, body.outcome, auth.session.email]
    );
    await append(null, {
      act: 'deviation_closed', person: auth.session.email, object_kind: 'deviation', object_ref: reference,
      content: { outcome: body.outcome }
    });
    return ok({ reference, state: 'closed', outcome: body.outcome }, 201);
  });
});

/* ------------------------------------------------------------- overrides */

operations.get('/overrides', async (c) => {
  const bad = refusePagination(c); if (bad) return bad;
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM separation_override ORDER BY created_at ASC');
  return c.json(rows.map((o) => ({
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
    reviewed_at: o.reviewed_at, created_at: o.created_at,
    statement: `Separation overridden by ${o.authorised_by} on ${iso(o.created_at)}. This cannot be removed.`
  })));
});

const SEPARATIONS = [
  'analyst_not_dispositioner',
  'method_publisher_not_period_closer',
  'signer_not_data_enterer',
  'booker_not_collector_approver'
];

operations.post('/overrides', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'claims_manager', 'plant_operator');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/overrides', body, async () => {
    if (!SEPARATIONS.includes(body.separation)) {
      return ok({ error: 'unknown_separation', accepted: SEPARATIONS }, 400);
    }
    if (!body.reason || String(body.reason).length < 40) {
      return ok({
        error: 'reason_too_short', minimum_characters: 40, given: String(body.reason || '').length,
        rule: 'An override names the separation broken and a reason of at least forty characters.'
      }, 400);
    }
    if (!body.lot || !body.authorised_by) {
      return ok({ error: 'missing_field', required: ['lot', 'authorised_by'] }, 400);
    }
    const n = await one(`SELECT count(*)::int AS n FROM separation_override`);
    const reference = `OVR-${String(n.n + 1).padStart(4, '0')}`;
    await q(
      `INSERT INTO separation_override (reference, separation, reason, lot, authorised_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [reference, body.separation, body.reason, body.lot, body.authorised_by, auth.session.email]
    );
    await append(null, {
      act: 'override_recorded', person: auth.session.email, object_kind: 'override', object_ref: reference,
      content: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by, reason: body.reason }
    });
    return ok({
      reference, separation: body.separation, reason: body.reason, lot: body.lot,
      authorised_by: body.authorised_by, reviewed: false,
      note: 'This override is permanent, shows on the lot for its life and blocks signing until a second person reviews it.'
    }, 201);
  });
});

/** A review is refused for the authoriser and for anybody who is neither quality nor claims. */
operations.post('/overrides/:reference/review', async (c) => {
  const auth = await requireSession(c);
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/overrides/${reference}/review`, body, async () => {
    const o = await one('SELECT * FROM separation_override WHERE reference = $1', [reference]);
    if (!o) return ok({ error: 'not_found' }, 404);
    if (!hasRole(auth.session, 'quality_manager', 'claims_manager')) {
      await append(null, {
        act: 'override_review_refused', person: auth.session.email, object_kind: 'override',
        object_ref: reference, outcome: 'refused', content: { reason: 'role' }
      });
      return ok({
        error: 'not_permitted',
        rule: 'A review is refused for anybody who is neither a quality manager nor a claims manager.'
      }, 403);
    }
    if (o.authorised_by === auth.session.email) {
      await append(null, {
        act: 'override_review_refused', person: auth.session.email, object_kind: 'override',
        object_ref: reference, outcome: 'refused', content: { reason: 'authoriser_cannot_review' }
      });
      return ok({
        error: 'authoriser_cannot_review', authorised_by: o.authorised_by,
        rule: 'A review is refused for the authoriser. A second person reviews it.'
      }, 409);
    }
    if (o.reviewed) return ok({ error: 'already_reviewed', reference, reviewed_by: o.reviewed_by }, 409);
    await q(
      `UPDATE separation_override SET reviewed = true, reviewed_by = $2, reviewed_at = now() WHERE reference = $1`,
      [reference, auth.session.email]
    );
    await append(null, {
      act: 'override_reviewed', person: auth.session.email, object_kind: 'override', object_ref: reference,
      content: { reviewed_by: auth.session.email }
    });
    return ok({
      reference, reviewed: true, reviewed_by: auth.session.email, lot: o.lot,
      note: 'A review removes nothing. The override stays on the lot for its life.'
    }, 201);
  });
});

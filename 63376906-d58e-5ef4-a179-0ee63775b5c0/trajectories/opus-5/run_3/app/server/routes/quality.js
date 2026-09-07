import { Hono } from 'hono';
import { rq, rq1, tx } from '../db/pool.js';
import { appendEntry } from '../lib/record.js';
import {
  idempotent, refuse, requireRole, requireSession, refuseAuditorWrite,
  refuseComputedInputs, refusePaging, recordRefusal
} from '../lib/http.js';
import { requireNonNegativeInteger } from '../engine/units.js';
import { lotCarbon, byproductShare, energyFor } from '../engine/carbon.js';
import { nextRef } from './operations.js';

export const quality = new Hono();

// ------------------------------------------------------------ test results

quality.get('/test-results', async (c) => {
  refusePaging(c);
  const rows = await rq('SELECT * FROM test_result ORDER BY reference');
  return c.json(rows.map((t) => ({
    reference: t.reference, subject_kind: t.subject_kind, subject_ref: t.subject_ref,
    property: t.property, method: t.method, instrument: t.instrument, analyst: t.analyst,
    value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
    method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release,
    entered_by: t.entered_by, effective_on: String(t.effective_on).slice(0, 10)
  })));
});

quality.post('/test-results', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'lab_analyst', 'quality_manager');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);

  // A result with no method is refused.
  if (!body.method) {
    throw refuse(400, 'method_required', 'A test result is recorded against a named method. A result with no method is refused.');
  }
  for (const f of ['subject_ref', 'property', 'value', 'unit', 'analyst']) {
    if (!body[f]) throw refuse(400, 'missing_field', `A test result carries ${f}.`, { field: f });
  }

  const result = await idempotent(c, 'POST /api/test-results', body, async () => tx(async (client) => {
    const subjectKind = body.subject_kind
      || ((await client.query('SELECT 1 FROM lot WHERE reference = $1', [body.subject_ref])).rows.length ? 'lot' : 'batch');

    // A result produced by a method other than the one the specification names
    // is recorded and answers method_mismatch true with usable_for_release
    // false, so it is kept as evidence without ever reaching a disposition.
    let methodMismatch = false;
    if (subjectKind === 'lot') {
      const lot = await client.query('SELECT specification, specification_version FROM lot WHERE reference = $1', [body.subject_ref]);
      if (lot.rows.length) {
        const spec = await client.query('SELECT properties FROM specification WHERE grade = $1 AND version = $2',
          [lot.rows[0].specification, lot.rows[0].specification_version]);
        const named = (spec.rows[0]?.properties || []).find((p) => p.property === body.property);
        if (named && named.method !== body.method) methodMismatch = true;
      }
    }

    const ref = await nextRef(client, 'test_result', 'reference', 'TST-');
    await client.query(
      `INSERT INTO test_result (reference,subject_kind,subject_ref,property,method,instrument,analyst,value,unit,
         uncertainty_bp,method_mismatch,usable_for_release,entered_by,event_at,effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14)`,
      [ref, subjectKind, body.subject_ref, body.property, body.method, body.instrument || null,
        body.analyst, String(body.value), body.unit,
        body.uncertainty_bp != null ? requireNonNegativeInteger(body.uncertainty_bp, 'uncertainty_bp') : null,
        methodMismatch, !methodMismatch, session.email,
        body.effective_on || new Date().toISOString().slice(0, 10)]
    );
    await appendEntry(client, {
      act: 'test_result_entered', person: session.email, object_kind: 'test_result', object_ref: ref,
      content: { subject: body.subject_ref, property: body.property, method: body.method,
        method_mismatch: methodMismatch, entered_by: session.email }
    });
    return {
      status: 201,
      body: {
        reference: ref, subject_kind: subjectKind, subject_ref: body.subject_ref,
        property: body.property, method: body.method, value: String(body.value), unit: body.unit,
        method_mismatch: methodMismatch, usable_for_release: !methodMismatch,
        entered_by: session.email,
        note: methodMismatch
          ? 'This result was produced by a method other than the one the specification names. It is kept as evidence and never reaches a disposition.'
          : null
      }
    };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------ dispositions

quality.post('/lots/:reference/disposition', async (c) => {
  refuseAuditorWrite(c);
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  const session = requireSession(c);

  if (!['pending', 'released', 'quarantined', 'rejected'].includes(body.disposition)) {
    throw refuse(400, 'unknown_disposition', 'A disposition is one of pending, released, quarantined or rejected.');
  }

  // Only a quality manager sets a lot disposition. A plant operator and a
  // laboratory analyst may not, on any route.
  if (!session.roles.includes('quality_manager')) {
    await recordRefusal({
      act: 'disposition_refused', person: session.email, object_kind: 'lot', object_ref: ref,
      content: { reason: 'not a quality manager', roles: session.roles }
    });
    throw refuse(403, 'role_required', 'Only a quality manager sets a lot disposition.', {
      required_roles: ['quality_manager'], held_roles: session.roles
    });
  }

  const result = await idempotent(c, `POST /api/lots/${ref}/disposition`, body, async () => tx(async (client) => {
    const lot = await client.query('SELECT * FROM lot WHERE reference = $1 FOR UPDATE', [ref]);
    if (!lot.rows.length) throw refuse(404, 'no_such_lot', `No lot is recorded at ${ref}.`);

    // The first separation: whoever entered a test result does not disposition
    // that lot.
    const own = await client.query(
      'SELECT reference FROM test_result WHERE subject_ref = $1 AND entered_by = $2', [ref, session.email]
    );
    if (own.rows.length) {
      await recordRefusal({
        act: 'disposition_refused', person: session.email, object_kind: 'lot', object_ref: ref, outcome: 'refused',
        content: { separation: 'analyst_not_dispositioner', test_results: own.rows.map((r) => r.reference) }
      });
      throw refuse(403, 'separation_analyst_not_dispositioner',
        `Whoever entered a test result does not disposition that lot. ${session.email} entered ${own.rows.map((r) => r.reference).join(', ')}.`,
        { separation: 'analyst_not_dispositioner', blocking_reference: own.rows.map((r) => r.reference).join(', ') });
    }

    // A deviation travels with every lot it touches and blocks its disposition.
    const openDev = await client.query(
      `SELECT reference FROM deviation WHERE state = 'open'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(lots) x WHERE x = $1)`, [ref]
    );
    if (openDev.rows.length) {
      await recordRefusal({
        act: 'disposition_refused', person: session.email, object_kind: 'lot', object_ref: ref, outcome: 'refused',
        content: { open_deviations: openDev.rows.map((r) => r.reference) }
      });
      throw refuse(409, 'open_deviation',
        `Deviation ${openDev.rows.map((r) => r.reference).join(', ')} touching ${ref} is open.`,
        { blocking_reference: openDev.rows.map((r) => r.reference).join(', ') });
    }

    await client.query('UPDATE lot SET disposition = $1 WHERE reference = $2', [body.disposition, ref]);
    await client.query(
      `INSERT INTO disposition_act (lot,disposition,decided_by,reason) VALUES ($1,$2,$3,$4)`,
      [ref, body.disposition, session.email, body.reason || null]
    );
    await appendEntry(client, {
      act: 'lot_dispositioned', person: session.email, site: lot.rows[0].site,
      object_kind: 'lot', object_ref: ref,
      content: { disposition: body.disposition, reason: body.reason || null }
    });
    return { status: 201, body: { reference: ref, disposition: body.disposition, decided_by: session.email } };
  }));
  return c.json(result.body, result.status);
});

// -------------------------------------------------------------- deviations

quality.get('/deviations', async (c) => {
  refusePaging(c);
  const rows = await rq('SELECT * FROM deviation ORDER BY reference');
  return c.json(rows.map((d) => ({
    reference: d.reference, state: d.state, title: d.title, detail: d.detail,
    runs: d.runs, lots: d.lots, outcome: d.outcome, raised_by: d.raised_by,
    closed_by: d.closed_by, closed_at: d.closed_at,
    effective_on: String(d.effective_on).slice(0, 10)
  })));
});

quality.get('/deviations/:reference', async (c) => {
  const d = await rq1('SELECT * FROM deviation WHERE reference = $1', [c.req.param('reference')]);
  if (!d) throw refuse(404, 'no_such_deviation', `No deviation is recorded at ${c.req.param('reference')}.`);
  return c.json({
    reference: d.reference, state: d.state, title: d.title, detail: d.detail,
    runs: d.runs, lots: d.lots, outcome: d.outcome, raised_by: d.raised_by,
    closed_by: d.closed_by, closed_at: d.closed_at, effective_on: String(d.effective_on).slice(0, 10)
  });
});

quality.post('/deviations', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.title) throw refuse(400, 'missing_field', 'A deviation carries a title.');

  const result = await idempotent(c, 'POST /api/deviations', body, async () => tx(async (client) => {
    const ref = await nextRef(client, 'deviation', 'reference', 'DEV-');
    await client.query(
      `INSERT INTO deviation (reference,state,title,detail,runs,lots,raised_by,event_at,effective_on)
       VALUES ($1,'open',$2,$3,$4,$5,$6,now(),$7)`,
      [ref, body.title, body.detail || null, JSON.stringify(body.runs || []), JSON.stringify(body.lots || []),
        session.email, body.effective_on || new Date().toISOString().slice(0, 10)]
    );
    await appendEntry(client, {
      act: 'deviation_raised', person: session.email, object_kind: 'deviation', object_ref: ref,
      content: { title: body.title, runs: body.runs || [], lots: body.lots || [] }
    });
    return { status: 201, body: { reference: ref, state: 'open', title: body.title, runs: body.runs || [], lots: body.lots || [] } };
  }));
  return c.json(result.body, result.status);
});

quality.post('/deviations/:reference/close', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  // Both outcomes are honest and neither is hidden.
  if (!['root_cause_found', 'cause_not_established'].includes(body.outcome)) {
    throw refuse(400, 'unknown_outcome',
      'A deviation closes with root_cause_found or cause_not_established. Both are honest outcomes and neither is hidden.');
  }

  const result = await idempotent(c, `POST /api/deviations/${ref}/close`, body, async () => tx(async (client) => {
    const d = await client.query('SELECT * FROM deviation WHERE reference = $1 FOR UPDATE', [ref]);
    if (!d.rows.length) throw refuse(404, 'no_such_deviation', `No deviation is recorded at ${ref}.`);
    if (d.rows[0].state === 'closed') {
      throw refuse(409, 'deviation_closed', `${ref} was already closed on ${d.rows[0].closed_at}.`);
    }
    await client.query(
      `UPDATE deviation SET state = 'closed', outcome = $1, closed_by = $2, closed_at = now() WHERE reference = $3`,
      [body.outcome, session.email, ref]
    );
    await appendEntry(client, {
      act: 'deviation_closed', person: session.email, object_kind: 'deviation', object_ref: ref,
      content: { outcome: body.outcome, reason: body.reason || null }
    });
    return { status: 201, body: { reference: ref, state: 'closed', outcome: body.outcome, closed_by: session.email } };
  }));
  return c.json(result.body, result.status);
});

// --------------------------------------------------------------- overrides

quality.get('/overrides', async (c) => {
  refusePaging(c);
  const rows = await rq('SELECT * FROM separation_override ORDER BY reference');
  return c.json(rows.map((o) => ({
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
    reviewed_at: o.reviewed_at, effective_on: String(o.effective_on).slice(0, 10),
    permanent: true,
    statement: `Separation overridden by ${o.authorised_by} on ${String(o.effective_on).slice(0, 10)}. This cannot be removed.`
  })));
});

quality.get('/overrides/:reference', async (c) => {
  const o = await rq1('SELECT * FROM separation_override WHERE reference = $1', [c.req.param('reference')]);
  if (!o) throw refuse(404, 'no_such_override', `No override is recorded at ${c.req.param('reference')}.`);
  return c.json({
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, reviewed: o.reviewed, reviewed_by: o.reviewed_by,
    reviewed_at: o.reviewed_at, effective_on: String(o.effective_on).slice(0, 10), permanent: true,
    statement: `Separation overridden by ${o.authorised_by} on ${String(o.effective_on).slice(0, 10)}. This cannot be removed.`
  });
});

const SEPARATIONS = [
  'analyst_not_dispositioner', 'publisher_not_closer', 'signer_not_author', 'bookkeeper_not_approver'
];

quality.post('/overrides', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!SEPARATIONS.includes(body.separation)) {
    throw refuse(400, 'unknown_separation', `An override names one of ${SEPARATIONS.join(', ')}.`);
  }
  // A reason of at least forty characters. An override is permanent, so the
  // reason is the only thing a later reader has.
  if (!body.reason || String(body.reason).trim().length < 40) {
    throw refuse(400, 'reason_too_short',
      'An override carries a reason of at least forty characters, because it is permanent and shows on the lot for its life.',
      { minimum_characters: 40, received_characters: String(body.reason || '').trim().length });
  }
  if (!body.lot) throw refuse(400, 'missing_field', 'An override names the lot it stands on.');
  if (!body.authorised_by) throw refuse(400, 'missing_field', 'An override names its authoriser.');

  const result = await idempotent(c, 'POST /api/overrides', body, async () => tx(async (client) => {
    const lot = await client.query('SELECT 1 FROM lot WHERE reference = $1', [body.lot]);
    if (!lot.rows.length) throw refuse(404, 'no_such_lot', `No lot is recorded at ${body.lot}.`);
    const ref = await nextRef(client, 'separation_override', 'reference', 'OVR-');
    await client.query(
      `INSERT INTO separation_override (reference,separation,reason,lot,authorised_by,reviewed,recorded_by,event_at,effective_on)
       VALUES ($1,$2,$3,$4,$5,false,$6,now(),$7)`,
      [ref, body.separation, String(body.reason).trim(), body.lot, body.authorised_by, session.email,
        body.effective_on || new Date().toISOString().slice(0, 10)]
    );
    await appendEntry(client, {
      act: 'override_recorded', person: session.email, object_kind: 'override', object_ref: ref,
      content: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by, reason: String(body.reason).trim() }
    });
    return {
      status: 201,
      body: {
        reference: ref, separation: body.separation, reason: String(body.reason).trim(), lot: body.lot,
        authorised_by: body.authorised_by, reviewed: false, permanent: true,
        note: 'This override is permanent, shows on the lot for its life, is counted on the balance screen, and blocks signing until a second person reviews it.'
      }
    };
  }));
  return c.json(result.body, result.status);
});

/** A review is refused for the authoriser and for anybody who is neither a
 *  quality manager nor a claims manager. A review sets reviewed true and
 *  removes nothing. */
quality.post('/overrides/:reference/review', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));

  const result = await idempotent(c, `POST /api/overrides/${ref}/review`, body, async () => tx(async (client) => {
    const o = await client.query('SELECT * FROM separation_override WHERE reference = $1 FOR UPDATE', [ref]);
    if (!o.rows.length) throw refuse(404, 'no_such_override', `No override is recorded at ${ref}.`);
    if (o.rows[0].authorised_by === session.email) {
      await appendEntry(client, {
        act: 'override_review_refused', person: session.email, object_kind: 'override', object_ref: ref,
        outcome: 'refused', content: { reason: 'the authoriser cannot review their own override' }
      });
      throw refuse(403, 'authoriser_cannot_review',
        `${session.email} authorised ${ref}. A second person reviews it.`,
        { authorised_by: o.rows[0].authorised_by });
    }
    if (o.rows[0].reviewed) {
      return { status: 200, body: { reference: ref, reviewed: true, reviewed_by: o.rows[0].reviewed_by, already: true } };
    }
    await client.query(
      'UPDATE separation_override SET reviewed = true, reviewed_by = $1, reviewed_at = now() WHERE reference = $2',
      [session.email, ref]
    );
    await appendEntry(client, {
      act: 'override_reviewed', person: session.email, object_kind: 'override', object_ref: ref,
      content: { reviewed_by: session.email, note: body.note || null }
    });
    return {
      status: 201,
      body: {
        reference: ref, reviewed: true, reviewed_by: session.email,
        separation: o.rows[0].separation, lot: o.rows[0].lot,
        note: 'A review sets reviewed true and removes nothing. The override remains on the lot for its life.'
      }
    };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------------ carbon

quality.get('/carbon-methods', async (c) => {
  const methods = await rq('SELECT * FROM carbon_method ORDER BY id');
  const out = [];
  for (const m of methods) {
    const versions = await rq(
      'SELECT * FROM carbon_method_version WHERE method = $1 ORDER BY version', [m.id]
    );
    out.push({
      id: m.id, name: m.name, standard: m.standard, functional_unit: m.functional_unit,
      primary_threshold_bp: m.primary_threshold_bp,
      versions: versions.map((v) => ({
        version: v.version, boundary: v.boundary, allocation_basis: v.allocation_basis,
        reviewer: v.reviewer, published_on: String(v.published_on).slice(0, 10),
        published_by: v.published_by, data_quality_rules: v.data_quality_rules,
        emission_factors: v.emission_factors, superseded_by: v.superseded_by
      }))
    });
  }
  return c.json(out);
});

quality.get('/carbon-methods/:id/versions/:version', async (c) => {
  const m = await rq1('SELECT * FROM carbon_method WHERE id = $1', [c.req.param('id')]);
  const v = await rq1('SELECT * FROM carbon_method_version WHERE method = $1 AND version = $2',
    [c.req.param('id'), Number(c.req.param('version'))]);
  if (!m || !v) throw refuse(404, 'no_such_method_version', 'No such carbon method version.');
  return c.json({
    method: m.id, name: m.name, version: v.version,
    standard: m.standard, functional_unit: m.functional_unit,
    boundary: v.boundary, allocation_basis: v.allocation_basis, reviewer: v.reviewer,
    published_on: String(v.published_on).slice(0, 10), published_by: v.published_by,
    data_quality_rules: v.data_quality_rules,
    emission_factors: v.emission_factors,
    primary_threshold_bp: m.primary_threshold_bp,
    superseded_by: v.superseded_by,
    immutable: true,
    note: 'A method version is immutable once a figure has been computed against it. A new version supersedes rather than overwrites.'
  });
});

/** Publishing a version is refused for anybody but a quality manager, and the
 *  claims manager may not alter a carbon method at all. */
quality.post('/carbon-methods/:id/versions', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  for (const f of ['boundary', 'allocation_basis', 'reviewer']) {
    if (!body[f]) throw refuse(400, 'missing_field', `A method version carries ${f}.`, { field: f });
  }

  const result = await idempotent(c, `POST /api/carbon-methods/${id}/versions`, body, async () => tx(async (client) => {
    const prior = await client.query(
      'SELECT version FROM carbon_method_version WHERE method = $1 ORDER BY version DESC LIMIT 1', [id]
    );
    const version = (prior.rows[0]?.version || 0) + 1;
    await client.query(
      `INSERT INTO carbon_method_version (method,version,boundary,allocation_basis,reviewer,published_on,published_by,
         data_quality_rules,emission_factors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, version, body.boundary, body.allocation_basis, body.reviewer,
        body.published_on || new Date().toISOString().slice(0, 10), session.email,
        JSON.stringify(body.data_quality_rules || []), JSON.stringify(body.emission_factors || [])]
    );
    if (prior.rows.length) {
      await client.query(
        'UPDATE carbon_method_version SET superseded_by = $1 WHERE method = $2 AND version = $3',
        [version, id, prior.rows[0].version]
      );
    }
    await appendEntry(client, {
      act: 'method_version_published', person: session.email, object_kind: 'carbon_method', object_ref: id,
      content: { version, supersedes: prior.rows[0]?.version || null, reviewer: body.reviewer }
    });
    return {
      status: 201,
      body: {
        reference: `${id} v${version}`, method: id, version, boundary: body.boundary,
        allocation_basis: body.allocation_basis, reviewer: body.reviewer, published_by: session.email,
        supersedes: prior.rows[0]?.version || null,
        note: 'A computation already in flight completes under the version it started with and records that version. This version applies from the next computation.'
      }
    };
  }));
  return c.json(result.body, result.status);
});

quality.get('/lots/:reference/carbon', async (c) => {
  const fig = await lotCarbon(c.req.param('reference'));
  if (!fig) throw refuse(404, 'no_carbon_figure', `No carbon figure is recorded for ${c.req.param('reference')}.`);
  return c.json(fig);
});

quality.get('/outputs/:reference/share', async (c) => {
  const s = await byproductShare(c.req.param('reference'));
  if (!s) throw refuse(404, 'no_such_output', `No output is recorded at ${c.req.param('reference')}.`);
  return c.json(s);
});

quality.get('/energy-instruments', async (c) => {
  const rows = await rq('SELECT * FROM energy_instrument ORDER BY reference');
  return c.json(rows.map((i) => ({
    reference: i.reference, quantity_kwh: Number(i.quantity_kwh), vintage: i.vintage,
    region: i.region, state: i.state, applied_to: i.applied_to, applied_at: i.applied_at
  })));
});

quality.get('/balance-periods/:id/energy', async (c) => {
  const e = await energyFor(c.req.param('id'));
  return c.json(e);
});

quality.post('/energy-instruments/:reference/retire', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager', 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  if (!body.balance_period) throw refuse(400, 'missing_field', 'An instrument is applied against a named period.');

  const result = await idempotent(c, `POST /api/energy-instruments/${ref}/retire`, body, async () => tx(async (client) => {
    const i = await client.query('SELECT * FROM energy_instrument WHERE reference = $1 FOR UPDATE', [ref]);
    if (!i.rows.length) throw refuse(404, 'no_such_instrument', `No energy instrument is recorded at ${ref}.`);
    const inst = i.rows[0];
    const p = await client.query('SELECT * FROM balance_period WHERE id = $1', [body.balance_period]);
    if (!p.rows.length) throw refuse(404, 'no_such_period', `No balance period is recorded at ${body.balance_period}.`);
    const period = p.rows[0];

    const refusals = [];
    // Refused when the instrument is not retired.
    if (inst.state !== 'retired') {
      refusals.push(`${ref} is ${inst.state} rather than retired.`);
    }
    // Refused when its vintage does not match the consumption.
    const periodYear = Number(String(period.period_from).slice(0, 4));
    if (inst.vintage !== periodYear) {
      refusals.push(`${ref} carries vintage ${inst.vintage} and the consumption falls in ${periodYear}.`);
    }
    if (body.region && inst.region !== body.region) {
      refusals.push(`${ref} is issued for ${inst.region} and the consumption is in ${body.region}.`);
    }
    // Refused when the retired quantity would exceed the metered consumption.
    const already = await client.query(
      'SELECT COALESCE(SUM(quantity_kwh),0) AS k FROM energy_instrument WHERE applied_to = $1', [body.balance_period]
    );
    const totalAfter = Number(already.rows[0].k) + Number(inst.quantity_kwh);
    if (totalAfter > Number(period.metered_kwh)) {
      refusals.push(`Retiring ${inst.quantity_kwh} kWh would take the retired total to ${totalAfter} kWh against a metered consumption of ${period.metered_kwh} kWh.`);
    }

    if (refusals.length) {
      await appendEntry(client, {
        act: 'instrument_retirement_refused', person: session.email, object_kind: 'energy_instrument',
        object_ref: ref, outcome: 'refused', content: { balance_period: body.balance_period, refusals }
      });
      throw refuse(409, 'instrument_refused', refusals.join(' '), { refusals, instrument: ref });
    }

    await client.query(
      'UPDATE energy_instrument SET applied_to = $1, applied_at = now() WHERE reference = $2',
      [body.balance_period, ref]
    );
    await appendEntry(client, {
      act: 'instrument_retired', person: session.email, object_kind: 'energy_instrument', object_ref: ref,
      content: { balance_period: body.balance_period, quantity_kwh: Number(inst.quantity_kwh) }
    });
    const e = await energyFor(body.balance_period);
    return { status: 201, body: { reference: ref, balance_period: body.balance_period, ...e } };
  }));
  return c.json(result.body, result.status);
});

/** A recomputation produces a new figure version alongside the old, records a
 *  person, a date and a reason, and enumerates every certificate carrying the
 *  superseded figure. A figure is never silently recomputed. */
quality.post('/carbon-figures/:id/recompute', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.reason) throw refuse(400, 'missing_field', 'A recomputation records a person, a date and a reason.');

  const result = await idempotent(c, `POST /api/carbon-figures/${id}/recompute`, body, async () => tx(async (client) => {
    const f = await client.query('SELECT * FROM carbon_figure WHERE id = $1 FOR UPDATE', [id]);
    if (!f.rows.length) throw refuse(404, 'no_such_figure', `No carbon figure is recorded at ${id}.`);
    const fig = f.rows[0];

    const lot = await client.query('SELECT balance_period FROM lot WHERE reference = $1', [fig.lot]);
    const periodId = lot.rows[0]?.balance_period;
    if (periodId) {
      const p = await client.query('SELECT state FROM balance_period WHERE id = $1', [periodId]);
      if (p.rows[0]?.state === 'closed') {
        const open = await client.query(
          "SELECT reference FROM restatement WHERE balance_period = $1 AND state = 'open'", [periodId]
        );
        if (!open.rows.length) {
          throw refuse(409, 'closed_period_needs_restatement',
            `${periodId} is closed. A recomputation against a closed period is refused unless a restatement is open.`,
            { balance_period: periodId });
        }
      }
    }

    // The newest method version, which is what a recomputation runs against.
    const mv = await client.query(
      'SELECT * FROM carbon_method_version WHERE method = $1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1',
      [fig.method]
    );
    const newVersionNumber = fig.version + 1;
    const newId = `${id}-v${newVersionNumber}`;

    // The lines are re-summed from the breakdown, which is the only place the
    // value ever comes from.
    const breakdown = fig.breakdown || [];
    const value = breakdown.reduce((s, l) => s + Number(l.mg_per_kg), 0);

    await client.query(
      `INSERT INTO carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,
         boundary,comparator,breakdown,energy_location_mg_per_kg,energy_market_mg_per_kg,input_versions,computed_by,recompute_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [newId, fig.lot, newVersionNumber, fig.method, mv.rows[0]?.version || fig.method_version,
        value, fig.uncertainty_bp, fig.primary_share_bp, mv.rows[0]?.boundary || fig.boundary,
        JSON.stringify(fig.comparator), JSON.stringify(breakdown),
        fig.energy_location_mg_per_kg, fig.energy_market_mg_per_kg,
        JSON.stringify({ ...fig.input_versions, carbon_method: `${fig.method} v${mv.rows[0]?.version || fig.method_version}` }),
        session.email, body.reason]
    );
    // The old figure stays readable alongside the new one.
    await client.query('UPDATE carbon_figure SET superseded_by = $1 WHERE id = $2', [newId, id]);

    const certs = await client.query(
      `SELECT number, version, recipient, recipient_name, state FROM certificate
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(lots) l WHERE l->>'reference' = $1) ORDER BY number`,
      [fig.lot]
    );

    await appendEntry(client, {
      act: 'figure_recomputed', person: session.email, object_kind: 'carbon_figure', object_ref: newId,
      content: { supersedes: id, lot: fig.lot, reason: body.reason,
        value_mg_per_kg: value, certificates_carrying_superseded: certs.rows.map((x) => x.number) }
    });

    return {
      status: 201,
      body: {
        reference: newId, supersedes: id, lot: fig.lot, version: newVersionNumber,
        value_mg_per_kg: value, boundary: mv.rows[0]?.boundary || fig.boundary,
        method_version: `${fig.method} v${mv.rows[0]?.version || fig.method_version}`,
        uncertainty_bp: fig.uncertainty_bp,
        recomputed_by: session.email, recomputed_on: new Date().toISOString().slice(0, 10), reason: body.reason,
        certificates_carrying_superseded_figure: certs.rows.map((x) => ({
          number: x.number, version: x.version, recipient: x.recipient,
          recipient_name: x.recipient_name, state: x.state
        })),
        complete: true
      }
    };
  }));
  return c.json(result.body, result.status);
});

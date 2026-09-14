import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { nextReference } from '../db.js';

const r = new Hono();

const SPEC_METHODS = {
  relative_viscosity: 'ISO 307',
  moisture: 'ISO 15512',
  yellowness_index: 'ASTM E313',
  ash_content: 'ISO 3451-1'
};

r.post('/test-results', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'lab_analyst', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.property || !body.method || !body.instrument || !body.value || !body.unit) {
      return Response.json({ error: 'invalid_request', message: 'property, method, instrument, value and unit are required' }, { status: 400 });
    }
    if (!body.lot && !body.batch) {
      return Response.json({ error: 'invalid_request', message: 'a result is recorded against a lot or a batch' }, { status: 400 });
    }
    if (!Number.isInteger(body.uncertainty_bp)) {
      return Response.json({ error: 'not_an_integer', field: 'uncertainty_bp' }, { status: 400 });
    }
    // A result with no method is refused.
    const mismatch = SPEC_METHODS[body.property] && SPEC_METHODS[body.property] !== body.method;
    const ins = await db.query(
      `INSERT INTO test_result (lot,batch,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release,recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) RETURNING id`,
      [body.lot || null, body.batch || null, body.property, body.method, body.instrument, s.email,
        String(body.value), body.unit, body.uncertainty_bp, Boolean(mismatch), !mismatch]);
    const id = ins.rows[0].id;
    await appendEntry(db, {
      kind: 'test_result_recorded', object_ref: `TR-${String(id).padStart(5, '0')}`, person: s.email,
      site: null, content: { lot: body.lot || null, batch: body.batch || null, property: body.property, method: body.method, value: String(body.value) }
    });
    return Response.json({
      reference: `TR-${String(id).padStart(5, '0')}`,
      method_mismatch: Boolean(mismatch),
      usable_for_release: !mismatch
    }, { status: 201 });
  });
});

r.get('/test-results', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM test_result ORDER BY id')).rows;
  return c.json(rows.map((t) => ({
    reference: `TR-${String(t.id).padStart(5, '0')}`,
    lot: t.lot, batch: t.batch, property: t.property, method: t.method, instrument: t.instrument,
    analyst: t.analyst, value: t.value, unit: t.unit, uncertainty_bp: t.uncertainty_bp,
    method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release
  })));
});

r.post('/deviations', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager', 'plant_operator', 'lab_analyst')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const reference = await nextReference(db, 'DEV-', 4);
    await db.query(
      `INSERT INTO deviation (reference,state,affects_runs,affects_lots,outcome,raised_by,raised_on,description)
       VALUES ($1,'open',$2,$3,null,$4,now(),$5)`,
      [reference, JSON.stringify(body.runs || []), JSON.stringify(body.lots || []), s.email, body.description || '']);
    await appendEntry(db, {
      kind: 'deviation_raised', object_ref: reference, person: s.email, site: null,
      content: { reference, runs: body.runs || [], lots: body.lots || [] }
    });
    return Response.json({ reference, state: 'open' }, { status: 201 });
  });
});

r.post('/deviations/:reference/close', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const d = (await db.query('SELECT * FROM deviation WHERE reference=$1', [ref])).rows[0];
    if (!d) return Response.json({ error: 'not_found' }, { status: 404 });
    if (d.state === 'closed') {
      return Response.json({ error: 'already_closed' }, { status: 409 });
    }
    const body = await c.req.json().catch(() => ({}));
    if (!['root_cause_found', 'cause_not_established'].includes(body.outcome)) {
      return Response.json({ error: 'invalid_outcome', message: 'outcome is root_cause_found or cause_not_established; both are honest outcomes.' }, { status: 400 });
    }
    await db.query(`UPDATE deviation SET state='closed', outcome=$1, closed_at=now() WHERE reference=$2`, [body.outcome, ref]);
    await appendEntry(db, {
      kind: 'deviation_closed', object_ref: ref, person: s.email, site: null,
      content: { reference: ref, outcome: body.outcome }
    });
    return Response.json({ reference: ref, state: 'closed', outcome: body.outcome }, { status: 201 });
  });
});

r.get('/deviations', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM deviation ORDER BY reference')).rows;
  return c.json(rows.map((d) => ({
    reference: d.reference, state: d.state, affects_runs: d.affects_runs, affects_lots: d.affects_lots,
    outcome: d.outcome, raised_by: d.raised_by, raised_on: d.raised_on, closed_at: d.closed_at,
    description: d.description
  })));
});

r.post('/overrides', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager', 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.separation || !body.lot || !body.authorised_by) {
      return Response.json({ error: 'invalid_request', message: 'separation, lot and authorised_by are required' }, { status: 400 });
    }
    if (!body.reason || body.reason.length < 40) {
      return Response.json({
        error: 'reason_too_short',
        message: 'An override names the separation broken, a reason of at least forty characters and its authoriser.'
      }, { status: 400 });
    }
    const reference = await nextReference(db, 'OVR-', 4);
    await db.query(
      `INSERT INTO override (reference,separation,reason,lot,authorised_by,authorised_on,reviewed)
       VALUES ($1,$2,$3,$4,$5,$6,false)`,
      [reference, body.separation, body.reason, body.lot, body.authorised_by, new Date().toISOString().slice(0, 10)]);
    await appendEntry(db, {
      kind: 'override_authorised', object_ref: reference, person: s.email, site: null,
      content: { reference, separation: body.separation, lot: body.lot, authorised_by: body.authorised_by }
    });
    return Response.json({ reference, reviewed: false }, { status: 201 });
  });
});

r.get('/overrides', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM override ORDER BY reference')).rows;
  return c.json(rows.map((o) => ({
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, authorised_on: o.authorised_on,
    reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on
  })));
});

// Review: refused for the authoriser and for anybody who is neither a quality
// manager nor a claims manager.
r.post('/overrides/:reference/review', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager', 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const o = (await db.query('SELECT * FROM override WHERE reference=$1', [ref])).rows[0];
    if (!o) return Response.json({ error: 'not_found' }, { status: 404 });
    if (o.authorised_by === s.email) {
      return Response.json({
        error: 'separation_refused', separation: 'authoriser_not_reviewer',
        message: 'An override is reviewed by a second person, never by its authoriser.'
      }, { status: 403 });
    }
    if (o.reviewed) {
      return Response.json({ error: 'already_reviewed' }, { status: 409 });
    }
    await db.query(`UPDATE override SET reviewed=true, reviewed_by=$1, reviewed_on=$2 WHERE reference=$3`,
      [s.email, new Date().toISOString().slice(0, 10), ref]);
    await appendEntry(db, {
      kind: 'override_reviewed', object_ref: ref, person: s.email, site: null,
      content: { reference: ref, reviewed_by: s.email, removes_nothing: true }
    });
    return Response.json({ reference: ref, reviewed: true, reviewed_by: s.email }, { status: 201 });
  });
});

export default r;

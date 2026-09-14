import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { computeDryMass } from '../lib/units.js';
import { batchView, missingCustodyKinds, approvalOn } from '../lib/engine.js';
import { nextReference } from '../db.js';

const r = new Hono();

async function loadBatch(db, ref) {
  const row = (await db.query(
    `SELECT b.*, w.calibrated_on FROM batch b LEFT JOIN weighing_device w ON w.reference=b.device WHERE b.reference=$1`,
    [ref])).rows[0];
  return row;
}

r.get('/batches', async (c) => {
  const db = c.get('db');
  const rows = (await db.query(
    `SELECT b.*, w.calibrated_on FROM batch b LEFT JOIN weighing_device w ON w.reference=b.device ORDER BY b.reference`)).rows;
  const out = [];
  for (const row of rows) out.push(await batchView(db, row));
  return c.json(out);
});

r.get('/batches/:reference', async (c) => {
  const db = c.get('db');
  const row = await loadBatch(db, c.req.param('reference'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await batchView(db, row));
});

// Booking a batch: category required, no default, decided by the operator.
r.post('/batches', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const required = ['collector', 'site', 'category', 'gross_g', 'tare_g', 'net_g', 'moisture_bp', 'moisture_method', 'device', 'received_on'];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null) {
        return Response.json({ error: 'invalid_request', message: `${f} is required` }, { status: 400 });
      }
    }
    if (!['post_consumer', 'pre_consumer'].includes(body.category)) {
      return Response.json({
        error: 'invalid_category',
        message: 'category is required at intake, has no default, and is one of post_consumer, pre_consumer.'
      }, { status: 400 });
    }
    for (const f of ['gross_g', 'tare_g', 'net_g', 'moisture_bp']) {
      if (!Number.isInteger(body[f])) {
        return Response.json({ error: 'not_an_integer', field: f, message: `${f} must be an integer` }, { status: 400 });
      }
    }
    if (body.gross_g - body.tare_g !== body.net_g) {
      return Response.json({ error: 'mass_does_not_reconcile', message: 'gross_g minus tare_g must equal net_g' }, { status: 400 });
    }
    const collector = (await db.query('SELECT * FROM collector WHERE reference=$1', [body.collector])).rows[0];
    if (!collector) return Response.json({ error: 'unknown_collector' }, { status: 400 });
    const device = (await db.query('SELECT * FROM weighing_device WHERE reference=$1', [body.device])).rows[0];
    if (!device) return Response.json({ error: 'unknown_device' }, { status: 400 });

    // The collector's name as it stood on the receipt date.
    const names = (await db.query(
      `SELECT name FROM party_version WHERE party_ref=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`,
      [body.collector, body.received_on])).rows;
    const collector_name = names.length ? names[0].name : collector.name;

    const reference = await nextReference(db, 'BATCH-', 4, 1000);
    await db.query(
      `INSERT INTO batch (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,
        received_on,composition,contamination,custody,accepted_g,rejected_g,rejected_destination,collector_name,recorded_at,entered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,null,$17,now(),$18)`,
      [reference, body.collector, body.site, body.grade || 'N6', body.category, body.gross_g, body.tare_g, body.net_g,
        body.moisture_bp, body.moisture_method, body.device, body.received_on,
        JSON.stringify(body.composition || []), JSON.stringify(body.contamination || {}),
        JSON.stringify(body.custody || []), body.net_g, collector_name, s.email]);

    await appendEntry(db, {
      kind: 'batch_booked', object_ref: reference, person: s.email, site: body.site,
      content: { reference, collector: body.collector, category: body.category, net_g: body.net_g, moisture_bp: body.moisture_bp }
    });
    const row = await loadBatch(db, reference);
    return Response.json(await batchView(db, row), { status: 201 });
  });
});

// A category never changes after acceptance, for any role.
r.patch('/batches/:reference', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator', 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  const body = await c.req.json().catch(() => ({}));
  if ('category' in body) {
    return Response.json({
      error: 'category_immutable_after_acceptance',
      message: 'A batch category cannot be changed after acceptance, by anybody, through any route.'
    }, { status: 409 });
  }
  const ref = c.req.param('reference');
  const row = await loadBatch(db, ref);
  if (!row) return c.json({ error: 'not_found' }, 404);
  const fields = [];
  const params = [];
  const editable = ['contamination', 'composition'];
  let i = 1;
  for (const f of editable) {
    if (f in body) {
      fields.push(`${f}=$${i}`);
      params.push(JSON.stringify(body[f]));
      i += 1;
    }
  }
  if (!fields.length) {
    return Response.json({ error: 'nothing_to_change', message: 'No editable field was supplied.' }, { status: 400 });
  }
  await db.query(`UPDATE batch SET ${fields.join(', ')} WHERE reference=$${i}`, [...params, ref]);
  const updated = await loadBatch(db, ref);
  return c.json(await batchView(db, updated));
});

// Late custody document: claimable forward from the date it arrived.
r.post('/batches/:reference/custody', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const row = await loadBatch(db, ref);
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    if (!body.kind || !body.date || !body.party) {
      return Response.json({ error: 'invalid_request', message: 'kind, date and party are required' }, { status: 400 });
    }
    const custody = Array.isArray(row.custody) ? row.custody : [];
    custody.push({ kind: body.kind, date: body.date, party: body.party });
    const arrived = body.date;
    await db.query('UPDATE batch SET custody=$1, claimable_from=$2 WHERE reference=$3',
      [JSON.stringify(custody), arrived, ref]);
    await appendEntry(db, {
      kind: 'custody_document_attached', object_ref: ref, person: s.email, site: row.site,
      content: { batch: ref, kind: body.kind, arrived_on: arrived, claimable_from: arrived }
    });
    const updated = await loadBatch(db, ref);
    const view = await batchView(db, updated);
    return Response.json(view, { status: 201 });
  });
});

// Partial or whole rejection: parts must sum, destination recorded.
r.post('/batches/:reference/reject', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'plant_operator')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const row = await loadBatch(db, ref);
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    const rejected_g = body.rejected_g;
    if (!Number.isInteger(rejected_g) || rejected_g <= 0) {
      return Response.json({ error: 'invalid_request', message: 'rejected_g must be a positive integer' }, { status: 400 });
    }
    if (!body.reason || !body.destination) {
      return Response.json({ error: 'invalid_request', message: 'reason and destination record where the rejected mass went' }, { status: 400 });
    }
    const delivered = row.net_g;
    const priorRejected = row.rejected_g || 0;
    if (priorRejected + rejected_g > delivered) {
      return Response.json({
        error: 'rejection_does_not_sum',
        message: 'Accepted mass plus rejected mass equals delivered mass, and a rejection whose parts do not sum is refused.',
        delivered_g: delivered, accepted_after: delivered - priorRejected - rejected_g
      }, { status: 400 });
    }
    await db.query('UPDATE batch SET rejected_g=$1, rejected_destination=$2 WHERE reference=$3',
      [priorRejected + rejected_g, body.destination, ref]);
    await db.query('UPDATE batch SET accepted_g=$1 WHERE reference=$2', [delivered - priorRejected - rejected_g, ref]);
    await appendEntry(db, {
      kind: 'batch_rejected', object_ref: ref, person: s.email, site: row.site,
      content: { batch: ref, rejected_g, reason: body.reason, destination: body.destination }
    });
    const updated = await loadBatch(db, ref);
    return Response.json(await batchView(db, updated), { status: 201 });
  });
});

// Backward traversal, complete set, refuses pagination.
r.get('/batches/:reference/impact', async (c) => {
  const db = c.get('db');
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (c.req.query(p) !== undefined) {
      return Response.json({ error: 'pagination_refused', message: 'This traversal answers the complete set.' }, { status: 400 });
    }
  }
  const { impactForBatch } = await import('../lib/engine.js');
  const imp = await impactForBatch(db, c.req.param('reference'));
  if (!imp) return c.json({ error: 'not_found' }, 404);
  return c.json({ ...imp, read_at: new Date().toISOString() });
});

export default r;

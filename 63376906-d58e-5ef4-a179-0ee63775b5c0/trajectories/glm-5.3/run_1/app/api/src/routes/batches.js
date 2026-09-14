import { Hono } from 'hono';
import { q, one, exec, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, conflict, forbidden, reqField, intField, enumField, rememberIdempotency, refusePagination } from '../lib/http.js';
import { entry, entryTop } from '../record.js';
import { resolveBatch, requiredCustodyKinds, batchImpact } from '../engine/domain.js';

const r = new Hono();

r.get('/api/batches', async (c) => {
  await requireAuth(c);
  const rows = await q('SELECT * FROM batches ORDER BY reference');
  return c.json(await Promise.all(rows.map(resolveBatch)));
});

r.get('/api/batches/:ref', async (c) => {
  await requireAuth(c);
  const b = await one('SELECT * FROM batches WHERE reference = $1', [c.req.param('ref')]);
  if (!b) throw notFound('batch_not_found');
  const out = await resolveBatch(b);
  const custody = await q('SELECT kind, occurred_on, party, late, attached_on FROM custodies WHERE batch=$1 ORDER BY id', [b.reference]);
  out.custody = custody.map(x => ({ kind: x.kind, occurred_on: isoD(x.occurred_on), party: x.party, late: x.late, attached_on: x.attached_on ? isoD(x.attached_on) : null }));
  return c.json(out);
});

const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const iso = (d) => (d instanceof Date ? d.toISOString() : d);

// Intake continues to accept a batch while the rest of the system is degraded.
r.post('/api/batches', async (c) => {
  const user = await requireRole(c, 'plant_operator');
  const b = await c.req.json();
  const collector = reqField(b.collector, 'collector');
  const site = reqField(b.site, 'site');
  const category = enumField(b.category, 'category', ['post_consumer', 'pre_consumer']);
  const gross_g = intField(b.gross_g, 'gross_g');
  const tare_g = intField(b.tare_g, 'tare_g');
  const net_g = intField(b.net_g, 'net_g');
  const moisture_bp = intField(b.moisture_bp, 'moisture_bp');
  const device = reqField(b.device, 'device');
  const received_on = reqField(b.received_on, 'received_on');
  const composition = reqField(b.composition, 'composition');
  const contamination = reqField(b.contamination, 'contamination');
  const custody = Array.isArray(b.custody) ? b.custody : [];

  const col = await one('SELECT * FROM collectors WHERE reference = $1', [collector]);
  if (!col) throw bad('collector_not_found');
  const st = await one('SELECT * FROM sites WHERE reference = $1', [site]);
  if (!st) throw bad('site_not_found');
  if (!user.sites.includes(site)) throw forbidden('site_out_of_scope', { site });

  // the reference the record took
  const seq = await one(`SELECT coalesce(max(substring(reference from 5)::int),1000)+1 n FROM batches WHERE reference ~ '^BATCH-1'`);
  const reference = `BATCH-${seq.n}`;
  const ref = reference;

  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO batches (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, accepted_g, rejected_g, claimable, composition, contamination, event_at, recorded_at, effective_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,$15,$16, now(), now(), $12)`,
      [ref, collector, site, b.grade || 'N6', category, gross_g, tare_g, net_g, moisture_bp,
       reqField(b.moisture_method, 'moisture_method'), device, received_on, net_g, 0,
       JSON.stringify(composition), JSON.stringify(contamination)]);
    let i = 1;
    for (const link of custody) {
      await tx.query(`INSERT INTO custodies (batch, kind, occurred_on, party, late) VALUES ($1,$2,$3,$4,false)`,
        [ref, enumField(link.kind, `custody[${i}].kind`, requiredCustodyKinds), reqField(link.date, 'custody.date'), reqField(link.party, 'custody.party')]);
      i++;
    }
    const e = await entry(tx, { person: user.email, site, object: ref, act: 'batch_booked_in', content: { reference: ref, collector, category, net_g, moisture_bp, device, received_on, custody_links: custody.length } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, record_seq: e.seq });
    const row = await one('SELECT * FROM batches WHERE reference = $1', [ref]);
    return c.json({ ...(await resolveBatch(row)), reference: ref, record_seq: e.seq }, 201);
  } catch (ex) {
    await tx.query('ROLLBACK');
    throw ex;
  } finally { tx.release(); }
});

// A batch category cannot be changed after acceptance, by anybody, through any route.
r.patch('/api/batches/:ref', async (c) => {
  await requireAuth(c);
  const ref = c.req.param('ref');
  const b = await one('SELECT * FROM batches WHERE reference = $1', [ref]);
  if (!b) throw notFound('batch_not_found');
  const body = await c.req.json().catch(() => ({}));
  if ('category' in body) {
    throw conflict('category_change_refused', { rule: 'batch_category_immutable_after_acceptance' });
  }
  throw bad('no_editable_fields');
});

r.post('/api/batches/:ref/custody', async (c) => {
  const user = await requireRole(c, 'plant_operator', 'quality_manager');
  const ref = c.req.param('ref');
  const b = await one('SELECT * FROM batches WHERE reference = $1', [ref]);
  if (!b) throw notFound('batch_not_found');
  const body = await c.req.json();
  const kind = enumField(body.kind, 'kind', requiredCustodyKinds);
  const date = reqField(body.date, 'date');
  const party = reqField(body.party, 'party');
  const arrived = reqField(body.arrived_on, 'arrived_on');
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO custodies (batch, kind, occurred_on, party, late, attached_on) VALUES ($1,$2,$3,$4,true,$5)`, [ref, kind, date, party, arrived]);
    const e = await entry(tx, { person: user.email, site: b.site, object: ref, act: 'custody_document_attached_late',
      content: { batch: ref, kind, arrived_on: arrived, claimable_from: arrived } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, kind, claimable_from: arrived, record_seq: e.seq });
    const row = await one('SELECT * FROM batches WHERE reference = $1', [ref]);
    return c.json({ ...(await resolveBatch(row)), reference: ref }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.post('/api/batches/:ref/reject', async (c) => {
  const user = await requireRole(c, 'plant_operator');
  const ref = c.req.param('ref');
  const b = await one('SELECT * FROM batches WHERE reference = $1', [ref]);
  if (!b) throw notFound('batch_not_found');
  const body = await c.req.json();
  const rejected_g = intField(body.rejected_g, 'rejected_g');
  const reason = reqField(body.reason, 'reason');
  const destination = reqField(body.destination, 'destination');
  if (Number(b.net_g) !== Number(b.accepted_g || b.net_g) + Number(b.rejected_g || 0) + rejected_g) {
    throw bad('rejection_parts_do_not_sum', { delivered_g: Number(b.net_g), accepted_g: Number(b.accepted_g ?? b.net_g), rejected_g: Number(b.rejected_g || 0), this_rejection_g: rejected_g });
  }
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE batches SET accepted_g = accepted_g - $1, rejected_g = rejected_g + $1, rejected_destination = $2 WHERE reference = $3`, [rejected_g, destination, ref]);
    const e = await entry(tx, { person: user.email, site: b.site, object: ref, act: 'batch_rejected_in_part',
      content: { batch: ref, rejected_g, reason, destination } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, rejected_g, reason, destination, record_seq: e.seq });
    return c.json({ reference: ref, rejected_g, reason, destination, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;

// The reverse traversal: complete, unpaginated, and answers fast enough to run on a bad day.
r.get('/api/batches/:ref/impact', async (c) => {
  refusePagination(c);
  await requireAuth(c);
  const b = await one('SELECT * FROM batches WHERE reference = $1', [c.req.param('ref')]);
  if (!b) throw notFound('batch_not_found');
  const started = Date.now();
  const impact = await batchImpact(b.reference);
  impact.completed_in_ms = Date.now() - started;
  return c.json(impact);
});

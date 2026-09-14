import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, reqField, enumField, rememberIdempotency, conflict, forbidden } from '../lib/http.js';
import { entry, entryTop } from '../record.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

const SEPARATIONS = [
  'analyst_not_dispositioner',
  'method_publisher_not_period_closer',
  'signer_not_data_enterer',
  'batch_booker_not_collector_approver'
];

r.get('/api/overrides', async (c) => {
  await requireAuth(c);
  const rows = await q('SELECT * FROM overrides ORDER BY reference');
  return c.json(rows.map(serialize));
});

function serialize(o) {
  return {
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, authorised_on: isoD(o.authorised_on),
    reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on ? isoD(o.reviewed_on) : null
  };
}

// An override names the separation broken, a reason of at least forty characters, and its authoriser.
r.post('/api/overrides', async (c) => {
  const user = await requireAuth(c);
  const b = await c.req.json();
  const separation = enumField(b.separation, 'separation', SEPARATIONS);
  const reason = reqField(b.reason, 'reason');
  if (String(reason).trim().length < 40) throw bad('reason_too_short', { minimum_characters: 40, given: String(reason).trim().length });
  const lot = reqField(b.lot, 'lot');
  const authorised_by = reqField(b.authorised_by, 'authorised_by');
  const n = Number((await one(`SELECT count(*) n FROM overrides`)).n) + 1;
  const ref = `OVR-${String(n).padStart(4, '0')}`;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO overrides (reference, separation, reason, lot, authorised_by, authorised_on) VALUES ($1,$2,$3,$4,$5,$6)`,
      [ref, separation, reason, lot, authorised_by, isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: null, object: ref, act: 'override_recorded',
      content: { reference: ref, separation, lot, authorised_by, reason } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, record_seq: e.seq });
    return c.json({ ...serialize(await one('SELECT * FROM overrides WHERE reference=$1', [ref])), record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

// The review is refused for the authoriser and for anybody who is neither a quality manager nor a claims manager.
r.post('/api/overrides/:ref/review', async (c) => {
  const user = await requireAuth(c);
  const o = await one('SELECT * FROM overrides WHERE reference = $1', [c.req.param('ref')]);
  if (!o) throw notFound('override_not_found');
  if (o.reviewed) throw conflict('override_already_reviewed');
  if (o.authorised_by === user.email) throw forbidden('authoriser_cannot_review', { authoriser: o.authorised_by });
  if (!['quality_manager', 'claims_manager'].includes(user.role)) {
    throw forbidden('role_not_permitted', { role: user.role, requires: ['quality_manager', 'claims_manager'] });
  }
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE overrides SET reviewed=true, reviewed_by=$2, reviewed_on=$3 WHERE reference=$1`,
      [o.reference, user.email, isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: null, object: o.reference, act: 'override_reviewed',
      content: { reference: o.reference, reviewed_by: user.email, separation: o.separation } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: o.reference, reviewed: true, record_seq: e.seq });
    return c.json({ ...serialize(await one('SELECT * FROM overrides WHERE reference=$1', [o.reference])), record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;

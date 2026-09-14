import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, reqField, intField, rememberIdempotency, forbidden } from '../lib/http.js';
import { entry, entryTop } from '../record.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const iso = (d) => (d instanceof Date ? d.toISOString() : d);

// A result with no method is refused. A method other than the one the specification names is
// kept as evidence with usable_for_release false.
r.post('/api/test-results', async (c) => {
  const user = await requireRole(c, 'lab_analyst', 'quality_manager');
  const b = await c.req.json();
  const subject = reqField(b.subject, 'subject');
  const property = reqField(b.property, 'property');
  const method = reqField(b.method, 'method');
  const value = b.value;
  if (typeof value !== 'number') throw bad('not_a_number', { field: 'value' });
  const specMethod = await specMethodFor(subject, property);
  const mismatch = specMethod ? specMethod !== method : false;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    const row = await one(`INSERT INTO test_results (subject, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [subject, property, method, reqField(b.instrument, 'instrument'), reqField(b.analyst, 'analyst') || user.email,
       value, reqField(b.unit, 'unit'), intField(b.uncertainty_bp, 'uncertainty_bp'), mismatch, !mismatch], tx);
    const e = await entry(tx, { person: user.email, site: null, object: subject, act: 'test_result_recorded',
      content: { id: Number(row.id), subject, property, method, value, unit: b.unit, uncertainty_bp: b.uncertainty_bp, method_mismatch: mismatch, usable_for_release: !mismatch } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: `TST-${String(Number(row.id)).padStart(5, '0')}`, id: Number(row.id), method_mismatch: mismatch, usable_for_release: !mismatch, record_seq: e.seq });
    return c.json({ reference: `TST-${String(Number(row.id)).padStart(5, '0')}`, id: Number(row.id), subject, property, method,
      value, unit: b.unit, uncertainty_bp: b.uncertainty_bp, method_mismatch: mismatch, usable_for_release: !mismatch, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

async function specMethodFor(subject, property) {
  const lot = await one(`SELECT * FROM lots WHERE reference = $1`, [subject]);
  const grade = lot ? lot.grade : (await one(`SELECT grade FROM batches WHERE reference = $1`, [subject]))?.grade;
  if (!grade) return null;
  const s = await one(`SELECT rows FROM specifications WHERE id = $1 ORDER BY version DESC LIMIT 1`, ['SPEC-' + grade]);
  if (!s) return null;
  const rows = typeof s.rows === 'string' ? JSON.parse(s.rows) : s.rows;
  const row = rows.find((x) => x.property === property);
  return row ? row.method : null;
}

r.get('/api/test-results', async (c) => {
  await requireAuth(c);
  const subject = c.req.query('subject');
  const rows = subject ? await q('SELECT * FROM test_results WHERE subject = $1 ORDER BY id', [subject])
    : await q('SELECT * FROM test_results ORDER BY id');
  return c.json(rows.map(t => ({
    id: Number(t.id), subject: t.subject, property: t.property, method: t.method, instrument: t.instrument,
    analyst: t.analyst, value: Number(t.value), unit: t.unit, uncertainty_bp: t.uncertainty_bp,
    method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release, recorded_at: iso(t.recorded_at)
  })));
});

export default r;

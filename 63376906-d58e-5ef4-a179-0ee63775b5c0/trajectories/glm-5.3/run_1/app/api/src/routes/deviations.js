import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { requireAuth, requireRole, bad, notFound, reqField, enumField, rememberIdempotency, conflict } from '../lib/http.js';
import { entry, entryTop } from '../record.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

r.get('/api/deviations', async (c) => {
  await requireAuth(c);
  const rows = await q('SELECT * FROM deviations ORDER BY reference');
  return c.json(rows.map(d => ({
    reference: d.reference, state: d.state, runs: d.runs, lots: d.lots, outcome: d.outcome,
    raised_on: isoD(d.raised_on), closed_on: d.closed_on ? isoD(d.closed_on) : null
  })));
});

r.post('/api/deviations', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const b = await c.req.json();
  const runs = Array.isArray(b.runs) ? b.runs : [];
  const lots = Array.isArray(b.lots) ? b.lots : [];
  if (!runs.length && !lots.length) throw bad('missing_field', { field: 'runs_or_lots' });
  const n = Number((await one(`SELECT count(*) n FROM deviations`)).n) + 1;
  const ref = `DEV-${String(n).padStart(4, '0')}`;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO deviations (reference, state, runs, lots, raised_on) VALUES ($1,'open',$2,$3,$4)`,
      [ref, JSON.stringify(runs), JSON.stringify(lots), reqField(b.raised_on, 'raised_on') || isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: null, object: ref, act: 'deviation_raised', content: { reference: ref, runs, lots } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: ref, record_seq: e.seq });
    return c.json({ reference: ref, state: 'open', runs, lots, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

r.post('/api/deviations/:ref/close', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const d = await one('SELECT * FROM deviations WHERE reference = $1', [c.req.param('ref')]);
  if (!d) throw notFound('deviation_not_found');
  if (d.state === 'closed') throw conflict('deviation_already_closed');
  const b = await c.req.json();
  const outcome = enumField(b.outcome, 'outcome', ['root_cause_found', 'cause_not_established']);
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`UPDATE deviations SET state='closed', outcome=$2, closed_on=$3 WHERE reference=$1`, [d.reference, outcome, isoD(new Date())]);
    const e = await entry(tx, { person: user.email, site: null, object: d.reference, act: 'deviation_closed', content: { reference: d.reference, outcome } });
    await tx.query('COMMIT');
    await rememberIdempotency(c, 201, { reference: d.reference, outcome, record_seq: e.seq });
    return c.json({ reference: d.reference, state: 'closed', outcome, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;

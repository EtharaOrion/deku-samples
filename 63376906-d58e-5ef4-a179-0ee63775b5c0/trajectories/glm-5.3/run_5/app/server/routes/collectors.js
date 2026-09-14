import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';

const r = new Hono();

function approvalView(p) {
  return {
    state: p.state,
    valid_from: p.valid_from,
    valid_to: p.valid_to,
    condition: p.condition || null,
    condition_closes_on: p.condition_closes_on || null,
    expiring: p.valid_to
      ? (new Date(p.valid_to).getTime() - Date.now()) < 14 * 24 * 3600 * 1000 && new Date(p.valid_to).getTime() > Date.now()
      : false
  };
}

r.get('/collectors', async (c) => {
  const db = c.get('db');
  const cols = (await db.query('SELECT * FROM collector ORDER BY reference')).rows;
  const periods = (await db.query('SELECT * FROM approval_period ORDER BY collector, valid_from')).rows;
  const findings = (await db.query('SELECT * FROM finding ORDER BY id')).rows;
  return c.json(cols.map((col) => ({
    reference: col.reference,
    name: col.name,
    country: col.country,
    registration: col.registration,
    registration_expiry: col.registration_expiry,
    collection_site_types: col.site_types,
    declared_streams: col.streams,
    scheme_status: col.scheme_status,
    findings: findings.filter((f) => f.collector === col.reference).map((f) => ({
      kind: f.kind, detail: f.detail, opened_on: f.opened_on, closes_by: f.closes_by, state: f.state
    })),
    approval_periods: periods.filter((p) => p.collector === col.reference).map(approvalView)
  })));
});

r.get('/collectors/:reference', async (c) => {
  const db = c.get('db');
  const col = (await db.query('SELECT * FROM collector WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!col) return c.json({ error: 'not_found' }, 404);
  const periods = (await db.query('SELECT * FROM approval_period WHERE collector=$1 ORDER BY valid_from', [col.reference])).rows;
  const findings = (await db.query('SELECT * FROM finding WHERE collector=$1 ORDER BY id', [col.reference])).rows;
  return c.json({
    reference: col.reference,
    name: col.name,
    country: col.country,
    registration: col.registration,
    registration_expiry: col.registration_expiry,
    collection_site_types: col.site_types,
    declared_streams: col.streams,
    scheme_status: col.scheme_status,
    findings: findings.map((f) => ({
      kind: f.kind, detail: f.detail, opened_on: f.opened_on, closes_by: f.closes_by, state: f.state
    })),
    approval_periods: periods.map(approvalView)
  });
});

// Adding an approval period is refused for anybody but a quality manager.
r.post('/collectors/:reference/approvals', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({
      error: 'forbidden', reason: 'role_not_permitted',
      message: 'Whoever books in a batch does not approve the collector. Only a quality manager records an approval period.'
    }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const { state, valid_from, valid_to, condition, condition_closes_on } = body;
    if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(state)) {
      return Response.json({ error: 'invalid_state' }, { status: 400 });
    }
    if (!valid_from || !valid_to) {
      return Response.json({ error: 'invalid_request', message: 'valid_from and valid_to are required' }, { status: 400 });
    }
    if (state === 'conditional' && (!condition || !condition_closes_on)) {
      return Response.json({ error: 'invalid_request', message: 'a conditional approval names its condition and the date it must close by' }, { status: 400 });
    }
    const col = (await db.query('SELECT * FROM collector WHERE reference=$1', [c.req.param('reference')])).rows[0];
    if (!col) return Response.json({ error: 'not_found' }, { status: 404 });
    const ins = await db.query(
      `INSERT INTO approval_period (collector,state,valid_from,valid_to,condition,condition_closes_on)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [col.reference, state, valid_from, valid_to, condition || null, condition_closes_on || null]);
    const id = ins.rows[0].id;
    await appendEntry(db, {
      kind: 'collector_approval_added', object_ref: `${col.reference}:${id}`, person: s.email, site: null,
      content: { collector: col.reference, state, valid_from, valid_to, condition: condition || null }
    });
    return Response.json({ reference: `${col.reference}:${id}`, collector: col.reference, state, valid_from, valid_to }, { status: 201 });
  });
});

export default r;

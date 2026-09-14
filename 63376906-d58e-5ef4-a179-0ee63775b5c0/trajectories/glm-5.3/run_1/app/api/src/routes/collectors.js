import { Hono } from 'hono';
import { q, one } from '../db.js';
import { requireAuth, requireRole, bad, notFound, enumField, conflict, reqField } from '../lib/http.js';
import { entryTop } from '../record.js';

const r = new Hono();

r.get('/api/collectors', async (c) => {
  await requireAuth(c);
  const rows = await q('SELECT * FROM collectors ORDER BY reference');
  return c.json(await Promise.all(rows.map(serialize)));
});

r.get('/api/collectors/:ref', async (c) => {
  await requireAuth(c);
  const col = await one('SELECT * FROM collectors WHERE reference = $1', [c.req.param('ref')]);
  if (!col) throw notFound('collector_not_found');
  return c.json(await serialize(col));
});

async function serialize(col) {
  const periods = await q('SELECT * FROM approval_periods WHERE collector = $1 ORDER BY valid_from', [col.reference]);
  const findings = await q('SELECT * FROM findings WHERE collector = $1 ORDER BY id', [col.reference]);
  return {
    reference: col.reference, name: col.current_name, country: col.country,
    registration: col.registration, registration_expiry: isoD(col.registration_expiry),
    site_types: col.site_types, streams: col.streams, scheme_status: col.scheme_status,
    findings: findings.map(f => ({ raised_on: isoD(f.raised_on), detail: f.detail, open: f.open })),
    approval_periods: periods.map(p => {
      const expiring = p.valid_to && daysUntil(p.valid_to) <= 14 && daysUntil(p.valid_to) >= 0;
      return {
        state: p.state, valid_from: isoD(p.valid_from), valid_to: isoD(p.valid_to),
        condition: p.condition || null, condition_closes_on: p.condition_closes_on ? isoD(p.condition_closes_on) : null,
        expiring
      };
    })
  };
}

function daysUntil(d) {
  return Math.round((new Date(d) - Date.now()) / 86400000);
}
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

// Approvals are a quality-manager act. Whoever books in a batch does not approve the collector.
r.post('/api/collectors/:ref/approvals', async (c) => {
  const user = await requireRole(c, 'quality_manager');
  const col = await one('SELECT * FROM collectors WHERE reference = $1', [c.req.param('ref')]);
  if (!col) throw notFound('collector_not_found');
  const b = await c.req.json();
  const state = enumField(b.state, 'state', ['approved', 'conditional', 'suspended', 'lapsed']);
  const valid_from = reqField(b.valid_from, 'valid_from');
  const valid_to = reqField(b.valid_to, 'valid_to');
  const row = await one(
    `INSERT INTO approval_periods (collector, state, valid_from, valid_to, condition, condition_closes_on)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [col.reference, state, valid_from, valid_to, state === 'conditional' ? reqField(b.condition, 'condition') : null,
     state === 'conditional' ? reqField(b.condition_closes_on, 'condition_closes_on') : null]);
  const e = await entryTop({ person: user.email, site: null, object: col.reference,
    act: 'collector_approval_added',
    content: { collector: col.reference, state, valid_from, valid_to, condition: row.condition, condition_closes_on: row.condition_closes_on } });
  return c.json({ state: row.state, valid_from: isoD(row.valid_from), valid_to: isoD(row.valid_to),
    condition: row.condition || null, condition_closes_on: row.condition_closes_on ? isoD(row.condition_closes_on) : null, record_seq: e.seq }, 201);
});

export default r;

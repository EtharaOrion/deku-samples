import { Hono } from 'hono';
import { q, tx } from '../db.js';
import { requireSession } from '../auth.js';
import { idempotent, readBody, refuse, recordTx, requireKeys } from '../lib/http.js';
import { nowIso } from '../lib/util.js';

const collectors = new Hono();
collectors.use('*', requireSession());

function expiring(p) {
  if (!p) return false;
  const days = (new Date(p.valid_to + 'T00:00:00Z') - new Date(nowIso().slice(0, 10) + 'T00:00:00Z')) / 86400000;
  return days <= 14;
}

async function view(col, periods, findings) {
  const current = (periods || []).filter((p) => p.valid_from <= nowIso().slice(0, 10) && nowIso().slice(0, 10) <= p.valid_to);
  return {
    reference: col.reference, name: col.name, country: col.country, registration: col.registration,
    registration_expiry: col.registration_expiry, site_types: col.site_types, streams: col.streams,
    scheme_status: col.scheme_status,
    findings: (findings || []).map((f) => ({ raised_on: f.raised_on, detail: f.detail, basis: f.basis, state: f.state, open: f.open })),
    approval_periods: (periods || []).map((p) => ({
      state: p.state, valid_from: p.valid_from, valid_to: p.valid_to,
      condition: p.condition || null, condition_closes_on: p.condition_closes_on || null,
      expiring: expiring(p)
    })),
    current_state: current.length ? current[0].state : 'lapsed'
  };
}

collectors.get('/', async (c) => {
  const cols = await q('SELECT * FROM collector ORDER BY reference');
  const out = [];
  for (const col of cols.rows) {
    const periods = await q('SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from', [col.reference]);
    const findings = await q('SELECT * FROM finding WHERE collector = $1 ORDER BY raised_on', [col.reference]);
    out.push(await view(col, periods.rows, findings.rows));
  }
  return c.json(out);
});

collectors.get('/:reference', async (c) => {
  const col = (await q('SELECT * FROM collector WHERE reference = $1', [c.req.param('reference')])).rows[0];
  if (!col) return c.json({ error: 'not_found' }, 404);
  const periods = await q('SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from', [col.reference]);
  const findings = await q('SELECT * FROM finding WHERE collector = $1 ORDER BY raised_on', [col.reference]);
  return c.json(await view(col, periods.rows, findings.rows));
});

collectors.post('/:reference/approvals', async (c) => {
  const user = c.get('user');
  // whoever books in a batch does not approve the collector
  if (user.role !== 'quality_manager') {
    refuse(403, 'forbidden', { separation: 'booker_not_approver', message: 'Whoever books in a batch does not approve the collector. Only a quality manager approves, suspends or lapses a collector.' });
  }
  return idempotent(c, async () => {
    const body = await readBody(c);
    requireKeys(body, ['state', 'valid_from', 'valid_to']);
    if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(body.state)) refuse(400, 'unknown_state');
    if (body.state === 'conditional') requireKeys(body, ['condition', 'condition_closes_on']);
    const col = (await q('SELECT * FROM collector WHERE reference = $1', [c.req.param('reference')])).rows[0];
    if (!col) refuse(404, 'not_found');
    await tx(async (client) => {
      await client.query('INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on) VALUES ($1,$2,$3,$4,$5,$6)',
        [col.reference, body.state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null]);
      await recordTx(client, { user, act: 'collector_' + body.state, object: col.reference, site: null, effective_on: body.valid_from, payload: { state: body.state, valid_from: body.valid_from, valid_to: body.valid_to } });
    });
    return { reference: col.reference, state: body.state };
  });
});

export default collectors;

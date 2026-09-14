import { Hono } from 'hono';
import { q } from '../db.js';
import { requireSession } from '../auth.js';

const restatements = new Hono();
restatements.use('*', requireSession());

restatements.get('/:reference', async (c) => {
  const r = await q('SELECT * FROM restatement WHERE reference = $1', [c.req.param('reference')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  const x = r.rows[0];
  const resolutions = await q('SELECT * FROM resolution WHERE restatement = $1', [x.reference]);
  return c.json({
    reference: x.reference, balance_period: x.balance_period, reason: x.reason,
    opened_on: x.opened_on, closed: x.closed, content_movements: x.content_movements,
    resolutions: resolutions.rows.map((r2) => ({ certificate: r2.certificate, outcome: r2.outcome, reason: r2.reason }))
  });
});

export default restatements;

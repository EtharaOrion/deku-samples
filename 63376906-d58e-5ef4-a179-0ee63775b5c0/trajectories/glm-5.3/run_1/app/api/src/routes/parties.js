import { Hono } from 'hono';
import { q, one } from '../db.js';
import { requireAuth, notFound } from '../lib/http.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

r.get('/api/parties/:ref/versions', async (c) => {
  await requireAuth(c);
  const ref = c.req.param('ref');
  const rows = await q('SELECT * FROM party_versions WHERE party = $1 ORDER BY effective_from', [ref]);
  if (!rows.length) throw notFound('party_not_found');
  return c.json(rows.map(v => ({ reference: Number(v.reference), party: v.party, name: v.name, effective_from: isoD(v.effective_from) })));
});

export default r;

import { Hono } from 'hono';
import { q } from '../db.js';
import { nowIso } from '../lib/util.js';

const verify = new Hono();

const hits = new Map();
const WINDOW = 60000;
const LIMIT = 30;

function allowed(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, start: now };
  if (now - rec.start > WINDOW) { rec.n = 0; rec.start = now; }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n <= LIMIT;
}

verify.get('/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for') || 'local';
  if (!allowed(ip)) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const r = await q('SELECT * FROM certificate WHERE number = $1', [c.req.param('number')]);
  if (!r.rows.length) {
    return c.json({ found: false, number: c.req.param('number') }, 200);
  }
  const cert = r.rows[0];
  return c.json({
    found: true,
    number: cert.number,
    state: cert.state,
    issued_on: String(cert.signed_at).slice(0, 10),
    withdrawn_on: cert.withdrawn_on || null,
    withdrawal_reason: cert.withdrawal_reason || null,
    site: cert.site,
    grade: cert.grade,
    claim_type: cert.claim_type,
    recipient_name: cert.recipient_name
  });
});

export default verify;

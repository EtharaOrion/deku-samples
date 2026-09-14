import { Hono } from 'hono';
import { q, one, client } from '../db.js';
import { bad, notFound, reqField, enumField, rememberIdempotency, refusePagination } from '../lib/http.js';
import { entry } from '../record.js';
import { sendMail } from '../mail.js';

const r = new Hono();
const isoD = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

const ENQUIRY_TYPES = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3, retention_months: 36 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2, retention_months: 36 },
  partnership: { destination: 'partners@example.com', response_days: 5, retention_months: 24 },
  press: { destination: 'press@example.com', response_days: 1, retention_months: 12 }
};

r.get('/api/statistics', async (c) => {
  refusePagination(c);
  const rows = await q('SELECT * FROM statistics ORDER BY key');
  return c.json(rows.map(s => ({ key: s.key, value: s.value, source: s.source, year: s.year, geography: s.geography })));
});

r.get('/api/positions', async (c) => {
  refusePagination(c);
  const rows = await q('SELECT * FROM positions ORDER BY id');
  return c.json(rows.map(p => ({ title: p.title, location: p.location, department: p.department, contract_type: p.contract_type, closes_on: isoD(p.closes_on) })));
});

r.get('/api/news', async (c) => {
  refusePagination(c);
  const rows = await q('SELECT * FROM news_items ORDER BY date DESC');
  return c.json(rows.map(n => ({ title: n.title, tag: n.tag, outlet: n.outlet, date: isoD(n.date), link: n.link, language: n.language })));
});

r.get('/api/claim-register', async (c) => {
  refusePagination(c);
  const rows = await q('SELECT * FROM claim_substantiations ORDER BY id');
  const now = new Date();
  return c.json(rows.map(s => ({
    id: Number(s.id), claim: s.claim, route: s.route, first_published_on: isoD(s.first_published_on),
    evidence: s.evidence, method_version: s.method_version, approver: s.approver,
    review_on: isoD(s.review_on),
    evidence_expires_before_review: !!s.evidence?.expires_on && new Date(s.evidence.expires_on) < new Date(s.review_on),
    state: s.state
  })));
});

// Enquiries: each type has its own destination, response time and retention. One mail, no copies.
r.post('/api/enquiries', async (c) => {
  const b = await c.req.json();
  const type = enumField(b.type, 'type', Object.keys(ENQUIRY_TYPES));
  const name = reqField(b.name, 'name');
  const email = reqField(b.email, 'email');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('invalid_email');
  const message = b.message || '';
  const t = ENQUIRY_TYPES[type];
  const ref = `ENQ-${String(Number((await one('SELECT count(*) n FROM enquiries')).n) + 1).padStart(5, '0')}`;
  const tx = await client();
  try {
    await tx.query('BEGIN');
    await tx.query(`INSERT INTO enquiries (reference, type, name, email, message, destination, response_days, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7, now())`, [ref, type, name, email, message, t.destination, t.response_days]);
    const e = await entry(tx, { person: null, site: null, object: ref, act: 'enquiry_received',
      content: { reference: ref, type, destination: t.destination, response_days: t.response_days, retention_months: t.retention_months } });
    await tx.query('COMMIT');
    await sendMail(email, `Enquiry ${ref} received`,
      `Enquiry ${ref} received.\n\nReference: ${ref}\nDestination: ${t.destination}\nStated response time: ${t.response_days} days.\n\nYour data is received by Ravel Materials SAS, used to answer this enquiry, kept ${t.retention_months} months, and can be removed by writing to privacy@example.com.`);
    await rememberIdempotency(c, 201, { reference: ref, destination: t.destination, response_days: t.response_days, record_seq: e.seq });
    return c.json({ reference: ref, destination: t.destination, response_days: t.response_days, record_seq: e.seq }, 201);
  } catch (ex) { await tx.query('ROLLBACK'); throw ex; } finally { tx.release(); }
});

export default r;

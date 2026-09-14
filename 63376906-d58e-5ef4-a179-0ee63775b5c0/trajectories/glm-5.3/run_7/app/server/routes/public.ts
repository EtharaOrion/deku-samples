// Public site routes: statistics, positions, news, enquiries, verify, health detail.
import { Hono } from 'hono';
import { db } from '../dbindex.ts';
import { readJson, requireFields, rateLimit, deny } from '../middleware.js';
import { sendMail } from '../mail.js';
import { record } from '../engine/record.js';

export const publicSite = new Hono();

publicSite.get('/statistics', async (c) => {
  const rows = (await db.query('SELECT * FROM statistics ORDER BY key')).rows;
  return c.json(rows.map((r: any) => ({ key: r.key, value: r.value, source: r.source, year: Number(r.year), geography: r.geography })));
});

publicSite.get('/positions', async (c) => {
  const rows = (await db.query('SELECT * FROM positions ORDER BY id')).rows;
  return c.json(rows.map((r: any) => ({ id: r.id, title: r.title, location: r.location, department: r.department, contract_type: r.contract_type, closes_on: r.closes_on })));
});

publicSite.get('/news', async (c) => {
  const rows = (await db.query('SELECT * FROM news_items ORDER BY published_on DESC')).rows;
  return c.json(rows.map((r: any) => ({ id: r.id, title: r.title, tag: r.tag, outlet: r.outlet, published_on: r.published_on, link: r.link, language: r.language })));
});

publicSite.get('/claim-register', async (c) => {
  const s = await requireSessionSafe(c);
  if (!s) deny('session_required', 'The claim register is an internal surface.', 401);
  const rows = (await db.query('SELECT * FROM claim_substantiations ORDER BY key')).rows;
  return c.json(rows.map((r: any) => ({
    key: r.key, claim: r.claim, route: r.route, first_published_on: r.first_published_on,
    evidence: r.evidence, method_version: r.method_version, approver: r.approver, review_on: r.review_on
  })));
});

async function requireSessionSafe(c: any) {
  const h = c.req.header('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const r = await db.query('SELECT * FROM sessions WHERE token=$1 AND expires_at > now()', [m[1]]);
  if (!r.rows[0]) return null;
  const g = (await db.query('SELECT * FROM grants WHERE email=$1', [r.rows[0].email])).rows[0];
  return g || null;
}

const ENQUIRY_TYPES: Record<string, { destination: string; days: number }> = {
  waste_supply: { destination: 'feedstock@example.com', days: 3 },
  polymer_purchase: { destination: 'sales@example.com', days: 2 },
  partnership: { destination: 'partners@example.com', days: 5 },
  press: { destination: 'press@example.com', days: 1 }
};

publicSite.post('/enquiries', async (c) => {
  const body = await readJson(c);
  requireFields(body, ['type', 'email']);
  const t = ENQUIRY_TYPES[body.type];
  if (!t) deny('invalid_type', 'type must be one of waste_supply, polymer_purchase, partnership, press.', 400);

  const count = (await db.query('SELECT COALESCE(MAX(id),0)::int + 1 AS n FROM enquiries')).rows[0].n;
  const reference = 'ENQ-' + String(count).padStart(4, '0');
  const deadline = body.type === 'press' ? new Date(Date.now() + t.days * 86400000).toISOString().slice(0, 10) : null;

  let opened_record: string | null = null;
  if (body.type === 'waste_supply') {
    opened_record = 'collector enquiry record opened for ' + (body.name || body.email);
  } else if (body.type === 'polymer_purchase') {
    opened_record = 'conformance record opened for ' + (body.name || body.email);
  }

  await db.query(
    `INSERT INTO enquiries (reference,type,destination,response_days,name,email,message,deadline,opened_record)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [reference, body.type, t.destination, t.days, body.name || null, body.email, body.message || null, deadline, opened_record]
  );

  await sendMail({
    to: body.email,
    subject: `Enquiry ${reference} received`,
    text: [
      `Reference: ${reference}`,
      `Destination: ${t.destination}`,
      `Stated response time: ${t.days} working days`,
      '',
      'We have received your enquiry. The named destination will reply within the stated response time.',
      'The data you sent is used to answer this enquiry, is kept for the retention stated in our privacy policy, and can be removed on request at privacy@example.com.'
    ].join('\n')
  });

  await record(db, { person: body.email || 'anonymous', act: 'enquiry_received', object_kind: 'enquiry', object_reference: reference, detail: { type: body.type, destination: t.destination, response_days: t.days } });

  return c.json({ reference, destination: t.destination, response_days: t.days, deadline, opened_record }, 201);
});

// public verification, unauthenticated and rate limited
publicSite.get('/verify/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for') || 'anon';
  const ok = await rateLimit(c, 'verify:' + ip, 120, 60);
  if (!ok) return c.json({ error: 'rate_limited', message: 'Too many verification requests.' }, 429);
  const number = c.req.param('number');
  const cert = (await db.query('SELECT * FROM certificates WHERE number=$1', [number])).rows[0];
  if (!cert) return c.json({ found: false, number });
  let recipientName = cert.recipient;
  try {
    const g = await db.query('SELECT name FROM grants WHERE email=$1', [cert.recipient]);
    if (!g.rows[0]) {
      const party = await db.query(
        'SELECT name FROM party_versions WHERE party=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1',
        [cert.recipient, String(cert.signed_at).slice(0,10)]
      );
      if (party.rows[0]) recipientName = party.rows[0].name;
    }
  } catch {}
  return c.json({
    found: true,
    number: cert.number,
    state: cert.state,
    issued_on: String(cert.signed_at).slice(0,10),
    withdrawn_on: cert.withdrawn_on || null,
    withdrawal_reason: cert.withdrawal_reason || null,
    site: cert.site,
    grade: cert.grade,
    claim_type: cert.claim_type,
    recipient_name: recipientName
  });
});

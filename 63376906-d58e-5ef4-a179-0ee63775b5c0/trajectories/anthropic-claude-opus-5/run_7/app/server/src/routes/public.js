import { Hono } from 'hono';
import { q, one } from '../db.js';
import { append } from '../record.js';
import { withIdempotency, ok } from '../http.js';
import { enquiryReceived } from '../mail.js';

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

export const publicRoutes = new Hono();

publicRoutes.get('/statistics', async (c) => {
  const rows = await q('SELECT key, value, source, year, geography FROM statistic ORDER BY key');
  // A figure that cannot carry a source, a year and a geography is not published.
  return c.json(rows.filter((r) => r.source && r.year && r.geography));
});

publicRoutes.get('/positions', async (c) => {
  const rows = await q('SELECT id, title, location, department, contract_type, closes_on FROM position ORDER BY closes_on');
  return c.json(rows.map((r) => ({ ...r, closes_on: iso(r.closes_on) })));
});

publicRoutes.get('/news', async (c) => {
  const rows = await q('SELECT id, title, tag, item_date, outlet, link, language, coverage FROM news_item ORDER BY item_date DESC');
  return c.json(rows.map((r) => ({
    id: r.id, title: r.title, tag: r.tag, date: iso(r.item_date),
    outlet: r.outlet, link: r.link, language: r.language, coverage: r.coverage
  })));
});

publicRoutes.get('/claim-register', async (c) => {
  const rows = await q('SELECT * FROM claim_substantiation ORDER BY id');
  const today = new Date().toISOString().slice(0, 10);
  return c.json(rows.map((r) => ({
    id: r.id, claim: r.claim, route: r.route, first_published: iso(r.first_published),
    evidence: r.evidence, method_version: r.method_version, approver: r.approver,
    review_date: iso(r.review_date), evidence_expires_on: iso(r.evidence_expires_on),
    state: r.state,
    // A claim whose evidence expires is reported before its review date.
    evidence_expired: r.evidence_expires_on ? iso(r.evidence_expires_on) < today : false,
    reported_before_review: r.evidence_expires_on ? iso(r.evidence_expires_on) < iso(r.review_date) : false
  })));
});

const ENQUIRY_TYPES = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 }
};

publicRoutes.post('/enquiries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/enquiries', body, async () => {
    const type = body.type;
    if (!ENQUIRY_TYPES[type]) {
      return ok({ error: 'unknown_enquiry_type', accepted: Object.keys(ENQUIRY_TYPES) }, 400);
    }
    if (!body.email) return ok({ error: 'email_required', rule: 'An enquiry carries an address to answer.' }, 400);
    const { destination, response_days } = ENQUIRY_TYPES[type];
    const n = await one(`SELECT count(*)::int AS n FROM enquiry`);
    const reference = `ENQ-${String(n.n + 1).padStart(4, '0')}`;
    const deadline = type === 'press'
      ? new Date(Date.now() + response_days * 86400000).toISOString().slice(0, 10)
      : null;
    await q(
      `INSERT INTO enquiry (reference, type, name, email, organisation, message, destination, response_days, deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [reference, type, body.name || null, body.email, body.organisation || null,
        body.message || null, destination, response_days, deadline]
    );

    // A waste-supply enquiry opens a collector record; a polymer enquiry opens a conformance record.
    let opened = null;
    if (type === 'waste_supply') {
      const ref = `COL-ENQ-${String(n.n + 1).padStart(4, '0')}`;
      await q(`INSERT INTO party (reference, kind) VALUES ($1,'collector') ON CONFLICT DO NOTHING`, [ref]);
      await q(`INSERT INTO party_version (party, name, effective_from) VALUES ($1,$2,CURRENT_DATE)`,
        [ref, body.organisation || body.name || body.email]);
      await q(
        `INSERT INTO collector (reference, country, registration, registration_expiry, scheme_status)
         VALUES ($1,'--','pending',CURRENT_DATE + 365,'applicant') ON CONFLICT DO NOTHING`, [ref]
      );
      opened = { kind: 'collector', reference: ref };
    } else if (type === 'polymer_purchase') {
      const row = await one(
        `INSERT INTO conformance (customer, application, specification_version, outcome, started_on)
         VALUES ('CUS-HELIOS', $1, 3, 'enquiry_opened', CURRENT_DATE) RETURNING id`,
        [body.message ? String(body.message).slice(0, 120) : 'polymer purchase enquiry']
      );
      opened = { kind: 'conformance', reference: `CNF-${row.id}` };
    }

    let mail = null;
    try {
      mail = await enquiryReceived({ reference, email: body.email, destination, response_days });
    } catch (err) {
      mail = { error: String(err.message) };
    }

    await append(null, {
      act: 'enquiry_received', person: body.email, object_kind: 'enquiry', object_ref: reference,
      content: { type, destination, response_days, opened, mail }
    });

    return ok({
      reference, type, destination, response_days, deadline, opened,
      data_protection: {
        recipient: 'Ravel Materials SAS',
        purpose: 'to answer this enquiry',
        retention_months: type === 'press' ? 12 : type === 'partnership' ? 24 : 36,
        removal: 'privacy@example.com'
      }
    }, 201);
  });
});

publicRoutes.get('/enquiry-destinations', async (c) =>
  c.json(Object.entries(ENQUIRY_TYPES).map(([type, v]) => ({ type, ...v }))));

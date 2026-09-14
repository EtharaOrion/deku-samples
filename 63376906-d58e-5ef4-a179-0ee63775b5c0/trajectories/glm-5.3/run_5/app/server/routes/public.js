import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { sendMail } from '../lib/mail.js';

export const ENQUIRY_DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3, opens: 'collector' },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2, opens: 'conformance' },
  partnership: { destination: 'partners@example.com', response_days: 5, opens: null },
  press: { destination: 'press@example.com', response_days: 1, opens: null }
};

const r = new Hono();

// Scoped helper: every mutating route re-decides authorisation server-side.
export function requireSession() {
  return async (c, next) => {
    const s = await currentSession(c);
    if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
    c.set('session', s);
    await next();
  };
}

export function requireRoles(...roles) {
  return async (c, next) => {
    const s = await currentSession(c);
    if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (!hasRole(s, ...roles)) {
      return Response.json({
        error: 'forbidden',
        reason: 'role_not_permitted',
        message: `This act is not permitted for ${s.roles.join(', ')}.`
      }, { status: 403 });
    }
    c.set('session', s);
    await next();
  };
}

// Four complete-set routes refuse pagination outright.
export function refusePagination() {
  return async (c, next) => {
    for (const p of ['page', 'limit', 'offset', 'cursor']) {
      if (c.req.query(p) !== undefined) {
        return Response.json({
          error: 'pagination_refused',
          message: 'This route answers a complete set. A caller handed a page resolves a page and believes the work is finished.'
        }, { status: 400 });
      }
    }
    await next();
  };
}

export { withIdempotency, appendEntry, sendMail, currentSession };

r.get('/statistics', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM statistic ORDER BY key')).rows;
  return c.json(rows.map((s) => ({ key: s.key, value: s.value, source: s.source, year: s.year, geography: s.geography })));
});

r.get('/positions', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM position ORDER BY id')).rows;
  return c.json(rows.map((p) => ({
    title: p.title, location: p.location, department: p.department,
    contract_type: p.contract_type, closes_on: p.closes_on
  })));
});

r.get('/news', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM news_item ORDER BY published_on DESC')).rows;
  return c.json(rows.map((n) => ({
    title: n.title, tag: n.tag, outlet: n.outlet, date: n.published_on, link: n.link, language: n.language
  })));
});

r.get('/claim-register', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM claim_substantiation ORDER BY id')).rows;
  return c.json(rows.map((s) => ({
    claim: s.claim,
    route: s.route,
    first_published_on: s.first_published_on,
    evidence: s.evidence,
    method_version: s.method_version,
    approver: s.approver,
    review_on: s.review_on,
    withdrawn_on: s.withdrawn_on,
    evidence_expiring: s.review_on ? new Date(s.review_on).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90 : false
  })));
});

r.post('/enquiries', async (c) => {
  const db = c.get('db');
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const spec = ENQUIRY_DESTINATIONS[body.type];
    if (!spec) {
      return Response.json({ error: 'invalid_enquiry_type', message: 'type must be one of waste_supply, polymer_purchase, partnership, press' }, { status: 400 });
    }
    if (!body.from_email) {
      return Response.json({ error: 'invalid_request', message: 'from_email is required' }, { status: 400 });
    }
    const count = await db.query('SELECT count(*)::int AS n FROM enquiry');
    const reference = `ENQ-${String(count.rows[0].n + 1).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO enquiry (reference,type,destination,response_days,from_name,from_email,message,recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
      [reference, body.type, spec.destination, spec.response_days, body.from_name || null, body.from_email, body.message || null]);

    if (spec.opens === 'collector') {
      await db.query(
        `INSERT INTO party_version (party_ref,name,effective_from) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [`PROSPECT-${reference}`, body.from_name || body.from_email, new Date().toISOString().slice(0, 10)]);
    }
    if (spec.opens === 'conformance') {
      await db.query(
        `INSERT INTO conformance (customer,application,spec_grade,spec_version,trials,outcome)
         VALUES ($1,$2,'N6',3,'[]','enquiry_received') ON CONFLICT DO NOTHING`,
        [`PROSPECT-${reference}`, 'polymer_purchase']);
    }

    await appendEntry(db, {
      kind: 'enquiry_received', object_ref: reference, person: 'public', site: null,
      content: { reference, type: body.type, destination: spec.destination, response_days: spec.response_days }
    });

    await sendMail(spec.destination, `Enquiry ${reference} received`,
      `Reference: ${reference}\nType: ${body.type}\nDestination: ${spec.destination}\nStated response time: ${spec.response_days} working days.\n\nThe enquirer receives this acknowledgement only. The point of collection states who receives the data, what it is used for, how long it is kept and how to have it removed.`);

    return Response.json({
      reference, destination: spec.destination, response_days: spec.response_days
    }, { status: 201 });
  });
});

export default r;

import { Hono } from 'hono';
import { rq, rq1, tx } from '../db/pool.js';
import { appendEntry } from '../lib/record.js';
import { idempotent, refuse, today } from '../lib/http.js';
import { mailEnquiryReceived } from '../lib/mail.js';

export const publicRoutes = new Hono();

/** A published figure that cannot carry a source, a year and a geography is
 *  not published. The filter is in the query, not in the copy. */
publicRoutes.get('/statistics', async (c) => {
  const rows = await rq(
    `SELECT key, value, source, year, geography FROM statistic
      WHERE source <> '' AND year IS NOT NULL AND geography <> '' ORDER BY key`
  );
  return c.json(rows);
});

publicRoutes.get('/positions', async (c) => {
  const rows = await rq(
    'SELECT reference, title, location, department, contract_type, closes_on FROM position ORDER BY closes_on'
  );
  return c.json(rows.map((r) => ({ ...r, closes_on: String(r.closes_on).slice(0, 10) })));
});

publicRoutes.get('/news', async (c) => {
  const rows = await rq(
    'SELECT reference, title, tag, outlet, published_on, link, language FROM news_item ORDER BY published_on DESC'
  );
  return c.json(rows.map((r) => ({ ...r, published_on: String(r.published_on).slice(0, 10) })));
});

publicRoutes.get('/claim-register', async (c) => {
  const rows = await rq('SELECT * FROM claim_substantiation ORDER BY reference');
  const t = today();
  return c.json(rows.map((r) => ({
    reference: r.reference,
    claim: r.claim,
    route: r.route,
    first_published: String(r.first_published).slice(0, 10),
    evidence: r.evidence,
    evidence_expires_on: r.evidence_expires_on ? String(r.evidence_expires_on).slice(0, 10) : null,
    method_version: r.method_version,
    approver: r.approver,
    review_on: String(r.review_on).slice(0, 10),
    state: r.state,
    // A claim whose evidence expires is reported before its review date.
    evidence_expired: !!r.evidence_expires_on && String(r.evidence_expires_on).slice(0, 10) < t,
    reportable_before_review: !!r.evidence_expires_on
      && String(r.evidence_expires_on).slice(0, 10) < String(r.review_on).slice(0, 10)
  })));
});

const ENQUIRY_DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 }
};

publicRoutes.post('/enquiries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const type = body.type;
  const dest = ENQUIRY_DESTINATIONS[type];
  if (!dest) {
    throw refuse(400, 'unknown_enquiry_type',
      'An enquiry is one of waste_supply, polymer_purchase, partnership or press.', { received: type ?? null });
  }
  if (!body.email || !body.name || !body.message) {
    throw refuse(400, 'missing_field', 'An enquiry carries a name, an email address and a message.');
  }

  const result = await idempotent(c, 'POST /api/enquiries', body, async () => {
    const opened = await tx(async (client) => {
      const n = await client.query("SELECT count(*)::int AS n FROM enquiry");
      const ref = `ENQ-${String(n.rows[0].n + 1).padStart(4, '0')}`;
      // A waste-supply enquiry opens a collector record; a polymer enquiry opens
      // a conformance record; a press enquiry carries a deadline.
      let opened = null;
      let deadline = null;
      if (type === 'waste_supply') opened = `collector_record_opened:${ref}`;
      if (type === 'polymer_purchase') opened = `conformance_record_opened:${ref}`;
      if (type === 'press') {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        deadline = d.toISOString().slice(0, 10);
      }
      await client.query(
        `INSERT INTO enquiry (reference,type,name,email,organisation,message,destination,response_days,deadline,opened_record)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ref, type, body.name, body.email, body.organisation || null, body.message,
          dest.destination, dest.response_days, deadline, opened]
      );
      await appendEntry(client, {
        act: 'enquiry_received', object_kind: 'enquiry', object_ref: ref,
        content: { type, destination: dest.destination, response_days: dest.response_days, opened_record: opened }
      });
      return { reference: ref, deadline, opened };
    });

    try {
      await mailEnquiryReceived({
        reference: opened.reference, email: body.email,
        destination: dest.destination, response_days: dest.response_days
      });
    } catch {
      // The enquiry is recorded whether or not the mail leaves; the record is
      // the fact and the mail is the courtesy.
    }

    return {
      status: 201,
      body: {
        reference: opened.reference,
        type,
        destination: dest.destination,
        response_days: dest.response_days,
        deadline: opened.deadline,
        opened_record: opened.opened,
        retention_months: type === 'press' ? 12 : (type === 'partnership' ? 24 : 36),
        controller: 'Ravel Materials SAS',
        rights_request: 'privacy@example.com'
      }
    };
  });

  return c.json(result.body, result.status);
});

/** GET /api/verify/{number} is public, unauthenticated and rate limited. It
 *  returns exactly eleven fields and nothing else: no yield, no collector, no
 *  genealogy, no carbon breakdown. An unknown number returns 200 with found
 *  false rather than an error, so the route cannot enumerate the customer list.
 */
const rateBuckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { count: 0, reset: now + 60000 };
  if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + 60000; }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now > v.reset) rateBuckets.delete(k);
  }
  return bucket.count > 120;
}

publicRoutes.get('/verify/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'anonymous';
  if (rateLimited(ip)) {
    return c.json({ error: 'rate_limited', detail: 'Too many verification requests. Try again in a minute.' }, 429);
  }
  const number = c.req.param('number');
  const row = await rq1(
    `SELECT number, state, issued_on, withdrawn_on, withdrawal_reason, site, grade, claim_type, recipient_name
       FROM certificate WHERE number = $1`, [number]
  );
  if (!row) {
    return c.json({
      found: false, number, state: null, issued_on: null, withdrawn_on: null,
      withdrawal_reason: null, site: null, grade: null, claim_type: null, recipient_name: null
    });
  }
  return c.json({
    found: true,
    number: row.number,
    state: row.state,
    issued_on: String(row.issued_on).slice(0, 10),
    withdrawn_on: row.withdrawn_on ? String(row.withdrawn_on).slice(0, 10) : null,
    withdrawal_reason: row.withdrawal_reason,
    site: row.site,
    grade: row.grade,
    claim_type: row.claim_type,
    recipient_name: row.recipient_name
  });
});

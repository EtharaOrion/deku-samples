import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { all, one, query } from '../db.js';
import { asDate, idempotent, recordAct, refuse, refusePagination, requireFields } from '../http.js';
import { sendMail } from '../mail.js';

const app = new Hono();

const ENQUIRY_DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 },
};

app.get('/statistics', async (c) => {
  const rows = await all('select * from statistic order by key asc');
  // A figure that cannot carry a source, a year and a geography is not published.
  return c.json(
    rows
      .filter((r) => r.source && r.year && r.geography)
      .map((r) => ({ key: r.key, value: r.value, source: r.source, year: r.year, geography: r.geography })),
  );
});

app.get('/positions', async (c) => {
  const rows = await all('select * from position order by closes_on asc');
  return c.json(rows.map((r) => ({
    reference: r.reference,
    title: r.title,
    location: r.location,
    department: r.department,
    contract_type: r.contract_type,
    closes_on: asDate(r.closes_on),
  })));
});

app.get('/news', async (c) => {
  const rows = await all('select * from news_item order by published_on desc');
  return c.json(rows.map((r) => ({
    reference: r.reference,
    title: r.title,
    tag: r.tag,
    outlet: r.outlet,
    date: asDate(r.published_on),
    link: r.link,
    language: r.language,
    summary: r.summary,
  })));
});

app.get('/claim-register', async (c) => {
  const rows = await all('select * from claim_substantiation order by reference asc');
  const today = new Date().toISOString().slice(0, 10);
  return c.json(rows.map((r) => ({
    reference: r.reference,
    claim: r.claim,
    route: r.route,
    first_published_on: asDate(r.first_published_on),
    evidence: r.evidence,
    evidence_expires_on: asDate(r.evidence_expires_on),
    method_version: r.method_version,
    approver: r.approver,
    review_on: asDate(r.review_on),
    state: r.state,
    // A claim whose evidence expires is reported before its review date.
    evidence_expired: !!r.evidence_expires_on && asDate(r.evidence_expires_on) < today,
    reported_before_review: !!r.evidence_expires_on && asDate(r.evidence_expires_on) < asDate(r.review_on),
  })));
});

// Public, unauthenticated, rate limited, and it cannot be used to enumerate
// the customer list: an unknown number is an ordinary 200.
const verifyHits = new Map();
app.get('/verify/:number', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const now = Date.now();
  const window = (verifyHits.get(ip) || []).filter((t) => now - t < 60000);
  if (window.length >= 120) {
    return c.json({ error: 'rate_limited', message: 'Too many verification requests. Try again in a minute.' }, 429);
  }
  window.push(now);
  verifyHits.set(ip, window);

  const number = c.req.param('number');
  const cert = await one('select * from certificate where number = $1', [number]);
  if (!cert) {
    return c.json({
      found: false,
      number,
      state: null,
      issued_on: null,
      withdrawn_on: null,
      withdrawal_reason: null,
      site: null,
      grade: null,
      claim_type: null,
      recipient_name: null,
    });
  }
  return c.json({
    found: true,
    number: cert.number,
    state: cert.state,
    issued_on: asDate(cert.issued_on),
    withdrawn_on: cert.withdrawal ? cert.withdrawal.withdrawn_on : null,
    withdrawal_reason: cert.withdrawal ? cert.withdrawal.reason : null,
    site: cert.site,
    grade: cert.grade,
    claim_type: cert.claim_type,
    recipient_name: cert.recipient_name,
  });
});

app.post('/enquiries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['type']);
  const spec = ENQUIRY_DESTINATIONS[body.type];
  if (!spec) {
    refuse(400, 'unknown_enquiry_type', {
      message: 'type is one of waste_supply, polymer_purchase, partnership, press.',
      field: 'type',
    });
  }
  requireFields(body, ['email']);
  const result = await idempotent(c, 'POST /api/enquiries', body, async () => {
    const reference = `ENQ-${randomUUID().slice(0, 8).toUpperCase()}`;
    const deadline = body.type === 'press'
      ? new Date(Date.now() + spec.response_days * 86400000).toISOString().slice(0, 10)
      : null;
    await query(
      `insert into enquiry (reference,type,name,email,organisation,message,destination,response_days,deadline)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [reference, body.type, body.name || null, body.email, body.organisation || null,
        body.message || null, spec.destination, spec.response_days, deadline],
    );
    // A waste-supply enquiry opens a collector record; a polymer enquiry opens
    // a conformance record.
    let opened = null;
    if (body.type === 'waste_supply') {
      const ref = `COL-${reference.slice(4)}`;
      await query(
        `insert into collector (reference,name,country,registration,registration_expiry,scheme_status,account_email)
         values ($1,$2,$3,'pending','2027-12-31','enquired',$4)`,
        [ref, body.organisation || body.name || body.email, body.country || 'unknown', body.email],
      );
      await query(
        `insert into party_version (reference,kind,name,effective_from) values ($1,'collector',$2,$3)`,
        [ref, body.organisation || body.name || body.email, new Date().toISOString().slice(0, 10)],
      );
      opened = { kind: 'collector', reference: ref };
    } else if (body.type === 'polymer_purchase') {
      const ref = `CUS-${reference.slice(4)}`;
      await query(
        `insert into customer (reference,name,contact,holds_specification_version,application,industry)
         values ($1,$2,$3,3,$4,'enquired') on conflict do nothing`,
        [ref, body.organisation || body.name || body.email, body.email, body.application || 'not stated'],
      );
      await query(
        `insert into conformance (customer,application,specification_version,outcome) values ($1,$2,3,'not_started')`,
        [ref, body.application || 'not stated'],
      );
      opened = { kind: 'conformance', reference: ref };
    }
    const subject = `Enquiry ${reference} received`;
    const text = [
      `Enquiry ${reference} received.`,
      '',
      `Reference: ${reference}`,
      `Destination: ${spec.destination}`,
      `Stated response time: ${spec.response_days} working days`,
      deadline ? `Press deadline: ${deadline}` : null,
      '',
      'Ravel Materials SAS holds the detail you sent for the retention stated in the privacy notice at ravel.example.com/privacy.',
    ].filter(Boolean).join('\n');
    await sendMail({ to: body.email, subject, text, act: 'enquiry_received', object_reference: reference });
    await recordAct({
      act: 'enquiry_received', actor: body.email, site: null,
      object_kind: 'enquiry', object_reference: reference,
      content: { type: body.type, destination: spec.destination, response_days: spec.response_days, opened },
    });
    return {
      status: 201,
      body: {
        reference,
        type: body.type,
        destination: spec.destination,
        response_days: spec.response_days,
        deadline,
        opened,
      },
    };
  });
  return c.json(result.body, result.status);
});

app.get('/sites', async (c) => {
  const rows = await all('select * from site order by nameplate_kg asc');
  return c.json(rows.map((s) => ({
    reference: s.reference,
    name: s.name,
    confidence: s.confidence,
    certification_state: s.certification_state,
  })));
});

app.get('/sites/:reference/capacity', async (c) => {
  const s = await one('select * from site where reference = $1', [c.req.param('reference')]);
  if (!s) refuse(404, 'not_found', { message: 'No such site.' });
  return c.json({
    reference: s.reference,
    name: s.name,
    nameplate_kg: s.nameplate_kg,
    basis: s.capacity_basis,
    contracted_kg: s.contracted_kg,
    uncommitted_kg: s.nameplate_kg - s.contracted_kg,
    confidence: s.confidence,
    last_revised: asDate(s.last_revised),
    derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg, computed' },
  });
});

app.get('/specifications', async (c) => {
  refusePagination(c);
  const rows = await all('select * from specification order by grade asc, version desc');
  return c.json(rows.map((s) => ({
    grade: s.grade, version: s.version, issued_on: asDate(s.issued_on),
    superseded: s.superseded, properties: s.properties, virgin_reference: s.virgin_reference,
  })));
});

app.get('/specifications/:grade/versions/:version', async (c) => {
  const grade = c.req.param('grade').replace(/^SPEC-/i, '');
  const version = Number(c.req.param('version'));
  const spec = await one('select * from specification where grade = $1 and version = $2', [grade, version]);
  if (!spec) refuse(404, 'not_found', { message: 'No such specification version.' });
  const issues = await all('select * from specification_issue where grade = $1 and version = $2', [grade, version]);
  return c.json({
    grade: spec.grade,
    version: spec.version,
    issued_on: asDate(spec.issued_on),
    superseded: spec.superseded,
    properties: spec.properties,
    virgin_reference: spec.virgin_reference,
    issued_to: issues.map((i) => ({ customer: i.customer, issued_on: asDate(i.issued_on), issued_by: i.issued_by })),
  });
});

app.get('/process-diagram', async (c) => {
  // The plant diagram is generated from the four run types, so it stays
  // correct when a stage changes, and carries mass in and mass out per stage.
  const [runs, consumptions, outputs] = await Promise.all([
    all('select * from run order by started_at asc'),
    all('select * from consumption'),
    all('select * from output'),
  ]);
  const stages = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
  const byRun = (rows, ref) => rows.filter((r) => r.run === ref);
  return c.json(stages.map((stage) => {
    const stageRuns = runs.filter((r) => r.run_type === stage);
    const mass_in_g = stageRuns.reduce((s, r) => s + byRun(consumptions, r.reference).reduce((t, x) => t + x.mass_g, 0), 0);
    const mass_out_g = stageRuns.reduce((s, r) => s + byRun(outputs, r.reference).reduce((t, x) => t + x.mass_g, 0), 0);
    return {
      stage,
      runs: stageRuns.length,
      mass_in_g,
      mass_out_g,
      losses_g: mass_in_g - mass_out_g,
      derivation: { source: 'consumption and output records for every run of this type' },
    };
  }));
});

export default app;

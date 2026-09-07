import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import { withIdempotency, refuse, requireFields, nextReference, today, refusePagination } from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { sendMail } from '../lib/mail.js';
import { iso } from '../engine/feedstock.js';

const r = new Hono();

// A figure that cannot carry a source, a year and a geography is not published.
r.get('/statistics', async (c) => {
  const rows = await q('SELECT * FROM statistic ORDER BY key ASC');
  return c.json(rows
    .filter((x) => x.source && x.year && x.geography)
    .map((x) => ({ key: x.key, value: x.value, source: x.source, year: x.year, geography: x.geography })));
});

r.get('/positions', async (c) => {
  const rows = await q('SELECT * FROM position ORDER BY closes_on ASC');
  return c.json(rows.map((x) => ({
    reference: x.reference, title: x.title, location: x.location,
    department: x.department, contract_type: x.contract_type, closes_on: iso(x.closes_on),
  })));
});

// One event appearing once with its coverage.
r.get('/news', async (c) => {
  const rows = await q('SELECT * FROM news_item ORDER BY item_date DESC');
  return c.json(rows.map((x) => ({
    reference: x.reference, title: x.title, tag: x.tag, outlet: x.outlet,
    date: iso(x.item_date), link: x.link, language: x.language,
  })));
});

// One substantiation record per published environmental claim.
r.get('/claim-register', async (c) => {
  const rows = await q('SELECT * FROM claim_substantiation ORDER BY reference ASC');
  const day = today();
  return c.json(rows.map((x) => ({
    reference: x.reference,
    claim: x.claim,
    route: x.route,
    first_published: iso(x.first_published),
    evidence: x.evidence,
    evidence_expires: iso(x.evidence_expires),
    method_version: x.method_version,
    approver: x.approver,
    review_date: iso(x.review_date),
    state: x.state,
    // a claim whose evidence expires is reported before its review date
    evidence_expiring_before_review: !!x.evidence_expires && iso(x.evidence_expires) < iso(x.review_date),
    evidence_expired: !!x.evidence_expires && iso(x.evidence_expires) < day,
  })));
});

const ENQUIRY_TYPES = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 },
};

r.get('/enquiry-types', (c) => c.json(
  Object.entries(ENQUIRY_TYPES).map(([type, v]) => ({ type, ...v }))
));

r.post('/enquiries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['type', 'name', 'email', 'message']);
    const spec = ENQUIRY_TYPES[body.type];
    if (!spec) {
      refuse(400, 'unknown_type', {
        error: 'unknown_type',
        message: 'An enquiry type is one of waste_supply, polymer_purchase, partnership, press.',
        types: Object.keys(ENQUIRY_TYPES),
      });
    }
    const reference = await nextReference('ENQ', 'enquiry');
    await pool.query(
      `INSERT INTO enquiry (reference, type, name, email, organisation, message, destination, response_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reference, body.type, body.name, body.email, body.organisation || null, body.message,
        spec.destination, spec.response_days]);

    // a waste-supply enquiry opens a collector record; a polymer enquiry opens a
    // conformance record; a press enquiry carries a deadline
    let opened = null;
    if (body.type === 'waste_supply') {
      const colRef = await nextReference('COL-ENQ', 'party');
      await pool.query('INSERT INTO party (reference, kind) VALUES ($1,$2) ON CONFLICT DO NOTHING', [colRef, 'collector']);
      await pool.query(
        'INSERT INTO party_version (party, name, identifier, effective_from) VALUES ($1,$2,$3,$4)',
        [colRef, body.organisation || body.name, reference, today()]);
      await pool.query(
        `INSERT INTO collector (reference, country, registration, registration_expiry, collection_site_types, declared_streams, scheme_status)
         VALUES ($1,$2,$3,$4,'[]','[]','enquiry') ON CONFLICT DO NOTHING`,
        [colRef, body.country || 'unknown', reference, addYears(today(), 1)]);
      opened = { kind: 'collector', reference: colRef };
    } else if (body.type === 'polymer_purchase') {
      opened = { kind: 'conformance', reference, note: 'A conformance record is opened against this enquiry.' };
    } else if (body.type === 'press') {
      opened = { kind: 'press_deadline', reference, deadline: addDays(today(), spec.response_days) };
    }

    await appendEntry(null, {
      person: body.email, object_kind: 'enquiry', object_ref: reference, action: 'received',
      content: { type: body.type, destination: spec.destination, response_days: spec.response_days, opened },
    });

    // the enquirer receives one mail
    await sendMail({
      to: body.email,
      subject: `Enquiry ${reference} received`,
      text: [
        `Thank you. Your enquiry has been received and given the reference ${reference}.`,
        '',
        `Reference: ${reference}`,
        `Destination: ${spec.destination}`,
        `Stated response time: ${spec.response_days} working day${spec.response_days === 1 ? '' : 's'}`,
        '',
        'Ravel Materials SAS is the controller of this data. It is used to answer your enquiry and for nothing else.',
        `An enquiry of this type is kept for ${retentionMonths(body.type)} months. To have it removed, write to privacy@example.com.`,
      ].join('\n'),
    });

    return {
      status: 201,
      body: {
        reference,
        type: body.type,
        destination: spec.destination,
        response_days: spec.response_days,
        opened,
        deadline: body.type === 'press' ? addDays(today(), spec.response_days) : null,
      },
    };
  });
  return c.json(out.body, out.status);
});

function retentionMonths(type) {
  return { waste_supply: 36, polymer_purchase: 36, press: 12 }[type] || 24;
}

function addDays(day, n) {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function addYears(day, n) {
  const d = new Date(day);
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

// The published privacy policy, as data, so the site cannot drift from it.
r.get('/privacy', (c) => c.json({
  controller: 'Ravel Materials SAS',
  postal_address: '14 rue des Fabriques, 69007 Lyon, France',
  rights_address: 'privacy@example.com',
  disclosure_address: 'security@example.com',
  retention: [
    { purpose: 'An enquiry', months: 24 },
    { purpose: 'A waste-supply enquiry', months: 36 },
    { purpose: 'A polymer enquiry', months: 36 },
    { purpose: 'A press enquiry', months: 12 },
    { purpose: 'An account and its acts', months: 120 },
    { purpose: 'The record', months: 180 },
  ],
  operational_record_statement: 'The operational record names individuals, is retained under a legal and scheme obligation, and is not erased on request. A former employee\'s contact detail is erased on request.',
}));

// The process diagram, generated from the four run types so it stays correct.
r.get('/process', async (c) => {
  const runs = await q('SELECT * FROM run');
  const consumptions = await q('SELECT * FROM consumption');
  const outputs = await q('SELECT * FROM output');
  const stages = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
  const labels = {
    dissolution: 'Dissolution',
    depolymerisation: 'Depolymerisation',
    purification: 'Purification',
    repolymerisation: 'Repolymerisation',
  };
  const descriptions = {
    dissolution: 'Mixed polyamide waste is dissolved in a green solvent blend, leaving dyes, coatings, elastane and foreign matter behind as residue.',
    depolymerisation: 'The dissolved polymer is broken back to monomer at low temperature and pressure, so the chain length that a mechanical route loses is recovered instead.',
    purification: 'The monomer is purified to virgin specification, and the byproduct stream is separated and either sold or disposed of.',
    repolymerisation: 'The purified monomer is polymerised to pellet at the relative viscosity the specification names.',
  };
  return c.json(stages.map((stage) => {
    const stageRuns = runs.filter((x) => x.run_type === stage);
    const refs = stageRuns.map((x) => x.reference);
    const massIn = consumptions.filter((x) => refs.includes(x.run)).reduce((s, x) => s + Number(x.mass_g), 0);
    const massOut = outputs.filter((x) => refs.includes(x.run)).reduce((s, x) => s + Number(x.mass_g), 0);
    return {
      stage,
      label: labels[stage],
      description: descriptions[stage],
      run_count: stageRuns.length,
      mass_in_g: massIn,
      mass_out_g: massOut,
      losses_g: massIn - massOut,
    };
  }));
});

export default r;

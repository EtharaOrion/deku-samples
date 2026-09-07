import { Hono } from 'hono';
import { q, one, pool } from '../lib/db.js';
import { refuse, noPaging, withIdempotency, nextRef } from '../lib/http.js';
import { requireSession, requireRole } from './middleware.js';
import { appendEntry } from '../lib/record.js';
import { sendMail } from '../lib/mail.js';
import { requireInt, mulDiv, floorDiv, dayOf } from '../lib/num.js';
import { lotClaim } from '../engine/ledger.js';

const r = new Hono();

/* ------------------------------------------------------------ inbound */

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

r.post('/inbound/:source', async (c) => {
  const s = requireSession(c);
  const source = c.req.param('source');
  if (!SOURCES.includes(source)) throw refuse(400, 'invalid_source', `source is one of ${SOURCES.join(', ')}.`);
  const raw = await c.req.text();
  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    throw refuse(400, 'invalid_json', 'The record must be JSON.');
  }
  const out = await withIdempotency(c, `POST /inbound/${source}`, body, async () => {
    const { received_at, payload } = body;
    if (!received_at || payload === undefined) throw refuse(400, 'fields_required', 'An inbound record carries a received_at and a payload.');
    const reference = await nextRef('INB-', 'inbound_record');
    // payload_verbatim is the bytes exactly as they arrived rather than the shape
    // the app parsed them into.
    const verbatim = extractVerbatim(raw);
    await pool.query('insert into inbound_record (reference, source, received_at, payload, payload_verbatim) values ($1,$2,$3,$4,$5)', [reference, source, received_at, JSON.stringify(payload), verbatim]);
    await appendEntry(null, { act: 'inbound_record_received', person: s.email, person_id: s.person_id, object_kind: 'inbound_record', object_ref: reference, content: { source, received_at, payload_verbatim: verbatim } });
    return { status: 201, body: { reference, source, received_at, payload_verbatim: verbatim, note: 'The app opens no outbound connection to any source. It stores what arrives and shows the disagreement rather than resolving it.' } };
  });
  return c.json(out.body, out.status);
});

function extractVerbatim(raw) {
  const m = /"payload"\s*:\s*/.exec(raw);
  if (!m) return raw;
  const start = m.index + m[0].length;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; if (!inStr && depth === 0) return raw.slice(start, i + 1); continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') { depth -= 1; if (depth === 0) return raw.slice(start, i + 1); }
    else if (depth === 0 && (ch === ',' || ch === '}')) return raw.slice(start, i).trim();
  }
  return raw.slice(start).trim();
}

r.get('/inbound', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from inbound_record order by received_at asc');
  return c.json(rows.map((x) => ({ reference: x.reference, source: x.source, received_at: new Date(x.received_at).toISOString(), payload_verbatim: x.payload_verbatim })));
});

/* --------------------------------------------------- specifications */

r.get('/specifications', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from specification order by grade, version');
  return c.json(rows.map((x) => ({ grade: x.grade, version: x.version, issued_on: dayOf(x.issued_on), superseded: x.superseded, properties: x.rows_json, virgin_reference: x.virgin_reference })));
});

// The specifications section on the public product route carries the
// specification itself rather than a request button, so this answers without a
// session. It holds no personal data and no operational record.
r.get('/specifications/:grade/versions/:version', async (c) => {
  const x = await one('select * from specification where grade = $1 and version = $2', [c.req.param('grade'), Number(c.req.param('version'))]);
  if (!x) throw refuse(404, 'not_found', 'No such specification version.');
  const vr = x.virgin_reference || {};
  return c.json({
    grade: x.grade,
    version: x.version,
    issued_on: dayOf(x.issued_on),
    superseded: x.superseded,
    properties: (x.rows_json || []).map((row) => ({ property: row.property, method: row.method, limit: row.limit, unit: row.unit, basis: row.basis, tested_on_every_lot: row.basis === 'guaranteed' })),
    virgin_reference: { reference: vr.reference, source: vr.source, date: vr.dated },
  });
});

r.post('/specifications/:grade/versions/:version/issue', async (c) => {
  const s = await requireRole(c, 'specification_issued', 'quality_manager');
  const grade = c.req.param('grade');
  const version = Number(c.req.param('version'));
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /specifications/${grade}/versions/${version}/issue`, body, async () => {
    const { customer } = body;
    if (!customer) throw refuse(400, 'customer_required', 'A specification version is issued to a named customer.');
    const spec = await one('select * from specification where grade = $1 and version = $2', [grade, version]);
    if (!spec) throw refuse(404, 'not_found', 'No such specification version.');
    const cust = await one('select * from customer where reference = $1', [customer]);
    if (!cust) throw refuse(404, 'customer_not_found', 'No such customer.');
    const reference = await nextRef('SPI-', 'specification_issue');
    const on = new Date().toISOString().slice(0, 10);
    await pool.query('insert into specification_issue (reference, grade, version, customer, issued_on, recorded_by) values ($1,$2,$3,$4,$5,$6)', [reference, grade, version, customer, on, s.email]);
    await pool.query('update customer set holds_specification = $1, holds_specification_version = $2 where reference = $3', [grade, version, customer]);
    await appendEntry(null, { act: 'specification_issued', person: s.email, person_id: s.person_id, object_kind: 'specification_issue', object_ref: reference, content: { grade, version, customer, issued_on: on } });
    return { status: 201, body: { reference, grade, version, customer, customer_name: cust.name, issued_on: on } };
  });
  return c.json(out.body, out.status);
});

/* ------------------------------------------------------- customers */

r.get('/customers', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from customer order by reference');
  const conf = await q('select * from conformance');
  return c.json(rows.map((x) => shapeCustomer(x, conf)));
});

r.get('/customers/:reference', async (c) => {
  requireSession(c);
  const x = await one('select * from customer where reference = $1', [c.req.param('reference')]);
  if (!x) throw refuse(404, 'not_found', 'No such customer.');
  const conf = await q('select * from conformance where customer = $1', [x.reference]);
  return c.json(shapeCustomer(x, conf));
});

function shapeCustomer(x, conf) {
  return {
    reference: x.reference,
    name: x.name,
    contact: x.contact,
    language: x.language,
    holds_specification: x.holds_specification,
    holds_specification_version: x.holds_specification_version,
    application: x.application,
    industry: x.industry,
    conformance: conf
      .filter((y) => y.customer === x.reference)
      .map((y) => ({ reference: y.reference, application: y.application, specification: y.spec_grade, specification_version: y.spec_version, trials: y.trials, outcome: y.outcome, dated: y.dated ? dayOf(y.dated) : null })),
  };
}

/* --------------------------------------------------- change notices */

r.get('/change-notices', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from change_notice order by reference');
  const acks = await q('select * from change_notice_ack');
  return c.json(rows.map((x) => ({ reference: x.reference, title: x.title, detail: x.detail, parameter: x.parameter, qualification_relevant: x.qualification_relevant, specifications_affected: x.specifications_affected, customers_affected: x.customers_affected, qualifications_affected: x.qualifications_affected, notice_period_days: x.notice_period_days, state: x.state, raised_by: x.raised_by, raised_at: x.raised_at, released_at: x.released_at, blocking: x.blocking, acknowledgements: acks.filter((a) => a.change_notice === x.reference).map((a) => ({ reference: a.reference, customer: a.customer, kind: a.kind, recorded_at: a.recorded_at })) })));
});

r.post('/change-notices', async (c) => {
  const s = await requireRole(c, 'change_notice_raised', 'quality_manager', 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /change-notices', body, async () => {
    const { title, detail, parameter = null, grade = 'SPEC-N6' } = body;
    if (!title || !detail) throw refuse(400, 'fields_required', 'A change notice states what changes and why.');
    // The notice derives, rather than asserts, what it affects.
    const specs = await q('select * from specification where grade = $1 and superseded = false', [grade]);
    const customers = await q('select * from customer where holds_specification = $1', [grade]);
    const conformances = await q('select * from conformance where spec_grade = $1', [grade]);
    const QUAL_PARAMS = ['relative_viscosity', 'temperature_c', 'pressure_bar', 'moisture'];
    const qualification_relevant = parameter ? QUAL_PARAMS.includes(parameter) : false;
    const automotive = customers.filter((x) => x.industry === 'automotive');
    const qualifications_affected = conformances
      .filter((x) => customers.some((cu) => cu.reference === x.customer))
      .map((x) => ({ reference: x.reference, customer: x.customer, application: x.application, outcome: x.outcome }));
    const blocking = qualification_relevant && automotive.length
      ? automotive.map((x) => ({ customer: x.reference, name: x.name, industry: x.industry, reason: `A change touching a qualification-relevant parameter for a customer in the automotive industry blocks rather than warns. ${x.name} must acknowledge or waive before release.` }))
      : [];
    const reference = await nextRef('CHN-', 'change_notice');
    const notice_period_days = qualification_relevant ? 180 : 90;
    await pool.query('insert into change_notice (reference, title, detail, parameter, qualification_relevant, specifications_affected, customers_affected, qualifications_affected, notice_period_days, raised_by, blocking) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [reference, title, detail, parameter, qualification_relevant, JSON.stringify(specs.map((x) => `${x.grade} v${x.version}`)), JSON.stringify(customers.map((x) => ({ reference: x.reference, name: x.name, industry: x.industry }))), JSON.stringify(qualifications_affected), notice_period_days, s.email, JSON.stringify(blocking)]);
    await appendEntry(null, { act: 'change_notice_raised', person: s.email, person_id: s.person_id, object_kind: 'change_notice', object_ref: reference, content: { title, parameter, qualification_relevant, customers_affected: customers.map((x) => x.reference) } });
    return {
      status: 201,
      body: {
        reference,
        title,
        detail,
        parameter,
        qualification_relevant,
        specifications_affected: specs.map((x) => `${x.grade} v${x.version}`),
        customers_affected: customers.map((x) => ({ reference: x.reference, name: x.name, industry: x.industry })),
        qualifications_affected,
        notice_period_days,
        blocking,
        state: 'proposed',
        message: qualification_relevant ? `This change may invalidate ${qualifications_affected.length} customer qualifications.` : null,
      },
    };
  });
  return c.json(out.body, out.status);
});

r.post('/change-notices/:reference/notify', async (c) => {
  const s = await requireRole(c, 'change_notice_notified', 'quality_manager', 'claims_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /change-notices/${reference}/notify`, body, async () => {
    const cn = await one('select * from change_notice where reference = $1', [reference]);
    if (!cn) throw refuse(404, 'not_found', 'No such change notice.');
    const { customer, kind = 'notified' } = body;
    if (!customer) throw refuse(400, 'customer_required', 'One named customer is notified at a time.');
    const cust = await one('select * from customer where reference = $1', [customer]);
    if (!cust) throw refuse(404, 'customer_not_found', 'No such customer.');
    const ref = await nextRef('ACK-', 'change_notice_ack');
    await pool.query('insert into change_notice_ack (reference, change_notice, customer, kind, recorded_by) values ($1,$2,$3,$4,$5)', [ref, reference, customer, kind, s.email]);
    if (kind === 'notified') {
      setImmediate(() => {
        sendMail({
          to: cust.contact,
          subject: `Change notice ${reference} requires acknowledgement`,
          text: [`${cn.title}`, '', cn.detail, '', `Specifications affected: ${(cn.specifications_affected || []).join(', ')}`, `Notice period: ${cn.notice_period_days} days`, '', cn.qualification_relevant ? `This change may invalidate ${(cn.qualifications_affected || []).length} customer qualifications.` : '', '', `Please acknowledge or waive this notice.`].join('\n'),
        }).catch((e) => console.error('[mail]', e.message));
      });
    }
    await appendEntry(null, { act: `change_notice_${kind}`, person: s.email, person_id: s.person_id, object_kind: 'change_notice', object_ref: reference, content: { customer, kind } });
    return { status: 201, body: { reference: ref, change_notice: reference, customer, customer_name: cust.name, kind, notified_at: new Date().toISOString() } };
  });
  return c.json(out.body, out.status);
});

r.post('/change-notices/:reference/release', async (c) => {
  const s = await requireRole(c, 'change_notice_released', 'quality_manager');
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /change-notices/${reference}/release`, body, async () => {
    const cn = await one('select * from change_notice where reference = $1', [reference]);
    if (!cn) throw refuse(404, 'not_found', 'No such change notice.');
    if (cn.state === 'released') throw refuse(409, 'already_released', 'This change notice is already released.');
    const acks = await q('select * from change_notice_ack where change_notice = $1', [reference]);
    const owed = (cn.customers_affected || []).filter((x) => !acks.some((a) => a.customer === (x.reference || x)));
    if (owed.length) throw refuse(409, 'notice_owed', 'A release is refused until every customer owed notice has been notified or has waived it in a recorded act.', { owed: owed.map((x) => ({ customer: x.reference || x, name: x.name })) });
    const blocking = (cn.blocking || []).filter((b) => !acks.some((a) => a.customer === b.customer && ['acknowledged', 'waived'].includes(a.kind)));
    if (blocking.length) throw refuse(409, 'qualification_block', 'A change touching a qualification-relevant parameter for a customer in the automotive industry blocks rather than warns.', { blocking });
    await pool.query("update change_notice set state = 'released', released_at = $1 where reference = $2", [new Date().toISOString(), reference]);
    await appendEntry(null, { act: 'change_notice_released', person: s.email, person_id: s.person_id, object_kind: 'change_notice', object_ref: reference, content: { released_at: new Date().toISOString() } });
    return { status: 200, body: { reference, state: 'released', released_at: new Date().toISOString() } };
  });
  return c.json(out.body, out.status);
});

/* ------------------------------------------------------- contracts */

r.get('/contracts', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from contract order by id');
  const out = [];
  for (const x of rows) out.push(await projection(x));
  return c.json(out);
});

r.get('/contracts/:id/projection', async (c) => {
  noPaging(c);
  requireSession(c);
  const x = await one('select * from contract where id = $1', [c.req.param('id')]);
  if (!x) throw refuse(404, 'not_found', 'No such contract.');
  return c.json(await projection(x));
});

async function projection(x) {
  const allocs = await q('select * from contract_allocation where contract = $1 order by recorded_at', [x.id]);
  const delivered_g = allocs.reduce((s, a) => s + Number(a.mass_g), 0);
  const delivered_kg = Math.floor(delivered_g / 1000);
  const weightedContent = allocs.reduce((s, a) => s + Number(a.mass_g) * a.content_bp, 0);
  const running_content_bp = delivered_g ? floorDiv(BigInt(weightedContent), delivered_g) : 0;
  const committed_g = Number(x.committed_kg) * 1000;
  const remaining_g = Math.max(0, committed_g - delivered_g);
  // The average the remaining volume must reach for the floor to hold.
  const required_remaining_bp = remaining_g > 0 ? floorDiv(BigInt(committed_g) * BigInt(x.floor_bp) - BigInt(weightedContent), remaining_g) : 0;
  const state = required_remaining_bp > 10000 ? 'unreachable' : 'on_track';
  const site = await one('select * from site where reference = $1', [x.site]);
  const planned = site && site.confidence === 'planned';
  return {
    id: x.id,
    recipient: x.recipient,
    site: x.site,
    site_confidence: site ? site.confidence : null,
    period: x.period,
    delivered_kg,
    delivered_g,
    committed_kg: Number(x.committed_kg),
    running_content_bp,
    floor_bp: x.floor_bp,
    required_remaining_bp,
    remaining_kg: Math.floor(remaining_g / 1000),
    state,
    unreachable_on: state === 'unreachable' ? (x.unreachable_on ? dayOf(x.unreachable_on) : new Date().toISOString().slice(0, 10)) : null,
    unreachable_allocation: state === 'unreachable' ? (x.unreachable_allocation || (allocs.length ? allocs[allocs.length - 1].reference : null)) : null,
    planned_site_flag: planned,
    flag_dismissible: false,
    shortfall_consequence: x.shortfall_consequence,
    allocations: allocs.map((a) => ({ reference: a.reference, lot: a.lot, mass_g: Number(a.mass_g), content_bp: a.content_bp, decided_by: a.decided_by, favoured_over: a.favoured_over })),
    derivation: {
      running_content_bp: 'sum of (mass * content_bp) over delivered mass, floored',
      required_remaining_bp: '(committed_g * floor_bp - delivered weighted content) / remaining_g, floored',
      note: 'An unreachable floor is reported and never refused.',
    },
  };
}

r.post('/contracts/:id/allocations', async (c) => {
  const s = await requireRole(c, 'contract_allocation_made', 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, `POST /contracts/${id}/allocations`, body, async () => {
    const contract = await one('select * from contract where id = $1', [id]);
    if (!contract) throw refuse(404, 'not_found', 'No such contract.');
    const { lot, favoured_over = [] } = body;
    if (!lot) throw refuse(400, 'lot_required', 'An allocation attaches a lot to a contract.');
    const l = await one('select * from lot where reference = $1', [lot]);
    if (!l) throw refuse(404, 'lot_not_found', 'No such lot.');
    const already = await one('select * from contract_allocation where lot = $1', [lot]);
    if (already) throw refuse(409, 'lot_already_allocated', `A claim already allocated to ${already.contract} is refused a second attachment.`, { existing_contract: already.contract, existing_allocation: already.reference });
    const claim = await lotClaim(lot);
    const reference = await nextRef('CAL-', 'contract_allocation');
    // Where supply is short an allocation names the person who decided and the
    // contracts that went without. It is never an automatic sort by value.
    await pool.query('insert into contract_allocation (reference, contract, lot, mass_g, content_bp, decided_by, favoured_over) values ($1,$2,$3,$4,$5,$6,$7)', [reference, id, lot, Number(l.mass_g), claim.content_bp, s.email, JSON.stringify(favoured_over)]);
    await appendEntry(null, { act: 'contract_allocation_made', person: s.email, person_id: s.person_id, site: l.site, object_kind: 'contract_allocation', object_ref: reference, content: { contract: id, lot, mass_g: Number(l.mass_g), content_bp: claim.content_bp, decided_by: s.email, favoured_over } });
    const proj = await projection(await one('select * from contract where id = $1', [id]));
    return { status: 201, body: { reference, contract: id, lot, mass_g: Number(l.mass_g), content_bp: claim.content_bp, claim_type: l.claim_type, decided_by: s.email, favoured_over, projection: proj } };
  });
  return c.json(out.body, out.status);
});

/* ------------------------------------------------------- enquiries */

const DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 },
};

r.post('/enquiries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const out = await withIdempotency(c, 'POST /enquiries', body, async () => {
    const { type, name, email, organisation = null, message } = body;
    if (!DESTINATIONS[type]) throw refuse(400, 'invalid_type', `type is one of ${Object.keys(DESTINATIONS).join(', ')}.`);
    if (!name || !email || !message) throw refuse(400, 'fields_required', 'An enquiry carries a name, an email address and a message.');
    const { destination, response_days } = DESTINATIONS[type];
    const reference = await nextRef('ENQ-', 'enquiry');
    const deadline = type === 'press' ? new Date(Date.now() + response_days * 86400000).toISOString().slice(0, 10) : null;
    let opened = null;
    if (type === 'waste_supply') {
      // A waste-supply enquiry opens a collector record.
      const colRef = `COL-ENQ-${reference.slice(4)}`;
      await pool.query('insert into collector (reference, name, country, registration, registration_expiry, collection_site_types, declared_streams, scheme_status) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing', [colRef, organisation || name, 'unknown', 'pending', new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), JSON.stringify([]), JSON.stringify([]), 'enquiry']);
      opened = colRef;
    } else if (type === 'polymer_purchase') {
      // A polymer enquiry opens a conformance record.
      const cnfRef = await nextRef('CNF-', 'conformance');
      const cust = await one('select reference from customer limit 1');
      await pool.query('insert into conformance (reference, customer, application, spec_grade, spec_version, trials, outcome) values ($1,$2,$3,$4,$5,$6,$7)', [cnfRef, cust.reference, message.slice(0, 120), 'SPEC-N6', 3, JSON.stringify([]), 'enquiry_opened']);
      opened = cnfRef;
    }
    await pool.query('insert into enquiry (reference, type, name, email, organisation, message, destination, response_days, deadline, opened_record) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [reference, type, name, email, organisation, message, destination, response_days, deadline, opened]);
    setImmediate(() => {
      sendMail({
        to: email,
        subject: `Enquiry ${reference} received`,
        text: [`Thank you. Your enquiry has been received.`, '', `Reference: ${reference}`, `It has been routed to: ${destination}`, `We answer this kind of enquiry within ${response_days} working day${response_days === 1 ? '' : 's'}.`, '', 'Ravel Materials SAS receives this data to answer your enquiry. It is kept for the period stated in our privacy policy and you may have it removed by writing to privacy@example.com.'].join('\n'),
      }).catch((e) => console.error('[mail]', e.message));
    });
    await appendEntry(null, { act: 'enquiry_received', object_kind: 'enquiry', object_ref: reference, content: { type, destination, response_days, opened_record: opened } });
    return { status: 201, body: { reference, type, destination, response_days, deadline, opened_record: opened } };
  });
  return c.json(out.body, out.status);
});

r.get('/enquiries', async (c) => {
  noPaging(c);
  requireSession(c);
  const rows = await q('select * from enquiry order by recorded_at desc');
  return c.json(rows.map((x) => ({ reference: x.reference, type: x.type, name: x.name, email: x.email, organisation: x.organisation, message: x.message, destination: x.destination, response_days: x.response_days, deadline: x.deadline ? dayOf(x.deadline) : null, opened_record: x.opened_record, recorded_at: x.recorded_at })));
});

r.get('/enquiry-destinations', async (c) => {
  noPaging(c);
  return c.json(Object.entries(DESTINATIONS).map(([type, v]) => ({ type, ...v })));
});

export default r;

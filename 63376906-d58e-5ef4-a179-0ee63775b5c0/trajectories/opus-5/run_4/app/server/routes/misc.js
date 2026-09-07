import { Hono } from 'hono';
import { q, one } from '../db.js';
import { requireSession, requireRole, refuseAuditorWrites } from '../auth.js';
import { appendEntry } from '../record.js';
import { withIdempotency } from '../idempotency.js';
import { isoDate, isoStamp, isInt, ref, fdiv, stableStringify } from '../util.js';
import { ledger, batchFacts, periodForSite } from '../engine.js';
import { send } from '../mail.js';
import { refusePaging } from './intake.js';

export const misc = new Hono();

// ---------------------------------------------------------------------------
// Inbound sources. The app opens no outbound connection to any of the four.
// ---------------------------------------------------------------------------

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

misc.post('/inbound/:source', async (c) => {
  const source = c.req.param('source');
  if (!SOURCES.includes(source)) {
    return c.json({ error: 'source_not_permitted', permitted: SOURCES }, 400);
  }
  // The raw bytes are kept exactly as they arrived: a disagreement with a
  // supplier is settled by what came in, not by the shape the app parsed it into.
  const raw = await c.req.text();
  const key = c.req.header('idempotency-key');
  if (!key || !key.trim()) {
    return c.json({ error: 'idempotency_key_required', message: 'Every write carries an Idempotency-Key header.' }, 400);
  }
  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
  const { received_at, payload } = body;
  if (!received_at || payload === undefined) {
    return c.json({ error: 'received_at_and_payload_required' }, 400);
  }
  const route = 'POST /api/inbound/' + source;
  const { pool } = await import('../db.js');
  const { sha256 } = await import('../util.js');
  const hash = sha256(stableStringify(body));
  const prior = await one('SELECT * FROM idempotency WHERE key = $1 AND route = $2', [key, route]);
  if (prior) {
    if (prior.body_hash !== hash) {
      return c.json({ error: 'idempotency_key_reuse', message: 'A key is a promise about one act, not a licence to replace it.' }, 409);
    }
    return c.json(prior.response, prior.status);
  }
  const verbatim = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const reference = ref('INB');
  await one(
    `INSERT INTO inbound_record (reference,source,received_at,payload_verbatim,payload)
     VALUES ($1,$2,$3,$4,$5) RETURNING reference`,
    [reference, source, received_at, verbatim, verbatim]
  );
  await appendEntry(null, {
    act: 'inbound_record_stored', person: 'inbound:' + source, object_kind: 'inbound_record',
    object_ref: reference, at: received_at, content: { source, payload_verbatim: verbatim },
  });
  const resp = { reference, source, received_at, payload_verbatim: verbatim };
  await pool.query(
    'INSERT INTO idempotency (key,route,body_hash,status,response) VALUES ($1,$2,$3,201,$4) ON CONFLICT DO NOTHING',
    [key, route, hash, resp]
  );
  return c.json(resp, 201);
});

misc.get('/inbound', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM inbound_record ORDER BY received_at ASC');
  return c.json(rows.map((r) => ({
    reference: r.reference, source: r.source, received_at: isoStamp(r.received_at),
    payload_verbatim: r.payload_verbatim, stored_at: isoStamp(r.stored_at),
  })));
});

// ---------------------------------------------------------------------------
// Reconciliation: six figures rather than six verdicts.
// ---------------------------------------------------------------------------

async function integrationAges() {
  const out = [];
  for (const source of SOURCES) {
    const r = await one(
      'SELECT max(received_at) AS latest FROM inbound_record WHERE source = $1',
      [source]
    );
    // A source that has never sent reports null rather than zero.
    const latest = r && r.latest ? new Date(r.latest) : null;
    out.push({
      source,
      last_received_at: latest ? latest.toISOString() : null,
      age_hours: latest ? Math.floor((Date.now() - latest.getTime()) / 3600000) : null,
      never_sent: !latest,
    });
  }
  return out;
}

misc.get('/reconciliation', async (c) => {
  requireSession(c);
  const runs = await q('SELECT * FROM run');
  const cons = await q('SELECT * FROM consumption');
  const outs = await q('SELECT * FROM output');
  const massIn = cons.reduce((s, x) => s + Number(x.mass_g), 0);
  const massOut = outs.reduce((s, x) => s + Number(x.mass_g), 0);
  const losses = runs.reduce((s, r) => s + Number(r.losses_g || 0), 0);
  const mass_balance_residual_g = massIn - massOut - losses;

  const periods = await q("SELECT id FROM balance_period WHERE state = 'open'");
  let credit_margin_g = 0;
  for (const p of periods) {
    const l = await ledger(p.id);
    credit_margin_g += l.post_consumer.credits_available_g + l.pre_consumer.credits_available_g;
  }

  const openRuns = runs.filter((r) => r.state === 'open').map((r) => r.reference);
  const consumptions_on_open_runs = cons.filter((x) => openRuns.includes(x.run)).length;

  const batches = await q('SELECT * FROM batch');
  let batches_with_broken_custody = 0;
  const brokenList = [];
  for (const b of batches) {
    const f = await batchFacts(b);
    if (!f.custody_complete) {
      batches_with_broken_custody++;
      brokenList.push({ batch: b.reference, missing: f.custody_missing });
    }
  }

  const superseded = await q(
    `SELECT c.number FROM certificate c
     JOIN carbon_figure f ON c.input_versions->>'carbon_figure' = f.id
     WHERE f.superseded_by IS NOT NULL`
  );

  const history = [];
  const allPeriods = await q('SELECT id, period_from, period_to FROM balance_period ORDER BY period_from DESC LIMIT 4');
  for (const p of allPeriods) {
    const l = await ledger(p.id);
    history.push({
      period: p.id,
      from: isoDate(p.period_from), to: isoDate(p.period_to),
      credit_margin_g: l.post_consumer.credits_available_g + l.pre_consumer.credits_available_g,
      non_claimable_input_g: l.non_claimable_input_g,
    });
  }

  return c.json({
    mass_balance_residual_g,
    credit_margin_g,
    consumptions_on_open_runs,
    batches_with_broken_custody,
    batches_with_broken_custody_detail: brokenList,
    certificates_with_superseded_figures: superseded.length,
    certificates_with_superseded_figures_detail: superseded.map((x) => x.number),
    integration_ages: await integrationAges(),
    history,
    read_at: new Date().toISOString(),
    derivation: {
      mass_balance_residual_g: 'consumed mass minus output mass minus recorded losses across every run',
      credit_margin_g: 'credits available across every open period, both categories',
    },
  });
});

// ---------------------------------------------------------------------------
// Specifications, customers, change control
// ---------------------------------------------------------------------------

misc.get('/specifications', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM specification ORDER BY grade ASC, version ASC');
  return c.json(rows.map((s) => ({
    grade: s.grade, version: s.version, issued_on: isoDate(s.issued_on),
    superseded: s.superseded, properties: s.properties, virgin_reference: s.virgin_reference,
  })));
});

misc.get('/specifications/:grade/versions/:version', async (c) => {
  const s = await one(
    'SELECT * FROM specification WHERE grade = $1 AND version = $2',
    [c.req.param('grade'), Number(c.req.param('version'))]
  );
  if (!s) return c.json({ error: 'not_found' }, 404);
  const issues = await q(
    'SELECT * FROM specification_issue WHERE grade = $1 AND version = $2',
    [s.grade, s.version]
  );
  return c.json({
    grade: s.grade, version: s.version, issued_on: isoDate(s.issued_on), superseded: s.superseded,
    properties: s.properties,
    guaranteed_properties: (s.properties || []).filter((p) => p.basis === 'guaranteed').map((p) => p.property),
    virgin_reference: s.virgin_reference,
    issued_to: issues.map((i) => ({ customer: i.customer, issued_at: isoStamp(i.issued_at), issued_by: i.issued_by })),
  });
});

misc.post('/specifications/:grade/versions/:version/issue', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager');
  const grade = c.req.param('grade');
  const version = Number(c.req.param('version'));
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { customer } = body;
    const spec = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2', [grade, version]);
    if (!spec) return { status: 404, body: { error: 'not_found' } };
    const cust = await one('SELECT * FROM customer WHERE reference = $1', [customer]);
    if (!cust) return { status: 404, body: { error: 'customer_not_found', customer } };
    const reference = ref('SPI');
    await one(
      'INSERT INTO specification_issue (reference,grade,version,customer,issued_by) VALUES ($1,$2,$3,$4,$5) RETURNING reference',
      [reference, grade, version, customer, s.email]
    );
    await one('UPDATE customer SET spec_grade=$1, spec_version=$2 WHERE reference=$3 RETURNING reference', [grade, version, customer]);
    await appendEntry(null, {
      act: 'specification_issued', person: s.email, object_kind: 'specification_issue',
      object_ref: reference, content: { grade, version, customer },
    });
    return { status: 201, body: { reference, grade, version, customer, issued_by: s.email } };
  });
});

misc.get('/customers', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM customer ORDER BY reference ASC');
  const out = [];
  for (const r of rows) out.push(await shapeCustomer(r));
  return c.json(out);
});

async function shapeCustomer(r) {
  const conf = await q('SELECT * FROM conformance WHERE customer = $1 ORDER BY reference ASC', [r.reference]);
  return {
    reference: r.reference, name: r.name, contact: r.contact,
    holds_specification_version: r.spec_version ? `${r.spec_grade} v${r.spec_version}` : null,
    specification_grade: r.spec_grade, specification_version: r.spec_version,
    application: r.application, industry: r.industry, language: r.language,
    conformance: conf.map((x) => ({
      reference: x.reference, application: x.application,
      specification_version: `${x.spec_grade} v${x.spec_version}`,
      trials: x.trials, outcome: x.outcome, recorded_at: isoStamp(x.recorded_at),
    })),
  };
}

misc.get('/customers/:reference', async (c) => {
  requireSession(c);
  const r = await one('SELECT * FROM customer WHERE reference = $1', [c.req.param('reference')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(await shapeCustomer(r));
});

misc.get('/change-notices', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM change_notice ORDER BY raised_at ASC');
  const out = [];
  for (const r of rows) out.push(await shapeNotice(r));
  return c.json(out);
});

async function shapeNotice(r) {
  const acks = await q('SELECT * FROM change_notice_ack WHERE notice = $1 ORDER BY at ASC', [r.reference]);
  const specs = await q('SELECT grade, version FROM specification WHERE superseded = false');
  const customers = await q('SELECT * FROM customer');
  const conf = await q('SELECT * FROM conformance');
  const affectedCustomers = customers.map((x) => x.reference);
  return {
    reference: r.reference, title: r.title, detail: r.detail, parameter: r.parameter,
    qualification_relevant: r.qualification_relevant,
    notice_period_days: r.notice_period_days, state: r.state,
    raised_by: r.raised_by, raised_at: isoStamp(r.raised_at),
    released_at: isoStamp(r.released_at), released_by: r.released_by,
    // Derived rather than asserted.
    specifications_affected: specs.map((x) => `${x.grade} v${x.version}`),
    customers_affected: affectedCustomers,
    qualifications_affected: conf
      .filter((x) => r.qualification_relevant)
      .map((x) => ({ customer: x.customer, application: x.application, reference: x.reference })),
    acknowledgements: acks.map((a) => ({ customer: a.customer, kind: a.kind, at: isoStamp(a.at), by: a.by_person })),
    owed_notice: affectedCustomers.filter(
      (cu) => !acks.some((a) => a.customer === cu && ['notified', 'waived', 'acknowledged'].includes(a.kind))
    ),
    automotive_block: r.qualification_relevant
      ? customers.filter((x) => x.industry === 'automotive').map((x) => x.reference)
      : [],
    statement: r.qualification_relevant
      ? `This change may invalidate ${conf.length} customer qualifications.`
      : null,
  };
}

misc.get('/change-notices/:reference', async (c) => {
  requireSession(c);
  const r = await one('SELECT * FROM change_notice WHERE reference = $1', [c.req.param('reference')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  return c.json(await shapeNotice(r));
});

misc.post('/change-notices', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'plant_operator');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const { title, detail, parameter, qualification_relevant, notice_period_days } = body;
    if (!title || !parameter) return { status: 400, body: { error: 'title_and_parameter_required' } };
    const reference = ref('CHN');
    await one(
      `INSERT INTO change_notice (reference,title,detail,parameter,qualification_relevant,notice_period_days,raised_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING reference`,
      [reference, title, detail || '', parameter, !!qualification_relevant,
       isInt(notice_period_days) ? notice_period_days : 90, s.email]
    );
    await appendEntry(null, {
      act: 'change_notice_raised', person: s.email, object_kind: 'change_notice',
      object_ref: reference, content: { title, parameter, qualification_relevant: !!qualification_relevant },
    });
    const r = await one('SELECT * FROM change_notice WHERE reference = $1', [reference]);
    return { status: 201, body: { reference, ...(await shapeNotice(r)) } };
  });
});

misc.post('/change-notices/:reference/notify', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager', 'plant_operator');
  const reference = c.req.param('reference');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const n = await one('SELECT * FROM change_notice WHERE reference = $1', [reference]);
    if (!n) return { status: 404, body: { error: 'not_found' } };
    const { customer, kind } = body;
    const cust = await one('SELECT * FROM customer WHERE reference = $1', [customer]);
    if (!cust) return { status: 404, body: { error: 'customer_not_found', customer } };
    const act = kind === 'waived' ? 'waived' : 'notified';
    await one(
      'INSERT INTO change_notice_ack (notice,customer,kind,by_person) VALUES ($1,$2,$3,$4) RETURNING id',
      [reference, customer, act, s.email]
    );
    const shaped = await shapeNotice(n);
    if (act === 'notified') {
      try {
        await send({
          to: cust.contact,
          subject: `Change notice ${reference} requires acknowledgement`,
          text: [
            `Change notice ${reference} requires your acknowledgement.`,
            '',
            `Change: ${n.title}`,
            n.detail ? `Detail: ${n.detail}` : '',
            `Parameter: ${n.parameter}`,
            '',
            `Specifications affected: ${shaped.specifications_affected.join(', ')}`,
            `Notice period: ${n.notice_period_days} days`,
          ].filter(Boolean).join('\n'),
        });
      } catch (e) {
        console.error('[ravel] mail failed', e.message);
      }
    }
    await appendEntry(null, {
      act: `change_notice_${act}`, person: s.email, object_kind: 'change_notice',
      object_ref: reference, content: { customer, kind: act },
    });
    return { status: 201, body: { reference, customer, kind: act, ...(await shapeNotice(n)) } };
  });
});

misc.post('/change-notices/:reference/release', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'quality_manager');
  const reference = c.req.param('reference');
  return withIdempotency(c, async () => {
    const s = requireSession(c);
    const n = await one('SELECT * FROM change_notice WHERE reference = $1', [reference]);
    if (!n) return { status: 404, body: { error: 'not_found' } };
    const shaped = await shapeNotice(n);
    // A change touching a qualification-relevant parameter for an automotive
    // customer blocks rather than warns.
    const automotiveOwed = shaped.owed_notice.filter((cu) => shaped.automotive_block.includes(cu));
    if (shaped.owed_notice.length) {
      await appendEntry(null, {
        act: 'change_notice_release_refused', person: s.email, object_kind: 'change_notice',
        object_ref: reference, outcome: 'refused', content: { owed_notice: shaped.owed_notice },
      });
      return {
        status: 409,
        body: {
          error: 'notice_owed', owed_notice: shaped.owed_notice,
          automotive_block: automotiveOwed,
          blocking: automotiveOwed.length > 0,
          message: automotiveOwed.length
            ? `This change touches a qualification-relevant parameter for ${automotiveOwed.join(', ')} in the automotive industry. It blocks rather than warns.`
            : 'Release is refused until every customer owed notice has been notified or has waived it in a recorded act.',
        },
      };
    }
    await one(
      "UPDATE change_notice SET state='released', released_at=now(), released_by=$1 WHERE reference=$2 RETURNING reference",
      [s.email, reference]
    );
    await appendEntry(null, {
      act: 'change_notice_released', person: s.email, object_kind: 'change_notice',
      object_ref: reference, content: { reference },
    });
    const updated = await one('SELECT * FROM change_notice WHERE reference = $1', [reference]);
    return { status: 201, body: { reference, ...(await shapeNotice(updated)) } };
  });
});

// ---------------------------------------------------------------------------
// Contracts and the offtake floor
// ---------------------------------------------------------------------------

async function projection(ct) {
  const site = await one('SELECT * FROM site WHERE reference = $1', [ct.site]);
  const allocs = await q('SELECT * FROM allocation WHERE contract = $1 ORDER BY recorded_at ASC', [ct.id]);
  let deliveredG = 0;
  let creditG = 0;
  const lines = [];
  for (const a of allocs) {
    const { lotContent } = await import('../engine.js');
    const lc = await lotContent(a.lot);
    deliveredG += Number(a.mass_g);
    creditG += fdiv(Number(a.mass_g) * (lc ? lc.content_bp : 0), 10000);
    lines.push({
      reference: a.reference, lot: a.lot, mass_g: Number(a.mass_g),
      content_bp: lc ? lc.content_bp : 0, claim_type: lc ? lc.claim_type : null,
      decided_by: a.decided_by, favoured_over: a.favoured_over,
    });
  }
  const delivered_kg = fdiv(deliveredG, 1000) + Number(ct.delivered_kg);
  const committed_kg = Number(ct.committed_kg);
  const running_content_bp = deliveredG ? fdiv(creditG * 10000, deliveredG) : 0;
  const remaining_kg = committed_kg - delivered_kg;
  // The average the remaining volume must reach, floored.
  const required_remaining_bp =
    remaining_kg > 0
      ? fdiv((committed_kg * ct.floor_bp) - (delivered_kg * running_content_bp), remaining_kg)
      : 0;
  const unreachable = required_remaining_bp > 10000;
  return {
    id: ct.id,
    recipient: ct.recipient,
    site: ct.site,
    period: ct.period,
    delivered_kg,
    committed_kg,
    remaining_kg,
    running_content_bp,
    claim_type: lines.length ? lines[0].claim_type : 'mass_balance',
    floor_bp: ct.floor_bp,
    required_remaining_bp,
    // An unreachable floor is reported and never refused.
    state: unreachable ? 'unreachable' : 'on_track',
    unreachable_on: unreachable ? (ct.unreachable_on ? isoDate(ct.unreachable_on) : new Date().toISOString().slice(0, 10)) : null,
    unreachable_allocation: unreachable ? (ct.unreachable_allocation || (lines.length ? lines[lines.length - 1].reference : null)) : null,
    planned_site_flag: site ? site.confidence === 'planned' : false,
    flag_dismissible: false,
    site_confidence: site ? site.confidence : null,
    shortfall_consequence: ct.shortfall_consequence,
    allocations: lines,
    derivation: {
      required_remaining_bp: 'committed_kg * floor_bp minus delivered_kg * running_content_bp, over remaining_kg, floored',
      running_content_bp: 'credit delivered * 10000 / mass delivered, floored',
    },
  };
}

misc.get('/contracts', async (c) => {
  requireSession(c);
  const rows = await q('SELECT * FROM contract ORDER BY id ASC');
  const out = [];
  for (const r of rows) out.push(await projection(r));
  return c.json(out);
});

misc.get('/contracts/:id/projection', async (c) => {
  requireSession(c);
  const ct = await one('SELECT * FROM contract WHERE id = $1', [c.req.param('id')]);
  if (!ct) return c.json({ error: 'not_found' }, 404);
  return c.json(await projection(ct));
});

misc.post('/contracts/:id/allocations', async (c) => {
  refuseAuditorWrites(c);
  requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  return withIdempotency(c, async (body) => {
    const s = requireSession(c);
    const ct = await one('SELECT * FROM contract WHERE id = $1', [id]);
    if (!ct) return { status: 404, body: { error: 'not_found' } };
    const { lot, mass_g, favoured_over } = body;
    if (!isInt(mass_g) || mass_g <= 0) return { status: 400, body: { error: 'integer_required', field: 'mass_g' } };
    const l = await one('SELECT * FROM lot WHERE reference = $1', [lot]);
    if (!l) return { status: 404, body: { error: 'lot_not_found', lot } };
    // A claim already allocated to one contract is refused a second attachment.
    const prior = await one('SELECT * FROM allocation WHERE lot = $1', [lot]);
    if (prior) {
      await appendEntry(null, {
        act: 'contract_allocation_refused', person: s.email, object_kind: 'contract',
        object_ref: id, outcome: 'refused', content: { lot, already_on: prior.contract },
      });
      return {
        status: 409,
        body: {
          error: 'lot_already_allocated', lot, contract: prior.contract, reference: prior.reference,
          message: 'A claim already allocated to one contract is refused a second attachment.',
        },
      };
    }
    // Where supply is short, an allocation names the person who decided and the
    // contracts that went without.
    const reference = ref('ALO');
    await one(
      `INSERT INTO allocation (reference,contract,lot,mass_g,decided_by,favoured_over)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING reference`,
      [reference, id, lot, mass_g, s.email, JSON.stringify(favoured_over || [])]
    );
    await appendEntry(null, {
      act: 'contract_allocation_recorded', person: s.email, object_kind: 'allocation',
      object_ref: reference,
      content: { contract: id, lot, mass_g, decided_by: s.email, favoured_over: favoured_over || [] },
    });
    const updated = await one('SELECT * FROM contract WHERE id = $1', [id]);
    return {
      status: 201,
      body: {
        reference, contract: id, lot, mass_g, decided_by: s.email,
        favoured_over: favoured_over || [],
        projection: await projection(updated),
      },
    };
  });
});

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

const DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 },
};

misc.get('/enquiry-types', (c) =>
  c.json(Object.entries(DESTINATIONS).map(([type, d]) => ({ type, ...d })))
);

misc.post('/enquiries', async (c) => {
  return withIdempotency(c, async (body) => {
    const { type, name, email, organisation, message } = body;
    const d = DESTINATIONS[type];
    if (!d) return { status: 400, body: { error: 'type_not_permitted', permitted: Object.keys(DESTINATIONS) } };
    if (!name || !email || !message) {
      return { status: 400, body: { error: 'field_required', message: 'name, email and message are all required.' } };
    }
    const reference = ref('ENQ');
    const deadline = type === 'press'
      ? new Date(Date.now() + d.response_days * 86400000).toISOString().slice(0, 10)
      : null;
    await one(
      `INSERT INTO enquiry (reference,type,name,email,organisation,message,destination,response_days,deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING reference`,
      [reference, type, name, email, organisation || null, message, d.destination, d.response_days, deadline]
    );

    // A waste-supply enquiry opens a collector record; a polymer enquiry opens
    // a conformance record.
    let opened = null;
    if (type === 'waste_supply') {
      const cref = ref('COL');
      await one(
        `INSERT INTO collector (reference,name,country,registration,registration_expiry,scheme_status)
         VALUES ($1,$2,'not stated','not stated',current_date + INTERVAL '1 year','applicant') RETURNING reference`,
        [cref, organisation || name]
      );
      await one(
        `INSERT INTO party_version (reference,kind,name,effective_from) VALUES ($1,'collector',$2,current_date) RETURNING id`,
        [cref, organisation || name]
      );
      opened = { kind: 'collector', reference: cref };
    } else if (type === 'polymer_purchase') {
      const nref = ref('CNF');
      const anyCustomer = await one('SELECT reference FROM customer ORDER BY reference ASC LIMIT 1');
      if (anyCustomer) {
        await one(
          `INSERT INTO conformance (reference,customer,application,spec_grade,spec_version,outcome)
           VALUES ($1,$2,$3,'N6',3,'enquiry') RETURNING reference`,
          [nref, anyCustomer.reference, message.slice(0, 120)]
        );
        opened = { kind: 'conformance', reference: nref };
      }
    }

    try {
      await send({
        to: email,
        subject: `Enquiry ${reference} received`,
        text: [
          `Thank you. Your enquiry has been received.`,
          '',
          `Reference: ${reference}`,
          `Destination: ${d.destination}`,
          `Stated response time: ${d.response_days} working ${d.response_days === 1 ? 'day' : 'days'}`,
          deadline ? `Press deadline: ${deadline}` : '',
          '',
          'Ravel Materials SAS receives this data to answer your enquiry. It is kept for',
          type === 'press' ? '12 months' : type === 'waste_supply' || type === 'polymer_purchase' ? '36 months' : '24 months',
          'and you may have it removed by writing to privacy@example.com.',
        ].filter(Boolean).join('\n'),
      });
    } catch (e) {
      console.error('[ravel] mail failed', e.message);
    }
    await appendEntry(null, {
      act: 'enquiry_received', person: email, object_kind: 'enquiry', object_ref: reference,
      content: { type, destination: d.destination, response_days: d.response_days },
    });
    return {
      status: 201,
      body: {
        reference, type, destination: d.destination, response_days: d.response_days,
        deadline, opened,
      },
    };
  });
});

// ---------------------------------------------------------------------------
// The plant diagram, generated from the four run types
// ---------------------------------------------------------------------------

misc.get('/process-diagram', async (c) => {
  const RUN_TYPES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
  const stages = [];
  for (const t of RUN_TYPES) {
    const runs = await q("SELECT * FROM run WHERE run_type = $1 AND state = 'closed'", [t]);
    let inG = 0;
    let outG = 0;
    for (const r of runs) {
      const cons = await q('SELECT mass_g FROM consumption WHERE run = $1', [r.reference]);
      const outs = await q('SELECT mass_g FROM output WHERE run = $1', [r.reference]);
      inG += cons.reduce((s, x) => s + Number(x.mass_g), 0);
      outG += outs.reduce((s, x) => s + Number(x.mass_g), 0);
    }
    stages.push({
      stage: t, runs: runs.length, mass_in_g: inG, mass_out_g: outG, losses_g: inG - outG,
      description: {
        dissolution: 'Mixed polyamide waste is dissolved in a bio-derived solvent, leaving dyes, coatings and foreign matter behind.',
        depolymerisation: 'The dissolved polymer is broken back to its monomer with water at moderate temperature.',
        purification: 'The monomer is purified to virgin specification; the residue leaves as a byproduct.',
        repolymerisation: 'The purified monomer is polymerised back to pellet at the specification the customer holds.',
      }[t],
    });
  }
  return c.json({ stages, unit: 'grams', generated_from: 'run_type', text_equivalent: stages.map((s) => `${s.stage}: ${s.mass_in_g} g in, ${s.mass_out_g} g out, ${s.losses_g} g lost.`) });
});

import { q, one, pool } from '../lib/db.js';
import {
  refuse, requireSession, requireRole, idempotent, record, refuseParams,
  refuseComputedInput, requireOneOf, refuseAuditorWrite, nextReference,
} from '../lib/http.js';
import { iso } from '../lib/engine.js';
import { sendMail } from '../lib/mail.js';

const ENQUIRY_DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 },
};

export default function mount(app) {
  /* --------------------------------------------------- published figures */
  // A figure that cannot carry a source, a year and a geography is not published.
  app.get('/statistics', async (c) => {
    refuseParams(c);
    const rows = await q('SELECT * FROM statistic ORDER BY key');
    return c.json(rows
      .filter((s) => s.source && s.year && s.geography)
      .map((s) => ({ key: s.key, value: s.value, source: s.source, year: s.year, geography: s.geography })));
  });

  app.get('/positions', async (c) => {
    refuseParams(c);
    const rows = await q('SELECT * FROM position ORDER BY closes_on');
    return c.json(rows.map((p) => ({
      reference: p.reference, title: p.title, location: p.location, department: p.department,
      contract_type: p.contract_type, closes_on: iso(p.closes_on),
    })));
  });

  app.get('/news', async (c) => {
    refuseParams(c);
    const rows = await q('SELECT * FROM news_item ORDER BY published_on DESC');
    return c.json(rows.map((n) => ({
      reference: n.reference, title: n.title, tag: n.tag, outlet: n.outlet,
      date: iso(n.published_on), link: n.link, language: n.language, coverage: n.coverage,
    })));
  });

  app.get('/claim-register', async (c) => {
    refuseParams(c);
    const today = iso(new Date());
    const rows = await q('SELECT * FROM claim_substantiation ORDER BY reference');
    return c.json(rows.map((r) => ({
      reference: r.reference, claim: r.claim, route: r.route,
      first_published_on: iso(r.first_published_on), evidence: r.evidence,
      evidence_expires_on: iso(r.evidence_expires_on), method_version: r.method_version,
      approver: r.approver, review_on: iso(r.review_on), state: r.state,
      // A claim whose evidence expires is reported before its review date.
      evidence_expires_before_review: !!r.evidence_expires_on && iso(r.evidence_expires_on) < iso(r.review_on),
      evidence_expired: !!r.evidence_expires_on && iso(r.evidence_expires_on) < today,
    })));
  });

  app.get('/process-diagram', async (c) => {
    // The diagram is generated from the four run types so it stays correct when
    // a stage changes, and it carries mass in and mass out per stage.
    const runs = await q('SELECT * FROM run ORDER BY started_at');
    const cons = await q('SELECT * FROM consumption');
    const outs = await q('SELECT * FROM output');
    const stages = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
    return c.json(stages.map((stage) => {
      const rs = runs.filter((r) => r.run_type === stage);
      const refs = rs.map((r) => r.reference);
      const mass_in_g = cons.filter((x) => refs.includes(x.run)).reduce((a, x) => a + Number(x.mass_g), 0);
      const mass_out_g = outs.filter((x) => refs.includes(x.run)).reduce((a, x) => a + Number(x.mass_g), 0);
      return {
        stage, runs: refs.length, mass_in_g, mass_out_g,
        losses_g: rs.reduce((a, r) => a + Number(r.losses_g || 0), 0),
      };
    }));
  });

  /* ---------------------------------------------------------- enquiries */
  app.post('/enquiries', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const type = requireOneOf(body, 'type', Object.keys(ENQUIRY_DESTINATIONS));
    for (const f of ['name', 'email', 'message']) {
      if (!body[f]) refuse(400, 'field_required', { message: `${f} is required.`, field: f });
    }
    const { destination, response_days } = ENQUIRY_DESTINATIONS[type];

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('ENQ');
      const deadline = type === 'press' ? body.deadline || null : null;
      await pool.query(
        `INSERT INTO enquiry (reference, type, name, email, organisation, message, destination, response_days, deadline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [reference, type, body.name, body.email, body.organisation || null, body.message,
          destination, response_days, deadline]);

      // A waste-supply enquiry opens a collector record; a polymer enquiry opens
      // a conformance record.
      let opened = null;
      if (type === 'waste_supply') {
        const colRef = await nextReference('COL-ENQ');
        await pool.query(
          `INSERT INTO collector (reference, country, registration, registration_expiry, collection_site_types, declared_streams, scheme_status)
           VALUES ($1,$2,'pending',$3,'{}','{}','enquiry')`,
          [colRef, body.country || 'unknown', iso(new Date())]);
        await pool.query(
          `INSERT INTO party_version (id, party_reference, kind, name, effective_from) VALUES ($1,$2,'collector',$3,$4)`,
          [`PV-${colRef}-1`, colRef, body.organisation || body.name, iso(new Date())]);
        opened = { kind: 'collector', reference: colRef };
      } else if (type === 'polymer_purchase') {
        const cnfRef = await nextReference('CNF');
        const customer = await one('SELECT reference FROM customer LIMIT 1');
        await pool.query(
          `INSERT INTO conformance (id, customer, application, specification_version, outcome, opened_on)
           VALUES ($1,$2,$3,3,'enquiry',$4)`,
          [cnfRef, customer.reference, body.application || 'stated on enquiry', iso(new Date())]);
        opened = { kind: 'conformance', reference: cnfRef };
      }

      await record(c, {
        actor: 'public', action: 'enquiry_received', object_kind: 'enquiry', object_ref: reference,
        content: { type, destination, response_days, opened },
      });
      // The enquirer receives one mail through mailpit.
      await sendMail({
        to: body.email,
        subject: `Enquiry ${reference} received`,
        text: [
          `Thank you. Your enquiry has been received and given the reference ${reference}.`,
          '',
          `Reference:      ${reference}`,
          `Destination:    ${destination}`,
          `Response time:  ${response_days} working day${response_days === 1 ? '' : 's'}`,
          '',
          'Ravel Materials SAS receives this data to answer your enquiry. It is kept for the',
          `retention stated in the privacy policy for a ${type.replace('_', ' ')} enquiry, and you may have it`,
          'removed by writing to privacy@example.com.',
        ].join('\n'),
        act: 'enquiry_received',
        object_ref: reference,
      });
      return {
        status: 201,
        body: {
          reference, type, destination, response_days, deadline,
          opened,
          data_protection: {
            receives: 'Ravel Materials SAS',
            used_for: 'answering this enquiry',
            retention_months: type === 'press' ? 12 : (type === 'waste_supply' || type === 'polymer_purchase' ? 36 : 24),
            removal: 'privacy@example.com',
          },
        },
      };
    });
    return c.json(result.body, result.status);
  });

  app.get('/enquiries', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM enquiry ORDER BY created_at DESC');
    return c.json(rows.map((e) => ({
      reference: e.reference, type: e.type, name: e.name, email: e.email,
      organisation: e.organisation, destination: e.destination, response_days: e.response_days,
      deadline: iso(e.deadline), created_at: e.created_at,
    })));
  });

  /* ------------------------------------------------------ specifications */
  app.get('/specifications', async (c) => {
    refuseParams(c);
    const rows = await q('SELECT * FROM specification ORDER BY grade, version');
    return c.json(rows.map(shapeSpec));
  });

  app.get('/specifications/:grade/versions/:version', async (c) => {
    const s = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2',
      [c.req.param('grade'), Number(c.req.param('version'))]);
    if (!s) refuse(404, 'no_such_specification_version', { message: 'There is no such specification version.' });
    return c.json(shapeSpec(s));
  });

  app.post('/specifications/:grade/versions/:version/issue', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const grade = c.req.param('grade');
    const version = Number(c.req.param('version'));
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const spec = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2', [grade, version]);
    if (!spec) refuse(404, 'no_such_specification_version', { message: 'There is no such specification version.' });
    if (!body.customer) refuse(400, 'field_required', { message: 'customer is required.', field: 'customer' });
    const customer = await one('SELECT * FROM customer WHERE reference = $1', [body.customer]);
    if (!customer) refuse(404, 'no_such_customer', { message: 'There is no such customer.', field: 'customer' });

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('SPI');
      const issued_on = iso(new Date());
      await pool.query(
        `INSERT INTO specification_issue (id, grade, version, customer, issued_on, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [reference, grade, version, body.customer, issued_on, s.identifier]);
      await pool.query(
        `UPDATE customer SET holds_specification_grade = $1, holds_specification_version = $2 WHERE reference = $3`,
        [grade, version, body.customer]);
      await record(c, {
        action: 'specification_issued', object_kind: 'specification', object_ref: `${grade} v${version}`,
        content: { customer: body.customer, issued_on, issued_by: s.identifier },
      });
      return { status: 201, body: { reference, grade, version, customer: body.customer, issued_on, issued_by: s.identifier } };
    });
    return c.json(result.body, result.status);
  });

  /* ----------------------------------------------------------- customers */
  app.get('/customers', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT reference FROM customer ORDER BY reference');
    const out = [];
    for (const r of rows) out.push(await customerView(r.reference));
    return c.json(out);
  });

  app.get('/customers/:reference', async (c) => {
    requireSession(c);
    const v = await customerView(c.req.param('reference'));
    if (!v) refuse(404, 'no_such_customer', { message: 'There is no such customer.' });
    return c.json(v);
  });

  /* ------------------------------------------------------ change notices */
  app.get('/change-notices', async (c) => {
    refuseParams(c);
    requireSession(c);
    const rows = await q('SELECT * FROM change_notice ORDER BY raised_at');
    const out = [];
    for (const r of rows) {
      const acks = await q('SELECT * FROM change_notice_ack WHERE notice = $1', [r.reference]);
      out.push({ ...shapeNotice(r), acknowledgements: acks.map(shapeAck) });
    }
    return c.json(out);
  });

  app.get('/change-notices/:reference', async (c) => {
    requireSession(c);
    const r = await one('SELECT * FROM change_notice WHERE reference = $1', [c.req.param('reference')]);
    if (!r) refuse(404, 'no_such_change_notice', { message: 'There is no such change notice.' });
    const acks = await q('SELECT * FROM change_notice_ack WHERE notice = $1', [r.reference]);
    return c.json({ ...shapeNotice(r), acknowledgements: acks.map(shapeAck) });
  });

  // The notice derives, rather than asserts, what it affects.
  app.post('/change-notices', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager', 'plant_operator');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    for (const f of ['title', 'detail', 'parameter']) {
      if (!body[f]) refuse(400, 'field_required', { message: `${f} is required.`, field: f });
    }
    const grade = body.grade || 'N6';

    const result = await idempotent(c, body, async () => {
      const reference = await nextReference('CHG');
      const specs = await q('SELECT * FROM specification WHERE superseded = false');
      const specifications_affected = specs
        .filter((sp) => sp.properties.some((p) => p.property === body.parameter) || sp.grade.includes(grade))
        .map((sp) => ({ grade: sp.grade, version: sp.version }));
      const customers = await q('SELECT * FROM customer');
      const customers_affected = customers
        .filter((cu) => specifications_affected.some((sa) => sa.grade === cu.holds_specification_grade))
        .map((cu) => ({
          reference: cu.reference, contact: cu.contact, industry: cu.industry,
          application: cu.application, holds_version: cu.holds_specification_version,
        }));
      const conformances = await q('SELECT * FROM conformance');
      const qualifications_affected = conformances
        .filter((cf) => customers_affected.some((ca) => ca.reference === cf.customer))
        .map((cf) => ({
          reference: cf.id, customer: cf.customer, application: cf.application,
          specification_version: cf.specification_version, outcome: cf.outcome,
        }));
      // A change touching a qualification-relevant parameter for a customer in
      // the automotive industry blocks rather than warns.
      const qualification_relevant = ['relative_viscosity', 'moisture', 'temperature', 'pressure']
        .includes(body.parameter);
      const automotive = customers_affected.filter((cu) => cu.industry === 'automotive');
      const notice_period_days = qualification_relevant ? 90 : 30;

      await pool.query(
        `INSERT INTO change_notice (reference, title, detail, parameter, grade, qualification_relevant,
          specifications_affected, customers_affected, qualifications_affected, notice_period_days, raised_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [reference, body.title, body.detail, body.parameter, grade, qualification_relevant,
          JSON.stringify(specifications_affected), JSON.stringify(customers_affected),
          JSON.stringify(qualifications_affected), notice_period_days, s.identifier]);
      await record(c, {
        action: 'change_notice_raised', object_kind: 'change_notice', object_ref: reference,
        content: {
          title: body.title, parameter: body.parameter, qualification_relevant,
          customers_affected: customers_affected.map((x) => x.reference), notice_period_days,
        },
      });
      return {
        status: 201,
        body: {
          reference, title: body.title, detail: body.detail, parameter: body.parameter, grade,
          qualification_relevant,
          specifications_affected, customers_affected, qualifications_affected, notice_period_days,
          blocking: qualification_relevant && automotive.length > 0,
          blocking_customers: qualification_relevant ? automotive.map((x) => x.reference) : [],
          state: 'raised',
          message: qualification_relevant && automotive.length
            ? `This change may invalidate ${qualifications_affected.length} customer qualifications.`
            : null,
        },
      };
    });
    return c.json(result.body, result.status);
  });

  app.post('/change-notices/:reference/notify', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const notice = await one('SELECT * FROM change_notice WHERE reference = $1', [ref]);
    if (!notice) refuse(404, 'no_such_change_notice', { message: 'There is no such change notice.' });
    if (!body.customer) refuse(400, 'field_required', { message: 'notify names one customer.', field: 'customer' });
    const customer = await one('SELECT * FROM customer WHERE reference = $1', [body.customer]);
    if (!customer) refuse(404, 'no_such_customer', { message: 'There is no such customer.', field: 'customer' });

    const result = await idempotent(c, body, async () => {
      const id = await nextReference('ACK');
      const kind = body.waived ? 'waived' : 'notified';
      await pool.query(
        `INSERT INTO change_notice_ack (id, notice, customer, kind, by_person) VALUES ($1,$2,$3,$4,$5)`,
        [id, ref, body.customer, kind, s.identifier]);
      if (kind === 'notified') {
        await sendMail({
          to: customer.contact,
          subject: `Change notice ${ref} requires acknowledgement`,
          text: [
            `Change notice ${ref} requires your acknowledgement.`,
            '',
            `Change:          ${notice.title}`,
            `Detail:          ${notice.detail}`,
            `Parameter:       ${notice.parameter}`,
            '',
            'Specifications affected:',
            ...(notice.specifications_affected || []).map((sp) => `  ${sp.grade} version ${sp.version}`),
            '',
            `Notice period:   ${notice.notice_period_days} days`,
          ].join('\n'),
          act: 'change_notice_notified',
          object_ref: ref,
        });
      }
      await record(c, {
        action: kind === 'waived' ? 'change_notice_waived' : 'change_notice_notified',
        object_kind: 'change_notice', object_ref: ref,
        content: { customer: body.customer, kind, by: s.identifier },
      });
      return { status: 201, body: { reference: id, notice: ref, customer: body.customer, kind } };
    });
    return c.json(result.body, result.status);
  });

  // Release is refused until every customer owed notice has been notified or has
  // waived it in a recorded act.
  app.post('/change-notices/:reference/release', async (c) => {
    refuseAuditorWrite(c);
    const s = requireRole(c, 'quality_manager', 'claims_manager');
    const ref = c.req.param('reference');
    const body = await c.req.json().catch(() => ({}));
    refuseComputedInput(body);
    const notice = await one('SELECT * FROM change_notice WHERE reference = $1', [ref]);
    if (!notice) refuse(404, 'no_such_change_notice', { message: 'There is no such change notice.' });
    if (notice.state === 'released') refuse(409, 'already_released', { message: 'This change notice is released.' });
    const acks = await q('SELECT * FROM change_notice_ack WHERE notice = $1', [ref]);
    const owed = (notice.customers_affected || []).filter(
      (cu) => !acks.find((a) => a.customer === cu.reference));
    if (owed.length) {
      await record(c, {
        action: 'change_notice_release_refused', object_kind: 'change_notice', object_ref: ref,
        outcome: 'refused', content: { owed: owed.map((x) => x.reference) },
      });
      refuse(409, 'notice_owed', {
        message: `This change is not released until every customer owed notice has been notified or has waived it: ${owed.map((x) => x.reference).join(', ')}.`,
        owed: owed.map((x) => ({ reference: x.reference, industry: x.industry })),
        blocking: notice.qualification_relevant && owed.some((x) => x.industry === 'automotive'),
      });
    }
    const result = await idempotent(c, body, async () => {
      await pool.query(`UPDATE change_notice SET state = 'released', released_at = now() WHERE reference = $1`, [ref]);
      await record(c, {
        action: 'change_notice_released', object_kind: 'change_notice', object_ref: ref,
        content: { released_by: s.identifier },
      });
      return { status: 200, body: { reference: ref, state: 'released' } };
    });
    return c.json(result.body, result.status);
  });
}

function shapeSpec(s) {
  return {
    grade: s.grade,
    version: s.version,
    issued_on: iso(s.issued_on),
    superseded: s.superseded,
    properties: s.properties,
    // A guaranteed limit is tested on every lot.
    guaranteed_properties: s.properties.filter((p) => p.basis === 'guaranteed').map((p) => p.property),
    virgin_reference: s.virgin_reference,
  };
}

function shapeNotice(r) {
  return {
    reference: r.reference, title: r.title, detail: r.detail, parameter: r.parameter,
    grade: r.grade, qualification_relevant: r.qualification_relevant,
    specifications_affected: r.specifications_affected,
    customers_affected: r.customers_affected,
    qualifications_affected: r.qualifications_affected,
    notice_period_days: r.notice_period_days, state: r.state,
    raised_by: r.raised_by, raised_at: r.raised_at, released_at: r.released_at,
  };
}

function shapeAck(a) {
  return { reference: a.id, customer: a.customer, kind: a.kind, at: a.at, by: a.by_person };
}

async function customerView(reference) {
  const cu = await one('SELECT * FROM customer WHERE reference = $1', [reference]);
  if (!cu) return null;
  const conformances = await q('SELECT * FROM conformance WHERE customer = $1', [reference]);
  const { partyNameOn } = await import('../lib/engine.js');
  return {
    reference: cu.reference,
    name: await partyNameOn(reference, iso(new Date())),
    contact: cu.contact,
    holds_specification_version: cu.holds_specification_version,
    holds_specification_grade: cu.holds_specification_grade,
    application: cu.application,
    industry: cu.industry,
    language: cu.language,
    conformance: conformances.map((cf) => ({
      reference: cf.id, application: cf.application, specification_version: cf.specification_version,
      trials: cf.trials, outcome: cf.outcome, opened_on: iso(cf.opened_on), completed_on: iso(cf.completed_on),
    })),
  };
}

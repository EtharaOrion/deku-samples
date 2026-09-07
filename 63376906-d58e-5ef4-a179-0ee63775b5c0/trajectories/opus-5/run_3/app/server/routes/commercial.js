import { Hono } from 'hono';
import { rq, rq1, tx } from '../db/pool.js';
import { appendEntry } from '../lib/record.js';
import {
  idempotent, refuse, requireRole, requireSession, refuseAuditorWrite,
  refuseComputedInputs, refusePaging, recordRefusal
} from '../lib/http.js';
import { requireNonNegativeInteger, requiredRemainingBp, runningContentBp, gToKg } from '../engine/units.js';
import { lotClaim } from '../engine/ledger.js';
import { mailChangeNotice } from '../lib/mail.js';
import { nextRef } from './operations.js';

export const commercial = new Hono();

// ------------------------------------------------------- specifications

commercial.get('/specifications', async (c) => {
  const rows = await rq('SELECT grade, version, issued_on, superseded_by FROM specification ORDER BY grade, version');
  return c.json(rows.map((r) => ({
    grade: r.grade, version: r.version, issued_on: String(r.issued_on).slice(0, 10),
    superseded_by: r.superseded_by, current: r.superseded_by === null
  })));
});

commercial.get('/specifications/:grade/versions/:version', async (c) => {
  const s = await rq1('SELECT * FROM specification WHERE grade = $1 AND version = $2',
    [c.req.param('grade'), Number(c.req.param('version'))]);
  if (!s) throw refuse(404, 'no_such_specification', 'No such specification version.');
  const issues = await rq(
    'SELECT customer, issued_on, issued_by FROM specification_issue WHERE grade = $1 AND version = $2',
    [s.grade, s.version]);
  return c.json({
    grade: s.grade,
    version: s.version,
    issued_on: String(s.issued_on).slice(0, 10),
    // One row per property. A guaranteed limit is tested on every lot.
    properties: (s.properties || []).map((p) => ({
      property: p.property, method: p.method, limit: p.limit, unit: p.unit, basis: p.basis,
      tested_on_every_lot: p.basis === 'guaranteed'
    })),
    virgin_reference: s.virgin_reference,
    superseded_by: s.superseded_by,
    issued_to: issues.map((i) => ({ customer: i.customer, issued_on: String(i.issued_on).slice(0, 10), issued_by: i.issued_by }))
  });
});

commercial.post('/specifications/:grade/versions/:version/issue', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const grade = c.req.param('grade');
  const version = Number(c.req.param('version'));
  const body = await c.req.json().catch(() => ({}));
  if (!body.customer) throw refuse(400, 'missing_field', 'A specification is issued to a named customer.');

  const result = await idempotent(c, `POST /api/specifications/${grade}/versions/${version}/issue`, body, async () => tx(async (client) => {
    const s = await client.query('SELECT 1 FROM specification WHERE grade = $1 AND version = $2', [grade, version]);
    if (!s.rows.length) throw refuse(404, 'no_such_specification', 'No such specification version.');
    const cust = await client.query('SELECT 1 FROM customer WHERE reference = $1', [body.customer]);
    if (!cust.rows.length) throw refuse(404, 'no_such_customer', `No customer is recorded at ${body.customer}.`);
    const issuedOn = body.issued_on || new Date().toISOString().slice(0, 10);
    const r = await client.query(
      `INSERT INTO specification_issue (grade,version,customer,issued_on,issued_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [grade, version, body.customer, issuedOn, session.email]
    );
    // Both the issue and the holding are recorded.
    await client.query('UPDATE customer SET holds_specification_version = $1 WHERE reference = $2', [version, body.customer]);
    await appendEntry(client, {
      act: 'specification_issued', person: session.email, object_kind: 'specification',
      object_ref: `${grade} v${version}`, content: { customer: body.customer, issued_on: issuedOn },
      effective_on: issuedOn
    });
    return { status: 201, body: { reference: `SPI-${r.rows[0].id}`, grade, version, customer: body.customer, issued_on: issuedOn, issued_by: session.email } };
  }));
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------- customers

commercial.get('/customers', async (c) => {
  requireSession(c);
  const rows = await rq('SELECT * FROM customer ORDER BY reference');
  return c.json(rows.map((r) => ({
    reference: r.reference, contact: r.contact, application: r.application,
    industry: r.industry, language: r.language, holds_specification_version: r.holds_specification_version
  })));
});

commercial.get('/customers/:reference', async (c) => {
  requireSession(c);
  const r = await rq1('SELECT * FROM customer WHERE reference = $1', [c.req.param('reference')]);
  if (!r) throw refuse(404, 'no_such_customer', `No customer is recorded at ${c.req.param('reference')}.`);
  const conformance = await rq('SELECT * FROM conformance WHERE customer = $1 ORDER BY id', [r.reference]);
  return c.json({
    reference: r.reference,
    contact: r.contact,
    holds_specification_version: r.holds_specification_version,
    application: r.application,
    industry: r.industry,
    language: r.language,
    // One conformance record per application per specification version.
    conformance: conformance.map((x) => ({
      application: x.application, specification_version: x.specification_version,
      trials: x.trials, outcome: x.outcome, recorded_on: String(x.recorded_on).slice(0, 10)
    }))
  });
});

// --------------------------------------------------------- change notices

commercial.get('/change-notices', async (c) => {
  requireSession(c);
  refusePaging(c);
  const rows = await rq('SELECT * FROM change_notice ORDER BY reference');
  const out = [];
  for (const r of rows) {
    const notes = await rq(
      'SELECT customer, kind, recorded_by, recorded_at FROM change_notification WHERE change_notice = $1 ORDER BY id',
      [r.reference]);
    out.push({
      reference: r.reference, title: r.title, detail: r.detail, parameter: r.parameter,
      qualification_relevant: r.qualification_relevant,
      specifications_affected: r.specifications_affected,
      customers_affected: r.customers_affected,
      qualifications_affected: r.qualifications_affected,
      notice_period_days: r.notice_period_days, state: r.state,
      raised_by: r.raised_by, raised_at: r.raised_at, released_at: r.released_at,
      notifications: notes,
      owed_notice: (r.customers_affected || []).filter((x) => !notes.some((n) => n.customer === x))
    });
  }
  return c.json(out);
});

/** A change notice derives, rather than asserts, what it affects. */
commercial.post('/change-notices', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.title || !body.detail) throw refuse(400, 'missing_field', 'A change notice carries a title and a detail.');

  const result = await idempotent(c, 'POST /api/change-notices', body, async () => tx(async (client) => {
    const ref = await nextRef(client, 'change_notice', 'reference', 'CHG-');

    // Derived, not asserted: the specifications that hold the parameter, the
    // customers holding those specifications, and their qualifications.
    const specs = await client.query('SELECT grade, version, properties FROM specification WHERE superseded_by IS NULL');
    const specsAffected = specs.rows
      .filter((s) => !body.parameter || (s.properties || []).some((p) => p.property === body.parameter))
      .map((s) => `${s.grade} v${s.version}`);
    const allSpecs = specs.rows
      .filter((s) => !body.parameter || (s.properties || []).some((p) => p.property === body.parameter));

    const customers = await client.query('SELECT * FROM customer');
    const affected = customers.rows.filter((cu) =>
      allSpecs.some((s) => s.grade === 'SPEC-N6') || specsAffected.length === 0 ? true : false
    );
    const customersAffected = affected.map((x) => x.reference);

    const conformance = await client.query('SELECT * FROM conformance WHERE customer = ANY($1)', [customersAffected]);
    const qualificationsAffected = conformance.rows.map((x) => ({
      customer: x.customer, application: x.application,
      specification_version: x.specification_version, outcome: x.outcome
    }));

    // A change touching a qualification-relevant parameter for a customer in
    // the automotive industry blocks rather than warns.
    const qualificationRelevant = !!body.qualification_relevant
      || ['relative_viscosity', 'moisture', 'temperature', 'pressure'].includes(body.parameter);
    const automotive = affected.filter((x) => x.industry === 'automotive');
    const blocks = qualificationRelevant && automotive.length > 0;

    const noticePeriod = blocks ? 90 : 30;

    await client.query(
      `INSERT INTO change_notice (reference,title,detail,parameter,qualification_relevant,specifications_affected,
         customers_affected,qualifications_affected,notice_period_days,state,raised_by,effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [ref, body.title, body.detail, body.parameter || null, qualificationRelevant,
        JSON.stringify(specsAffected), JSON.stringify(customersAffected),
        JSON.stringify(qualificationsAffected), noticePeriod,
        blocks ? 'blocked' : 'raised', session.email,
        body.effective_on || new Date().toISOString().slice(0, 10)]
    );
    await appendEntry(client, {
      act: 'change_notice_raised', person: session.email, object_kind: 'change_notice', object_ref: ref,
      content: { title: body.title, parameter: body.parameter || null,
        customers_affected: customersAffected, blocks }
    });

    return {
      status: 201,
      body: {
        reference: ref, title: body.title, detail: body.detail, parameter: body.parameter || null,
        qualification_relevant: qualificationRelevant,
        specifications_affected: specsAffected,
        customers_affected: customersAffected,
        qualifications_affected: qualificationsAffected,
        notice_period_days: noticePeriod,
        state: blocks ? 'blocked' : 'raised',
        blocking: blocks,
        blocking_reason: blocks
          ? `This change may invalidate ${qualificationsAffected.length} customer qualifications. ${automotive.map((x) => x.reference).join(', ')} is in the automotive industry, so this change blocks rather than warns.`
          : null,
        statement: `This change may invalidate ${qualificationsAffected.length} customer qualifications.`
      }
    };
  }));
  return c.json(result.body, result.status);
});

commercial.post('/change-notices/:reference/notify', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  if (!body.customer) throw refuse(400, 'missing_field', 'A notification names one customer.');
  if (Array.isArray(body.customer)) throw refuse(400, 'one_customer_at_a_time', 'A notification names one customer.');

  const result = await idempotent(c, `POST /api/change-notices/${ref}/notify`, body, async () => tx(async (client) => {
    const n = await client.query('SELECT * FROM change_notice WHERE reference = $1', [ref]);
    if (!n.rows.length) throw refuse(404, 'no_such_notice', `No change notice is recorded at ${ref}.`);
    const cust = await client.query('SELECT * FROM customer WHERE reference = $1', [body.customer]);
    if (!cust.rows.length) throw refuse(404, 'no_such_customer', `No customer is recorded at ${body.customer}.`);
    const kind = body.kind === 'waived' ? 'waived' : (body.kind === 'acknowledged' ? 'acknowledged' : 'notified');
    await client.query(
      `INSERT INTO change_notification (change_notice,customer,kind,recorded_by) VALUES ($1,$2,$3,$4)`,
      [ref, body.customer, kind, session.email]
    );
    await appendEntry(client, {
      act: `change_notice_${kind}`, person: session.email, object_kind: 'change_notice', object_ref: ref,
      content: { customer: body.customer, kind }
    });
    return {
      status: 201,
      body: { reference: `${ref}:${body.customer}`, change_notice: ref, customer: body.customer, kind,
        contact: cust.rows[0].contact, notice: n.rows[0] }
    };
  }));

  if (result.status === 201 && !result.replayed && result.body.kind === 'notified') {
    try {
      await mailChangeNotice(result.body.notice, result.body.contact);
    } catch { /* the record is the fact */ }
  }
  const { notice, contact, ...rest } = result.body;
  return c.json(rest, result.status);
});

/** Release is refused until every customer owed notice has been notified or has
 *  waived it in a recorded act. */
commercial.post('/change-notices/:reference/release', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));

  const result = await idempotent(c, `POST /api/change-notices/${ref}/release`, body, async () => tx(async (client) => {
    const n = await client.query('SELECT * FROM change_notice WHERE reference = $1 FOR UPDATE', [ref]);
    if (!n.rows.length) throw refuse(404, 'no_such_notice', `No change notice is recorded at ${ref}.`);
    const notice = n.rows[0];
    if (notice.state === 'released') throw refuse(409, 'already_released', `${ref} was released at ${notice.released_at}.`);

    const notes = await client.query(
      "SELECT customer, kind FROM change_notification WHERE change_notice = $1", [ref]);
    const owed = (notice.customers_affected || []).filter(
      (x) => !notes.rows.some((r) => r.customer === x && ['notified', 'waived', 'acknowledged'].includes(r.kind))
    );
    if (owed.length) {
      await appendEntry(client, {
        act: 'change_notice_release_refused', person: session.email, object_kind: 'change_notice',
        object_ref: ref, outcome: 'refused', content: { owed_notice: owed }
      });
      throw refuse(409, 'notice_owed',
        `${ref} cannot be released until ${owed.join(', ')} has been notified or has waived notice in a recorded act.`,
        { owed_notice: owed });
    }

    if (notice.state === 'blocked') {
      const acknowledged = notes.rows.filter((r) => r.kind === 'acknowledged').map((r) => r.customer);
      const automotive = await client.query(
        "SELECT reference FROM customer WHERE industry = 'automotive' AND reference = ANY($1)",
        [notice.customers_affected || []]);
      const missing = automotive.rows.map((r) => r.reference).filter((x) => !acknowledged.includes(x));
      if (missing.length) {
        throw refuse(409, 'qualification_acknowledgement_required',
          `This change touches a qualification-relevant parameter for ${missing.join(', ')} in the automotive industry. It blocks until they acknowledge it.`,
          { blocking_customers: missing });
      }
    }

    await client.query("UPDATE change_notice SET state = 'released', released_at = now() WHERE reference = $1", [ref]);
    await appendEntry(client, {
      act: 'change_notice_released', person: session.email, object_kind: 'change_notice', object_ref: ref,
      content: { customers_notified: notes.rows.map((r) => r.customer) }
    });
    return { status: 201, body: { reference: ref, state: 'released', released_by: session.email } };
  }));
  return c.json(result.body, result.status);
});

// -------------------------------------------------------------- contracts

async function projection(contract) {
  const allocations = await rq(
    'SELECT a.reference, a.lot, a.mass_g, a.decided_by, a.favoured_over, l.mass_g AS lot_mass FROM allocation a JOIN lot l ON l.reference = a.lot WHERE a.contract = $1 ORDER BY a.reference',
    [contract.id]
  );
  const deliveries = [];
  for (const a of allocations) {
    const claim = await lotClaim(a.lot);
    deliveries.push({ mass_kg: gToKg(Number(a.mass_g)), content_bp: claim.content_bp, lot: a.lot });
  }
  const deliveredKg = deliveries.reduce((s, d) => s + d.mass_kg, 0);
  const running = runningContentBp(deliveries);
  const committedKg = Number(contract.committed_kg);
  const required = requiredRemainingBp(committedKg, deliveredKg, running, contract.floor_bp);

  // An unreachable floor is reported and never refused.
  const unreachable = required !== null && required > 10000;

  const site = await rq1('SELECT confidence FROM site WHERE reference = $1', [contract.site]);

  return {
    id: contract.id,
    recipient: contract.recipient,
    site: contract.site,
    period: contract.period,
    delivered_kg: deliveredKg,
    committed_kg: committedKg,
    running_content_bp: running,
    floor_bp: contract.floor_bp,
    required_remaining_bp: required,
    state: unreachable ? 'unreachable' : 'on_track',
    unreachable_on: unreachable
      ? (contract.unreachable_on ? String(contract.unreachable_on).slice(0, 10) : new Date().toISOString().slice(0, 10))
      : null,
    unreachable_allocation: unreachable ? (contract.unreachable_allocation || allocations.at(-1)?.reference || null) : null,
    // A contract whose supplying site carries confidence of planned answers
    // planned_site_flag true with flag_dismissible false on every response.
    planned_site_flag: site?.confidence === 'planned',
    flag_dismissible: false,
    site_confidence: site?.confidence || null,
    shortfall_consequence: contract.shortfall_consequence,
    allocations: allocations.map((a) => ({
      reference: a.reference, lot: a.lot, mass_g: Number(a.mass_g),
      decided_by: a.decided_by, favoured_over: a.favoured_over
    })),
    derivation: {
      running_content_bp: 'the mass-weighted content of every lot allocated to this contract, floored',
      required_remaining_bp: required === null
        ? 'no volume remains, so no average is required'
        : `(committed_kg ${committedKg} * floor_bp ${contract.floor_bp} - delivered_kg ${deliveredKg} * running ${running}) / remaining ${committedKg - deliveredKg}, floored`,
      state: unreachable
        ? `the remaining volume would have to average ${required} basis points, which is above 10000`
        : 'the floor is reachable with the volume that remains'
    }
  };
}

commercial.get('/contracts', async (c) => {
  requireSession(c);
  const rows = await rq('SELECT * FROM contract ORDER BY id');
  const out = [];
  for (const r of rows) out.push(await projection(r));
  return c.json(out);
});

commercial.get('/contracts/:id/projection', async (c) => {
  requireSession(c);
  const r = await rq1('SELECT * FROM contract WHERE id = $1', [c.req.param('id')]);
  if (!r) throw refuse(404, 'no_such_contract', `No contract is recorded at ${c.req.param('id')}.`);
  return c.json(await projection(r));
});

/** Where supply is short, an allocation carries decided_by and favoured_over,
 *  naming the person who decided and the contracts that went without. It is
 *  never an automatic sort by contract value with nobody's name on it. */
commercial.post('/contracts/:id/allocations', async (c) => {
  refuseAuditorWrite(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInputs(body);
  if (!body.lot) throw refuse(400, 'missing_field', 'A contract allocation names the lot it attaches.');
  const massG = body.mass_g != null ? requireNonNegativeInteger(body.mass_g, 'mass_g') : null;

  const result = await idempotent(c, `POST /api/contracts/${id}/allocations`, body, async () => tx(async (client) => {
    const contract = await client.query('SELECT * FROM contract WHERE id = $1 FOR UPDATE', [id]);
    if (!contract.rows.length) throw refuse(404, 'no_such_contract', `No contract is recorded at ${id}.`);
    const lot = await client.query('SELECT * FROM lot WHERE reference = $1', [body.lot]);
    if (!lot.rows.length) throw refuse(404, 'no_such_lot', `No lot is recorded at ${body.lot}.`);

    // A claim already allocated to one contract is refused a second attachment.
    const existing = await client.query('SELECT contract FROM allocation WHERE lot = $1', [body.lot]);
    if (existing.rows.length) {
      await appendEntry(client, {
        act: 'contract_allocation_refused', person: session.email, object_kind: 'lot', object_ref: body.lot,
        outcome: 'refused', content: { contract: id, already_allocated_to: existing.rows[0].contract }
      });
      throw refuse(409, 'claim_already_allocated',
        `${body.lot} is already attached to ${existing.rows[0].contract}. A claim already allocated to one contract is refused a second attachment.`,
        { already_allocated_to: existing.rows[0].contract });
    }

    const ref = await nextRef(client, 'allocation', 'reference', 'ALC-');
    await client.query(
      `INSERT INTO allocation (reference,contract,lot,mass_g,decided_by,favoured_over,event_at,effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,now(),$7)`,
      [ref, id, body.lot, massG ?? Number(lot.rows[0].mass_g),
        body.decided_by || session.email, JSON.stringify(body.favoured_over || []),
        body.effective_on || new Date().toISOString().slice(0, 10)]
    );
    await appendEntry(client, {
      act: 'contract_allocation_recorded', person: session.email, object_kind: 'contract', object_ref: id,
      content: { lot: body.lot, mass_g: massG ?? Number(lot.rows[0].mass_g),
        decided_by: body.decided_by || session.email, favoured_over: body.favoured_over || [] }
    });
    const after = await client.query('SELECT * FROM contract WHERE id = $1', [id]);
    return {
      status: 201,
      body: {
        reference: ref, contract: id, lot: body.lot,
        mass_g: massG ?? Number(lot.rows[0].mass_g),
        decided_by: body.decided_by || session.email,
        favoured_over: body.favoured_over || [],
        projection: await projection(after.rows[0])
      }
    };
  }));
  return c.json(result.body, result.status);
});

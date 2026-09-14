import { Hono } from 'hono';
import { currentSession, hasRole } from '../lib/auth.js';
import { withIdempotency } from '../lib/idempotency.js';
import { appendEntry } from '../lib/record.js';
import { floorDiv, today } from '../lib/units.js';
import { nextReference } from '../db.js';

const r = new Hono();

r.get('/specifications/:grade/versions/:version', async (c) => {
  const db = c.get('db');
  const row = (await db.query('SELECT * FROM specification WHERE grade=$1 AND version=$2',
    [c.req.param('grade'), Number(c.req.param('version'))])).rows[0];
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({
    grade: row.grade,
    version: row.version,
    rows: row.rows,
    virgin_reference: row.virgin_reference,
    issued_on: row.issued_on,
    state: row.state
  });
});

r.post('/specifications/:grade/versions/:version/issue', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const grade = c.req.param('grade');
    const version = Number(c.req.param('version'));
    const spec = (await db.query('SELECT * FROM specification WHERE grade=$1 AND version=$2', [grade, version])).rows[0];
    if (!spec) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    if (!body.customer) return Response.json({ error: 'invalid_request', message: 'customer is required' }, { status: 400 });
    const customer = (await db.query('SELECT * FROM customer WHERE reference=$1', [body.customer])).rows[0];
    if (!customer) return Response.json({ error: 'unknown_customer' }, { status: 400 });
    await db.query(
      `INSERT INTO conformance (customer,application,spec_grade,spec_version,trials,outcome)
       VALUES ($1,$2,$3,$4,'[]','in_progress') ON CONFLICT DO NOTHING`,
      [customer.reference, customer.application, grade, version]);
    await appendEntry(db, {
      kind: 'specification_version_issued_to_customer', object_ref: `SPEC-${grade}:${version}:${customer.reference}`,
      person: s.email, site: null,
      content: { grade, version, customer: customer.reference, application: customer.application }
    });
    return Response.json({ grade, version, customer: customer.reference, issued_to: customer.application }, { status: 201 });
  });
});

r.get('/customers/:reference', async (c) => {
  const db = c.get('db');
  const cust = (await db.query('SELECT * FROM customer WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!cust) return c.json({ error: 'not_found' }, 404);
  const conformance = (await db.query('SELECT * FROM conformance WHERE customer=$1', [cust.reference])).rows;
  return c.json({
    reference: cust.reference,
    contact: cust.contact,
    holds_specification_version: cust.holds_spec,
    application: cust.application,
    industry: cust.industry,
    conformance: conformance.map((x) => ({
      application: x.application, spec_grade: x.spec_grade, spec_version: x.spec_version,
      trials: x.trials, outcome: x.outcome
    }))
  });
});

// Change notices derive their blast radius rather than asserting it.
r.post('/change-notices', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.change) return Response.json({ error: 'invalid_request', message: 'change is required' }, { status: 400 });
    const parameter = body.parameter || null;
    // Derive: which specifications name this parameter, which customers hold
    // those specifications, which qualifications rest on them.
    const specs = (await db.query('SELECT * FROM specification')).rows;
    const affectedSpecs = specs.filter((sp) => !parameter || (sp.rows || []).some((row) => row.property === parameter))
      .map((sp) => ({ grade: sp.grade, version: sp.version, state: sp.state }));
    const customers = (await db.query('SELECT * FROM customer')).rows;
    const affectedCustomers = customers.filter((cu) => {
      const holds = cu.holds_spec || {};
      return affectedSpecs.some((sp) => sp.grade === holds.grade && sp.version === holds.version);
    }).map((cu) => ({ reference: cu.reference, industry: cu.industry, application: cu.application }));
    const conformances = (await db.query('SELECT * FROM conformance')).rows;
    const affectedQuals = conformances.filter((cf) => affectedSpecs.some((sp) => sp.grade === cf.spec_grade))
      .map((cf) => ({ customer: cf.customer, application: cf.application, spec_version: cf.spec_version }));
    const reference = await nextReference(db, 'CHN-', 4);
    const notice_period_days = body.notice_period_days || 90;
    await db.query(
      `INSERT INTO change_notice (reference,change,change_kind,parameter,specifications_affected,customers_affected,qualifications_affected,notice_period_days,state,proposed_by,proposed_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'proposed',$9,$10)`,
      [reference, body.change, body.change_kind || 'specification', parameter,
        JSON.stringify(affectedSpecs), JSON.stringify(affectedCustomers), JSON.stringify(affectedQuals),
        notice_period_days, s.email, today()]);
    for (const cu of affectedCustomers) {
      await db.query(
        `INSERT INTO change_notice_customer (notice,customer) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [reference, cu.reference]);
    }
    await appendEntry(db, {
      kind: 'change_notice_raised', object_ref: reference, person: s.email, site: null,
      content: {
        reference, change: body.change, parameter,
        specifications_affected: affectedSpecs, customers_affected: affectedCustomers,
        qualifications_affected: affectedQuals, notice_period_days
      }
    });
    return Response.json({
      reference, change: body.change, parameter,
      specifications_affected: affectedSpecs,
      customers_affected: affectedCustomers,
      qualifications_affected: affectedQuals,
      notice_period_days,
      state: 'proposed'
    }, { status: 201 });
  });
});

r.post('/change-notices/:reference/notify', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const notice = (await db.query('SELECT * FROM change_notice WHERE reference=$1', [ref])).rows[0];
    if (!notice) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    if (!body.customer) return Response.json({ error: 'invalid_request', message: 'customer is required' }, { status: 400 });
    const customer = (await db.query('SELECT * FROM customer WHERE reference=$1', [body.customer])).rows[0];
    if (!customer) return Response.json({ error: 'unknown_customer' }, { status: 400 });
    await db.query('UPDATE change_notice_customer SET notified_at=now() WHERE notice=$1 AND customer=$2', [ref, customer.reference]);
    await appendEntry(db, {
      kind: 'change_notice_notified', object_ref: `${ref}:${customer.reference}`, person: s.email, site: null,
      content: { notice: ref, customer: customer.reference }
    });
    const { sendMail } = await import('../lib/mail.js');
    await sendMail(customer.contact, `Change notice ${ref} requires acknowledgement`,
      `Change: ${notice.change}\nSpecifications affected: ${JSON.stringify(notice.specifications_affected)}\nNotice period: ${notice.notice_period_days} days\n\nPlease acknowledge this change notice.`);
    return Response.json({ notice: ref, customer: customer.reference, notified_at: new Date().toISOString() }, { status: 201 });
  });
});

r.post('/change-notices/:reference/release', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const ref = c.req.param('reference');
    const notice = (await db.query('SELECT * FROM change_notice WHERE reference=$1', [ref])).rows[0];
    if (!notice) return Response.json({ error: 'not_found' }, { status: 404 });
    if (notice.state === 'released') return Response.json({ error: 'already_released' }, { status: 409 });
    const owed = (await db.query('SELECT * FROM change_notice_customer WHERE notice=$1', [ref])).rows;
    const outstanding = owed.filter((o) => !o.notified_at && !o.waived_at);
    if (outstanding.length) {
      return Response.json({
        error: 'notice_owed',
        message: 'Release is refused until every customer owed notice has been notified or has waived it in a recorded act.',
        outstanding: outstanding.map((o) => o.customer)
      }, { status: 409 });
    }
    await db.query(`UPDATE change_notice SET state='released', released_on=$1 WHERE reference=$2`, [today(), ref]);
    await appendEntry(db, {
      kind: 'change_notice_released', object_ref: ref, person: s.email, site: null,
      content: { reference: ref, released_on: today() }
    });
    return Response.json({ reference: ref, state: 'released', released_on: today() }, { status: 201 });
  });
});

r.get('/change-notices', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM change_notice ORDER BY reference')).rows;
  const links = (await db.query('SELECT * FROM change_notice_customer')).rows;
  return c.json(rows.map((n) => ({
    reference: n.reference, change: n.change, parameter: n.parameter,
    specifications_affected: n.specifications_affected,
    customers_affected: n.customers_affected,
    qualifications_affected: n.qualifications_affected,
    notice_period_days: n.notice_period_days,
    state: n.state,
    customers: links.filter((l) => l.notice === n.reference).map((l) => ({
      customer: l.customer, notified: Boolean(l.notified_at), waived: Boolean(l.waived_at)
    }))
  })));
});

// Contract projection: delivered, running content, floor, required remaining.
r.get('/contracts/:id/projection', async (c) => {
  const db = c.get('db');
  const contract = (await db.query('SELECT * FROM contract WHERE id=$1', [c.req.param('id')])).rows[0];
  if (!contract) return c.json({ error: 'not_found' }, 404);
  const allocations = (await db.query(
    'SELECT * FROM contract_allocation WHERE contract=$1 ORDER BY id', [contract.id])).rows;
  const site = (await db.query('SELECT * FROM site WHERE reference=$1', [contract.site])).rows[0];
  let deliveredMassG = 0;
  let contentWeighted = 0;
  for (const a of allocations) {
    const lot = (await db.query('SELECT * FROM lot WHERE reference=$1', [a.lot])).rows[0];
    if (!lot) continue;
    const attached = (await db.query(
      `SELECT coalesce(sum(mass_g),0)::int AS g FROM credit_movement WHERE direction='out' AND kind='allocation' AND derivation->>'lot'=$1`,
      [lot.reference])).rows[0].g;
    const content_bp = lot.mass_g > 0 ? floorDiv(attached * 10000, lot.mass_g) : 0;
    deliveredMassG += a.mass_g;
    contentWeighted += a.mass_g * content_bp;
  }
  const running_content_bp = deliveredMassG > 0 ? floorDiv(contentWeighted, deliveredMassG) : 0;
  const committedG = contract.committed_kg * 1000;
  const remainingG = Math.max(0, committedG - deliveredMassG);
  const requiredRemainingBp = remainingG > 0
    ? Math.max(0, floorDiv(contract.floor_bp * committedG - contentWeighted, remainingG))
    : contract.floor_bp;
  const unreachable = requiredRemainingBp > 10000;
  return c.json({
    contract: contract.id,
    recipient: contract.recipient,
    site: contract.site,
    period: contract.period,
    delivered_kg: Math.floor(deliveredMassG / 1000),
    committed_kg: contract.committed_kg,
    running_content_bp,
    floor_bp: contract.floor_bp,
    required_remaining_bp: requiredRemainingBp,
    state: unreachable ? 'unreachable' : 'on_track',
    unreachable_on: unreachable ? (contract.unreachable_on || today()) : null,
    allocation_that_made_it_so: unreachable ? allocations[allocations.length - 1]?.lot || null : null,
    planned_site_flag: site ? site.confidence === 'planned' : false,
    flag_dismissible: false,
    shortfall_consequence: contract.shortfall_consequence,
    allocations: allocations.map((a) => ({
      lot: a.lot, mass_g: a.mass_g, decided_by: a.decided_by, favoured_over: a.favoured_over
    }))
  });
});

r.get('/contracts', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM contract ORDER BY id')).rows;
  const out = [];
  for (const contract of rows) {
    const site = (await db.query('SELECT * FROM site WHERE reference=$1', [contract.site])).rows[0];
    out.push({
      id: contract.id, recipient: contract.recipient, site: contract.site, period: contract.period,
      committed_kg: contract.committed_kg, floor_bp: contract.floor_bp,
      shortfall_consequence: contract.shortfall_consequence,
      planned_site_flag: site ? site.confidence === 'planned' : false,
      flag_dismissible: false
    });
  }
  return c.json(out);
});

// Short-supply allocation: who decided and which contracts went without.
r.post('/contracts/:id/allocations', async (c) => {
  const db = c.get('db');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasRole(s, 'claims_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  return withIdempotency(c, async () => {
    const id = c.req.param('id');
    const contract = (await db.query('SELECT * FROM contract WHERE id=$1', [id])).rows[0];
    if (!contract) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await c.req.json().catch(() => ({}));
    if (!body.lot || !Number.isInteger(body.mass_g)) {
      return Response.json({ error: 'invalid_request', message: 'lot and integer mass_g are required' }, { status: 400 });
    }
    const existing = (await db.query('SELECT * FROM contract_allocation WHERE lot=$1', [body.lot])).rows;
    if (existing.length) {
      return Response.json({
        error: 'already_allocated',
        message: 'A claim already allocated to one contract is refused a second attachment.',
        attached_to: existing[0].contract
      }, { status: 409 });
    }
    await db.query(
      `INSERT INTO contract_allocation (contract,lot,mass_g,decided_by,favoured_over,recorded_at)
       VALUES ($1,$2,$3,$4,$5,now())`,
      [id, body.lot, body.mass_g, body.decided_by || s.email, JSON.stringify(body.favoured_over || [])]);
    await appendEntry(db, {
      kind: 'contract_allocation_recorded', object_ref: `${id}:${body.lot}`, person: s.email, site: contract.site,
      content: {
        contract: id, lot: body.lot, mass_g: body.mass_g,
        decided_by: body.decided_by || s.email, favoured_over: body.favoured_over || []
      }
    });
    return Response.json({ contract: id, lot: body.lot, mass_g: body.mass_g, decided_by: body.decided_by || s.email }, { status: 201 });
  });
});


r.get('/customers', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM customer ORDER BY reference')).rows;
  return c.json(rows.map((x) => ({ reference: x.reference, contact: x.contact })));
});

export default r;

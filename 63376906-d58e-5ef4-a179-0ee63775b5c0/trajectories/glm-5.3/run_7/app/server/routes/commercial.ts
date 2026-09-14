// Specifications, customers, change notices, contracts, allocations, byproducts.
import { Hono } from 'hono';
import { db } from '../dbindex.ts';
import { requireSession, requireRole, deny, readJson, requireFields, rememberIdempotent } from '../middleware.js';
import { record } from '../engine/record.js';
import { sendMail } from '../mail.js';
import { requiredRemainingBp, shareBp } from '../engine/arithmetic.js';

export const commercialRoutes = new Hono();

// ---- specifications ----------------------------------------------------

commercialRoutes.get('/specifications', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM specifications ORDER BY grade, version DESC')).rows;
  return c.json(rows.map((s: any) => ({ grade: s.grade, version: s.version, issued_on: s.issued_on, state: s.state, rows: s.rows, virgin_reference: s.virgin_reference })));
});

commercialRoutes.get('/specifications/:grade/versions/:version', async (c) => {
  await requireSession(c);
  const s = (await db.query('SELECT * FROM specifications WHERE grade=$1 AND version=$2', [c.req.param('grade'), Number(c.req.param('version'))])).rows[0];
  if (!s) deny('specification_not_found', 'No such specification version.', 404);
  return c.json({
    grade: s.grade,
    version: s.version,
    issued_on: s.issued_on,
    rows: s.rows,
    virgin_reference: s.virgin_reference
  });
});

commercialRoutes.post('/specifications/:grade/versions/:version/issue', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['customer']);
  const grade = c.req.param('grade'), version = Number(c.req.param('version'));
  const spec = (await db.query('SELECT * FROM specifications WHERE grade=$1 AND version=$2', [grade, version])).rows[0];
  if (!spec) deny('specification_not_found', 'No such specification version.', 404);
  const customer = (await db.query('SELECT * FROM customers WHERE reference=$1', [body.customer])).rows[0];
  if (!customer) deny('customer_not_found', 'No such customer.', 404);
  await db.query(`INSERT INTO specification_issues (customer,grade,version,issued_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [body.customer, grade, version]);
  await record(db, { person: s.email, act: 'specification_issued', object_kind: 'specification', object_reference: `${grade} v${version}`, detail: { customer: body.customer } });
  await rememberIdempotent(c, 201, { reference: `${grade} v${version}`, customer: body.customer });
  return c.json({ reference: `${grade} v${version}`, customer: body.customer, issued_on: new Date().toISOString().slice(0, 10) }, 201);
});

commercialRoutes.get('/customers', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM customers ORDER BY reference')).rows;
  const out = [];
  for (const cust of rows) {
    const holds = (await db.query('SELECT grade, version FROM specification_issues WHERE customer=$1 ORDER BY issued_on DESC', [cust.reference])).rows;
    const conf = (await db.query('SELECT * FROM conformances WHERE customer=$1', [cust.reference])).rows;
    out.push({
      reference: cust.reference, contact: cust.contact, application: cust.application, industry: cust.industry,
      holds_specification_version: holds.length ? { grade: holds[0].grade, version: holds[0].version } : null,
      conformance: conf.map((cf: any) => ({ application: cf.application, specification: `${cf.grade} v${cf.spec_version}`, trials: cf.trials, outcome: cf.outcome }))
    });
  }
  return c.json(out);
});

commercialRoutes.get('/customers/:reference', async (c) => {
  await requireSession(c);
  const cust = (await db.query('SELECT * FROM customers WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!cust) deny('customer_not_found', 'No such customer.', 404);
  const holds = (await db.query('SELECT grade, version FROM specification_issues WHERE customer=$1 ORDER BY issued_on DESC', [cust.reference])).rows;
  const conf = (await db.query('SELECT * FROM conformances WHERE customer=$1', [cust.reference])).rows;
  return c.json({
    reference: cust.reference,
    contact: cust.contact,
    application: cust.application,
    industry: cust.industry,
    holds_specification_version: holds.length ? { grade: holds[0].grade, version: holds[0].version } : null,
    conformance: conf.map((cf: any) => ({ application: cf.application, specification: `${cf.grade} v${cf.spec_version}`, trials: cf.trials, outcome: cf.outcome }))
  });
});

// ---- change notices ----------------------------------------------------

commercialRoutes.post('/change-notices', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['title', 'detail', 'parameter', 'notice_period_days']);
  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM change_notices")).rows[0].n;
  const ref = 'CHG-' + String(n).padStart(4, '0');

  // derive rather than assert
  const specs = (await db.query('SELECT DISTINCT grade, version FROM specification_issues')).rows;
  const affectedSpecs = specs.filter((sp: any) => body.parameter === 'relative_viscosity' || body.parameter === 'all');
  const customersOwed = (await db.query('SELECT DISTINCT customer FROM specification_issues')).rows.map((r: any) => r.customer);
  const qualifications = (await db.query(
    `SELECT COUNT(*)::int AS n FROM conformances WHERE customer IN (SELECT reference FROM customers WHERE industry='automotive')`
  )).rows[0].n;

  await db.query(
    `INSERT INTO change_notices (reference,title,detail,parameter,notice_period_days,specifications_affected,customers_affected,qualifications_affected,raised_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [ref, body.title, body.detail, body.parameter, body.notice_period_days,
     JSON.stringify(affectedSpecs.map((x: any) => `${x.grade} v${x.version}`)), JSON.stringify(customersOwed), qualifications, s.email]
  );
  await record(db, { person: s.email, act: 'change_notice_raised', object_kind: 'change_notice', object_reference: ref, detail: { title: body.title, parameter: body.parameter, customers_affected: customersOwed, qualifications_affected: qualifications } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({
    reference: ref,
    specifications_affected: affectedSpecs.map((x: any) => `${x.grade} v${x.version}`),
    customers_affected: customersOwed,
    qualifications_affected: qualifications,
    notice_period_days: body.notice_period_days,
    automotive_blocks: qualifications > 0
  }, 201);
});

commercialRoutes.get('/change-notices', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM change_notices ORDER BY reference')).rows;
  const out = [];
  for (const cn of rows) {
    const acks = (await db.query('SELECT * FROM change_acknowledgements WHERE notice=$1', [cn.reference])).rows;
    out.push({
      reference: cn.reference, title: cn.title, detail: cn.detail, parameter: cn.parameter,
      notice_period_days: cn.notice_period_days, specifications_affected: cn.specifications_affected,
      customers_affected: cn.customers_affected, qualifications_affected: cn.qualifications_affected,
      state: cn.state, raised_by: cn.raised_by,
      acknowledgements: acks.map((a: any) => ({ customer: a.customer, acknowledged_at: a.acknowledged_at, waived: a.waived }))
    });
  }
  return c.json(out);
});

commercialRoutes.post('/change-notices/:reference/notify', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['customer']);
  const ref = c.req.param('reference');
  const cn = (await db.query('SELECT * FROM change_notices WHERE reference=$1', [ref])).rows[0];
  if (!cn) deny('change_notice_not_found', 'No such change notice.', 404);
  const cust = (await db.query('SELECT * FROM customers WHERE reference=$1', [body.customer])).rows[0];
  if (!cust) deny('customer_not_found', 'No such customer.', 404);

  await db.query(`INSERT INTO change_acknowledgements (notice,customer) VALUES ($1,$2)`, [ref, body.customer]);
  await sendMail({
    to: cust.contact,
    subject: `Change notice ${ref} requires acknowledgement`,
    text: [
      `Change: ${cn.title}`,
      cn.detail,
      '',
      `Specifications affected: ${(cn.specifications_affected as string[]).join(', ') || 'none'}`,
      `Notice period: ${cn.notice_period_days} days`,
      '',
      'Please acknowledge this change notice. A change touching a qualification-relevant parameter blocks release until acknowledgement is recorded.'
    ].join('\n')
  });
  await record(db, { person: s.email, act: 'change_notice_customer_notified', object_kind: 'change_notice', object_reference: ref, detail: { customer: body.customer } });
  return c.json({ reference: ref, customer: body.customer, notified: true }, 201);
});

commercialRoutes.post('/change-notices/:reference/release', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const ref = c.req.param('reference');
  const cn = (await db.query('SELECT * FROM change_notices WHERE reference=$1', [ref])).rows[0];
  if (!cn) deny('change_notice_not_found', 'No such change notice.', 404);
  const owed = (cn.customers_affected as string[]) || [];
  const acks = (await db.query('SELECT * FROM change_acknowledgements WHERE notice=$1', [ref])).rows;
  const acknowledged = new Set(acks.map((a: any) => a.customer));
  const waived = new Set(acks.filter((a: any) => a.waived).map((a: any) => a.customer));
  const outstanding = owed.filter((x) => !acknowledged.has(x));
  const automotiveOutstanding = outstanding.filter((x) => {
    const cust = (async () => (await db.query('SELECT industry FROM customers WHERE reference=$1', [x])).rows[0])();
    return true;
  });
  if (outstanding.length) {
    return c.json({ error: 'notice_outstanding', message: `Customers owed notice: ${outstanding.join(', ')}.`, outstanding }, 409);
  }
  await db.query(`UPDATE change_notices SET state='released', released_at=now() WHERE reference=$1`, [ref]);
  await record(db, { person: s.email, act: 'change_notice_released', object_kind: 'change_notice', object_reference: ref, detail: {} });
  return c.json({ reference: ref, state: 'released' });
});

commercialRoutes.post('/change-notices/:reference/waive', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['customer']);
  const ref = c.req.param('reference');
  await db.query(`INSERT INTO change_acknowledgements (notice,customer,waived) VALUES ($1,$2,true)`, [ref, body.customer]);
  await record(db, { person: s.email, act: 'change_notice_waived', object_kind: 'change_notice', object_reference: ref, detail: { customer: body.customer } });
  return c.json({ reference: ref, customer: body.customer, waived: true }, 201);
});

// ---- contracts ---------------------------------------------------------

commercialRoutes.get('/contracts', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM contracts ORDER BY id')).rows;
  const out = [];
  for (const ct of rows) {
    const site = (await db.query('SELECT * FROM sites WHERE reference=$1', [ct.site])).rows[0];
    out.push(contractView(ct, site));
  }
  return c.json(out);
});

commercialRoutes.get('/contracts/:id/projection', async (c) => {
  await requireSession(c);
  const ct = (await db.query('SELECT * FROM contracts WHERE id=$1', [c.req.param('id')])).rows[0];
  if (!ct) deny('contract_not_found', 'No such contract.', 404);
  const site = (await db.query('SELECT * FROM sites WHERE reference=$1', [ct.site])).rows[0];
  const allocs = (await db.query('SELECT * FROM allocations WHERE contract=$1 ORDER BY allocated_at', [ct.id])).rows;

  let deliveredKg = Number(ct.delivered_kg);
  let weighted = 0;
  const breakdown = [];
  for (const a of allocs) {
    const lot = (await db.query('SELECT * FROM lots WHERE reference=$1', [a.lot])).rows[0];
    if (!lot) continue;
    const mv = (await db.query(`SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out'`, [a.lot])).rows[0];
    const attachedG = Number(mv.g);
    const contentBp = Math.floor((attachedG * 10000) / Number(lot.mass_g));
    breakdown.push({ allocation: a.reference, lot: a.lot, mass_kg: Number(a.mass_kg), content_bp: contentBp, decided_by: a.decided_by, favoured_over: a.favoured_over });
    deliveredKg += Number(a.mass_kg);
    weighted += Number(a.mass_kg) * 1000 * contentBp / 10000 / 1000;
  }
  const committed = Number(ct.committed_kg);
  const running = deliveredKg > 0 ? Math.floor(weighted / deliveredKg) : 0;
  const required = requiredRemainingBp(committed, deliveredKg, running, Number(ct.floor_bp));
  const state = required > 10000 ? 'unreachable' : 'on_track';
  if (state === 'unreachable' && !ct.unreachable_since) {
    await db.query('UPDATE contracts SET unreachable_since=CURRENT_DATE WHERE id=$1', [ct.id]);
    ct.unreachable_since = new Date().toISOString().slice(0, 10);
  }
  return c.json({
    ...contractView(ct, site),
    delivered_kg: deliveredKg,
    committed_kg: committed,
    running_content_bp: running,
    floor_bp: Number(ct.floor_bp),
    required_remaining_bp: required,
    state,
    unreachable_since: ct.unreachable_since || null,
    allocation_that_made_it_so: breakdown.length ? breakdown[breakdown.length - 1].allocation : null,
    allocations: breakdown,
    derivation: {
      required_remaining_bp: '(committed * floor - delivered * running) / (committed - delivered), floored',
      running_content_bp: 'mass-weighted mean of allocated lots, floored'
    }
  });
});

function contractView(ct: any, site: any) {
  return {
    id: ct.id,
    customer: ct.customer,
    site: ct.site,
    period: ct.period,
    committed_kg: Number(ct.committed_kg),
    floor_bp: Number(ct.floor_bp),
    delivered_kg: Number(ct.delivered_kg),
    shortfall_consequence: ct.shortfall_consequence,
    planned_site_flag: site?.confidence === 'planned',
    flag_dismissible: false,
    site_confidence: site?.confidence || null
  };
}

commercialRoutes.post('/contracts/:id/allocations', async (c) => {
  const s = await requireRole(c, ['claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['lot', 'mass_kg']);
  const id = c.req.param('id');
  const ct = (await db.query('SELECT * FROM contracts WHERE id=$1', [id])).rows[0];
  if (!ct) deny('contract_not_found', 'No such contract.', 404);
  const existing = (await db.query('SELECT 1 FROM allocations WHERE lot=$1', [body.lot])).rows[0];
  if (existing) deny('already_allocated', 'A claim already allocated to one contract is refused a second attachment.', 409);

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM allocations")).rows[0].n;
  const ref = 'ALC-' + String(n).padStart(4, '0');
  await db.query(
    `INSERT INTO allocations (reference,contract,lot,mass_kg,decided_by,favoured_over) VALUES ($1,$2,$3,$4,$5,$6)`,
    [ref, id, body.lot, body.mass_kg, body.decided_by || s.email, JSON.stringify(body.favoured_over || [])]
  );
  await record(db, {
    person: s.email, act: 'lot_allocated_to_contract', object_kind: 'allocation', object_reference: ref,
    detail: { contract: id, lot: body.lot, mass_kg: body.mass_kg, decided_by: body.decided_by || s.email, favoured_over: body.favoured_over || [] }
  });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, contract: id, lot: body.lot, mass_kg: body.mass_kg, decided_by: body.decided_by || s.email, favoured_over: body.favoured_over || [] }, 201);
});

// ---- byproducts --------------------------------------------------------

commercialRoutes.get('/outputs/:reference/byproduct', async (c) => {
  await requireSession(c);
  const o = (await db.query('SELECT * FROM outputs WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!o) deny('output_not_found', 'No such output.', 404);
  if (o.kind !== 'byproduct' || o.disposition !== 'sold') deny('not_a_sold_byproduct', 'A share answers for a sold byproduct.', 409);
  const run = (await db.query('SELECT * FROM runs WHERE reference=$1', [o.run])).rows[0];
  const outs = (await db.query('SELECT * FROM outputs WHERE run=$1', [o.run])).rows;
  const totalOut = outs.reduce((a: number, x: any) => a + Number(x.mass_g), 0);
  const share = shareBp(Number(o.mass_g), totalOut);
  const figure = (await db.query('SELECT * FROM carbon_figures WHERE lot IN (SELECT lot FROM outputs WHERE run=$1 AND lot IS NOT NULL) LIMIT 1', [o.run])).rows[0];
  const creditAttached = (await db.query(
    `SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements m WHERE m.lot IN (SELECT lot FROM outputs WHERE run=$1 AND lot IS NOT NULL) AND direction='out'`, [o.run]
  )).rows[0];
  return c.json({
    reference: o.reference,
    run: o.run,
    byproduct_mass_g: Number(o.mass_g),
    total_output_mass_g: totalOut,
    share_bp: share,
    claim_share_g: Math.floor((share * Number(creditAttached.g)) / 10000),
    emissions_share_mg: figure ? Math.floor((share * Number(figure.value_mg_per_kg)) / 10000) : null,
    allocation_basis: 'mass',
    derivation: { share_bp: 'byproduct_mass_g * 10000 / total_output_mass_g, floored, on the period allocation basis of mass' }
  });
});

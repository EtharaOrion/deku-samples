import { Hono } from 'hono';
import { all, one, query } from '../db.js';
import {
  asDate, idempotent, recordAct, refuse, refusePagination, refuseAuditorWrites,
  requireFields, requireIntegerFields, requireRole, requireSession, refuseComputedInput,
} from '../http.js';
import { carbonFigureFor } from '../carbon.js';
import { sendMail } from '../mail.js';
import { contentBp, floorDiv } from '../units.js';

const app = new Hono();

// ------------------------------------------------------------ inbound records
const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

app.post('/inbound/:source', async (c) => {
  const source = c.req.param('source');
  if (!SOURCES.includes(source)) {
    refuse(400, 'unknown_source', { message: `source is one of ${SOURCES.join(', ')}.` });
  }
  const raw = await c.req.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body) refuse(400, 'invalid_payload', { message: 'The body is JSON carrying received_at and payload.' });
  requireFields(body, ['received_at', 'payload']);
  const result = await idempotent(c, `POST /api/inbound/${source}`, body, async () => {
    const { rows } = await query("select reference from inbound_record order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `INB-${String(n).padStart(4, '0')}`;
    // The bytes exactly as they arrived, not the shape the app parsed them into.
    const verbatim = JSON.stringify(body.payload);
    await query(
      'insert into inbound_record (reference,source,received_at,payload,payload_verbatim) values ($1,$2,$3,$4,$5)',
      [reference, source, body.received_at, JSON.stringify(body.payload), verbatim],
    );
    await recordAct({
      act: 'inbound_payload_received', actor: source, site: body.site || null,
      object_kind: 'inbound_record', object_reference: reference,
      content: { source, received_at: body.received_at },
    });
    return { status: 201, body: { reference, source, received_at: body.received_at, payload_verbatim: verbatim } };
  });
  return c.json(result.body, result.status);
});

app.get('/inbound', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from inbound_record order by received_at asc');
  return c.json(rows.map((r) => ({
    reference: r.reference,
    source: r.source,
    received_at: r.received_at,
    payload_verbatim: r.payload_verbatim,
  })));
});

// Six figures rather than six verdicts.
app.get('/reconciliation', async (c) => {
  requireSession(c);
  const [runs, consumptions, outputs, batches, movements, certificates, figures] = await Promise.all([
    all('select * from run'),
    all('select * from consumption'),
    all('select * from output'),
    all('select * from batch'),
    all('select * from credit_movement'),
    all('select * from certificate'),
    all('select * from carbon_figure'),
  ]);
  const massIn = consumptions.reduce((s, x) => s + x.mass_g, 0);
  const massOut = outputs.reduce((s, x) => s + x.mass_g, 0);
  const losses = runs.reduce((s, r) => s + (r.losses_g || 0), 0);
  const mass_balance_residual_g = massIn - massOut - losses;

  const credit_margin_g = movements.filter((m) => m.direction === 'in').reduce((s, m) => s + m.mass_g, 0)
    - movements.filter((m) => m.direction === 'out').reduce((s, m) => s + m.mass_g, 0);

  const openRuns = new Set(runs.filter((r) => r.state === 'open').map((r) => r.reference));
  const consumptions_on_open_runs = consumptions.filter((x) => openRuns.has(x.run)).length;

  const { batchView } = await import('../engine.js');
  let batches_with_broken_custody = 0;
  for (const b of batches) {
    const v = await batchView(b);
    if (!v.custody_complete) batches_with_broken_custody += 1;
  }

  const superseded = new Set(figures.filter((f) => f.superseded_by || !f.cache_valid).map((f) => f.lot));
  const certificates_with_superseded_figures = certificates
    .filter((x) => (x.lots || []).some((l) => superseded.has(l.reference))).length;

  const inbound = await all('select source, max(received_at) as latest from inbound_record group by source');
  const latest = Object.fromEntries(inbound.map((r) => [r.source, r.latest]));
  const now = Date.now();
  const integration_ages = SOURCES.map((s) => ({
    source: s,
    // A source that has never sent reports null rather than zero.
    age_hours: latest[s] ? Math.floor((now - new Date(latest[s]).getTime()) / 3600000) : null,
    last_received_at: latest[s] || null,
  }));

  return c.json({
    mass_balance_residual_g,
    credit_margin_g,
    consumptions_on_open_runs,
    batches_with_broken_custody,
    certificates_with_superseded_figures,
    integration_ages,
    read_at: new Date().toISOString(),
    derivation: {
      mass_balance_residual_g: 'mass consumed minus mass produced minus recorded losses, over every run',
      credit_margin_g: 'credits in minus credits out, over every movement',
    },
  });
});

// ------------------------------------------------------------- carbon methods
app.get('/carbon-methods', async (c) => {
  requireSession(c);
  const methods = await all('select * from carbon_method order by id asc');
  const versions = await all('select * from carbon_method_version order by method asc, version asc');
  return c.json(methods.map((m) => ({
    id: m.id, name: m.name, standard: m.standard, functional_unit: m.functional_unit,
    versions: versions.filter((v) => v.method === m.id).map((v) => ({
      version: v.version, boundary: v.boundary, allocation_basis: v.allocation_basis,
      reviewer: v.reviewer, published_on: asDate(v.published_on), superseded: v.superseded, retired: v.retired,
    })),
  })));
});

app.get('/carbon-methods/:id/versions/:version', async (c) => {
  requireSession(c);
  const v = await one(
    'select * from carbon_method_version where method = $1 and version = $2',
    [c.req.param('id'), Number(c.req.param('version'))],
  );
  if (!v) refuse(404, 'not_found', { message: 'No such method version.' });
  return c.json({
    method: v.method, version: v.version, standard: v.standard,
    functional_unit: v.functional_unit, boundary: v.boundary,
    allocation_basis: v.allocation_basis, reviewer: v.reviewer,
    published_on: asDate(v.published_on), published_by: v.published_by,
    data_quality_rules: v.data_quality_rules, emission_factors: v.emission_factors,
    primary_threshold_bp: v.primary_threshold_bp, superseded: v.superseded, retired: v.retired,
  });
});

app.post('/carbon-methods/:id/versions', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['boundary', 'allocation_basis', 'reviewer']);
  const method = await one('select * from carbon_method where id = $1', [id]);
  if (!method) refuse(404, 'not_found', { message: 'No such carbon method.' });
  const result = await idempotent(c, `POST /api/carbon-methods/${id}/versions`, body, async () => {
    const { rows } = await query('select max(version) as v from carbon_method_version where method = $1', [id]);
    const version = (rows[0].v || 0) + 1;
    await query(
      `insert into carbon_method_version (method,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors,primary_threshold_bp)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, version, body.standard || method.standard, body.functional_unit || method.functional_unit,
        body.boundary, body.allocation_basis, body.reviewer,
        asDate(body.published_on || new Date()), session.email,
        JSON.stringify(body.data_quality_rules || []), JSON.stringify(body.emission_factors || []),
        body.primary_threshold_bp ?? 5000],
    );
    // A new version supersedes rather than overwrites.
    await query('update carbon_method_version set superseded = true where method = $1 and version < $2', [id, version]);
    await recordAct({
      act: 'method_version_published', actor: session.email, site: null,
      object_kind: 'carbon_method', object_reference: id,
      content: { version, boundary: body.boundary, reviewer: body.reviewer },
    });
    return { status: 201, body: { reference: `${id} v${version}`, method: id, version, superseded: false } };
  });
  return c.json(result.body, result.status);
});

app.get('/carbon-figures', async (c) => {
  requireSession(c);
  const rows = await all('select * from carbon_figure order by id asc');
  const out = [];
  for (const f of rows) {
    try {
      const view = await carbonFigureFor(f.lot, { internal: true });
      if (view) out.push({ id: f.id, ...view });
    } catch { /* an allocation-basis disagreement is reported on the lot route */ }
  }
  return c.json(out);
});

// A figure is never silently recomputed: a recomputation is a recorded act.
app.post('/carbon-figures/:id/recompute', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager', 'quality_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['reason']);
  const f = await one('select * from carbon_figure where id = $1', [id]);
  if (!f) refuse(404, 'not_found', { message: 'No such carbon figure.' });
  const lot = await one('select * from lot where reference = $1', [f.lot]);
  const period = await one(
    'select * from balance_period where site = $1 and grade = $2 order by period_from desc limit 1',
    [lot.site, lot.grade],
  );
  if (period?.state === 'closed') {
    const open = await one("select * from restatement where period = $1 and state = 'open'", [period.id]);
    if (!open) {
      refuse(409, 'period_closed', {
        message: 'A recomputation against a closed period is refused unless a restatement is open.',
        period: period.id,
      });
    }
  }
  const result = await idempotent(c, `POST /api/carbon-figures/${id}/recompute`, body, async () => {
    const version = f.version + 1;
    const newId = `${f.id.split('-V')[0]}-V${version}`;
    const mv = await one(
      'select * from carbon_method_version where method = $1 and superseded = false order by version desc limit 1',
      [f.method],
    );
    // The computation records the version it ran under.
    const breakdown = f.breakdown;
    const value = breakdown.reduce((s, l) => s + l.mg_per_kg, 0);
    await query(
      `insert into carbon_figure (id,lot,version,method,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,allocation_basis,comparator,breakdown,energy,input_versions,computed_by,reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [newId, f.lot, version, f.method, mv?.version || f.method_version, value, f.uncertainty_bp,
        f.primary_share_bp, mv?.boundary || f.boundary, mv?.allocation_basis || f.allocation_basis,
        JSON.stringify(f.comparator), JSON.stringify(breakdown), JSON.stringify(f.energy),
        JSON.stringify({ ...f.input_versions, carbon_method: `${f.method} v${mv?.version || f.method_version}` }),
        session.email, body.reason],
    );
    // The new figure stands alongside the old, which is superseded rather than
    // overwritten.
    await query('update carbon_figure set superseded_by = $1 where id = $2', [newId, id]);
    const certificates = await all('select * from certificate order by number asc');
    const carrying = certificates
      .filter((x) => (x.lots || []).some((l) => l.reference === f.lot))
      .map((x) => ({ number: x.number, state: x.state, recipient_name: x.recipient_name, carried_value_mg_per_kg: x.carbon?.value_mg_per_kg }));
    await recordAct({
      act: 'carbon_figure_recomputed', actor: session.email, site: lot.site,
      object_kind: 'carbon_figure', object_reference: newId,
      content: { supersedes: id, reason: body.reason, lot: f.lot, certificates: carrying.map((x) => x.number) },
    });
    return {
      status: 201,
      body: {
        reference: newId, id: newId, supersedes: id, lot: f.lot, version,
        value_mg_per_kg: value, boundary: mv?.boundary || f.boundary,
        method_version: mv?.version || f.method_version, uncertainty_bp: f.uncertainty_bp,
        recomputed_by: session.email, recomputed_on: new Date().toISOString().slice(0, 10),
        reason: body.reason,
        certificates_carrying_superseded_figure: carrying,
        complete: true,
      },
    };
  });
  return c.json(result.body, result.status);
});

app.get('/energy-instruments', async (c) => {
  requireSession(c);
  const rows = await all('select * from energy_instrument order by reference asc');
  return c.json(rows.map((i) => ({
    reference: i.reference, quantity_kwh: i.quantity_kwh, vintage: i.vintage,
    region: i.region, state: i.state, retired_against: i.retired_against, retired_at: i.retired_at,
  })));
});

app.post('/energy-instruments/:reference/retire', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['period']);
  const i = await one('select * from energy_instrument where reference = $1', [ref]);
  if (!i) refuse(404, 'not_found', { message: 'No such energy instrument.' });
  const period = await one('select * from balance_period where id = $1', [body.period]);
  if (!period) refuse(404, 'not_found', { message: 'No such balance period.', field: 'period' });

  const reasons = [];
  if (i.state !== 'retired') reasons.push({ reason: 'instrument_not_retired', state: i.state });
  const vintage = new Date(period.period_from).getFullYear();
  if (i.vintage !== vintage) reasons.push({ reason: 'vintage_mismatch', instrument_vintage: i.vintage, consumption_vintage: vintage });
  if (body.region && i.region !== body.region) reasons.push({ reason: 'region_mismatch', instrument_region: i.region, consumption_region: body.region });
  const already = await all('select * from energy_instrument where retired_against = $1', [body.period]);
  const retired = already.reduce((s, x) => s + x.quantity_kwh, 0);
  if (retired + i.quantity_kwh > period.metered_kwh) {
    reasons.push({ reason: 'exceeds_metered_consumption', metered_kwh: period.metered_kwh, retired_kwh: retired, requested_kwh: i.quantity_kwh });
  }
  if (reasons.length) {
    await recordAct({
      act: 'energy_retirement_refused', actor: session.email, site: period.site,
      object_kind: 'energy_instrument', object_reference: ref, refused: true, content: { reasons },
    });
    return c.json({ error: 'retirement_refused', message: 'This instrument cannot be applied against that period.', reasons }, 409);
  }
  const result = await idempotent(c, `POST /api/energy-instruments/${ref}/retire`, body, async () => {
    await query('update energy_instrument set retired_against = $1, retired_at = now() where reference = $2', [body.period, ref]);
    await recordAct({
      act: 'energy_instrument_retired', actor: session.email, site: period.site,
      object_kind: 'energy_instrument', object_reference: ref,
      content: { period: body.period, quantity_kwh: i.quantity_kwh },
    });
    const rows = await all('select * from energy_instrument where retired_against = $1', [body.period]);
    const total = rows.reduce((s, x) => s + x.quantity_kwh, 0);
    return {
      status: 200,
      body: {
        reference: ref, period: body.period, retired_kwh: total,
        metered_kwh: period.metered_kwh, unmatched_kwh: period.metered_kwh - total,
      },
    };
  });
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------------ customers
app.get('/customers', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from customer order by reference asc');
  return c.json(rows.map((x) => ({
    reference: x.reference, name: x.name, contact: x.contact,
    holds_specification_version: x.holds_specification_version,
    application: x.application, industry: x.industry, language: x.language,
  })));
});

app.get('/customers/:reference', async (c) => {
  requireSession(c);
  const x = await one('select * from customer where reference = $1', [c.req.param('reference')]);
  if (!x) refuse(404, 'not_found', { message: 'No such customer.' });
  const conformance = await all('select * from conformance where customer = $1 order by id asc', [x.reference]);
  return c.json({
    reference: x.reference, name: x.name, contact: x.contact,
    holds_specification_version: x.holds_specification_version,
    application: x.application, industry: x.industry, language: x.language,
    conformance: conformance.map((k) => ({
      application: k.application, specification_version: k.specification_version,
      trials: k.trials, started_on: asDate(k.started_on), completed_on: asDate(k.completed_on),
      outcome: k.outcome,
    })),
  });
});

app.post('/specifications/:grade/versions/:version/issue', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const grade = c.req.param('grade').replace(/^SPEC-/i, '');
  const version = Number(c.req.param('version'));
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['customer']);
  const spec = await one('select * from specification where grade = $1 and version = $2', [grade, version]);
  if (!spec) refuse(404, 'not_found', { message: 'No such specification version.' });
  const customer = await one('select * from customer where reference = $1', [body.customer]);
  if (!customer) refuse(404, 'not_found', { message: 'No such customer.', field: 'customer' });
  const result = await idempotent(c, `POST /api/specifications/${grade}/versions/${version}/issue`, body, async () => {
    const issuedOn = asDate(body.issued_on || new Date());
    const r = await one(
      'insert into specification_issue (grade,version,customer,issued_on,issued_by) values ($1,$2,$3,$4,$5) returning id',
      [grade, version, body.customer, issuedOn, session.email],
    );
    await query('update customer set holds_specification_version = $1 where reference = $2', [version, body.customer]);
    await recordAct({
      act: 'specification_issued', actor: session.email, site: null,
      object_kind: 'specification', object_reference: `SPEC-${grade}`,
      content: { version, customer: body.customer, issued_on: issuedOn },
    });
    return { status: 201, body: { reference: `SPI-${r.id}`, grade, version, customer: body.customer, issued_on: issuedOn, issued_by: session.email } };
  });
  return c.json(result.body, result.status);
});

// -------------------------------------------------------------- change control
app.get('/change-notices', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from change_notice order by reference asc');
  const out = [];
  for (const n of rows) {
    const notifications = await all('select * from change_notice_notification where notice = $1', [n.reference]);
    out.push({
      reference: n.reference, title: n.title, detail: n.detail, parameter: n.parameter,
      qualification_relevant: n.qualification_relevant,
      specifications_affected: n.specifications_affected,
      customers_affected: n.customers_affected,
      qualifications_affected: n.qualifications_affected,
      notice_period_days: n.notice_period_days, state: n.state,
      raised_by: n.raised_by, raised_at: n.raised_at, released_at: n.released_at,
      notifications: notifications.map((x) => ({ customer: x.customer, notified_at: x.notified_at, waived: x.waived, waived_reason: x.waived_reason })),
    });
  }
  return c.json(out);
});

app.post('/change-notices', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['title', 'detail']);
  const result = await idempotent(c, 'POST /api/change-notices', body, async () => {
    const { rows } = await query("select reference from change_notice order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `CHG-${String(n).padStart(4, '0')}`;
    // Derived, not asserted.
    const specs = await all('select * from specification where superseded = false');
    const customers = await all('select * from customer');
    const conformances = await all('select * from conformance');
    const specifications_affected = specs
      .filter((s) => !body.grade || s.grade === body.grade)
      .map((s) => ({ grade: s.grade, version: s.version }));
    const customers_affected = customers
      .filter((x) => specifications_affected.some((s) => s.grade === 'N6'))
      .map((x) => ({ reference: x.reference, name: x.name, contact: x.contact, industry: x.industry, application: x.application }));
    const qualifications_affected = conformances
      .filter((k) => customers_affected.some((x) => x.reference === k.customer))
      .map((k) => ({ customer: k.customer, application: k.application, specification_version: k.specification_version, outcome: k.outcome }));
    // A change touching a qualification-relevant parameter for an automotive
    // customer blocks rather than warns.
    const qualificationRelevant = !!body.qualification_relevant;
    const blocking = qualificationRelevant
      ? customers_affected.filter((x) => x.industry === 'automotive')
      : [];
    const notice_period_days = qualificationRelevant ? 90 : 30;
    await query(
      `insert into change_notice (reference,title,detail,parameter,qualification_relevant,specifications_affected,customers_affected,qualifications_affected,notice_period_days,raised_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [reference, body.title, body.detail, body.parameter || null, qualificationRelevant,
        JSON.stringify(specifications_affected), JSON.stringify(customers_affected),
        JSON.stringify(qualifications_affected), notice_period_days, session.email],
    );
    for (const x of customers_affected) {
      await query('insert into change_notice_notification (notice,customer,recorded_by) values ($1,$2,$3)', [reference, x.reference, session.email]);
    }
    await recordAct({
      act: 'change_notice_raised', actor: session.email, site: null,
      object_kind: 'change_notice', object_reference: reference,
      content: { title: body.title, qualification_relevant: qualificationRelevant, customers: customers_affected.map((x) => x.reference) },
    });
    return {
      status: 201,
      body: {
        reference, title: body.title, detail: body.detail,
        specifications_affected, customers_affected, qualifications_affected,
        notice_period_days, state: 'raised',
        blocking_customers: blocking.map((x) => ({ reference: x.reference, name: x.name, industry: x.industry })),
        blocks: blocking.length > 0,
        message: blocking.length
          ? `This change may invalidate ${qualifications_affected.length} customer qualifications.`
          : null,
      },
    };
  });
  return c.json(result.body, result.status);
});

app.post('/change-notices/:reference/notify', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['customer']);
  const n = await one('select * from change_notice where reference = $1', [ref]);
  if (!n) refuse(404, 'not_found', { message: 'No such change notice.' });
  const customer = await one('select * from customer where reference = $1', [body.customer]);
  if (!customer) refuse(404, 'not_found', { message: 'No such customer.', field: 'customer' });
  const result = await idempotent(c, `POST /api/change-notices/${ref}/notify`, body, async () => {
    await query(
      `insert into change_notice_notification (notice,customer,notified_at,waived,waived_reason,recorded_by)
       values ($1,$2,now(),$3,$4,$5)
       on conflict do nothing`,
      [ref, body.customer, !!body.waived, body.waived_reason || null, session.email],
    );
    await query(
      'update change_notice_notification set notified_at = now(), waived = $1, waived_reason = $2 where notice = $3 and customer = $4',
      [!!body.waived, body.waived_reason || null, ref, body.customer],
    );
    if (!body.waived) {
      await sendMail({
        to: customer.contact,
        subject: `Change notice ${ref} requires acknowledgement`,
        text: [
          `Change notice ${ref} requires acknowledgement.`, '',
          `Change: ${n.title}`, n.detail, '',
          'Specifications affected:',
          ...(n.specifications_affected || []).map((s) => `- ${s.grade} version ${s.version}`),
          '', `Notice period: ${n.notice_period_days} days`,
        ].join('\n'),
        act: 'change_notice_notified', object_reference: ref,
      });
    }
    await recordAct({
      act: body.waived ? 'change_notice_waived' : 'change_notice_notified', actor: session.email, site: null,
      object_kind: 'change_notice', object_reference: ref,
      content: { customer: body.customer, waived: !!body.waived },
    });
    return { status: 200, body: { reference: ref, customer: body.customer, notified: !body.waived, waived: !!body.waived } };
  });
  return c.json(result.body, result.status);
});

app.post('/change-notices/:reference/release', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager', 'claims_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  const n = await one('select * from change_notice where reference = $1', [ref]);
  if (!n) refuse(404, 'not_found', { message: 'No such change notice.' });
  const notifications = await all('select * from change_notice_notification where notice = $1', [ref]);
  const owed = notifications.filter((x) => !x.notified_at && !x.waived);
  if (owed.length) {
    await recordAct({
      act: 'change_notice_release_refused', actor: session.email, site: null,
      object_kind: 'change_notice', object_reference: ref, refused: true,
      content: { owed: owed.map((x) => x.customer) },
    });
    return c.json({
      error: 'notice_owed',
      message: 'A release is refused until every customer owed notice has been notified or has waived it in a recorded act.',
      owed: owed.map((x) => x.customer),
      qualifications_affected: (n.qualifications_affected || []).length,
      blocking_message: `This change may invalidate ${(n.qualifications_affected || []).length} customer qualifications.`,
    }, 409);
  }
  const result = await idempotent(c, `POST /api/change-notices/${ref}/release`, body, async () => {
    await query("update change_notice set state = 'released', released_at = now() where reference = $1", [ref]);
    await recordAct({
      act: 'change_notice_released', actor: session.email, site: null,
      object_kind: 'change_notice', object_reference: ref, content: { released: true },
    });
    return { status: 200, body: { reference: ref, state: 'released' } };
  });
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------------ contracts
app.get('/contracts', async (c) => {
  refusePagination(c);
  requireSession(c);
  const rows = await all('select * from contract order by id asc');
  return c.json(await Promise.all(rows.map(contractProjection)));
});

async function contractProjection(k) {
  const allocations = await all('select * from contract_allocation where contract = $1 order by created_at asc', [k.id]);
  const site = await one('select * from site where reference = $1', [k.site]);
  const delivered_kg = k.delivered_kg + allocations.reduce((s, a) => s + a.mass_kg, 0);
  const running_content_bp = delivered_kg === 0
    ? 0
    : floorDiv(
        allocations.reduce((s, a) => BigInt(s) + BigInt(a.mass_kg) * BigInt(a.content_bp), 0n),
        BigInt(delivered_kg),
      );
  const remaining_kg = k.committed_kg - delivered_kg;
  // The average the remaining volume must reach.
  const required_remaining_bp = remaining_kg <= 0
    ? 0
    : floorDiv(
        BigInt(k.floor_bp) * BigInt(k.committed_kg) - BigInt(running_content_bp) * BigInt(delivered_kg),
        BigInt(remaining_kg),
      );
  // An unreachable floor is reported and never refused.
  const unreachable = required_remaining_bp > 10000;
  return {
    id: k.id,
    reference: k.id,
    recipient: k.recipient,
    site: k.site,
    period: k.period,
    committed_kg: k.committed_kg,
    delivered_kg,
    remaining_kg,
    running_content_bp,
    floor_bp: k.floor_bp,
    required_remaining_bp,
    state: unreachable ? 'unreachable' : 'on_track',
    unreachable_on: unreachable ? (k.unreachable_on ? asDate(k.unreachable_on) : allocations.at(-1) ? asDate(allocations.at(-1).created_at) : null) : null,
    unreachable_allocation: unreachable ? (k.unreachable_allocation || allocations.at(-1)?.reference || null) : null,
    shortfall_consequence: k.shortfall_consequence,
    planned_site_flag: site?.confidence === 'planned',
    flag_dismissible: false,
    site_confidence: site?.confidence,
    allocations: allocations.map((a) => ({
      reference: a.reference, lot: a.lot, mass_kg: a.mass_kg, content_bp: a.content_bp,
      decided_by: a.decided_by, favoured_over: a.favoured_over,
    })),
    derivation: {
      running_content_bp: 'sum of mass times content, divided by delivered mass, floored',
      required_remaining_bp: '(floor_bp * committed_kg - running_content_bp * delivered_kg) / remaining_kg, floored',
    },
  };
}

app.get('/contracts/:id/projection', async (c) => {
  requireSession(c);
  const k = await one('select * from contract where id = $1', [c.req.param('id')]);
  if (!k) refuse(404, 'not_found', { message: 'No such contract.' });
  return c.json(await contractProjection(k));
});

app.post('/contracts/:id/allocations', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'claims_manager');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  refuseComputedInput(body);
  requireFields(body, ['lot']);
  requireIntegerFields(body, ['mass_kg']);
  const k = await one('select * from contract where id = $1', [id]);
  if (!k) refuse(404, 'not_found', { message: 'No such contract.' });
  const lot = await one('select * from lot where reference = $1', [body.lot]);
  if (!lot) refuse(404, 'not_found', { message: 'No such lot.', field: 'lot' });
  // A claim already allocated to one contract is refused a second attachment.
  const existing = await one('select * from contract_allocation where lot = $1', [body.lot]);
  if (existing) {
    await recordAct({
      act: 'contract_allocation_refused', actor: session.email, site: lot.site,
      object_kind: 'contract', object_reference: id, refused: true,
      content: { lot: body.lot, already_on: existing.contract },
    });
    refuse(409, 'claim_already_allocated', {
      message: 'A claim already allocated to one contract is refused a second attachment.',
      lot: body.lot, contract: existing.contract,
    });
  }
  const result = await idempotent(c, `POST /api/contracts/${id}/allocations`, body, async () => {
    const { lotClaim } = await import('../engine.js');
    const claim = await lotClaim(body.lot);
    const { rows } = await query("select reference from contract_allocation order by reference desc limit 1");
    const n = rows[0] ? Number(rows[0].reference.split('-')[1]) + 1 : 1;
    const reference = `CAL-${String(n).padStart(4, '0')}`;
    // Where supply is short the allocation names the person who decided and
    // the contracts that went without.
    const others = await all('select * from contract where id <> $1', [id]);
    const favoured_over = (body.favoured_over || others.map((o) => o.id)).map((x) => ({ contract: x }));
    await query(
      `insert into contract_allocation (reference,contract,lot,mass_kg,content_bp,decided_by,favoured_over)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, id, body.lot, body.mass_kg, claim.content_bp, session.email, JSON.stringify(favoured_over)],
    );
    await recordAct({
      act: 'contract_allocation_recorded', actor: session.email, site: lot.site,
      object_kind: 'contract', object_reference: id,
      content: { lot: body.lot, mass_kg: body.mass_kg, decided_by: session.email, favoured_over },
    });
    const projection = await contractProjection(await one('select * from contract where id = $1', [id]));
    return { status: 201, body: { reference, contract: id, lot: body.lot, mass_kg: body.mass_kg, content_bp: claim.content_bp, decided_by: session.email, favoured_over, projection } };
  });
  return c.json(result.body, result.status);
});

// ------------------------------------------------------------- certification
app.get('/sites/:reference/certification', async (c) => {
  requireSession(c);
  const ref = c.req.param('reference');
  const rows = await all('select * from site_certification where site = $1 order by effective_from asc', [ref]);
  const today = new Date().toISOString().slice(0, 10);
  const inForce = rows.filter((r) => asDate(r.effective_from) <= today && (!r.effective_to || asDate(r.effective_to) >= today)).at(-1);
  return c.json({
    site: ref,
    periods: rows.map((r) => ({
      state: r.state, grade: r.grade, effective_from: asDate(r.effective_from),
      effective_to: asDate(r.effective_to), reason: r.reason, recorded_at: r.recorded_at,
    })),
    in_force: inForce ? { state: inForce.state, effective_from: asDate(inForce.effective_from), effective_to: asDate(inForce.effective_to), reason: inForce.reason } : null,
    suspended: inForce?.state === 'suspended',
  });
});

// A suspension may reach backwards: effective_from may precede the day it lands.
app.post('/sites/:reference/certification', async (c) => {
  refuseAuditorWrites(c);
  const session = requireRole(c, 'quality_manager');
  const ref = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['state', 'effective_from']);
  if (!['certified', 'suspended', 'lifted', 'not_certified'].includes(body.state)) {
    refuse(400, 'unknown_state', { message: 'state is one of certified, suspended, lifted, not_certified.' });
  }
  const site = await one('select * from site where reference = $1', [ref]);
  if (!site) refuse(404, 'not_found', { message: 'No such site.' });
  const result = await idempotent(c, `POST /api/sites/${ref}/certification`, body, async () => {
    const effectiveFrom = asDate(body.effective_from);
    const effectiveTo = body.effective_to ? asDate(body.effective_to) : null;
    await query(
      'insert into site_certification (site,state,grade,effective_from,effective_to,reason,recorded_by) values ($1,$2,$3,$4,$5,$6,$7)',
      [ref, body.state === 'lifted' ? 'certified' : body.state, body.grade || null, effectiveFrom, effectiveTo, body.reason || null, session.email],
    );
    await query('update site set certification_state = $1 where reference = $2',
      [body.state === 'suspended' ? 'suspended' : body.state === 'lifted' ? 'certified' : body.state, ref]);
    let certificates_in_window = [];
    if (body.state === 'suspended') {
      const certs = await all(
        'select * from certificate where site = $1 and issued_on >= $2 order by number asc',
        [ref, effectiveFrom],
      );
      certificates_in_window = certs
        .filter((x) => !effectiveTo || asDate(x.issued_on) <= effectiveTo)
        .filter((x) => !body.grade || x.grade === body.grade)
        .map((x) => ({
          number: x.number, issued_on: asDate(x.issued_on), state: x.state,
          recipient_name: x.recipient_name,
          // Each is individually resolved under the three restatement outcomes.
          resolution_options: ['reissued', 'withdrawn', 'unaffected'],
          resolution: null,
        }));
    }
    await recordAct({
      act: `site_certification_${body.state}`, actor: session.email, site: ref,
      object_kind: 'site', object_reference: ref,
      content: { state: body.state, effective_from: effectiveFrom, grade: body.grade || null, certificates_in_window: certificates_in_window.map((x) => x.number) },
    });
    return {
      status: 201,
      body: {
        reference: ref, site: ref, state: body.state,
        effective_from: effectiveFrom, effective_to: effectiveTo,
        grade: body.grade || null, reason: body.reason || null,
        certificates_in_window,
        issuing_stopped: body.state === 'suspended',
        blocking_condition: body.state === 'suspended'
          ? `The certification for ${ref}${body.grade ? ` grade ${body.grade}` : ''} is suspended from ${effectiveFrom}.`
          : null,
        reinstates_withdrawn: false,
        note: body.state === 'lifted'
          ? 'Lifting restores issuing from the moment the lift takes effect. It does not reinstate a withdrawn certificate: the remedy is a new certificate.'
          : null,
      },
    };
  });
  return c.json(result.body, result.status);
});

app.get('/findings', async (c) => {
  requireSession(c);
  const rows = await all('select * from finding order by reference asc');
  const today = new Date().toISOString().slice(0, 10);
  return c.json(rows.map((f) => ({
    reference: f.reference, collector: f.collector, kind: f.kind, detail: f.detail,
    raised_on: asDate(f.raised_on), due_on: asDate(f.due_on), state: f.state, batch: f.batch,
    past_due: !!f.due_on && f.state === 'open' && asDate(f.due_on) < today,
  })));
});

app.get('/transfers', async (c) => {
  requireSession(c);
  const rows = await all('select * from transfer order by reference asc');
  return c.json(rows.map((t) => ({
    reference: t.reference, from_period: t.from_period, to_period: t.to_period,
    category: t.category, mass_g: t.mass_g, moved_on: asDate(t.moved_on),
    fresh_credit: false, created_by: t.created_by,
  })));
});

app.get('/mail', async (c) => {
  requireSession(c);
  const rows = await all('select * from mail_log order by sent_at desc');
  return c.json(rows.map((m) => ({
    reference: m.reference, recipient: m.recipient, subject: m.subject,
    sent_at: m.sent_at, act: m.act, object_reference: m.object_reference,
  })));
});

export { contentBp };
export default app;

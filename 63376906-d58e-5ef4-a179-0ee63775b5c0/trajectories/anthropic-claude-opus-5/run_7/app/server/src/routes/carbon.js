import { Hono } from 'hono';
import { q, one } from '../db.js';
import { append } from '../record.js';
import { withIdempotency, ok, requireRole, requireSession, refusePagination } from '../http.js';
import { requireInteger } from '../units.js';
import { carbonForLot, iso } from '../engine.js';
import { hasRole } from '../auth.js';

export const carbon = new Hono();

carbon.get('/carbon-methods', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM carbon_method ORDER BY id, version');
  return c.json(rows.map((m) => ({
    id: m.id, version: m.version, standard: m.standard, functional_unit: m.functional_unit,
    boundary: m.boundary, allocation_basis: m.allocation_basis, reviewer: m.reviewer,
    published_on: iso(m.published_on), data_quality_rules: m.data_quality_rules,
    emission_factors: m.emission_factors, primary_threshold_bp: m.primary_threshold_bp,
    superseded: m.superseded, retired: m.retired
  })));
});

carbon.get('/carbon-methods/:id/versions/:version', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const m = await one('SELECT * FROM carbon_method WHERE id = $1 AND version = $2',
    [c.req.param('id'), Number(c.req.param('version'))]);
  if (!m) return c.json({ error: 'not_found' }, 404);
  return c.json({
    id: m.id, version: m.version, standard: m.standard, functional_unit: m.functional_unit,
    boundary: m.boundary, allocation_basis: m.allocation_basis, reviewer: m.reviewer,
    published_on: iso(m.published_on), data_quality_rules: m.data_quality_rules,
    emission_factors: m.emission_factors, primary_threshold_bp: m.primary_threshold_bp,
    superseded: m.superseded, retired: m.retired,
    note: m.superseded ? 'This version is superseded and stays readable.' : null
  });
});

/** Publishing a version is refused for anybody but a quality manager. */
carbon.post('/carbon-methods', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/carbon-methods', body, async () => {
    for (const f of ['id', 'standard', 'functional_unit', 'boundary', 'allocation_basis', 'reviewer']) {
      if (!body[f]) return ok({ error: 'missing_field', field: f }, 400);
    }
    const prev = await one(
      'SELECT version FROM carbon_method WHERE id = $1 ORDER BY version DESC LIMIT 1', [body.id]
    );
    const version = (prev?.version || 0) + 1;
    // A new version supersedes rather than overwrites.
    if (prev) await q('UPDATE carbon_method SET superseded = true WHERE id = $1 AND version = $2', [body.id, prev.version]);
    await q(
      `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis,
        reviewer, published_on, published_by, data_quality_rules, emission_factors, primary_threshold_bp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8,$9,$10,$11)`,
      [body.id, version, body.standard, body.functional_unit, body.boundary, body.allocation_basis,
        body.reviewer, auth.session.email, JSON.stringify(body.data_quality_rules || []),
        JSON.stringify(body.emission_factors || []), body.primary_threshold_bp ?? 5000]
    );
    await append(null, {
      act: 'carbon_method_published', person: auth.session.email,
      object_kind: 'carbon_method', object_ref: `${body.id} v${version}`,
      content: { standard: body.standard, boundary: body.boundary, allocation_basis: body.allocation_basis }
    });
    return ok({
      reference: `${body.id} v${version}`, id: body.id, version,
      supersedes: prev ? `${body.id} v${prev.version}` : null,
      note: 'A computation already in flight completes under the version it started with.'
    }, 201);
  });
});

/** No route returns a carbon value without its boundary, method version and uncertainty. */
carbon.get('/lots/:reference/carbon', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  try {
    const figure = await carbonForLot(c.req.param('reference'), { internal: true });
    if (!figure) return c.json({ error: 'not_found' }, 404);
    return c.json(figure);
  } catch (err) {
    if (err.status) return c.json(err.body, err.status);
    throw err;
  }
});

carbon.get('/carbon-figures', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM carbon_figure ORDER BY id, version');
  return c.json(rows.map((f) => ({
    id: f.id, lot: f.lot, version: f.version,
    value_mg_per_kg: f.value_mg_per_kg, boundary: f.boundary,
    method_version: `${f.method_id} v${f.method_version}`,
    uncertainty_bp: f.uncertainty_bp, primary_share_bp: f.primary_share_bp,
    comparator: f.comparator, breakdown: f.breakdown,
    energy_location_mg_per_kg: f.energy?.energy_location_mg_per_kg,
    energy_market_mg_per_kg: f.energy?.energy_market_mg_per_kg,
    metered_kwh: f.energy?.metered_kwh, retired_kwh: f.energy?.retired_kwh,
    unmatched_kwh: f.energy?.unmatched_kwh,
    cache_valid: f.cache_valid, superseded_by: f.superseded_by,
    input_versions: f.input_versions, computed_on: iso(f.computed_on)
  })));
});

/** A figure is never silently recomputed: a recomputation is the recorded act that changes it. */
carbon.post('/carbon-figures/:id/recompute', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'claims_manager');
  if (auth.error) return auth.error;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/carbon-figures/${id}/recompute`, body, async () => {
    const f = await one('SELECT * FROM carbon_figure WHERE id = $1 ORDER BY version DESC LIMIT 1', [id]);
    if (!f) return ok({ error: 'not_found' }, 404);
    if (!body.reason) return ok({ error: 'missing_field', field: 'reason', rule: 'A recomputation records a person, a date and a reason.' }, 400);

    const lot = await one('SELECT site, grade FROM lot WHERE reference = $1', [f.lot]);
    const period = await one(
      `SELECT * FROM balance_period WHERE site = $1 AND grade = $2 ORDER BY period_from DESC LIMIT 1`,
      [lot.site, lot.grade]
    );
    if (period?.state === 'closed') {
      const open = await one(`SELECT reference FROM restatement WHERE period = $1 AND state = 'open'`, [period.id]);
      if (!open) {
        return ok({
          error: 'closed_period_without_restatement', period: period.id,
          rule: 'A recomputation against a closed period is refused unless a restatement is open.'
        }, 409);
      }
    }

    const method = await one(
      'SELECT * FROM carbon_method WHERE id = $1 ORDER BY version DESC LIMIT 1', [f.method_id]
    );
    const newVersion = f.version + 1;
    const newId = `${id}-v${newVersion}`;
    // The breakdown lines sum to the value: the value is the sum, never asserted.
    const breakdown = body.breakdown || f.breakdown;
    const value = breakdown.reduce((s, l) => s + l.mg_per_kg, 0);
    const primaryLines = breakdown.filter((l) => l.tag === 'primary' || l.tag === 'supplier_specific');
    const totalAbs = breakdown.reduce((s, l) => s + Math.abs(l.mg_per_kg), 0);
    const primaryAbs = primaryLines.reduce((s, l) => s + Math.abs(l.mg_per_kg), 0);
    const primary_share_bp = totalAbs ? Math.floor(primaryAbs * 10000 / totalAbs) : 0;

    await q(
      `INSERT INTO carbon_figure (id, lot, version, method_id, method_version, value_mg_per_kg, uncertainty_bp,
        primary_share_bp, boundary, comparator, breakdown, energy, input_versions, reason, computed_by, computed_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_DATE)`,
      [newId, f.lot, newVersion, method.id, method.version, value, f.uncertainty_bp,
        primary_share_bp, method.boundary, JSON.stringify(f.comparator), JSON.stringify(breakdown),
        JSON.stringify(f.energy),
        JSON.stringify({ ...f.input_versions, carbon_method: `${method.id} v${method.version}` }),
        body.reason, auth.session.email]
    );
    // A new figure version alongside the old, never in place of it.
    await q('UPDATE carbon_figure SET superseded_by = $2 WHERE id = $1', [f.id, newId]);

    // Enumerates every certificate carrying the superseded figure.
    const certificates = await q(
      `SELECT number, version, state, recipient_name FROM certificate WHERE (carbon->>'figure_id') = $1`, [f.id]
    );
    await append(null, {
      act: 'carbon_figure_recomputed', person: auth.session.email,
      object_kind: 'carbon_figure', object_ref: newId,
      content: { supersedes: f.id, reason: body.reason, value_mg_per_kg: value, certificates: certificates.map((x) => x.number) }
    });
    return ok({
      reference: newId, id: newId, lot: f.lot, version: newVersion,
      supersedes: f.id,
      value_mg_per_kg: value, boundary: method.boundary,
      method_version: `${method.id} v${method.version}`,
      uncertainty_bp: f.uncertainty_bp, primary_share_bp,
      breakdown,
      reason: body.reason, recomputed_by: auth.session.email,
      recomputed_on: new Date().toISOString().slice(0, 10),
      certificates_carrying_superseded_figure: certificates,
      complete: true
    }, 201);
  });
});

carbon.get('/energy-instruments', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM energy_instrument ORDER BY reference');
  return c.json(rows.map((i) => ({
    reference: i.reference, quantity_kwh: i.quantity_kwh, vintage: i.vintage,
    region: i.region, state: i.state, applied_period: i.applied_period, applied_at: i.applied_at
  })));
});

/** Refused when not retired, when vintage or region do not match, or when it would exceed metered. */
carbon.post('/energy-instruments/:reference/retire', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'claims_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/energy-instruments/${reference}/retire`, body, async () => {
    const i = await one('SELECT * FROM energy_instrument WHERE reference = $1', [reference]);
    if (!i) return ok({ error: 'not_found' }, 404);
    if (!body.period) return ok({ error: 'missing_field', field: 'period' }, 400);
    const period = await one('SELECT * FROM balance_period WHERE id = $1', [body.period]);
    if (!period) return ok({ error: 'unknown_period', period: body.period }, 404);

    const refusals = [];
    if (i.state !== 'retired') refusals.push({ condition: 'instrument_not_retired', state: i.state });

    const figure = await one(
      `SELECT f.* FROM carbon_figure f JOIN lot l ON l.reference = f.lot
        WHERE l.site = $1 AND l.grade = $2 AND f.superseded_by IS NULL ORDER BY f.computed_on DESC LIMIT 1`,
      [period.site, period.grade]
    );
    const metered = figure?.energy?.metered_kwh || 0;
    const consumptionYear = Number(String(period.period_from instanceof Date ? period.period_from.toISOString() : period.period_from).slice(0, 4));
    if (i.vintage !== consumptionYear) {
      refusals.push({ condition: 'vintage_mismatch', vintage: i.vintage, consumption_year: consumptionYear });
    }
    const region = figure?.comparator?.region || 'EU-27';
    if (i.region !== region) refusals.push({ condition: 'region_mismatch', instrument_region: i.region, consumption_region: region });

    const already = await q(
      `SELECT quantity_kwh FROM energy_instrument WHERE applied_period = $1 AND reference <> $2 AND state = 'retired'`,
      [body.period, reference]
    );
    const appliedAlready = already.reduce((s, x) => s + x.quantity_kwh, 0);
    if (appliedAlready + i.quantity_kwh > metered) {
      refusals.push({ condition: 'exceeds_metered_consumption', retired_kwh: appliedAlready + i.quantity_kwh, metered_kwh: metered });
    }
    if (refusals.length) {
      await append(null, {
        act: 'energy_instrument_retirement_refused', person: auth.session.email,
        object_kind: 'energy_instrument', object_ref: reference, outcome: 'refused',
        content: { period: body.period, refusals }
      });
      return ok({ error: 'retirement_refused', instrument: reference, refusals }, 409);
    }
    await q(
      `UPDATE energy_instrument SET applied_period = $2, applied_at = now() WHERE reference = $1`,
      [reference, body.period]
    );
    const retired = appliedAlready + i.quantity_kwh;
    await append(null, {
      act: 'energy_instrument_retired', person: auth.session.email,
      object_kind: 'energy_instrument', object_ref: reference,
      content: { period: body.period, quantity_kwh: i.quantity_kwh }
    });
    return ok({
      reference, period: body.period, quantity_kwh: i.quantity_kwh,
      metered_kwh: metered, retired_kwh: retired, unmatched_kwh: metered - retired
    }, 201);
  });
});

/* --------------------------------------------- specifications and change */

carbon.get('/specifications', async (c) => {
  const rows = await q('SELECT * FROM specification ORDER BY grade, version');
  return c.json(rows.map((s) => ({
    grade: s.grade, version: s.version, issued_on: iso(s.issued_on),
    properties: s.properties, virgin_reference: s.virgin_reference, superseded: s.superseded
  })));
});

carbon.get('/specifications/:grade/versions/:version', async (c) => {
  const s = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2',
    [c.req.param('grade'), Number(c.req.param('version'))]);
  if (!s) return c.json({ error: 'not_found' }, 404);
  const issues = await q(
    'SELECT customer, issued_on, issued_by FROM specification_issue WHERE grade = $1 AND version = $2',
    [s.grade, s.version]
  );
  return c.json({
    grade: s.grade, version: s.version, issued_on: iso(s.issued_on),
    properties: s.properties,
    virgin_reference: s.virgin_reference,
    superseded: s.superseded,
    issued_to: issues.map((i) => ({ customer: i.customer, issued_on: iso(i.issued_on), issued_by: i.issued_by })),
    note: 'A guaranteed limit is tested on every lot.'
  });
});

carbon.post('/specifications/:grade/versions/:version/issue', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const grade = c.req.param('grade');
  const version = Number(c.req.param('version'));
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/specifications/${grade}/versions/${version}/issue`, body, async () => {
    const s = await one('SELECT * FROM specification WHERE grade = $1 AND version = $2', [grade, version]);
    if (!s) return ok({ error: 'not_found' }, 404);
    if (!body.customer) return ok({ error: 'missing_field', field: 'customer' }, 400);
    const row = await one(
      `INSERT INTO specification_issue (grade, version, customer, issued_on, issued_by)
       VALUES ($1,$2,$3,CURRENT_DATE,$4) RETURNING id`,
      [grade, version, body.customer, auth.session.email]
    );
    await q(
      `UPDATE customer SET holds_specification_grade = $2, holds_specification_version = $3 WHERE reference = $1`,
      [body.customer, grade, version]
    );
    await append(null, {
      act: 'specification_issued', person: auth.session.email,
      object_kind: 'specification', object_ref: `${grade} v${version}`,
      content: { customer: body.customer }
    });
    return ok({ reference: `SPI-${row.id}`, grade, version, customer: body.customer, issued_by: auth.session.email }, 201);
  });
});

carbon.get('/customers/:reference', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const cu = await one('SELECT * FROM customer WHERE reference = $1', [c.req.param('reference')]);
  if (!cu) return c.json({ error: 'not_found' }, 404);
  const conf = await q('SELECT * FROM conformance WHERE customer = $1 ORDER BY id', [cu.reference]);
  const { partyNameOn } = await import('../engine.js');
  return c.json({
    reference: cu.reference,
    name: await partyNameOn(cu.reference, new Date().toISOString().slice(0, 10)),
    contact: cu.contact,
    holds_specification_version: `${cu.holds_specification_grade} v${cu.holds_specification_version}`,
    application: cu.application,
    industry: cu.industry,
    language: cu.language,
    conformance: conf.map((k) => ({
      application: k.application, specification_version: k.specification_version,
      trials: k.trials, started_on: iso(k.started_on), completed_on: iso(k.completed_on), outcome: k.outcome
    }))
  });
});

carbon.get('/change-notices', async (c) => {
  const auth = await requireSession(c); if (auth.error) return auth.error;
  const rows = await q('SELECT * FROM change_notice ORDER BY raised_at ASC');
  const out = [];
  for (const n of rows) {
    const acts = await q('SELECT customer, act, at FROM change_notice_act WHERE notice = $1', [n.reference]);
    out.push({
      reference: n.reference, description: n.description, parameter: n.parameter,
      qualification_relevant: n.qualification_relevant,
      specifications_affected: n.specifications_affected,
      customers_affected: n.customers_affected,
      qualifications_affected: n.qualifications_affected,
      notice_period_days: n.notice_period_days, state: n.state,
      acts, raised_by: n.raised_by, raised_at: n.raised_at, released_at: n.released_at
    });
  }
  return c.json(out);
});

/** Derives, rather than asserts, what a change affects. */
carbon.post('/change-notices', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'plant_operator');
  if (auth.error) return auth.error;
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, 'POST /api/change-notices', body, async () => {
    if (!body.description || !body.parameter) {
      return ok({ error: 'missing_field', required: ['description', 'parameter'] }, 400);
    }
    const specs = await q('SELECT grade, version FROM specification WHERE superseded = false');
    const customers = await q('SELECT * FROM customer');
    const conformances = await q('SELECT * FROM conformance');
    const QUAL_PARAMETERS = ['temperature', 'pressure', 'relative_viscosity', 'moisture', 'recipe'];
    const qualification_relevant = QUAL_PARAMETERS.some((p) => String(body.parameter).toLowerCase().includes(p));

    const specifications_affected = specs.map((s) => `${s.grade} v${s.version}`);
    const customers_affected = customers.map((cu) => cu.reference);
    const qualifications_affected = qualification_relevant
      ? conformances.map((k) => ({ customer: k.customer, application: k.application, specification_version: k.specification_version }))
      : [];
    // A change touching a qualification-relevant parameter for an automotive customer blocks.
    const blocking = qualification_relevant && customers.some((cu) => cu.industry === 'automotive');
    const notice_period_days = blocking ? 90 : qualification_relevant ? 60 : 30;

    const n = await one(`SELECT count(*)::int AS n FROM change_notice`);
    const reference = `CHG-${String(n.n + 1).padStart(4, '0')}`;
    await q(
      `INSERT INTO change_notice (reference, description, parameter, qualification_relevant,
        specifications_affected, customers_affected, qualifications_affected, notice_period_days, raised_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [reference, body.description, body.parameter, qualification_relevant,
        JSON.stringify(specifications_affected), JSON.stringify(customers_affected),
        JSON.stringify(qualifications_affected), notice_period_days, auth.session.email]
    );
    await append(null, {
      act: 'change_notice_raised', person: auth.session.email,
      object_kind: 'change_notice', object_ref: reference,
      content: { parameter: body.parameter, qualification_relevant, customers_affected }
    });
    return ok({
      reference, description: body.description, parameter: body.parameter,
      qualification_relevant,
      specifications_affected, customers_affected, qualifications_affected,
      notice_period_days, state: 'raised',
      blocking,
      blocking_reason: blocking
        ? `This change may invalidate ${qualifications_affected.length} customer qualifications.`
        : null
    }, 201);
  });
});

carbon.post('/change-notices/:reference/notify', async (c) => {
  const auth = await requireRole(c, 'quality_manager', 'plant_operator');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/change-notices/${reference}/notify`, body, async () => {
    const n = await one('SELECT * FROM change_notice WHERE reference = $1', [reference]);
    if (!n) return ok({ error: 'not_found' }, 404);
    if (!body.customer) return ok({ error: 'missing_field', field: 'customer', rule: 'Notifies one named customer.' }, 400);
    const cu = await one('SELECT * FROM customer WHERE reference = $1', [body.customer]);
    if (!cu) return ok({ error: 'unknown_customer', customer: body.customer }, 404);
    const { changeNoticeAcknowledgement } = await import('../mail.js');
    let mail = null;
    try { mail = await changeNoticeAcknowledgement(n, cu.contact); }
    catch (err) { mail = { error: String(err.message) }; }
    await q(
      `INSERT INTO change_notice_act (notice, customer, act, by_person) VALUES ($1,$2,'notified',$3)`,
      [reference, body.customer, auth.session.email]
    );
    await append(null, {
      act: 'change_notice_notified', person: auth.session.email,
      object_kind: 'change_notice', object_ref: reference,
      content: { customer: body.customer, mail }
    });
    return ok({ reference, customer: body.customer, act: 'notified', mail }, 201);
  });
});

carbon.post('/change-notices/:reference/waive', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/change-notices/${reference}/waive`, body, async () => {
    if (!body.customer) return ok({ error: 'missing_field', field: 'customer' }, 400);
    await q(
      `INSERT INTO change_notice_act (notice, customer, act, by_person) VALUES ($1,$2,'waived',$3)`,
      [reference, body.customer, auth.session.email]
    );
    await append(null, {
      act: 'change_notice_waived', person: auth.session.email,
      object_kind: 'change_notice', object_ref: reference, content: { customer: body.customer }
    });
    return ok({ reference, customer: body.customer, act: 'waived' }, 201);
  });
});

carbon.post('/change-notices/:reference/release', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/change-notices/${reference}/release`, body, async () => {
    const n = await one('SELECT * FROM change_notice WHERE reference = $1', [reference]);
    if (!n) return ok({ error: 'not_found' }, 404);
    const acts = await q('SELECT customer, act FROM change_notice_act WHERE notice = $1', [reference]);
    const owed = (n.customers_affected || []).filter(
      (cu) => !acts.find((a) => a.customer === cu && ['notified', 'waived'].includes(a.act))
    );
    if (owed.length) {
      await append(null, {
        act: 'change_notice_release_refused', person: auth.session.email,
        object_kind: 'change_notice', object_ref: reference, outcome: 'refused',
        content: { customers_owed_notice: owed }
      });
      return ok({
        error: 'notice_outstanding', customers_owed_notice: owed,
        rule: 'A release is refused until every customer owed notice has been notified or has waived it in a recorded act.'
      }, 409);
    }
    // A change touching a qualification-relevant parameter for an automotive customer blocks
    // rather than warns, until they acknowledge it.
    const automotive = await q(`SELECT reference FROM customer WHERE industry = 'automotive'`);
    if (n.qualification_relevant) {
      const unacknowledged = automotive
        .map((a) => a.reference)
        .filter((ref) => (n.customers_affected || []).includes(ref))
        .filter((ref) => !acts.find((a) => a.customer === ref && ['acknowledged', 'waived'].includes(a.act)));
      if (unacknowledged.length) {
        await append(null, {
          act: 'change_notice_release_refused', person: auth.session.email,
          object_kind: 'change_notice', object_ref: reference, outcome: 'refused',
          content: { blocked_by: unacknowledged, reason: 'automotive_qualification' }
        });
        return ok({
          error: 'automotive_qualification_blocks', customers: unacknowledged,
          rule: 'A change touching a qualification-relevant parameter for a customer in the automotive industry blocks rather than warns.'
        }, 409);
      }
    }
    await q(`UPDATE change_notice SET state = 'released', released_at = now() WHERE reference = $1`, [reference]);
    await append(null, {
      act: 'change_notice_released', person: auth.session.email,
      object_kind: 'change_notice', object_ref: reference, content: {}
    });
    return ok({ reference, state: 'released' }, 201);
  });
});

carbon.post('/change-notices/:reference/acknowledge', async (c) => {
  const auth = await requireRole(c, 'quality_manager');
  if (auth.error) return auth.error;
  const reference = c.req.param('reference');
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, `POST /api/change-notices/${reference}/acknowledge`, body, async () => {
    if (!body.customer) return ok({ error: 'missing_field', field: 'customer' }, 400);
    await q(
      `INSERT INTO change_notice_act (notice, customer, act, by_person) VALUES ($1,$2,'acknowledged',$3)`,
      [reference, body.customer, auth.session.email]
    );
    await append(null, {
      act: 'change_notice_acknowledged', person: auth.session.email,
      object_kind: 'change_notice', object_ref: reference, content: { customer: body.customer }
    });
    return ok({ reference, customer: body.customer, act: 'acknowledged' }, 201);
  });
});

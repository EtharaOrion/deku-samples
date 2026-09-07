import { Hono } from 'hono';
import { q, pool } from '../lib/db.js';
import { requireSession, requireAct, withIdempotency, refuse, refusePagination, requireFields, today } from '../lib/http.js';
import { appendEntry } from '../lib/records.js';
import { iso, approvalInForce, partyNameOn } from '../engine/feedstock.js';
import { certificationInForce } from '../engine/certificate.js';

const r = new Hono();

function siteView(s) {
  return {
    reference: s.reference,
    name: s.name,
    confidence: s.confidence,
    certification_state: s.certification_state,
    nameplate_kg: Number(s.nameplate_kg),
    contracted_kg: Number(s.contracted_kg),
    // uncommitted_kg is computed and is allowed to be negative
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    basis: s.capacity_basis,
    last_revised: iso(s.last_revised),
  };
}

r.get('/sites', async (c) => {
  const rows = await q('SELECT * FROM site ORDER BY reference ASC');
  return c.json(rows.map(siteView));
});

r.get('/sites/:reference', async (c) => {
  const s = (await q('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!s) refuse(404, 'not_found', { error: 'not_found', message: 'No such site.' });
  const certs = await q('SELECT * FROM site_certification WHERE site = $1 ORDER BY effective_from ASC', [s.reference]);
  return c.json({
    ...siteView(s),
    certification_periods: certs.map((x) => ({
      state: x.state, grade: x.grade, effective_from: iso(x.effective_from),
      effective_to: iso(x.effective_to), reason: x.reason,
    })),
  });
});

// A capacity figure is never returned without its confidence.
r.get('/sites/:reference/capacity', async (c) => {
  const s = (await q('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!s) refuse(404, 'not_found', { error: 'not_found', message: 'No such site.' });
  return c.json({
    site: s.reference,
    nameplate_kg: Number(s.nameplate_kg),
    basis: s.capacity_basis,
    contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    confidence: s.confidence,
    last_revised: iso(s.last_revised),
    derivation: `uncommitted_kg = nameplate_kg ${s.nameplate_kg} minus contracted_kg ${s.contracted_kg}`,
  });
});

// A suspension may carry an effective_from that precedes the date it was recorded.
r.post('/sites/:reference/certification', async (c) => {
  const actor = await requireAct(c, 'site.certification');
  const body = await c.req.json().catch(() => ({}));
  const site = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['state', 'effective_from']);
    const s = (await q('SELECT * FROM site WHERE reference = $1', [site]))[0];
    if (!s) refuse(404, 'not_found', { error: 'not_found', message: 'No such site.' });
    const ins = await pool.query(
      `INSERT INTO site_certification (site, state, grade, effective_from, effective_to, reason, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [site, body.state, body.grade || null, body.effective_from, body.effective_to || null, body.reason || null, actor.email]);
    const reference = `SCR-${String(ins.rows[0].id).padStart(4, '0')}`;

    // every certificate signed inside the window, each individually resolved
    const certs = await q(
      `SELECT * FROM certificate WHERE site = $1 AND signed_at >= $2 ${body.effective_to ? 'AND signed_at <= $3' : ''}`,
      body.effective_to ? [site, body.effective_from, body.effective_to] : [site, body.effective_from]);
    const inWindow = certs
      .filter((x) => !body.grade || (x.payload?.grade === body.grade))
      .map((x) => ({
        number: x.number, signed_at: x.signed_at, state: x.state,
        recipient: x.recipient, recipient_name: x.payload?.recipient_name,
        grade: x.payload?.grade,
        resolution_options: ['reissued', 'withdrawn', 'unaffected'],
        resolution: null,
      }));

    await appendEntry(null, {
      person: actor.email, site, object_kind: 'site_certification', object_ref: reference,
      action: `certification_${body.state}`,
      content: { state: body.state, effective_from: body.effective_from, effective_to: body.effective_to || null, grade: body.grade || null, reason: body.reason || null, certificates_in_window: inWindow.map((x) => x.number) },
    });

    return {
      status: 201,
      body: {
        reference,
        site,
        state: body.state,
        grade: body.grade || null,
        effective_from: body.effective_from,
        effective_to: body.effective_to || null,
        reason: body.reason || null,
        recorded_on: today(),
        certificates_in_window: inWindow,
        issuing_blocked: body.state === 'suspended',
        blocking_condition: body.state === 'suspended'
          ? `Certification for ${site}${body.grade ? ` grade ${body.grade}` : ''} is suspended from ${body.effective_from}.`
          : null,
        note: body.state === 'certified'
          ? 'Lifting a suspension restores issuing from the moment the lift takes effect. It does not reinstate a withdrawn certificate: a withdrawal is a fact about a document, and the remedy is a new certificate.'
          : null,
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- collectors ----------------------------------------------------------
async function collectorView(row, approvals, findings, versions) {
  const periods = approvals.filter((a) => a.collector === row.reference);
  const inForce = approvalInForce(periods, today());
  const fourteen = new Date();
  fourteen.setDate(fourteen.getDate() + 14);
  const expiring = inForce ? iso(inForce.valid_to) <= fourteen.toISOString().slice(0, 10) : false;
  return {
    reference: row.reference,
    name: partyNameOn(versions.filter((v) => v.party === row.reference), today()),
    country: row.country,
    registration: row.registration,
    registration_expiry: iso(row.registration_expiry),
    collection_site_types: row.collection_site_types,
    declared_streams: row.declared_streams,
    scheme_status: row.scheme_status,
    findings: findings.filter((f) => f.collector === row.reference).map((f) => ({
      reference: f.reference, kind: f.kind, detail: f.detail,
      raised_on: iso(f.raised_on), due_on: iso(f.due_on), state: f.state, batch: f.batch,
    })),
    approval_periods: periods.map((p) => ({
      state: p.state,
      valid_from: iso(p.valid_from),
      valid_to: iso(p.valid_to),
      ...(p.state === 'conditional'
        ? { condition: p.condition, condition_closes_on: iso(p.condition_closes_on) }
        : {}),
    })),
    approval_in_force: inForce ? { state: inForce.state, valid_from: iso(inForce.valid_from), valid_to: iso(inForce.valid_to) } : null,
    expiring: expiring,
    expiry_note: expiring && inForce
      ? `This grant expires on ${iso(inForce.valid_to)}, inside fourteen days. Nothing renews silently.`
      : null,
  };
}

r.get('/collectors', async (c) => {
  await requireSession(c);
  const [rows, approvals, findings, versions] = await Promise.all([
    q('SELECT * FROM collector ORDER BY reference ASC'),
    q('SELECT * FROM approval_period ORDER BY valid_from ASC'),
    q('SELECT * FROM finding ORDER BY raised_on ASC'),
    q('SELECT * FROM party_version ORDER BY effective_from ASC'),
  ]);
  return c.json(await Promise.all(rows.map((x) => collectorView(x, approvals, findings, versions))));
});

r.get('/collectors/:reference', async (c) => {
  await requireSession(c);
  const row = (await q('SELECT * FROM collector WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such collector.' });
  const [approvals, findings, versions] = await Promise.all([
    q('SELECT * FROM approval_period WHERE collector = $1 ORDER BY valid_from ASC', [row.reference]),
    q('SELECT * FROM finding WHERE collector = $1', [row.reference]),
    q('SELECT * FROM party_version WHERE party = $1 ORDER BY effective_from ASC', [row.reference]),
  ]);
  return c.json(await collectorView(row, approvals, findings, versions));
});

r.post('/collectors/:reference/approvals', async (c) => {
  const actor = await requireAct(c, 'collector.approve');
  const body = await c.req.json().catch(() => ({}));
  const reference = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['state', 'valid_from', 'valid_to']);
    if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(body.state)) {
      refuse(400, 'unknown_state', { error: 'unknown_state', message: 'An approval state is one of approved, conditional, suspended, lapsed.' });
    }
    if (body.state === 'conditional' && (!body.condition || !body.condition_closes_on)) {
      refuse(400, 'condition_required', { error: 'condition_required', message: 'A conditional approval names its condition and the date it must be closed by.' });
    }
    const col = (await q('SELECT * FROM collector WHERE reference = $1', [reference]))[0];
    if (!col) refuse(404, 'not_found', { error: 'not_found', message: 'No such collector.' });
    const ins = await pool.query(
      `INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [reference, body.state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null, actor.email]);
    const ref = `APR-${String(ins.rows[0].id).padStart(4, '0')}`;
    await appendEntry(null, {
      person: actor.email, object_kind: 'collector', object_ref: reference,
      action: `approval_${body.state}`,
      content: { period: ref, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to, condition: body.condition || null },
    });
    return {
      status: 201,
      body: {
        reference: ref, collector: reference, state: body.state,
        valid_from: body.valid_from, valid_to: body.valid_to,
        condition: body.condition || null, condition_closes_on: body.condition_closes_on || null,
        note: 'A batch resolves its claimability against the period in force on its receipt date, never a current flag.',
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- parties -------------------------------------------------------------
r.get('/parties/:reference/versions', async (c) => {
  await requireSession(c);
  refusePagination(c);
  const rows = await q('SELECT * FROM party_version WHERE party = $1 ORDER BY effective_from ASC', [c.req.param('reference')]);
  if (!rows.length) refuse(404, 'not_found', { error: 'not_found', message: 'No such party.' });
  return c.json(rows.map((v) => ({
    party: v.party, name: v.name, identifier: v.identifier,
    effective_from: iso(v.effective_from), superseded: v.superseded_by !== null,
    recorded_at: v.recorded_at,
  })));
});

r.post('/parties/:reference/versions', async (c) => {
  const actor = await requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const party = c.req.param('reference');
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['name', 'effective_from']);
    const exists = (await q('SELECT * FROM party WHERE reference = $1', [party]))[0];
    if (!exists) refuse(404, 'not_found', { error: 'not_found', message: 'No such party.' });
    const prior = (await q(
      'SELECT * FROM party_version WHERE party = $1 AND superseded_by IS NULL ORDER BY effective_from DESC LIMIT 1', [party]))[0];
    const ins = await pool.query(
      'INSERT INTO party_version (party, name, identifier, effective_from) VALUES ($1,$2,$3,$4) RETURNING id',
      [party, body.name, body.identifier || prior?.identifier || null, body.effective_from]);
    const id = ins.rows[0].id;
    // supersedes the previous version rather than rewriting it
    if (prior) await pool.query('UPDATE party_version SET superseded_by = $1 WHERE id = $2', [id, prior.id]);
    const reference = `PVR-${String(id).padStart(4, '0')}`;
    await appendEntry(null, {
      person: actor.email, object_kind: 'party_version', object_ref: party, action: 'renamed',
      content: { name: body.name, effective_from: body.effective_from, supersedes: prior?.name || null },
    });
    return {
      status: 201,
      body: {
        reference, party, name: body.name, effective_from: body.effective_from,
        supersedes: prior ? { name: prior.name, effective_from: iso(prior.effective_from) } : null,
        note: 'Every record names the party as it stood on the date of the act, with the identifier it held then.',
      },
    };
  });
  return c.json(out.body, out.status);
});

// ---- specifications ------------------------------------------------------
r.get('/specifications/:grade/versions/:version', async (c) => {
  await requireSession(c);
  const row = (await q('SELECT * FROM specification WHERE grade = $1 AND version = $2',
    [c.req.param('grade'), Number(c.req.param('version'))]))[0];
  if (!row) refuse(404, 'not_found', { error: 'not_found', message: 'No such specification version.' });
  const issues = await q('SELECT * FROM specification_issue WHERE grade = $1 AND version = $2', [row.grade, row.version]);
  return c.json({
    grade: row.grade,
    version: row.version,
    issued_on: iso(row.issued_on),
    superseded: row.superseded,
    properties: row.properties,
    virgin_reference: row.virgin_reference,
    issued_to: issues.map((i) => ({ customer: i.customer, issued_on: iso(i.issued_on), issued_by: i.issued_by })),
  });
});

r.get('/specifications', async (c) => {
  await requireSession(c);
  const rows = await q('SELECT * FROM specification ORDER BY grade ASC, version ASC');
  return c.json(rows.map((row) => ({
    grade: row.grade, version: row.version, issued_on: iso(row.issued_on),
    superseded: row.superseded, properties: row.properties, virgin_reference: row.virgin_reference,
  })));
});

r.post('/specifications/:grade/versions/:version/issue', async (c) => {
  const actor = await requireAct(c, 'spec.issue');
  const body = await c.req.json().catch(() => ({}));
  const grade = c.req.param('grade');
  const version = Number(c.req.param('version'));
  const out = await withIdempotency(c, body, async () => {
    requireFields(body, ['customer']);
    const spec = (await q('SELECT * FROM specification WHERE grade = $1 AND version = $2', [grade, version]))[0];
    if (!spec) refuse(404, 'not_found', { error: 'not_found', message: 'No such specification version.' });
    const cust = (await q('SELECT * FROM customer WHERE reference = $1', [body.customer]))[0];
    if (!cust) refuse(404, 'not_found', { error: 'not_found', message: 'No such customer.' });
    const ins = await pool.query(
      'INSERT INTO specification_issue (grade, version, customer, issued_on, issued_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [grade, version, body.customer, today(), actor.email]);
    await pool.query('UPDATE customer SET holds_specification_version = $1, holds_grade = $2 WHERE reference = $3',
      [version, grade, body.customer]);
    const reference = `SPI-${String(ins.rows[0].id).padStart(4, '0')}`;
    await appendEntry(null, {
      person: actor.email, object_kind: 'specification', object_ref: `SPEC-${grade} v${version}`,
      action: 'issued', content: { customer: body.customer, grade, version },
    });
    return { status: 201, body: { reference, grade, version, customer: body.customer, issued_on: today(), issued_by: actor.email } };
  });
  return c.json(out.body, out.status);
});

// ---- customers -----------------------------------------------------------
r.get('/customers', async (c) => {
  await requireSession(c);
  const rows = await q('SELECT * FROM customer ORDER BY reference ASC');
  const versions = await q('SELECT * FROM party_version ORDER BY effective_from ASC');
  return c.json(rows.map((x) => ({
    reference: x.reference,
    name: partyNameOn(versions.filter((v) => v.party === x.reference), today()),
    contact: x.contact,
    holds_specification_version: `SPEC-${x.holds_grade} v${x.holds_specification_version}`,
    application: x.application,
    industry: x.industry,
    language: x.language,
  })));
});

r.get('/customers/:reference', async (c) => {
  await requireSession(c);
  const x = (await q('SELECT * FROM customer WHERE reference = $1', [c.req.param('reference')]))[0];
  if (!x) refuse(404, 'not_found', { error: 'not_found', message: 'No such customer.' });
  const conf = await q('SELECT * FROM conformance WHERE customer = $1', [x.reference]);
  const versions = await q('SELECT * FROM party_version WHERE party = $1 ORDER BY effective_from ASC', [x.reference]);
  return c.json({
    reference: x.reference,
    name: partyNameOn(versions, today()),
    contact: x.contact,
    holds_specification_version: `SPEC-${x.holds_grade} v${x.holds_specification_version}`,
    application: x.application,
    industry: x.industry,
    language: x.language,
    conformance: conf.map((cf) => ({
      application: cf.application, grade: cf.grade,
      specification_version: `SPEC-${cf.grade} v${cf.spec_version}`,
      trials: cf.trials, outcome: cf.outcome, opened_on: iso(cf.opened_on),
    })),
  });
});

r.get('/recipe-versions', async (c) => {
  await requireSession(c);
  const rows = await q('SELECT * FROM recipe_version ORDER BY reference ASC');
  return c.json(rows.map((x) => ({
    reference: x.reference, recipe: x.recipe, version: x.version, run_type: x.run_type,
    set_points: x.set_points, tolerances: x.tolerances, reagents: x.reagents,
    residence_min: x.residence_min, released_by: x.released_by, released_on: iso(x.released_on),
    superseded: x.superseded,
  })));
});

export { certificationInForce };
export default r;

// Reference data: sites, capacity, collectors, approvals, parties, devices, runs, lots, batches.
import { Hono } from 'hono';
import { db } from '../dbindex.ts';
import { requireSession, requireRole, requireWriteSession, requireSite, deny, readJson, requireFields, rememberIdempotent, noPaginationShared } from '../middleware.js';
import { resolveBatch, approvalInForce, collectorNamesAsAt } from '../engine/feedstock.js';
import { upstreamGraph, batchImpact } from '../engine/genealogy.js';
import { record } from '../engine/record.js';
import { dryMass } from '../engine/feedstock.js';

export const referenceRoutes = new Hono();

referenceRoutes.get('/sites', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM sites ORDER BY reference')).rows;
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const s of rows) {
    const suspension = (await db.query(
      `SELECT * FROM site_events WHERE site=$1 AND kind='certification_suspended' AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2) ORDER BY effective_from DESC LIMIT 1`,
      [s.reference, today]
    )).rows[0];
    out.push({
      reference: s.reference,
      name: s.name,
      confidence: s.confidence,
      certification_state: suspension ? 'suspended' : s.certification_state,
      suspension: suspension ? { from: suspension.effective_from, to: suspension.effective_to, reason: (suspension.detail as any)?.reason || null } : null
    });
  }
  return c.json(out);
});

referenceRoutes.get('/sites/:reference/capacity', async (c) => {
  await requireSession(c);
  const s = (await db.query('SELECT * FROM sites WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!s) deny('site_not_found', 'No such site.', 404);
  return c.json({
    reference: s.reference,
    name: s.name,
    nameplate_kg: Number(s.nameplate_kg),
    basis: s.capacity_basis,
    contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    confidence: s.confidence,
    last_revised: s.last_revised
  });
});

referenceRoutes.post('/sites/:reference/certification', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['state', 'effective_from']);
  const ref = c.req.param('reference');
  const site = (await db.query('SELECT * FROM sites WHERE reference=$1', [ref])).rows[0];
  if (!site) deny('site_not_found', 'No such site.', 404);

  const effectiveTo = body.effective_to || (body.lift ? body.effective_from : null);
  await db.query(
    `INSERT INTO site_events (site,effective_from,effective_to,kind,detail) VALUES ($1,$2,$3,$4,$5)`,
    [ref, body.effective_from, effectiveTo, body.state === 'suspended' ? 'certification_suspended' : 'certification_lifted', JSON.stringify({ reason: body.reason || null, recorded_by: s.email })]
  );
  if (body.state === 'suspended') {
    await db.query("UPDATE sites SET certification_state='suspended' WHERE reference=$1", [ref]);
  } else {
    await db.query("UPDATE sites SET certification_state='certified' WHERE reference=$1", [ref]);
  }

  // issuing condition resolves against the period in force on the date of signing
  const certs = (await db.query('SELECT * FROM certificates WHERE site=$1 ORDER BY number', [ref])).rows.filter((x: any) => {
    const d = String(x.signed_at).slice(0, 10);
    return d >= body.effective_from && (!effectiveTo || d <= effectiveTo);
  });
  const resolutions = certs.map((x: any) => ({
    certificate: x.number,
    state: x.state,
    suggested_outcome: x.state === 'withdrawn' ? 'unaffected' : 'reissued'
  }));

  await record(db, {
    person: s.email, site: ref, act: 'site_certification_recorded', object_kind: 'site', object_reference: ref,
    detail: { state: body.state, effective_from: body.effective_from, effective_to: effectiveTo }
  });

  return c.json({
    site: ref,
    state: body.state,
    effective_from: body.effective_from,
    effective_to: effectiveTo,
    certificates_in_window: resolutions
  }, 201);
});

// ---- collectors --------------------------------------------------------

referenceRoutes.get('/collectors', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM collectors ORDER BY reference')).rows;
  const out = [];
  for (const col of rows) {
    const periods = (await db.query('SELECT * FROM approval_periods WHERE collector=$1 ORDER BY valid_from', [col.reference])).rows;
    const findings = (await db.query('SELECT * FROM findings WHERE collector=$1 ORDER BY opened_on DESC', [col.reference])).rows;
    const today = new Date().toISOString().slice(0, 10);
    const expiring = periods.find((p: any) => p.state !== 'lapsed' && (Date.parse(p.valid_to) - Date.parse(today)) / 86400000 <= 14 && p.valid_to >= today);
    out.push({
      reference: col.reference,
      name: (await db.query('SELECT name FROM party_versions WHERE party=$1 ORDER BY effective_from DESC LIMIT 1', [col.reference])).rows[0].name,
      country: col.country,
      registration: col.registration,
      registration_expiry: col.registration_expiry,
      collection_site_types: col.collection_site_types,
      declared_streams: col.declared_streams,
      scheme_status: col.scheme_status,
      findings: findings.map((f: any) => ({ reference: f.reference, description: f.description, departure_bp: f.departure_bp, state: f.state, opened_on: f.opened_on })),
      approval_periods: periods.map((p: any) => ({
        state: p.state, valid_from: p.valid_from, valid_to: p.valid_to,
        condition: p.condition || null, condition_closes_on: p.condition_closes_on || null,
        expiring: !!expiring && expiring.id === p.id
      }))
    });
  }
  return c.json(out);
});

referenceRoutes.get('/collectors/:reference', async (c) => {
  await requireSession(c);
  const col = (await db.query('SELECT * FROM collectors WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!col) deny('collector_not_found', 'No such collector.', 404);
  const periods = (await db.query('SELECT * FROM approval_periods WHERE collector=$1 ORDER BY valid_from', [col.reference])).rows;
  const findings = (await db.query('SELECT * FROM findings WHERE collector=$1 ORDER BY opened_on DESC', [col.reference])).rows;
  return c.json({
    reference: col.reference,
    name: (await db.query('SELECT name FROM party_versions WHERE party=$1 ORDER BY effective_from DESC LIMIT 1', [col.reference])).rows[0].name,
    country: col.country,
    registration: col.registration,
    registration_expiry: col.registration_expiry,
    collection_site_types: col.collection_site_types,
    declared_streams: col.declared_streams,
    scheme_status: col.scheme_status,
    findings: findings.map((f: any) => ({ reference: f.reference, description: f.description, departure_bp: f.departure_bp, state: f.state, opened_on: f.opened_on })),
    approval_periods: periods.map((p: any) => ({ state: p.state, valid_from: p.valid_from, valid_to: p.valid_to, condition: p.condition || null, condition_closes_on: p.condition_closes_on || null }))
  });
});

referenceRoutes.post('/collectors/:reference/approvals', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['state', 'valid_from', 'valid_to']);
  const ref = c.req.param('reference');
  const col = (await db.query('SELECT * FROM collectors WHERE reference=$1', [ref])).rows[0];
  if (!col) deny('collector_not_found', 'No such collector.', 404);
  if (body.state === 'conditional') requireFields(body, ['condition', 'condition_closes_on']);
  const r = await db.query(
    `INSERT INTO approval_periods (collector,state,valid_from,valid_to,condition,condition_closes_on)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [ref, body.state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null]
  );
  await record(db, { person: s.email, site: null, act: 'collector_approval_added', object_kind: 'collector', object_reference: ref, detail: { state: body.state, valid_from: body.valid_from, valid_to: body.valid_to } });
  return c.json({ id: r.rows[0].id, collector: ref, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to }, 201);
});

// ---- parties -----------------------------------------------------------

referenceRoutes.get('/parties/:reference/versions', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM party_versions WHERE party=$1 ORDER BY effective_from', [c.req.param('reference')])).rows;
  return c.json(rows.map((r: any) => ({ reference: r.party, name: r.name, effective_from: r.effective_from })));
});

referenceRoutes.post('/parties/:reference/versions', async (c) => {
  const s = await requireRole(c, ['quality_manager', 'claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['name', 'effective_from']);
  const ref = c.req.param('reference');
  const prev = (await db.query('SELECT MAX(effective_from) AS d FROM party_versions WHERE party=$1 AND effective_from < $2', [ref, body.effective_from])).rows[0];
  await db.query('INSERT INTO party_versions (party,name,effective_from) VALUES ($1,$2,$3)', [ref, body.name, body.effective_from]);
  await record(db, { person: s.email, act: 'party_version_recorded', object_kind: 'party', object_reference: ref, detail: { name: body.name, effective_from: body.effective_from, supersedes: prev.d || null } });
  return c.json({ reference: ref, name: body.name, effective_from: body.effective_from, supersedes_effective_from: prev.d || null }, 201);
});

// ---- batches -----------------------------------------------------------

function batchView(b: any, r: any) {
  return {
    reference: b.reference,
    collector: b.collector,
    collector_name: r.collector_name_as_at,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: Number(b.net_g),
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    received_on: b.received_on,
    dry_mass_g: r.dry_mass_g,
    claimable: r.claimable,
    claimable_reason: r.claimable_reason,
    claimable_from: r.claimable_from,
    flags: r.flags,
    custody_complete: r.custody_complete,
    missing_custody_kind: r.missing_custody_kind,
    custody: b.custody,
    composition: b.composition,
    contamination: b.contamination,
    accepted_g: Number(b.accepted_g),
    rejected_g: Number(b.rejected_g),
    rejected_destination: b.rejected_destination,
    rejection_reason: b.reject_reason,
    derivation: { dry_mass: 'net_g * (10000 - moisture_bp) / 10000, floored', claimability: 'approval in force on received_on plus custody completeness' }
  };
}

referenceRoutes.get('/batches', async (c) => {
  const s = await requireSession(c);
  noPaginationShared(c);
  const rows = (await db.query('SELECT * FROM batches ORDER BY received_on, reference')).rows;
  const out = [];
  for (const b of rows) {
    if (s.role !== 'plant_operator' && s.role !== 'auditor' && s.role !== 'quality_manager' && s.role !== 'claims_manager' && s.role !== 'lab_analyst' && s.role !== 'certificate_signer') continue;
    const r = await resolveBatch(db, b);
    out.push(batchView(b, r));
  }
  return c.json(out);
});

referenceRoutes.get('/batches/:reference', async (c) => {
  await requireSession(c);
  const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!b) deny('batch_not_found', 'No such batch.', 404);
  const r = await resolveBatch(db, b);
  const view = batchView(b, r);
  const deviating = (b.composition as any[]).filter((x: any) => x.measured_fraction_bp !== undefined && Math.abs(x.measured_fraction_bp - x.fraction_bp) > 500);
  view.composition_departure = deviating.map((x: any) => ({ polymer: x.polymer, declared_fraction_bp: x.fraction_bp, measured_fraction_bp: x.measured_fraction_bp, departure_bp: Math.abs(x.measured_fraction_bp - x.fraction_bp) }));
  return c.json(view);
});

referenceRoutes.post('/batches', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['collector', 'site', 'category', 'gross_g', 'tare_g', 'net_g', 'moisture_bp', 'moisture_method', 'device', 'received_on', 'composition', 'contamination', 'custody']);
  if (!['post_consumer', 'pre_consumer'].includes(body.category)) deny('invalid_category', 'category is required and is one of post_consumer, pre_consumer.', 400);
  await requireSite(c, body.site);
  for (const f of ['gross_g', 'tare_g', 'net_g', 'moisture_bp']) requireInteger(body, f);
  if (body.net_g !== body.gross_g - body.tare_g) deny('mass_does_not_reconcile', 'net_g must equal gross_g minus tare_g.', 400);

  const col = (await db.query('SELECT * FROM collectors WHERE reference=$1', [body.collector])).rows[0];
  if (!col) deny('collector_not_found', 'No such collector.', 404);
  const device = (await db.query('SELECT * FROM devices WHERE reference=$1', [body.device])).rows[0];
  if (!device) deny('device_not_found', 'No such weighing device.', 404);

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM batches")).rows[0].n;
  const reference = 'BATCH-' + String(n).padStart(4, '0');

  await db.query(
    `INSERT INTO batches (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,custody,accepted_g,rejected_g)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0)`,
    [reference, body.collector, body.site, body.grade || 'N6', body.category, body.gross_g, body.tare_g, body.net_g, body.moisture_bp,
     body.moisture_method, body.device, body.received_on, JSON.stringify(body.composition), JSON.stringify(body.contamination),
     JSON.stringify(body.custody), body.net_g]
  );

  // a departure beyond tolerance stands as a finding against the collector
  for (const comp of body.composition as any[]) {
    if (comp.measured_fraction_bp !== undefined && Math.abs(comp.measured_fraction_bp - comp.fraction_bp) > 500) {
      const fcount = (await db.query('SELECT COALESCE(MAX(id),0)::int + 1 AS n FROM findings')).rows[0].n;
      const fref = 'FND-' + String(fcount).padStart(4, '0');
      await db.query(
        `INSERT INTO findings (reference,collector,batch,description,departure_bp,state,opened_on) VALUES ($1,$2,$3,$4,$5,'open',CURRENT_DATE)`,
        [fref, body.collector, reference, `Measured composition departs from the declaration by ${Math.abs(comp.measured_fraction_bp - comp.fraction_bp)} basis points.`, Math.abs(comp.measured_fraction_bp - comp.fraction_bp)]
      );
    }
  }

  const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [reference])).rows[0];
  const r = await resolveBatch(db, b);
  const view = batchView(b, r);
  await record(db, {
    person: s.email, site: body.site, act: 'batch_booked_in', object_kind: 'batch', object_reference: reference,
    event_at: body.received_on, effective_on: body.received_on,
    detail: { collector: body.collector, category: body.category, net_g: body.net_g, dry_mass_g: r.dry_mass_g, device: body.device, calibration_valid: !r.flags.includes('lapsed_calibration') }
  });
  await rememberIdempotent(c, 201, { reference });
  return c.json({ reference, ...view }, 201);
});

referenceRoutes.patch('/batches/:reference', async (c) => {
  const s = await requireRole(c, ['plant_operator', 'quality_manager']);
  const body = await readJson(c);
  const ref = c.req.param('reference');
  const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [ref])).rows[0];
  if (!b) deny('batch_not_found', 'No such batch.', 404);
  if (body.category !== undefined && body.category !== b.category) {
    await record(db, { person: s.email, site: b.site, act: 'refused_batch_category_change', object_kind: 'batch', object_reference: ref, detail: { attempted_category: body.category } });
    return c.json({ error: 'category_immutable', message: 'A batch category cannot be changed after acceptance, by any role, through any route.' }, 409);
  }
  const allowed = ['gross_g', 'tare_g', 'net_g', 'moisture_bp', 'moisture_method', 'contamination'];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) deny('field_not_writable', `${k} is not writable on a batch after acceptance.`, 409);
  return c.json({ reference: ref, ok: true });
});

referenceRoutes.post('/batches/:reference/custody', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['kind', 'arrived_on', 'party']);
  const ref = c.req.param('reference');
  const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [ref])).rows[0];
  if (!b) deny('batch_not_found', 'No such batch.', 404);
  const custody = [...(b.custody as any[]), { kind: body.kind, on: body.arrived_on, party: body.party, late_document: true }];
  await db.query('UPDATE batches SET custody=$1, claimable_from=$2 WHERE reference=$3', [JSON.stringify(custody), body.arrived_on, ref]);
  await record(db, { person: s.email, site: b.site, act: 'custody_late_document_attached', object_kind: 'batch', object_reference: ref, effective_on: body.arrived_on, detail: { kind: body.kind, arrived_on: body.arrived_on } });
  const updated = (await db.query('SELECT * FROM batches WHERE reference=$1', [ref])).rows[0];
  const r = await resolveBatch(db, updated);
  return c.json({ reference: ref, claimable_from: body.arrived_on, custody_complete: r.custody_complete }, 201);
});

referenceRoutes.post('/batches/:reference/reject', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['rejected_g', 'reason', 'destination']);
  const ref = c.req.param('reference');
  const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [ref])).rows[0];
  if (!b) deny('batch_not_found', 'No such batch.', 404);
  if (Number(b.accepted_g) + Number(body.rejected_g) !== Number(b.net_g)) {
    deny('rejection_does_not_sum', `accepted_g plus rejected_g must equal delivered net_g (${b.net_g}).`, 409);
  }
  await db.query('UPDATE batches SET accepted_g=$1, rejected_g=$2, rejected_destination=$3, reject_reason=$4 WHERE reference=$5',
    [Number(b.net_g) - Number(body.rejected_g), body.rejected_g, body.destination, body.reason, ref]);
  await record(db, { person: s.email, site: b.site, act: 'batch_rejected', object_kind: 'batch', object_reference: ref, detail: { rejected_g: body.rejected_g, reason: body.reason, destination: body.destination } });
  return c.json({ reference: ref, accepted_g: Number(b.net_g) - Number(body.rejected_g), rejected_g: body.rejected_g, rejected_destination: body.destination }, 201);
});

referenceRoutes.get('/batches/:reference/impact', async (c) => {
  await requireSession(c);
  noPaginationShared(c);
  const started = Date.now();
  const result = await batchImpact(db, c.req.param('reference'));
  if (Date.now() - started > 5000) deny('traversal_timeout', 'The traversal took longer than five seconds.', 504);
  return c.json(result);
});

// ---- runs --------------------------------------------------------------

referenceRoutes.get('/runs', async (c) => {
  const s = await requireSession(c);
  noPaginationShared(c);
  const rows = (await db.query('SELECT * FROM runs ORDER BY started_at')).rows;
  const out = [];
  for (const r of rows) {
    const cons = (await db.query('SELECT * FROM consumptions WHERE run=$1 ORDER BY id', [r.reference])).rows;
    const outs = (await db.query('SELECT * FROM outputs WHERE run=$1 ORDER BY reference', [r.reference])).rows;
    const massIn = cons.reduce((a: number, x: any) => a + Number(x.mass_g), 0);
    const massOut = outs.reduce((a: number, x: any) => a + Number(x.mass_g), 0);
    out.push({
      reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
      recipe_version: r.recipe_version, operator: r.operator, started_at: r.started_at, closed_at: r.closed_at,
      losses_g: r.losses_g === null ? null : Number(r.losses_g),
      mass_in_g: massIn, mass_out_g: massOut,
      consumptions: cons.map((x: any) => ({ input: x.input_reference, kind: x.input_kind, mass_g: Number(x.mass_g) })),
      outputs: outs.map((x: any) => ({ reference: x.reference, kind: x.kind, mass_g: Number(x.mass_g), lot: x.lot, disposition: x.disposition })),
      actual_setpoints: r.actual_setpoints, within_tolerance: r.within_tolerance,
      open: r.closed_at === null,
      derivation: { losses_g: 'mass in minus mass out, computed at close' }
    });
  }
  return c.json(out);
});

referenceRoutes.get('/runs/:reference', async (c) => {
  await requireSession(c);
  const r = (await db.query('SELECT * FROM runs WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!r) deny('run_not_found', 'No such run.', 404);
  const cons = (await db.query('SELECT * FROM consumptions WHERE run=$1 ORDER BY id', [r.reference])).rows;
  const outs = (await db.query('SELECT * FROM outputs WHERE run=$1 ORDER BY reference', [r.reference])).rows;
  return c.json({
    reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment, recipe_version: r.recipe_version,
    recipe: recipeFor(r.recipe_version), operator: r.operator, started_at: r.started_at, closed_at: r.closed_at,
    actual_setpoints: r.actual_setpoints, within_tolerance: r.within_tolerance,
    mass_in_g: cons.reduce((a: number, x: any) => a + Number(x.mass_g), 0),
    mass_out_g: outs.reduce((a: number, x: any) => a + Number(x.mass_g), 0),
    losses_g: r.losses_g === null ? null : Number(r.losses_g),
    consumptions: cons, outputs: outs
  });
});

function recipeFor(version: string) {
  const recipes: Record<string, any> = {
    'RCP-DISS-2': { set_points: { temperature: { min: 160, max: 170 }, pressure: { min: 2, max: 4 }, residence_minutes: { min: 90, max: 110 } }, reagents: [{ name: 'methanol', ratio_bp: 1800 }, { name: 'sodium hydroxide', ratio_bp: 300 }], residence_time_minutes: 100, released_by: 'quality@example.com', published_threshold: { temperature: 175, pressure: 5 } },
    'RCP-DEPO-4': { set_points: { temperature: { min: 260, max: 285 }, pressure: { min: 8, max: 14 } }, reagents: [{ name: 'methanol', ratio_bp: 2200 }], residence_time_minutes: 180, released_by: 'quality@example.com', published_threshold: { temperature: 290, pressure: 15 } },
    'RCP-PURI-1': { set_points: { temperature: { min: 80, max: 95 }, pressure: { min: 1, max: 2 } }, reagents: [{ name: 'activated carbon', ratio_bp: 150 }], residence_time_minutes: 240, released_by: 'quality@example.com', published_threshold: { temperature: 100, pressure: 3 } },
    'RCP-REPO-3': { set_points: { temperature: { min: 250, max: 265 }, pressure: { min: 8, max: 12 } }, reagents: [{ name: 'caprolactam', ratio_bp: 9800 }], residence_time_minutes: 300, released_by: 'quality@example.com', published_threshold: { temperature: 270, pressure: 14 } }
  };
  return recipes[version] || null;
}

referenceRoutes.post('/runs', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['run_type', 'site', 'equipment', 'recipe_version', 'operator', 'started_at']);
  if (!['dissolution', 'depolymerisation', 'purification', 'repolymerisation'].includes(body.run_type)) deny('invalid_run_type', 'run_type must be one of the four stages.', 400);
  await requireSite(c, body.site);
  if (body.recipe_version && recipeFor(body.recipe_version) === null && !/^RCP-/.test(body.recipe_version)) deny('invalid_recipe_version', 'Unknown recipe version.', 400);

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM runs")).rows[0].n;
  const letter = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[body.run_type as 'dissolution']!;
  const reference = `RUN-${letter}-${String(n).padStart(4, '0')}`;
  await db.query(
    `INSERT INTO runs (reference,run_type,site,equipment,recipe_version,operator,started_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [reference, body.run_type, body.site, body.equipment, body.recipe_version, body.operator || s.email, body.started_at]
  );
  await record(db, { person: s.email, site: body.site, act: 'run_started', object_kind: 'run', object_reference: reference, event_at: body.started_at, detail: { run_type: body.run_type, recipe_version: body.recipe_version, equipment: body.equipment } });
  await rememberIdempotent(c, 201, { reference });
  return c.json({ reference }, 201);
});

referenceRoutes.post('/runs/:reference/consumptions', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['input', 'mass_g']);
  requireInteger(body, 'mass_g');
  const ref = c.req.param('reference');
  const run = (await db.query('SELECT * FROM runs WHERE reference=$1', [ref])).rows[0];
  if (!run) deny('run_not_found', 'No such run.', 404);
  if (run.closed_at) deny('run_closed', 'A closed run refuses every write.', 409);

  const input = body.input;
  let kind = 'batch', batch = input;
  if (input.startsWith('OUT-')) kind = 'intermediate';
  if (input.startsWith('LOT-')) kind = 'lot';
  if (kind === 'batch') {
    const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [input])).rows[0];
    if (!b) deny('batch_not_found', 'No such batch.', 404);
  }
  const effectiveOn = body.effective_on || new Date().toISOString().slice(0, 10);

  const period = (await db.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND $3 BETWEEN period_from AND period_to`,
    [run.site, 'N6', effectiveOn]
  )).rows[0];

  if (kind === 'batch') {
    const b = (await db.query('SELECT * FROM batches WHERE reference=$1', [input])).rows[0];
    const approval = await approvalInForce(db, b.collector, b.received_on);
    const kinds = new Set((b.custody as any[]).map((x: any) => x.kind));
    const required = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'];
    const custodyComplete = required.every((k) => kinds.has(k));
    const claimable = !!approval && ['approved', 'conditional'].includes(approval.state) && custodyComplete;
    if (period && period.state === 'closed') {
      // a late effective date is refused as a write into the period and opens a restatement
      const rref = await openRestatement(db, period.id, `Consumption of ${input} effective ${effectiveOn} falls in a closed period.`, s.email);
      await record(db, { person: s.email, site: run.site, act: 'consumption_refused_period_closed', object_kind: 'run', object_reference: ref, detail: { input, effective_on: effectiveOn, restatement: rref } });
      return c.json({ error: 'period_closed', message: 'This effective date falls in a closed period; a restatement has been opened.', restatement: rref }, 409);
    }
    if (period) {
      const dm = dryMass(b.net_g, b.moisture_bp);
      const factor = (await db.query('SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1', [run.site])).rows[0];
      if (claimable && factor) {
        const dryConsumed = Math.floor((dm * Number(body.mass_g)) / Number(b.net_g));
        const credit = Math.floor((dryConsumed * factor.factor_bp) / 10000);
        if (credit > 0) {
          const mref = 'CRM-' + String((await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM credit_movements")).rows[0].n).padStart(4, '0');
          await db.query(
            `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,effective_on) VALUES ($1,$2,$3,'in',$4,$5,$6)`,
            [mref, period.id, b.category, credit, `Credit granted at consumption of ${input} by ${ref} (dry mass ${dryConsumed} g at ${factor.factor_bp} bp).`, effectiveOn]
          );
        }
      }
    }
  }

  const id = await db.query(
    `INSERT INTO consumptions (run,batch,input_reference,input_kind,mass_g,effective_on) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [ref, kind === 'batch' ? input : null, input, kind, body.mass_g, effectiveOn]
  );
  await record(db, { person: s.email, site: run.site, act: 'consumption_recorded', object_kind: 'run', object_reference: ref, detail: { input, mass_g: body.mass_g, effective_on: effectiveOn } });
  return c.json({ reference: 'CNS-' + String(id.rows[0].id).padStart(4, '0'), run: ref, input, mass_g: body.mass_g, effective_on: effectiveOn }, 201);
});

export async function openRestatement(db: any, periodId: string, reason: string, by: string) {
  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM restatements")).rows[0].n;
  const ref = 'RST-' + String(n).padStart(4, '0');
  const certs = (await db.query('SELECT number FROM certificates WHERE period=$1 ORDER BY number', [periodId])).rows.map((r: any) => r.number);
  await db.query(
    `INSERT INTO restatements (reference,period,reason,opened_by,opened_on,certificates,state) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,'open')`,
    [ref, periodId, reason, by, JSON.stringify(certs)]
  );
  await record(db, { person: by, act: 'restatement_opened', object_kind: 'restatement', object_reference: ref, detail: { period: periodId, reason, certificates: certs } });
  return ref;
}

referenceRoutes.post('/runs/:reference/outputs', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['mass_g', 'kind']);
  requireInteger(body, 'mass_g');
  const ref = c.req.param('reference');
  const run = (await db.query('SELECT * FROM runs WHERE reference=$1', [ref])).rows[0];
  if (!run) deny('run_not_found', 'No such run.', 404);
  if (run.closed_at) deny('run_closed', 'A closed run refuses every write.', 409);
  if (!['intermediate', 'lot', 'byproduct'].includes(body.kind)) deny('invalid_kind', 'kind is one of intermediate, lot, byproduct.', 400);
  if (body.kind === 'byproduct' && !['sold', 'disposed'].includes(body.disposition)) {
    deny('byproduct_disposition_required', 'A byproduct carries disposition in sold, disposed.', 400);
  }

  const prefix = run.run_type === 'dissolution' ? 'OUT-D' : run.run_type === 'depolymerisation' ? 'OUT-Y' : run.run_type === 'purification' ? 'OUT-U' : 'OUT-R';
  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM outputs")).rows[0].n;
  const oref = `${prefix}-${String(n).padStart(4, '0')}`;

  let lotRef = null;
  if (body.kind === 'lot') {
    const ln = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM lots")).rows[0].n;
    lotRef = body.lot_reference || `LOT-${body.grade || 'N6'}-${String(ln).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO lots (reference,grade,site,run,mass_g,disposition,claim_type) VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
      [lotRef, body.grade || 'N6', run.site, ref, body.mass_g, body.claim_type || 'mass_balance']
    );
  }
  await db.query(
    `INSERT INTO outputs (reference,run,kind,mass_g,disposition,lot) VALUES ($1,$2,$3,$4,$5,$6)`,
    [oref, ref, body.kind, body.mass_g, body.disposition || null, lotRef]
  );
  await record(db, { person: s.email, site: run.site, act: 'output_recorded', object_kind: 'run', object_reference: ref, detail: { output: oref, kind: body.kind, mass_g: body.mass_g, lot: lotRef } });
  await rememberIdempotent(c, 201, { reference: oref, lot: lotRef });
  return c.json({ reference: oref, kind: body.kind, mass_g: body.mass_g, lot: lotRef }, 201);
});

referenceRoutes.post('/runs/:reference/close', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const ref = c.req.param('reference');
  const run = (await db.query('SELECT * FROM runs WHERE reference=$1', [ref])).rows[0];
  if (!run) deny('run_not_found', 'No such run.', 404);
  if (run.closed_at) {
    await record(db, { person: s.email, site: run.site, act: 'run_second_close_attempted', object_kind: 'run', object_reference: ref, detail: { closed_at: run.closed_at } });
    return c.json({ error: 'already_closed', message: 'This run is closed; a second close is refused and recorded as an attempt.' }, 409);
  }
  const cons = (await db.query('SELECT * FROM consumptions WHERE run=$1', [ref])).rows;
  const outs = (await db.query('SELECT * FROM outputs WHERE run=$1', [ref])).rows;
  const massIn = cons.reduce((a: number, x: any) => a + Number(x.mass_g), 0);
  const massOut = outs.reduce((a: number, x: any) => a + Number(x.mass_g), 0);
  const losses = massIn - massOut;

  const recipe = recipeFor(run.recipe_version);
  const actual = run.actual_setpoints || (body_setpoints(await readJson(c).catch(() => ({}))));
  let within = null;
  if (recipe && actual && Object.keys(recipe.set_points).length) {
    within = Object.keys(recipe.set_points).every((k) => {
      const sp = recipe.set_points[k], a = actual[k];
      return a === undefined || (a >= sp.min && a <= sp.max);
    });
  }
  await db.query('UPDATE runs SET closed_at=now(), losses_g=$1, actual_setpoints=$2, within_tolerance=$3 WHERE reference=$4',
    [losses, actual ? JSON.stringify(actual) : null, within, ref]);

  if (within === false) {
    const dn = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM deviations")).rows[0].n;
    const dref = 'DEV-' + String(dn).padStart(4, '0');
    await db.query(`INSERT INTO deviations (reference,state,raised_by,reason) VALUES ($1,'open',$2,$3)`, [dref, s.email, `Run ${ref} recorded set points outside the tolerance of ${run.recipe_version}.`]);
    await db.query(`INSERT INTO deviation_subjects (deviation,subject_kind,subject) VALUES ($1,'run',$2)`, [dref, ref]);
  }

  await record(db, { person: s.email, site: run.site, act: 'run_closed', object_kind: 'run', object_reference: ref, detail: { mass_in_g: massIn, mass_out_g: massOut, losses_g: losses, within_tolerance: within } });
  await rememberIdempotent(c, 200, { reference: ref, losses_g: losses });
  return c.json({ reference: ref, mass_in_g: massIn, mass_out_g: massOut, losses_g: losses, within_tolerance: within });
});

function body_setpoints(b: any) {
  return b && b.actual_setpoints ? b.actual_setpoints : null;
}

referenceRoutes.post('/runs/:reference/annotate', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['annotation']);
  const ref = c.req.param('reference');
  const run = (await db.query('SELECT * FROM runs WHERE reference=$1', [ref])).rows[0];
  if (!run) deny('run_not_found', 'No such run.', 404);
  await db.query('UPDATE runs SET annotation=$1, annotated_by=$2 WHERE reference=$3', [body.annotation, s.email, ref]);
  await record(db, { person: s.email, site: run.site, act: 'run_annotated', object_kind: 'run', object_reference: ref, detail: { annotation: body.annotation } });
  return c.json({ reference: ref, annotation: body.annotation, annotated_by: s.email }, 201);
});

// ---- lots --------------------------------------------------------------

referenceRoutes.get('/lots', async (c) => {
  await requireSession(c);
  noPaginationShared(c);
  const rows = (await db.query('SELECT * FROM lots ORDER BY reference')).rows;
  const out = [];
  for (const l of rows) {
    const attached = (await db.query(
      `SELECT category, COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out' GROUP BY category`,
      [l.reference]
    )).rows;
    const attachedByCat: Record<string, number> = {};
    for (const a of attached) attachedByCat[a.category] = Number(a.g);
    const totalAttached = Object.values(attachedByCat).reduce((a, b) => a + b, 0);
    out.push({
      reference: l.reference, grade: l.grade, site: l.site, run: l.run, mass_g: Number(l.mass_g),
      disposition: l.disposition, claim_type: l.claim_type,
      credit_attached_g: attachedByCat,
      content_bp: Math.floor((totalAttached * 10000) / Number(l.mass_g)),
      blended_from: l.blended_from,
      derivation: { content_bp: 'credit_attached_g * 10000 / lot_mass_g, floored' }
    });
  }
  return c.json(out);
});

referenceRoutes.get('/lots/:reference', async (c) => {
  await requireSession(c);
  const l = (await db.query('SELECT * FROM lots WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!l) deny('lot_not_found', 'No such lot.', 404);
  const attached = (await db.query(
    `SELECT category, COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out' GROUP BY category`, [l.reference]
  )).rows;
  const attachedByCat: Record<string, number> = {};
  for (const a of attached) attachedByCat[a.category] = Number(a.g);
  const totalAttached = Object.values(attachedByCat).reduce((a, b) => a + b, 0);
  const tests = (await db.query('SELECT * FROM test_results WHERE subject=$1 ORDER BY recorded_at', [l.reference])).rows;
  const devs = (await db.query(
    `SELECT d.* FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference WHERE ds.subject=$1 AND ds.subject_kind='lot'`, [l.reference]
  )).rows;
  const ovr = (await db.query('SELECT * FROM overrides WHERE lot=$1 ORDER BY authorised_on', [l.reference])).rows;
  const flags: string[] = [];
  if (devs.some((d: any) => d.state === 'open')) flags.push('open_deviation');
  if (ovr.some((o: any) => !o.reviewed)) flags.push('unreviewed_override');
  return c.json({
    reference: l.reference, grade: l.grade, site: l.site, run: l.run, mass_g: Number(l.mass_g),
    disposition: l.disposition, claim_type: l.claim_type,
    credit_attached_g: attachedByCat,
    content_bp: Math.floor((totalAttached * 10000) / Number(l.mass_g)),
    claim_type_and_content_bp: { claim_type: l.claim_type, content_bp: Math.floor((totalAttached * 10000) / Number(l.mass_g)) },
    test_results: tests, deviations: devs, overrides: ovr, flags,
    blended_from: l.blended_from
  });
});

referenceRoutes.get('/lots/:reference/genealogy', async (c) => {
  await requireSession(c);
  noPaginationShared(c);
  const g = await upstreamGraph(db, c.req.param('reference'));
  return c.json(g);
});

referenceRoutes.get('/lots/:reference/yield', async (c) => {
  const s = await requireSession(c);
  if (!['plant_operator', 'lab_analyst', 'quality_manager', 'claims_manager'].includes(s.role)) {
    deny('yield_not_for_this_role', 'A yield figure answers for plant operations, quality and the claims manager.', 403);
  }
  const l = (await db.query('SELECT * FROM lots WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!l) deny('lot_not_found', 'No such lot.', 404);
  const cons = (await db.query('SELECT * FROM consumptions WHERE run=$1', [l.run])).rows;
  const massIn = cons.reduce((a: number, x: any) => a + Number(x.mass_g), 0);
  const outs = (await db.query('SELECT * FROM outputs WHERE run=$1', [l.run])).rows;
  const massOut = outs.reduce((a: number, x: any) => a + Number(x.mass_g), 0);
  const lotsMass = outs.filter((o: any) => o.kind === 'lot').reduce((a: number, x: any) => a + Number(x.mass_g), 0);
  return c.json({
    lot: l.reference,
    run: l.run,
    mass_in_g: massIn,
    mass_out_g: massOut,
    lot_mass_of_run_g: lotsMass,
    yield_bp: massIn === 0 ? 0 : Math.floor((Number(l.mass_g) * 10000) / massIn),
    derivation: 'lot mass * 10000 / run mass in, floored',
    note: 'A yield figure appears on no certificate and in no verification answer.'
  });
});

referenceRoutes.post('/lots/:reference/blend', async (c) => {
  const s = await requireRole(c, ['plant_operator']);
  const body = await readJson(c);
  requireFields(body, ['lot_b']);
  const lotARef = c.req.param('reference');
  const a = (await db.query('SELECT * FROM lots WHERE reference=$1', [lotARef])).rows[0];
  const b = (await db.query('SELECT * FROM lots WHERE reference=$1', [body.lot_b])).rows[0];
  if (!a || !b) deny('lot_not_found', 'No such lot.', 404);

  const content = async (l: any) => {
    const rows = (await db.query(`SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out'`, [l.reference])).rows;
    return Math.floor((Number(rows[0].g) * 10000) / Number(l.mass_g));
  };
  const contentA = await content(a);
  const contentB = await content(b);
  const massA = Number(a.mass_g), massB = Number(b.mass_g);
  const blended = Math.floor((massA * contentA + massB * contentB) / (massA + massB));

  const weakerClaim = [a.claim_type, b.claim_type].sort().indexOf('mass_balance') >= 0 ? 'mass_balance' : (a.claim_type === b.claim_type ? a.claim_type : 'controlled_blending');
  const sites = a.site === b.site ? [a.site] : [a.site, b.site];

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM lots")).rows[0].n;
  const ref = `LOT-${a.grade}-${String(n).padStart(4, '0')}`;
  const sitesFlag = sites.length > 1;
  await db.query(
    `INSERT INTO lots (reference,grade,site,run,mass_g,disposition,claim_type,blended_from)
     VALUES ($1,$2,$3,NULL,$4,'pending',$5,$6)`,
    [ref, a.grade, sites[0], massA + massB, weakerClaim, JSON.stringify([{ reference: a.reference, mass_g: massA }, { reference: b.reference, mass_g: massB }])]
  );
  await record(db, { person: s.email, site: sites[0], act: 'lot_blended', object_kind: 'lot', object_reference: ref, detail: { from: [a.reference, b.reference], mass_g: massA + massB, content_bp: blended, sites } });
  return c.json({
    reference: ref, mass_g: massA + massB, claim_type: weakerClaim,
    content_bp: blended,
    derivation: { content_bp: `(${massA} * ${contentA} + ${massB} * ${contentB}) / (${massA} + ${massB}), floored` },
    sites, both_sites_named: sitesFlag,
    weaker_claim_type: weakerClaim
  }, 201);
});

// ---- test results, dispositions, deviations, overrides ------------------

referenceRoutes.post('/test-results', async (c) => {
  const s = await requireRole(c, ['lab_analyst']);
  const body = await readJson(c);
  requireFields(body, ['subject', 'property', 'method', 'instrument', 'value', 'unit', 'uncertainty_bp']);
  requireInteger(body, 'uncertainty_bp');
  const spec = (await db.query(
    `SELECT * FROM specifications WHERE grade=(SELECT grade FROM lots WHERE reference=$1) ORDER BY version DESC LIMIT 1`,
    [body.subject]
  )).rows[0];
  const namedMethod = spec ? (spec.rows as any[]).find((r: any) => r.property === body.property)?.method : null;
  const mismatch = namedMethod ? namedMethod !== body.method : false;

  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM test_results")).rows[0].n;
  const ref = 'TR-' + String(n).padStart(4, '0');
  await db.query(
    `INSERT INTO test_results (reference,subject_kind,subject,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [ref, body.subject.startsWith('BATCH-') ? 'batch' : 'lot', body.subject, body.property, body.method, body.instrument, s.email, String(body.value), body.unit, body.uncertainty_bp, mismatch, !mismatch]
  );
  await record(db, { person: s.email, act: 'test_result_recorded', object_kind: 'test_result', object_reference: ref, detail: { subject: body.subject, property: body.property, method: body.method, method_mismatch: mismatch } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, method_mismatch: mismatch, usable_for_release: !mismatch }, 201);
});

referenceRoutes.post('/lots/:reference/disposition', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['disposition']);
  if (!['pending', 'released', 'quarantined', 'rejected'].includes(body.disposition)) deny('invalid_disposition', 'disposition is one of pending, released, quarantined, rejected.', 400);
  const ref = c.req.param('reference');
  const l = (await db.query('SELECT * FROM lots WHERE reference=$1', [ref])).rows[0];
  if (!l) deny('lot_not_found', 'No such lot.', 404);

  const entered = (await db.query('SELECT 1 FROM test_results WHERE analyst=$1 AND subject=$2', [s.email, ref])).rows[0];
  if (entered) {
    await record(db, { person: s.email, site: l.site, act: 'refused_disposition_separation', object_kind: 'lot', object_reference: ref, detail: { separation: 'analyst_not_dispositioner' } });
    deny('separation_refused', 'Whoever entered a test result on this lot does not disposition it.', 403);
  }
  const openDev = (await db.query(
    `SELECT d.reference FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference
     WHERE d.state='open' AND ((ds.subject_kind='lot' AND ds.subject=$1) OR (ds.subject_kind='run' AND ds.subject=$2)) LIMIT 1`,
    [ref, l.run]
  )).rows[0];
  if (openDev) {
    await record(db, { person: s.email, site: l.site, act: 'refused_disposition_open_deviation', object_kind: 'lot', object_reference: ref, detail: { deviation: openDev.reference } });
    deny('open_deviation', `Deviation ${openDev.reference} touching this lot is open.`, 409);
  }
  await db.query('UPDATE lots SET disposition=$1 WHERE reference=$2', [body.disposition, ref]);
  await record(db, { person: s.email, site: l.site, act: 'disposition_set', object_kind: 'lot', object_reference: ref, detail: { disposition: body.disposition } });
  await rememberIdempotent(c, 200, { reference: ref, disposition: body.disposition });
  return c.json({ reference: ref, disposition: body.disposition });
});

referenceRoutes.post('/deviations', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['reason', 'subjects']);
  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM deviations")).rows[0].n;
  const ref = 'DEV-' + String(n).padStart(4, '0');
  await db.query(`INSERT INTO deviations (reference,state,raised_by,reason) VALUES ($1,'open',$2,$3)`, [ref, s.email, body.reason]);
  for (const sub of body.subjects as any[]) {
    await db.query(`INSERT INTO deviation_subjects (deviation,subject_kind,subject) VALUES ($1,$2,$3)`,
      [ref, sub.startsWith('RUN-') ? 'run' : 'lot', sub]);
  }
  await record(db, { person: s.email, act: 'deviation_raised', object_kind: 'deviation', object_reference: ref, detail: { reason: body.reason, subjects: body.subjects } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, state: 'open', subjects: body.subjects }, 201);
});

referenceRoutes.post('/deviations/:reference/close', async (c) => {
  const s = await requireRole(c, ['quality_manager']);
  const body = await readJson(c);
  requireFields(body, ['outcome']);
  if (!['root_cause_found', 'cause_not_established'].includes(body.outcome)) deny('invalid_outcome', 'outcome is root_cause_found or cause_not_established.', 400);
  const ref = c.req.param('reference');
  const d = (await db.query('SELECT * FROM deviations WHERE reference=$1', [ref])).rows[0];
  if (!d) deny('deviation_not_found', 'No such deviation.', 404);
  if (d.state === 'closed') deny('already_closed', 'This deviation is closed.', 409);
  await db.query('UPDATE deviations SET state=$1, outcome=$2, closed_at=now() WHERE reference=$3', ['closed', body.outcome, ref]);
  await record(db, { person: s.email, act: 'deviation_closed', object_kind: 'deviation', object_reference: ref, detail: { outcome: body.outcome } });
  return c.json({ reference: ref, state: 'closed', outcome: body.outcome });
});

referenceRoutes.post('/overrides', async (c) => {
  const s = await requireRole(c, ['quality_manager', 'claims_manager']);
  const body = await readJson(c);
  requireFields(body, ['separation', 'reason', 'lot', 'authorised_by']);
  if (!body.separation || !['analyst_not_dispositioner', 'method_publisher_not_closer', 'signer_not_data_enterer', 'booker_not_approver'].includes(body.separation)) {
    deny('invalid_separation', 'separation names the separation broken.', 400);
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length < 40) deny('reason_too_short', 'A reason of at least forty characters is required.', 400);
  const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM overrides")).rows[0].n;
  const ref = 'OVR-' + String(n).padStart(4, '0');
  await db.query(
    `INSERT INTO overrides (reference,separation,reason,lot,authorised_by,authorised_on) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
    [ref, body.separation, body.reason, body.lot, body.authorised_by]
  );
  await record(db, { person: s.email, act: 'override_recorded', object_kind: 'override', object_reference: ref, detail: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by } });
  await rememberIdempotent(c, 201, { reference: ref });
  return c.json({ reference: ref, separation: body.separation, lot: body.lot, reviewed: false, blocking_signing: true }, 201);
});

referenceRoutes.post('/overrides/:reference/review', async (c) => {
  const s = await requireRole(c, ['quality_manager', 'claims_manager']);
  const ref = c.req.param('reference');
  const o = (await db.query('SELECT * FROM overrides WHERE reference=$1', [ref])).rows[0];
  if (!o) deny('override_not_found', 'No such override.', 404);
  if (o.authorised_by === s.email) deny('authoriser_may_not_review', 'A review is refused for the authoriser.', 403);
  await db.query('UPDATE overrides SET reviewed=true, reviewed_by=$1, reviewed_on=CURRENT_DATE WHERE reference=$2', [s.email, ref]);
  await record(db, { person: s.email, act: 'override_reviewed', object_kind: 'override', object_reference: ref, detail: { reviewed_by: s.email } });
  return c.json({ reference: ref, reviewed: true, reviewed_by: s.email, reviewed_on: new Date().toISOString().slice(0, 10) });
});

referenceRoutes.get('/deviations', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM deviations ORDER BY opened_at')).rows;
  const out = [];
  for (const d of rows) {
    const subs = (await db.query('SELECT * FROM deviation_subjects WHERE deviation=$1', [d.reference])).rows;
    out.push({ reference: d.reference, state: d.state, raised_by: d.raised_by, reason: d.reason, outcome: d.outcome, opened_at: d.opened_at, closed_at: d.closed_at, subjects: subs.map((x: any) => ({ kind: x.subject_kind, reference: x.subject })) });
  }
  return c.json(out);
});

referenceRoutes.get('/overrides', async (c) => {
  await requireSession(c);
  const rows = (await db.query('SELECT * FROM overrides ORDER BY authorised_on')).rows;
  return c.json(rows.map((o: any) => ({ reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot, authorised_by: o.authorised_by, authorised_on: o.authorised_on, reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on })));
});

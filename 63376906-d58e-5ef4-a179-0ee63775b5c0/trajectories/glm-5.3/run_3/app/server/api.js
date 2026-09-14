import { Hono } from 'hono';
import { q, one, tx } from './db.js';
import { err, HttpError, appendEntry, digest, canonical, ZERO64 } from './record.js';
import { keycloakLogin, signToken, principalFromToken, requireRole, requireSite, requireSession, SITE_SCOPED } from './auth.js';
import * as U from './units.js';
import * as E from './engine.js';
import { genealogyOfLot, impactOfBatch } from './genealogy.js';
import { eightConditions } from './conditions.js';
import { sendMail } from './mail.js';
import crypto from 'node:crypto';

export const api = new Hono();

api.onError((err, c) => {
  if (err && err.status) return c.json({ error: err.code, ...(err.extra || {}) }, err.status);
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

// ---------- middleware ----------
api.use('*', async (c, next) => {
  const start = Date.now();
  try { await next(); } catch (e) {
    if (e instanceof HttpError) return c.json({ error: e.code, ...e.extra }, e.status);
    console.error('unhandled', e);
    return c.json({ error: 'internal_error' }, 500);
  }
  c.header('x-response-ms', String(Date.now() - start));
});

const bodyHash = (b) => crypto.createHash('sha256').update(JSON.stringify(b ?? null)).digest('hex');
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

api.use('*', async (c, next) => {
  if (!WRITE.has(c.req.method)) return next();
  const route = c.req.path;
  if (route === '/api/auth/login' || route === '/api/enquiries' || route.startsWith('/api/verify')) return next();
  const key = c.req.header('idempotency-key');
  if (!key) return c.json({ error: 'idempotency_key_required' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const h = bodyHash(body);
  const prior = await one(`select * from idempotency_key where key = $1 and route = $2`, [key, route]);
  if (prior) {
    if (prior.body_hash !== h) return c.json({ error: 'idempotency_key_reuse' }, 409);
    return c.json(prior.response, prior.status);
  }
  c.set('idemKey', key); c.set('idemHash', h); c.set('idemBody', body);
  await next();
});

async function remember(c, status, payload) {
  const key = c.get('idemKey');
  if (!key) return;
  await q(`insert into idempotency_key(key, route, body_hash, status, response) values ($1,$2,$3,$4,$5)
           on conflict (key, route) do nothing`, [key, c.req.path, c.get('idemHash'), status, JSON.stringify(payload)]);
  if (status >= 400) {
    // a refused act is not remembered as the act's result: the key may be retried
    await q(`delete from idempotency_key where key = $1 and route = $2 and status >= 400`, [key, c.req.path]);
  }
}

async function principal(c) {
  const h = c.req.header('authorization');
  return principalFromToken(h || '');
}
const needsAuth = (c) => principal(c);

function intOr422(v, name) {
  if (v === undefined || v === null || !Number.isInteger(v)) err(422, 'integer_required', { field: name });
  return v;
}
function noPagination(c) {
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (c.req.query(p) !== undefined) err(400, 'pagination_refused', { parameter: p });
  }
}

// ---------- health ----------
api.get('/api/health', async (c) => {
  try { await q('select 1'); return c.json({ status: 'ok' }); }
  catch { return c.json({ status: 'starting' }, 503); }
});

// ---------- auth ----------
api.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) return c.json({ error: 'credentials_required' }, 400);
  const kc = await keycloakLogin(email, password);
  if (!kc) return c.json({ error: 'invalid_credentials' }, 401);
  const acc = await one(`select email, name, role from account where email = $1`, [kc.email]);
  if (!acc) return c.json({ error: 'account_not_known' }, 403);
  const token = signToken({ email: acc.email, name: acc.name });
  return c.json({ access_token: token, token_type: 'Bearer', expires_in: 12 * 3600 });
});
api.get('/api/auth/me', async (c) => {
  const p = await needsAuth(c);
  if (!p) return c.json({ error: 'session_required' }, 401);
  return c.json({ email: p.email, name: p.name, roles: [p.role], sites: p.sites, grants_expire_on: '2027-06-30' });
});

// ---------- sites, parties, collectors ----------
api.get('/api/sites', async (c) => {
  const rows = await q(`select * from site order by reference`);
  return c.json(rows.map((s) => ({ reference: s.reference, name: s.name, confidence: s.confidence, certification_state: s.certification_state })));
});
api.get('/api/sites/:reference/capacity', async (c) => {
  const s = await one(`select * from site where reference = $1`, [c.req.param('reference')]);
  if (!s) return c.json({ error: 'not_found' }, 404);
  return c.json({ reference: s.reference, nameplate_kg: s.nameplate_kg, basis: s.capacity_basis,
    contracted_kg: s.contracted_kg, uncommitted_kg: s.nameplate_kg - s.contracted_kg,
    confidence: s.confidence, last_revised: s.last_revised,
    derivation: { uncommitted_kg: 'nameplate_kg minus contracted_kg, computed' } });
});
api.get('/api/sites/:reference/certification', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from certification_period where site = $1 order by effective_from`, [c.req.param('reference')]);
  return c.json(rows);
});
api.post('/api/sites/:reference/certification', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'quality_manager') { await appendEntry('refused', p.email, p.name, c.req.param('reference'), 'certification_record', 'only a quality manager records certification'); return c.json({ error: 'role_not_permitted' }, 403); }
  const body = c.get('idemBody');
  const site = c.req.param('reference');
  const from = body.effective_from || new Date().toISOString().slice(0, 10);
  const to = body.effective_to || '2999-12-31';
  const row = await q(`insert into certification_period(site,state,effective_from,effective_to,recorded_on,recorded_by,resolutions) values ($1,$2,$3,$4,current_date,$5,$6) returning *`,
    [site, body.state || 'suspended', from, to, p.email, JSON.stringify(body.resolutions || [])]);
  let certificates_in_window = [];
  if ((body.state || 'suspended') === 'suspended') {
    const certs = await q(`select number, recipient, state from certificate where site = $1 and signed_on between $2 and $3`, [site, from, to]);
    certificates_in_window = certs.map((x) => ({ number: x.number, recipient: x.recipient, current_state: x.state, restatement_outcome: null }));
  }
  const e = await appendEntry('certification_suspended', p.email, p.name, site, 'certification', `Certification ${body.state || 'suspended'} recorded for ${site} effective ${from}`);
  await remember(c, 201, { reference: 'CERTPER-' + row[0].id, certificates_in_window, effective_from: from, effective_to: to, state: body.state || 'suspended', record_entry: e.seq });
  return c.json({ reference: 'CERTPER-' + row[0].id, certificates_in_window, effective_from: from, effective_to: to, state: body.state || 'suspended', record_entry: e.seq }, 201);
});

api.get('/api/parties/:reference/versions', async (c) => {
  const rows = await q(`select pv.*, (select name from party_version p2 where p2.party = pv.party and p2.effective_from <= current_date order by p2.effective_from desc limit 1) as current_name
                        from party_version pv where pv.party = $1 order by pv.effective_from`, [c.req.param('reference')]);
  return c.json(rows.map((r) => ({ reference: r.party, name: r.name, effective_from: r.effective_from, superseded_by: r.superseded_by })));
});
api.post('/api/parties/:reference/versions', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['quality_manager', 'claims_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  if (!body.name || !body.effective_from) return c.json({ error: 'name_and_effective_from_required' }, 422);
  const existing = await one(`select id from party_version where party = $1 and effective_from = $2`, [c.req.param('reference'), body.effective_from]);
  if (existing) return c.json({ error: 'version_exists' }, 409);
  const rows = await q(`insert into party_version(party,name,effective_from) values ($1,$2,$3) returning id`, [c.req.param('reference'), body.name, body.effective_from]);
  await q(`update party_version set superseded_by = $1 where party = $2 and effective_from < $3 and superseded_by is null`, [rows[0].id, c.req.param('reference'), body.effective_from]);
  const e = await appendEntry('party_version_recorded', p.email, p.name, null, 'party', `${c.req.param('reference')} renamed to ${body.name} from ${body.effective_from}`);
  await remember(c, 201, { reference: 'PV-' + rows[0].id, name: body.name, effective_from: body.effective_from, record_entry: e.seq });
  return c.json({ reference: 'PV-' + rows[0].id, name: body.name, effective_from: body.effective_from, record_entry: e.seq }, 201);
});

api.get('/api/collectors', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const cols = await q(`select * from collector order by reference`);
  const out = [];
  for (const col of cols) {
    const periods = await q(`select * from approval_period where collector = $1 order by valid_from`, [col.reference]);
    const findings = await q(`select * from finding where collector = $1 order by raised_on desc`, [col.reference]);
    const name = await E.partyNameAt(col.reference, new Date().toISOString().slice(0, 10));
    out.push({ reference: col.reference, name, country: col.country, registration: col.registration,
      registration_expiry: col.registration_expiry, collection_site_types: col.collection_site_types,
      declared_streams: col.declared_streams, scheme_status: col.scheme_status,
      findings: findings.map((f) => ({ kind: f.kind, detail: f.detail, departure_bp: f.departure_bp, raised_on: f.raised_on, state: f.state })),
      approval_periods: periods.map(approvalPeriodView) });
  }
  return c.json(out);
});
function approvalPeriodView(ap) {
  const soon = new Date(ap.valid_to) < new Date(Date.now() + 14 * 864e5);
  const o = { state: ap.state, valid_from: ap.valid_from, valid_to: ap.valid_to, expiring: soon };
  if (ap.state === 'conditional') { o.condition = ap.condition; o.condition_closes_on = ap.condition_closes_on; }
  return o;
}
api.get('/api/collectors/:reference', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const col = await one(`select * from collector where reference = $1`, [c.req.param('reference')]);
  if (!col) return c.json({ error: 'not_found' }, 404);
  const periods = await q(`select * from approval_period where collector = $1 order by valid_from`, [col.reference]);
  const findings = await q(`select * from finding where collector = $1 order by raised_on desc`, [col.reference]);
  const name = await E.partyNameAt(col.reference, new Date().toISOString().slice(0, 10));
  return c.json({ reference: col.reference, name, country: col.country, registration: col.registration,
    registration_expiry: col.registration_expiry, collection_site_types: col.collection_site_types,
    declared_streams: col.declared_streams, scheme_status: col.scheme_status,
    findings: findings.map((f) => ({ kind: f.kind, detail: f.detail, departure_bp: f.departure_bp, raised_on: f.raised_on, state: f.state })),
    approval_periods: periods.map(approvalPeriodView) });
});
api.post('/api/collectors/:reference/approvals', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'quality_manager') {
    await appendEntry('refused', p.email, p.name, c.req.param('reference'), 'collector_approval', 'only a quality manager approves a collector');
    return c.json({ error: 'role_not_permitted' }, 403);
  }
  const body = c.get('idemBody');
  const state = body.state;
  if (!['approved', 'conditional', 'suspended', 'lapsed'].includes(state)) return c.json({ error: 'state_invalid' }, 422);
  if (!body.valid_from || !body.valid_to) return c.json({ error: 'period_required' }, 422);
  if (state === 'conditional' && !body.condition) return c.json({ error: 'condition_required' }, 422);
  const rows = await q(`insert into approval_period(collector,state,valid_from,valid_to,condition,condition_closes_on) values ($1,$2,$3,$4,$5,$6) returning id`,
    [c.req.param('reference'), state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null]);
  const e = await appendEntry('collector_approved', p.email, p.name, c.req.param('reference'), 'collector', `Approval ${state} recorded for ${c.req.param('reference')} ${body.valid_from} to ${body.valid_to}`);
  const payload = { reference: 'AP-' + rows[0].id, state, valid_from: body.valid_from, valid_to: body.valid_to, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});

// ---------- batches ----------
api.get('/api/batches', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const rows = await q(`select * from batch order by reference`);
  return c.json(await Promise.all(rows.map(E.batchView)));
});
api.get('/api/batches/:reference', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const b = await one(`select * from batch where reference = $1`, [c.req.param('reference')]);
  if (!b) return c.json({ error: 'not_found' }, 404);
  return c.json(await E.batchView(b));
});
api.post('/api/batches', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role === 'auditor') return c.json({ error: 'auditor_read_only' }, 403);
  if (!['plant_operator', 'quality_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  if (!body.category || !['post_consumer', 'pre_consumer'].includes(body.category)) return c.json({ error: 'category_required' }, 422);
  for (const f of ['gross_g', 'tare_g', 'net_g', 'moisture_bp']) intOr422(body[f], f);
  if (!body.collector || !body.site || !body.received_on || !body.device) return c.json({ error: 'collector_site_device_received_on_required' }, 422);
  if (body.gross_g - body.tare_g !== body.net_g) return c.json({ error: 'mass_does_not_reconcile' }, 422);
  const seq = (await q(`select count(*)::int as n from batch`))[0].n + 1001;
  const ref = 'BATCH-' + seq;
  const rows = await q(`insert into batch(reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,custody,accepted,rejected_g,booked_by,accepted_g)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,0,$16,$8) returning reference`,
    [ref, body.collector, body.site, body.grade || 'N6', body.category, body.gross_g, body.tare_g, body.net_g, body.moisture_bp, body.moisture_method || null, body.device, body.received_on,
     JSON.stringify(body.composition || []), JSON.stringify(body.contamination || {}), JSON.stringify(body.custody || []), p.email]);
  const b = await one(`select * from batch where reference = $1`, [ref]);
  const view = await E.batchView(b);
  const e = await appendEntry('batch_booked', p.email, p.name, b.site, ref, `Batch ${ref} booked in from ${body.collector}, net ${body.net_g} g`);
  view.record_entry = e.seq;
  await remember(c, 201, view);
  return c.json(view, 201);
});
api.patch('/api/batches/:reference', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  const b = await one(`select * from batch where reference = $1`, [ref]);
  if (!b) return c.json({ error: 'not_found' }, 404);
  if (body.category && body.category !== b.category) {
    await appendEntry('refused', p.email, p.name, b.site, ref, 'batch category change refused: category immutable after acceptance');
    return c.json({ error: 'category_immutable_after_acceptance', rule: 'A batch category cannot be changed after acceptance, by anybody, through any route.' }, 409);
  }
  const allowed = ['moisture_bp', 'moisture_method', 'contamination'];
  const sets = []; const vals = [];
  for (const k of allowed) if (body[k] !== undefined) { sets.push(`${k} = $${vals.length + 1}`); vals.push(typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]); }
  if (sets.length) { vals.push(ref); await q(`update batch set ${sets.join(', ')} where reference = $${vals.length}`); }
  const fresh = await one(`select * from batch where reference = $1`, [ref]);
  const view = await E.batchView(fresh);
  const e = await appendEntry('batch_annotated', p.email, p.name, b.site, ref, `Batch ${ref} annotated`);
  view.record_entry = e.seq;
  await remember(c, 200, view);
  return c.json(view);
});
api.post('/api/batches/:reference/custody', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role === 'auditor') return c.json({ error: 'auditor_read_only' }, 403);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  const b = await one(`select * from batch where reference = $1`, [ref]);
  if (!b) return c.json({ error: 'not_found' }, 404);
  const arrived = body.arrived_on || new Date().toISOString().slice(0, 10);
  const custody = [...(b.custody || []), { kind: body.kind, date: arrived, party: body.party || b.collector, late: true }];
  await q(`update batch set custody = $1, claimable_from = $2 where reference = $3`, [JSON.stringify(custody), arrived, ref]);
  const fresh = await one(`select * from batch where reference = $1`, [ref]);
  const view = await E.batchView(fresh);
  const e = await appendEntry('custody_late_document', p.email, p.name, b.site, ref, `Late custody document (${body.kind}) attached on ${arrived}; batch claimable from that date`);
  view.record_entry = e.seq;
  await remember(c, 201, view);
  return c.json(view, 201);
});
api.post('/api/batches/:reference/reject', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'plant_operator') return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  intOr422(body.rejected_g, 'rejected_g');
  const b = await one(`select * from batch where reference = $1`, [ref]);
  if (!b) return c.json({ error: 'not_found' }, 404);
  const accepted = b.net_g - body.rejected_g;
  if (accepted < 0) return c.json({ error: 'parts_do_not_sum' }, 409);
  await q(`update batch set rejected_g = $1, accepted_g = $2, rejected_destination = $3 where reference = $4`,
    [body.rejected_g, accepted, body.destination || null, ref]);
  const fresh = await one(`select * from batch where reference = $1`, [ref]);
  const view = await E.batchView(fresh);
  const e = await appendEntry('batch_rejected', p.email, p.name, b.site, ref, `Batch ${ref} rejected in part: ${body.rejected_g} g to ${body.destination || 'unstated'}; ${accepted} g accepted`);
  view.record_entry = e.seq;
  await remember(c, 201, view);
  return c.json(view, 201);
});
api.get('/api/batches/:reference/impact', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const t0 = Date.now();
  const out = await impactOfBatch(c.req.param('reference'));
  if (!out) return c.json({ error: 'not_found' }, 404);
  return c.json({ ...out, read_at: new Date().toISOString(), computed_ms: Date.now() - t0 });
});

// ---------- runs ----------
api.get('/api/runs', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const runs = await q(`select * from run order by started_at`);
  const out = [];
  for (const r of runs) {
    const recipe = await one(`select * from recipe where reference = $1`, [r.recipe_version]);
    const cons = await q(`select input_kind, input_ref, mass_g, effective_on from consumption where run_ref = $1`, [r.reference]);
    const outs = await q(`select reference, kind, mass_g, disposition, lot from output where run_ref = $1`, [r.reference]);
    out.push({ reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
      recipe_version: r.recipe_version, operator: r.operator, started_at: r.started_at, closed_at: r.closed_at,
      state: r.state, losses_g: r.losses_g, actual: r.actual, within_tolerance: r.within_tolerance,
      set_points: recipe ? recipe.set_points : null, tolerances: recipe ? recipe.tolerances : null,
      consumptions: cons, outputs: outs, stage_column: r.run_type });
  }
  return c.json(out);
});
api.get('/api/runs/:reference', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const r = await one(`select * from run where reference = $1`, [c.req.param('reference')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  const recipe = await one(`select * from recipe where reference = $1`, [r.recipe_version]);
  const cons = await q(`select input_kind, input_ref, mass_g, effective_on from consumption where run_ref = $1`, [r.reference]);
  const outs = await q(`select reference, kind, mass_g, disposition, lot from output where run_ref = $1`, [r.reference]);
  return c.json({ reference: r.reference, run_type: r.run_type, site: r.site, equipment: r.equipment,
    recipe_version: r.recipe_version, recipe_set_points: recipe?.set_points, recipe_tolerances: recipe?.tolerances,
    actual_set_points: r.actual, within_tolerance: r.within_tolerance, operator: r.operator,
    started_at: r.started_at, closed_at: r.closed_at, state: r.state,
    losses_g: r.losses_g, losses: r.losses_g == null ? null : { formula: 'mass in minus mass out', mass_in_g: cons.reduce((s,x)=>s+x.mass_g,0), mass_out_g: outs.reduce((s,x)=>s+x.mass_g,0) },
    consumptions: cons, outputs: outs });
});
api.post('/api/runs', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'plant_operator') return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  if (!['dissolution', 'depolymerisation', 'purification', 'repolymerisation'].includes(body.run_type)) return c.json({ error: 'run_type_invalid' }, 422);
  if (!body.site || !body.recipe_version) return c.json({ error: 'site_and_recipe_required' }, 422);
  const n = (await q(`select count(*)::int as n from run`))[0].n;
  const prefix = { dissolution: 'D', depolymerisation: 'Y', purification: 'U', repolymerisation: 'R' }[body.run_type];
  const ref = `RUN-${prefix}-${String(n + 1).padStart(4, '0')}`;
  await q(`insert into run(reference,run_type,site,equipment,recipe_version,operator,started_at,state) values ($1,$2,$3,$4,$5,$6,$7,'open')`,
    [ref, body.run_type, body.site, body.equipment || 'REACTOR-A', body.recipe_version, body.operator || p.email, new Date(body.started_at || Date.now())]);
  const e = await appendEntry('run_started', p.email, p.name, body.site, ref, `Run ${ref} opened (${body.run_type})`);
  const payload = { reference: ref, run_type: body.run_type, site: body.site, state: 'open', record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/runs/:reference/consumptions', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'plant_operator') return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  intOr422(body.mass_g, 'mass_g');
  const run = await one(`select * from run where reference = $1`, [ref]);
  if (!run) return c.json({ error: 'not_found' }, 404);
  if (run.state === 'closed') { await appendEntry('refused', p.email, p.name, run.site, ref, 'write refused on closed run'); return c.json({ error: 'run_closed' }, 409); }
  const effective = body.effective_on || new Date().toISOString().slice(0, 10);
  // late effective date inside a closed period opens a restatement instead
  const bp = await E.periodFor(run.site, 'N6', effective);
  if (bp && bp.state === 'closed') {
    const rest = await openRestatement(bp.id, `Consumption effective ${effective} falls in closed period ${bp.id}`, p);
    return c.json({ error: 'period_closed', restatement: rest.reference }, 409);
  }
  const rows = await q(`insert into consumption(run_ref,input_kind,input_ref,mass_g,effective_on,recorded_by) values ($1,$2,$3,$4,$5,$6) returning id`,
    [ref, body.input_kind || 'batch', body.input_ref, body.mass_g, effective, p.email]);
  // credits enter when a claimable batch is consumed
  if ((body.input_kind || 'batch') === 'batch') {
    const b = await one(`select * from batch where reference = $1`, [body.input_ref]);
    if (b && bp) {
      const eff = b.claimable_from || b.received_on;
      const ap = await E.approvalInForce(b.collector, b.claimable_from || b.received_on);
      const claimableNow = ap && (ap.state === 'approved' || ap.state === 'conditional');
      const cf = await E.conversionFactorFor(b.site, effective);
      if (cf) {
        const dry = U.dryMass(body.mass_g, b.moisture_bp);
        const credit = claimableNow ? U.creditGranted(dry, cf.factor_bp) : 0;
        await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,effective_on,event_at) values ($1,'in',$2,$3,$4,$5,null,$6,now())`,
          [bp.id, claimableNow ? b.category : 'non_claimable', credit, claimableNow ? 'consumption' : 'non_claimable_input', b.reference, effective]);
        if (!claimableNow && body.mass_g > 0)
          await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,effective_on,event_at) values ($1,'in','non_claimable',0,'non_claimable_input',$5,null,$6,now()) on conflict do nothing`, [bp.id, b.reference, effective]);
      }
    }
  }
  const e = await appendEntry('consumption_recorded', p.email, p.name, run.site, ref, `${body.mass_g} g of ${body.input_ref} consumed by ${ref}`);
  const payload = { reference: 'CONS-' + rows[0].id, run: ref, input_ref: body.input_ref, mass_g: body.mass_g, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/runs/:reference/outputs', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'plant_operator') return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  intOr422(body.mass_g, 'mass_g');
  const run = await one(`select * from run where reference = $1`, [ref]);
  if (!run) return c.json({ error: 'not_found' }, 404);
  if (run.state === 'closed') return c.json({ error: 'run_closed' }, 409);
  if (!['intermediate', 'lot', 'byproduct'].includes(body.kind)) return c.json({ error: 'kind_invalid' }, 422);
  if (body.kind === 'byproduct' && !['sold', 'disposed'].includes(body.disposition)) return c.json({ error: 'disposition_required' }, 422);
  const count = (await q(`select count(*)::int as n from output where run_ref = $1`, [ref]))[0].n;
  const oref = body.reference || `OUT-${ref.split('-')[1]}-${String(count + 1).padStart(4, '0')}`;
  let lotRef = null;
  if (body.kind === 'lot') {
    lotRef = body.reference;
    const lots = (await q(`select count(*)::int as n from lot`))[0].n;
    const want = lotRef || `LOT-N6-${String(lots + 1).padStart(4, '0')}`;
    await q(`insert into lot(reference,site,grade,mass_g,disposition,claim_type,produced_at,created_at) values ($1,$2,'N6',$3,'pending','controlled_blending',now(),now()) on conflict (reference) do nothing`,
      [want, run.site, body.mass_g]);
    lotRef = want;
  }
  await q(`insert into output(reference,run_ref,kind,mass_g,disposition,lot,recorded_by) values ($1,$2,$3,$4,$5,$6,$7)`,
    [body.kind === 'lot' ? lotRef : oref, ref, body.kind, body.mass_g, body.disposition || null, lotRef, p.email]);
  const e = await appendEntry('output_recorded', p.email, p.name, run.site, oref, `Output ${oref} of ${body.mass_g} g (${body.kind}) from ${ref}`);
  const payload = { reference: oref, run: ref, kind: body.kind, mass_g: body.mass_g, lot: lotRef, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/runs/:reference/close', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'plant_operator') return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const run = await one(`select * from run where reference = $1`, [ref]);
  if (!run) return c.json({ error: 'not_found' }, 404);
  if (run.state === 'closed') {
    await appendEntry('refused', p.email, p.name, run.site, ref, 'second close attempted on closed run');
    return c.json({ error: 'run_already_closed' }, 409);
  }
  const cons = await q(`select sum(mass_g)::int as m from consumption where run_ref = $1`, [ref]);
  const outs = await q(`select sum(mass_g)::int as m from output where run_ref = $1`, [ref]);
  const inM = cons[0].m || 0, outM = outs[0].m || 0;
  const losses = inM - outM;
  const recipe = await one(`select * from recipe where reference = $1`, [run.recipe_version]);
  let within = true;
  if (recipe && run.actual) {
    for (const [k, v] of Object.entries(recipe.tolerances)) {
      const a = run.actual[k];
      if (a !== undefined && Array.isArray(v) && (a < v[0] || a > v[1])) within = false;
    }
  }
  await q(`update run set state = 'closed', closed_at = now(), losses_g = $1, within_tolerance = $2 where reference = $3`, [losses, within, ref]);
  if (!within) {
    await q(`insert into deviation(reference,state,affects_runs,affects_lots,description,outcome,raised_on,raised_by) values ($1,'open',ARRAY[$2::text],'{}',$3,'none',current_date,$4)`,
      ['DEV-' + String(((await q(`select count(*)::int as n from deviation`))[0].n) + 1).padStart(4, '0'), ref, `Run ${ref} outside recipe tolerance`, p.email]);
  }
  const e = await appendEntry('run_closed', p.email, p.name, run.site, ref, `Run ${ref} closed, losses ${losses} g`);
  const payload = { reference: ref, state: 'closed', losses_g: losses, within_tolerance: within, mass_in_g: inM, mass_out_g: outM, record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});

// ---------- lots, tests, deviations, overrides ----------
api.get('/api/lots', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const rows = await q(`select * from lot order by reference`);
  const out = [];
  for (const l of rows) {
    const allocs = await q(`select category, mass_g from allocation where lot = $1 and state = 'committed'`, [l.reference]);
    const attached = allocs.reduce((s, a) => s + a.mass_g, 0);
    const split = {};
    for (const a of allocs) split[a.category] = (split[a.category] || 0) + a.mass_g;
    out.push({ reference: l.reference, site: l.site, grade: l.grade, mass_g: l.mass_g,
      disposition: l.disposition, claim_type: l.claim_type,
      content_bp: attached > 0 ? U.contentBp(attached, l.mass_g) : null,
      attached_claim_g: attached, category_split: split,
      content_derivation: attached > 0 ? { formula: 'credit_attached_g * 10000 / lot_mass_g, floored', attached_g: attached, lot_mass_g: l.mass_g } : null,
      flags: await E.lotFlags(l.reference) });
  }
  return c.json(out);
});
api.get('/api/lots/:reference', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const l = await one(`select * from lot where reference = $1`, [c.req.param('reference')]);
  if (!l) return c.json({ error: 'not_found' }, 404);
  const allocs = await q(`select category, mass_g, reference from allocation where lot = $1 and state = 'committed'`, [l.reference]);
  const attached = allocs.reduce((s, a) => s + a.mass_g, 0);
  const split = {};
  for (const a of allocs) split[a.category] = (split[a.category] || 0) + a.mass_g;
  const tests = await q(`select * from test_result where subject_ref = $1`, [l.reference]);
  const dev = await q(`select * from deviation where $1 = any(affects_lots)`, [l.reference]);
  const ovr = await q(`select * from override where lot = $1`, [l.reference]);
  return c.json({ reference: l.reference, site: l.site, grade: l.grade, mass_g: l.mass_g,
    disposition: l.disposition, claim_type: l.claim_type,
    content_bp: attached > 0 ? U.contentBp(attached, l.mass_g) : null, attached_claim_g: attached, category_split: split,
    content_derivation: attached > 0 ? { formula: 'credit_attached_g * 10000 / lot_mass_g, floored', attached_g: attached, lot_mass_g: l.mass_g } : null,
    flags: await E.lotFlags(l.reference), test_results: tests,
    deviations: dev.map((d) => ({ reference: d.reference, state: d.state, description: d.description, outcome: d.outcome })),
    overrides: ovr.map((o) => ({ reference: o.reference, separation: o.separation, reviewed: o.reviewed, authorised_by: o.authorised_by, authorised_on: o.authorised_on, reason: o.reason })) });
});
api.get('/api/lots/:reference/yield', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['plant_operator', 'lab_analyst', 'quality_manager', 'claims_manager'].includes(p.role))
    return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const l = await one(`select * from lot where reference = $1`, [ref]);
  if (!l) return c.json({ error: 'not_found' }, 404);
  const g = await genealogyOfLot(ref);
  const batchMass = g.nodes.filter((n) => n.kind === 'batch').reduce((s, n) => s + n.mass_g, 0);
  return c.json({ lot: ref, lot_mass_g: l.mass_g, input_mass_g: batchMass,
    yield_bp: batchMass > 0 ? U.shareBp(l.mass_g, batchMass) : null,
    derivation: { formula: 'lot_mass_g * 10000 / input_mass_g, floored', lot_mass_g: l.mass_g, input_mass_g: batchMass },
    note: 'A yield figure appears on no certificate and in no verification answer.' });
});
api.get('/api/lots/:reference/genealogy', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const g = await genealogyOfLot(c.req.param('reference'));
  if (!g) return c.json({ error: 'not_found' }, 404);
  return c.json({ ...g, read_at: new Date().toISOString() });
});
api.get('/api/lots/:reference/carbon', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const fig = await one(`select * from carbon_figure where lot = $1 and superseded_by is null order by version desc limit 1`, [c.req.param('reference')]);
  if (!fig) return c.json({ error: 'not_found' }, 404);
  const method = await one(`select * from carbon_method where id = $1 and version = $2`, [fig.method_id, fig.method_version]);
  const lot = await one(`select * from lot where reference = $1`, [fig.lot]);
  const bp = await one(`select * from balance_period where site = $1 and grade = $2 and period_from <= $3 and period_to >= $3`, [lot.site, lot.grade, new Date().toISOString().slice(0, 10)]);
  if (bp && method && method.allocation_basis !== bp.allocation_basis) {
    return c.json({ error: 'allocation_basis_mismatch', period_basis: bp.allocation_basis, method_basis: method.allocation_basis }, 409);
  }
  return c.json({
    lot: fig.lot, value_mg_per_kg: fig.value_mg_per_kg, boundary: fig.boundary, method_version: `${fig.method_id} v${fig.method_version}`,
    uncertainty_bp: fig.uncertainty_bp, primary_share_bp: fig.primary_share_bp, comparator: fig.comparator,
    breakdown: fig.breakdown, energy_location_mg_per_kg: fig.energy_location_mg_per_kg, energy_market_mg_per_kg: fig.energy_market_mg_per_kg,
    metered_kwh: fig.metered_kwh, retired_kwh: fig.retired_kwh, unmatched_kwh: fig.unmatched_kwh,
    default_led: fig.primary_share_bp < method.primary_share_threshold_bp, cache_valid: fig.cache_valid,
    comparator_note: fig.value_mg_per_kg < 4260000 ? 'lower than the EcoBase 2025 virgin PA6 comparator by name' : 'higher than the EcoBase 2025 virgin PA6 comparator',
    derivation: { formula: 'sum of breakdown lines', lines: fig.breakdown.length, computed_against: fig.computed_against },
  });
});
api.post('/api/test-results', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['lab_analyst', 'quality_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  if (!body.method) return c.json({ error: 'method_required' }, 422);
  intOr422(body.value, 'value'); intOr422(body.uncertainty_bp, 'uncertainty_bp');
  const subject = body.subject_ref || body.lot;
  const lotRow = await one(`select * from lot where reference = $1`, [subject]);
  let mismatch = false;
  if (lotRow) {
    const spec = await one(`select * from specification where grade = $1 order by version desc limit 1`, [lotRow.grade]);
    const row = spec?.rows?.find((r) => r.property === body.property);
    if (row && row.method !== body.method) mismatch = true;
  }
  const id = (await q(`insert into test_result(subject_kind,subject_ref,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [body.subject_kind || 'lot', subject, body.property, body.method, body.instrument || null, p.email, body.value, body.unit || 'ratio', body.uncertainty_bp, mismatch, !mismatch]))[0].id;
  const e = await appendEntry('test_result_recorded', p.email, p.name, lotRow?.site || null, subject, `Test result recorded on ${subject}: ${body.property} by ${body.method}`);
  const payload = { reference: 'TR-' + id, method_mismatch: mismatch, usable_for_release: !mismatch, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/lots/:reference/disposition', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  const lot = await one(`select * from lot where reference = $1`, [ref]);
  if (!lot) return c.json({ error: 'not_found' }, 404);
  if (p.role !== 'quality_manager') { await appendEntry('refused', p.email, p.name, lot.site, ref, 'disposition refused: caller is not a quality manager'); return c.json({ error: 'role_not_permitted' }, 403); }
  const entered = await one(`select 1 as x from test_result where subject_ref = $1 and analyst = $2 limit 1`, [ref, p.email]);
  if (entered) { await appendEntry('refused', p.email, p.name, lot.site, ref, 'disposition refused: quality manager entered a test result on this lot'); return c.json({ error: 'separation_analyst_not_dispositioner', override_required: true }, 409); }
  const openDev = await one(`select reference from deviation where state = 'open' and $1 = any(affects_lots)`, [ref]);
  if (openDev) { await appendEntry('refused', p.email, p.name, lot.site, ref, `disposition refused: deviation ${openDev.reference} is open`); return c.json({ error: 'open_deviation', deviation: openDev.reference }, 409); }
  if (!['pending', 'released', 'quarantined', 'rejected'].includes(body.disposition)) return c.json({ error: 'disposition_invalid' }, 422);
  await q(`update lot set disposition = $1, disposition_by = $2 where reference = $3`, [body.disposition, p.email, ref]);
  const e = await appendEntry('lot_dispositioned', p.email, p.name, lot.site, ref, `Lot ${ref} ${body.disposition}`);
  const payload = { reference: ref, disposition: body.disposition, record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});
api.post('/api/deviations', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['quality_manager', 'plant_operator'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  const n = (await q(`select count(*)::int as n from deviation`))[0].n;
  const ref = 'DEV-' + String(n + 1).padStart(4, '0');
  await q(`insert into deviation(reference,state,affects_runs,affects_lots,description,outcome,raised_on,raised_by) values ($1,'open',$2,$3,$4,'none',current_date,$5)`,
    [ref, body.runs || [], body.lots || [], body.description || 'Deviation raised', p.email]);
  const e = await appendEntry('deviation_raised', p.email, p.name, null, ref, `Deviation ${ref} raised`);
  await remember(c, 201, { reference: ref, state: 'open', record_entry: e.seq });
  return c.json({ reference: ref, state: 'open', record_entry: e.seq }, 201);
});
api.post('/api/deviations/:reference/close', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'quality_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  if (!['root_cause_found', 'cause_not_established'].includes(body.outcome)) return c.json({ error: 'outcome_invalid' }, 422);
  await q(`update deviation set state = 'closed', outcome = $1, closed_on = current_date where reference = $2`, [body.outcome, ref]);
  const e = await appendEntry('deviation_closed', p.email, p.name, null, ref, `Deviation ${ref} closed: ${body.outcome}`);
  await remember(c, 200, { reference: ref, state: 'closed', outcome: body.outcome, record_entry: e.seq });
  return c.json({ reference: ref, state: 'closed', outcome: body.outcome, record_entry: e.seq });
});
api.post('/api/overrides', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role === 'auditor') return c.json({ error: 'auditor_read_only' }, 403);
  const body = c.get('idemBody');
  if (!body.reason || body.reason.length < 40) return c.json({ error: 'reason_too_short', minimum_characters: 40 }, 422);
  if (!body.authorised_by) return c.json({ error: 'authoriser_required' }, 422);
  const n = (await q(`select count(*)::int as n from override`))[0].n;
  const ref = 'OVR-' + String(n + 1).padStart(4, '0');
  await q(`insert into override(reference,separation,reason,lot,authorised_by,authorised_on,reviewed) values ($1,$2,$3,$4,$5,current_date,false)`,
    [ref, body.separation, body.reason, body.lot, body.authorised_by]);
  const e = await appendEntry('override_recorded', p.email, p.name, null, ref, `Override ${ref} recorded: ${body.separation} on ${body.lot}, unreviewed`);
  await remember(c, 201, { reference: ref, reviewed: false, record_entry: e.seq });
  return c.json({ reference: ref, reviewed: false, record_entry: e.seq }, 201);
});
api.post('/api/overrides/:reference/review', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const ref = c.req.param('reference');
  const o = await one(`select * from override where reference = $1`, [ref]);
  if (!o) return c.json({ error: 'not_found' }, 404);
  if (o.authorised_by === p.email) return c.json({ error: 'authoriser_may_not_review' }, 403);
  if (!['quality_manager', 'claims_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  await q(`update override set reviewed = true, reviewed_by = $1, reviewed_on = current_date where reference = $2`, [p.email, ref]);
  const e = await appendEntry('override_reviewed', p.email, p.name, null, ref, `Override ${ref} reviewed`);
  await remember(c, 200, { reference: ref, reviewed: true, reviewed_by: p.email, record_entry: e.seq });
  return c.json({ reference: ref, reviewed: true, reviewed_by: p.email, record_entry: e.seq });
});

// ---------- balance periods, ledger, allocations ----------
async function periodView(bp) {
  const bal = await E.balanceOf(bp.id);
  const cfs = await q(`select * from conversion_factor where site = $1 order by published_on`, [bp.site]);
  const overrides = await q(`select count(*)::int as n from override o join lot l on l.reference = o.lot where l.site = $1`, [bp.site]);
  const restatements = await q(`select count(*)::int as n from restatement r where r.balance_period = $1 and r.state = 'open'`, [bp.id]);
  const findings = await q(`select count(*)::int as n from finding where state = 'open' and review_by < current_date`, []);
  const nonClaim = await q(`select coalesce(sum(mass_g),0)::int as m from credit_movement where balance_period = $1 and kind = 'non_claimable_input'`, [bp.id]);
  return {
    id: bp.id, site: bp.site, grade: bp.grade, period: { from: bp.period_from, to: bp.period_to },
    state: bp.state, carry_over_limit_bp: bp.carry_over_limit_bp, allocation_basis: bp.allocation_basis,
    post_consumer: { ...bal.categories.post_consumer, derivation: { formula: 'sum of credit movements in this category' } },
    pre_consumer: { ...bal.categories.pre_consumer, derivation: { formula: 'sum of credit movements in this category' } },
    categories: bal.categories,
    conversion_factors: cfs.map((f) => ({ reference: f.reference, factor_bp: f.factor_bp, provisional: f.provisional,
      derivation_window: { from: f.derived_from, to: f.derived_to, in_g: f.derived_in_g, out_g: f.derived_out_g },
      derivation: { formula: 'derived_out_g * 10000 / derived_in_g, floored' } })),
    override_count: overrides[0].n, open_restatement_count: restatements[0].n, open_finding_count: findings[0].n,
    non_claimable_input_g: nonClaim[0].m,
    closed_on: bp.closed_on, cut_off: bp.cut_off,
    carried_forward_g: bp.carried_forward_g, expired_g: bp.expired_g,
    read_at: new Date().toISOString(),
    movements: bal.movements.map((m) => ({ direction: m.direction, category: m.category, mass_g: m.mass_g, kind: m.kind, batch: m.batch, lot: m.lot, effective_on: m.effective_on, origin_site: m.origin_site, movement: m.movement_ref })),
  };
}
api.get('/api/balance-periods', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const rows = await q(`select * from balance_period order by id`);
  return c.json(await Promise.all(rows.map(periodView)));
});
api.get('/api/balance-periods/:id', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const bp = await one(`select * from balance_period where id = $1`, [c.req.param('id')]);
  if (!bp) return c.json({ error: 'not_found' }, 404);
  return c.json(await periodView(bp));
});
api.post('/api/balance-periods/:id/allocations', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'claims_manager') {
    await appendEntry('refused', p.email, p.name, c.req.param('id'), 'allocation', 'only a claims manager allocates claim');
    return c.json({ error: 'role_not_permitted' }, 403);
  }
  const id = c.req.param('id');
  const body = c.get('idemBody');
  intOr422(body.mass_g, 'mass_g');
  if (!['post_consumer', 'pre_consumer'].includes(body.category)) return c.json({ error: 'category_invalid' }, 422);
  const bp = await one(`select * from balance_period where id = $1`, [id]);
  if (!bp) return c.json({ error: 'not_found' }, 404);
  if (bp.state === 'closed') {
    await appendEntry('refused', p.email, p.name, id, 'allocation', 'allocation refused: period is closed');
    return c.json({ error: 'period_closed', rule: 'This period is closed. Corrections require a restatement.' }, 409);
  }
  const lot = await one(`select * from lot where reference = $1`, [body.lot]);
  if (!lot) return c.json({ error: 'lot_not_found' }, 404);
  // atomic: lock the period row, recompute available, refuse if the margin cannot carry it
  const result = await tx(async (x) => {
    await x(`select * from balance_period where id = $1 for update`, [id]);
    const movs = await x(`select direction, category, mass_g from credit_movement where balance_period = $1`, [id]);
    let inM = 0, outM = 0;
    for (const m of movs) { if (m.category !== body.category) continue; if (m.direction === 'in') inM += m.mass_g; else outM += m.mass_g; }
    const available = inM - outM;
    if (body.mass_g > available) return { refused: true, available_g: available, requested_g: body.mass_g };
    const n = (await x(`select count(*)::int as n from allocation`))[0].n;
    const ref = 'ALLOC-' + String(n + 1).padStart(4, '0');
    await x(`insert into allocation(reference,balance_period,lot,category,mass_g,allocated_by,decided_by,favoured_over,state,effective_on) values ($1,$2,$3,$4,$5,$6,$7,$8,'committed',current_date)`,
      [ref, id, body.lot, body.category, body.mass_g, p.email, body.decided_by || null, body.favoured_over || null]);
    await x(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,effective_on,event_at) values ($1,'out',$2,$3,'allocation',null,$4,current_date,now())`,
      [id, body.category, body.mass_g, body.lot]);
    return { refused: false, ref, available_after_g: available - body.mass_g };
  });
  if (result.refused) {
    await appendEntry('refused', p.email, p.name, id, 'allocation', `Allocation refused. Available: ${result.available_g} g. Requested: ${result.requested_g} g.`);
    await remember(c, 409, { error: 'insufficient_credits', available_g: result.available_g, requested_g: result.requested_g,
      message: `This allocation is refused. Available: ${result.available_g} g. Requested: ${result.requested_g} g.` });
    return c.json({ error: 'insufficient_credits', available_g: result.available_g, requested_g: result.requested_g,
      message: `This allocation is refused. Available: ${result.available_g} g. Requested: ${result.requested_g} g.` }, 409);
  }
  const e = await appendEntry('allocation_recorded', p.email, p.name, bp.site, result.ref, `${body.mass_g} g of ${body.category} claim attached to ${body.lot}`);
  const payload = { reference: result.ref, lot: body.lot, category: body.category, mass_g: body.mass_g,
    available_after_g: result.available_after_g, decided_by: body.decided_by || null, favoured_over: body.favoured_over || null, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/balance-periods/:id/transfers', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'claims_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const id = c.req.param('id');
  const body = c.get('idemBody');
  intOr422(body.mass_g, 'mass_g');
  const to = await one(`select * from balance_period where id = $1`, [id]);
  const from = await one(`select * from balance_period where id = $1`, [body.from_period]);
  if (!to || !from) return c.json({ error: 'not_found' }, 404);
  if (to.state === 'closed' || from.state === 'closed') return c.json({ error: 'period_closed' }, 409);
  const category = body.category || 'post_consumer';
  const result = await tx(async (x) => {
    const movs = await x(`select direction, category, mass_g from credit_movement where balance_period = $1`, [from.id]);
    let inM = 0, outM = 0;
    for (const m of movs) { if (m.category !== category) continue; if (m.direction === 'in') inM += m.mass_g; else outM += m.mass_g; }
    if (body.mass_g > inM - outM) return { refused: true, available_g: inM - outM };
    const n = (await x(`select count(*)::int as n from transfer`))[0].n;
    const ref = 'TRF-' + String(n + 1).padStart(4, '0');
    await x(`insert into transfer(reference,from_period,to_period,mass_g,category,moved_on) values ($1,$2,$3,$4,$5,current_date)`, [ref, from.id, to.id, body.mass_g, category]);
    await x(`insert into credit_movement(balance_period,direction,category,mass_g,kind,origin_site,movement_ref,effective_on,event_at) values ($1,'out',$2,$3,'transfer_out',$4,$5,current_date,now())`, [from.id, category, body.mass_g, from.site, ref]);
    await x(`insert into credit_movement(balance_period,direction,category,mass_g,kind,origin_site,movement_ref,effective_on,event_at) values ($1,'in',$2,$3,'transfer_in',$4,$5,current_date,now())`, [to.id, category, body.mass_g, from.site, ref]);
    return { refused: false, ref };
  });
  if (result.refused) return c.json({ error: 'insufficient_credits', available_g: result.available_g, requested_g: body.mass_g }, 409);
  const e = await appendEntry('transfer_recorded', p.email, p.name, to.site, result.ref, `${body.mass_g} g moved from ${from.id} to ${to.id}, never a fresh credit`);
  const inbound = await q(`select reference, mass_g, origin_site, movement_ref, kind from credit_movement where balance_period = $1 and kind = 'transfer_in'`, [id]);
  const payload = { reference: result.ref, inbound_credits: inbound.map((i) => ({ reference: i.movement_ref, mass_g: i.mass_g, origin_site: i.origin_site, movement: i.movement_ref, fresh_credit: false })), record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});

// ---------- close, restatements, conversion factors ----------
api.post('/api/balance-periods/:id/close', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'claims_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const id = c.req.param('id');
  const bp = await one(`select * from balance_period where id = $1`, [id]);
  if (!bp) return c.json({ error: 'not_found' }, 404);
  if (bp.state === 'closed') {
    await appendEntry('refused', p.email, p.name, id, 'period_close', 'second close refused; a closed period refuses to reopen');
    return c.json({ error: 'period_already_closed', rule: 'This period is closed. Corrections require a restatement.' }, 409);
  }
  // separation: the publisher of the carbon method version the period applies may not close it
  const method = await one(`select * from carbon_method where id = 'CM-PA6' order by version desc limit 1`);
  if (method && method.published_by === p.email) {
    await appendEntry('refused', p.email, p.name, id, 'period_close', 'refused: the publisher of the carbon method version may not close the period applying it');
    return c.json({ error: 'separation_method_publisher_not_closer' }, 403);
  }
  const lotsNoDisp = await q(`select l.reference from allocation a join lot l on l.reference = a.lot where a.balance_period = $1 and l.disposition = 'pending'`, [id]);
  if (lotsNoDisp.length) {
    await appendEntry('refused', p.email, p.name, id, 'period_close', 'refused: lots without disposition');
    return c.json({ error: 'lot_without_disposition', lots: lotsNoDisp.map((l) => l.reference) }, 409);
  }
  const openDevs = await q(`select distinct d.reference from deviation d join allocation a on a.lot = any(d.affects_lots) where a.balance_period = $1 and d.state = 'open'`, [id]);
  if (openDevs.length) {
    await appendEntry('refused', p.email, p.name, id, 'period_close', 'refused: open deviation');
    return c.json({ error: 'open_deviation', deviations: openDevs.map((d) => d.reference) }, 409);
  }
  // settle carry-over
  const bal = await E.balanceOf(id);
  const carried = {}, expired = {};
  for (const cat of ['post_consumer', 'pre_consumer']) {
    const avail = bal.categories[cat].credits_available_g;
    const limit = Math.floor((bal.categories[cat].credits_in_g * bp.carry_over_limit_bp) / 10000);
    carried[cat] = Math.min(avail, Math.max(limit, 0));
    expired[cat] = avail - carried[cat];
  }
  const cutOff = new Date(); cutOff.setDate(cutOff.getDate() - 5);
  await q(`update balance_period set state = 'closed', closed_on = current_date, cut_off = $2, carried_forward_g = $3, expired_g = $4 where id = $1`,
    [id, cutOff.toISOString().slice(0, 10), JSON.stringify(carried), JSON.stringify(expired)]);
  const e = await appendEntry('balance_period_closed', p.email, p.name, bp.site, id,
    `Period ${id} closed; carried forward ${carried.post_consumer + carried.pre_consumer} g, expired ${expired.post_consumer + expired.pre_consumer} g`);
  const payload = { reference: id, state: 'closed', closed_on: new Date().toISOString().slice(0, 10),
    cut_off: cutOff.toISOString().slice(0, 10), carried_forward_g: carried, expired_g: expired, record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});

async function openRestatement(periodId, reason, p) {
  const n = (await q(`select count(*)::int as n from restatement`))[0].n;
  const ref = 'REST-' + String(n + 1).padStart(4, '0');
  const certs = await q(`select * from certificate where period = $1 order by signed_at`, [periodId]);
  await q(`insert into restatement(reference,balance_period,reason,opened_by,opened_on,state,certificates) values ($1,$2,$3,$4,current_date,'open',$5)`,
    [ref, periodId, reason, p.email, JSON.stringify(certs.map((x) => x.number))]);
  const e = await appendEntry('restatement_opened', p.email, p.name, null, ref, `Restatement ${ref} opened on ${periodId}: ${reason}`);
  return { reference: ref, certificates: certs.map((x) => x.number), record_entry: e.seq };
}
api.post('/api/balance-periods/:id/restatements', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'claims_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const id = c.req.param('id');
  const body = c.get('idemBody');
  const bp = await one(`select * from balance_period where id = $1`, [id]);
  if (!bp) return c.json({ error: 'not_found' }, 404);
  let payload = await openRestatement(id, body.reason || 'restatement', p);
  if (body.new_factor_bp) {
    const certs = await q(`select * from certificate where period = $1 order by signed_at`, [id]);
    const movements = [];
    for (const cert of certs) {
      const lotRefs = (cert.lots || []).map((l) => l.reference);
      let mass = 0;
      for (const lr of lotRefs) { const l = await one(`select mass_g from lot where reference = $1`, [lr]); if (l) mass += l.mass_g; }
      const attached = Object.values(cert.category_split || {}).reduce((s, v) => s + v, 0);
      const corrected = mass > 0 ? Math.floor((attached * body.new_factor_bp) / (body.factor_bp || 8000) * 10000 / 10000) : 0;
      movements.push({ certificate: cert.number, content_bp: cert.content_bp, corrected_content_bp: mass > 0 ? Math.floor((attached * body.new_factor_bp) / 8000 * 10000 / mass) : 0 });
    }
    await q(`update restatement set factor_revised = $2, old_factor_bp = $3, new_factor_bp = $4, content_movements = $5 where reference = $1`,
      [payload.reference, body.factor_reference || null, body.factor_bp || null, body.new_factor_bp, JSON.stringify(movements)]);
    payload.content_movements = movements;
  }
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/restatements/:reference/resolutions', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['claims_manager', 'certificate_signer'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  const r = await one(`select * from restatement where reference = $1`, [ref]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (!['reissued', 'withdrawn', 'unaffected'].includes(body.outcome)) return c.json({ error: 'outcome_invalid' }, 422);
  const dup = await one(`select 1 as x from restatement where reference = $1 and resolutions @> $2::jsonb`, [ref, JSON.stringify([{ certificate: body.certificate }])]);
  if (dup) return c.json({ error: 'already_resolved' }, 409);
  const affected = (r.certificates || []).includes(body.certificate);
  if (!affected) return c.json({ error: 'certificate_not_in_restatement' }, 422);
  const resolutions = [...(r.resolutions || []), { certificate: body.certificate, outcome: body.outcome, reason: body.reason || '', resolved_by: p.email }];
  await q(`update restatement set resolutions = $2 where reference = $1`, [ref, JSON.stringify(resolutions)]);
  const e = await appendEntry('restatement_resolved', p.email, p.name, null, ref, `Certificate ${body.certificate} resolved as ${body.outcome}`);
  const payload = { reference: ref, certificate: body.certificate, outcome: body.outcome, reason: body.reason, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});

api.post('/api/conversion-factors', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'claims_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  intOr422(body.factor_bp, 'factor_bp'); intOr422(body.derived_in_g, 'derived_in_g'); intOr422(body.derived_out_g, 'derived_out_g');
  const provisional = body.derived_in_g === 0;
  if (!provisional) {
    const expect = U.factorBp(body.derived_out_g, body.derived_in_g);
    if (expect !== body.factor_bp) {
      await appendEntry('refused', p.email, p.name, body.site, 'conversion_factor', `factor refused: ${body.factor_bp} bp does not reconcile with ${body.derived_out_g} out of ${body.derived_in_g} in`);
      return c.json({ error: 'factor_does_not_reconcile', expected_bp: expect, provided_bp: body.factor_bp,
        rule: 'factor_bp equals derived_out_g * 10000 / derived_in_g, floored' }, 409);
    }
  }
  const n = (await q(`select count(*)::int as n from conversion_factor`))[0].n;
  const ref = `CF-${(body.site || 'SITE').replace('SITE-', '')}-${n + 1}`;
  await q(`insert into conversion_factor(reference,site,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_by,published_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,current_date)`,
    [ref, body.site, body.factor_bp, body.derived_from || null, body.derived_to || null, body.derived_in_g, body.derived_out_g, provisional, p.email]);
  const e = await appendEntry('conversion_factor_published', p.email, p.name, body.site, ref, `Factor ${ref} published at ${body.factor_bp} bp${provisional ? ' provisional' : ''}`);
  const payload = { reference: ref, factor_bp: body.factor_bp, provisional, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});

// ---------- carbon ----------
api.get('/api/carbon-methods', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from carbon_method order by id, version`);
  return c.json(rows.map(methodView));
});
function methodView(m) {
  return { id: m.id, version: m.version, standard: m.standard, functional_unit: m.functional_unit, boundary: m.boundary,
    allocation_basis: m.allocation_basis, reviewer: m.reviewer, published_on: m.published_on,
    data_quality: m.data_quality, emission_factors: m.emission_factors, superseded_by: m.superseded_by };
}
api.get('/api/carbon-methods/:id/versions/:version', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const m = await one(`select * from carbon_method where id = $1 and version = $2`, [c.req.param('id'), Number(c.req.param('version'))]);
  if (!m) return c.json({ error: 'not_found' }, 404);
  return c.json(methodView(m));
});
api.post('/api/carbon-methods', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'quality_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  const id = body.id || 'CM-PA6';
  const latest = await one(`select * from carbon_method where id = $1 order by version desc limit 1`, [id]);
  const version = (latest ? latest.version : 0) + 1;
  if (latest) {
    const inUse = await one(`select 1 as x from carbon_figure where method_id = $1 and method_version = $2 limit 1`, [id, latest.version]);
    if (inUse) await q(`update carbon_method set superseded_by = $2 where id = $1 and version = $3`, [id, version, latest.version]);
    // figures computed against the old version keep cache_valid, but are never silently recomputed
    await q(`update carbon_figure set cache_valid = false where method_id = $1 and method_version = $2 and superseded_by is null`, [id, latest.version]);
  }
  await q(`insert into carbon_method(id,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,data_quality,emission_factors,primary_share_threshold_bp,published_by) values ($1,$2,$3,$4,$5,$6,$7,current_date,$8,$9,$10,$11)`,
    [id, version, body.standard || 'ISO 14067', body.functional_unit || '1 kg of pellet', body.boundary || 'cradle-to-gate', body.allocation_basis || 'mass',
     body.reviewer || 'Ilse Grootveld', JSON.stringify(body.data_quality || { primary_share_threshold_bp: 5000 }), JSON.stringify(body.emission_factors || []),
     body.primary_share_threshold_bp || 5000, p.email]);
  const e = await appendEntry('carbon_method_published', p.email, p.name, null, id, `${id} version ${version} published`);
  const payload = { reference: `${id} v${version}`, id, version, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/carbon-figures/:id/recompute', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['quality_manager', 'claims_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const id = c.req.param('id');
  const fig = await one(`select * from carbon_figure where id = $1 order by version desc limit 1`, [id]);
  if (!fig) return c.json({ error: 'not_found' }, 404);
  const lot = await one(`select * from lot where reference = $1`, [fig.lot]);
  const bp = await E.periodFor(lot.site, lot.grade, new Date().toISOString().slice(0, 10));
  if (bp && bp.state === 'closed') {
    const open = await one(`select 1 as x from restatement where balance_period = $1 and state = 'open'`, [bp.id]);
    if (!open) return c.json({ error: 'restatement_required' }, 409);
  }
  const certs = await q(`select number from certificate where carbon_figure = fig.id or (lots::text like '%' || $1 || '%')`, [fig.lot]);
  const newId = fig.id + '-R' + (fig.version + 1);
  const sum = (fig.breakdown || []).reduce((s, l) => s + l.mg_per_kg, 0);
  await q(`insert into carbon_figure(id,lot,version,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,boundary,comparator,breakdown,energy_location_mg_per_kg,energy_market_mg_per_kg,metered_kwh,retired_kwh,unmatched_kwh,cache_valid,computed_against,recomputed_by,recomputed_on,recomputed_reason)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18,current_date,$19)`,
    [newId, fig.lot, fig.version + 1, fig.method_id, fig.method_version, sum, fig.uncertainty_bp, fig.primary_share_bp, fig.boundary,
     JSON.stringify(fig.comparator), JSON.stringify(fig.breakdown), fig.energy_location_mg_per_kg, fig.energy_market_mg_per_kg,
     fig.metered_kwh, fig.retired_kwh, fig.unmatched_kwh, JSON.stringify(fig.computed_against), p.email, c.get('idemBody').reason || 'recomputation']);
  await q(`update carbon_figure set superseded_by = $2 where id = $1 and version = $3`, [fig.id, newId, fig.version]);
  const e = await appendEntry('carbon_figure_recomputed', p.email, p.name, lot.site, newId, `Figure ${newId} produced alongside ${fig.id}; certificates carrying the superseded figure enumerated`);
  const payload = { reference: newId, superseded: fig.id, certificates_carrying_superseded: certs.map((x) => x.number), record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/energy-instruments/:reference/retire', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'claims_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  const inst = await one(`select * from energy_instrument where reference = $1`, [ref]);
  if (!inst) return c.json({ error: 'not_found' }, 404);
  if (inst.state === 'held') {
    await appendEntry('refused', p.email, p.name, null, ref, 'retirement refused: instrument is held, not retired');
    return c.json({ error: 'instrument_not_retired' }, 409);
  }
  const bp = await one(`select * from balance_period where id = $1`, [body.period]);
  if (!bp) return c.json({ error: 'not_found' }, 404);
  const lot = await one(`select l.* from lot l where l.site = $1 limit 1`, [bp.site]);
  const fig = await one(`select * from carbon_figure where lot = $1 and superseded_by is null order by version desc limit 1`, [lot?.reference]);
  const metered = fig ? fig.metered_kwh : 0;
  const retiredSoFar = (await q(`select coalesce(sum(quantity_kwh),0)::int as s from energy_instrument where applied_period = $1`, [body.period]))[0].s;
  if (body.vintage && String(body.vintage) !== inst.vintage) {
    await appendEntry('refused', p.email, p.name, null, ref, `retirement refused: vintage ${inst.vintage} does not match consumption`);
    return c.json({ error: 'vintage_mismatch' }, 409);
  }
  if (body.region && body.region !== inst.region) {
    await appendEntry('refused', p.email, p.name, null, ref, `retirement refused: region ${inst.region} does not match consumption`);
    return c.json({ error: 'region_mismatch' }, 409);
  }
  if (retiredSoFar + inst.quantity_kwh > metered) {
    await appendEntry('refused', p.email, p.name, null, ref, `retirement refused: retired quantity would exceed metered consumption`);
    return c.json({ error: 'exceeds_metered' }, 409);
  }
  await q(`update energy_instrument set state = 'retired', applied_period = $2 where reference = $1`, [ref, body.period]);
  const e = await appendEntry('energy_instrument_retired', p.email, p.name, bp.site, ref, `${inst.quantity_kwh} kWh retired against ${body.period}`);
  const payload = { reference: ref, state: 'retired', applied_period: body.period, unmatched_kwh: metered - retiredSoFar - inst.quantity_kwh, record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});

// ---------- blends ----------
api.post('/api/lots/:reference/blend', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['plant_operator', 'quality_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  const a = await one(`select * from lot where reference = $1`, [c.req.param('reference')]);
  const b = await one(`select * from lot where reference = $1`, [body.with_lot]);
  if (!a || !b) return c.json({ error: 'not_found' }, 404);
  const contentOf = async (l) => { const al = await q(`select sum(mass_g)::int as m from allocation where lot = $1`, [l.reference]); return (al[0].m || 0) / l.mass_g * 10000; };
  const ca = Math.floor(await contentOf(a)), cb = Math.floor(await contentOf(b));
  const blended = U.blendContent(a.mass_g, ca, b.mass_g, cb);
  const weakType = [a.claim_type, b.claim_type].sort()[0];
  const lots = (await q(`select count(*)::int as n from lot`))[0].n;
  const newRef = `LOT-${a.grade}-${String(lots + 1).padStart(4, '0')}`;
  const factorA = await E.conversionFactorFor(a.site, new Date().toISOString().slice(0, 10));
  const factorB = await E.conversionFactorFor(b.site, new Date().toISOString().slice(0, 10));
  const provisional = (factorA && factorA.provisional) || (factorB && factorB.provisional);
  await q(`insert into lot(reference,site,grade,mass_g,disposition,claim_type,produced_at,created_at) values ($1,$2,$3,$4,'pending',$5,now(),now())`,
    [newRef, a.site, a.grade, a.mass_g + b.mass_g, weakType]);
  const e = await appendEntry('lot_blended', p.email, p.name, a.site, newRef, `Lot ${newRef} blended from ${a.reference} and ${b.reference} at ${blended} bp`);
  const payload = { reference: newRef, mass_g: a.mass_g + b.mass_g, content_bp: blended, claim_type: weakType,
    sites: a.site === b.site ? [a.site] : [a.site, b.site], provisional_factor: !!provisional,
    derivation: { formula: '(mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored', mass_a: a.mass_g, content_a: ca, mass_b: b.mass_g, content_b: cb },
    record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});

// ---------- certificates ----------
api.get('/api/certificates', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const rows = await q(`select * from certificate order by signed_at`);
  return c.json(rows.map(certView));
});
function certView(x) {
  return { number: x.number, version: x.version, site: x.site, lots: x.lots, grade: x.grade, recipient: x.recipient,
    recipient_name: x.recipient_name, claim_type: x.claim_type, content_bp: x.content_bp, category_split: x.category_split,
    period: x.period, carbon: x.carbon_figure, primary_share_bp: x.primary_share_bp, scheme: x.scheme,
    registration: x.registration, specification_version: x.specification_version, test_results: x.test_results,
    permitted_statement: x.permitted_statement, prohibited_statement: x.prohibited_statement,
    signer: x.signer, signed_at: x.signed_at, signed_on: x.signed_on, verification_url: x.verification_url,
    state: x.state, withdrawal: x.withdrawal, provisional_factor: x.provisional_factor,
    conditions: x.conditions, input_versions: x.input_versions, derived_certificates: x.derived_certificates };
}
api.get('/api/certificates/:number', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const x = await one(`select * from certificate where number = $1 order by version desc limit 1`, [c.req.param('number')]);
  if (!x) return c.json({ error: 'not_found' }, 404);
  return c.json(certView(x));
});
api.post('/api/certificates/preview', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'certificate_signer') return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody') || {};
  const lot = await one(`select * from lot where reference = $1`, [body.lot]);
  if (!lot) return c.json({ error: 'lot_not_found' }, 404);
  const bp = await one(`select * from balance_period where site = $1 and grade = $2 order by period_to desc limit 1`, [lot.site, lot.grade]);
  const conditions = await eightConditions({ lotRef: body.lot, signer: p, period: bp?.id, allocationMass: body.mass_g, category: body.category });
  await remember(c, 200, { lot: body.lot, recipient: body.recipient, conditions });
  return c.json({ lot: body.lot, recipient: body.recipient, conditions });
});
api.post('/api/certificates', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'certificate_signer') return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  // re-authentication: the signing act carries the password again
  const kc = await keycloakLogin(p.email, body.password || '');
  if (!kc) {
    await appendEntry('refused', p.email, p.name, null, 'certificate', 'signing refused: session alone is not a signing credential');
    return c.json({ error: 'reauthentication_required' }, 401);
  }
  const lot = await one(`select * from lot where reference = $1`, [body.lot]);
  if (!lot) return c.json({ error: 'lot_not_found' }, 404);
  const recipient = await one(`select * from customer where reference = $1`, [body.recipient]);
  if (!recipient) return c.json({ error: 'recipient_not_found' }, 404);
  if (!(p.sites || []).includes(lot.site)) {
    await appendEntry('refused', p.email, p.name, lot.site, 'certificate', `signing refused: signer holds no scope for ${lot.site}`);
    return c.json({ error: 'site_out_of_scope', site: lot.site, scope: p.sites }, 403);
  }
  const period = await one(`select * from balance_period where site = $1 and grade = $2 order by period_to desc limit 1`, [lot.site, lot.grade]);
  const conditions = await eightConditions({ lotRef: lot.reference, signer: p, period: period?.id, allocationMass: body.mass_g, category: body.category });
  const failing = conditions.find((x) => !x.satisfied);
  if (failing) {
    await appendEntry('refused', p.email, p.name, lot.site, 'certificate', `signing refused: condition ${failing.condition} does not hold`);
    await remember(c, 409, { error: 'condition_not_satisfied', condition: failing.condition, blocking_reference: failing.blocking_reference, conditions });
    return c.json({ error: 'condition_not_satisfied', condition: failing.condition, blocking_reference: failing.blocking_reference, conditions }, 409);
  }
  const allocs = await q(`select category, mass_g from allocation where lot = $1 and state = 'committed'`, [lot.reference]);
  const attached = allocs.reduce((s, a) => s + a.mass_g, 0);
  const split = {};
  for (const a of allocs) split[a.category] = (split[a.category] || 0) + a.mass_g;
  const content = attached > 0 ? U.contentBp(attached, lot.mass_g) : 0;
  const stmts = E.statementFor(lot.claim_type, content, split, recipient.language);
  const seq = (await q(`select count(*)::int as n from certificate where site = $1`, [lot.site]))[0].n + 1;
  const number = E.certificateNumber(lot.site, seq);
  const fig = await one(`select * from carbon_figure where lot = $1 and superseded_by is null order by version desc limit 1`, [lot.reference]);
  const cf = await E.conversionFactorFor(lot.site, new Date().toISOString().slice(0, 10));
  const tests = await q(`select property, method, value, unit from test_result where subject_ref = $1`, [lot.reference]);
  await q(`insert into certificate(number,version,site,grade,lots,recipient,recipient_name,claim_type,content_bp,category_split,period,carbon_figure,primary_share_bp,scheme,registration,specification_version,test_results,permitted_statement,prohibited_statement,signer,signed_on,signed_at,verification_url,state,conditions,provisional_factor,input_versions)
    values ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'RCS-2026','REG-RAVEL-0042',3,$13,$14,$15,$16,current_date,now(),$17,'issued',$18,$19,$20)`,
    [number, lot.site, lot.grade, JSON.stringify([{ reference: lot.reference, mass_g: lot.mass_g }]), recipient.reference, recipient.party,
     lot.claim_type, content, JSON.stringify(split), period?.id, fig?.id || null, fig?.primary_share_bp || null,
     JSON.stringify(tests), stmts.permitted, stmts.prohibited, p.email, `https://ravel.example.com/verify/${number}`,
     JSON.stringify(conditions), !!(cf && cf.provisional), JSON.stringify({ conversion_factor: cf?.reference, specification: 'SPEC-N6 v3', carbon_method: fig ? `${fig.method_id} v${fig.method_version}` : 'none' })]);
  await q(`insert into signoff_log(number,reauthenticated,at) values ($1,true,now())`, [number]);
  const e = await appendEntry('certificate_signed', p.email, p.name, lot.site, number, `Certificate ${number} signed for ${recipient.party}`);
  try {
    await sendMail(recipient.contact_email, `Certificate ${number} issued`,
      `Certificate ${number} issued.\n\nClaim type: ${lot.claim_type}\nRecycled content: ${(content / 100).toFixed(2)} per cent\n\nPermitted statement:\n${stmts.permitted}\n\nProhibited statement:\n${stmts.prohibited}\n\nVerify this certificate at ravel.example.com/verify/${number}.`);
  } catch (m) { console.error('mail failed', m.message); }
  const payload = certView(await one(`select * from certificate where number = $1`, [number]));
  payload.record_entry = e.seq;
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/certificates/:number/withdraw', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'certificate_signer') return c.json({ error: 'role_not_permitted' }, 403);
  const number = c.req.param('number');
  const body = c.get('idemBody');
  const cert = await one(`select * from certificate where number = $1`, [number]);
  if (!cert) return c.json({ error: 'not_found' }, 404);
  if (!(p.sites || []).includes(cert.site)) return c.json({ error: 'site_out_of_scope' }, 403);
  // reverse traversal of the underlying batches
  const traversal = [];
  for (const l of cert.lots || []) {
    const impact = await impactOfBatch;
    traversal.push(l.reference);
  }
  const batchTraversal = [];
  for (const l of cert.lots || []) {
    const g = await genealogyOfLot(l.reference);
    for (const n of g.nodes.filter((n) => n.kind === 'batch')) batchTraversal.push(n.reference);
  }
  // certificates touching the same batches
  const touching = new Set();
  for (const bref of new Set(batchTraversal)) {
    const impact = await impactOfBatch(bref);
    for (const cert2 of impact.certificates) if (cert2.number !== number) touching.add(cert2.number);
  }
  const derived = await q(`select number from certificate where derived_certificates @> $1::text[]`, [[number]]);
  const voidStatements = [cert.permitted_statement, cert.prohibited_statement];
  const withdrawal = { reason: body.reason, withdrawn_by: p.email, withdrawn_on: new Date().toISOString().slice(0, 10),
    notified_recipients: [cert.recipient], void_statements: voidStatements, derived_certificates: derived.map((d) => d.number) };
  await q(`update certificate set state = 'withdrawn', withdrawal = $2, derived_certificates = $3 where number = $1`,
    [number, JSON.stringify(withdrawal), derived.map((d) => d.number)]);
  const cust = await one(`select * from customer where reference = $1`, [cert.recipient]);
  try {
    await sendMail(cust?.contact_email || 'unknown@example.com', `Certificate ${number} withdrawn`,
      `Certificate ${number} withdrawn.\n\nReason: ${body.reason}\n\nEvery statement now void:\n${voidStatements.map((s) => '- ' + s).join('\n')}\n\nThis certificate was withdrawn on ${withdrawal.withdrawn_on}. Reason: ${body.reason}.\nThe document remains readable at its address.`);
  } catch (m) { console.error('mail failed', m.message); }
  const e = await appendEntry('certificate_withdrawn', p.email, p.name, cert.site, number, `Certificate ${number} withdrawn: ${body.reason}`);
  const payload = { number, state: 'withdrawn', reason: body.reason, withdrawn_by: p.email, withdrawn_on: withdrawal.withdrawn_on,
    notified_recipients: withdrawal.notified_recipients.map((r) => ({ reference: r, name: cust?.party || r })),
    void_statements: voidStatements, derived_certificates: derived.map((d) => d.number),
    batch_traversal: [...new Set(batchTraversal)], certificates_touching_batches: [...touching], record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});
api.get('/api/certificates/:number/document', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const x = await one(`select * from certificate where number = $1 order by version desc limit 1`, [c.req.param('number')]);
  if (!x) return c.json({ error: 'not_found' }, 404);
  const lines = [];
  lines.push(`RAVEL MATERIALS - RECYCLED CONTENT CERTIFICATE`);
  lines.push(``);
  lines.push(`Certificate number: ${x.number}`);
  lines.push(`Version: ${x.version}`);
  lines.push(`Site: ${x.site}`);
  lines.push(`Grade: ${x.grade}`);
  lines.push(`Scheme: ${x.scheme}`);
  lines.push(`Registration: ${x.registration}`);
  lines.push(``);
  lines.push(`LOTS`);
  for (const l of x.lots) lines.push(`  ${l.reference}  ${l.mass_g} g`);
  lines.push(``);
  lines.push(`CLAIM`);
  lines.push(`  Claim type: ${x.claim_type}`);
  lines.push(`  Recycled content: ${(x.content_bp / 100).toFixed(2)} per cent`);
  for (const [k, v] of Object.entries(x.category_split || {})) if (v > 0) lines.push(`  ${k.replace('_', ' ')}: ${(Math.floor((v * 10000) / (Object.values(x.category_split).reduce((s, n) => s + n, 0) || 1)) / 100).toFixed(2)} per cent`);
  lines.push(``);
  lines.push(`CARBON`);
  if (x.carbon_figure) {
    const fig = await one(`select * from carbon_figure where id = $1`, [x.carbon_figure]);
    if (fig) {
      lines.push(`  Value: ${fig.value_mg_per_kg} mg CO2e per kg`);
      lines.push(`  Boundary: ${fig.boundary}`);
      lines.push(`  Method version: ${fig.method_id} v${fig.method_version}`);
      lines.push(`  Uncertainty: ${fig.uncertainty_bp} basis points`);
      lines.push(`  Primary share: ${fig.primary_share_bp} basis points`);
      lines.push(`  Comparator: ${fig.comparator.material} (${fig.comparator.dataset}, ${fig.comparator.dataset_year}, ${fig.comparator.region})`);
      lines.push(`  Breakdown attached:`);
      for (const l of fig.breakdown) lines.push(`    ${l.line}: ${l.mg_per_kg} mg/kg (${l.tag})`);
    }
  } else { lines.push(`  No carbon figure attached to this certificate.`); }
  lines.push(``);
  lines.push(`PERMITTED STATEMENT`);
  lines.push(`  ${x.permitted_statement}`);
  lines.push(``);
  lines.push(`PROHIBITED STATEMENT`);
  lines.push(`  ${x.prohibited_statement}`);
  lines.push(``);
  lines.push(`SPECIFICATION`);
  lines.push(`  SPEC-${x.grade} version ${x.specification_version}`);
  lines.push(``);
  lines.push(`TEST RESULTS`);
  for (const t of x.test_results) lines.push(`  ${t.property} by ${t.method}: ${t.value} ${t.unit}`);
  lines.push(``);
  lines.push(`SIGNATURE`);
  lines.push(`  Signer: ${x.signer}`);
  lines.push(`  Signed on: ${x.signed_on}`);
  lines.push(``);
  lines.push(`This material is claimed by mass balance. It is not physically segregated.`);
  if (x.provisional_factor) lines.push(`This certificate rests on a provisional conversion factor.`);
  lines.push(``);
  lines.push(`Verify this certificate at ravel.example.com/verify/${x.number}.`);
  if (x.state === 'withdrawn') {
    lines.push(``);
    lines.push(`WITHDRAWN`);
    lines.push(`This certificate was withdrawn on ${x.withdrawal?.withdrawn_on}. Reason: ${x.withdrawal?.reason}.`);
  }
  const text = lines.join('\n');
  return c.body(text, 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' });
});

// ---------- verify (public, rate limited) ----------
const verifyHits = new Map();
api.get('/api/verify/:number', async (c) => {
  const ip = 'anon';
  const now = Date.now();
  const window = (verifyHits.get(ip) || []).filter((t) => now - t < 60000);
  if (window.length > 60) return c.json({ error: 'rate_limited' }, 429);
  window.push(now); verifyHits.set(ip, window);
  const x = await one(`select * from certificate where number = $1 order by version desc limit 1`, [c.req.param('number')]);
  if (!x) return c.json({ found: false, number: c.req.param('number') });
  return c.json({ found: true, number: x.number, state: x.state, issued_on: x.signed_on,
    withdrawn_on: x.withdrawal?.withdrawn_on || null, withdrawal_reason: x.withdrawal?.reason || null,
    site: x.site, grade: x.grade, claim_type: x.claim_type, recipient_name: x.recipient_name });
});

// ---------- replay ----------
api.get('/api/certificates/:number/replay', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const x = await one(`select * from certificate where number = $1 order by version desc limit 1`, [c.req.param('number')]);
  if (!x) return c.json({ error: 'not_found' }, 404);
  const inputVersions = x.input_versions || {};
  const canResolve = { method: true, factor: true, spec: true };
  let reproducible = true; let reason = null;
  const methodId = String(inputVersions.carbon_method || '').split(' ');
  const method = methodId[0] !== 'none' ? await one(`select * from carbon_method where id = $1 and version = $2`, [methodId[0], Number(methodId[1]?.replace('v', '') || 0)]) : null;
  if (String(inputVersions.carbon_method || 'none') !== 'none' && !method) { reproducible = false; reason = 'retired carbon method version'; }
  const factorRef = inputVersions.conversion_factor;
  const factor = await one(`select * from conversion_factor where reference = $1`, [factorRef]);
  if (!factor) { reproducible = false; reason = reason || 'lost conversion factor'; }
  const specV = String(inputVersions.specification || '').match(/v(\d+)/);
  const spec = await one(`select * from specification where grade = $1 and version = $2`, [x.grade, specV ? Number(specV[1]) : 3]);
  if (!spec) { reproducible = false; reason = reason || 'lost specification version'; }
  let issued = null, recomputed = null, agrees = null, differing_input = null;
  if (reproducible) {
    const allocs = await q(`select category, mass_g from allocation where lot = $1`, [(x.lots[0] || {}).reference]);
    const attached = allocs.reduce((s, a) => s + a.mass_g, 0);
    const lot = await one(`select * from lot where reference = $1`, [(x.lots[0] || {}).reference]);
    recomputed = lot ? U.contentBp(attached, lot.mass_g) : 0;
    issued = x.content_bp;
    agrees = issued === recomputed;
    if (!agrees) differing_input = 'conversion_factor';
  }
  return c.json({ number: x.number, issued, recomputed, agrees, differing_input,
    reproducible, reason, input_versions: inputVersions,
    derivation: { recomputed_from: 'recorded input versions, never today\u2019s rules' } });
});

// ---------- specifications, customers, change control ----------
api.get('/api/specifications/:grade/versions/:version', async (c) => {
  const s = await one(`select * from specification where grade = $1 and version = $2`, [c.req.param('grade'), Number(c.req.param('version'))]);
  if (!s) return c.json({ error: 'not_found' }, 404);
  return c.json({ grade: s.grade, version: s.version, rows: s.rows, virgin_reference: s.virgin_reference, issued_on: s.issued_on, superseded_by: s.superseded_by });
});
api.post('/api/specifications/:grade/versions/:version/issue', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'quality_manager') return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  const n = (await q(`select count(*)::int as n from conformance`))[0].n;
  const ref = 'CONF-' + String(n + 1).padStart(4, '0');
  await q(`insert into conformance(customer,application,spec_grade,spec_version,trials,outcome) values ($1,$2,$3,$4,'[]','pending')`,
    [body.customer, body.application || 'technical apparel yarn', c.req.param('grade'), Number(c.req.param('version'))]);
  const e = await appendEntry('specification_issued', p.email, p.name, null, ref, `SPEC-${c.req.param('grade')} v${c.req.param('version')} issued to ${body.customer}`);
  const payload = { reference: ref, customer: body.customer, specification: `SPEC-${c.req.param('grade')} v${c.req.param('version')}`, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.get('/api/customers/:reference', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const cust = await one(`select * from customer where reference = $1`, [c.req.param('reference')]);
  if (!cust) return c.json({ error: 'not_found' }, 404);
  const conf = await q(`select * from conformance where customer = $1`, [cust.reference]);
  const certs = await q(`select number, state, content_bp, claim_type, signed_on from certificate where recipient = $1 order by signed_at`, [cust.reference]);
  return c.json({ reference: cust.reference, holds_specification_version: `SPEC-${cust.holds_spec} v${cust.holds_version}`,
    application: cust.application, industry: cust.industry,
    conformance: conf.map((x) => ({ application: x.application, specification: `SPEC-${x.spec_grade} v${x.spec_version}`, trials: x.trials, outcome: x.outcome, dates: x.dates })),
    certificates: certs, change_notices: [] });
});
api.post('/api/change-notices', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['quality_manager', 'claims_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody');
  const specs = await q(`select distinct grade, version from specification where superseded_by is null`);
  const customers = await q(`select * from customer`);
  const auto = customers.filter((x) => x.industry === 'automotive');
  const qualifications = auto.length;
  const n = (await q(`select count(*)::int as n from change_notice`))[0].n;
  const ref = 'CHG-' + String(n + 1).padStart(4, '0');
  const noticePeriod = qualifications > 0 ? 90 : 30;
  await q(`insert into change_notice(reference,change_kind,description,raised_by,raised_on,specifications_affected,customers_affected,qualifications_affected,notice_period_days,state)
    values ($1,$2,$3,$4,current_date,$5,$6,$7,$8,'proposed')`,
    [ref, body.change_kind || body.kind || 'recipe', body.description || '', p.email,
     JSON.stringify(specs.map((s) => `SPEC-${s.grade} v${s.version}`)), JSON.stringify(customers.map((x) => x.reference)), qualifications, noticePeriod]);
  const e = await appendEntry('change_notice_raised', p.email, p.name, null, ref, `Change notice ${ref} raised`);
  const payload = { reference: ref, specifications_affected: specs.map((s) => `SPEC-${s.grade} v${s.version}`),
    customers_affected: customers.map((x) => x.reference), qualifications_affected: qualifications,
    notice_period_days: noticePeriod, blocking: qualifications > 0,
    message: qualifications > 0 ? `This change may invalidate ${qualifications} customer qualifications.` : null,
    record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.post('/api/change-notices/:reference/notify', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const ref = c.req.param('reference');
  const body = c.get('idemBody');
  const notice = await one(`select * from change_notice where reference = $1`, [ref]);
  if (!notice) return c.json({ error: 'not_found' }, 404);
  const cust = await one(`select * from customer where reference = $1`, [body.customer]);
  if (!cust) return c.json({ error: 'customer_not_found' }, 404);
  await q(`insert into change_ack(notice,customer,waived) values ($1,$2,false)`, [ref, body.customer]);
  try {
    await sendMail(cust.contact_email, `Change notice ${ref} requires acknowledgement`,
      `Change notice ${ref} requires acknowledgement.\n\nChange: ${notice.description}\nSpecifications affected: ${(notice.specifications_affected || []).join(', ')}\nNotice period: ${notice.notice_period_days} days\n\nThis change may invalidate customer qualifications.`);
  } catch (m) { console.error('mail failed', m.message); }
  const e = await appendEntry('change_notice_notified', p.email, p.name, null, ref, `Customer ${body.customer} notified of ${ref}`);
  const payload = { reference: ref, customer: body.customer, notified: true, record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});
api.post('/api/change-notices/:reference/release', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const ref = c.req.param('reference');
  const notice = await one(`select * from change_notice where reference = $1`, [ref]);
  if (!notice) return c.json({ error: 'not_found' }, 404);
  const owed = notice.customers_affected || [];
  const acked = (await q(`select customer from change_ack where notice = $1`, [ref])).map((a) => a.customer);
  const outstanding = owed.filter((x) => !acked.includes(x));
  if (outstanding.length) {
    await appendEntry('refused', p.email, p.name, null, ref, `release refused: customers still owed notice: ${outstanding.join(', ')}`);
    return c.json({ error: 'notice_outstanding', customers: outstanding }, 409);
  }
  await q(`update change_notice set state = 'released', released_on = current_date where reference = $1`, [ref]);
  const e = await appendEntry('change_notice_released', p.email, p.name, null, ref, `Change notice ${ref} released`);
  const payload = { reference: ref, state: 'released', record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});

// ---------- contracts ----------
api.get('/api/contracts/:id/projection', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const con = await one(`select * from contract where id = $1`, [c.req.param('id')]);
  if (!con) return c.json({ error: 'not_found' }, 404);
  const site = await one(`select * from site where reference = $1`, [con.site]);
  const allocs = await q(`select * from contract_allocation where contract = $1`, [con.id]);
  let deliveredKg = 0; let weightedContent = 0; let totalMassG = 0;
  const lotRows = [];
  for (const a of allocs) {
    const lot = await one(`select * from lot where reference = $1`, [a.lot]);
    const lotAlloc = await q(`select sum(mass_g)::int as m from allocation where lot = $1`, [a.lot]);
    const attached = lotAlloc[0].m || 0;
    const content = lot ? U.contentBp(attached, lot.mass_g) : 0;
    deliveredKg += Math.floor(a.mass_g / 1000);
    weightedContent += content * a.mass_g; totalMassG += a.mass_g;
    lotRows.push({ lot: a.lot, mass_g: a.mass_g, content_bp: content, allocation: a.reference, decided_by: a.decided_by, favoured_over: a.favoured_over });
  }
  const running = totalMassG > 0 ? Math.floor(weightedContent / totalMassG) : 0;
  const requiredRemaining = con.committed_kg - deliveredKg > 0
    ? Math.floor((con.floor_bp * con.committed_kg * 1000 - running * deliveredKg * 1000) / ((con.committed_kg - deliveredKg) * 1000)) : con.floor_bp;
  const unreachable = requiredRemaining > 10000;
  return c.json({ id: con.id, recipient: con.recipient, site: con.site, period: con.period,
    delivered_kg: deliveredKg, committed_kg: con.committed_kg, running_content_bp: running, floor_bp: con.floor_bp,
    required_remaining_bp: requiredRemaining, state: unreachable ? 'unreachable' : 'on_track',
    unreachable_since: unreachable ? new Date().toISOString().slice(0, 10) : null,
    shortfall_consequence: con.shortfall_consequence,
    planned_site_flag: site?.confidence === 'planned', flag_dismissible: false,
    allocations: lotRows,
    derivation: { running_content_bp: 'mass-weighted content of allocated lots', required_remaining_bp: 'floor over committed minus delivered' } });
});
api.post('/api/contracts/:id/allocations', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['claims_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const id = c.req.param('id');
  const body = c.get('idemBody');
  const con = await one(`select * from contract where id = $1`, [id]);
  if (!con) return c.json({ error: 'not_found' }, 404);
  const existing = await one(`select 1 as x from contract_allocation where lot = $1`, [body.lot]);
  if (existing) return c.json({ error: 'already_allocated_to_contract' }, 409);
  const n = (await q(`select count(*)::int as n from contract_allocation`))[0].n;
  const ref = 'CAL-' + String(n + 1).padStart(4, '0');
  await q(`insert into contract_allocation(reference,contract,lot,mass_g,decided_by,favoured_over) values ($1,$2,$3,$4,$5,$6)`,
    [ref, id, body.lot, body.mass_g || 0, body.decided_by || p.email, body.favoured_over || null]);
  const e = await appendEntry('contract_allocation', p.email, p.name, con.site, ref, `Lot ${body.lot} attached to ${id}; decided by ${body.decided_by || p.email}; went without: ${(body.favoured_over || []).join(', ') || 'none'}`);
  const payload = { reference: ref, contract: id, lot: body.lot, decided_by: body.decided_by || p.email, favoured_over: body.favoured_over || [], record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});

// ---------- inbound, reconciliation ----------
api.post('/api/inbound/:source', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (!['plant_operator', 'lab_analyst', 'quality_manager'].includes(p.role)) return c.json({ error: 'role_not_permitted' }, 403);
  const source = c.req.param('source');
  if (!['weighbridge', 'control_system', 'laboratory', 'customer_reporting'].includes(source)) return c.json({ error: 'source_invalid' }, 422);
  const body = c.get('idemBody');
  const n = (await q(`select count(*)::int as n from inbound_record`))[0].n;
  const ref = 'INB-' + String(n + 1).padStart(4, '0');
  await q(`insert into inbound_record(reference,source,received_at,payload_verbatim) values ($1,$2,$3,$4)`,
    [ref, source, new Date(body.received_at || Date.now()), JSON.stringify(body.payload ?? body)]);
  const e = await appendEntry('inbound_record_received', p.email, p.name, null, ref, `Inbound record from ${source} kept verbatim`);
  const payload = { reference: ref, source, received_at: body.received_at || new Date().toISOString(), record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.get('/api/inbound', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from inbound_record order by received_at`);
  return c.json(rows.map((r) => ({ reference: r.reference, source: r.source, received_at: r.received_at, payload_verbatim: r.payload_verbatim })));
});
api.get('/api/reconciliation', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const massIn = (await q(`select coalesce(sum(mass_g),0)::int as m from consumption`))[0].m;
  const batchIn = (await q(`select coalesce(sum(net_g),0)::int as m from batch where accepted = true`))[0].m;
  const massOut = (await q(`select coalesce(sum(mass_g),0)::int as m from output`))[0].m;
  const openRuns = (await q(`select count(*)::int as n from run where state = 'open'`))[0].n;
  const broken = await q(`select reference from batch`);
  let brokenCustody = 0;
  for (const b of broken) {
    const row = await one(`select custody from batch where reference = $1`, [b.reference]);
    const kinds = new Set((row.custody || []).map((l) => l.kind));
    if (['collection_site','collector','transport','arrival','weighing','acceptance'].some((k) => !kinds.has(k))) brokenCustody++;
  }
  const superseded = (await q(`select count(*)::int as n from certificate c join carbon_figure f on f.id = c.carbon_figure where f.superseded_by is not null`))[0].n;
  const ages = {};
  for (const src of ['weighbridge', 'control_system', 'laboratory', 'customer_reporting']) {
    const r = await one(`select received_at from inbound_record where source = $1 order by received_at desc limit 1`, [src]);
    ages[src] = r ? Math.max(0, Math.floor((Date.now() - new Date(r.received_at).getTime()) / 3600000)) : null;
  }
  return c.json({
    mass_balance_residual_g: batchIn - massIn - massOut,
    credit_margin_g: (await q(`select coalesce(sum(case when direction='in' then mass_g else -mass_g end),0)::int as m from credit_movement`))[0].m,
    consumptions_on_open_runs: openRuns,
    batches_with_broken_custody: brokenCustody,
    certificates_with_superseded_figures: superseded,
    integration_ages: ages,
    read_at: new Date().toISOString(),
    derivation: { mass_balance_residual_g: 'accepted batch mass minus consumed minus produced', integration_ages: 'hours since the most recent record from each source; null when never sent' },
  });
});

// ---------- the record ----------
api.get('/api/record', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const rows = await q(`select * from record_entry order by seq`);
  return c.json(rows.map((r) => ({ seq: Number(r.seq), event_at: r.event_at, recorded_at: r.recorded_at, effective_on: r.effective_on,
    actor: r.actor, actor_name: r.actor_name, site: r.site, object_ref: r.object_ref, kind: r.kind, summary: r.summary,
    digest: r.digest, prev_digest: r.prev_digest, content: r.content_deleted_on ? null : r.content,
    legal_hold: r.legal_hold, content_deleted_on: r.content_deleted_on })));
});
api.get('/api/record/check', async (c) => {
  const rows = await q(`select seq, digest, prev_digest, content, content_deleted_on from record_entry order by seq`);
  let prev = ZERO64; let holds = true; let firstFailure = null; let gapAt = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (Number(r.seq) !== i + 1) { holds = false; gapAt = i + 1; if (!firstFailure) firstFailure = i + 1; break; }
    // an entry whose content was deleted under retention keeps its position and its digest,
    // so the chain still verifies: the digest was computed over the original content
    if (!r.content_deleted_on) {
      const expected = digest(prev + canonical(r.content));
      if (r.digest !== expected || r.prev_digest !== prev) { holds = false; firstFailure = Number(r.seq); break; }
    } else if (r.prev_digest !== prev) { holds = false; firstFailure = Number(r.seq); break; }
    prev = r.digest;
  }
  return c.json({ holds, first_failure: firstFailure, gap: gapAt, entries: rows.length });
});
api.put('/api/record/:seq', async () => ({ /* unreachable: route refuses by method */ }));
api.patch('/api/record/:seq', async () => err(405, 'record_immutable'));
api.delete('/api/record/:seq', async () => err(405, 'record_immutable'));

api.get('/api/record/:seq/retention', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const r = await one(`select * from record_entry where seq = $1`, [c.req.param('seq')]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  const holds = await one(`select 1 as x from legal_hold where record_seq = $1 and lifted_on is null`, [r.seq]);
  const scheme = 120, statutory = 84;
  const eventDate = new Date(r.event_at);
  const schemeUntil = new Date(eventDate); schemeUntil.setMonth(schemeUntil.getMonth() + scheme);
  const statutoryUntil = new Date(eventDate); statutoryUntil.setMonth(statutoryUntil.getMonth() + statutory);
  // figures still referencing this record keep it longer
  const referenced = await one(`select 1 as x from certificate where object_ref_of_cert($1)`, [r.seq]).catch(() => null);
  const referencedUntil = r.kind === 'certificate_signed' ? new Date('2999-12-31') : null;
  const candidates = [schemeUntil, statutoryUntil, referencedUntil].filter(Boolean).sort((a, b) => b - a);
  return c.json({ seq: Number(r.seq), scheme_months: scheme, statutory_months: statutory,
    referenced_until: referencedUntil ? referencedUntil.toISOString().slice(0, 10) : null,
    retain_until: candidates[0].toISOString().slice(0, 10),
    legal_hold: !!holds,
    derivation: { retain_until: 'the longest of scheme months, statutory months and any figure still referencing the record' } });
});
api.post('/api/record/:seq/legal-hold', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'auditor') return c.json({ error: 'role_not_permitted' }, 403);
  const seq = Number(c.req.param('seq'));
  const r = await one(`select * from record_entry where seq = $1`, [seq]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  const existing = await one(`select * from legal_hold where record_seq = $1 and lifted_on is null`, [seq]);
  if (existing) return c.json({ reference: existing.reference, legal_hold: true });
  const n = (await q(`select count(*)::int as n from legal_hold`))[0].n;
  const ref = 'HLD-' + String(n + 1).padStart(4, '0');
  await q(`insert into legal_hold(reference,record_seq,placed_on,placed_by) values ($1,$2,current_date,$3)`, [ref, seq, p.email]);
  await q(`update record_entry set legal_hold = true where seq = $1`, [seq]);
  const e = await appendEntry('legal_hold_placed', p.email, p.name, r.site, ref, `Legal hold ${ref} placed on entry ${seq}`);
  const payload = { reference: ref, seq, legal_hold: true, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});
api.delete('/api/record/:seq/legal-hold', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'auditor') return c.json({ error: 'role_not_permitted' }, 403);
  const seq = Number(c.req.param('seq'));
  await q(`update legal_hold set lifted_on = current_date where record_seq = $1 and lifted_on is null`, [seq]);
  await q(`update record_entry set legal_hold = false where seq = $1`, [seq]);
  const e = await appendEntry('legal_hold_lifted', p.email, p.name, null, null, `Legal hold lifted on entry ${seq}`);
  await remember(c, 200, { seq, legal_hold: false, record_entry: e.seq });
  return c.json({ seq, legal_hold: false, record_entry: e.seq });
});
api.post('/api/record/:seq/expire', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'auditor') return c.json({ error: 'role_not_permitted' }, 403);
  const seq = Number(c.req.param('seq'));
  const r = await one(`select * from record_entry where seq = $1`, [seq]);
  if (!r) return c.json({ error: 'not_found' }, 404);
  const hold = await one(`select 1 as x from legal_hold where record_seq = $1 and lifted_on is null`, [seq]);
  if (hold) return c.json({ error: 'legal_hold_stands' }, 409);
  const eventDate = new Date(r.event_at);
  const until = new Date(eventDate); until.setMonth(until.getMonth() + 120);
  if (until > new Date()) return c.json({ error: 'retention_not_elapsed' }, 409);
  // position and digest survive; content goes
  await q(`update record_entry set content = jsonb_build_object('deleted', true, 'deleted_on', current_date::text, 'under', 'retention'), content_deleted_on = current_date where seq = $1`, [seq]);
  const e = await appendEntry('record_expired', p.email, p.name, r.site, null, `Entry ${seq} content deleted under retention; position and digest kept`);
  const payload = { seq, content_deleted_on: new Date().toISOString().slice(0, 10), digest_kept: r.digest, record_entry: e.seq };
  await remember(c, 200, payload);
  return c.json(payload);
});

// ---------- the nine record queries ----------
api.get('/api/record/queries/:name', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  noPagination(c);
  const name = c.req.param('name');
  const ref = c.req.query('ref') || c.req.query('reference') || c.req.query('batch') || c.req.query('period') || c.req.query('method') || c.req.query('person');
  switch (name) {
    case 'lots_from_batch': {
      const b = ref || 'BATCH-1001';
      const impact = await impactOfBatch(b);
      return c.json({ query: name, batch: b, lots: impact.lots.map((l) => ({ reference: l.reference, mass_g: l.mass_g })), complete: true });
    }
    case 'certificates_on_period': {
      const period = ref || 'BP-DEMO-N6-2025H2';
      const rows = await q(`select * from certificate where period = $1 order by signed_at`, [period]);
      return c.json({ query: name, period, certificates: rows.map((r) => ({ number: r.number, state: r.state, recipient: r.recipient })), complete: true });
    }
    case 'certificates_under_method_version': {
      const mv = ref || 'CM-PA6 v2';
      const [id, v] = mv.split(' v');
      const rows = await q(`select * from certificate where input_versions->>'carbon_method' = $1 order by signed_at`, [mv]);
      return c.json({ query: name, method_version: mv, certificates: rows.map((r) => ({ number: r.number, state: r.state })), complete: true });
    }
    case 'lots_released_under_unreviewed_override': {
      const rows = await q(`select o.lot, o.reference, o.authorised_by, o.authorised_on, l.disposition from override o join lot l on l.reference = o.lot where o.reviewed = false`);
      return c.json({ query: name, lots: rows.filter((r) => r.disposition === 'released'), complete: true });
    }
    case 'allocations_in_final_fortnight': {
      const rows = await q(`select a.*, (p.period_to - a.effective_on) as days_before_end from allocation a join balance_period p on p.id = a.balance_period where p.state = 'open' and p.period_to - a.effective_on <= 14`);
      return c.json({ query: name, allocations: rows, complete: true });
    }
    case 'refused_allocations': {
      const rows = await q(`select * from record_entry where kind = 'refused' and summary ilike 'allocation refused%' order by seq`);
      return c.json({ query: name, refusals: rows.map((r) => ({ seq: Number(r.seq), summary: r.summary, at: r.recorded_at })), complete: true });
    }
    case 'collector_declaration_departures': {
      const rows = await q(`select * from finding where kind = 'declaration_departure' order by raised_on`);
      return c.json({ query: name, departures: rows.map((r) => ({ collector: r.collector, batch: r.batch, departure_bp: r.departure_bp, raised_on: r.raised_on, state: r.state })), complete: true });
    }
    case 'acts_by_person': {
      const person = ref || c.req.query('email');
      const rows = await q(`select * from record_entry where actor = $1 order by seq`, [person]);
      return c.json({ query: name, person, acts: rows.map((r) => ({ seq: Number(r.seq), kind: r.kind, object_ref: r.object_ref, at: r.recorded_at })), complete: true });
    }
    case 'exports_by_auditor': {
      const rows = await q(`select * from export_record order by created_at`);
      return c.json({ query: name, exports: rows.map((r) => ({ reference: r.reference, actor: r.actor, result_count: r.result_count, at: r.created_at })), complete: true });
    }
    default: return c.json({ error: 'unknown_query' }, 404);
  }
});

// ---------- exports ----------
api.post('/api/exports', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  if (p.role !== 'auditor') return c.json({ error: 'role_not_permitted' }, 403);
  const body = c.get('idemBody') || {};
  const n = (await q(`select count(*)::int as n from export_record`))[0].n;
  const ref = 'EXP-' + String(n + 1).padStart(4, '0');
  const entries = await q(`select seq, digest from record_entry order by seq`);
  const bundle = { scope: body, generated_at: new Date().toISOString(), entries: entries.length,
    anchors: entries.slice(0, 3).map((x) => ({ seq: Number(x.seq), digest: x.digest })),
    last_digest: entries[entries.length - 1]?.digest || ZERO64, derivations: { note: 'digests and anchors of the entries in scope' } };
  await q(`insert into export_record(reference,actor,scope,result_count,bundle) values ($1,$2,$3,$4,$5)`,
    [ref, p.email, JSON.stringify(body), entries.length, JSON.stringify(bundle)]);
  const e = await appendEntry('export_recorded', p.email, p.name, null, ref, `Export ${ref} of scope ${JSON.stringify(body)}; ${entries.length} entries in scope`);
  const payload = { reference: ref, ...bundle, record_entry: e.seq };
  await remember(c, 201, payload);
  return c.json(payload, 201);
});

// ---------- public site data ----------
api.get('/api/statistics', async (c) => {
  const rows = await q(`select * from statistic order by key`);
  return c.json(rows.map((r) => ({ key: r.key, value: r.value, source: r.source, year: r.year, geography: r.geography })));
});
api.get('/api/positions', async (c) => {
  const rows = await q(`select * from position order by closes_on`);
  return c.json(rows.map((r) => ({ id: r.id, title: r.title, location: r.location, department: r.department, contract_type: r.contract_type, closes_on: r.closes_on })));
});
api.get('/api/news', async (c) => {
  const rows = await q(`select * from news_item order by published_on desc`);
  return c.json(rows.map((r) => ({ id: r.id, title: r.title, tag: r.tag, outlet: r.outlet, published_on: r.published_on, link: r.link, language: r.language })));
});
api.get('/api/claim-register', async (c) => {
  const rows = await q(`select * from claim_substantiation order by id`);
  const today = new Date();
  return c.json(rows.map((r) => ({ claim: r.claim, route: r.route, first_published_on: r.first_published_on,
    evidence: r.evidence, method_version: r.method_version, approver: r.approver, review_on: r.review_on,
    withdrawn_on: r.withdrawn_on,
    evidence_expiring_before_review: r.evidence ? (r.evidence.some((e) => new Date(String(e.year) + '-12-31') < new Date(r.review_on))) : false })));
});

// ---------- enquiries ----------
const DESTINATIONS = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3, retention_months: 36 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2, retention_months: 36 },
  partnership: { destination: 'partners@example.com', response_days: 5, retention_months: 24 },
  press: { destination: 'press@example.com', response_days: 1, retention_months: 12 },
};
api.post('/api/enquiries', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const kind = body.type;
  const d = DESTINATIONS[kind];
  if (!d) return c.json({ error: 'type_invalid' }, 422);
  if (!body.email || !body.name || !body.message) return c.json({ error: 'name_email_message_required' }, 422);
  const n = (await q(`select count(*)::int as n from enquiry`))[0].n;
  const ref = 'ENQ-' + String(n + 1).padStart(4, '0');
  const deadline = new Date(Date.now() + d.response_days * 864e5).toISOString().slice(0, 10);
  await q(`insert into enquiry(reference,kind,name,email,company,message,destination,response_days,deadline) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [ref, kind, body.name, body.email, body.company || null, body.message, d.destination, d.response_days, kind === 'press' ? deadline : null]);
  if (kind === 'waste_supply') await q(`insert into party(reference,kind,email) values ($1,'collector',$2) on conflict (reference) do nothing`, ['COL-PEND-' + ref, body.email]);
  if (kind === 'polymer_purchase') await q(`insert into party(reference,kind,email) values ($1,'customer',$2) on conflict (reference) do nothing`, ['CUS-PEND-' + ref, body.email]);
  try {
    await sendMail(body.email, `Enquiry ${ref} received`,
      `Enquiry ${ref} received.\n\nReference: ${ref}\nDestination: ${d.destination}\nStated response time: ${d.response_days} working days\n\nThe point of collection states who receives the data, what it is used for, how long it is kept (${d.retention_months} months) and how to have it removed: privacy@example.com.`);
  } catch (m) { console.error('mail failed', m.message); }
  const e = await appendEntry('enquiry_received', body.email, body.name || null, null, ref, `Enquiry ${ref} of type ${kind} routed to ${d.destination}`);
  return c.json({ reference: ref, destination: d.destination, response_days: d.response_days, deadline: kind === 'press' ? deadline : null, record_entry: e.seq }, 201);
});

// ---------- byproducts ----------
api.get('/api/outputs/:reference', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const o = await one(`select * from output where reference = $1`, [c.req.param('reference')]);
  if (!o) return c.json({ error: 'not_found' }, 404);
  const run = await one(`select * from run where reference = $1`, [o.run_ref]);
  const outs = await q(`select * from output where run_ref = $1`, [o.run_ref]);
  const totalOut = outs.reduce((s, x) => s + x.mass_g, 0);
  const share = U.shareBp(o.mass_g, totalOut);
  const allocs = await q(`select lot, category, mass_g from allocation where lot in (select lot from output where run_ref = $1 and kind = 'lot')`, [o.run_ref]);
  const runClaim = allocs.reduce((s, a) => s + a.mass_g, 0);
  const lotMass = allocs.length ? (await one(`select mass_g from lot where reference = $1`, [allocs[0].lot])).mass_g : 0;
  const content = lotMass ? U.contentBp(runClaim, lotMass) : 0;
  const fig = await one(`select * from carbon_figure where lot = $1 and superseded_by is null order by version desc`, [allocs[0]?.lot]);
  const out = { reference: o.reference, run: o.run_ref, kind: o.kind, mass_g: o.mass_g, disposition: o.disposition,
    share_bp: share, derivation: { formula: 'byproduct_mass_g * 10000 / total_output_mass_g, floored', total_output_mass_g: totalOut },
    claim_share_g: o.disposition === 'sold' ? Math.floor((runClaim * share) / 10000) : 0,
    emissions_share_mg: (o.disposition === 'sold' && fig) ? Math.floor((fig.value_mg_per_kg * share) / 10000) : 0 };
  if (o.disposition === 'disposed') out.note = 'A disposed byproduct is a loss and reduces the conversion factor.';
  return c.json(out);
});

// ---------- devices, deviation list, overrides list, misc console data ----------
api.get('/api/devices', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from device order by reference`);
  const out = [];
  for (const d of rows) {
    const limit = new Date(); limit.setFullYear(limit.getFullYear() - 1);
    out.push({ reference: d.reference, site: d.site, calibrated_on: d.calibrated_on,
      state: new Date(d.calibrated_on) < limit ? 'lapsed' : 'valid',
      calibration_valid_months: 12 });
  }
  return c.json(out);
});
api.get('/api/deviations', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from deviation order by reference`);
  return c.json(rows.map((d) => ({ reference: d.reference, state: d.state, affects_runs: d.affects_runs, affects_lots: d.affects_lots,
    description: d.description, outcome: d.outcome, raised_on: d.raised_on, closed_on: d.closed_on, raised_by: d.raised_by })));
});
api.get('/api/overrides', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from override order by reference`);
  return c.json(rows.map((o) => ({ reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, authorised_on: o.authorised_on, reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on,
    note: 'Separation overridden. This cannot be removed.' })));
});
api.get('/api/contracts', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from contract order by id`);
  return c.json(rows.map((r) => ({ id: r.id, recipient: r.recipient, site: r.site, period: r.period, committed_kg: r.committed_kg, floor_bp: r.floor_bp, shortfall_consequence: r.shortfall_consequence })));
});
api.get('/api/energy-instruments', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from energy_instrument order by reference`);
  return c.json(rows.map((r) => ({ reference: r.reference, quantity_kwh: r.quantity_kwh, vintage: r.vintage, region: r.region, state: r.state, applied_period: r.applied_period })));
});
api.get('/api/restatements', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from restatement order by reference`);
  return c.json(rows);
});
api.get('/api/conversion-factors', async (c) => {
  const p = await needsAuth(c); if (!p) return c.json({ error: 'session_required' }, 401);
  const rows = await q(`select * from conversion_factor order by published_on`);
  return c.json(rows.map((r) => ({ reference: r.reference, site: r.site, factor_bp: r.factor_bp, derived_from: r.derived_from,
    derived_to: r.derived_to, derived_in_g: r.derived_in_g, derived_out_g: r.derived_out_g, provisional: r.provisional,
    derivation: { formula: 'derived_out_g * 10000 / derived_in_g, floored' } })));
});

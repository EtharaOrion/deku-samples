// Walks the API as each role and checks every figure the brief states.
// Not shipped in the image; it exists so the build can be judged against the
// page rather than by eye.
const BASE = process.env.BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';

let pass = 0; let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}\n       want ${e}\n       got  ${a}`); }
}
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}

let keyN = Date.now();
const key = () => `verify-${keyN++}`;

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW })
  });
  const d = await r.json();
  return d.access_token;
}

async function api(token, method, path, body, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  if (method !== 'GET' && !headers['idempotency-key'] && !('idempotency-key' in extraHeaders)) {
    headers['idempotency-key'] = key();
  }
  const r = await fetch(`${BASE}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

const T = {};

console.log('\n== identity ==');
for (const u of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
  T[u] = await login(`${u}@example.com`);
  ok(`${u}@example.com signs in`, !!T[u]);
}
{
  const me = await api(T.signer2, 'GET', '/api/auth/me');
  check('signer2 sites', me.body.sites, ['SITE-PILOT']);
  check('signer2 roles', me.body.roles, ['certificate_signer']);
  const bad = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'plant@example.com', password: 'wrong' })
  });
  ok('a wrong password is refused', bad.status === 401);
  const asserted = await api('not-a-real-token', 'GET', '/api/auth/me');
  ok('an asserted identity is refused', asserted.status === 401);
}

console.log('\n== sites and capacity ==');
{
  const s = await api(null, 'GET', '/api/sites');
  check('three sites', s.body.length, 3);
  const comm = await api(null, 'GET', '/api/sites/SITE-COMM/capacity');
  check('SITE-COMM uncommitted_kg', comm.body.uncommitted_kg, -1000000);
  check('SITE-COMM confidence', comm.body.confidence, 'planned');
  check('capacity basis', comm.body.basis, '8000 hours per year, 0.90 availability, 0.80 yield');
  check('last_revised', comm.body.last_revised, '2026-06-30');
  const demo = await api(null, 'GET', '/api/sites/SITE-DEMO/capacity');
  check('SITE-DEMO uncommitted_kg', demo.body.uncommitted_kg, 80000);
}

console.log('\n== collectors ==');
{
  const cs = await api(T.plant, 'GET', '/api/collectors');
  check('three collectors', cs.body.length, 3);
  const cinder = cs.body.find((x) => x.reference === 'COL-CINDER');
  check('CINDER conditional', cinder.approval_periods[0].state, 'conditional');
  check('CINDER condition', cinder.approval_periods[0].condition, 'Sampling plan for coated streams to be agreed');
  check('CINDER condition_closes_on', cinder.approval_periods[0].condition_closes_on, '2026-10-31');
  ok('CINDER carries a finding', cinder.findings.length === 1);
  check('CINDER finding departure', cinder.findings[0].departure_bp, 800);
  const brine = cs.body.find((x) => x.reference === 'COL-BRINE');
  check('BRINE approval ends 2026-06-30', brine.approval_periods[0].valid_to, '2026-06-30');
  const denied = await api(T.plant, 'POST', '/api/collectors/COL-ALDER/approvals',
    { state: 'approved', valid_from: '2027-01-01', valid_to: '2027-12-31' });
  check('a plant operator may not approve a collector', denied.status, 403);
}

console.log('\n== batches ==');
{
  const bs = await api(T.plant, 'GET', '/api/batches');
  check('five batches', bs.body.length, 5);
  const by = Object.fromEntries(bs.body.map((b) => [b.reference, b]));
  check('BATCH-1001 dry_mass_g', by['BATCH-1001'].dry_mass_g, 450000);
  check('BATCH-1001 claimable', by['BATCH-1001'].claimable, true);
  check('BATCH-1002 dry_mass_g', by['BATCH-1002'].dry_mass_g, 300000);
  check('BATCH-1003 dry_mass_g', by['BATCH-1003'].dry_mass_g, 190000);
  check('BATCH-1003 claimable', by['BATCH-1003'].claimable, false);
  check('BATCH-1003 reason', by['BATCH-1003'].claimable_reason, 'collector_approval_lapsed');
  check('BATCH-1003 collector name on receipt date', by['BATCH-1003'].collector_name, 'Brine Textile Recovery');
  check('BATCH-1004 dry_mass_g', by['BATCH-1004'].dry_mass_g, 120000);
  check('BATCH-1004 claimable', by['BATCH-1004'].claimable, true);
  ok('BATCH-1004 lapsed_calibration', by['BATCH-1004'].flags.includes('lapsed_calibration'));
  check('BATCH-1005 dry_mass_g', by['BATCH-1005'].dry_mass_g, 100000);
  check('BATCH-1005 claimable', by['BATCH-1005'].claimable, false);
  check('BATCH-1005 reason', by['BATCH-1005'].claimable_reason, 'custody_link_missing');
  check('BATCH-1005 missing link', by['BATCH-1005'].claimable_missing_link, 'transport');
  check('BATCH-1001 composition fraction', by['BATCH-1001'].composition.fraction_bp, 9200);
  check('BATCH-1001 composition basis', by['BATCH-1001'].composition.basis, 'sampled');
  check('BATCH-1001 elastane', by['BATCH-1001'].contamination.elastane_bp, 400);
  check('BATCH-1004 declared', by['BATCH-1004'].composition.fraction_bp, 9900);
  check('BATCH-1004 measured', by['BATCH-1004'].composition.measured_fraction_bp, 9100);

  for (const [who, tok] of [['plant', T.plant], ['quality', T.quality], ['claims', T.claims], ['signer', T.signer], ['auditor', T.auditor]]) {
    const r = await api(tok, 'PATCH', '/api/batches/BATCH-1001', { category: 'pre_consumer' });
    ok(`a category change is refused for ${who}`, r.status === 409 || r.status === 403,
      `got ${r.status} ${JSON.stringify(r.body)}`);
    if (r.status === 409) check(`  and names the rule for ${who}`, r.body.error, 'category_immutable_after_acceptance');
  }

  const noCat = await api(T.plant, 'POST', '/api/batches', {
    collector: 'COL-ALDER', site: 'SITE-DEMO', gross_g: 1000, tare_g: 0, net_g: 1000,
    moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-06-01'
  });
  check('category is required at intake', noCat.body.error, 'category_required');

  const decimal = await api(T.plant, 'POST', '/api/batches', {
    collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 1000.5,
    tare_g: 0, net_g: 1000.5, moisture_bp: 0, moisture_method: 'ISO 15512',
    device: 'WB-DEMO-01', received_on: '2026-06-01'
  });
  check('a decimal mass is refused', decimal.body.error, 'integer_required');

  const noKey = await fetch(`${BASE}/api/batches`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${T.plant}` },
    body: JSON.stringify({ collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer',
      gross_g: 1000, tare_g: 0, net_g: 1000, moisture_bp: 0, moisture_method: 'x', device: 'WB-DEMO-01', received_on: '2026-06-01' })
  });
  check('a write with no idempotency key is refused', (await noKey.json()).error, 'idempotency_key_required');
}

console.log('\n== idempotency ==');
{
  const k = key();
  const body = { collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 5000,
    tare_g: 0, net_g: 5000, moisture_bp: 1000, moisture_method: 'ISO 15512', device: 'WB-DEMO-01',
    received_on: '2026-06-01', custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'].map((kk) => ({ kind: kk, party: 'X', date: '2026-06-01' })) };
  const a = await api(T.plant, 'POST', '/api/batches', body, { 'idempotency-key': k });
  const b = await api(T.plant, 'POST', '/api/batches', body, { 'idempotency-key': k });
  check('the same key with the same body replays', a.body.reference, b.body.reference);
  check('  dry mass on the replay', b.body.dry_mass_g, 4500);
  const cRes = await api(T.plant, 'POST', '/api/batches', { ...body, net_g: 6000 }, { 'idempotency-key': k });
  check('the same key with a different body is 409', cRes.status, 409);
  check('  naming idempotency_key_reuse', cRes.body.error, 'idempotency_key_reuse');
  const count = await api(T.plant, 'GET', '/api/batches');
  check('and creates nothing further', count.body.filter((x) => x.net_g === 6000).length, 0);
}

console.log('\n== runs and genealogy ==');
{
  const rs = await api(T.plant, 'GET', '/api/runs');
  const by = Object.fromEntries(rs.body.map((r) => [r.reference, r]));
  check('RUN-D-0001 losses', by['RUN-D-0001'].losses_g, 120000);
  check('RUN-D-0002 losses', by['RUN-D-0002'].losses_g, 60000);
  check('RUN-D-0003 losses', by['RUN-D-0003'].losses_g, 30000);
  check('RUN-Y-0001 losses', by['RUN-Y-0001'].losses_g, 50000);
  check('RUN-U-0001 losses', by['RUN-U-0001'].losses_g, 40000);
  check('RUN-R-0001 losses', by['RUN-R-0001'].losses_g, 20000);
  check('RUN-D-0001 within tolerance', by['RUN-D-0001'].within_tolerance, true);
  check('RUN-D-0002 outside tolerance', by['RUN-D-0002'].within_tolerance, false);
  ok('RUN-D-0002 flags the lapsed calibration it consumed', by['RUN-D-0002'].flags.includes('lapsed_calibration'));

  const second = await api(T.plant, 'POST', '/api/runs/RUN-D-0001/close', {});
  check('a closed run refuses a second close', second.status, 409);
  const write = await api(T.plant, 'POST', '/api/runs/RUN-D-0001/consumptions', { input_ref: 'BATCH-1001', mass_g: 1 });
  check('a closed run refuses a write', write.status, 409);

  const g = await api(T.plant, 'GET', '/api/lots/LOT-N6-0001/genealogy');
  const b1001 = g.body.nodes.filter((n) => n.reference === 'BATCH-1001');
  check('BATCH-1001 appears exactly once', b1001.length, 1);
  check('BATCH-1001 total mass', b1001[0].mass_g, 450000);
  check('genealogy is flagged', g.body.flagged, true);
  ok('text_equivalent carries the same nodes', !!g.body.text_equivalent);
  const batchNodes = g.body.nodes.filter((n) => n.kind === 'batch').map((n) => n.reference).sort();
  check('four batches reach the lot', batchNodes, ['BATCH-1001', 'BATCH-1002', 'BATCH-1003', 'BATCH-1004']);
  const paged = await api(T.plant, 'GET', '/api/lots/LOT-N6-0001/genealogy?page=1');
  check('genealogy refuses a page', paged.status, 400);
  check('  naming complete_set_only', paged.body.error, 'complete_set_only');

  const t0 = Date.now();
  const i = await api(T.plant, 'GET', '/api/batches/BATCH-1001/impact');
  const elapsed = Date.now() - t0;
  ok(`impact answers within five seconds (${elapsed} ms)`, elapsed < 5000);
  check('impact names the lots', i.body.lots.map((l) => l.reference).sort(), ['LOT-N6-0001', 'LOT-N6-0002']);
  check('impact is complete', i.body.complete, true);
  const ipaged = await api(T.plant, 'GET', '/api/batches/BATCH-1001/impact?limit=1');
  check('impact refuses a limit', ipaged.status, 400);
}

console.log('\n== the ledger ==');
{
  const p = await api(T.claims, 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  check('post_consumer credits_in_g', p.body.post_consumer.credits_in_g, 360000);
  check('post_consumer credits_out_g', p.body.post_consumer.credits_out_g, 0);
  check('post_consumer credits_available_g', p.body.post_consumer.credits_available_g, 360000);
  check('pre_consumer credits_in_g', p.body.pre_consumer.credits_in_g, 336000);
  check('pre_consumer credits_available_g', p.body.pre_consumer.credits_available_g, 336000);
  check('non_claimable_input_g', p.body.non_claimable_input_g, 190000);
  check('override_count', p.body.override_count, 1);
  check('open_restatement_count', p.body.open_restatement_count, 0);
  check('open_finding_count', p.body.open_finding_count, 1);
  check('carry_over_limit_bp', p.body.carry_over_limit_bp, 2000);
  check('state', p.body.state, 'open');
  ok('every figure carries a derivation', !!p.body.post_consumer.derivation);
  check('inbound credit from the transfer', p.body.inbound_credits.length, 1);
  check('  naming its origin', p.body.inbound_credits[0].origin_site, 'SITE-PILOT');
  check('  and never fresh', p.body.inbound_credits[0].fresh_credit, false);
  check('  at 50000 g', p.body.inbound_credits[0].mass_g, 50000);

  // Total credit across the two periods is unchanged by the journey.
  const pilot = await api(T.claims, 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1');
  const totalMoves = [...p.body.movements, ...pilot.body.movements]
    .reduce((s, m) => s + (m.direction === 'in' ? m.mass_g : -m.mass_g), 0);
  const withoutTransfer = [...p.body.movements, ...pilot.body.movements]
    .filter((m) => m.movement !== 'transfer_in' && m.movement !== 'transfer_out')
    .reduce((s, m) => s + (m.direction === 'in' ? m.mass_g : -m.mass_g), 0);
  check('the transfer changes no total across the two periods', totalMoves, withoutTransfer);

  const over = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 400000 });
  check('an over-allocation is refused', over.status, 409);
  check('  naming the available mass', over.body.available_g, 360000);
  check('  and the requested mass', over.body.requested_g, 400000);
  const still = await api(T.claims, 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  check('  and no credit moved', still.body.post_consumer.credits_available_g, 360000);

  const wrongRole = await api(T.plant, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000 });
  check('a plant operator may not allocate', wrongRole.status, 403);

  const pct = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000, content_bp: 9000 });
  check('no route accepts a percentage', pct.body.error, 'figure_is_computed');

  // Two allocations racing for the same remainder.
  const [r1, r2] = await Promise.all([
    api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
      { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 }),
    api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
      { lot: 'LOT-N6-0002', category: 'post_consumer', mass_g: 360000 })
  ]);
  const statuses = [r1.status, r2.status].sort();
  check('two racing allocations produce one 201 and one 409', statuses, [201, 409]);
  const winner = r1.status === 201 ? r1 : r2;
  const loser = r1.status === 201 ? r2 : r1;
  check('  the winner reports content_bp', winner.body.content_bp, winner.body.lot === 'LOT-N6-0001' ? 9000 : 12000);
  check('  the loser names the margin', loser.body.available_g, 0);

  const after = await api(T.claims, 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  check('credits_available_g is now 0', after.body.post_consumer.credits_available_g, 0);
  check('the pre_consumer category is untouched', after.body.pre_consumer.credits_available_g, 336000);

  const more = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1 });
  check('a further post-consumer allocation is refused', more.status, 409);

  const lot = await api(T.claims, 'GET', '/api/lots/LOT-N6-0001');
  check('LOT-N6-0001 content_bp', lot.body.content_bp, 9000);
  check('  with its claim type beside it', lot.body.claim_type, 'mass_balance');

  const carry = await api(T.claims, 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1/carry-over');
  check('carry-over at the close', carry.body.post_consumer, { carried_forward_g: 0, expired_g: 0, cap_g: 72000 });
}

console.log('\n== conversion factors ==');
{
  const f = await api(T.claims, 'GET', '/api/conversion-factors');
  const demo = f.body.find((x) => x.reference === 'CF-DEMO-1');
  check('CF-DEMO-1 factor', demo.factor_bp, 8000);
  check('CF-DEMO-1 is derived', demo.provisional, false);
  const pilot = f.body.find((x) => x.reference === 'CF-PILOT-1');
  check('CF-PILOT-1 factor', pilot.factor_bp, 7500);
  check('CF-PILOT-1 is provisional', pilot.provisional, true);
  check('CF-PILOT-1 has no window', pilot.derived_in_g, 0);

  const bad = await api(T.claims, 'POST', '/api/conversion-factors',
    { site: 'SITE-DEMO', factor_bp: 9000, derived_in_g: 1000000, derived_out_g: 800000,
      derived_from: '2026-04-01', derived_to: '2026-06-30' });
  check('a factor that does not reconcile is refused', bad.status, 409);
  check('  naming the arithmetic', bad.body.expected_factor_bp, 8000);
}

console.log('\n== byproducts and blending ==');
{
  const s = await api(T.plant, 'GET', '/api/outputs/OUT-U-0002/share');
  check('OUT-U-0002 share_bp', s.body.share_bp, 526);
  check('  of the run total output', s.body.total_output_mass_g, 760000);
  check('  on the mass basis', s.body.allocation_basis, 'mass');
  ok('  carries a claim share', s.body.claim_share_g > 0);
  check('  carries an emissions share', s.body.emissions_share_mg, Math.floor(4260000 * 526 / 10000));
}

console.log('\n== carbon ==');
{
  const cb = await api(T.quality, 'GET', '/api/lots/LOT-N6-0001/carbon');
  check('value_mg_per_kg', cb.body.value_mg_per_kg, 4260000);
  check('uncertainty_bp', cb.body.uncertainty_bp, 1200);
  check('primary_share_bp', cb.body.primary_share_bp, 6500);
  check('boundary', cb.body.boundary, 'cradle-to-gate');
  check('method_version', cb.body.method_version, 'CM-PA6 v2');
  check('not default led', cb.body.default_led, false);
  check('breakdown sums to the value', cb.body.derivation.breakdown_sums_to_value, true);
  check('breakdown has seven lines', cb.body.breakdown.length, 7);
  check('comparator material', cb.body.comparator.material, 'virgin PA6');
  check('comparator dataset', cb.body.comparator.dataset, 'EcoBase 2025');
  check('comparator year', cb.body.comparator.dataset_year, 2025);
  check('comparator region', cb.body.comparator.region, 'EU-27');
  check('described as lower than the comparator by name', cb.body.comparison.direction, 'lower');
  ok('  and names it', cb.body.comparison.statement.includes('virgin PA6'));
  check('energy location', cb.body.energy.energy_location_mg_per_kg, 1850000);
  check('energy market', cb.body.energy.energy_market_mg_per_kg, 620000);
  check('metered_kwh', cb.body.energy.metered_kwh, 300000);
  check('retired_kwh', cb.body.energy.retired_kwh, 250000);
  check('unmatched_kwh', cb.body.energy.unmatched_kwh, 50000);

  const pilotFig = await api(T.quality, 'GET', '/api/lots/LOT-N6-0003/carbon');
  check('LOT-N6-0003 is default led at 4200 bp', pilotFig.body.default_led, true);

  const held = await api(T.claims, 'POST', '/api/energy-instruments/EAC-2025-0031/retire',
    { balance_period: 'BP-DEMO-N6-2026H1' });
  check('a held instrument of the wrong vintage is refused', held.status, 409);
  ok('  because it is held rather than retired',
    held.body.refusals.some((x) => x.includes('held rather than retired')));
  ok('  and because its vintage does not match',
    held.body.refusals.some((x) => x.includes('vintage 2025')));

  const m = await api(T.quality, 'GET', '/api/carbon-methods/CM-PA6/versions/2');
  check('method standard', m.body.standard, 'ISO 14067');
  check('functional unit', m.body.functional_unit, '1 kg of pellet');
  check('reviewer', m.body.reviewer, 'Ilse Grootveld');
  check('published on', m.body.published_on, '2026-01-20');
  check('allocation basis', m.body.allocation_basis, 'mass');
  const v1 = await api(T.quality, 'GET', '/api/carbon-methods/CM-PA6/versions/1');
  check('version 1 stays readable', v1.status, 200);
  check('  and is superseded', v1.body.superseded_by, 2);

  const claimsPublish = await api(T.claims, 'POST', '/api/carbon-methods/CM-PA6/versions',
    { boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'X' });
  check('a claims manager may not alter a carbon method', claimsPublish.status, 403);
}

console.log('\n== the four separations ==');
{
  const d = await api(T.analyst, 'POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' });
  check('an analyst may not set a disposition', d.status, 403);
  const d2 = await api(T.plant, 'POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' });
  check('a plant operator may not set a disposition', d2.status, 403);

  // Whoever entered a test result does not disposition that lot.
  const tr = await api(T.quality, 'POST', '/api/test-results',
    { subject_ref: 'LOT-N6-0003', property: 'ash_content', method: 'ISO 3451-1', value: '0.12', unit: 'percent', analyst: 'Marit Solheim' });
  ok('quality can enter a test result', tr.status === 201);
  const dd = await api(T.quality, 'POST', '/api/lots/LOT-N6-0003/disposition', { disposition: 'released' });
  check('and is then refused that lot\'s disposition', dd.status, 403);
  check('  naming the separation', dd.body.error, 'separation_analyst_not_dispositioner');

  const noMethod = await api(T.analyst, 'POST', '/api/test-results',
    { subject_ref: 'LOT-N6-0001', property: 'moisture', value: '0.05', unit: 'percent', analyst: 'T' });
  check('a result with no method is refused', noMethod.body.error, 'method_required');

  const mismatch = await api(T.analyst, 'POST', '/api/test-results',
    { subject_ref: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ASTM D2857', value: '2.4', unit: 'ratio', analyst: 'T' });
  check('a method mismatch is recorded', mismatch.status, 201);
  check('  answering method_mismatch', mismatch.body.method_mismatch, true);
  check('  and never usable for release', mismatch.body.usable_for_release, false);
}

console.log('\n== overrides ==');
{
  const o = await api(T.quality, 'GET', '/api/overrides/OVR-0001');
  check('OVR-0001 separation', o.body.separation, 'analyst_not_dispositioner');
  check('OVR-0001 unreviewed at seed', o.body.reviewed, false);
  check('OVR-0001 authoriser', o.body.authorised_by, 'quality@example.com');
  check('OVR-0001 is permanent', o.body.permanent, true);

  const short = await api(T.quality, 'POST', '/api/overrides',
    { separation: 'signer_not_author', reason: 'too short', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' });
  check('a reason under forty characters is refused', short.body.error, 'reason_too_short');

  const self = await api(T.quality, 'POST', '/api/overrides/OVR-0001/review', {});
  check('the authoriser may not review their own override', self.status, 403);
  const wrong = await api(T.plant, 'POST', '/api/overrides/OVR-0001/review', {});
  check('a plant operator may not review an override', wrong.status, 403);
}

console.log('\n== the certificate wizard ==');
{
  const pv = await api(T.signer, 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  check('exactly eight conditions', pv.body.conditions.length, 8);
  const overrideCond = pv.body.conditions.find((x) => x.condition.includes('override'));
  check('the unreviewed override blocks', overrideCond.satisfied, false);
  check('  and names the record', overrideCond.blocking_reference, 'OVR-0001');
  ok('  with a link to it', overrideCond.link === '/console/overrides/OVR-0001');
  ok('every condition carries condition, satisfied and blocking_reference',
    pv.body.conditions.every((x) => 'condition' in x && 'satisfied' in x && 'blocking_reference' in x));

  // signer2 is scoped to SITE-PILOT only.
  const pv2 = await api(T.signer2, 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  const scope = pv2.body.conditions.find((x) => x.condition.includes('signing scope'));
  check('signer2 fails the scope condition on a SITE-DEMO lot', scope.satisfied, false);
  const sign2 = await api(T.signer2, 'POST', '/api/certificates',
    { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
  check('signer2 is refused a certificate on a SITE-DEMO lot', sign2.status, 409);

  const noPw = await api(T.signer, 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  check('a session alone is not a signing credential', noPw.status, 401);
  const badPw = await api(T.signer, 'POST', '/api/certificates',
    { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: 'wrong' });
  check('a wrong password at signing is refused', badPw.status, 401);
}

console.log('\n== clearing the conditions and signing ==');
{
  // A second person reviews the override.
  const rev = await api(T.claims, 'POST', '/api/overrides/OVR-0001/review', { note: 'Reviewed against the night shift log.' });
  check('a second person reviews the override', rev.status, 201);
  check('  setting reviewed true', rev.body.reviewed, true);
  const still = await api(T.quality, 'GET', '/api/overrides/OVR-0001');
  check('  and removing nothing', still.body.separation, 'analyst_not_dispositioner');

  // The open deviation on LOT-N6-0002 blocks the period close.
  const blocked = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  check('a close with an open deviation is refused', blocked.status, 409);
  ok('  naming which', JSON.stringify(blocked.body.blockers).includes('DEV-0001'), JSON.stringify(blocked.body));

  await api(T.quality, 'POST', '/api/deviations/DEV-0001/close', { outcome: 'cause_not_established' });
  const closed = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close',
    { closed_on: '2026-07-01', cut_off: '2026-07-10' });
  check('the period then closes', closed.status, 201);
  check('  carrying forward at the limit', closed.body.carried_forward_g.pre_consumer, 67200);
  check('  and expiring the remainder', closed.body.expired_g.pre_consumer, 336000 - 67200);
  const reopen = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  check('a closed period refuses to reopen', reopen.status, 409);
  const writeAfter = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1 });
  check('a closed period refuses a write', writeAfter.status, 409);

  const pv = await api(T.signer, 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  const unmet = pv.body.conditions.filter((x) => !x.satisfied);
  ok('every condition now holds', unmet.length === 0, JSON.stringify(unmet.map((u) => u.condition)));

  const signed = await api(T.signer, 'POST', '/api/certificates',
    { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
  check('the certificate signs', signed.status, 201);
  check('  taking the first SITE-DEMO number', signed.body.number, 'CERT-DEMO-000001');
  check('  with the computed percentage', signed.body.content_bp, 9000);
  check('  and its claim type beside it', signed.body.claim_type, 'mass_balance');
  ok('  a permitted statement', signed.body.permitted_statement.includes('mass balance'));
  ok('  a prohibited statement', signed.body.prohibited_statement.includes('may not state'));
  check('  eight conditions stored at signing', signed.body.conditions_at_signing.length, 8);
  ok('  carbon with all four components',
    signed.body.carbon.value_mg_per_kg && signed.body.carbon.boundary
    && signed.body.carbon.method_version && signed.body.carbon.uncertainty_bp);

  // The document is byte-stable.
  const d1 = await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`);
  const t1 = await d1.text();
  const d2 = await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`);
  const t2 = await d2.text();
  check('the document is byte-stable', t1 === t2, true);
  ok('  and carries no yield figure', !/yield/i.test(t1));
  ok('  the claim type appears before the percentage',
    t1.indexOf('CLAIM TYPE') < t1.indexOf('RECYCLED CONTENT'));

  const y = await api(T.plant, 'GET', '/api/lots/LOT-N6-0001/yield');
  check('a yield answers for plant operations', y.status, 200);

  // Re-check at signing: an open deviation gained since the preview refuses.
  await api(T.quality, 'POST', '/api/deviations',
    { title: 'Post-signing check', lots: ['LOT-N6-0001'], detail: 'Raised to prove the re-check.' });
  const refused = await api(T.signer, 'POST', '/api/certificates',
    { lot: 'LOT-N6-0001', recipient: 'CUS-VANTA', password: PW });
  check('a lot that gained a deviation is refused at signing', refused.status, 409);
  ok('  naming the condition that changed',
    refused.body.unmet.some((u) => u.condition.includes('deviation')), JSON.stringify(refused.body.unmet));
}

console.log('\n== withdrawal ==');
{
  const w = await api(T.signer2, 'POST', '/api/certificates/CERT-PILOT-000002/withdraw',
    { reason: 'The pilot conversion factor was superseded by a derived factor.' });
  check('the withdrawal lands', w.status, 201);
  check('  state becomes withdrawn', w.body.state, 'withdrawn');
  ok('  recipients by name, not a count', Array.isArray(w.body.notified_recipients) && w.body.notified_recipients[0].name === 'Vanta Safety Systems');
  ok('  void statements are enumerated', w.body.void_statements.length >= 4);
  ok('  derived certificates are identified', Array.isArray(w.body.derived_certificates));
  ok('  the batch traversal runs', Array.isArray(w.body.batch_traversal));
  const again = await api(T.signer2, 'POST', '/api/certificates/CERT-PILOT-000002/withdraw', { reason: 'again' });
  check('a withdrawal is never undone', again.status, 409);

  const doc = await fetch(`${BASE}/api/certificates/CERT-PILOT-000002/document`);
  const text = await doc.text();
  ok('the document still resolves', doc.status === 200);
  ok('  and says withdrawn before any figure', text.indexOf('WITHDRAWN') < text.indexOf('Recycled content'));
}

console.log('\n== public verification ==');
{
  const v = await fetch(`${BASE}/api/verify/CERT-PILOT-000001`);
  const b = await v.json();
  check('resolves with no session', v.status, 200);
  check('  found', b.found, true);
  check('  state', b.state, 'withdrawn');
  check('  withdrawn on', b.withdrawn_on, '2026-04-18');
  check('  with its reason', b.withdrawal_reason, 'A collector category was corrected after acceptance');
  check('  claim type', b.claim_type, 'mass_balance');
  check('  recipient name', b.recipient_name, 'Helios Technical Textiles');
  check('  and exactly eleven fields', Object.keys(b).sort(),
    ['claim_type', 'found', 'grade', 'issued_on', 'number', 'recipient_name', 'site', 'state', 'withdrawal_reason', 'withdrawn_on'].sort());
  ok('  no yield, collector, genealogy or carbon',
    !('yield_bp' in b) && !('collector' in b) && !('genealogy' in b) && !('carbon' in b));
  ok('  and no forwarding to a replacement', !('replacement' in b) && !('superseded_by' in b));

  const unknown = await fetch(`${BASE}/api/verify/CERT-DEMO-999999`);
  const ub = await unknown.json();
  check('an unknown number is 200', unknown.status, 200);
  check('  with found false', ub.found, false);
  check('  and the same shape', Object.keys(ub).sort(), Object.keys(b).sort());
}

console.log('\n== replay ==');
{
  const r = await api(T.auditor, 'GET', '/api/certificates/CERT-DEMO-000001/replay');
  check('replay is reproducible', r.body.reproducible, true);
  check('  and agrees', r.body.agrees, true);
  ok('  naming its input versions', !!r.body.input_versions.carbon_method);
  ok('  issued and recomputed both present', !!r.body.issued && !!r.body.recomputed);
}

console.log('\n== the record ==');
{
  const chk = await api(T.auditor, 'GET', '/api/record/check');
  check('the digest chain holds', chk.body.holds, true);
  check('  with no first failure', chk.body.first_failure, null);
  check('  and no gap', chk.body.sequence_gap, null);
  check('  genesis prev_digest is sixty-four zeroes', chk.body.genesis_prev_digest, '0'.repeat(64));

  const rec = await api(T.auditor, 'GET', '/api/record');
  ok('the record has entries', rec.body.length > 40);
  check('the first entry prev_digest', rec.body[0].prev_digest, '0'.repeat(64));
  check('seq starts at 1', rec.body[0].seq, 1);

  const edit = await api(T.auditor, 'PATCH', '/api/record/1', { act: 'changed' });
  check('an edit is refused', edit.status, 409);
  const del = await api(T.auditor, 'DELETE', '/api/record/1');
  check('a deletion is refused', del.status, 409);
  const after = await api(T.auditor, 'GET', '/api/record/check');
  check('the chain still holds after both refusals', after.body.holds, true);

  ok('a refusal is recorded as well as a success',
    rec.body.some((e) => e.outcome === 'refused'));
}

console.log('\n== retention ==');
{
  const sign = (await api(T.auditor, 'GET', '/api/record')).body
    .find((e) => e.act === 'certificate_signed' && e.object_ref === 'CERT-PILOT-000001');
  const ret = await api(T.auditor, 'GET', `/api/record/${sign.seq}/retention`);
  check('scheme months', ret.body.scheme_months, 120);
  check('statutory months', ret.body.statutory_months, 84);
  check('a legal hold stands', ret.body.legal_hold, true);
  check('  and it is HLD-0001', ret.body.legal_hold_reference, 'HLD-0001');
  ok('retain_until is the longest of the three',
    ret.body.retain_until >= ret.body.scheme_until && ret.body.retain_until >= ret.body.statutory_until);
  const expire = await api(T.auditor, 'POST', `/api/record/${sign.seq}/expire`, {});
  check('a record under hold refuses deletion', expire.status, 409);
  check('  naming the hold', expire.body.error, 'legal_hold_stands');
}

console.log('\n== inbound ==');
{
  const inb = await api(T.plant, 'GET', '/api/inbound');
  check('three seeded records', inb.body.length, 3);
  ok('each keeps its payload verbatim', inb.body.every((x) => typeof x.payload_verbatim === 'string'));
  const wb = inb.body.find((x) => x.source === 'weighbridge');
  ok('  the weighbridge ticket names WB-DEMO-02', wb.payload_verbatim.includes('WB-DEMO-02'));

  const rec = await api(T.plant, 'GET', '/api/reconciliation');
  const ages = Object.fromEntries(rec.body.integration_ages.map((a) => [a.source, a.age_hours]));
  check('customer_reporting has never sent', ages.customer_reporting, null);
  ok('weighbridge reports an age', typeof ages.weighbridge === 'number');
  ok('six figures are present',
    ['mass_balance_residual_g', 'credit_margin_g', 'consumptions_on_open_runs',
      'batches_with_broken_custody', 'certificates_with_superseded_figures', 'integration_ages']
      .every((k) => k in rec.body));
  check('one batch has broken custody', rec.body.batches_with_broken_custody, 1);
  ok('a read names the moment it saw', !!rec.body.read_at);

  const post = await api(T.plant, 'POST', '/api/inbound/laboratory',
    { received_at: new Date().toISOString(), payload: { lot: 'LOT-N6-0001', property: 'ash', value: 0.11 } });
  check('an inbound record answers its reference', post.status, 201);
  ok('  with a reference', /^INB-/.test(post.body.reference));
  const bad = await api(T.plant, 'POST', '/api/inbound/erp', { payload: {} });
  check('an unknown source is refused', bad.status, 400);
}

console.log('\n== the nine record queries ==');
{
  const names = ['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
    'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
    'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'];
  for (const n of names) {
    const r = await api(T.auditor, 'GET', `/api/record/queries/${n}`);
    ok(`${n} answers`, r.status === 200 && r.body.complete === true, JSON.stringify(r.body).slice(0, 120));
    const paged = await api(T.auditor, 'GET', `/api/record/queries/${n}?page=2`);
    ok(`  ${n} refuses a page`, paged.status === 400);
  }
  const refused = await api(T.auditor, 'GET', '/api/record/queries/refused_allocations');
  ok('refused allocations carry the margin at the instant',
    refused.body.refusals.length > 0 && refused.body.refusals[0].available_g !== null);
  const dep = await api(T.auditor, 'GET', '/api/record/queries/collector_declaration_departures');
  check('the declaration departure is 800 bp', dep.body.departures[0].departure_bp, 800);
}

console.log('\n== the auditor ==');
{
  const w = await api(T.auditor, 'POST', '/api/batches', {
    collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 100, tare_g: 0,
    net_g: 100, moisture_bp: 0, moisture_method: 'x', device: 'WB-DEMO-01', received_on: '2026-06-01'
  });
  check('an auditor writes no operational record', w.status, 403);
  const d = await api(T.auditor, 'POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' });
  check('  nor a disposition', d.status, 403);
  const r = await api(T.auditor, 'POST', '/api/runs', {
    run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'X', recipe_version: 'RCP-DISS-2',
    operator: 'X', started_at: new Date().toISOString() });
  check('  nor a run', r.status, 403);

  const g = await api(T.auditor, 'GET', '/api/lots/LOT-N6-0001/genealogy');
  check('  but reads a genealogy', g.status, 200);
  const ex = await api(T.auditor, 'POST', '/api/exports', { sites: ['SITE-DEMO'] });
  check('  and exports', ex.status, 201);
  ok('  the export carries digests', ex.body.entries.every((e) => !!e.digest));
  ok('  and the chain head', !!ex.body.chain_head_digest);
  const eq = await api(T.auditor, 'GET', '/api/record/queries/exports_by_auditor?person=auditor@example.com');
  ok('  and every export is itself an entry', eq.body.exports.length >= 1);

  const empty = await api(T.auditor, 'POST', '/api/exports', { sites: ['SITE-COMM'], certificates: ['NOTHING'] });
  ok('an export that returns nothing is recorded too', empty.status === 201);
}

console.log('\n== the public site ==');
{
  const st = await fetch(`${BASE}/api/statistics`).then((r) => r.json());
  check('three statistics', st.length, 3);
  ok('each carries a source, a year and a geography',
    st.every((s) => s.source && s.year && s.geography));
  const pos = await fetch(`${BASE}/api/positions`).then((r) => r.json());
  check('one open position', pos.length, 1);
  check('  Process Engineer', pos[0].title, 'Process Engineer');
  check('  closing', pos[0].closes_on, '2026-11-30');
  const news = await fetch(`${BASE}/api/news`).then((r) => r.json());
  check('three news items', news.length, 3);
  check('  tags', news.map((n) => n.tag).sort(), ['funding', 'partnership', 'technical']);
  ok('  one item is in another language', news.some((n) => n.language === 'fr'));

  const cr = await fetch(`${BASE}/api/claim-register`).then((r) => r.json());
  ok('the claim register substantiates each published claim',
    cr.length >= 3 && cr.every((x) => x.evidence && x.method_version && x.approver && x.review_on));

  const enq = await fetch(`${BASE}/api/enquiries`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key() },
    body: JSON.stringify({ type: 'waste_supply', name: 'A Tester', email: 'tester@example.com', message: 'We have nylon waste.' })
  });
  const eb = await enq.json();
  check('an enquiry answers 201', enq.status, 201);
  check('  with a reference', /^ENQ-/.test(eb.reference), true);
  check('  a destination', eb.destination, 'feedstock@example.com');
  check('  and a response time', eb.response_days, 3);
  ok('  a waste-supply enquiry opens a collector record', eb.opened_record.startsWith('collector_record_opened'));

  const press = await fetch(`${BASE}/api/enquiries`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key() },
    body: JSON.stringify({ type: 'press', name: 'A Journalist', email: 'press-tester@example.com', message: 'A question.' })
  });
  const pb = await press.json();
  check('a press enquiry responds in one day', pb.response_days, 1);
  ok('  and carries a deadline', !!pb.deadline);
}

console.log('\n== contracts ==');
{
  const p = await api(T.claims, 'GET', '/api/contracts/CON-VANTA-1/projection');
  check('a planned site is flagged', p.body.planned_site_flag, true);
  check('  and the flag cannot be dismissed', p.body.flag_dismissible, false);
  check('  with its shortfall consequence', p.body.shortfall_consequence, 'a make-good volume in the following period');
  check('  committed', p.body.committed_kg, 1000);
  check('  floor', p.body.floor_bp, 3000);
  const h = await api(T.claims, 'GET', '/api/contracts/CON-HELIOS-1/projection');
  check('CON-HELIOS-1 floor', h.body.floor_bp, 5000);
  check('  required remaining at nothing delivered', h.body.required_remaining_bp, 5000);
  check('  state', h.body.state, 'on_track');

  const a = await api(T.claims, 'POST', '/api/contracts/CON-HELIOS-1/allocations',
    { lot: 'LOT-N6-0001', decided_by: 'claims@example.com', favoured_over: ['CON-VANTA-1'] });
  check('a short-supply allocation records who decided', a.body.decided_by, 'claims@example.com');
  check('  and which contracts went without', a.body.favoured_over, ['CON-VANTA-1']);
  const twice = await api(T.claims, 'POST', '/api/contracts/CON-VANTA-1/allocations', { lot: 'LOT-N6-0001' });
  check('a claim already allocated is refused a second attachment', twice.status, 409);
}

console.log('\n== specifications and change control ==');
{
  const s = await api(T.quality, 'GET', '/api/specifications/SPEC-N6/versions/3');
  check('four properties', s.body.properties.length, 4);
  check('  the guaranteed ones are tested on every lot',
    s.body.properties.filter((p) => p.tested_on_every_lot).map((p) => p.property), ['relative_viscosity', 'moisture']);
  check('  virgin reference', s.body.virgin_reference.reference, 'virgin PA6 at relative viscosity 2.42');
  check('  its source', s.body.virgin_reference.source, 'EcoBase 2025');
  check('  its date', s.body.virgin_reference.date, '2025-11-30');
  check('  issued on', s.body.issued_on, '2026-02-01');
  const v2 = await api(T.quality, 'GET', '/api/specifications/SPEC-N6/versions/2');
  check('version 2 stays readable', v2.status, 200);

  const cn = await api(T.quality, 'POST', '/api/change-notices',
    { title: 'Raise dissolution temperature', detail: 'From 165 C to 178 C.', parameter: 'relative_viscosity' });
  check('a change notice derives its customers', cn.body.customers_affected.sort(), ['CUS-HELIOS', 'CUS-VANTA']);
  check('  and blocks for automotive', cn.body.blocking, true);
  ok('  stating how many qualifications', cn.body.statement.includes('may invalidate'));
  const rel = await api(T.quality, 'POST', `/api/change-notices/${cn.body.reference}/release`, {});
  check('release is refused until notice is given', rel.status, 409);
  check('  naming who is owed', rel.body.owed_notice.sort(), ['CUS-HELIOS', 'CUS-VANTA']);
  await api(T.quality, 'POST', `/api/change-notices/${cn.body.reference}/notify`, { customer: 'CUS-HELIOS' });
  await api(T.quality, 'POST', `/api/change-notices/${cn.body.reference}/notify`, { customer: 'CUS-VANTA' });
  const rel2 = await api(T.quality, 'POST', `/api/change-notices/${cn.body.reference}/release`, {});
  check('and still blocks for the automotive customer', rel2.status, 409);
  check('  until they acknowledge', rel2.body.error, 'qualification_acknowledgement_required');
}

console.log('\n== parties ==');
{
  const v = await api(T.plant, 'GET', '/api/parties/COL-BRINE/versions');
  check('two names', v.body.length, 2);
  check('  the first', v.body[0].name, 'Brine Textile Recovery');
  check('  the second', v.body[1].name, 'Brine Circular Materials');
  check('  and the first is superseded', v.body[0].superseded_on, '2026-08-01');
}

console.log('\n== blending ==');
{
  const b = await api(T.claims, 'POST', '/api/lots/LOT-N6-0001/blend', { with: 'LOT-N6-0003' });
  check('the blend lands', b.status, 201);
  check('  mass', b.body.mass_g, 600000);
  check('  content', b.body.content_bp, 8500);
  check('  names both sites', b.body.sites.sort(), ['SITE-DEMO', 'SITE-PILOT']);
  check('  and carries the provisional flag', b.body.provisional_factor, true);
  check('  taking the weaker claim type', b.body.claim_type, 'mass_balance');
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (failures.length) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); }
process.exit(fail ? 1 : 0);

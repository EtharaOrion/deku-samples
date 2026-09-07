// The cases the brief specifies that a first pass is most likely to miss.
const BASE = process.env.BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0, fail = 0; const results = [];
const ok = (n, c, d) => { if (c) { pass++; results.push(`  ok   ${n}`); }
  else { fail++; results.push(`  FAIL ${n} ${d === undefined ? '' : JSON.stringify(d).slice(0, 400)}`); } };
const tokens = {};
async function login(u) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${u}@example.com`, password: PW }) });
  tokens[u] = (await r.json()).access_token;
}
const key = () => `k-${Math.random().toString(36).slice(2)}`;
async function call(u, m, p, b, e = {}) {
  const h = { 'content-type': 'application/json' };
  if (u) h.authorization = `Bearer ${tokens[u]}`;
  if (m !== 'GET') h['idempotency-key'] = e.key || key();
  const r = await fetch(`${BASE}${p}`, { method: m, headers: h, body: b === undefined ? undefined : JSON.stringify(b) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
for (const u of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) await login(u);

console.log('- immutability');
const run = await call('plant', 'POST', '/api/runs/RUN-D-0001/consumptions', { input_reference: 'BATCH-1005', mass_g: 1000 });
ok('a closed run refuses a write', run.status === 409 && run.body.error === 'run_closed', run.body);
const close2 = await call('plant', 'POST', '/api/runs/RUN-D-0001/close', {});
ok('a second close answers 409', close2.status === 409, close2.body);
const attempts = (await call('auditor', 'GET', '/api/record?act=run_close_attempted')).body;
ok('the second close is itself recorded as an attempt', attempts.length > 0, attempts.length);

console.log('- the operational record end to end: a new batch, run and lot');
const batch = await call('plant', 'POST', '/api/batches', {
  collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer',
  gross_g: 32345, tare_g: 20000, net_g: 12345, moisture_bp: 5000,
  moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-01',
  composition: { polymer: 'PA6', fraction_bp: 9300, basis: 'sampled', measured_fraction_bp: 9300 },
  contamination: { non_nylon_bp: 400, elastane_bp: 200, coatings: 'none', colour_load: 'mixed', foreign_matter: 'none' },
  custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']
    .map((kind) => ({ kind, date: '2026-04-01', party: 'COL-ALDER' })),
});
ok('a booked batch answers the reference it took', batch.status === 201 && /^BATCH-\d+$/.test(batch.body.reference), batch.body?.reference);
ok('12345 g at 5000 bp of moisture is 6172 g dry, not 6173',
  batch.body.dry_mass_g === 6172, batch.body?.dry_mass_g);
ok('the new batch is claimable', batch.body.claimable === true, batch.body?.claimable_reason);

const newRun = await call('plant', 'POST', '/api/runs', {
  run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'EQ-DISS-A',
  recipe_version: 'RCP-DISS-2', operator: 'plant@example.com', started_at: '2026-04-02T06:00:00Z',
});
ok('a run answers the reference it took', newRun.status === 201 && /^RUN-D-\d+$/.test(newRun.body.reference), newRun.body?.reference);
const rref = newRun.body.reference;
const cons = await call('plant', 'POST', `/api/runs/${rref}/consumptions`, { input_reference: batch.body.reference, mass_g: 12345 });
ok('a consumption answers its reference', cons.status === 201 && !!cons.body.reference, cons.body);
ok('the consumption carries its dry mass, floored', cons.body.dry_mass_g === 6172, cons.body?.dry_mass_g);
const out = await call('plant', 'POST', `/api/runs/${rref}/outputs`, { kind: 'intermediate', mass_g: 10000 });
ok('an output answers its reference', out.status === 201 && !!out.body.reference, out.body);
const closed = await call('plant', 'POST', `/api/runs/${rref}/close`, { actual_set_points: { temperature_c: 165, pressure_bar: 3 } });
ok('losses are computed as mass in minus mass out', closed.body.losses_g === 2345, closed.body?.losses_g);
ok('a run inside tolerance raises no deviation', closed.body.within_tolerance === true && !closed.body.deviation, closed.body?.deviation);
ok('no route accepts a loss figure',
  (await call('plant', 'POST', '/api/runs', { run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'X', recipe_version: 'RCP-DISS-2', operator: 'x', started_at: '2026-04-02T06:00:00Z', losses_g: 5 })).status === 400);

// A run outside its recipe tolerance raises a deviation whether or not its
// output passed its tests.
const badRun = await call('plant', 'POST', '/api/runs', {
  run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'EQ-DISS-B',
  recipe_version: 'RCP-DISS-2', operator: 'plant@example.com', started_at: '2026-04-03T06:00:00Z' });
await call('plant', 'POST', `/api/runs/${badRun.body.reference}/outputs`, { kind: 'intermediate', mass_g: 100 });
const badClose = await call('plant', 'POST', `/api/runs/${badRun.body.reference}/close`, { actual_set_points: { temperature_c: 185, pressure_bar: 3 } });
ok('a run outside tolerance raises a deviation',
  badClose.body.within_tolerance === false && !!badClose.body.deviation, badClose.body?.deviation);

console.log('- custody arriving late');
const late = await call('plant', 'POST', '/api/batches/BATCH-1005/custody', {
  kind: 'transport', date: '2026-03-02', party: 'COL-ALDER', arrived_on: '2026-05-20' });
ok('late evidence makes the batch claimable from the date it arrived',
  late.body.claimable === true && late.body.claimable_from === '2026-05-20', late.body);

console.log('- partial rejection');
const reject = await call('plant', 'POST', '/api/batches/BATCH-1002/reject', {
  rejected_g: 50000, reason: 'Coated selvedge beyond the sampling plan', destination: 'energy recovery, Lyon' });
ok('a partial rejection records where the rejected mass went',
  reject.body.rejected_g === 50000 && reject.body.accepted_g === 250000
  && reject.body.rejected_destination === 'energy recovery, Lyon', reject.body);
const noSum = await call('plant', 'POST', '/api/batches/BATCH-1002/reject', {
  rejected_g: 10, accepted_g: 10, reason: 'x', destination: 'y' });
ok('a rejection whose parts do not sum is refused', noSum.status === 409, noSum.body);

console.log('- test results and method mismatch');
const mismatch = await call('analyst', 'POST', '/api/test-results', {
  lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ASTM D789',
  instrument: 'VIS-03', value: '2.45', unit: 'ratio', uncertainty_bp: 90 });
ok('a result by another method answers method_mismatch true and usable_for_release false',
  mismatch.body.method_mismatch === true && mismatch.body.usable_for_release === false, mismatch.body);
ok('a result with no method is refused',
  (await call('analyst', 'POST', '/api/test-results', { lot: 'LOT-N6-0001', property: 'moisture', value: '0.05', unit: 'percent' })).status === 400);

console.log('- the separation an analyst breaks');
const analystResult = await call('quality', 'POST', '/api/test-results', {
  lot: 'LOT-N6-0002', property: 'moisture', method: 'ISO 15512', value: '0.05', unit: 'percent' });
ok('a quality manager may enter a result', analystResult.status === 201);
const ownDisp = await call('quality', 'POST', '/api/lots/LOT-N6-0002/disposition', { disposition: 'released' });
ok('whoever entered a result does not disposition that lot',
  ownDisp.status === 403 && ownDisp.body.error === 'separation_analyst_not_dispositioner', ownDisp.body);
ok('the refusal names the separation and the blocking record',
  ownDisp.body.separation === 'analyst_not_dispositioner' && !!ownDisp.body.blocking_reference, ownDisp.body);

console.log('- overrides');
const shortReason = await call('quality', 'POST', '/api/overrides', {
  separation: 'analyst_not_dispositioner', reason: 'too short', lot: 'LOT-N6-0002', authorised_by: 'quality@example.com' });
ok('an override reason under forty characters is refused',
  shortReason.status === 400 && shortReason.body.minimum === 40, shortReason.body);
const ovr = await call('quality', 'POST', '/api/overrides', {
  separation: 'analyst_not_dispositioner',
  reason: 'The only qualified analyst on the night shift also set the disposition.',
  lot: 'LOT-N6-0002', authorised_by: 'quality@example.com' });
ok('an override answers its reference', ovr.status === 201 && /^OVR-/.test(ovr.body.reference), ovr.body);
ok('an analyst may not review an override',
  (await call('analyst', 'POST', `/api/overrides/${ovr.body.reference}/review`, {})).status === 403);
ok('a plant operator may not review an override',
  (await call('plant', 'POST', `/api/overrides/${ovr.body.reference}/review`, {})).status === 403);

console.log('- transfers keep the total credit unchanged');
const before = await Promise.all([
  call('claims', 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1'),
  call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1'),
]);
// Total credit is what each ledger holds including what arrived from elsewhere.
const total = (rows) => rows.reduce((s, r) => s + r.body.post_consumer.total_credit_g + r.body.pre_consumer.total_credit_g, 0);
const totalBefore = total(before);
const trf = await call('claims', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/transfers', {
  to_period: 'BP-DEMO-N6-2026H1', category: 'post_consumer', mass_g: 10000 });
ok('a transfer answers its reference and is never a fresh credit',
  trf.status === 201 && /^TRF-/.test(trf.body.reference) && trf.body.fresh_credit === false, trf.body);
ok('the receiving period answers inbound_credits naming the origin site',
  trf.body.inbound_credits.some((x) => x.origin_site === 'SITE-PILOT' && x.fresh_credit === false), trf.body.inbound_credits);
const after = await Promise.all([
  call('claims', 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1'),
  call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1'),
]);
ok('the total credit across the two periods is unchanged by the journey',
  total(after) === totalBefore, { before: totalBefore, after: total(after) });

console.log('- restatements');
const rst = await call('claims', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/restatements', {
  reason: 'The pilot loss window was derived and the provisional factor is superseded.',
  revised_factor_bp: 7000 });
ok('a restatement enumerates every certificate issued from the period',
  rst.status === 201 && rst.body.certificates.length === 2, rst.body?.certificates);
ok('a revised factor answers content_movements with the figure that moved',
  rst.body.content_movements.length === 2
  && rst.body.content_movements[0].content_bp !== undefined
  && rst.body.content_movements[0].corrected_content_bp !== undefined, rst.body?.content_movements);
const res1 = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, {
  certificate: 'CERT-PILOT-000001', outcome: 'unaffected', reason: 'It was already withdrawn on other grounds.' });
ok('a resolution answers its reference', res1.status === 201 && !!res1.body.reference, res1.body);
const res2 = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, {
  certificate: 'CERT-PILOT-000001', outcome: 'withdrawn', reason: 'A second attempt at the same one.' });
ok('a second resolution against the same certificate is refused', res2.status === 409, res2.body);
const many = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, {
  certificate: ['CERT-PILOT-000001', 'CERT-PILOT-000002'], outcome: 'withdrawn', reason: 'Both at once.' });
ok('no route resolves more than one certificate at a time', many.status === 400, many.body);

console.log('- a consumption into a closed period opens a restatement');
// An open run, so the refusal under test is the period's and not the run's.
const openRun = await call('plant', 'POST', '/api/runs', {
  run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'EQ-DISS-A',
  recipe_version: 'RCP-DISS-2', operator: 'plant@example.com', started_at: '2026-04-04T06:00:00Z' });
const intoClosed = await call('plant', 'POST', `/api/runs/${openRun.body.reference}/consumptions`, {
  input_reference: 'BATCH-1001', mass_g: 100, effective_on: '2025-09-01' });
ok('a consumption effective in a closed period is refused and opens a restatement',
  intoClosed.status === 409 && intoClosed.body.error === 'period_closed' && /^RST-/.test(intoClosed.body.restatement), intoClosed.body);

console.log('- carbon method versions and recomputation');
ok('a claims manager may not publish a carbon method version',
  (await call('claims', 'POST', '/api/carbon-methods/CM-PA6/versions', { boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'X' })).status === 403);
const recompute = await call('claims', 'POST', '/api/carbon-figures/CFG-0001/recompute', {
  reason: 'A supplier-specific reagent factor was revised.' });
ok('a recomputation produces a new figure version alongside the old',
  recompute.status === 201 && recompute.body.supersedes === 'CFG-0001' && !!recompute.body.reference, recompute.body);
ok('a recomputation records a person, a date and a reason',
  !!recompute.body.recomputed_by && !!recompute.body.recomputed_on && !!recompute.body.reason);
ok('a recomputation enumerates every certificate carrying the superseded figure',
  Array.isArray(recompute.body.certificates_carrying_superseded_figure) && recompute.body.complete === true,
  recompute.body.certificates_carrying_superseded_figure);

console.log('- change control');
const chg = await call('quality', 'POST', '/api/change-notices', {
  title: 'Raise the repolymerisation temperature band by five degrees',
  detail: 'The published temperature threshold moves, so this is a change before release.',
  parameter: 'temperature_c', qualification_relevant: true, grade: 'N6' });
ok('a change notice derives its affected specifications, customers and qualifications',
  chg.status === 201 && chg.body.specifications_affected.length > 0
  && chg.body.customers_affected.length > 0 && chg.body.qualifications_affected.length > 0, chg.body);
ok('a change touching a qualification-relevant parameter for an automotive customer blocks',
  chg.body.blocks === true && chg.body.blocking_customers.some((x) => x.industry === 'automotive'), chg.body?.blocking_customers);
ok('the blocking message names the count of qualifications',
  /This change may invalidate \d+ customer qualifications\./.test(chg.body.message), chg.body?.message);
const release = await call('quality', 'POST', `/api/change-notices/${chg.body.reference}/release`, {});
ok('a release is refused until every customer owed notice has been notified',
  release.status === 409 && release.body.owed.length > 0, release.body);
for (const c of chg.body.customers_affected) {
  await call('quality', 'POST', `/api/change-notices/${chg.body.reference}/notify`, { customer: c.reference });
}
const release2 = await call('quality', 'POST', `/api/change-notices/${chg.body.reference}/release`, {});
ok('a release lands once every customer has been notified', release2.status === 200, release2.body);

console.log('- a suspension that reaches backwards');
const susp = await call('quality', 'POST', '/api/sites/SITE-PILOT/certification', {
  state: 'suspended', effective_from: '2026-03-01', reason: 'A scheme audit finding on the pilot mass balance.' });
ok('a suspension answers every certificate signed inside its window',
  susp.status === 201 && susp.body.certificates_in_window.length === 2, susp.body?.certificates_in_window);
ok('each is individually resolvable under the three restatement outcomes',
  susp.body.certificates_in_window.every((x) => x.resolution_options.length === 3 && x.resolution === null));
ok('issuing stops with the suspension named as the blocking condition',
  susp.body.issuing_stopped === true && /suspended from 2026-03-01/.test(susp.body.blocking_condition), susp.body?.blocking_condition);
const signAfter = await call('signer2', 'POST', '/api/certificates', { lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS', password: PW });
ok('a suspended site refuses a signature, naming the scope condition',
  signAfter.status === 409 && signAfter.body.blocking.some((b) => b.condition === 'signer_holds_scope'), signAfter.body?.blocking);
const lift = await call('quality', 'POST', '/api/sites/SITE-PILOT/certification', {
  state: 'lifted', effective_from: '2026-09-01', reason: 'The finding was closed.' });
ok('lifting does not reinstate a withdrawn certificate',
  lift.body.reinstates_withdrawn === false && /remedy is a new certificate/.test(lift.body.note), lift.body?.note);

console.log('- retention and legal hold');
const seq = (await call('auditor', 'GET', '/api/record')).body.at(-1).seq;
const hold = await call('quality', 'POST', `/api/record/${seq}/legal-hold`, { reason: 'A regulator has asked.' });
ok('a legal hold answers its reference', hold.status === 201 && /^HLD-/.test(hold.body.reference), hold.body);
const ret = (await call('auditor', 'GET', `/api/record/${seq}/retention`)).body;
ok('the retention answer carries legal_hold true', ret.legal_hold === true, ret);
ok('a record under hold refuses deletion',
  (await call('quality', 'POST', `/api/record/${seq}/expire`, {})).status === 409);
const lifted = await call('quality', 'DELETE', `/api/record/${seq}/legal-hold`);
ok('lifting a hold is an entry of its own', lifted.status === 200 && !!lifted.body.entry, lifted.body);
ok('a hold lifted is reported', (await call('auditor', 'GET', `/api/record/${seq}/retention`)).body.legal_hold === false);
const notYet = await call('quality', 'POST', `/api/record/${seq}/expire`, {});
ok('the content is not deleted before retain_until has passed', notYet.status === 409 && notYet.body.error === 'retention_not_reached', notYet.body);

console.log('- the chain still holds after every act above');
const chain = (await call('auditor', 'GET', '/api/record/check')).body;
ok('the digest chain still verifies', chain.holds === true, chain);

console.log('- byproduct share');
const share = (await call('claims', 'GET', '/api/outputs/OUT-U-0002/share')).body;
ok('OUT-U-0002 is 40000 g of 760000 g, so 526 basis points',
  share.share_bp === 526 && share.mass_g === 40000 && share.total_output_mass_g === 760000, share);
ok('a sold byproduct takes a share of the claim and of the emissions on a stated basis',
  share.claim_share_g > 0 && share.allocation_basis === 'mass', share);

console.log('- a converter and a collector never see a genealogy or a lot');
ok('the yield route refuses a converter and a collector by role',
  (await call('signer', 'GET', '/api/lots/LOT-N6-0001/yield')).status === 403);

console.log('');
console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Walks the API against the figures the brief states. node tools/verify.mjs
const BASE = process.env.VERIFY_BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';

let pass = 0, fail = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}\n       expected ${e}\n       actual   ${a}`); }
}
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? '  ' + detail : ''}`); }
}

const tokens = {};
async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  tokens[email] = j.access_token;
  return j;
}
let keyN = Date.now();
async function api(path, { as, method = 'GET', body, key, headers = {} } = {}) {
  const h = { ...headers };
  if (as) h.authorization = `Bearer ${tokens[as]}`;
  if (body !== undefined) {
    h['content-type'] = 'application/json';
    h['idempotency-key'] = key || `k-${keyN++}`;
  }
  const r = await fetch(`${BASE}/api${path}`, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

console.log('\n== identity ==');
for (const e of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
  const j = await login(`${e}@example.com`);
  ok(`${e}@example.com signs in`, !!j.access_token);
}
const me = await api('/auth/me', { as: 'signer2@example.com' });
check('signer2 sites', me.body.sites, ['SITE-PILOT']);
check('signer2 roles', me.body.roles, ['certificate_signer']);

console.log('\n== sites and capacity ==');
const sites = await api('/sites', { as: 'quality@example.com' });
check('three sites', sites.body.length, 3);
const comm = await api('/sites/SITE-COMM/capacity', { as: 'quality@example.com' });
check('SITE-COMM uncommitted_kg', comm.body.uncommitted_kg, -1000000);
check('SITE-COMM confidence', comm.body.confidence, 'planned');
check('capacity basis', comm.body.basis, '8000 hours per year, 0.90 availability, 0.80 yield');
check('last_revised', comm.body.last_revised, '2026-06-30');

console.log('\n== batches ==');
const batches = await api('/batches', { as: 'plant@example.com' });
const B = Object.fromEntries(batches.body.map((b) => [b.reference, b]));
check('BATCH-1001 dry mass', B['BATCH-1001'].dry_mass_g, 450000);
check('BATCH-1003 dry mass', B['BATCH-1003'].dry_mass_g, 190000);
check('BATCH-1003 not claimable', B['BATCH-1003'].claimable, false);
check('BATCH-1003 reason', B['BATCH-1003'].claimable_reason, 'collector_approval_lapsed');
check('BATCH-1003 name in force on its receipt date', B['BATCH-1003'].collector_name, 'Brine Textile Recovery');
check('BATCH-1004 claimable', B['BATCH-1004'].claimable, true);
ok('BATCH-1004 carries lapsed_calibration', B['BATCH-1004'].flags.includes('lapsed_calibration'));
check('BATCH-1005 reason', B['BATCH-1005'].claimable_reason, 'custody_link_missing');
check('BATCH-1005 missing kind', B['BATCH-1005'].claimable_missing_kind, 'transport');
check('BATCH-1004 measured fraction', B['BATCH-1004'].composition.measured_fraction_bp, 9100);

console.log('\n== the floor rule ==');
const wc = await api('/batches', { as: 'plant@example.com', method: 'POST', body: {
  collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer',
  gross_g: 32345, tare_g: 20000, net_g: 12345, moisture_bp: 5000,
  moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-01',
  composition: { polymer: 'PA6', fraction_bp: 9000, basis: 'sampled' },
  contamination: { non_nylon_bp: 100, elastane_bp: 0, coatings: 'none', colour_load: 'mixed', foreign_matter: 'none' },
  custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']
    .map((k) => ({ kind: k, date: '2026-04-01', party: 'COL-ALDER' })),
} });
check('12345 g at 5000 bp floors to 6172', wc.body.dry_mass_g, 6172);
ok('a created record answers with its reference', !!wc.body.reference, JSON.stringify(wc.body).slice(0, 300));

console.log('\n== category is immutable after acceptance ==');
for (const who of ['plant@example.com', 'quality@example.com', 'claims@example.com']) {
  const r = await api('/batches/BATCH-1001', { as: who, method: 'PATCH', body: { category: 'pre_consumer' } });
  check(`${who} refused a category change`, [r.status, r.body.error], [409, 'batch_category_immutable_after_acceptance']);
}

console.log('\n== idempotency ==');
const kk = `idem-${Date.now()}`;
const body1 = { source: 'weighbridge', received_at: '2026-06-01T00:00:00Z', payload: { a: 1 } };
const i1 = await api('/inbound/weighbridge', { as: 'plant@example.com', method: 'POST', body: body1, key: kk });
const i2 = await api('/inbound/weighbridge', { as: 'plant@example.com', method: 'POST', body: body1, key: kk });
check('same key same body returns the original', i1.body.reference, i2.body.reference);
const i3 = await api('/inbound/weighbridge', { as: 'plant@example.com', method: 'POST', body: { ...body1, payload: { a: 2 } }, key: kk });
check('same key different body is 409', [i3.status, i3.body.error], [409, 'idempotency_key_reuse']);
const noKey = await fetch(`${BASE}/api/inbound/weighbridge`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens['plant@example.com']}` },
  body: JSON.stringify(body1),
});
check('a write with no key is refused', noKey.status, 400);

console.log('\n== genealogy ==');
const gen = await api('/lots/LOT-N6-0001/genealogy', { as: 'auditor@example.com' });
const b1001 = gen.body.nodes.filter((n) => n.reference === 'BATCH-1001');
check('BATCH-1001 appears exactly once', b1001.length, 1);
check('BATCH-1001 carries its total mass', b1001[0].mass_g, 450000);
ok('flagged at the top level', gen.body.flagged === true);
ok('a text equivalent', !!gen.body.text_equivalent);
const pageRefused = await api('/lots/LOT-N6-0001/genealogy?page=1', { as: 'auditor@example.com' });
check('the traversal refuses a page parameter', pageRefused.status, 400);
const impact = await api('/batches/BATCH-1001/impact', { as: 'auditor@example.com' });
ok('the reverse traversal names its lots', impact.body.lots.length >= 2, JSON.stringify(impact.body.lots));
const t0 = Date.now();
await api('/batches/BATCH-1001/impact', { as: 'auditor@example.com' });
ok('the traversal answers within five seconds', Date.now() - t0 < 5000, `${Date.now() - t0}ms`);

console.log('\n== the ledger ==');
const bp = await api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' });
check('post-consumer credits in', bp.body.post_consumer.credits_in_g, 360000);
check('pre-consumer credits in', bp.body.pre_consumer.credits_in_g, 336000);
check('post-consumer credits out', bp.body.post_consumer.credits_out_g, 0);
check('post-consumer available', bp.body.post_consumer.credits_available_g, 360000);
check('non-claimable input', bp.body.non_claimable_input_g, 190000);
check('override count', bp.body.override_count, 1);
check('open restatement count', bp.body.open_restatement_count, 0);
check('open finding count', bp.body.open_finding_count, 1);
const inbound = bp.body.inbound_credits.find((x) => x.movement === 'TRF-0001');
check('the transfer is an inbound credit naming its origin',
  [inbound.origin_site, inbound.fresh_credit, inbound.mass_g], ['SITE-PILOT', false, 50000]);

console.log('\n== allocation, and the refusal ==');
const over = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', {
  as: 'claims@example.com', method: 'POST', body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 500000 } });
check('an allocation over the available is 409', over.status, 409);
check('it names the available and requested masses', [over.body.available_g, over.body.requested_g], [360000, 500000]);
const after = await api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' });
check('nothing moved', after.body.post_consumer.credits_available_g, 360000);
const noPct = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', {
  as: 'claims@example.com', method: 'POST', body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000, content_bp: 9000 } });
check('no route accepts a percentage', [noPct.status, noPct.body.error], [400, 'computed_figure_not_accepted']);
const wrongRole = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', {
  as: 'plant@example.com', method: 'POST', body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000 } });
check('a plant operator may not allocate', wrongRole.status, 403);

console.log('\n== two allocations racing ==');
// The pre-consumer remainder is the one both racers reach for. The two
// categories are never netted, so this leaves the post-consumer side alone.
const race = await Promise.all([
  api('/balance-periods/BP-DEMO-N6-2026H1/allocations', { as: 'claims@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0002', category: 'pre_consumer', mass_g: 336000 }, key: `race-a-${Date.now()}` }),
  api('/balance-periods/BP-DEMO-N6-2026H1/allocations', { as: 'claims@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0002', category: 'pre_consumer', mass_g: 336000 }, key: `race-b-${Date.now()}` }),
]);
check('exactly one 201 and exactly one 409', race.map((r) => r.status).sort(), [201, 409]);
const raced = await api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' });
check('pre-consumer available is now zero', raced.body.pre_consumer.credits_available_g, 0);
ok('and it never went below zero', raced.body.pre_consumer.credits_available_g >= 0);
check('the post-consumer side is untouched', raced.body.post_consumer.credits_available_g, 360000);

console.log('\n== the worked allocation ==');
// The post-consumer side is untouched, so the worked case stands on its own.

const alloc = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', {
  as: 'claims@example.com', method: 'POST',
  body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 } });
check('360000 g of post-consumer claim attaches', alloc.status, 201);
const bpAfter = await api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' });
check('post-consumer available is now zero', bpAfter.body.post_consumer.credits_available_g, 0);
const further = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', {
  as: 'claims@example.com', method: 'POST', body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1 } });
check('a further post-consumer allocation is refused', further.status, 409);
const lot1 = await api('/lots/LOT-N6-0001', { as: 'claims@example.com' });
check('the lot names its post-consumer claim', lot1.body.category_split.post_consumer, 360000);

console.log('\n== carbon ==');
const carbon = await api('/lots/LOT-N6-0001/carbon', { as: 'quality@example.com' });
check('value', carbon.body.value_mg_per_kg, 4260000);
check('uncertainty', carbon.body.uncertainty_bp, 1200);
check('primary share', carbon.body.primary_share_bp, 6500);
check('boundary', carbon.body.boundary, 'cradle-to-gate');
check('method version', carbon.body.method_version, 'CM-PA6 v2');
check('not default led', carbon.body.default_led, false);
check('the breakdown sums to the value', carbon.body.breakdown_sums_to_value, true);
check('comparator', [carbon.body.comparator.material, carbon.body.comparator.dataset,
  carbon.body.comparator.dataset_year, carbon.body.comparator.region],
  ['virgin PA6', 'EcoBase 2025', 2025, 'EU-27']);
check('energy location', carbon.body.energy_location_mg_per_kg, 1850000);
check('energy market', carbon.body.energy_market_mg_per_kg, 620000);
check('metered kwh', carbon.body.metered_kwh, 300000);
check('retired kwh', carbon.body.retired_kwh, 250000);
check('unmatched kwh', carbon.body.unmatched_kwh, 50000);
const held = await api('/energy-instruments/EAC-2025-0031/retire', {
  as: 'quality@example.com', method: 'POST', body: { period: 'BP-DEMO-N6-2026H1' } });
check('a held instrument of the wrong vintage is refused', held.status, 409);
ok('and refused on both counts', held.body.reasons.length >= 2, JSON.stringify(held.body.reasons));

console.log('\n== byproduct share ==');
const share = await api('/outputs/OUT-U-0002/share', { as: 'quality@example.com' });
check('OUT-U-0002 share_bp', share.body.share_bp, 526);
check('total output mass', share.body.total_output_mass_g, 760000);

console.log('\n== conversion factors ==');
const badFactor = await api('/conversion-factors', { as: 'claims@example.com', method: 'POST',
  body: { site: 'SITE-DEMO', factor_bp: 9000, derived_from: '2026-04-01', derived_to: '2026-06-30',
    derived_in_g: 1000000, derived_out_g: 800000 } });
check('a factor that does not reconcile is refused', [badFactor.status, badFactor.body.expected_factor_bp], [409, 8000]);

console.log('\n== the eight conditions ==');
const preview = await api('/certificates/preview', { as: 'signer@example.com', method: 'POST',
  body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' } });
check('exactly eight conditions', preview.body.conditions.length, 8);
const blocking = preview.body.conditions.filter((x) => !x.satisfied);
check('one condition blocks', blocking.length, 1);
check('and it is the unreviewed override', blocking[0].condition, 'no_unreviewed_override');
check('naming the record that would resolve it', blocking[0].blocking_reference, 'OVR-0001');
const selfReview = await api('/overrides/OVR-0001/review', { as: 'quality@example.com', method: 'POST', body: {} });
check('the authoriser may not review', [selfReview.status, selfReview.body.error], [403, 'authoriser_may_not_review']);
const review = await api('/overrides/OVR-0001/review', { as: 'claims@example.com', method: 'POST', body: {} });
check('a second person reviews it', [review.status, review.body.reviewed], [200, true]);
const preview2 = await api('/certificates/preview', { as: 'signer@example.com', method: 'POST',
  body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' } });
check('all eight now hold', preview2.body.conditions.every((x) => x.satisfied), true);

console.log('\n== signing ==');
const noPw = await api('/certificates', { as: 'signer@example.com', method: 'POST',
  body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' } });
check('a session alone is not a signing credential', noPw.status, 401);
const outOfScope = await api('/certificates', { as: 'signer2@example.com', method: 'POST',
  body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW } });
check('signer2 is refused a SITE-DEMO lot', [outOfScope.status, outOfScope.body.error],
  [403, 'signer_scope_does_not_cover_site']);
const signed = await api('/certificates', { as: 'signer@example.com', method: 'POST',
  body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW } });
check('the first SITE-DEMO certificate', signed.body.number, 'CERT-DEMO-000001');
check('the claim type sits beside the percentage',
  [signed.body.claim_type, typeof signed.body.content_bp], ['mass_balance', 'number']);
ok('no yield figure on a certificate', !JSON.stringify(signed.body).includes('yield'));

console.log('\n== the document ==');
const t1 = await (await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`)).text();
const t2 = await (await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`)).text();
check('two reads return identical bytes', t1 === t2, true);
ok('the document states the claim type', t1.includes('mass_balance'));
ok('the document carries the prohibited statement',
  t1.includes('You may not state that this material physically contains recycled content.'));

console.log('\n== verify, public ==');
const v1 = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000001`)).json();
check('found', v1.found, true);
check('state', v1.state, 'withdrawn');
check('withdrawn on', v1.withdrawn_on, '2026-04-18');
check('reason', v1.withdrawal_reason, 'A collector category was corrected after acceptance');
check('these keys and nothing else', Object.keys(v1).sort(),
  ['claim_type', 'found', 'grade', 'issued_on', 'number', 'recipient_name', 'site', 'state',
    'withdrawal_reason', 'withdrawn_on']);
const v2r = await fetch(`${BASE}/api/verify/CERT-DEMO-999999`);
const v2 = await v2r.json();
check('an unknown number is 200 with found false', [v2r.status, v2.found], [200, false]);

console.log('\n== withdrawal ==');
const wd = await api('/certificates/CERT-PILOT-000002/withdraw', { as: 'signer2@example.com', method: 'POST',
  body: { reason: 'The pilot conversion factor was restated after issue' } });
check('state', wd.body.state, 'withdrawn');
ok('recipients are named, not counted',
  Array.isArray(wd.body.notified_recipients) && !!wd.body.notified_recipients[0].name);
ok('void statements are enumerated', wd.body.void_statements.length > 0);
ok('the reverse traversal ran', !!wd.body.batch_traversal);
const stillThere = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000002`)).json();
check('the address still resolves and states the withdrawal', stillThere.state, 'withdrawn');

console.log('\n== replay ==');
const replay = await api('/certificates/CERT-DEMO-000001/replay', { as: 'auditor@example.com' });
ok('replay answers agrees', typeof replay.body.agrees === 'boolean');
ok('and names its input versions', !!replay.body.input_versions);

console.log('\n== the record ==');
const chain = await api('/record/check', { as: 'auditor@example.com' });
check('the digest chain verifies', chain.body.holds, true);
const rec = await api('/record', { as: 'auditor@example.com' });
check('the first prev_digest is sixty-four zeroes', rec.body[0].prev_digest, '0'.repeat(64));
ok('a refusal is recorded as well as a success', rec.body.some((e) => e.outcome === 'refused'));

console.log('\n== the nine record queries ==');
for (const name of ['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
  'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor']) {
  const r = await api(`/record/queries/${name}`, { as: 'auditor@example.com' });
  ok(`${name} answers a complete set`, r.status === 200 && r.body.complete === true, `status ${r.status}`);
  const paged = await api(`/record/queries/${name}?limit=1`, { as: 'auditor@example.com' });
  ok(`${name} refuses a limit`, paged.status === 400);
}

console.log('\n== retention ==');
const ret = await api('/record/1/retention', { as: 'auditor@example.com' });
ok('retain_until is the longest of the three', ret.body.retain_until >= ret.body.scheme_until);
const holdEntry = rec.body.find((e) => e.action === 'certificate_signed' && e.object_ref === 'CERT-PILOT-000001');
const heldRet = await api(`/record/${holdEntry.seq}/retention`, { as: 'auditor@example.com' });
check('the seeded legal hold stands', heldRet.body.legal_hold, true);
const expire = await api(`/record/${holdEntry.seq}/expire`, { as: 'quality@example.com', method: 'POST',
  body: { force_after_retention: true } });
check('a record under hold refuses deletion', [expire.status, expire.body.error], [409, 'legal_hold_stands']);

console.log('\n== the auditor writes nothing ==');
for (const [p, b] of [['/batches', { collector: 'COL-ALDER' }], ['/deviations', { detail: 'x' }],
  ['/overrides', { separation: 'analyst_not_dispositioner' }], ['/runs', { run_type: 'dissolution' }],
  ['/test-results', { method: 'ISO 307' }]]) {
  const r = await api(p, { as: 'auditor@example.com', method: 'POST', body: b });
  ok(`an auditor is refused ${p}`, r.status === 403, `got ${r.status}`);
}
const exp = await api('/exports', { as: 'auditor@example.com', method: 'POST', body: { sites: ['SITE-DEMO'] } });
check('but an auditor exports', exp.status, 201);
ok('and the export carries its anchor digests', !!exp.body.anchor.last_digest);
const expQ = await api('/record/queries/exports_by_auditor', { as: 'auditor@example.com' });
ok('the export shows in exports_by_auditor', expQ.body.results.length > 0);

console.log('\n== inbound and reconciliation ==');
const recon = await api('/reconciliation', { as: 'auditor@example.com' });
const cr = recon.body.integration_ages.find((x) => x.source === 'customer_reporting');
check('customer_reporting reports null rather than zero', cr.age_hours, null);
ok('six figures', ['mass_balance_residual_g', 'credit_margin_g', 'consumptions_on_open_runs',
  'batches_with_broken_custody', 'certificates_with_superseded_figures', 'integration_ages']
  .every((k) => k in recon.body));
const inb = await api('/inbound', { as: 'auditor@example.com' });
ok('payloads are kept verbatim', inb.body.every((r) => typeof r.payload_verbatim === 'string'));

console.log('\n== separations ==');
const analystDisp = await api('/lots/LOT-N6-0003/disposition', { as: 'analyst@example.com', method: 'POST',
  body: { disposition: 'released' } });
check('an analyst may not set a disposition', analystDisp.status, 403);
const plantApprove = await api('/collectors/COL-ALDER/approvals', { as: 'plant@example.com', method: 'POST',
  body: { state: 'approved', valid_from: '2027-01-01', valid_to: '2027-12-31' } });
check('a plant operator may not approve a collector', plantApprove.status, 403);
const claimsMethod = await api('/carbon-methods/CM-PA6/versions', { as: 'claims@example.com', method: 'POST',
  body: { standard: 'ISO 14067', functional_unit: '1 kg', boundary: 'cradle-to-gate',
    allocation_basis: 'mass', reviewer: 'x' } });
check('a claims manager may not alter a carbon method', claimsMethod.status, 403);
const claimsSign = await api('/certificates', { as: 'claims@example.com', method: 'POST',
  body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW } });
check('a claims manager may not sign', claimsSign.status, 403);
const shortOverride = await api('/overrides', { as: 'quality@example.com', method: 'POST',
  body: { separation: 'analyst_not_dispositioner', reason: 'too short', lot: 'LOT-N6-0001',
    authorised_by: 'PSN-0003' } });
check('an override reason under forty characters is refused',
  [shortOverride.status, shortOverride.body.error], [400, 'reason_too_short']);

console.log('\n== blending ==');
// LOT-N6-0001 now carries 360000 g on 400000 g, which is 9000 bp, and
// LOT-N6-0003 carries 150000 g on 200000 g, which is 7500 bp.
const lotA = await api('/lots/LOT-N6-0001', { as: 'claims@example.com' });
const lotB = await api('/lots/LOT-N6-0003', { as: 'claims@example.com' });
check('LOT-N6-0001 is at 9000 bp', lotA.body.content_bp, 9000);
check('LOT-N6-0003 is at 7500 bp', lotB.body.content_bp, 7500);
const blend = await api('/lots/LOT-N6-0001/blend', { as: 'claims@example.com', method: 'POST',
  body: { with: 'LOT-N6-0003' } });
check('blended mass', blend.body.mass_g, 600000);
check('blended content is mass weighted and floored', blend.body.content_bp, 8500);
check('both sites are named', blend.body.sites_named.sort(), ['SITE-DEMO', 'SITE-PILOT']);
check('and it carries the provisional factor flag', blend.body.provisional_factor, true);

console.log('\n== runs ==');
const close2 = await api('/runs/RUN-D-0001/close', { as: 'plant@example.com', method: 'POST', body: {} });
check('a second close is 409', [close2.status, close2.body.error], [409, 'run_already_closed']);
const cons2 = await api('/runs/RUN-D-0001/consumptions', { as: 'plant@example.com', method: 'POST',
  body: { input_kind: 'batch', input_ref: 'BATCH-1001', mass_g: 100 } });
check('a closed run refuses a write', cons2.status, 409);
const r1 = await api('/runs/RUN-D-0001', { as: 'plant@example.com' });
check('RUN-D-0001 losses', r1.body.losses_g, 120000);
check('RUN-D-0001 is inside tolerance', r1.body.within_tolerance, true);

console.log('\n== public site ==');
const stats = await (await fetch(`${BASE}/api/statistics`)).json();
check('three statistics', stats.length, 3);
ok('each carries a source, a year and a geography', stats.every((s) => s.source && s.year && s.geography));
const pos = await (await fetch(`${BASE}/api/positions`)).json();
check('one open position', pos.length, 1);
const news = await (await fetch(`${BASE}/api/news`)).json();
check('three news items', news.length, 3);
check('a real taxonomy', news.map((n) => n.tag).sort(), ['funding', 'partnership', 'technical']);
ok('one item declares another language', news.some((n) => n.language === 'fr'));

console.log('\n== enquiries ==');
const enq = await api('/enquiries', { method: 'POST', body: {
  type: 'waste_supply', name: 'A Collector', email: 'collector@example.com', message: 'We have nylon waste.' } });
check('an enquiry answers its destination and response time',
  [enq.status, enq.body.destination, enq.body.response_days], [201, 'feedstock@example.com', 3]);
ok('and it opens a collector record', enq.body.opened?.kind === 'collector');

console.log('\n== mail ==');
const mail = await (await fetch('http://mailpit:8025/api/v1/messages?limit=200')).json();
const subjects = mail.messages.map((m) => m.Subject);
ok('a certificate issued mail', subjects.some((s) => s === 'Certificate CERT-DEMO-000001 issued'), subjects.join(' | '));
ok('a certificate withdrawn mail', subjects.some((s) => s === 'Certificate CERT-PILOT-000002 withdrawn'));
ok('an enquiry mail', subjects.some((s) => /^Enquiry ENQ-.* received$/.test(s)));
ok('exactly one recipient and no copies', mail.messages.every((m) => m.To.length === 1 && (!m.Cc || m.Cc.length === 0)));

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (failures.length) console.log('failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);

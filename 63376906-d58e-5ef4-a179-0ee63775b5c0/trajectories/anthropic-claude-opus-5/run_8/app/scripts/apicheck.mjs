// A walk over the acceptance criteria in the brief, run against a live app.
const BASE = process.env.BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0; let fail = 0;
const results = [];

const ok = (name, cond, detail) => {
  if (cond) { pass += 1; results.push(`  ok   ${name}`); }
  else { fail += 1; results.push(`  FAIL ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 400)}`); }
};

const tokens = {};
async function login(user) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${user}@example.com`, password: PW }),
  });
  const j = await r.json();
  tokens[user] = j.access_token;
  return j;
}

const key = () => `k-${Math.random().toString(36).slice(2)}`;
async function call(user, method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json' };
  if (user) headers.authorization = `Bearer ${tokens[user]}`;
  if (method !== 'GET') headers['idempotency-key'] = extra.key || key();
  const r = await fetch(`${BASE}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

console.log('- identity');
for (const u of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
  const j = await login(u);
  ok(`${u} signs in`, !!j.access_token && j.token_type === 'Bearer', j);
}
ok('signer2 is scoped to SITE-PILOT only',
  JSON.stringify((await call('signer2', 'GET', '/api/auth/me')).body.sites) === '["SITE-PILOT"]');
ok('an asserted identity is not accepted',
  (await fetch(`${BASE}/api/auth/me`, { headers: { authorization: 'Bearer made.up.token' } })).status === 401);

console.log('- seeded data');
const sites = (await call(null, 'GET', '/api/sites')).body;
ok('three sites', sites.length === 3, sites);
const comm = (await call(null, 'GET', '/api/sites/SITE-COMM/capacity')).body;
ok('SITE-COMM uncommitted_kg is -1000000', comm.uncommitted_kg === -1000000, comm);
ok('capacity carries its confidence', comm.confidence === 'planned' && !!comm.basis, comm);

const batches = (await call('plant', 'GET', '/api/batches')).body;
const byRef = Object.fromEntries(batches.map((b) => [b.reference, b]));
ok('BATCH-1001 dry mass 450000', byRef['BATCH-1001'].dry_mass_g === 450000);
ok('BATCH-1003 non-claimable, approval lapsed',
  byRef['BATCH-1003'].claimable === false && byRef['BATCH-1003'].claimable_reason === 'collector_approval_lapsed');
ok('BATCH-1003 reads back as Brine Textile Recovery',
  byRef['BATCH-1003'].collector_name === 'Brine Textile Recovery', byRef['BATCH-1003'].collector_name);
ok('BATCH-1004 claimable and flagged',
  byRef['BATCH-1004'].claimable === true && byRef['BATCH-1004'].flags.includes('lapsed_calibration'));
ok('BATCH-1005 names the missing custody kind',
  byRef['BATCH-1005'].claimable_reason === 'custody_link_missing' && byRef['BATCH-1005'].missing_custody_kinds.includes('transport'));

console.log('- the four separations and authorization');
ok('a plant operator may not approve a collector',
  (await call('plant', 'POST', '/api/collectors/COL-ALDER/approvals', { state: 'approved', valid_from: '2027-01-01', valid_to: '2027-12-31' })).status === 403);
ok('a plant operator may not set a lot disposition',
  (await call('plant', 'POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' })).status === 403);
ok('an analyst may not set a lot disposition',
  (await call('analyst', 'POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' })).status === 403);
const analystDisp = await call('quality', 'POST', '/api/lots/LOT-N6-0002/disposition', { disposition: 'released' });
ok('a lot held by an open deviation refuses a disposition',
  analystDisp.status === 403 && analystDisp.body.error === 'open_deviation', analystDisp.body);
ok('an auditor writes no operational record',
  (await call('auditor', 'POST', '/api/deviations', { detail: 'x'.repeat(50) })).status === 403);
const catChange = await call('quality', 'PATCH', '/api/batches/BATCH-1001', { category: 'pre_consumer' });
ok('a batch category cannot be changed, and the body names the rule',
  catChange.status === 409 && !!catChange.body.rule, catChange.body);
ok('a plant operator is refused the same category change',
  (await call('plant', 'PATCH', '/api/batches/BATCH-1001', { category: 'pre_consumer' })).status === 409);

console.log('- idempotency');
const k1 = key();
const enq1 = await call(null, 'POST', '/api/enquiries', { type: 'partnership', email: 'a@example.com', name: 'A' }, { key: k1 });
const enq2 = await call(null, 'POST', '/api/enquiries', { type: 'partnership', email: 'a@example.com', name: 'A' }, { key: k1 });
ok('the same key with the same body returns the original',
  enq1.status === 201 && enq2.body.reference === enq1.body.reference, [enq1.body, enq2.body]);
const enq3 = await call(null, 'POST', '/api/enquiries', { type: 'press', email: 'b@example.com' }, { key: k1 });
ok('the same key with a different body answers 409 idempotency_key_reuse',
  enq3.status === 409 && enq3.body.error === 'idempotency_key_reuse', enq3.body);
const noKey = await fetch(`${BASE}/api/enquiries`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'press', email: 'c@example.com' }),
});
ok('a write with no key is refused', noKey.status === 400);
ok('an enquiry answers reference, destination and response_days',
  enq1.body.reference && enq1.body.destination === 'partners@example.com' && enq1.body.response_days === 5, enq1.body);

console.log('- genealogy and the reverse traversal');
const gen = (await call('auditor', 'GET', '/api/lots/LOT-N6-0001/genealogy')).body;
const b1001 = gen.nodes.filter((n) => n.reference === 'BATCH-1001');
ok('BATCH-1001 appears once at 450000 g', b1001.length === 1 && b1001[0].mass_g === 450000, b1001);
ok('the graph carries flagged at the top level', gen.flagged === true);
ok('text_equivalent carries the same facts', !!gen.text_equivalent && gen.text_equivalent.reference === 'LOT-N6-0001');
ok('genealogy refuses a page',
  (await call('auditor', 'GET', '/api/lots/LOT-N6-0001/genealogy?page=1')).status === 400);
const t0 = Date.now();
const impact = (await call('auditor', 'GET', '/api/batches/BATCH-1001/impact')).body;
ok('the reverse traversal answers within five seconds', Date.now() - t0 < 5000, Date.now() - t0);
ok('the reverse traversal names every lot', impact.lots.length === 2 && impact.complete === true, impact.lots);
ok('impact refuses a cursor',
  (await call('auditor', 'GET', '/api/batches/BATCH-1001/impact?cursor=x')).status === 400);

console.log('- the ledger');
const bp = (await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1')).body;
ok('credits in 360000 post-consumer', bp.post_consumer.credits_in_g === 360000, bp.post_consumer);
ok('credits in 336000 pre-consumer', bp.pre_consumer.credits_in_g === 336000, bp.pre_consumer);
ok('non_claimable_input_g is 190000', bp.non_claimable_input_g === 190000);
ok('override_count 1, restatements 0, findings 1',
  bp.override_count === 1 && bp.open_restatement_count === 0 && bp.open_finding_count === 1, bp);
ok('the inbound credit names its origin and is not fresh',
  bp.inbound_credits[0]?.origin_site === 'SITE-PILOT' && bp.inbound_credits[0]?.fresh_credit === false, bp.inbound_credits);
ok('every figure carries a derivation', !!bp.post_consumer.derivation && !!bp.derivation);

const tooMuch = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
  { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 500000 });
ok('an over-allocation is refused with both masses',
  tooMuch.status === 409 && tooMuch.body.available_g === 360000 && tooMuch.body.requested_g === 500000, tooMuch.body);
ok('the refusal names what would change it',
  /Available: 360000 g\. Requested: 500000 g\./.test(tooMuch.body.message), tooMuch.body.message);
const after = (await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1')).body;
ok('the figures are unchanged after a refusal', after.post_consumer.credits_available_g === 360000);
ok('a percentage is refused as an input',
  (await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000, content_bp: 9000 })).status === 400);
ok('a decimal mass is refused',
  (await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000.5 })).status === 400);

const [raceA, raceB] = await Promise.all([
  call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 }),
  call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 }),
]);
const statuses = [raceA.status, raceB.status].sort();
ok('two simultaneous allocations produce one 201 and one 409',
  statuses[0] === 201 && statuses[1] === 409, [raceA.body, raceB.body]);
const lot1 = (await call('claims', 'GET', '/api/lots/LOT-N6-0001')).body;
ok('360000 g on 400000 g is content_bp 9000', lot1.content_bp === 9000, lot1.content_bp);
const bpAfter = (await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1')).body;
ok('credits available is now 0', bpAfter.post_consumer.credits_available_g === 0);
ok('a further post-consumer allocation is refused',
  (await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1 })).status === 409);
ok('the two categories are never netted', bpAfter.pre_consumer.credits_available_g === 336000);

console.log('- carbon');
const carbon = (await call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon')).body;
ok('the figure is 4260000 with uncertainty 1200 and primary share 6500',
  carbon.value_mg_per_kg === 4260000 && carbon.uncertainty_bp === 1200 && carbon.primary_share_bp === 6500, carbon.value_mg_per_kg);
ok('no value without boundary, method version and uncertainty',
  !!carbon.boundary && carbon.method_version === 2 && carbon.uncertainty_bp !== undefined);
ok('the breakdown sums to the value',
  carbon.breakdown.reduce((s, l) => s + l.mg_per_kg, 0) === carbon.value_mg_per_kg);
ok('the figure is not default-led above the threshold', carbon.default_led === false);
ok('the comparator is named and the relation is described by name',
  carbon.comparator.material === 'virgin PA6' && /lower than virgin PA6/.test(carbon.comparator_relation), carbon.comparator_relation);
ok('the two energy figures are returned together',
  carbon.energy.energy_location_mg_per_kg === 1850000 && carbon.energy.energy_market_mg_per_kg === 620000);
ok('unmatched_kwh is 50000', carbon.energy.unmatched_kwh === 50000, carbon.energy);
const held = await call('claims', 'POST', '/api/energy-instruments/EAC-2025-0031/retire', { period: 'BP-DEMO-N6-2026H1', region: 'EU-27' });
ok('a held instrument of the wrong vintage is refused on both counts',
  held.status === 409 && held.body.reasons.length >= 2, held.body);

console.log('- certificates');
const preview = await call('signer', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
ok('the preview carries exactly eight conditions', preview.body.conditions.length === 8, preview.body.conditions?.length);
const unrev = preview.body.conditions.find((x) => x.condition === 'no_unreviewed_override');
ok('the unreviewed override blocks and links to the record',
  unrev.satisfied === false && unrev.blocking_reference === 'OVR-0001' && !!unrev.resolve_route, unrev);
ok('no condition is waivable', preview.body.waivable === false);
ok('the percentage never travels without its claim type',
  preview.body.content_bp !== undefined && preview.body.claim_type === 'mass_balance');
ok('a mass-balance statement says it is not physically segregated',
  /not physically segregated/.test(preview.body.permitted_statement)
  && /may not state that this material physically contains recycled content/.test(preview.body.prohibited_statement));

ok('the authoriser may not review their own override',
  (await call('quality', 'POST', '/api/overrides/OVR-0001/review', {})).status === 403);
const review = await call('claims', 'POST', '/api/overrides/OVR-0001/review', {});
ok('a second person reviews the override and removes nothing',
  review.status === 200 && review.body.reviewed === true && review.body.removed === false, review.body);

const outOfScope = await call('signer2', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
ok('signer2 is refused a certificate on a SITE-DEMO lot',
  outOfScope.status === 409 && outOfScope.body.blocking.some((b) => b.condition === 'signer_holds_scope'), outOfScope.body);
const noPassword = await call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: 'wrong' });
ok('signing re-authenticates', noPassword.status === 401, noPassword.body);

const closeAttempt = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
ok('a period with an undispositioned lot or an open deviation names what blocks it',
  closeAttempt.status === 409 && closeAttempt.body.blocking.length > 0, closeAttempt.body);
await call('quality', 'POST', '/api/deviations/DEV-0001/close', { outcome: 'root_cause_found' });
const close2 = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
ok('the period closes and reports its carry-over',
  close2.status === 200 && close2.body.carried_forward_g.pre_consumer === 67200, close2.body);
ok('closing reports closed_on and the cut off', !!close2.body.closed_on && !!close2.body.cut_off);
ok('a closed period refuses to reopen',
  (await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {})).status === 409);

const preview2 = await call('signer', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
ok('all eight conditions now hold', preview2.body.all_satisfied === true, preview2.body.conditions.filter((x) => !x.satisfied));
const signed = await call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
ok('the first SITE-DEMO certificate is CERT-DEMO-000001',
  signed.status === 201 && signed.body.number === 'CERT-DEMO-000001', signed.body?.number || signed.body);
ok('the response carries the reference it took', signed.body.reference === signed.body.number);
ok('a yield figure appears on no certificate',
  !JSON.stringify(signed.body).includes('yield'), 'yield leaked');
const doc1 = await (await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`)).text();
const doc2 = await (await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`)).text();
ok('an issued document is byte-stable', doc1 === doc2 && doc1.length > 200);
ok('the document reads as plain text with the claim type before the percentage',
  doc1.indexOf('\nCLAIM TYPE\n') < doc1.indexOf('\nRECYCLED CONTENT\n') && /mass_balance/.test(doc1));
ok('the document carries the verification address',
  doc1.includes('Verify this certificate at ravel.example.com/verify/CERT-DEMO-000001.'));

await call('quality', 'POST', '/api/deviations', { detail: 'A late finding on the purification column touching this lot, raised after the preview.', lots: ['LOT-N6-0001'], runs: [] });
const afterDeviation = await call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-VANTA', password: PW });
ok('a lot that has since gained an open deviation is refused at signing, naming the condition',
  afterDeviation.status === 409 && afterDeviation.body.blocking.some((b) => b.condition === 'no_open_deviation'), afterDeviation.body?.blocking);

console.log('- withdrawal and verification');
const wPreview = (await call('signer2', 'GET', '/api/certificates/CERT-PILOT-000002/withdrawal-preview')).body;
ok('a withdrawal preview names the recipients rather than counting them',
  wPreview.notified_recipients[0].name === 'Vanta Safety Systems', wPreview.notified_recipients);
ok('a withdrawal preview enumerates the void statements', wPreview.void_statements.length > 0);
ok('a withdrawal preview lists five consequences', wPreview.consequences.length === 5);
const withdraw = await call('signer2', 'POST', '/api/certificates/CERT-PILOT-000002/withdraw', { reason: 'The conversion factor for the pilot site was restated.' });
ok('a withdrawal answers all five consequences',
  withdraw.status === 200 && withdraw.body.state === 'withdrawn' && !!withdraw.body.notified_recipients
  && !!withdraw.body.void_statements && !!withdraw.body.derived_certificates && !!withdraw.body.batch_traversal, withdraw.body);
const verifyWithdrawn = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000001`)).json();
ok('a public verification resolves without a session and states the withdrawal',
  verifyWithdrawn.found === true && verifyWithdrawn.state === 'withdrawn'
  && verifyWithdrawn.withdrawal_reason === 'A collector category was corrected after acceptance', verifyWithdrawn);
ok('a verification offers no forwarding to a replacement',
  !('replacement' in verifyWithdrawn) && !('superseded_by' in verifyWithdrawn), Object.keys(verifyWithdrawn));
ok('a verification returns no yield, collector, genealogy or carbon',
  Object.keys(verifyWithdrawn).length === 10 && !JSON.stringify(verifyWithdrawn).includes('carbon'), Object.keys(verifyWithdrawn));
const unknown = await (await fetch(`${BASE}/api/verify/CERT-DEMO-999999`)).json();
ok('an unknown number returns 200 with found false', unknown.found === false && unknown.number === 'CERT-DEMO-999999');
const stillThere = await (await fetch(`${BASE}/api/certificates/CERT-PILOT-000002/document`)).text();
ok('a withdrawn document stays readable and states the withdrawal', /withdrawn/i.test(stillThere));

console.log('- the record');
const chain = (await call('auditor', 'GET', '/api/record/check')).body;
ok('the digest chain verifies', chain.holds === true && chain.first_failure === null, chain);
const first = (await call('auditor', 'GET', '/api/record/1')).body;
ok('the first entry carries the zero prev_digest', first.prev_digest === '0'.repeat(64));
ok('the record refuses an edit', (await call('auditor', 'PATCH', '/api/record/1', {})).status === 405);
ok('the record refuses a deletion', (await call('auditor', 'DELETE', '/api/record/1')).status === 405);
const refusals = (await call('auditor', 'GET', '/api/record/queries/refused_allocations')).body;
ok('a refused allocation is an entry with the margin at the instant',
  refusals.length > 0 && refusals[0].available_g !== undefined, refusals[0]);
for (const q of ['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
  'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor']) {
  const r = await call('auditor', 'GET', `/api/record/queries/${q}`);
  ok(`the record answers ${q}`, r.status === 200 && Array.isArray(r.body), r.body);
  const paged = await call('auditor', 'GET', `/api/record/queries/${q}?limit=1`);
  ok(`${q} refuses a limit`, paged.status === 400);
}
const retention = (await call('auditor', 'GET', '/api/record/1/retention')).body;
ok('retain_until is the longest of the three',
  retention.retain_until === [retention.scheme_until, retention.statutory_until, retention.referenced_until].filter(Boolean).sort().at(-1), retention);
const holdSeq = (await call('auditor', 'GET', '/api/record?act=certificate_signed')).body[0].seq;
const holdRetention = (await call('auditor', 'GET', `/api/record/${holdSeq}/retention`)).body;
ok('the seeded legal hold shows on its entry', holdRetention.legal_hold === true, holdRetention);
ok('a record under hold refuses deletion',
  (await call('quality', 'POST', `/api/record/${holdSeq}/expire`, {})).status === 409);

console.log('- exports');
const exp = await call('auditor', 'POST', '/api/exports', { scope: { sites: ['SITE-DEMO'], period: 'BP-DEMO-N6-2026H1' } });
ok('an export is self-contained and carries digests and anchors',
  exp.status === 201 && !!exp.body.anchors.last_digest && exp.body.entries.length > 0, exp.body?.anchors);
const empty = await call('auditor', 'POST', '/api/exports', { scope: { object: 'NOTHING-AT-ALL' } });
ok('an export that returns nothing is recorded too', empty.status === 201 && empty.body.empty === true);
const exportsByAuditor = (await call('auditor', 'GET', '/api/record/queries/exports_by_auditor?auditor=auditor@example.com')).body;
ok('exports_by_auditor includes the read that returned nothing',
  exportsByAuditor.some((e) => e.empty === true), exportsByAuditor);

console.log('- inbound and reconciliation');
const inbound = await call(null, 'POST', '/api/inbound/weighbridge', { received_at: new Date().toISOString(), payload: { ticket: 'WB1-0009', net_g: 1000 } });
ok('an inbound record answers the reference it took', inbound.status === 201 && !!inbound.body.reference);
const inboundList = (await call('plant', 'GET', '/api/inbound')).body;
ok('the payload is kept verbatim',
  inboundList.find((r) => r.reference === 'INB-0001').payload_verbatim.includes('WB2-88213'));
const recon = (await call('plant', 'GET', '/api/reconciliation')).body;
ok('reconciliation returns six figures',
  ['mass_balance_residual_g', 'credit_margin_g', 'consumptions_on_open_runs', 'batches_with_broken_custody',
    'certificates_with_superseded_figures', 'integration_ages'].every((k) => k in recon), Object.keys(recon));
ok('customer_reporting reports null rather than zero',
  recon.integration_ages.find((x) => x.source === 'customer_reporting').age_hours === null, recon.integration_ages);

console.log('- parties, contracts and public copy');
const partyVersions = (await call('auditor', 'GET', '/api/parties/COL-BRINE/versions')).body;
ok('a party keeps its full history', partyVersions.length === 2 && partyVersions[0].name === 'Brine Textile Recovery');
const projection = (await call('claims', 'GET', '/api/contracts/CON-VANTA-1/projection')).body;
ok('a contract on a planned site carries an undismissible flag',
  projection.planned_site_flag === true && projection.flag_dismissible === false, projection);
ok('a contract states its shortfall consequence at signature',
  projection.shortfall_consequence === 'a make-good volume in the following period');
const alloc = await call('claims', 'POST', '/api/contracts/CON-HELIOS-1/allocations', { lot: 'LOT-N6-0001', mass_kg: 100 });
ok('a short-supply allocation records who decided and which contracts went without',
  alloc.status === 201 && alloc.body.decided_by === 'claims@example.com' && alloc.body.favoured_over.length > 0, alloc.body);
ok('a claim already allocated is refused a second attachment',
  (await call('claims', 'POST', '/api/contracts/CON-VANTA-1/allocations', { lot: 'LOT-N6-0001', mass_kg: 100 })).status === 409);

const stats = (await call(null, 'GET', '/api/statistics')).body;
ok('every published figure carries a source, a year and a geography',
  stats.length === 3 && stats.every((s) => s.source && s.year && s.geography), stats);
const positions = (await call(null, 'GET', '/api/positions')).body;
ok('one open position', positions.length === 1 && positions[0].title === 'Process Engineer');
const news = (await call(null, 'GET', '/api/news')).body;
ok('three news items with a real taxonomy',
  news.length === 3 && new Set(news.map((n) => n.tag)).size === 3 && news.some((n) => n.language === 'fr'), news.map((n) => n.tag));

console.log('- scope');
ok('the console needs a session', (await call(null, 'GET', '/api/lots')).status === 401);
const yieldRefusal = await call('signer', 'GET', '/api/lots/LOT-N6-0001/yield');
ok('a yield refuses a signer', yieldRefusal.status === 403, yieldRefusal.body);
ok('a yield answers for the claims manager',
  (await call('claims', 'GET', '/api/lots/LOT-N6-0001/yield')).status === 200);

console.log('- replay');
const replay = (await call('auditor', 'GET', '/api/certificates/CERT-DEMO-000001/replay')).body;
ok('a replay names its input versions and answers agreement',
  replay.reproducible === true && !!replay.input_versions.carbon_method && typeof replay.agrees === 'boolean', replay);

console.log('- blending');
const blend = await call('claims', 'POST', '/api/lots/LOT-N6-0001/blend', { with: 'LOT-N6-0003' });
ok('a blend is 600000 g at 8500 bp naming both sites',
  blend.body.mass_g === 600000 && blend.body.content_bp === 8500
  && blend.body.sites.includes('SITE-DEMO') && blend.body.sites.includes('SITE-PILOT'), blend.body);
ok('a blend carries the provisional flag of the weaker of the two', blend.body.provisional_factor === true);

console.log('- conversion factors');
const badFactor = await call('claims', 'POST', '/api/conversion-factors', { site: 'SITE-DEMO', factor_bp: 9000, derived_in_g: 1000000, derived_out_g: 800000 });
ok('a factor that disagrees with its own window is refused',
  badFactor.status === 409 && badFactor.body.expected_factor_bp === 8000, badFactor.body);

console.log('');
console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

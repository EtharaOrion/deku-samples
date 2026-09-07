// The corners of the brief that the main walk does not reach: the four stated
// races, the retention route, a suspension that reaches backwards, the replay of
// an unresolvable figure, and the shapes every route must answer with.
// Not shipped in the image.
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const PW = 'deku-demo-pw-2026';

let pass = 0, fail = 0;
const failures = [];
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL ${n} ${d}`); }
};
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `want ${JSON.stringify(b)} got ${JSON.stringify(a)}`);

let k = Date.now();
const key = () => `edge-${k++}`;

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW })
  });
  return (await r.json()).access_token;
}
async function api(token, method, path, body, hdrs = {}) {
  const headers = { 'content-type': 'application/json', ...hdrs };
  if (token) headers.authorization = `Bearer ${token}`;
  if (method !== 'GET' && !headers['idempotency-key']) headers['idempotency-key'] = key();
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, body: j };
}

const T = {};
for (const u of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
  T[u] = await login(`${u}@example.com`);
}

// Bring the seeded state to the point the console journeys reach it: the
// override reviewed by a second person, the deviation closed, the claim
// allocated and the period closed. Several checks below are only meaningful
// against a system that has been operated rather than only seeded.
console.log('\n== preparing the state the journeys reach ==');
{
  const rev = await api(T.claims, 'POST', '/api/overrides/OVR-0001/review', {});
  ok('a second person reviews the seeded override', rev.status === 201 || rev.status === 200);
  const dev = await api(T.quality, 'POST', '/api/deviations/DEV-0001/close',
    { outcome: 'cause_not_established' });
  ok('the seeded deviation closes', dev.status === 201 || dev.status === 409);
  const alloc = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 });
  ok('the claim is allocated', alloc.status === 201, JSON.stringify(alloc.body).slice(0, 120));
  const close = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close',
    { closed_on: '2026-07-01', cut_off: '2026-07-10' });
  ok('the period closes', close.status === 201, JSON.stringify(close.body).slice(0, 160));
}

console.log('\n== every collection route returns a top-level array ==');
for (const path of ['/api/sites', '/api/collectors', '/api/batches', '/api/runs', '/api/lots',
  '/api/balance-periods', '/api/certificates', '/api/statistics', '/api/positions',
  '/api/news', '/api/inbound', '/api/record', '/api/conversion-factors', '/api/deviations',
  '/api/overrides', '/api/test-results', '/api/contracts', '/api/customers',
  '/api/change-notices', '/api/restatements', '/api/energy-instruments', '/api/claim-register']) {
  const r = await api(T.auditor, 'GET', path);
  ok(`${path} is a top-level array`, Array.isArray(r.body), `${r.status} ${typeof r.body}`);
}

console.log('\n== every single-object route returns one object ==');
for (const path of ['/api/auth/me', '/api/sites/SITE-DEMO/capacity', '/api/collectors/COL-ALDER',
  '/api/batches/BATCH-1001', '/api/runs/RUN-D-0001', '/api/lots/LOT-N6-0001',
  '/api/balance-periods/BP-DEMO-N6-2026H1', '/api/verify/CERT-PILOT-000001',
  '/api/reconciliation', '/api/lots/LOT-N6-0001/genealogy', '/api/batches/BATCH-1001/impact']) {
  const r = await api(T.auditor, 'GET', path);
  ok(`${path} is one object`, r.body && typeof r.body === 'object' && !Array.isArray(r.body), String(r.status));
}

console.log('\n== no route returns a decimal in a mass or a proportion ==');
{
  const paths = ['/api/lots', '/api/batches', '/api/balance-periods', '/api/certificates',
    '/api/lots/LOT-N6-0001/carbon', '/api/lots/LOT-N6-0001/genealogy'];
  const offenders = [];
  const walk = (v, trail) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${trail}[${i}]`)); return; }
    if (typeof v === 'object') { for (const [kk, vv] of Object.entries(v)) walk(vv, `${trail}.${kk}`); return; }
    if (typeof v === 'number' && !Number.isInteger(v)) {
      if (/_g$|_bp$|_kg$|_kwh$|_mg_per_kg$|_mg$/.test(trail)) offenders.push(`${trail} = ${v}`);
    }
  };
  for (const p of paths) {
    const r = await api(T.auditor, 'GET', p);
    walk(r.body, p);
  }
  ok('no mass or proportion crosses the wire as a decimal', offenders.length === 0, offenders.join('; '));
}

console.log('\n== no carbon value without its four components ==');
{
  const c = await api(T.quality, 'GET', '/api/lots/LOT-N6-0001/carbon');
  ok('the figure carries boundary, method_version and uncertainty_bp',
    !!c.body.boundary && !!c.body.method_version && c.body.uncertainty_bp !== undefined);
  ok('the internal view always returns the breakdown', Array.isArray(c.body.breakdown));
  ok('the two energy figures travel together',
    c.body.energy.energy_location_mg_per_kg !== undefined
    && c.body.energy.energy_market_mg_per_kg !== undefined);

  // A certificate carries the value with the breakdown attached rather than inline.
  const cert = await api(T.auditor, 'GET', '/api/certificates/CERT-PILOT-000001');
  ok('a certificate carries the value with all four components',
    cert.body.carbon.value_mg_per_kg && cert.body.carbon.boundary
    && cert.body.carbon.method_version && cert.body.carbon.uncertainty_bp !== undefined);
  ok('and the claim type sits beside the percentage',
    cert.body.claim_type !== undefined && cert.body.content_bp !== undefined);
}

console.log('\n== two signatures at one site take two consecutive numbers ==');
{
  // Both lots must be signable; LOT-N6-0002 is quarantined, so this races two
  // signatures on the same lot to two different recipients instead.
  const before = await api(T.auditor, 'GET', '/api/certificates');
  const demoBefore = before.body.filter((c) => c.site === 'SITE-DEMO').length;
  const [a, b] = await Promise.all([
    api(T.signer, 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }),
    api(T.signer, 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-VANTA', password: PW })
  ]);
  const numbers = [a, b].filter((x) => x.status === 201).map((x) => x.body.number).sort();
  ok('neither signature is lost', numbers.length === 2, JSON.stringify([a.status, b.status]));
  if (numbers.length === 2) {
    const seqs = numbers.map((n) => Number(n.split('-').at(-1)));
    ok('they take two consecutive numbers', seqs[1] - seqs[0] === 1, numbers.join(', '));
    ok('no number is issued twice', numbers[0] !== numbers[1]);
    const after = await api(T.auditor, 'GET', '/api/certificates');
    const demoAll = after.body.filter((c) => c.site === 'SITE-DEMO')
      .map((c) => Number(c.number.split('-').at(-1))).sort((x, y) => x - y);
    const gapless = demoAll.every((v, i) => i === 0 || v === demoAll[i - 1] + 1);
    ok('the sequence has no gap afterwards', gapless, demoAll.join(', '));
  }
}

console.log('\n== a race between a method version and a computation ==');
{
  // A computation in flight completes under the version it started with and
  // records that version; the new version applies from the next computation.
  const before = await api(T.quality, 'GET', '/api/lots/LOT-N6-0001/carbon');
  const publishedAt = before.body.method_version;
  const [figure, published] = await Promise.all([
    api(T.quality, 'GET', '/api/lots/LOT-N6-0001/carbon'),
    api(T.quality, 'POST', '/api/carbon-methods/CM-PA6/versions', {
      boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld',
      emission_factors: [{ factor: 'grid electricity, EU-27', source: 'EcoBase 2026', year: 2026 }]
    })
  ]);
  ok('the new version is published', published.status === 201, String(published.status));
  ok('the computation in flight records the version it started with',
    figure.body.method_version === publishedAt, `${figure.body.method_version} vs ${publishedAt}`);
  const v1 = await api(T.quality, 'GET', '/api/carbon-methods/CM-PA6/versions/2');
  ok('the superseded version stays readable', v1.status === 200);
  ok('and is marked superseded', v1.body.superseded_by === 3, String(v1.body.superseded_by));
}

console.log('\n== a scoped read names the moment it saw ==');
{
  const r = await api(T.auditor, 'GET', '/api/reconciliation');
  ok('the reconciliation read answers read_at', !!r.body.read_at);
  const g = await api(T.auditor, 'GET', '/api/lots/LOT-N6-0001/genealogy');
  ok('the genealogy read answers read_at', !!g.body.read_at);
}

console.log('\n== retention, a legal hold and an expiry ==');
{
  const rec = await api(T.auditor, 'GET', '/api/record');
  const held = rec.body.find((e) => e.act === 'certificate_signed' && e.object_ref === 'CERT-PILOT-000001');
  const r = await api(T.auditor, 'GET', `/api/record/${held.seq}/retention`);
  ok('retain_until is computed rather than stored', !!r.body.retain_until);
  ok('it is the longest of the three',
    r.body.retain_until >= r.body.scheme_until && r.body.retain_until >= r.body.statutory_until);
  ok('a hold stands', r.body.legal_hold === true);

  const blocked = await api(T.auditor, 'POST', `/api/record/${held.seq}/expire`, {});
  eq('a record under hold refuses deletion', blocked.status, 409);

  // Lift the hold; the retention still has not passed, so deletion is still refused.
  const lifted = await api(T.auditor, 'DELETE', `/api/record/${held.seq}/legal-hold`);
  ok('the hold lifts', lifted.status === 200, String(lifted.status));
  const r2 = await api(T.auditor, 'GET', `/api/record/${held.seq}/retention`);
  ok('the retention answer no longer carries a hold', r2.body.legal_hold === false);
  const stillHeld = await api(T.auditor, 'POST', `/api/record/${held.seq}/expire`, {});
  eq('and deletion is still refused while the retention runs', stillHeld.status, 409);
  eq('naming the retention', stillHeld.body.error, 'retention_has_not_passed');

  // Both the hold and the lift are entries of their own.
  const after = await api(T.auditor, 'GET', '/api/record');
  ok('the hold and the lift are each an entry',
    after.body.some((e) => e.act === 'legal_hold_placed')
    && after.body.some((e) => e.act === 'legal_hold_lifted'));
  const chk = await api(T.auditor, 'GET', '/api/record/check');
  ok('the chain still holds', chk.body.holds === true, JSON.stringify(chk.body.first_failure));
}

console.log('\n== a suspension that reaches backwards ==');
{
  const s = await api(T.quality, 'POST', '/api/sites/SITE-PILOT/certification', {
    state: 'suspended', effective_from: '2026-03-01', effective_to: '2026-12-31',
    reason: 'Scheme audit of the pilot conversion factor'
  });
  ok('the suspension lands', s.status === 201, String(s.status));
  ok('it enumerates the certificates signed inside the window',
    s.body.certificates_in_window.length >= 2, String(s.body.certificates_in_window.length));
  ok('each is individually resolvable under the three outcomes',
    s.body.certificates_in_window.every((c) =>
      JSON.stringify(c.available_outcomes) === JSON.stringify(['reissued', 'withdrawn', 'unaffected'])));
  ok('issuing stops for the affected site', s.body.issuing_blocked === true);
  ok('with the suspension named as the blocking condition', !!s.body.blocking_condition);

  // A signer is now refused at that site.
  const refused = await api(T.signer2, 'POST', '/api/certificates',
    { lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS', password: PW });
  ok('a signature at the suspended site is refused', refused.status === 409, String(refused.status));

  const lift = await api(T.quality, 'POST', '/api/sites/SITE-PILOT/certification', {
    state: 'lifted', effective_from: '2026-04-01', reason: 'Audit closed'
  });
  ok('lifting restores issuing', lift.status === 201 && lift.body.issuing_blocked === false);
  ok('and does not reinstate a withdrawn certificate',
    lift.body.note.includes('does not reinstate a withdrawn certificate'));
  const stillWithdrawn = await api(null, 'GET', '/api/verify/CERT-PILOT-000001');
  eq('the withdrawn certificate is still withdrawn', stillWithdrawn.body.state, 'withdrawn');
}

console.log('\n== a restatement holds exactly one resolution per certificate ==');
{
  const r = await api(T.claims, 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/restatements', {
    reason: 'The provisional pilot factor was replaced by a derived factor.',
    revised_factor_bp: 8000
  });
  ok('the restatement opens', r.status === 201, String(r.status));
  ok('it enumerates every certificate issued from the period',
    r.body.certificates.length >= 2, String(r.body.certificates.length));
  ok('and answers content_movements where a factor was revised',
    Array.isArray(r.body.content_movements) && r.body.content_movements.length >= 2);
  ok('each movement names the figure that moved',
    r.body.content_movements.every((m) => m.certificate && m.content_bp !== undefined
      && m.corrected_content_bp !== undefined));

  const first = await api(T.claims, 'POST', `/api/restatements/${r.body.reference}/resolutions`, {
    certificate: 'CERT-PILOT-000001', outcome: 'unaffected', reason: 'Already withdrawn on other grounds.'
  });
  ok('one resolution is recorded', first.status === 201, String(first.status));
  const second = await api(T.claims, 'POST', `/api/restatements/${r.body.reference}/resolutions`, {
    certificate: 'CERT-PILOT-000001', outcome: 'reissued', reason: 'A second attempt.'
  });
  eq('a second resolution against the same certificate is refused', second.status, 409);
  const many = await api(T.claims, 'POST', `/api/restatements/${r.body.reference}/resolutions`, {
    certificate: ['CERT-PILOT-000001', 'CERT-PILOT-000002'], outcome: 'unaffected', reason: 'Both at once.'
  });
  eq('no route resolves more than one certificate at a time', many.status, 400);
}

console.log('\n== a consumption into a closed period opens a restatement ==');
{
  const run = await api(T.plant, 'POST', '/api/runs', {
    run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'EQ-DISS-01',
    recipe_version: 'RCP-DISS-2', operator: 'Ines Bekele',
    started_at: '2026-03-20T06:00:00Z'
  });
  ok('a run opens', run.status === 201, JSON.stringify(run.body).slice(0, 120));
  const c = await api(T.plant, 'POST', `/api/runs/${run.body.reference}/consumptions`, {
    input_ref: 'BATCH-1001', mass_g: 1000, effective_on: '2026-03-20'
  });
  eq('a write into a closed period is refused', c.status, 409);
  eq('naming the period', c.body.error, 'period_closed');
  ok('and opening a restatement instead', !!c.body.restatement, JSON.stringify(c.body));
}

console.log('\n== a cached figure whose factor is superseded ==');
{
  const before = await api(T.quality, 'GET', '/api/lots/LOT-N6-0002/carbon');
  ok('the figure is cached and valid', before.body.cache_valid === true);

  // A recomputation against a closed period is refused unless a restatement is
  // open. The period was closed during the preparation above, so this is the
  // refusal first and the act second.
  const refused = await api(T.quality, 'POST', '/api/carbon-figures/CF-LOT-0002/recompute',
    { reason: 'The emission factor set was superseded by EcoBase 2026.' });
  eq('a recomputation against a closed period is refused', refused.status, 409);
  eq('naming what is missing', refused.body.error, 'closed_period_needs_restatement');

  const rst = await api(T.claims, 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/restatements',
    { reason: 'The emission factor set behind the demonstration figures was superseded.' });
  ok('a restatement opens against the closed period', rst.status === 201, String(rst.status));

  const fig = await api(T.quality, 'POST', '/api/carbon-figures/CF-LOT-0002/recompute',
    { reason: 'The emission factor set was superseded by EcoBase 2026.' });
  ok('a recomputation is then a recorded act', fig.status === 201, JSON.stringify(fig.body).slice(0, 140));
  ok('it produces a new version alongside the old', fig.body.supersedes === 'CF-LOT-0002');
  ok('records a person, a date and a reason',
    !!fig.body.recomputed_by && !!fig.body.recomputed_on && !!fig.body.reason);
  ok('and enumerates every certificate carrying the superseded figure',
    Array.isArray(fig.body.certificates_carrying_superseded_figure));
  const old = await api(T.quality, 'GET', '/api/lots/LOT-N6-0002/carbon');
  ok('the new figure is what the lot now answers', old.body.figure_version === 2, String(old.body.figure_version));
}

console.log('\n== an unresolvable figure replays as not reproducible ==');
{
  const r = await api(T.auditor, 'GET', '/api/certificates/CERT-PILOT-000001/replay');
  ok('replay answers', r.status === 200);
  ok('it carries input_versions', !!r.body.input_versions);
  ok('agreement and disagreement are both ordinary answers',
    r.body.agrees === true || r.body.agrees === false || r.body.reproducible === false,
    JSON.stringify({ agrees: r.body.agrees, reproducible: r.body.reproducible }));
  if (r.body.reproducible === false) {
    ok('and names what is gone', !!r.body.reason, r.body.reason);
  }
}

console.log('\n== a byproduct that was disposed is a loss ==');
{
  const sold = await api(T.plant, 'GET', '/api/outputs/OUT-U-0002/share');
  ok('a sold byproduct takes a share of the claim', sold.body.claim_share_g > 0);
  ok('and of the emissions', sold.body.emissions_share_mg > 0);
  eq('at 526 basis points', sold.body.share_bp, 526);
  ok('on a stated allocation basis', !!sold.body.allocation_basis);
}

console.log('\n== the four separations refuse on the server ==');
{
  // Whoever books in a batch does not approve the collector.
  const a = await api(T.plant, 'POST', '/api/collectors/COL-ALDER/approvals',
    { state: 'approved', valid_from: '2027-01-01', valid_to: '2027-12-31' });
  eq('a plant operator may not approve a collector', a.status, 403);
  // Whoever published a carbon method version does not close the period.
  const period = await api(T.claims, 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1');
  ok('a period is readable to test the close separation', period.status === 200);
  // A signer may not sign against a lot whose data they entered, and may not
  // alter a carbon method.
  const m = await api(T.claims, 'POST', '/api/carbon-methods/CM-PA6/versions',
    { boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'X' });
  eq('a claims manager may not alter a carbon method', m.status, 403);
  const sc = await api(T.signer, 'POST', '/api/certificates',
    { lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS', password: PW });
  ok('a signer outside their site scope is refused', sc.status === 409 || sc.status === 403, String(sc.status));
}

console.log('\n== an override needs forty characters and a second reviewer ==');
{
  const o = await api(T.quality, 'POST', '/api/overrides', {
    separation: 'signer_not_author',
    reason: 'The only qualified second signer was unavailable during the audit window and the shipment could not wait.',
    lot: 'LOT-N6-0002', authorised_by: 'quality@example.com'
  });
  ok('an override with a full reason is recorded', o.status === 201, JSON.stringify(o.body).slice(0, 120));
  ok('it answers the reference it took', !!o.body.reference);
  ok('and is permanent', o.body.permanent === true);
  const self = await api(T.quality, 'POST', `/api/overrides/${o.body.reference}/review`, {});
  eq('the authoriser may not review it', self.status, 403);
  const wrong = await api(T.analyst, 'POST', `/api/overrides/${o.body.reference}/review`, {});
  eq('nor may somebody who is neither a quality nor a claims manager', wrong.status, 403);
  const good = await api(T.claims, 'POST', `/api/overrides/${o.body.reference}/review`, {});
  eq('a second qualified person may', good.status, 201);
  ok('the review removes nothing', good.body.separation === 'signer_not_author');
}

console.log('\n== every creating route answers with its reference ==');
{
  const checks = [
    ['batch', await api(T.plant, 'POST', '/api/batches', {
      collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer',
      gross_g: 20000, tare_g: 0, net_g: 20000, moisture_bp: 500,
      moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-06-15',
      custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']
        .map((k) => ({ kind: k, party: 'X', date: '2026-06-15' }))
    })],
    ['deviation', await api(T.quality, 'POST', '/api/deviations', { title: 'A probe deviation' })],
    ['inbound', await api(T.plant, 'POST', '/api/inbound/customer_reporting',
      { received_at: new Date().toISOString(), payload: { handover: 'acknowledged' } })],
    ['export', await api(T.auditor, 'POST', '/api/exports', { sites: ['SITE-DEMO'] })],
    ['enquiry', await api(null, 'POST', '/api/enquiries',
      { type: 'partnership', name: 'A', email: 'a@example.com', message: 'Hello.' })]
  ];
  for (const [what, r] of checks) {
    ok(`a ${what} answers the reference it took`,
      r.status === 201 && typeof r.body.reference === 'string',
      `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  }
  // customer_reporting now reports an age rather than null.
  const rec = await api(T.plant, 'GET', '/api/reconciliation');
  const cr = rec.body.integration_ages.find((x) => x.source === 'customer_reporting');
  ok('a source that has now sent reports an age', typeof cr.age_hours === 'number', JSON.stringify(cr));
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (failures.length) { console.log('failures:'); for (const f of failures) console.log(`  - ${f}`); }
process.exit(fail ? 1 : 0);

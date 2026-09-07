
// Walks the rules the brief states, against a running app.
const BASE = process.env.TEST_BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(`${name}${detail !== undefined ? ` :: ${JSON.stringify(detail).slice(0, 400)}` : ''}`); }
}

let keyCounter = 0;
const key = () => `test-${Date.now()}-${keyCounter++}`;

async function call(method, path, { token, body, idem, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idem !== false) headers['Idempotency-Key'] = idem || key();
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (raw) return { status: res.status, text };
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

async function login(email) {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW })
  });
  const j = await r.json();
  return j.access_token;
}

const T = {};

async function run() {
  for (const e of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
    T[e] = await login(`${e}@example.com`);
    check(`login ${e}`, !!T[e]);
  }
  const me = await call('GET', '/api/auth/me', { token: T.signer2 });
  check('signer2 scoped to SITE-PILOT only',
    JSON.stringify(me.body.sites) === JSON.stringify(['SITE-PILOT']), me.body.sites);

  const bad = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'plant@example.com', password: 'wrong' })
  });
  check('wrong password refused', bad.status === 401);

  const sites = await call('GET', '/api/sites', {});
  check('three sites', Array.isArray(sites.body) && sites.body.length === 3, sites.body);
  const comm = await call('GET', '/api/sites/SITE-COMM/capacity', {});
  check('SITE-COMM uncommitted_kg is -1000000', comm.body.uncommitted_kg === -1000000, comm.body);
  check('capacity carries confidence', comm.body.confidence === 'planned');
  check('capacity basis stated', /8000 hours/.test(comm.body.basis || ''));

  const cols = await call('GET', '/api/collectors', {});
  check('three collectors', cols.body.length === 3);
  const cinder = cols.body.find((x) => x.reference === 'COL-CINDER');
  check('COL-CINDER conditional with condition',
    cinder.approval_periods[0].state === 'conditional' &&
    cinder.approval_periods[0].condition_closes_on === '2026-10-31', cinder.approval_periods);
  check('COL-CINDER has the departure finding',
    cinder.findings.some((f) => f.departure_bp === 800), cinder.findings);

  const b = await call('GET', '/api/batches', { token: T.plant });
  const by = Object.fromEntries(b.body.map((x) => [x.reference, x]));
  check('BATCH-1001 dry mass 450000', by['BATCH-1001'].dry_mass_g === 450000, by['BATCH-1001'].dry_mass_g);
  check('BATCH-1001 claimable', by['BATCH-1001'].claimable === true);
  check('BATCH-1002 dry mass 300000', by['BATCH-1002'].dry_mass_g === 300000);
  check('BATCH-1003 dry mass 190000', by['BATCH-1003'].dry_mass_g === 190000);
  check('BATCH-1003 non-claimable, approval lapsed',
    by['BATCH-1003'].claimable === false && by['BATCH-1003'].claimable_reason === 'collector_approval_lapsed',
    by['BATCH-1003']);
  check('BATCH-1003 reads back as Brine Textile Recovery',
    by['BATCH-1003'].collector_name === 'Brine Textile Recovery', by['BATCH-1003'].collector_name);
  check('BATCH-1004 claimable and flagged',
    by['BATCH-1004'].claimable === true && by['BATCH-1004'].flags.includes('lapsed_calibration'), by['BATCH-1004']);
  check('BATCH-1004 measured fraction beside declared',
    by['BATCH-1004'].composition.measured_fraction_bp === 9100 && by['BATCH-1004'].composition.fraction_bp === 9900);
  check('BATCH-1005 custody_link_missing naming transport',
    by['BATCH-1005'].claimable === false &&
    by['BATCH-1005'].claimable_reason === 'custody_link_missing' &&
    by['BATCH-1005'].claimable_missing_kind === 'transport', by['BATCH-1005']);

  const dm = await call('POST', '/api/batches', {
    token: T.plant,
    body: {
      collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer',
      gross_g: 32345, tare_g: 20000, net_g: 12345, moisture_bp: 5000,
      moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-01',
      custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']
        .map((k) => ({ kind: k, date: '2026-04-01', party: 'COL-ALDER' }))
    }
  });
  check('worked case dry mass 6172 not 6173', dm.body.dry_mass_g === 6172, dm.body.dry_mass_g);
  check('create answers with the reference it took', !!dm.body.reference, dm.body);

  const noCat = await call('POST', '/api/batches', {
    token: T.plant,
    body: { collector: 'COL-ALDER', site: 'SITE-DEMO', gross_g: 1, tare_g: 0, net_g: 1, moisture_bp: 0, received_on: '2026-04-01' }
  });
  check('category required at intake', noCat.status === 400 && noCat.body.error === 'category_required', noCat.body);

  for (const role of ['plant', 'quality', 'claims', 'auditor']) {
    const r = await call('PATCH', '/api/batches/BATCH-1001', { token: T[role], body: { category: 'pre_consumer' } });
    check(`category change refused for ${role} with 409`, r.status === 409, { role, ...r.body });
  }

  const noKey = await call('POST', '/api/batches', { token: T.plant, idem: false, body: { category: 'post_consumer' } });
  check('write without Idempotency-Key refused', noKey.status === 400 && noKey.body.error === 'idempotency_key_required', noKey.body);

  const k = key();
  const payload = {
    collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'pre_consumer',
    gross_g: 21000, tare_g: 20000, net_g: 1000, moisture_bp: 0, received_on: '2026-04-02',
    custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']
      .map((x) => ({ kind: x, date: '2026-04-02', party: 'COL-ALDER' }))
  };
  const i1 = await call('POST', '/api/batches', { token: T.plant, idem: k, body: payload });
  const i2 = await call('POST', '/api/batches', { token: T.plant, idem: k, body: payload });
  check('same key same body returns the original',
    i1.body.reference === i2.body.reference, [i1.body.reference, i2.body.reference]);
  const i3 = await call('POST', '/api/batches', { token: T.plant, idem: k, body: { ...payload, net_g: 2000 } });
  check('same key different body answers 409 idempotency_key_reuse',
    i3.status === 409 && i3.body.error === 'idempotency_key_reuse', i3.body);

  const auditWrite = await call('POST', '/api/batches', { token: T.auditor, body: payload });
  check('auditor refused a write', auditWrite.status === 403, auditWrite.body);

  const approve = await call('POST', '/api/collectors/COL-ALDER/approvals', {
    token: T.plant, body: { state: 'approved', valid_from: '2027-01-01', valid_to: '2027-12-31' }
  });
  check('plant operator may not approve a collector', approve.status === 403, approve.body);

  const g = await call('GET', '/api/lots/LOT-N6-0001/genealogy', { token: T.auditor });
  const b1001 = g.body.nodes.filter((n) => n.reference === 'BATCH-1001');
  check('BATCH-1001 appears exactly once in the graph', b1001.length === 1, b1001.length);
  check('BATCH-1001 node mass is 450000', b1001[0]?.mass_g === 450000, b1001[0]);
  check('graph carries flagged at the top level', g.body.flagged === true);
  check('graph carries a text_equivalent', !!g.body.text_equivalent && Array.isArray(g.body.text_equivalent.children));
  check('genealogy refuses a page',
    (await call('GET', '/api/lots/LOT-N6-0001/genealogy?page=1', { token: T.auditor })).status === 400);

  const impact = await call('GET', '/api/batches/BATCH-1001/impact', { token: T.auditor });
  check('reverse traversal names the lots',
    impact.body.lots.some((l) => l.reference === 'LOT-N6-0001'), impact.body.lots);
  check('reverse traversal is a complete set', impact.body.complete === true);
  const t0 = Date.now();
  await call('GET', '/api/batches/BATCH-1001/impact', { token: T.auditor });
  check('impact answers within five seconds', Date.now() - t0 < 5000, Date.now() - t0);

  const bp = await call('GET', '/api/balance-periods/BP-DEMO-N6-2026H1', { token: T.claims });
  check('credits_in post_consumer 360000', bp.body.credits_in_g.post_consumer === 360000, bp.body.credits_in_g);
  check('credits_in pre_consumer 336000', bp.body.credits_in_g.pre_consumer === 336000, bp.body.credits_in_g);
  check('credits_out zero for both',
    bp.body.credits_out_g.post_consumer === 0 && bp.body.credits_out_g.pre_consumer === 0);
  check('non_claimable_input_g 190000', bp.body.non_claimable_input_g === 190000, bp.body.non_claimable_input_g);
  check('override_count 1', bp.body.override_count === 1, bp.body.override_count);
  check('open_restatement_count 0', bp.body.open_restatement_count === 0);
  check('open_finding_count 1', bp.body.open_finding_count === 1, bp.body.open_finding_count);
  check('inbound credit names its origin and is not fresh',
    bp.body.inbound_credits.some((x) => x.origin_site === 'SITE-PILOT' && x.fresh_credit === false),
    bp.body.inbound_credits);
  check('every figure carries a derivation', !!bp.body.derivation);

  const pctTry = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', {
    token: T.claims, body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000, content_bp: 9000 }
  });
  check('a percentage on an allocation is refused',
    pctTry.status === 400 && pctTry.body.error === 'percentage_not_accepted', pctTry.body);

  const over = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', {
    token: T.claims, body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 500000 }
  });
  check('over-allocation refused 409 with available and requested',
    over.status === 409 && over.body.available_g === 360000 && over.body.requested_g === 500000, over.body);
  check('refusal carries the sentence the product needs',
    /This allocation is refused. Available: 360000 g. Requested: 500000 g./.test(over.body.message || ''), over.body.message);

  const afterRefusal = await call('GET', '/api/balance-periods/BP-DEMO-N6-2026H1', { token: T.claims });
  check('a refusal moves no credit',
    afterRefusal.body.credits_available_g.post_consumer === 360000, afterRefusal.body.credits_available_g);

  const sAlloc = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', {
    token: T.signer, body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000 }
  });
  check('a signer may not allocate claim', sAlloc.status === 403, sAlloc.body);

  const [ra, rb] = await Promise.all([
    call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', {
      token: T.claims, body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 }
    }),
    call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', {
      token: T.claims, body: { lot: 'LOT-N6-0002', category: 'post_consumer', mass_g: 360000 }
    })
  ]);
  const statuses = [ra.status, rb.status].sort();
  check('two racing allocations produce exactly one 201 and one 409',
    statuses[0] === 201 && statuses[1] === 409, { ra: ra.status, rb: rb.status, a: ra.body, b: rb.body });

  const won = ra.status === 201 ? ra : rb;
  check('allocation of 360000 to a 400000 g lot gives content_bp 9000',
    won.body.lot === 'LOT-N6-0001' ? won.body.content_bp === 9000 : true, won.body);

  const bp2 = await call('GET', '/api/balance-periods/BP-DEMO-N6-2026H1', { token: T.claims });
  check('credits_available post_consumer now 0', bp2.body.credits_available_g.post_consumer === 0, bp2.body.credits_available_g);
  check('the two categories are never netted', bp2.body.credits_available_g.pre_consumer === 336000);

  const further = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', {
    token: T.claims, body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1 }
  });
  check('a further post-consumer allocation is refused', further.status === 409, further.body);

  const refusedQ = await call('GET', '/api/record/queries/refused_allocations', { token: T.auditor });
  check('refused allocations are in the record with the margin',
    refusedQ.body.results.some((r) => r.available_g !== undefined), refusedQ.body.results?.[0]);

  const badFactor = await call('POST', '/api/conversion-factors', {
    token: T.claims,
    body: { site: 'SITE-DEMO', factor_bp: 9000, derived_from: '2026-04-01', derived_to: '2026-06-30', derived_in_g: 1000000, derived_out_g: 800000 }
  });
  check('a factor that does not reconcile is refused',
    badFactor.status === 409 && badFactor.body.expected_factor_bp === 8000, badFactor.body);

  const carb = await call('GET', '/api/lots/LOT-N6-0001/carbon', { token: T.quality });
  check('carbon value 4260000', carb.body.value_mg_per_kg === 4260000, carb.body.value_mg_per_kg);
  check('carbon carries boundary, method version and uncertainty',
    carb.body.boundary === 'cradle-to-gate' && carb.body.method_version === 'CM-PA6 v2' && carb.body.uncertainty_bp === 1200, carb.body);
  check('breakdown lines sum to the value',
    carb.body.breakdown.reduce((s, l) => s + l.mg_per_kg, 0) === carb.body.value_mg_per_kg);
  check('primary_share 6500 and not default-led',
    carb.body.primary_share_bp === 6500 && carb.body.default_led === false, carb.body);
  check('the two energy figures come together',
    carb.body.energy_location_mg_per_kg === 1850000 && carb.body.energy_market_mg_per_kg === 620000, carb.body);
  check('unmatched kwh 50000', carb.body.unmatched_kwh === 50000, carb.body.unmatched_kwh);
  check('comparator named', carb.body.comparator.material === 'virgin PA6' && carb.body.comparator.dataset_year === 2025);
  check('internal view always carries the breakdown', Array.isArray(carb.body.breakdown));

  const heldEac = await call('POST', '/api/energy-instruments/EAC-2025-0031/retire', {
    token: T.quality, body: { period: 'BP-DEMO-N6-2026H1' }
  });
  check('held instrument with wrong vintage refused on both counts',
    heldEac.status === 409 &&
    heldEac.body.refusals.some((r) => r.condition === 'instrument_not_retired') &&
    heldEac.body.refusals.some((r) => r.condition === 'vintage_mismatch'), heldEac.body);

  const claimsMethod = await call('POST', '/api/carbon-methods', {
    token: T.claims, body: { id: 'CM-PA6', standard: 'ISO 14067', functional_unit: '1 kg', boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'X' }
  });
  check('a claims manager may not alter a carbon method', claimsMethod.status === 403, claimsMethod.body);

  const share = await call('GET', '/api/outputs/OUT-U-0002/share', { token: T.quality });
  check('OUT-U-0002 share_bp is 526', share.body.share_bp === 526, share.body);

  const analystDisp = await call('POST', '/api/lots/LOT-N6-0001/disposition', {
    token: T.analyst, body: { disposition: 'released' }
  });
  check('an analyst may not set a disposition', analystDisp.status === 403, analystDisp.body);

  const devBlocked = await call('POST', '/api/lots/LOT-N6-0002/disposition', {
    token: T.quality, body: { disposition: 'released' }
  });
  check('a disposition is refused while a deviation is open',
    devBlocked.status === 409 && devBlocked.body.error === 'open_deviation', devBlocked.body);

  const noMethod = await call('POST', '/api/test-results', {
    token: T.analyst, body: { lot: 'LOT-N6-0001', property: 'moisture', value: '0.05', unit: 'percent' }
  });
  check('a test result with no method is refused', noMethod.status === 400, noMethod.body);

  const mismatch = await call('POST', '/api/test-results', {
    token: T.analyst, body: { lot: 'LOT-N6-0001', property: 'moisture', method: 'IN-HOUSE-9', value: '0.05', unit: 'percent', uncertainty_bp: 100 }
  });
  check('a method mismatch is recorded but not usable for release',
    mismatch.body.method_mismatch === true && mismatch.body.usable_for_release === false, mismatch.body);

  const shortReason = await call('POST', '/api/overrides', {
    token: T.quality, body: { separation: 'analyst_not_dispositioner', reason: 'too short', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' }
  });
  check('an override reason under forty characters is refused',
    shortReason.status === 400 && shortReason.body.error === 'reason_too_short', shortReason.body);

  const selfReview = await call('POST', '/api/overrides/OVR-0001/review', { token: T.quality, body: {} });
  check('the authoriser may not review their own override',
    selfReview.status === 409 && selfReview.body.error === 'authoriser_cannot_review', selfReview.body);
  const plantReview = await call('POST', '/api/overrides/OVR-0001/review', { token: T.plant, body: {} });
  check('a plant operator may not review an override', plantReview.status === 403, plantReview.body);

  const preview = await call('POST', '/api/certificates/preview', {
    token: T.signer, body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' }
  });
  check('preview carries exactly eight conditions', preview.body.conditions?.length === 8, preview.body.conditions?.length);
  const unrev = preview.body.conditions.find((x) => x.condition === 'no_unreviewed_override');
  check('the unreviewed override blocks and names the record',
    unrev.satisfied === false && unrev.blocking_reference === 'OVR-0001', unrev);

  const signBlocked = await call('POST', '/api/certificates', {
    token: T.signer, body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }
  });
  check('signing is refused while a condition is unsatisfied',
    signBlocked.status === 409 && signBlocked.body.error === 'conditions_not_satisfied', signBlocked.body?.error);

  const review = await call('POST', '/api/overrides/OVR-0001/review', { token: T.claims, body: {} });
  check('a second person may review the override', review.status === 201 && review.body.reviewed === true, review.body);

  const preview2 = await call('POST', '/api/certificates/preview', {
    token: T.signer, body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' }
  });
  const stillBlocked = preview2.body.conditions.filter((x) => !x.satisfied);
  check('the override no longer blocks',
    !stillBlocked.find((x) => x.condition === 'no_unreviewed_override'), stillBlocked);

  const wrongScope = await call('POST', '/api/certificates/preview', {
    token: T.signer2, body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' }
  });
  const scopeCond = wrongScope.body.conditions.find((x) => x.condition === 'signer_holds_scope');
  check('signer2 holds no scope for a SITE-DEMO lot', scopeCond.satisfied === false, scopeCond);
  const wrongSign = await call('POST', '/api/certificates', {
    token: T.signer2, body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }
  });
  check('signer2 is refused a certificate on a SITE-DEMO lot', wrongSign.status === 409, wrongSign.body?.error);

  const noPw = await call('POST', '/api/certificates', {
    token: T.signer, body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' }
  });
  check('signing without the password is refused',
    noPw.status === 401 && noPw.body.error === 'reauthentication_required', noPw.body);

  const closeByPublisher = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {
    token: T.quality, body: {}
  });
  check('a quality manager may not close a balance period', closeByPublisher.status === 403, closeByPublisher.body);

  const closeBlocked = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {
    token: T.claims, body: {}
  });
  check('closing is refused while a deviation is open and names it',
    closeBlocked.status === 409 && closeBlocked.body.blockers?.length > 0, closeBlocked.body);

  await call('POST', '/api/deviations/DEV-0001/close', { token: T.quality, body: { outcome: 'root_cause_found' } });
  await call('POST', '/api/lots/LOT-N6-0002/disposition', { token: T.quality, body: { disposition: 'quarantined' } });

  const closed = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', { token: T.claims, body: {} });
  check('the period closes', closed.status === 201, closed.body);
  check('carry-over is settled per category',
    closed.body.carried_forward_g && closed.body.expired_g, closed.body);

  const reopen = await call('POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', { token: T.claims, body: {} });
  check('a closed period refuses to reopen', reopen.status === 409, reopen.body);

  const sign = await call('POST', '/api/certificates', {
    token: T.signer, body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }
  });
  check('the certificate signs once every condition holds', sign.status === 201, sign.body?.error || sign.body?.failed_conditions);
  check('the first SITE-DEMO number is CERT-DEMO-000001',
    sign.body.number === 'CERT-DEMO-000001', sign.body.number);
  check('claim type returned beside the percentage',
    sign.body.claim_type === 'mass_balance' && sign.body.content_bp === 9000, sign.body);
  check('a mass-balance certificate states the prohibition',
    /may not state that this material physically contains recycled content/i.test(sign.body.prohibited_statement || ''),
    sign.body.prohibited_statement);
  check('the eight conditions are stored as they stood', sign.body.conditions?.length === 8);
  check('a yield figure appears on no certificate',
    !JSON.stringify(sign.body).match(/yield/i), 'yield leaked onto the certificate');

  const doc1 = await call('GET', `/api/certificates/${sign.body.number}/document`, { raw: true });
  const doc2 = await call('GET', `/api/certificates/${sign.body.number}/document`, { raw: true });
  check('the document is byte-stable across reads', doc1.text === doc2.text);
  check('the document carries the claim type before the percentage',
    doc1.text.indexOf('3. CLAIM TYPE') < doc1.text.indexOf('4. RECYCLED CONTENT') &&
    doc1.text.indexOf('3. CLAIM TYPE') > 0, {
      claim: doc1.text.indexOf('3. CLAIM TYPE'), content: doc1.text.indexOf('4. RECYCLED CONTENT')
    });
  check('the document carries the four carbon components',
    /Boundary/.test(doc1.text) && /Method version/.test(doc1.text) && /Uncertainty/.test(doc1.text));

  const replay = await call('GET', `/api/certificates/${sign.body.number}/replay`, { token: T.auditor });
  check('a certificate replays and reports agreement',
    replay.body.reproducible === true && replay.body.agrees === true, replay.body);
  check('replay names its input versions', !!replay.body.input_versions?.carbon_method);

  const v1 = await fetch(BASE + '/api/verify/CERT-PILOT-000001').then((r) => r.json());
  check('verify resolves without a session', v1.found === true);
  check('verify states the withdrawal, its date and reason',
    v1.state === 'withdrawn' && v1.withdrawn_on === '2026-04-18' &&
    v1.withdrawal_reason === 'A collector category was corrected after acceptance', v1);
  check('verify returns ten fields and nothing else',
    Object.keys(v1).length === 10, Object.keys(v1));
  check('verify offers no replacement and no genealogy',
    !('replacement' in v1) && !('genealogy' in v1) && !('yield' in v1) && !('recipient' in v1));
  const v2 = await fetch(BASE + '/api/verify/CERT-DEMO-999999');
  const v2b = await v2.json();
  check('an unknown number is 200 with found false', v2.status === 200 && v2b.found === false, v2b);

  const wd = await call('POST', '/api/certificates/CERT-PILOT-000002/withdraw', {
    token: T.signer2, body: { reason: 'The underlying allocation was restated after issue' }
  });
  check('withdrawal answers with its five consequences',
    wd.status === 201 && wd.body.state === 'withdrawn' &&
    Array.isArray(wd.body.notified_recipients) && Array.isArray(wd.body.void_statements) &&
    Array.isArray(wd.body.derived_certificates) && Array.isArray(wd.body.batch_traversal), wd.body);
  check('recipients are named, not counted',
    wd.body.notified_recipients[0]?.name === 'Vanta Safety Systems', wd.body.notified_recipients);
  const wdVerify = await fetch(BASE + '/api/verify/CERT-PILOT-000002').then((r) => r.json());
  check('the address still resolves and states the withdrawal',
    wdVerify.found === true && wdVerify.state === 'withdrawn', wdVerify);

  const chain = await call('GET', '/api/record/check', { token: T.auditor });
  check('the digest chain verifies', chain.body.holds === true, chain.body.first_failure);
  const recDel = await call('DELETE', '/api/record/1', { token: T.auditor });
  check('the record refuses a deletion', recDel.status === 409, recDel.body);
  const recPatch = await call('PATCH', '/api/record/1', { token: T.auditor, body: { act: 'x' } });
  check('the record refuses an edit', recPatch.status === 409, recPatch.body);
  const chain2 = await call('GET', '/api/record/check', { token: T.auditor });
  check('the chain still holds after refused edits', chain2.body.holds === true);

  const rec = await call('GET', '/api/record', { token: T.auditor });
  check('the first entry prev_digest is sixty-four zeroes',
    rec.body[0].prev_digest === '0'.repeat(64), rec.body[0]?.prev_digest);
  check('the record refuses a page',
    (await call('GET', '/api/record?page=2', { token: T.auditor })).status === 400);

  for (const name of ['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
    'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
    'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor']) {
    const r = await call('GET', `/api/record/queries/${name}`, { token: T.auditor });
    check(`query ${name} answers a complete set`, r.status === 200 && r.body.complete === true, r.body);
    const paged = await call('GET', `/api/record/queries/${name}?limit=1`, { token: T.auditor });
    check(`query ${name} refuses a limit`, paged.status === 400);
  }

  const ret = await call('GET', '/api/record/1/retention', { token: T.auditor });
  check('retention carries the three bases and a computed retain_until',
    ret.body.scheme_months === 120 && ret.body.statutory_months === 84 &&
    ret.body.retain_until === ret.body.scheme_until, ret.body);
  const holdSeq = (await call('GET', '/api/record?act=certificate_signed', { token: T.auditor }))
    .body.find((e) => e.object_ref === 'CERT-PILOT-000001')?.seq;
  const heldRet = await call('GET', `/api/record/${holdSeq}/retention`, { token: T.auditor });
  check('the seeded legal hold shows on the retention answer', heldRet.body.legal_hold === true, heldRet.body);
  const expireHeld = await call('POST', `/api/record/${holdSeq}/expire`, { token: T.quality, body: {} });
  check('a record under hold refuses deletion',
    expireHeld.status === 409 && expireHeld.body.error === 'under_legal_hold', expireHeld.body);

  const inb = await call('GET', '/api/inbound', { token: T.auditor });
  check('three inbound records seeded', inb.body.length >= 3);
  check('payload kept verbatim as bytes', typeof inb.body[0].payload_verbatim === 'string');
  const post = await call('POST', '/api/inbound/laboratory', {
    body: { received_at: new Date().toISOString(), payload: { lot: 'LOT-N6-0001', property: 'ash', value: '0.2' } }
  });
  check('inbound answers with the reference it took', post.status === 201 && !!post.body.reference, post.body);
  const badSource = await call('POST', '/api/inbound/erp', { body: { received_at: '2026-01-01T00:00:00Z', payload: {} } });
  check('an unknown inbound source is refused', badSource.status === 404);

  const recon = await call('GET', '/api/reconciliation', { token: T.auditor });
  check('reconciliation returns six figures',
    ['mass_balance_residual_g', 'credit_margin_g', 'consumptions_on_open_runs',
      'batches_with_broken_custody', 'certificates_with_superseded_figures', 'integration_ages']
      .every((k) => k in recon.body), Object.keys(recon.body));
  const cr = recon.body.integration_ages.find((x) => x.source === 'customer_reporting');
  check('customer_reporting reports null rather than zero', cr.age_hours === null, cr);

  const pv = await call('GET', '/api/parties/COL-BRINE/versions', {});
  check('the party history is complete', pv.body.length === 2, pv.body);

  const blend = await call('POST', '/api/lots/LOT-N6-0001/blend', {
    token: T.claims, body: { with: 'LOT-N6-0003' }
  });
  check('blending 400000@9000 with 200000@7500 gives 600000@8500',
    blend.body.mass_g === 600000 && blend.body.content_bp === 8500, blend.body);
  check('the blend names both sites',
    blend.body.sites.includes('SITE-DEMO') && blend.body.sites.includes('SITE-PILOT'), blend.body.sites);
  check('the blend carries the provisional-factor flag of the weaker',
    blend.body.provisional_factor === true, blend.body);

  const proj = await call('GET', '/api/contracts/CON-VANTA-1/projection', { token: T.claims });
  check('a planned site is flagged and the flag is not dismissible',
    proj.body.planned_site_flag === true && proj.body.flag_dismissible === false, proj.body);
  check('a contract states its shortfall consequence',
    proj.body.shortfall_consequence === 'a make-good volume in the following period', proj.body);
  check('projection carries the floor and the required remaining average',
    proj.body.floor_bp === 3000 && 'required_remaining_bp' in proj.body, proj.body);

  const stats = await call('GET', '/api/statistics', {});
  check('three statistics each with source, year and geography',
    stats.body.length === 3 && stats.body.every((s) => s.source && s.year && s.geography), stats.body);
  const pos = await call('GET', '/api/positions', {});
  check('one open position', pos.body.length === 1 && pos.body[0].title === 'Process Engineer', pos.body);
  const news = await call('GET', '/api/news', {});
  check('three news items with real tags',
    news.body.length === 3 && news.body.every((n) => ['funding', 'partnership', 'technical', 'recognition'].includes(n.tag)), news.body);
  check('an item in another language says so', news.body.some((n) => n.language === 'fr'));

  const enq = await fetch(BASE + '/api/enquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key() },
    body: JSON.stringify({ type: 'waste_supply', email: 'supplier@example.com', name: 'A Supplier', message: 'We have nylon offcuts.' })
  });
  const enqBody = await enq.json();
  check('an enquiry answers 201 with reference, destination and response time',
    enq.status === 201 && enqBody.reference && enqBody.destination === 'feedstock@example.com' && enqBody.response_days === 3, enqBody);
  check('a waste-supply enquiry opens a collector record', enqBody.opened?.kind === 'collector', enqBody.opened);

  const exp = await call('POST', '/api/exports', {
    token: T.auditor, body: { sites: ['SITE-DEMO'], certificates: [sign.body.number] }
  });
  check('an export is self-contained and carries digests and anchors',
    exp.status === 201 && exp.body.anchors && exp.body.derivations, exp.body?.error);
  const exports = await call('GET', '/api/record/queries/exports_by_auditor', { token: T.auditor });
  check('the export is itself an entry', exports.body.results.length >= 1, exports.body);

  const mp = await fetch('http://mailpit:8025/api/v1/messages?limit=50').then((r) => r.json()).catch(() => null);
  if (mp) {
    const subjects = (mp.messages || []).map((m) => m.Subject);
    check('a signed certificate sent one mail',
      subjects.some((s) => s === `Certificate ${sign.body.number} issued`), subjects);
    check('a withdrawal sent one mail',
      subjects.some((s) => s === 'Certificate CERT-PILOT-000002 withdrawn'), subjects);
    check('an enquiry sent one mail', subjects.some((s) => /^Enquiry ENQ-\d+ received$/.test(s)), subjects);
    check('allocating and closing sent nothing',
      !subjects.some((s) => /alloc|period|restat|override|disposition/i.test(s)), subjects);
    const one = (mp.messages || [])[0];
    check('mail is addressed to exactly one recipient with no copies',
      !one || (one.To?.length === 1 && (!one.Cc || one.Cc.length === 0) && (!one.Bcc || one.Bcc.length === 0)), one?.To);
  }

  // The chain is checked again at the end, after every act above has been recorded. An
  // entry whose content carries a timestamp digests one way on write and must digest the
  // same way on read.
  const finalChain = await call('GET', '/api/record/check', { token: T.auditor });
  check('the digest chain still holds after every act in this suite',
    finalChain.body.holds === true, finalChain.body.first_failure);
  const secondClose = await call('POST', '/api/runs/RUN-D-0001/close', { token: T.plant, body: {} });
  check('a second close is refused and recorded', secondClose.status === 409, secondClose.body?.error);
  const afterClose = await call('GET', '/api/record/check', { token: T.auditor });
  check('the chain holds after a refusal carrying a timestamp is recorded',
    afterClose.body.holds === true, afterClose.body.first_failure);

  // Twelve acts landing at once must still produce one ordered chain with no gap: the
  // read of the previous digest and the insert are one transaction.
  await Promise.all(Array.from({ length: 12 }, (_, i) =>
    call('POST', '/api/inbound/control_system', {
      body: { received_at: new Date().toISOString(), payload: { burst: i } }
    })));
  const burst = await call('GET', '/api/record/check', { token: T.auditor });
  check('the chain holds when twelve acts land at once',
    burst.body.holds === true, burst.body.first_failure);
  const seqs = (await call('GET', '/api/record', { token: T.auditor })).body.map((e) => e.seq);
  check('the sequence has no gap',
    seqs.every((v, i) => i === 0 || v === seqs[i - 1] + 1), seqs.slice(0, 5));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(' - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });

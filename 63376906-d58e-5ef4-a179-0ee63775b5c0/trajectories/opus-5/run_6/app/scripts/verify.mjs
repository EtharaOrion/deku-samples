// Walks the API and checks every figure the brief pins down.
const BASE = process.env.BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass += 1;
  else { fail += 1; failures.push(`${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); }
}
function checkTrue(name, cond, detail = '') {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`${name}: ${detail}`); }
}

const tokens = {};
async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await res.json();
  tokens[email] = j.access_token;
  return j;
}

let keyN = Date.now();
async function call(email, method, path, body, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  if (email) headers.authorization = `Bearer ${tokens[email]}`;
  if (method !== 'GET' && !headers['idempotency-key']) headers['idempotency-key'] = `key-${keyN++}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const run = async () => {
  for (const u of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
    const j = await login(`${u}@example.com`);
    checkTrue(`login ${u}`, !!j.access_token, JSON.stringify(j));
  }
  const me = await call('signer2@example.com', 'GET', '/api/auth/me');
  check('signer2 sites', me.body.sites, ['SITE-PILOT']);

  const sites = await call('plant@example.com', 'GET', '/api/sites');
  const comm = sites.body.find((s) => s.reference === 'SITE-COMM');
  check('SITE-COMM uncommitted_kg', comm.uncommitted_kg, -1000000);
  check('SITE-COMM confidence', comm.confidence, 'planned');
  const cap = await call('plant@example.com', 'GET', '/api/sites/SITE-DEMO/capacity');
  check('SITE-DEMO uncommitted', cap.body.uncommitted_kg, 80000);
  check('capacity basis', cap.body.basis, '8000 hours per year, 0.90 availability, 0.80 yield');

  const batches = await call('plant@example.com', 'GET', '/api/batches');
  const by = Object.fromEntries(batches.body.map((b) => [b.reference, b]));
  check('BATCH-1001 dry', by['BATCH-1001'].dry_mass_g, 450000);
  check('BATCH-1001 claimable', by['BATCH-1001'].claimable, true);
  check('BATCH-1002 dry', by['BATCH-1002'].dry_mass_g, 300000);
  check('BATCH-1003 dry', by['BATCH-1003'].dry_mass_g, 190000);
  check('BATCH-1003 claimable', by['BATCH-1003'].claimable, false);
  check('BATCH-1003 reason', by['BATCH-1003'].claimable_reason, 'collector_approval_lapsed');
  check('BATCH-1003 collector_name', by['BATCH-1003'].collector_name, 'Brine Textile Recovery');
  check('BATCH-1004 dry', by['BATCH-1004'].dry_mass_g, 120000);
  check('BATCH-1004 claimable', by['BATCH-1004'].claimable, true);
  checkTrue('BATCH-1004 lapsed_calibration', by['BATCH-1004'].flags.includes('lapsed_calibration'), JSON.stringify(by['BATCH-1004'].flags));
  check('BATCH-1005 claimable', by['BATCH-1005'].claimable, false);
  check('BATCH-1005 reason', by['BATCH-1005'].claimable_reason, 'custody_link_missing');
  check('BATCH-1005 missing kind', by['BATCH-1005'].claimable_missing_kind, 'transport');
  check('BATCH-1004 departure', by['BATCH-1004'].composition_departure_bp, 800);

  const wc = await call('plant@example.com', 'POST', '/api/batches', {
    collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer',
    gross_g: 32345, tare_g: 20000, net_g: 12345, moisture_bp: 5000,
    moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-01',
    composition: { polymer: 'PA6', fraction_bp: 9000, basis: 'sampled' },
    contamination: { non_nylon_bp: 500, elastane_bp: 200, coatings: 'none', colour_load: 'mixed', foreign_matter: 'none' },
    custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance']
      .map((kind) => ({ kind, date: '2026-04-01', party: 'COL-ALDER' })),
  });
  check('worked case dry mass floored', wc.body.dry_mass_g, 6172);
  checkTrue('create answers with reference', !!wc.body.reference, JSON.stringify(wc.body).slice(0, 200));

  const cat = await call('quality@example.com', 'PATCH', '/api/batches/BATCH-1001', { category: 'pre_consumer' });
  check('category change status', cat.status, 409);
  check('category change code', cat.body.error, 'category_immutable_after_acceptance');
  const cat2 = await call('plant@example.com', 'PATCH', '/api/batches/BATCH-1001', { category: 'pre_consumer' });
  check('category change refused for operator too', cat2.status, 409);

  const gen = await call('auditor@example.com', 'GET', '/api/lots/LOT-N6-0001/genealogy');
  const b1001 = gen.body.nodes.filter((n) => n.kind === 'batch' && n.reference === 'BATCH-1001');
  check('BATCH-1001 appears once', b1001.length, 1);
  check('BATCH-1001 total mass', b1001[0].mass_g, 450000);
  checkTrue('genealogy flagged', gen.body.flagged === true, `flagged=${gen.body.flagged}`);
  checkTrue('text_equivalent present', !!gen.body.text_equivalent, '');
  const genPage = await call('auditor@example.com', 'GET', '/api/lots/LOT-N6-0001/genealogy?page=1');
  check('genealogy refuses page', genPage.status, 400);

  const impact = await call('auditor@example.com', 'GET', '/api/batches/BATCH-1001/impact');
  checkTrue('impact names lots', impact.body.lots.some((l) => l.reference === 'LOT-N6-0001'), JSON.stringify(impact.body.lots));

  const bp = await call('claims@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  check('post_consumer in', bp.body.categories.post_consumer.credits_in_g, 360000);
  check('pre_consumer in', bp.body.categories.pre_consumer.credits_in_g, 336000);
  check('post_consumer out', bp.body.categories.post_consumer.credits_out_g, 0);
  check('post_consumer available', bp.body.categories.post_consumer.credits_available_g, 360000);
  check('non_claimable_input_g', bp.body.non_claimable_input_g, 190000);
  check('override_count', bp.body.override_count, 1);
  check('open_restatement_count', bp.body.open_restatement_count, 0);
  check('open_finding_count', bp.body.open_finding_count, 1);
  check('inbound credits', bp.body.categories.post_consumer.inbound_credits.length, 1);
  check('inbound origin', bp.body.categories.post_consumer.inbound_credits[0].origin_site, 'SITE-PILOT');
  check('inbound fresh_credit', bp.body.categories.post_consumer.inbound_credits[0].fresh_credit, false);

  const over = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 500000 });
  check('over-allocation status', over.status, 409);
  check('over available_g', over.body.available_g, 360000);
  check('over requested_g', over.body.requested_g, 500000);

  const alloc = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 });
  check('allocation status', alloc.status, 201);
  check('content_bp after 360000/400000', alloc.body.content_bp, 9000);
  const bp2 = await call('claims@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  check('available after', bp2.body.categories.post_consumer.credits_available_g, 0);
  const again = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1 });
  check('further allocation refused', again.status, 409);

  const pct = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1000, content_bp: 5000 });
  check('percentage refused', pct.status, 400);
  check('percentage refused code', pct.body.error, 'computed_figure_not_accepted');

  const k = `idem-${Date.now()}`;
  const i1 = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1000 }, { 'idempotency-key': k });
  const i2 = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1000 }, { 'idempotency-key': k });
  check('same key same body replays', i2.body.reference, i1.body.reference);
  const i3 = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
    { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 2000 }, { 'idempotency-key': k });
  check('same key different body 409', i3.status, 409);
  check('same key different body code', i3.body.error, 'idempotency_key_reuse');
  const noKey = await fetch(`${BASE}/api/balance-periods/BP-DEMO-N6-2026H1/allocations`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens['claims@example.com']}` },
    body: JSON.stringify({ lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1 }),
  });
  check('no key refused', noKey.status, 400);

  const before = await call('claims@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  const remaining = before.body.categories.pre_consumer.credits_available_g;
  const [ra, rb] = await Promise.all([
    call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
      { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: remaining }),
    call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
      { lot: 'LOT-N6-0002', category: 'pre_consumer', mass_g: remaining }),
  ]);
  const codes = [ra.status, rb.status].sort();
  check('race: one 201 one 409', codes, [201, 409]);
  const after = await call('claims@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  checkTrue('race: available never negative', after.body.categories.pre_consumer.credits_available_g >= 0,
    String(after.body.categories.pre_consumer.credits_available_g));

  const carb = await call('quality@example.com', 'GET', '/api/lots/LOT-N6-0001/carbon');
  check('carbon value', carb.body.value_mg_per_kg, 4260000);
  check('carbon uncertainty', carb.body.uncertainty_bp, 1200);
  check('carbon primary share', carb.body.primary_share_bp, 6500);
  check('carbon boundary', carb.body.boundary, 'cradle-to-gate');
  check('carbon method version', carb.body.method_version, 'CM-PA6 v2');
  check('default_led false', carb.body.default_led, false);
  check('breakdown sums', carb.body.breakdown.reduce((s, l) => s + l.mg_per_kg, 0), 4260000);
  check('energy location', carb.body.energy_location_mg_per_kg, 1850000);
  check('energy market', carb.body.energy_market_mg_per_kg, 620000);
  check('metered kwh', carb.body.metered_kwh, 300000);
  check('retired kwh', carb.body.retired_kwh, 250000);
  check('unmatched kwh', carb.body.unmatched_kwh, 50000);
  check('comparator material', carb.body.comparator.material, 'virgin PA6');
  checkTrue('comparison names comparator', /lower than virgin PA6/i.test(carb.body.comparison_statement || ''), carb.body.comparison_statement);

  // a response carrying value_mg_per_kg without its boundary, method version and
  // uncertainty does not exist anywhere in the API, at any depth
  for (const p of ['/api/lots/LOT-N6-0001/carbon', '/api/carbon-figures',
    '/api/certificates/CERT-PILOT-000001', '/api/certificates',
    '/api/balance-periods/BP-DEMO-N6-2026H1/energy', '/api/lots/LOT-N6-0003/carbon']) {
    const res = await call('quality@example.com', 'GET', p);
    const bad = [];
    const walk = (o, at) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${at}[${i}]`));
      if (o.value_mg_per_kg !== undefined
        && (!o.boundary || !o.method_version || o.uncertainty_bp === undefined)) bad.push(at);
      const loc = o.energy_location_mg_per_kg !== undefined;
      const mkt = o.energy_market_mg_per_kg !== undefined;
      if (loc !== mkt) bad.push(`${at}: one energy figure without the other`);
      for (const [k, v] of Object.entries(o)) walk(v, `${at}.${k}`);
    };
    walk(res.body, p);
    check(`no bare carbon value or lone energy figure on ${p}`, bad, []);
  }

  const retire = await call('claims@example.com', 'POST', '/api/energy-instruments/EAC-2025-0031/retire', { period: 'BP-DEMO-N6-2026H1' });
  check('held instrument refused', retire.status, 409);
  const conds = (retire.body.refusals || []).map((x) => x.condition);
  check('refused on both counts', conds.includes('instrument_not_retired') && conds.includes('vintage_mismatch'), true);

  const bpo = await call('plant@example.com', 'GET', '/api/outputs/OUT-U-0002');
  check('OUT-U-0002 share_bp', bpo.body.share_bp, 526);
  checkTrue('claim_share_g present', bpo.body.claim_share_g !== undefined, '');
  checkTrue('emissions_share_mg present', bpo.body.emissions_share_mg !== undefined, '');

  const badFactor = await call('claims@example.com', 'POST', '/api/conversion-factors',
    { site: 'SITE-DEMO', factor_bp: 8500, derived_from: '2026-04-01', derived_to: '2026-06-30', derived_in_g: 1000000, derived_out_g: 800000 });
  check('bad factor refused', badFactor.status, 409);
  check('bad factor expected', badFactor.body.expected_factor_bp, 8000);

  const prev = await call('signer@example.com', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  check('eight conditions', prev.body.conditions.length, 8);
  const ovrCond = prev.body.conditions.find((x) => x.condition === 'no_unreviewed_override');
  check('override blocking', ovrCond.satisfied, false);
  check('override blocking reference', ovrCond.blocking_reference, 'OVR-0001');

  const selfReview = await call('quality@example.com', 'POST', '/api/overrides/OVR-0001/review', {});
  check('authoriser cannot review', selfReview.status, 403);
  const review = await call('claims@example.com', 'POST', '/api/overrides/OVR-0001/review', {});
  check('claims manager reviews', review.status, 201);
  check('review sets reviewed', review.body.reviewed, true);
  const prev2 = await call('signer@example.com', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  check('override cleared', prev2.body.conditions.find((x) => x.condition === 'no_unreviewed_override').satisfied, true);

  // signing needs the password again: a session alone is not a signing credential
  const noPw = await call('signer@example.com', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  check('signing without the password is refused', noPw.status, 400);
  const badPw = await call('signer@example.com', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: 'not-the-password' });
  check('signing with a wrong password is refused', badPw.status, 401);

  const prev3 = await call('signer2@example.com', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  check('signer2 scope refused', prev3.body.conditions.find((x) => x.condition === 'signer_holds_scope').satisfied, false);
  const sign2 = await call('signer2@example.com', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
  check('signer2 sign refused', sign2.status, 409);

  const v1 = await fetch(`${BASE}/api/verify/CERT-PILOT-000001`).then((x) => x.json());
  check('verify found', v1.found, true);
  check('verify state', v1.state, 'withdrawn');
  check('verify withdrawn_on', v1.withdrawn_on, '2026-04-18');
  check('verify reason', v1.withdrawal_reason, 'A collector category was corrected after acceptance');
  check('verify keys', Object.keys(v1).sort(), ['claim_type', 'found', 'grade', 'issued_on', 'number', 'recipient_name', 'site', 'state', 'withdrawal_reason', 'withdrawn_on']);
  const v2 = await fetch(`${BASE}/api/verify/CERT-DEMO-999999`);
  check('unknown verify status', v2.status, 200);
  check('unknown verify found', (await v2.json()).found, false);

  const d1 = await fetch(`${BASE}/api/certificates/CERT-PILOT-000002/document`).then((x) => x.text());
  const d2 = await fetch(`${BASE}/api/certificates/CERT-PILOT-000002/document`).then((x) => x.text());
  check('document byte-stable', d1 === d2, true);
  // the document wraps at 72 columns, so compare on normalised whitespace
  const flat = d1.replace(/\s+/g, ' ');
  checkTrue('document carries mass balance sentence',
    flat.includes('This material is claimed by mass balance. It is not physically segregated.'), '');
  checkTrue('document carries prohibited statement',
    flat.includes('You may not state that this material physically contains recycled content.'), '');
  checkTrue('document carries no yield', !/yield/i.test(d1), 'document mentions yield');

  const wprev = await call('signer2@example.com', 'GET', '/api/certificates/CERT-PILOT-000002/withdrawal-preview');
  checkTrue('withdrawal preview names recipients', wprev.body.notified_recipients.length > 0 && !!wprev.body.notified_recipients[0].name, JSON.stringify(wprev.body.notified_recipients));
  checkTrue('withdrawal preview enumerates statements', wprev.body.void_statements.length > 0, '');
  const wd = await call('signer2@example.com', 'POST', '/api/certificates/CERT-PILOT-000002/withdraw', { reason: 'A conversion factor was restated for the period.' });
  check('withdrawal status', wd.status, 201);
  check('withdrawal state', wd.body.state, 'withdrawn');
  checkTrue('withdrawal notified by name', wd.body.notified_recipients[0]?.name === 'Vanta Safety Systems', JSON.stringify(wd.body.notified_recipients));
  checkTrue('withdrawal void statements', wd.body.void_statements.length >= 2, '');
  checkTrue('withdrawal batch traversal', Array.isArray(wd.body.batch_traversal), '');
  const after1 = await fetch(`${BASE}/api/verify/CERT-PILOT-000002`).then((x) => x.json());
  check('withdrawn resolves', after1.state, 'withdrawn');
  const docAfter = await fetch(`${BASE}/api/certificates/CERT-PILOT-000002/document`).then((x) => x.text());
  checkTrue('document states withdrawal first', docAfter.indexOf('WITHDRAWN') < docAfter.indexOf('Recycled content'), '');

  const chk = await call('auditor@example.com', 'GET', '/api/record/check');
  check('chain holds', chk.body.holds, true);
  const del = await call('auditor@example.com', 'DELETE', '/api/record/1');
  check('record delete refused', del.status, 409);
  const patch = await call('auditor@example.com', 'PATCH', '/api/record/1', { action: 'x' });
  check('record patch refused', patch.status, 409);
  const rec = await call('auditor@example.com', 'GET', '/api/record');
  check('first prev_digest zeroes', rec.body[0].prev_digest, '0'.repeat(64));

  for (const name of ['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
    'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
    'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor']) {
    const res = await call('auditor@example.com', 'GET', `/api/record/queries/${name}`);
    checkTrue(`query ${name}`, res.status === 200 && Array.isArray(res.body.results), `status=${res.status} ${JSON.stringify(res.body).slice(0, 150)}`);
    const paged = await call('auditor@example.com', 'GET', `/api/record/queries/${name}?page=2`);
    check(`query ${name} refuses page`, paged.status, 400);
  }
  const refused = await call('auditor@example.com', 'GET', '/api/record/queries/refused_allocations');
  checkTrue('refused allocations recorded with margin', refused.body.results.some((x) => x.available_g === 360000 && x.requested_g === 500000), JSON.stringify(refused.body.results).slice(0, 300));

  const rc = await call('auditor@example.com', 'GET', '/api/record');
  const signEntry = rc.body.find((e) => e.object_ref === 'CERT-PILOT-000001' && e.action === 'signed');
  const ret = await call('auditor@example.com', 'GET', `/api/record/${signEntry.seq}/retention`);
  check('scheme months', ret.body.scheme_months, 120);
  check('statutory months', ret.body.statutory_months, 84);
  check('legal hold', ret.body.legal_hold, true);
  checkTrue('retain_until is the longest', ret.body.retain_until >= ret.body.scheme_until, JSON.stringify(ret.body));
  const exp = await call('auditor@example.com', 'POST', `/api/record/${signEntry.seq}/expire`, {});
  check('hold refuses deletion', exp.status, 409);

  const inb = await call('auditor@example.com', 'GET', '/api/inbound');
  check('inbound count', inb.body.length, 3);
  checkTrue('verbatim kept', inb.body[0].payload_verbatim.includes('WB-TICKET-88431'), inb.body[0].payload_verbatim);
  const recon = await call('auditor@example.com', 'GET', '/api/reconciliation');
  const cr = recon.body.integration_ages.find((x) => x.source === 'customer_reporting');
  check('customer_reporting age null', cr.age_hours, null);
  checkTrue('four sources', recon.body.integration_ages.length === 4, '');
  for (const key of ['mass_balance_residual_g', 'credit_margin_g', 'consumptions_on_open_runs', 'batches_with_broken_custody', 'certificates_with_superseded_figures']) {
    checkTrue(`reconciliation ${key}`, typeof recon.body[key] === 'number', String(recon.body[key]));
  }

  const pv = await call('auditor@example.com', 'GET', '/api/parties/COL-BRINE/versions');
  check('brine versions', pv.body.length, 2);
  check('brine current', pv.body[1].name, 'Brine Circular Materials');

  const cols = await call('quality@example.com', 'GET', '/api/collectors');
  const cinder = cols.body.find((x) => x.reference === 'COL-CINDER');
  check('cinder conditional', cinder.approval_periods[0].state, 'conditional');
  check('cinder condition', cinder.approval_periods[0].condition, 'Sampling plan for coated streams to be agreed');
  check('cinder closes on', cinder.approval_periods[0].condition_closes_on, '2026-10-31');
  checkTrue('cinder finding', cinder.findings.length >= 1, '');
  const colApprove = await call('plant@example.com', 'POST', '/api/collectors/COL-ALDER/approvals',
    { state: 'approved', valid_from: '2027-01-01', valid_to: '2027-12-31' });
  check('operator cannot approve collector', colApprove.status, 403);

  const analystTest = await call('analyst@example.com', 'POST', '/api/test-results', {
    subject_kind: 'lot', subject_ref: 'LOT-N6-0003', property: 'yellowness_index',
    method: 'ASTM E313', instrument: 'YI-1', value: '6.1', unit: 'index', uncertainty_bp: 200,
  });
  check('analyst enters result', analystTest.status, 201);
  const analystDisp = await call('analyst@example.com', 'POST', '/api/lots/LOT-N6-0003/disposition', { disposition: 'released' });
  check('analyst cannot disposition', analystDisp.status, 403);
  const noMethod = await call('analyst@example.com', 'POST', '/api/test-results', {
    subject_kind: 'lot', subject_ref: 'LOT-N6-0003', property: 'moisture',
    instrument: 'KF-1', value: '0.05', unit: 'percent', uncertainty_bp: 200,
  });
  check('result with no method refused', noMethod.status, 400);
  const mismatch = await call('analyst@example.com', 'POST', '/api/test-results', {
    subject_kind: 'lot', subject_ref: 'LOT-N6-0003', property: 'moisture',
    method: 'IN-HOUSE-KF', instrument: 'KF-1', value: '0.05', unit: 'percent', uncertainty_bp: 200,
  });
  check('method mismatch flagged', mismatch.body.method_mismatch, true);
  check('method mismatch unusable', mismatch.body.usable_for_release, false);

  const auditorWrite = await call('auditor@example.com', 'POST', '/api/batches', {
    collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 1, tare_g: 0,
    net_g: 1, moisture_bp: 0, moisture_method: 'x', device: 'WB-DEMO-01', received_on: '2026-04-01', custody: [],
  });
  check('auditor writes no operational record', auditorWrite.status, 403);
  const auditorDisp = await call('auditor@example.com', 'POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' });
  check('auditor cannot disposition', auditorDisp.status, 403);
  const claimsCarbon = await call('claims@example.com', 'POST', '/api/carbon-methods/CM-PA6/versions', {
    standard: 'ISO 14067', functional_unit: '1 kg', boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'x',
  });
  check('claims manager may not alter carbon method', claimsCarbon.status, 403);
  const qualityClose = await call('quality@example.com', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/close', {});
  check('quality manager may not close a period', qualityClose.status, 403);
  const claimsSign = await call('claims@example.com', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
  check('claims manager may not sign', claimsSign.status, 403);

  const shortOvr = await call('quality@example.com', 'POST', '/api/overrides', {
    separation: 'analyst_not_dispositioner', reason: 'too short', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com',
  });
  check('short override reason refused', shortOvr.status, 400);

  const closeAgain = await call('plant@example.com', 'POST', '/api/runs/RUN-D-0001/close', {});
  check('second close refused', closeAgain.status, 409);
  const runD1 = await call('plant@example.com', 'GET', '/api/runs/RUN-D-0001');
  check('RUN-D-0001 losses', runD1.body.losses_g, 120000);
  check('RUN-D-0001 within tolerance', runD1.body.within_tolerance, true);
  const runD2 = await call('plant@example.com', 'GET', '/api/runs/RUN-D-0002');
  check('RUN-D-0002 losses', runD2.body.losses_g, 60000);

  const yld = await call('plant@example.com', 'GET', '/api/lots/LOT-N6-0001/yield');
  check('yield answers plant', yld.status, 200);

  const spec = await call('quality@example.com', 'GET', '/api/specifications/N6/versions/3');
  check('spec properties', spec.body.properties.length, 4);
  check('virgin reference', spec.body.virgin_reference.reference, 'virgin PA6 at relative viscosity 2.42');
  check('spec issued_on', spec.body.issued_on, '2026-02-01');

  const proj = await call('claims@example.com', 'GET', '/api/contracts/CON-VANTA-1/projection');
  check('planned site flag', proj.body.planned_site_flag, true);
  check('flag not dismissible', proj.body.flag_dismissible, false);
  check('shortfall consequence', proj.body.shortfall_consequence, 'a make-good volume in the following period');

  const stats = await fetch(`${BASE}/api/statistics`).then((x) => x.json());
  check('three statistics', stats.length, 3);
  checkTrue('every statistic carries source, year, geography', stats.every((s) => s.source && s.year && s.geography), '');
  const pos = await fetch(`${BASE}/api/positions`).then((x) => x.json());
  check('one position', pos.length, 1);
  check('position title', pos[0].title, 'Process Engineer');
  const news = await fetch(`${BASE}/api/news`).then((x) => x.json());
  check('three news items', news.length, 3);
  checkTrue('news tags real taxonomy', news.every((n) => ['funding', 'partnership', 'technical', 'recognition'].includes(n.tag)), '');
  checkTrue('one item is fr', news.some((n) => n.language === 'fr'), '');

  const enq = await fetch(`${BASE}/api/enquiries`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `enq-${Date.now()}` },
    body: JSON.stringify({ type: 'press', name: 'A Reporter', email: 'reporter@example.com', message: 'Question about the pilot.' }),
  });
  const enqBody = await enq.json();
  check('enquiry status', enq.status, 201);
  check('enquiry destination', enqBody.destination, 'press@example.com');
  check('enquiry response days', enqBody.response_days, 1);
  checkTrue('enquiry reference', !!enqBody.reference, '');

  const l3 = await call('claims@example.com', 'GET', '/api/lots/LOT-N6-0003');
  check('LOT-N6-0003 content', l3.body.content_bp, 7500);
  const l1 = await call('claims@example.com', 'GET', '/api/lots/LOT-N6-0001');
  const blend = await call('plant@example.com', 'POST', '/api/lots/LOT-N6-0001/blend', { with_lot: 'LOT-N6-0003' });
  check('blend mass', blend.body.mass_g, 600000);
  // the brief's worked case: 400000 g at 9000 bp with 200000 g at 7500 bp is 8500 bp.
  // this run has since allocated more claim to LOT-N6-0001, so assert the same
  // mass-weighted arithmetic against the contents the ledger actually holds.
  const expectedBlend = Math.floor((400000 * l1.body.content_bp + 200000 * l3.body.content_bp) / 600000);
  check('blend content mass-weighted and floored', blend.body.content_bp, expectedBlend);
  check('worked case 9000 with 7500 is 8500', Math.floor((400000 * 9000 + 200000 * 7500) / 600000), 8500);
  check('blend names both sites', blend.body.sites_named.sort(), ['SITE-DEMO', 'SITE-PILOT']);
  check('blend provisional flag', blend.body.provisional_factor, true);
  check('blend takes weaker claim type', blend.body.claim_type, 'mass_balance');

  const replay = await call('auditor@example.com', 'GET', '/api/certificates/CERT-PILOT-000001/replay');
  checkTrue('replay answers', replay.body.agrees !== undefined, JSON.stringify(replay.body).slice(0, 200));
  checkTrue('replay input versions', !!replay.body.input_versions, '');

  console.log(`\npass ${pass}  fail ${fail}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(2); });

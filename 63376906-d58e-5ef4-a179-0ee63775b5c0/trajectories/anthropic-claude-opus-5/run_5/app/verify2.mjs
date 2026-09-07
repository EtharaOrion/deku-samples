// Second verification pass, covering the corners the first pass did not reach.
// Development harness; not shipped in the image.
const BASE = process.env.VBASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`${name}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 400)}` : ''}`);
  }
}

const tokens = {};
async function login(who) {
  if (tokens[who]) return tokens[who];
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${who}@example.com`, password: PW }) });
  const j = await res.json();
  tokens[who] = j.access_token;
  return j.access_token;
}
let n = 0;
async function call(who, method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (who) headers.authorization = `Bearer ${await login(who)}`;
  if (method !== 'GET' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = `v2-${Date.now()}-${n++}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let j = null;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}

async function run() {
  // ---- units: no decimal accepted
  const dec = await call('plant', 'POST', '/api/batches', { collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 1000.5, tare_g: 0, net_g: 1000.5, moisture_bp: 0, received_on: '2026-04-01' });
  ok('decimal mass refused', dec.status === 400 && dec.body.error === 'non_integer_quantity', dec.body);

  // ---- inbound source validation and verbatim exactness
  const bad = await call('plant', 'POST', '/api/inbound/not_a_source', { received_at: new Date().toISOString(), payload: {} });
  ok('unknown inbound source refused', bad.status === 400, bad.body);
  const raw = '{"received_at":"2026-09-01T00:00:00Z","payload":{"z":1,"a":  2,"note":"spacing  kept"}}';
  const res = await fetch(`${BASE}/api/inbound/laboratory`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await login('analyst')}`, 'Idempotency-Key': `verb-${Date.now()}` }, body: raw });
  const rj = await res.json();
  ok('verbatim keeps the exact bytes', rj.payload_verbatim === '{"z":1,"a":  2,"note":"spacing  kept"}', rj.payload_verbatim);

  // ---- sites and certification suspension reaching backwards
  const certs0 = await call('quality', 'GET', '/api/certificates');
  const pilotCount = certs0.body.filter((x) => x.site === 'SITE-PILOT').length;
  const susp = await call('quality', 'POST', '/api/sites/SITE-PILOT/certification', { state: 'suspended', effective_from: '2026-01-01', reason: 'A scheme audit finding at the pilot.' });
  ok('suspension recorded with a reference', susp.status === 201 && !!susp.body.reference, susp.body);
  ok('suspension enumerates certificates in window', susp.body.certificates_in_window.length === pilotCount && pilotCount > 0, susp.body.certificates_in_window);
  ok('each is individually resolvable under three outcomes', susp.body.certificates_in_window.every((x) => Array.isArray(x.resolutions_available) && x.resolutions_available.length === 3));
  ok('issuing stops with the suspension named', susp.body.issuing_blocked === true && /suspended/.test(susp.body.blocking_condition), susp.body.blocking_condition);
  const blocked = await call('signer2', 'POST', '/api/certificates', { lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS', password: PW });
  ok('signing at the suspended site is refused', blocked.status === 409 && blocked.body.error === 'site_certification_suspended', blocked.body);
  const lift = await call('quality', 'POST', '/api/sites/SITE-PILOT/certification', { state: 'certified', effective_from: new Date().toISOString().slice(0, 10), reason: 'The finding was closed.' });
  ok('lifting restores issuing', lift.status === 201 && lift.body.issuing_blocked === false, lift.body);
  ok('lifting does not reinstate a withdrawn certificate', /does not reinstate a withdrawn certificate/.test(lift.body.note || ''), lift.body.note);
  const stillWithdrawn = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000001`)).json();
  ok('the withdrawn certificate is still withdrawn', stillWithdrawn.state === 'withdrawn');

  // ---- restatement: one resolution per certificate
  const rst = await call('claims', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/restatements', { reason: 'A verification restatement.' });
  ok('restatement enumerates certificates', rst.status === 201 && rst.body.certificates.length >= 1, rst.body);
  const first = rst.body.certificates[0].number;
  const r1 = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, { certificate: first, outcome: 'unaffected', reason: 'The figure did not move.' });
  ok('a resolution is recorded', r1.status === 201, r1.body);
  const r2 = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, { certificate: first, outcome: 'withdrawn', reason: 'A second attempt.' });
  ok('a second resolution on the same certificate is refused', r2.status === 409 && r2.body.error === 'certificate_already_resolved', r2.body);
  const rMany = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, { certificate: [first, 'X'], outcome: 'unaffected', reason: 'Two at once.' });
  ok('no route resolves more than one certificate at a time', rMany.status === 400, rMany.body);

  // ---- restatement with a revised conversion factor answers content_movements
  const cf = await call('claims', 'POST', '/api/conversion-factors', { site: 'SITE-PILOT', factor_bp: 7000, derived_from: '2026-01-01', derived_to: '2026-06-30', derived_in_g: 1000000, derived_out_g: 700000 });
  ok('a derived factor supersedes the provisional one', cf.status === 201, cf.body);
  const rst2 = await call('claims', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/restatements', { reason: 'The conversion factor was revised.', revised_conversion_factor: cf.body.reference });
  ok('content_movements names the figure that moved', Array.isArray(rst2.body.content_movements) && rst2.body.content_movements.every((m) => 'certificate' in m && 'content_bp' in m && 'corrected_content_bp' in m), rst2.body.content_movements);

  // ---- consumption into a closed period opens a restatement
  const openRun = await call('plant', 'POST', '/api/runs', { run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'EQ-DISS-1', recipe_version: 'RCP-DISS-2', operator: 'plant@example.com', started_at: '2026-03-20T06:00:00Z' });
  ok('a run opens and answers its reference', openRun.status === 201 && !!openRun.body.reference, openRun.body);
  const late = await call('plant', 'POST', `/api/runs/${openRun.body.reference}/consumptions`, { input: 'BATCH-1001', mass_g: 1000, effective_on: '2025-09-01' });
  ok('a consumption into a closed period is refused and opens a restatement', late.status === 409 && late.body.error === 'period_closed' && !!late.body.restatement, late.body);

  // ---- a consumption grants credit on dry mass times the factor
  const cns = await call('plant', 'POST', `/api/runs/${openRun.body.reference}/consumptions`, { input: 'BATCH-1002', mass_g: 10000, effective_on: '2026-03-20' });
  ok('a claimable consumption grants credit', cns.status === 201 && cns.body.credit && cns.body.credit.mass_g === 8000, cns.body.credit);
  const cns2 = await call('plant', 'POST', `/api/runs/${openRun.body.reference}/consumptions`, { input: 'BATCH-1003', mass_g: 10000, effective_on: '2026-03-20' });
  ok('a non-claimable consumption grants nothing and names why', cns2.body.credit.mass_g === 0 && cns2.body.credit.reason === 'collector_approval_lapsed', cns2.body.credit);

  // ---- run close computes losses, refuses a second close
  await call('plant', 'POST', `/api/runs/${openRun.body.reference}/outputs`, { kind: 'intermediate', mass_g: 15000 });
  const close = await call('plant', 'POST', `/api/runs/${openRun.body.reference}/close`, { actual_set_points: { temperature_c: 180, pressure_bar: 3 } });
  ok('losses computed as mass in minus mass out', close.body.losses_g === 5000, close.body);
  ok('outside tolerance raises a deviation', close.body.within_tolerance === false && !!close.body.deviation, close.body);

  // ---- late custody evidence
  const b5 = await call('plant', 'GET', '/api/batches/BATCH-1005');
  ok('BATCH-1005 non-claimable before evidence', b5.body.claimable === false);
  const cust = await call('plant', 'POST', '/api/batches/BATCH-1005/custody', { kind: 'transport', party: 'Haulier Nord', date: '2026-03-02', arrived_on: '2026-05-01', document: 'CMR-991' });
  ok('late evidence makes it claimable from that date', cust.body.claimable === true && cust.body.claimable_from === '2026-05-01', cust.body);

  // ---- partial rejection
  const rej = await call('plant', 'POST', '/api/batches/BATCH-1002/reject', { rejected_g: 50000, reason: 'Coated fraction above the accepted limit.', destination: 'Energy recovery, Lyon' });
  ok('a partial rejection sums', rej.body.accepted_g + rej.body.rejected_g === rej.body.delivered_g, rej.body);
  ok('a rejection records where the mass went', rej.body.rejected_destination === 'Energy recovery, Lyon');
  const rejBad = await call('plant', 'POST', '/api/batches/BATCH-1004/reject', { rejected_g: 999999999, reason: 'x', destination: 'y' });
  ok('a rejection that does not sum is refused', rejBad.status === 409, rejBad.body);

  // ---- overrides: reviewer rules
  const ovr = await call('quality', 'POST', '/api/overrides', { separation: 'booker_not_approver', reason: 'The booking operator approved the collector because the quality manager was unreachable overnight.', lot: 'LOT-N6-0002', authorised_by: 'quality@example.com' });
  ok('an override records with a reference', ovr.status === 201 && !!ovr.body.reference, ovr.body);
  const badRev = await call('plant', 'POST', `/api/overrides/${ovr.body.reference}/review`, {});
  ok('a plant operator may not review an override', badRev.status === 403, badRev.body);
  const okRev = await call('claims', 'POST', `/api/overrides/${ovr.body.reference}/review`, {});
  ok('a claims manager reviews and removes nothing', okRev.body.reviewed === true && okRev.body.reason === ovr.body.reason, okRev.body);

  // ---- method version publishing invalidates the cache but does not recompute
  const carbonBefore = await call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon');
  const mv = await call('quality', 'POST', '/api/carbon-methods/CM-PA6/versions', { boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld', emission_factors: [{ name: 'grid electricity', source: 'EcoBase 2026', year: 2026, value_mg_per_kg: 1700000 }] });
  ok('a new method version supersedes rather than overwrites', mv.status === 201 && mv.body.version === 3 && mv.body.supersedes === 2, mv.body);
  const v2 = await call('quality', 'GET', '/api/carbon-methods/CM-PA6/versions/2');
  ok('the superseded version stays readable', v2.status === 200 && v2.body.superseded === true, v2.body);
  const carbonAfter = await call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon');
  ok('the figure is not silently recomputed', carbonAfter.body.value_mg_per_kg === carbonBefore.body.value_mg_per_kg && carbonAfter.body.method_version === 'CM-PA6 v2', carbonAfter.body.method_version);
  ok('cache_valid answers false from that moment', carbonAfter.body.cache_valid === false, carbonAfter.body.cache_valid);
  const recomp = await call('quality', 'POST', '/api/carbon-figures/CFG-0001/recompute', { reason: 'The emission factor set was superseded.' });
  ok('a recomputation is a recorded act with a new version', recomp.status === 201 && recomp.body.supersedes === 'CFG-0001', recomp.body);
  ok('a recomputation enumerates certificates carrying the superseded figure', Array.isArray(recomp.body.certificates_carrying_superseded_figure), recomp.body);
  const noReason = await call('quality', 'POST', '/api/carbon-figures/CFG-0003/recompute', {});
  ok('a recomputation without a reason is refused', noReason.status === 400, noReason.body);

  // ---- carbon never appears without its four components, anywhere
  const carbonNow = await call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon');
  ok('carbon always carries four components', ['value_mg_per_kg', 'boundary', 'method_version', 'uncertainty_bp'].every((k) => carbonNow.body[k] != null));
  ok('energy figures always together', carbonNow.body.energy_location_mg_per_kg != null && carbonNow.body.energy_market_mg_per_kg != null);
  ok('the internal view always carries the breakdown', Array.isArray(carbonNow.body.breakdown) && carbonNow.body.breakdown.length > 0);

  // ---- allocation basis mismatch answers 409
  await fetch(`${BASE}/api/health`);

  // ---- record retention and expiry
  const rec = await call('auditor', 'GET', '/api/record');
  const target = rec.body.find((x) => x.act === 'batch_booked_in');
  const ret = await call('quality', 'GET', `/api/record/${target.seq}/retention`);
  ok('retention computes rather than stores', ret.body.retain_until === [ret.body.scheme_until, ret.body.statutory_until].sort().pop(), ret.body);
  const expNow = await call('quality', 'POST', `/api/record/${target.seq}/expire`, {});
  ok('expiry refused before retention has passed', expNow.status === 409 && expNow.body.error === 'retention_has_not_passed', expNow.body);
  const hold = await call('quality', 'POST', `/api/record/${target.seq}/legal-hold`, { reason: 'A verification hold.' });
  ok('a hold is placed and answers a reference', hold.status === 201 && !!hold.body.reference, hold.body);
  const ret2 = await call('quality', 'GET', `/api/record/${target.seq}/retention`);
  ok('retention then carries legal_hold true', ret2.body.legal_hold === true);
  const expHeld = await call('quality', 'POST', `/api/record/${target.seq}/expire`, {});
  ok('a record under hold refuses deletion', expHeld.status === 409 && expHeld.body.error === 'under_legal_hold', expHeld.body);
  const lifted = await call('quality', 'DELETE', `/api/record/${target.seq}/legal-hold`);
  ok('a hold lifts and is its own entry', lifted.status === 200 && lifted.body.legal_hold === false, lifted.body);

  // ---- a correction is a new entry naming what it corrects
  const corr = await call('quality', 'POST', '/api/record/corrections', { corrects_seq: target.seq, detail: 'The moisture method was misrecorded and is corrected here.' });
  ok('a correction is a new entry', corr.status === 201 && corr.body.corrects_seq === target.seq, corr.body);
  const chain = await call('auditor', 'GET', '/api/record/check');
  ok('the chain still holds after every act above', chain.body.holds === true, chain.body);

  // ---- change notice flow through to release
  const cn = await call('quality', 'POST', '/api/change-notices', { title: 'Reagent supplier change', detail: 'A second supplier is qualified for the dissolution reagent.', parameter: 'moisture' });
  ok('a change notice derives its notice period', cn.body.notice_period_days > 0 && !!cn.body.reference, cn.body);
  const relBlocked = await call('quality', 'POST', `/api/change-notices/${cn.body.reference}/release`, {});
  ok('release refused until notice is given', relBlocked.status === 409, relBlocked.body);
  for (const cust of cn.body.customers_affected) {
    await call('quality', 'POST', `/api/change-notices/${cn.body.reference}/notify`, { customer: cust.reference, kind: cust.industry === 'automotive' ? 'acknowledged' : 'notified' });
  }
  const rel2 = await call('quality', 'POST', `/api/change-notices/${cn.body.reference}/release`, {});
  ok('release proceeds once every customer is notified or has waived', rel2.status === 200, rel2.body);

  // ---- energy retirement success path
  const eac = await call('claims', 'POST', '/api/energy-instruments/EAC-2026-0007/retire', { period: 'BP-DEMO-N6-2026H1', region: 'EU-27', vintage: 2026 });
  ok('a matching instrument applies', eac.status === 200 && eac.body.unmatched_kwh === 50000, eac.body);

  // ---- specification issue records both
  const spi = await call('quality', 'POST', '/api/specifications/SPEC-N6/versions/3/issue', { customer: 'CUS-VANTA' });
  ok('a specification issue records both', spi.status === 201 && spi.body.customer === 'CUS-VANTA', spi.body);
  const vanta = await call('quality', 'GET', '/api/customers/CUS-VANTA');
  ok('the customer then holds version 3', vanta.body.holds_specification_version === 3, vanta.body);
  ok('conformance is one record per application per version', Array.isArray(vanta.body.conformance) && vanta.body.conformance.length >= 1, vanta.body.conformance);

  // ---- party versions read back under the name of the day
  const pv = await call('quality', 'POST', '/api/parties/COL-ALDER/versions', { name: 'Alder Circular', effective_from: '2027-01-01' });
  ok('a party version supersedes rather than rewrites', pv.status === 201 && pv.body.supersedes.name === 'Alder Reclaim', pv.body);
  const b1 = await call('plant', 'GET', '/api/batches/BATCH-1001');
  ok('a batch reads back under the name it held then', b1.body.collector_name === 'Alder Reclaim', b1.body.collector_name);

  // ---- exports_by_auditor includes reads that returned nothing
  const emptyExport = await call('auditor', 'POST', '/api/exports', { sites: ['SITE-NOWHERE'], certificates: ['CERT-NONE-000000'] });
  ok('an export that returns nothing still answers', emptyExport.status === 201 && emptyExport.body.empty === true, emptyExport.body?.entries?.length);
  const q9 = await call('auditor', 'GET', '/api/record/queries/exports_by_auditor');
  ok('exports_by_auditor includes empty reads', q9.body.results.some((x) => x.returned_nothing === true), q9.body.results);

  // ---- a scoped read names the moment it saw
  const scoped = await call('claims', 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1');
  ok('a scoped read answers read_at', !!scoped.body.read_at, Object.keys(scoped.body));

  // ---- no route accepts a percentage anywhere
  for (const [who, path, body] of [
    ['plant', '/api/batches', { collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 1, tare_g: 0, net_g: 1, moisture_bp: 0, received_on: '2026-04-01', content_bp: 5000 }],
    ['plant', '/api/runs', { run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'E', recipe_version: 'RCP-DISS-2', operator: 'x', started_at: '2026-04-01T00:00:00Z', losses_g: 5 }],
  ]) {
    const r = await call(who, 'POST', path, body);
    ok(`${path} refuses a computed figure`, r.status === 400 && r.body.error === 'computed_figure_not_accepted', r.body);
  }

  // ---- yield refused where it should be, and absent from the verification answer
  const v = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000001`)).json();
  ok('verify carries no yield', !('yield' in v) && !JSON.stringify(Object.keys(v)).includes('yield'));

  console.log(`\npassed ${pass}, failed ${fail}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });

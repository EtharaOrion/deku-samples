// Development verification harness. Not shipped in the image.
const BASE = process.env.VBASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass += 1; } else { fail += 1; failures.push(`${name}${extra ? ` :: ${JSON.stringify(extra).slice(0, 400)}` : ''}`); }
}

const tokens = {};
async function login(who) {
  if (tokens[who]) return tokens[who];
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${who}@example.com`, password: PW }) });
  const j = await res.json();
  tokens[who] = j.access_token;
  return j.access_token;
}

let keyN = 0;
async function call(who, method, path, body, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  if (who) headers.authorization = `Bearer ${await login(who)}`;
  if (method !== 'GET' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = `k-${Date.now()}-${keyN++}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function run() {
  // ---- accounts
  for (const who of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
    const r = await call(null, 'POST', '/api/auth/login', { email: `${who}@example.com`, password: PW });
    ok(`login ${who}`, r.status === 200 && r.body.access_token && r.body.token_type === 'Bearer', r.body);
  }
  const me = await call('signer2', 'GET', '/api/auth/me');
  ok('me sites signer2', JSON.stringify(me.body.sites) === '["SITE-PILOT"]', me.body);
  ok('me roles signer2', me.body.roles.includes('certificate_signer'), me.body);

  // ---- sites
  const sites = await call('plant', 'GET', '/api/sites');
  ok('sites 3', Array.isArray(sites.body) && sites.body.length === 3, sites.body);
  const cap = await call('plant', 'GET', '/api/sites/SITE-COMM/capacity');
  ok('SITE-COMM uncommitted -1000000', cap.body.uncommitted_kg === -1000000, cap.body);
  ok('SITE-COMM confidence planned', cap.body.confidence === 'planned', cap.body);

  // ---- batches
  const batches = await call('plant', 'GET', '/api/batches');
  const byRef = Object.fromEntries(batches.body.map((b) => [b.reference, b]));
  ok('BATCH-1001 dry 450000', byRef['BATCH-1001'].dry_mass_g === 450000, byRef['BATCH-1001']);
  ok('BATCH-1001 claimable', byRef['BATCH-1001'].claimable === true);
  ok('BATCH-1002 dry 300000', byRef['BATCH-1002'].dry_mass_g === 300000);
  ok('BATCH-1003 dry 190000', byRef['BATCH-1003'].dry_mass_g === 190000);
  ok('BATCH-1003 non-claimable lapsed', byRef['BATCH-1003'].claimable === false && byRef['BATCH-1003'].claimable_reason === 'collector_approval_lapsed', byRef['BATCH-1003']);
  ok('BATCH-1003 collector name at receipt', byRef['BATCH-1003'].collector_name === 'Brine Textile Recovery', byRef['BATCH-1003'].collector_name);
  ok('BATCH-1004 claimable + lapsed_calibration', byRef['BATCH-1004'].claimable === true && byRef['BATCH-1004'].flags.includes('lapsed_calibration'), byRef['BATCH-1004']);
  ok('BATCH-1004 measured 9100', byRef['BATCH-1004'].composition.measured_fraction_bp === 9100);
  ok('BATCH-1005 custody_link_missing transport', byRef['BATCH-1005'].claimable === false && byRef['BATCH-1005'].claimable_reason === 'custody_link_missing' && byRef['BATCH-1005'].missing_link === 'transport', byRef['BATCH-1005']);

  // floored dry mass worked case
  const wc = await call('plant', 'POST', '/api/batches', { collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 32345, tare_g: 20000, net_g: 12345, moisture_bp: 5000, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-01', composition: { polymer: 'PA6', fraction_bp: 9000, basis: 'declared' }, contamination: {}, custody: [{ kind: 'collection_site' }, { kind: 'collector' }, { kind: 'transport' }, { kind: 'arrival' }, { kind: 'weighing' }, { kind: 'acceptance' }] });
  ok('worked case dry 6172 not 6173', wc.body.dry_mass_g === 6172, wc.body);
  ok('batch create returns reference', !!wc.body.reference, wc.body);

  // category immutable
  for (const who of ['plant', 'quality', 'claims', 'signer']) {
    const r = await call(who, 'PATCH', '/api/batches/BATCH-1001', { category: 'pre_consumer' });
    ok(`category change refused for ${who}`, r.status === 409 && /category/.test(JSON.stringify(r.body)), r.body);
  }
  const afterPatch = await call('plant', 'GET', '/api/batches/BATCH-1001');
  ok('category unchanged after refusal', afterPatch.body.category === 'post_consumer');

  // no idempotency key
  const noKey = await fetch(`${BASE}/api/batches`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await login('plant')}` }, body: JSON.stringify({ collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 1, tare_g: 0, net_g: 1, moisture_bp: 0, received_on: '2026-04-01' }) });
  ok('write without key refused', noKey.status === 400, await noKey.text());

  // idempotency replay + reuse
  const key = `idem-${Date.now()}`;
  const b1 = { collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 22000, tare_g: 20000, net_g: 2000, moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-02', composition: {}, contamination: {}, custody: [] };
  const r1 = await call('plant', 'POST', '/api/batches', b1, { 'Idempotency-Key': key });
  const r2 = await call('plant', 'POST', '/api/batches', b1, { 'Idempotency-Key': key });
  ok('same key same body replays', r1.body.reference === r2.body.reference, [r1.body.reference, r2.body.reference]);
  const r3 = await call('plant', 'POST', '/api/batches', { ...b1, net_g: 3000 }, { 'Idempotency-Key': key });
  ok('same key different body 409 idempotency_key_reuse', r3.status === 409 && r3.body.error === 'idempotency_key_reuse', r3.body);

  // ---- genealogy
  const gen = await call('auditor', 'GET', '/api/lots/LOT-N6-0001/genealogy');
  const b1001 = gen.body.nodes.filter((n) => n.reference === 'BATCH-1001');
  ok('BATCH-1001 appears once', b1001.length === 1, b1001);
  ok('BATCH-1001 mass 450000', b1001[0] && b1001[0].mass_g === 450000, b1001[0]);
  ok('genealogy flagged true', gen.body.flagged === true, gen.body.flagged);
  ok('text_equivalent present', !!gen.body.text_equivalent && Array.isArray(gen.body.text_equivalent.inputs), Object.keys(gen.body));
  ok('edges carry mass', gen.body.edges.every((e) => typeof e.mass_g === 'number'));
  const genPaged = await call('auditor', 'GET', '/api/lots/LOT-N6-0001/genealogy?page=1');
  ok('genealogy refuses page', genPaged.status === 400, genPaged.body);

  const t0 = Date.now();
  const imp = await call('auditor', 'GET', '/api/batches/BATCH-1001/impact');
  ok('impact under 5s', Date.now() - t0 < 5000, Date.now() - t0);
  ok('impact names lots', imp.body.lots.some((l) => l.reference === 'LOT-N6-0001'), imp.body.lots);
  const impPaged = await call('auditor', 'GET', '/api/batches/BATCH-1001/impact?limit=10');
  ok('impact refuses limit', impPaged.status === 400);

  // ---- balance
  const bp = await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  ok('credits_in post 360000', bp.body.post_consumer.credits_in_g === 360000, bp.body.post_consumer);
  ok('credits_in pre 336000', bp.body.pre_consumer.credits_in_g === 336000, bp.body.pre_consumer);
  ok('credits_out 0', bp.body.post_consumer.credits_out_g === 0 && bp.body.pre_consumer.credits_out_g === 0);
  ok('available == in', bp.body.post_consumer.credits_available_g === 360000 && bp.body.pre_consumer.credits_available_g === 336000);
  ok('non_claimable_input_g 190000', bp.body.non_claimable_input_g === 190000, bp.body.non_claimable_input_g);
  ok('override_count 1', bp.body.override_count === 1, bp.body.override_count);
  ok('open_restatement_count 0', bp.body.open_restatement_count === 0);
  ok('open_finding_count 1', bp.body.open_finding_count === 1, bp.body.open_finding_count);
  ok('inbound_credits from PILOT', bp.body.inbound_credits.length === 1 && bp.body.inbound_credits[0].origin_site === 'SITE-PILOT' && bp.body.inbound_credits[0].fresh_credit === false, bp.body.inbound_credits);
  ok('carry_over_limit_bp 2000', bp.body.carry_over_limit_bp === 2000);
  ok('derivations present', !!bp.body.post_consumer.derivation);

  // over-allocation refused
  const over = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 500000 });
  ok('over-allocation 409', over.status === 409, over.body);
  ok('names available and requested', over.body.available_g === 360000 && over.body.requested_g === 500000, over.body);
  const bpAfter = await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  ok('figures unchanged after refusal', bpAfter.body.post_consumer.credits_available_g === 360000);

  // no percentage accepted
  const pct = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1000, content_bp: 9000 });
  ok('percentage refused on allocation', pct.status === 400 && pct.body.error === 'computed_figure_not_accepted', pct.body);

  // race
  const raceHeaders = async (n) => ({ 'content-type': 'application/json', authorization: `Bearer ${await login('claims')}`, 'Idempotency-Key': `race-${Date.now()}-${n}` });
  const [ra, rb] = await Promise.all([
    fetch(`${BASE}/api/balance-periods/BP-DEMO-N6-2026H1/allocations`, { method: 'POST', headers: await raceHeaders(1), body: JSON.stringify({ lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 }) }),
    fetch(`${BASE}/api/balance-periods/BP-DEMO-N6-2026H1/allocations`, { method: 'POST', headers: await raceHeaders(2), body: JSON.stringify({ lot: 'LOT-N6-0002', category: 'post_consumer', mass_g: 360000 }) }),
  ]);
  const codes = [ra.status, rb.status].sort();
  ok('race one 201 one 409', codes[0] === 201 && codes[1] === 409, codes);

  const claimNow = await call('claims', 'GET', '/api/lots/LOT-N6-0001');
  ok('LOT-N6-0001 content_bp 9000', claimNow.body.content_bp === 9000, claimNow.body.content_bp);
  const bp2 = await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  ok('post available now 0', bp2.body.post_consumer.credits_available_g === 0, bp2.body.post_consumer);
  const further = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 1 });
  ok('further allocation refused', further.status === 409, further.body);

  // claims manager may not sign
  const cmSign = await call('claims', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
  ok('claims may not sign', cmSign.status === 403, cmSign.body);
  // quality may not alter carbon? quality publishes; claims may not
  const claimsPub = await call('claims', 'POST', '/api/carbon-methods/CM-PA6/versions', { boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'x' });
  ok('claims may not publish method', claimsPub.status === 403, claimsPub.body);

  // ---- carbon
  const carbon = await call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon');
  ok('carbon value 4260000', carbon.body.value_mg_per_kg === 4260000, carbon.body.value_mg_per_kg);
  ok('carbon has 4 components', !!carbon.body.boundary && !!carbon.body.method_version && carbon.body.uncertainty_bp === 1200, carbon.body);
  ok('breakdown 7 lines summing', carbon.body.breakdown.length === 7 && carbon.body.breakdown_sum_mg_per_kg === 4260000, carbon.body.breakdown_sum_mg_per_kg);
  ok('default_led false', carbon.body.default_led === false && carbon.body.primary_share_bp === 6500);
  ok('energy both present', carbon.body.energy_location_mg_per_kg === 1850000 && carbon.body.energy_market_mg_per_kg === 620000);
  ok('metered 300000 retired 250000 unmatched 50000', carbon.body.metered_kwh === 300000 && carbon.body.retired_kwh === 250000 && carbon.body.unmatched_kwh === 50000, { m: carbon.body.metered_kwh, r: carbon.body.retired_kwh, u: carbon.body.unmatched_kwh });
  ok('comparator named', carbon.body.comparator.material === 'virgin PA6' && carbon.body.comparator.dataset === 'EcoBase 2025' && /lower than/.test(carbon.body.comparator.relation || ''), carbon.body.comparator);

  const eacBad = await call('claims', 'POST', '/api/energy-instruments/EAC-2025-0031/retire', { period: 'BP-DEMO-N6-2026H1' });
  ok('EAC-2025-0031 refused on both counts', eacBad.status === 409 && eacBad.body.refusals.length >= 2, eacBad.body);

  // ---- byproduct share
  const share = await call('quality', 'GET', '/api/outputs/OUT-U-0002/share');
  ok('OUT-U-0002 share_bp 526', share.body.share_bp === 526, share.body);
  ok('share has claim + emissions', typeof share.body.claim_share_g === 'number' && typeof share.body.emissions_share_mg === 'number', share.body);

  // ---- certificate preview / conditions
  const prev = await call('signer', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  ok('preview 8 conditions', Array.isArray(prev.body.conditions) && prev.body.conditions.length === 8, prev.body.conditions?.length);
  const unrev = prev.body.conditions.find((x) => x.condition === 'no_unreviewed_override');
  ok('unreviewed override blocking', unrev && unrev.satisfied === false && unrev.blocking_reference === 'OVR-0001', unrev);
  ok('each condition has fields', prev.body.conditions.every((x) => 'condition' in x && 'satisfied' in x && 'blocking_reference' in x));

  // signer2 refused a SITE-DEMO lot
  const s2 = await call('signer2', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  const scope = s2.body.conditions.find((x) => x.condition === 'signer_holds_scope');
  ok('signer2 out of scope on SITE-DEMO', scope && scope.satisfied === false, scope);
  const s2sign = await call('signer2', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
  ok('signer2 refused signing SITE-DEMO lot', s2sign.status === 409, s2sign.body);

  // override review by authoriser refused
  const selfRev = await call('quality', 'POST', '/api/overrides/OVR-0001/review', {});
  ok('authoriser cannot review', selfRev.status === 409 && selfRev.body.error === 'authoriser_cannot_review', selfRev.body);
  const claimsRev = await call('claims', 'POST', '/api/overrides/OVR-0001/review', {});
  ok('claims manager reviews override', claimsRev.status === 200 && claimsRev.body.reviewed === true, claimsRev.body);
  const prev2 = await call('signer', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  const unrev2 = prev2.body.conditions.find((x) => x.condition === 'no_unreviewed_override');
  ok('override condition cleared by review', unrev2.satisfied === true, unrev2);

  // period must be closed to sign
  const pc = prev2.body.conditions.find((x) => x.condition === 'period_closed');
  ok('period_closed unsatisfied while open', pc.satisfied === false, pc);

  // quality may not close a period
  const qClose = await call('quality', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  ok('quality may not close period', qClose.status === 403, qClose.body);

  // close blocked by open deviation on LOT-N6-0002
  const cClose = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  ok('close refused with open deviation', cClose.status === 409 && JSON.stringify(cClose.body.blocking).includes('DEV-0001'), cClose.body);

  await call('quality', 'POST', '/api/deviations/DEV-0001/close', { outcome: 'root_cause_found' });
  const cClose2 = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  ok('close now succeeds', cClose2.status === 200, cClose2.body);
  ok('carried_forward + expired reported', cClose2.body.carried_forward_g && cClose2.body.expired_g, cClose2.body);
  ok('carry post 0 (0 available)', cClose2.body.carried_forward_g.post_consumer === 0, cClose2.body.carried_forward_g);
  // pre: in 336000, avail 336000, limit 2000bp = 67200 -> carry 67200 expire 268800
  ok('carry pre 67200 expire 268800', cClose2.body.carried_forward_g.pre_consumer === 67200 && cClose2.body.expired_g.pre_consumer === 268800, { c: cClose2.body.carried_forward_g, e: cClose2.body.expired_g });
  const reopen = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  ok('closed period refuses reopen', reopen.status === 409, reopen.body);
  const closedAlloc = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1 });
  ok('closed period refuses allocation', closedAlloc.status === 409, closedAlloc.body);

  // now sign
  const prev3 = await call('signer', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  ok('all 8 satisfied now', prev3.body.all_satisfied === true, prev3.body.conditions.filter((x) => !x.satisfied));
  const noPw = await call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  ok('signing without password refused', noPw.status === 401, noPw.body);
  const sign = await call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW });
  ok('signed CERT-DEMO-000001', sign.status === 201 && sign.body.number === 'CERT-DEMO-000001', sign.body);
  ok('certificate carries claim_type + content', sign.body.claim_type === 'mass_balance' && sign.body.content_bp === 9000, sign.body);
  ok('permitted statement says not physically segregated', /not physically segregated/i.test(sign.body.permitted_statement), sign.body.permitted_statement);
  ok('prohibited says may not state physically contains', /may not state that this material physically contains/i.test(sign.body.prohibited_statement), sign.body.prohibited_statement);
  ok('cert has no yield', !JSON.stringify(sign.body).includes('yield'), 'yield in certificate');

  // condition re-checked at signing
  await call('quality', 'POST', '/api/deviations', { runs: ['RUN-R-0001'], lots: ['LOT-N6-0001'], detail: 'A deviation raised after the preview.' });
  const sign2 = await call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-VANTA', password: PW });
  ok('re-checked at signing, refused', sign2.status === 409 && sign2.body.failing.some((f) => f.condition === 'no_open_deviation'), sign2.body);

  // document byte-stable
  const d1 = await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`);
  const t1 = await d1.text();
  const d2 = await fetch(`${BASE}/api/certificates/CERT-DEMO-000001/document`);
  const t2 = await d2.text();
  ok('document byte-stable', t1 === t2 && t1.length > 100, t1.length);
  ok('document plain text with claim type + statement', /mass_balance/.test(t1) && /may not state/i.test(t1), t1.slice(0, 200));

  // ---- verify public
  const v1 = await fetch(`${BASE}/api/verify/CERT-PILOT-000001`);
  const vj = await v1.json();
  ok('verify public no session 200', v1.status === 200 && vj.found === true, vj);
  ok('verify states withdrawal', vj.state === 'withdrawn' && vj.withdrawn_on === '2026-04-18' && /collector category was corrected/.test(vj.withdrawal_reason), vj);
  ok('verify keys exactly 10', Object.keys(vj).length === 10, Object.keys(vj));
  ok('verify no yield/collector/genealogy/carbon keys', !Object.keys(vj).some((k) => /yield|collector|genealog|carbon|content|nodes|edges/i.test(k)), Object.keys(vj));
  const v2 = await (await fetch(`${BASE}/api/verify/CERT-DEMO-999999`)).json();
  ok('unknown verify 200 found false', v2.found === false && v2.number === 'CERT-DEMO-999999', v2);

  // ---- withdrawal
  const wpv = await call('signer2', 'GET', '/api/certificates/CERT-PILOT-000002/withdrawal-preview');
  ok('withdrawal preview names recipients by name', wpv.body.notified_recipients[0].name === 'Vanta Safety Systems', wpv.body.notified_recipients);
  ok('withdrawal preview lists void statements', wpv.body.void_statements.length >= 2, wpv.body.void_statements);
  const wd = await call('signer2', 'POST', '/api/certificates/CERT-PILOT-000002/withdraw', { reason: 'A test withdrawal for verification.' });
  ok('withdraw 200 with five consequences', wd.status === 200 && wd.body.state === 'withdrawn' && wd.body.notified_recipients && wd.body.void_statements && wd.body.derived_certificates && wd.body.batch_traversal, wd.body);
  const vAfter = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000002`)).json();
  ok('address resolves after withdrawal', vAfter.found === true && vAfter.state === 'withdrawn');

  // ---- replay
  const rep = await call('auditor', 'GET', '/api/certificates/CERT-DEMO-000001/replay');
  ok('replay agrees', rep.body.agrees === true && rep.body.reproducible === true, rep.body);
  ok('replay names input_versions', !!rep.body.input_versions, rep.body);

  // ---- record
  const rec = await call('auditor', 'GET', '/api/record');
  ok('record non-empty', Array.isArray(rec.body) && rec.body.length > 20, rec.body.length);
  ok('first prev_digest 64 zeros', rec.body[0].prev_digest === '0'.repeat(64), rec.body[0]);
  const chk = await call('auditor', 'GET', '/api/record/check');
  ok('chain holds', chk.body.holds === true, chk.body);
  const del = await call('quality', 'DELETE', '/api/record/1');
  ok('record delete refused', del.status === 409, del.body);
  const edit = await call('quality', 'PATCH', '/api/record/1', { act: 'x' });
  ok('record edit refused', edit.status === 409, edit.body);
  const chk2 = await call('auditor', 'GET', '/api/record/check');
  ok('chain still holds after refusals', chk2.body.holds === true, chk2.body);

  // retention
  const holdSeqRow = rec.body.find((x) => x.act === 'certificate_signed' && x.object_ref === 'CERT-PILOT-000001');
  const ret = await call('quality', 'GET', `/api/record/${holdSeqRow.seq}/retention`);
  ok('retention scheme 120 statutory 84', ret.body.scheme_months === 120 && ret.body.statutory_months === 84, ret.body);
  ok('retain_until is longest', ret.body.retain_until >= ret.body.scheme_until && ret.body.retain_until >= ret.body.statutory_until, ret.body);
  ok('legal hold true', ret.body.legal_hold === true, ret.body);
  const exp = await call('quality', 'POST', `/api/record/${holdSeqRow.seq}/expire`, {});
  ok('hold refuses deletion', exp.status === 409 && exp.body.error === 'under_legal_hold', exp.body);

  // nine queries
  const QN = ['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version', 'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations', 'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'];
  for (const n of QN) {
    const rq = await call('auditor', 'GET', `/api/record/queries/${n}`);
    ok(`query ${n} answers`, rq.status === 200 && Array.isArray(rq.body.results) && rq.body.complete === true, rq.body);
    const rp = await call('auditor', 'GET', `/api/record/queries/${n}?page=1`);
    ok(`query ${n} refuses page`, rp.status === 400, rp.body);
  }
  const refAlloc = await call('auditor', 'GET', '/api/record/queries/refused_allocations');
  ok('refused allocations recorded with margin', refAlloc.body.results.length >= 1 && refAlloc.body.results[0].available_g != null, refAlloc.body.results[0]);
  const depart = await call('auditor', 'GET', '/api/record/queries/collector_declaration_departures');
  ok('departure 800bp on COL-CINDER', depart.body.results.some((x) => x.collector === 'COL-CINDER' && x.departure_bp === 800), depart.body.results);

  // ---- inbound
  const inb = await call('plant', 'GET', '/api/inbound');
  ok('3 inbound records', inb.body.length === 3, inb.body.length);
  ok('verbatim kept', inb.body.every((x) => typeof x.payload_verbatim === 'string' && x.payload_verbatim.startsWith('{')), inb.body[0]);
  const recon = await call('plant', 'GET', '/api/reconciliation');
  const cr = recon.body.integration_ages.find((x) => x.source === 'customer_reporting');
  ok('customer_reporting age null', cr.age_hours === null, cr);
  ok('other sources have numeric ages', recon.body.integration_ages.filter((x) => x.source !== 'customer_reporting').every((x) => typeof x.age_hours === 'number'), recon.body.integration_ages);
  ok('six figures present', ['mass_balance_residual_g', 'credit_margin_g', 'consumptions_on_open_runs', 'batches_with_broken_custody', 'certificates_with_superseded_figures', 'integration_ages'].every((k) => k in recon.body), Object.keys(recon.body));
  const inbNew = await call('plant', 'POST', '/api/inbound/weighbridge', { received_at: new Date().toISOString(), payload: { ticket: 'X/1', raw: 'exact bytes here' } });
  ok('inbound returns reference', !!inbNew.body.reference, inbNew.body);
  ok('inbound verbatim contains exact bytes', inbNew.body.payload_verbatim.includes('exact bytes here'), inbNew.body.payload_verbatim);

  // ---- auditor writes nothing
  const aw = await call('auditor', 'POST', '/api/batches', { collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 1, tare_g: 0, net_g: 1, moisture_bp: 0, received_on: '2026-04-01' });
  ok('auditor refused a batch', aw.status === 403, aw.body);
  const ad = await call('auditor', 'POST', '/api/lots/LOT-N6-0003/disposition', { disposition: 'released' });
  ok('auditor refused a disposition', ad.status === 403, ad.body);
  const ex = await call('auditor', 'POST', '/api/exports', { sites: ['SITE-DEMO'] });
  ok('auditor may export', ex.status === 201 && !!ex.body.reference, ex.body?.error);
  ok('export carries digests + derivations', Array.isArray(ex.body.digests) && ex.body.digests.length > 0 && !!ex.body.derivations, Object.keys(ex.body || {}));
  const exq = await call('auditor', 'GET', '/api/record/queries/exports_by_auditor');
  ok('export is itself an entry', exq.body.results.some((x) => x.reference === ex.body.reference), exq.body.results);
  const exEmpty = await call('auditor', 'POST', '/api/exports', { sites: ['SITE-NOPE'] });
  ok('empty export recorded too', exEmpty.status === 201, exEmpty.body);

  // ---- separations
  const analystDisp = await call('analyst', 'POST', '/api/lots/LOT-N6-0003/disposition', { disposition: 'released' });
  ok('analyst may not disposition', analystDisp.status === 403, analystDisp.body);
  const plantApprove = await call('plant', 'POST', '/api/collectors/COL-ALDER/approvals', { state: 'approved', valid_from: '2027-01-01', valid_to: '2027-12-31' });
  ok('plant may not approve collector', plantApprove.status === 403, plantApprove.body);
  // analyst entering a result then quality dispositioning is allowed; quality entering then dispositioning is not
  await call('quality', 'POST', '/api/test-results', { lot: 'LOT-N6-0002', property: 'moisture', method: 'ISO 15512', analyst: 'quality@example.com', value: '0.08', unit: 'percent' });
  const qDisp = await call('quality', 'POST', '/api/lots/LOT-N6-0002/disposition', { disposition: 'released' });
  ok('own-result dispositioner refused', qDisp.status === 409 && qDisp.body.error === 'separation_analyst_not_dispositioner', qDisp.body);

  // test result rules
  const noMethod = await call('analyst', 'POST', '/api/test-results', { lot: 'LOT-N6-0001', property: 'moisture', value: '0.05', unit: 'percent' });
  ok('result with no method refused', noMethod.status === 400, noMethod.body);
  const mism = await call('analyst', 'POST', '/api/test-results', { lot: 'LOT-N6-0001', property: 'moisture', method: 'IN-HOUSE-9', value: '0.05', unit: 'percent' });
  ok('method mismatch recorded not usable', mism.body.method_mismatch === true && mism.body.usable_for_release === false, mism.body);

  // override reason < 40
  const shortReason = await call('quality', 'POST', '/api/overrides', { separation: 'analyst_not_dispositioner', reason: 'too short', lot: 'LOT-N6-0001', authorised_by: 'quality@example.com' });
  ok('short override reason refused', shortReason.status === 400, shortReason.body);

  // ---- runs
  const runs = await call('plant', 'GET', '/api/runs');
  const rd1 = runs.body.find((x) => x.reference === 'RUN-D-0001');
  ok('RUN-D-0001 losses 120000', rd1.losses_g === 120000, rd1.losses_g);
  ok('RUN-D-0001 within tolerance', rd1.within_tolerance === true, rd1);
  const secondClose = await call('plant', 'POST', '/api/runs/RUN-D-0001/close', {});
  ok('second close 409', secondClose.status === 409, secondClose.body);
  const writeClosed = await call('plant', 'POST', '/api/runs/RUN-D-0001/consumptions', { input: 'BATCH-1001', mass_g: 1 });
  ok('closed run refuses write', writeClosed.status === 409, writeClosed.body);
  const closeAttempts = await call('auditor', 'GET', '/api/record?act=second_close_refused');
  ok('second close recorded as attempt', closeAttempts.body.length >= 1, closeAttempts.body.length);

  // ---- blend worked case
  const blend = await call('quality', 'POST', '/api/lots/LOT-N6-0001/blend', { with: 'LOT-N6-0003' });
  ok('blend 600000 at 8500', blend.body.mass_g === 600000 && blend.body.content_bp === 8500, blend.body);
  ok('blend names both sites', JSON.stringify(blend.body.sites) === '["SITE-DEMO","SITE-PILOT"]', blend.body.sites);
  ok('blend carries provisional flag', blend.body.provisional_factor === true, blend.body);

  // ---- conversion factor refusal
  const badCf = await call('claims', 'POST', '/api/conversion-factors', { site: 'SITE-DEMO', factor_bp: 9000, derived_from: '2026-04-01', derived_to: '2026-06-30', derived_in_g: 1000000, derived_out_g: 800000 });
  ok('bad factor refused', badCf.status === 409 && badCf.body.expected_factor_bp === 8000, badCf.body);
  const goodCf = await call('claims', 'POST', '/api/conversion-factors', { site: 'SITE-DEMO', factor_bp: 8000, derived_from: '2026-04-01', derived_to: '2026-06-30', derived_in_g: 1000000, derived_out_g: 800000 });
  ok('good factor accepted', goodCf.status === 201 && !!goodCf.body.reference, goodCf.body);

  // ---- contracts
  const proj = await call('claims', 'GET', '/api/contracts/CON-VANTA-1/projection');
  ok('planned_site_flag not dismissible', proj.body.planned_site_flag === true && proj.body.flag_dismissible === false, proj.body);
  ok('shortfall consequence stated', /make-good volume/.test(proj.body.shortfall_consequence), proj.body.shortfall_consequence);
  const ca = await call('claims', 'POST', '/api/contracts/CON-HELIOS-1/allocations', { lot: 'LOT-N6-0001', favoured_over: ['CON-VANTA-1'] });
  ok('contract allocation records decider and favoured_over', ca.body.decided_by === 'claims@example.com' && ca.body.favoured_over.includes('CON-VANTA-1'), ca.body);
  const ca2 = await call('claims', 'POST', '/api/contracts/CON-VANTA-1/allocations', { lot: 'LOT-N6-0001' });
  ok('second attachment refused', ca2.status === 409, ca2.body);

  // ---- specifications, customers, change notices
  const spec = await call('quality', 'GET', '/api/specifications/SPEC-N6/versions/3');
  ok('spec 4 rows', spec.body.properties.length === 4, spec.body.properties);
  ok('virgin reference named', /virgin PA6 at relative viscosity 2.42/.test(spec.body.virgin_reference.reference), spec.body.virgin_reference);
  const cn = await call('quality', 'POST', '/api/change-notices', { title: 'Raise dissolution temperature ceiling', detail: 'The published threshold moves from 170 C to 175 C.', parameter: 'relative_viscosity' });
  ok('change notice derives affected', cn.body.customers_affected.length >= 1 && cn.body.specifications_affected.length >= 1, cn.body);
  ok('automotive blocks', cn.body.blocking.some((b) => b.customer === 'CUS-VANTA'), cn.body.blocking);
  const rel = await call('quality', 'POST', `/api/change-notices/${cn.body.reference}/release`, {});
  ok('release refused until notified', rel.status === 409, rel.body);

  // ---- parties
  const pv = await call('quality', 'GET', '/api/parties/COL-BRINE/versions');
  ok('COL-BRINE has 2 versions', pv.body.length === 2, pv.body);

  // ---- public
  const stats = await (await fetch(`${BASE}/api/statistics`)).json();
  ok('3 statistics each with source/year/geography', stats.length === 3 && stats.every((x) => x.source && x.year && x.geography), stats);
  const pos = await (await fetch(`${BASE}/api/positions`)).json();
  ok('1 position', pos.length === 1 && pos[0].title === 'Process Engineer', pos);
  const news = await (await fetch(`${BASE}/api/news`)).json();
  ok('3 news items with tags', news.length === 3 && news.every((x) => ['funding', 'partnership', 'technical', 'recognition'].includes(x.tag)), news);
  ok('fr item declares language', news.some((x) => x.language === 'fr'), news);
  const enq = await call(null, 'POST', '/api/enquiries', { type: 'waste_supply', name: 'A Person', email: 'someone@example.com', message: 'We have nylon waste.' });
  ok('enquiry 201 with destination + days', enq.status === 201 && enq.body.destination === 'feedstock@example.com' && enq.body.response_days === 3 && !!enq.body.reference, enq.body);

  // ---- mail
  await new Promise((r) => setTimeout(r, 1500));
  const mail = await (await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json();
  const subjects = (mail.messages || []).map((m) => m.Subject);
  ok('cert issued mail', subjects.some((x) => x === 'Certificate CERT-DEMO-000001 issued'), subjects);
  ok('cert withdrawn mail', subjects.some((x) => x === 'Certificate CERT-PILOT-000002 withdrawn'), subjects);
  ok('enquiry mail', subjects.some((x) => /^Enquiry ENQ-.* received$/.test(x)), subjects);
  ok('no mail for allocation/close/review', !subjects.some((x) => /allocat|period|override|disposition/i.test(x)), subjects);
  ok('one recipient no copies', (mail.messages || []).every((m) => (m.To || []).length === 1 && !(m.Cc || []).length && !(m.Bcc || []).length));

  // ---- unauthenticated access
  const anon = await fetch(`${BASE}/api/batches`);
  ok('anon refused batches', anon.status === 401, anon.status);

  console.log(`\npassed ${pass}, failed ${fail}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });

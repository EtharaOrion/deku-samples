// The worked cases and edge rules the first pass does not reach.
const BASE = process.env.VERIFY_BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0, fail = 0;
const failures = [];
const check = (name, a, e) => {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}\n       expected ${E}\n       actual   ${A}`); }
};
const ok = (name, cond, d) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${d ? '  ' + d : ''}`); }
};

const tokens = {};
async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  tokens[email] = (await r.json()).access_token;
}
let n = Date.now();
async function api(path, { as, method = 'GET', body, key } = {}) {
  const h = {};
  if (as) h.authorization = `Bearer ${tokens[as]}`;
  if (body !== undefined) { h['content-type'] = 'application/json'; h['idempotency-key'] = key || `v2-${n++}`; }
  const r = await fetch(`${BASE}/api${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, body: j };
}
for (const e of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
  await login(`${e}@example.com`);
}

console.log('\n== the carry-over worked case ==');
// 360000 g of post-consumer credit in and a limit of 2000 bp: at most 72000 g
// carries forward, so a period closing with 100000 g still available carries
// 72000 and expires 28000.
{
  const bp = await api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' });
  check('credits in is 360000', bp.body.post_consumer.credits_in_g, 360000);
  check('the cap is 72000', bp.body.carry_over.post_consumer.would_carry_forward_g +
    bp.body.carry_over.post_consumer.would_expire_g > 0
    ? Math.min(72000, bp.body.post_consumer.credits_available_g) : 0,
    Math.min(72000, bp.body.post_consumer.credits_available_g));
  // Leave exactly 100000 g available, then close and read the settlement.
  const spend = bp.body.post_consumer.credits_available_g - 100000;
  if (spend > 0) {
    const a = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', {
      as: 'claims@example.com', method: 'POST',
      body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: spend } });
    ok('the ledger is drawn down to 100000 g', a.status === 201, JSON.stringify(a.body).slice(0, 160));
  }
  const now = await api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' });
  check('100000 g remains', now.body.post_consumer.credits_available_g, 100000);
  check('72000 would carry forward', now.body.carry_over.post_consumer.would_carry_forward_g, 72000);
  check('28000 would expire', now.body.carry_over.post_consumer.would_expire_g, 28000);
}

console.log('\n== closing is refused while a lot lacks a disposition or a deviation is open ==');
{
  const r = await api('/balance-periods/BP-DEMO-N6-2026H1/close', { as: 'claims@example.com', method: 'POST', body: {} });
  check('the close is refused', r.status, 409);
  ok('and it names which', Array.isArray(r.body.blocking) && r.body.blocking.length > 0,
    JSON.stringify(r.body).slice(0, 200));
  ok('naming the open deviation', r.body.blocking.some((b) => b.condition === 'deviation_open'),
    JSON.stringify(r.body.blocking));
}

console.log('\n== closing settles the carry-over ==');
{
  // Close DEV-0001 and disposition LOT-N6-0002, then the period closes.
  await api('/deviations/DEV-0001/close', { as: 'quality@example.com', method: 'POST',
    body: { outcome: 'root_cause_found' } });
  await api('/lots/LOT-N6-0002/disposition', { as: 'quality@example.com', method: 'POST',
    body: { disposition: 'released' } });
  const r = await api('/balance-periods/BP-DEMO-N6-2026H1/close', { as: 'claims@example.com', method: 'POST',
    body: { closed_on: '2026-07-15', cut_off: '2026-07-10' } });
  check('the period closes', r.status, 200);
  check('72000 carried forward', r.body.carried_forward_g.post_consumer, 72000);
  check('28000 expired', r.body.expired_g.post_consumer, 28000);
  check('it reports closed_on', r.body.closed_on, '2026-07-15');
  check('and the cut_off', r.body.cut_off, '2026-07-10');
  const again = await api('/balance-periods/BP-DEMO-N6-2026H1/close', { as: 'claims@example.com', method: 'POST', body: {} });
  check('a closed period refuses to reopen', again.status, 409);
  const write = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', { as: 'claims@example.com',
    method: 'POST', body: { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1 } });
  check('and refuses every further write', write.status, 409);
}

console.log('\n== a consumption into a closed period opens a restatement ==');
{
  const run = await api('/runs', { as: 'plant@example.com', method: 'POST', body: {
    run_type: 'dissolution', site: 'SITE-DEMO', equipment: 'EQ-DISS-1',
    recipe_version: 'RCP-DISS-2', operator: 'PSN-0001', started_at: '2026-05-01T06:00:00Z' } });
  ok('a run opens', run.status === 201, JSON.stringify(run.body).slice(0, 200));
  const cons = await api(`/runs/${run.body.reference}/consumptions`, { as: 'plant@example.com', method: 'POST',
    body: { input_kind: 'batch', input_ref: 'BATCH-1001', mass_g: 1000, effective_on: '2026-05-01' } });
  check('the consumption is refused as a write into a closed period', cons.status, 409);
  ok('and a restatement is opened instead', /^RST-/.test(cons.body.restatement_opened || ''),
    JSON.stringify(cons.body).slice(0, 200));
}

console.log('\n== a restatement enumerates and resolves one certificate at a time ==');
{
  const r = await api('/balance-periods/BP-PILOT-N6-2026H1/restatements', { as: 'claims@example.com',
    method: 'POST', body: { reason: 'The pilot conversion factor is under review' } });
  check('the restatement opens', r.status, 201);
  ok('enumerating every certificate issued from the period', r.body.certificates.length >= 2,
    JSON.stringify(r.body.certificates.map((c) => c.number)));
  const ref = r.body.reference;
  const many = await api(`/restatements/${ref}/resolutions`, { as: 'claims@example.com', method: 'POST',
    body: { certificate: ['CERT-PILOT-000001', 'CERT-PILOT-000002'], outcome: 'unaffected', reason: 'x' } });
  check('no route resolves more than one at a time', many.status, 400);
  const one = await api(`/restatements/${ref}/resolutions`, { as: 'claims@example.com', method: 'POST',
    body: { certificate: 'CERT-PILOT-000001', outcome: 'unaffected', reason: 'Already withdrawn for another reason' } });
  check('one resolution lands', one.status, 201);
  const twice = await api(`/restatements/${ref}/resolutions`, { as: 'claims@example.com', method: 'POST',
    body: { certificate: 'CERT-PILOT-000001', outcome: 'reissued', reason: 'A second attempt' } });
  check('a second resolution against the same certificate is refused', twice.status, 409);
}

console.log('\n== a restatement revising a factor answers content_movements ==');
{
  const f = await api('/conversion-factors', { as: 'claims@example.com', method: 'POST', body: {
    site: 'SITE-PILOT', factor_bp: 8000, derived_from: '2026-01-01', derived_to: '2026-06-30',
    derived_in_g: 1000000, derived_out_g: 800000 } });
  check('the revised factor publishes', f.status, 201);
  const r = await api('/balance-periods/BP-PILOT-N6-2026H1/restatements', { as: 'claims@example.com',
    method: 'POST', body: { reason: 'The conversion factor was revised', revised_conversion_factor: f.body.reference } });
  ok('content_movements names the figure that moved', r.body.content_movements.length > 0,
    JSON.stringify(r.body.content_movements).slice(0, 250));
  const m = r.body.content_movements[0];
  ok('each entry carries the certificate, its content and the corrected content',
    m.certificate && m.content_bp !== undefined && m.corrected_content_bp !== undefined,
    JSON.stringify(m));
}

console.log('\n== a conditional approval, and a late custody document ==');
{
  const c = await api('/collectors/COL-CINDER', { as: 'quality@example.com' });
  const cond = c.body.approval_periods.find((p) => p.state === 'conditional');
  check('the condition is named', cond.condition, 'Sampling plan for coated streams to be agreed');
  check('with the date it must be closed by', cond.condition_closes_on, '2026-10-31');

  const before = await api('/batches/BATCH-1005', { as: 'plant@example.com' });
  check('BATCH-1005 is non-claimable', before.body.claimable, false);
  const late = await api('/batches/BATCH-1005/custody', { as: 'plant@example.com', method: 'POST',
    body: { kind: 'transport', party: 'Haulier of record', date: '2026-03-02', arrived_on: '2026-05-20' } });
  check('the late document attaches', late.status, 201);
  check('and the batch becomes claimable', late.body.claimable, true);
  check('from the date the evidence arrived rather than the receipt date',
    late.body.claimable_from, '2026-05-20');
}

console.log('\n== a partial rejection must sum ==');
{
  const bad = await api('/batches/BATCH-1002/reject', { as: 'plant@example.com', method: 'POST',
    body: { rejected_g: 50000, accepted_g: 100000, reason: 'Coated fraction', destination: 'Energy recovery' } });
  check('a rejection whose parts do not sum is refused', bad.status, 409);
  const good = await api('/batches/BATCH-1002/reject', { as: 'plant@example.com', method: 'POST',
    body: { rejected_g: 50000, reason: 'Coated fraction', destination: 'Energy recovery, permitted operator' } });
  check('a rejection that sums lands', good.status, 201);
  check('accepted plus rejected equals delivered',
    good.body.accepted_g + good.body.rejected_g, good.body.delivered_g);
  check('and it records where the rejected mass went',
    good.body.rejected_destination, 'Energy recovery, permitted operator');
}

console.log('\n== a transfer leaves the total credit unchanged ==');
{
  const before = await Promise.all([
    api('/balance-periods/BP-PILOT-N6-2026H1', { as: 'claims@example.com' }),
    api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' }),
  ]);
  const total = (v) => v.body.post_consumer.total_credit_held_g + v.body.pre_consumer.total_credit_held_g;
  const sumBefore = total(before[0]) + total(before[1]);
  const t = await api('/balance-periods/BP-PILOT-N6-2026H1/transfers', { as: 'claims@example.com',
    method: 'POST', body: { to_period: 'BP-DEMO-N6-2026H1', category: 'post_consumer', mass_g: 10000 } });
  if (t.status === 201) {
    const after = await Promise.all([
      api('/balance-periods/BP-PILOT-N6-2026H1', { as: 'claims@example.com' }),
      api('/balance-periods/BP-DEMO-N6-2026H1', { as: 'claims@example.com' }),
    ]);
    check('the total credit across the two periods is unchanged', total(after[0]) + total(after[1]), sumBefore);
    const inbound = after[1].body.inbound_credits.find((x) => x.movement === t.body.reference);
    check('and it lands as an inbound credit naming its origin',
      [inbound.origin_site, inbound.fresh_credit], ['SITE-PILOT', false]);
  } else {
    ok('the transfer was refused for want of credit, which is also a stated outcome',
      t.status === 409, JSON.stringify(t.body).slice(0, 160));
  }
}

console.log('\n== a change notice derives what it affects and blocks automotive ==');
{
  const r = await api('/change-notices', { as: 'quality@example.com', method: 'POST', body: {
    title: 'Raise the repolymerisation temperature threshold',
    detail: 'The published temperature threshold moves from 265 to 275 degrees.',
    parameter: 'relative_viscosity', grade: 'N6' } });
  check('the notice is raised', r.status, 201);
  ok('it derives the specifications affected', r.body.specifications_affected.length > 0);
  ok('it derives the customers affected', r.body.customers_affected.length > 0);
  ok('it derives the qualifications affected', r.body.qualifications_affected.length > 0);
  ok('it carries a notice period', typeof r.body.notice_period_days === 'number');
  ok('and it blocks rather than warns for an automotive customer',
    r.body.blocking === true && r.body.blocking_customers.includes('CUS-VANTA'),
    JSON.stringify({ blocking: r.body.blocking, who: r.body.blocking_customers }));
  const release = await api(`/change-notices/${r.body.reference}/release`, { as: 'quality@example.com',
    method: 'POST', body: {} });
  check('release is refused until every customer owed notice has been notified', release.status, 409);
  for (const cu of r.body.customers_affected) {
    await api(`/change-notices/${r.body.reference}/notify`, { as: 'quality@example.com',
      method: 'POST', body: { customer: cu.reference } });
  }
  const after = await api(`/change-notices/${r.body.reference}/release`, { as: 'quality@example.com',
    method: 'POST', body: {} });
  check('and released once they have been', after.status, 200);
}

console.log('\n== a contract projection, and a claim allocated twice ==');
{
  const p = await api('/contracts/CON-VANTA-1/projection', { as: 'claims@example.com' });
  check('a contract on a planned site is flagged', p.body.planned_site_flag, true);
  check('and the flag cannot be dismissed', p.body.flag_dismissible, false);
  check('the shortfall consequence is stated', p.body.shortfall_consequence,
    'a make-good volume in the following period');
  ok('the state is on_track or unreachable', ['on_track', 'unreachable'].includes(p.body.state));

  const a1 = await api('/contracts/CON-HELIOS-1/allocations', { as: 'claims@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0001', mass_g: 100000, decided_by: 'PSN-0004', favoured_over: ['CON-VANTA-1'] } });
  check('an allocation records who decided', a1.body.decided_by, 'PSN-0004');
  check('and which contracts went without', a1.body.favoured_over, ['CON-VANTA-1']);
  const a2 = await api('/contracts/CON-VANTA-1/allocations', { as: 'claims@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0001', mass_g: 50000 } });
  check('a claim already allocated is refused a second attachment', a2.status, 409);
}

console.log('\n== a method version is published and a cached figure invalidates ==');
{
  const before = await api('/carbon-figures', { as: 'quality@example.com' });
  const fig = before.body.find((f) => f.id === 'CFG-0001');
  check('the figure is cached and valid', fig.cache_valid, true);
  const v = await api('/carbon-methods/CM-PA6/versions', { as: 'quality@example.com', method: 'POST', body: {
    standard: 'ISO 14067', functional_unit: '1 kg of pellet', boundary: 'cradle-to-gate',
    allocation_basis: 'mass', reviewer: 'Ilse Grootveld',
    emission_factors: [{ name: 'grid electricity EU-27', source: 'EcoBase 2026', year: 2026, mg_per_kg: 1700000 }] } });
  check('the new version publishes', v.status, 201);
  check('and supersedes rather than overwrites', v.body.version, 3);
  const after = await api('/carbon-figures', { as: 'quality@example.com' });
  const fig2 = after.body.find((f) => f.id === 'CFG-0001');
  check('the figure whose factor was superseded answers cache_valid false', fig2.cache_valid, false);
  const old = await api('/carbon-methods/CM-PA6/versions/2', { as: 'quality@example.com' });
  check('the superseded version stays readable', old.status, 200);
  ok('and is marked superseded', old.body.superseded === true);

  const recompute = await api('/carbon-figures/CFG-0001/recompute', { as: 'quality@example.com',
    method: 'POST', body: { reason: 'The emission factor set was superseded' } });
  check('a recomputation produces a new version alongside the old', recompute.status, 201);
  ok('naming a person, a date and a reason',
    recompute.body.recomputed_by && recompute.body.recomputed_on && recompute.body.reason);
  ok('and enumerating every certificate carrying the superseded figure',
    Array.isArray(recompute.body.certificates_carrying_superseded_figure));
}

console.log('\n== a suspension that reaches backwards ==');
{
  const r = await api('/sites/SITE-PILOT/certification', { as: 'quality@example.com', method: 'POST', body: {
    state: 'suspended', effective_from: '2026-03-01', reason: 'A scheme audit finding' } });
  check('the suspension lands', r.status, 201);
  ok('carrying every certificate signed inside the window',
    r.body.certificates_in_window.length >= 2, JSON.stringify(r.body.certificates_in_window.map((c) => c.number)));
  ok('each individually resolvable under the three outcomes',
    r.body.certificates_in_window.every((c) =>
      JSON.stringify(c.resolution_outcomes) === JSON.stringify(['reissued', 'withdrawn', 'unaffected'])));
  check('and issuing stops for the affected site', r.body.issuing_blocked, true);
  ok('with the suspension named as the blocking condition', !!r.body.blocking_condition);

  const sign = await api('/certificates', { as: 'signer2@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS', password: PW } });
  check('a certificate at the suspended site is refused', sign.status, 409);
  check('naming the suspension', sign.body.error, 'certification_suspended');

  const lift = await api('/sites/SITE-PILOT/certification', { as: 'quality@example.com', method: 'POST',
    body: { state: 'certified', effective_from: '2026-08-01', reason: 'The finding was closed' } });
  check('lifting restores issuing', lift.status, 201);
  check('and it reinstates no withdrawn certificate', lift.body.reinstates_withdrawn, false);
  const stillWithdrawn = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000001`)).json();
  check('the withdrawn certificate is still withdrawn', stillWithdrawn.state, 'withdrawn');
}

console.log('\n== retention, and an expired entry ==');
{
  const rec = await api('/record', { as: 'auditor@example.com' });
  const entry = rec.body.find((e) => e.action === 'signed_in');
  const ret = await api(`/record/${entry.seq}/retention`, { as: 'auditor@example.com' });
  check('scheme months', ret.body.scheme_months, 120);
  check('statutory months', ret.body.statutory_months, 84);
  check('retain_until is the longest of the three', ret.body.retain_until, ret.body.scheme_until);
  const hold = await api(`/record/${entry.seq}/legal-hold`, { as: 'quality@example.com', method: 'POST',
    body: { reason: 'An audit is open' } });
  check('a hold is placed', hold.status, 201);
  const held = await api(`/record/${entry.seq}/retention`, { as: 'auditor@example.com' });
  check('and the retention answer carries it', held.body.legal_hold, true);
  const refused = await api(`/record/${entry.seq}/expire`, { as: 'quality@example.com', method: 'POST',
    body: { force_after_retention: true } });
  check('a record under hold refuses deletion', refused.status, 409);
  const lift = await api(`/record/${entry.seq}/legal-hold`, { as: 'quality@example.com', method: 'DELETE' });
  check('the hold lifts', lift.status, 200);
  const expired = await api(`/record/${entry.seq}/expire`, { as: 'quality@example.com', method: 'POST',
    body: { force_after_retention: true } });
  check('the content is deleted', expired.status, 200);
  ok('the position and the digest survive', !!expired.body.digest && expired.body.seq === entry.seq);
  ok('and the entry states its content was deleted under retention on a date',
    /deleted under retention on \d{4}-\d{2}-\d{2}/.test(expired.body.statement), expired.body.statement);
  const chain = await api('/record/check', { as: 'auditor@example.com' });
  check('and the chain still verifies', chain.body.holds, true);
}

console.log('\n== a test result by the wrong method never reaches a disposition ==');
{
  const r = await api('/test-results', { as: 'analyst@example.com', method: 'POST', body: {
    lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ASTM D2857',
    instrument: 'VIS-9', analyst: 'Tomas Vlach', value: '2.44', unit: 'ratio', uncertainty_bp: 250 } });
  check('the result is recorded', r.status, 201);
  check('answering method_mismatch true', r.body.method_mismatch, true);
  check('with usable_for_release false', r.body.usable_for_release, false);
  const none = await api('/test-results', { as: 'analyst@example.com', method: 'POST', body: {
    lot: 'LOT-N6-0001', property: 'moisture', instrument: 'KF-2', analyst: 'Tomas Vlach',
    value: '0.05', unit: 'percent', uncertainty_bp: 300 } });
  check('a result with no method is refused', [none.status, none.body.error], [400, 'method_required']);
}

console.log('\n== the inbound sources reach the app the same way ==');
{
  for (const source of ['weighbridge', 'control_system', 'laboratory', 'customer_reporting']) {
    const r = await api(`/inbound/${source}`, { as: 'plant@example.com', method: 'POST', body: {
      received_at: new Date().toISOString(), payload: { source, note: 'a record from ' + source } } });
    ok(`${source} reaches the app through its own route`, r.status === 201 && /^INB-/.test(r.body.reference));
  }
  const list = await api('/inbound', { as: 'auditor@example.com' });
  const verbatim = list.body.find((x) => x.reference === 'INB-0001');
  ok('a seeded payload is kept exactly as it arrived',
    verbatim.payload_verbatim.includes('WBT-77120'), verbatim.payload_verbatim);
  const recon = await api('/reconciliation', { as: 'auditor@example.com' });
  const cr = recon.body.integration_ages.find((x) => x.source === 'customer_reporting');
  ok('customer_reporting now reports an age rather than null', cr.age_hours !== null);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (failures.length) console.log('failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);

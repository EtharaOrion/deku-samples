// The four stated races, and the remaining contract details.
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
  if (body !== undefined) { h['content-type'] = 'application/json'; h['idempotency-key'] = key || `v3-${n++}`; }
  const r = await fetch(`${BASE}/api${path}`, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, body: j };
}
for (const e of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) {
  await login(`${e}@example.com`);
}

console.log('\n== preparing two signable lots at one site ==');
{
  // Clear the one blocking condition, then attach claim to two SITE-DEMO lots.
  await api('/overrides/OVR-0001/review', { as: 'claims@example.com', method: 'POST', body: {} });
  await api('/deviations/DEV-0001/close', { as: 'quality@example.com', method: 'POST',
    body: { outcome: 'root_cause_found' } });
  const d = await api('/lots/LOT-N6-0002/disposition', { as: 'quality@example.com', method: 'POST',
    body: { disposition: 'released' } });
  ok('LOT-N6-0002 is released', d.status === 200, JSON.stringify(d.body).slice(0, 160));
  const a1 = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', { as: 'claims@example.com',
    method: 'POST', body: { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 } });
  const a2 = await api('/balance-periods/BP-DEMO-N6-2026H1/allocations', { as: 'claims@example.com',
    method: 'POST', body: { lot: 'LOT-N6-0002', category: 'pre_consumer', mass_g: 300000 } });
  ok('both lots carry claim', a1.status === 201 && a2.status === 201);
  const p1 = await api('/certificates/preview', { as: 'signer@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' } });
  const p2 = await api('/certificates/preview', { as: 'signer@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0002', recipient: 'CUS-VANTA' } });
  ok('all eight conditions hold on both', p1.body.conditions.every((c) => c.satisfied) &&
    p2.body.conditions.every((c) => c.satisfied),
    JSON.stringify([p1.body.blocking, p2.body.blocking]));
}

console.log('\n== two signatures landing at the same moment at one site ==');
{
  const before = await api('/certificates', { as: 'signer@example.com' });
  const demoBefore = before.body.filter((c) => c.site === 'SITE-DEMO').map((c) => c.number);

  const [r1, r2] = await Promise.all([
    api('/certificates', { as: 'signer@example.com', method: 'POST',
      body: { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }, key: `sign-a-${Date.now()}` }),
    api('/certificates', { as: 'signer@example.com', method: 'POST',
      body: { lot: 'LOT-N6-0002', recipient: 'CUS-VANTA', password: PW }, key: `sign-b-${Date.now()}` }),
  ]);
  // Neither signature is lost.
  check('both signatures land', [r1.status, r2.status].sort(), [201, 201]);
  const numbers = [r1.body.number, r2.body.number].sort();
  ok('neither is lost', numbers.every(Boolean), JSON.stringify(numbers));
  // No number is issued twice.
  check('no number is issued twice', new Set(numbers).size, 2);
  // Two consecutive numbers.
  const seqs = numbers.map((x) => Number(x.split('-').pop()));
  check('they are two consecutive numbers', seqs[1] - seqs[0], 1);
  // The sequence has no gap afterwards.
  const after = await api('/certificates', { as: 'signer@example.com' });
  const demoAfter = after.body.filter((c) => c.site === 'SITE-DEMO')
    .map((c) => Number(c.number.split('-').pop())).sort((a, b) => a - b);
  const gapless = demoAfter.every((v, i) => i === 0 ? v === 1 : v === demoAfter[i - 1] + 1);
  ok('the SITE-DEMO sequence has no gap afterwards', gapless, JSON.stringify(demoAfter));
  check('and it began at 1', demoAfter[0], 1);
  console.log(`  the sequence reads ${demoAfter.join(', ')}`);
}

console.log('\n== a lot that has since gained an open deviation is refused at signing ==');
{
  // All eight held at the preview; a deviation is then raised against the lot.
  const preview = await api('/certificates/preview', { as: 'signer@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS' } });
  const heldAtPreview = preview.body.conditions.every((c) => c.satisfied);
  ok('all eight held at the preview', heldAtPreview, JSON.stringify(preview.body.blocking));
  await api('/deviations', { as: 'quality@example.com', method: 'POST', body: {
    detail: 'A residue was found on the pilot line after the preview was taken.',
    lots: ['LOT-N6-0003'], runs: [] } });
  const sign = await api('/certificates', { as: 'signer2@example.com', method: 'POST',
    body: { lot: 'LOT-N6-0003', recipient: 'CUS-HELIOS', password: PW } });
  check('signing is refused against the records as they stand now', sign.status, 409);
  const changed = (sign.body.blocking || []).find((b) => b.condition === 'no_open_deviation');
  ok('and the refusal names the condition that changed', !!changed, JSON.stringify(sign.body.blocking));
}

console.log('\n== a computation in flight completes under the version it started with ==');
{
  const fig = await api('/lots/LOT-N6-0001/carbon', { as: 'quality@example.com' });
  const startedUnder = fig.body.method_version;
  await api('/carbon-methods/CM-PA6/versions', { as: 'quality@example.com', method: 'POST', body: {
    standard: 'ISO 14067', functional_unit: '1 kg of pellet', boundary: 'cradle-to-gate',
    allocation_basis: 'mass', reviewer: 'Ilse Grootveld' } });
  const after = await api('/lots/LOT-N6-0001/carbon', { as: 'quality@example.com' });
  check('the figure still records the version it was computed against',
    after.body.method_version, startedUnder);
  check('and it is no longer cache-valid rather than silently recomputed', after.body.cache_valid, false);
  const certs = await api('/certificates', { as: 'signer@example.com' });
  const c = certs.body.find((x) => x.site === 'SITE-DEMO');
  check('a certificate keeps the version it was issued under',
    c.carbon.method_version, startedUnder);
}

console.log('\n== a scoped read names the moment it saw ==');
{
  for (const [path, as] of [
    ['/balance-periods/BP-DEMO-N6-2026H1', 'claims@example.com'],
    ['/lots/LOT-N6-0001/genealogy', 'auditor@example.com'],
    ['/reconciliation', 'auditor@example.com'],
    ['/lots/LOT-N6-0001', 'quality@example.com'],
    ['/lots/LOT-N6-0001/carbon', 'quality@example.com'],
  ]) {
    const r = await api(path, { as });
    ok(`${path} answers read_at`, !!r.body.read_at, JSON.stringify(Object.keys(r.body)).slice(0, 120));
  }
}

console.log('\n== a carbon value never appears without its four components ==');
{
  const routes = [
    ['/lots/LOT-N6-0001/carbon', 'quality@example.com'],
    ['/carbon-figures', 'quality@example.com'],
    ['/certificates', 'signer@example.com'],
  ];
  for (const [path, as] of routes) {
    const r = await api(path, { as });
    const walk = (v, where, key = '') => {
      if (!v || typeof v !== 'object') return [];
      if (Array.isArray(v)) return v.flatMap((x, i) => walk(x, `${where}[${i}]`, key));
      const out = [];
      // A derivation states the rule in prose; it carries no figure of its own.
      if (key === 'derivation') return out;
      if (typeof v.value_mg_per_kg === 'number') {
        if (!v.boundary || !v.method_version || v.uncertainty_bp === undefined || v.uncertainty_bp === null) {
          out.push(where);
        }
      }
      // Neither energy figure appears without the other.
      const hasLoc = v.energy_location_mg_per_kg !== undefined;
      const hasMkt = v.energy_market_mg_per_kg !== undefined;
      if (hasLoc !== hasMkt) out.push(`${where} energy`);
      for (const [k, x] of Object.entries(v)) out.push(...walk(x, `${where}.${k}`, k));
      return out;
    };
    const bad = walk(r.body, path);
    ok(`${path} carries every carbon value with its four components`, bad.length === 0, bad.join(', '));
  }
}

console.log('\n== a yield appears on no certificate and in no verification answer ==');
{
  const certs = await api('/certificates', { as: 'signer@example.com' });
  ok('the certificate register carries no yield', !/yield/i.test(JSON.stringify(certs.body)));
  const number = certs.body[0].number;
  const one = await api(`/certificates/${number}`, { as: 'signer@example.com' });
  ok('one certificate carries no yield', !/yield/i.test(JSON.stringify(one.body)));
  const doc = await (await fetch(`${BASE}/api/certificates/${number}/document`)).text();
  ok('the document carries no yield', !/yield/i.test(doc));
  const v = await (await fetch(`${BASE}/api/verify/${number}`)).json();
  ok('the verification answer carries no yield', !/yield/i.test(JSON.stringify(v)));
  const permitted = ['claim_type', 'found', 'grade', 'issued_on', 'number',
    'recipient_name', 'site', 'state', 'withdrawal_reason', 'withdrawn_on'];
  const extra = Object.keys(v).filter((k) => !permitted.includes(k));
  ok('and it returns these fields and nothing else', extra.length === 0, extra.join(', '));
  ok('so no collector, genealogy or carbon breakdown reaches it',
    !('collector' in v) && !('nodes' in v) && !('carbon' in v) && !('breakdown' in v));
}

console.log('\n== the record refuses an edit and a deletion ==');
{
  for (const [method, path] of [['PUT', '/record/1'], ['PATCH', '/record/1'], ['DELETE', '/record/1']]) {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { authorization: `Bearer ${tokens['quality@example.com']}` } });
    ok(`${method} ${path} is refused`, r.status === 404 || r.status === 405 || r.status === 403,
      `got ${r.status}`);
  }
  const chain = await api('/record/check', { as: 'auditor@example.com' });
  check('and the chain still verifies', chain.body.holds, true);
}

console.log('\n== an export that returns nothing is recorded too ==');
{
  const r = await api('/exports', { as: 'auditor@example.com', method: 'POST',
    body: { sites: ['SITE-NOWHERE'], certificates: ['CERT-NONE-000000'] } });
  check('the empty export is produced', r.status, 201);
  check('and it says it is empty', r.body.certificates.length, 0);
  const q = await api('/record/queries/exports_by_auditor', { as: 'auditor@example.com' });
  ok('it appears among the auditor\'s exports including the reads that returned nothing',
    q.body.results.some((x) => x.reference === r.body.reference), JSON.stringify(q.body.results).slice(0, 200));
}

console.log('\n== every collection route returns a top-level array ==');
{
  for (const [path, as] of [
    ['/sites', 'quality@example.com'], ['/collectors', 'quality@example.com'],
    ['/batches', 'plant@example.com'], ['/runs', 'plant@example.com'],
    ['/lots', 'quality@example.com'], ['/balance-periods', 'claims@example.com'],
    ['/certificates', 'signer@example.com'], ['/inbound', 'auditor@example.com'],
    ['/record', 'auditor@example.com'], ['/statistics', null], ['/positions', null], ['/news', null],
    ['/conversion-factors', 'claims@example.com'], ['/carbon-methods', 'quality@example.com'],
    ['/deviations', 'quality@example.com'], ['/overrides', 'quality@example.com'],
    ['/customers', 'quality@example.com'], ['/specifications', null], ['/contracts', 'claims@example.com'],
    ['/energy-instruments', 'quality@example.com'], ['/test-results', 'quality@example.com'],
    ['/exports', 'auditor@example.com'], ['/restatements', 'claims@example.com'],
    ['/claim-register', null], ['/change-notices', 'quality@example.com'],
  ]) {
    const r = await api(path, as ? { as } : {});
    ok(`${path} is a top-level array`, Array.isArray(r.body), `status ${r.status}, ${typeof r.body}`);
  }
}

console.log('\n== no mail beyond the four acts ==');
{
  const before = (await (await fetch('http://mailpit:8025/api/v1/messages?limit=500')).json()).messages.length;
  await api('/balance-periods/BP-PILOT-N6-2026H1/allocations', { as: 'claims@example.com',
    method: 'POST', body: { lot: 'LOT-N6-0003', category: 'post_consumer', mass_g: 1 } });
  await api('/overrides/OVR-0001/review', { as: 'quality@example.com', method: 'POST', body: {} });
  await api('/lots/LOT-N6-0001/disposition', { as: 'quality@example.com', method: 'POST',
    body: { disposition: 'released' } });
  await api('/balance-periods/BP-PILOT-N6-2026H1/restatements', { as: 'claims@example.com',
    method: 'POST', body: { reason: 'A check that opening a restatement sends nothing' } });
  const after = (await (await fetch('http://mailpit:8025/api/v1/messages?limit=500')).json()).messages.length;
  check('allocating, reviewing, dispositioning and restating all send nothing', after, before);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (failures.length) console.log('failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);

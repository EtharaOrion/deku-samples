// The four races with a stated outcome, and the guarantees that must hold when
// two acts land at once.
const BASE = process.env.BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';

let pass = 0, fail = 0;
const failures = [];
const check = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass += 1;
  else { fail += 1; failures.push(`${name}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
};
const checkTrue = (name, c, d = '') => { if (c) pass += 1; else { fail += 1; failures.push(`${name}: ${d}`); } };

const tokens = {};
async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  }).then((x) => x.json());
  tokens[email] = r.access_token;
}
let n = Date.now();
async function call(email, method, path, body, hdrs = {}) {
  const headers = { 'content-type': 'application/json', ...hdrs };
  if (email) headers.authorization = `Bearer ${tokens[email]}`;
  if (method !== 'GET' && !headers['idempotency-key']) headers['idempotency-key'] = `r-${n++}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}

const run = async () => {
  for (const u of ['plant', 'quality', 'claims', 'signer', 'signer2', 'auditor']) await login(`${u}@example.com`);

  // ---- race: two allocations for the same remaining credits ---------------
  const before = await call('claims@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  const avail = before.body.categories.post_consumer.credits_available_g;
  const results = await Promise.all([
    call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: avail }),
    call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0002', category: 'post_consumer', mass_g: avail }),
    call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: avail }),
  ]);
  const ok = results.filter((r) => r.status === 201).length;
  const refused = results.filter((r) => r.status === 409).length;
  check('exactly one allocation succeeds', ok, 1);
  check('the others are refused', refused, 2);
  const after = await call('claims@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  checkTrue('the sum of attached credits never exceeds the available credits',
    after.body.categories.post_consumer.credits_available_g >= 0,
    String(after.body.categories.post_consumer.credits_available_g));
  check('available is exactly zero after the winner takes the remainder',
    after.body.categories.post_consumer.credits_available_g, 0);

  // ---- race: two signatures at one site take two consecutive numbers ------
  // reach a signable state honestly: review the override, close the deviation
  // holding the other lot, then close the period the claim was drawn from
  await call('claims@example.com', 'POST', '/api/overrides/OVR-0001/review', {});
  await call('quality@example.com', 'POST', '/api/deviations/DEV-0001/close',
    { outcome: 'root_cause_found', reason: 'Column pressure drift traced to a fouled filter.' });
  const closeDemo = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  checkTrue('the demonstration period closes once nothing blocks it',
    closeDemo.status === 201, JSON.stringify(closeDemo.body).slice(0, 300));
  const signs = await Promise.all([
    call('signer@example.com', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }),
    call('signer@example.com', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-VANTA', password: PW }),
  ]);
  const issued = signs.filter((s) => s.status === 201).map((s) => s.body.number).sort();
  checkTrue('neither signature is lost', issued.length === 2, JSON.stringify(signs.map((s) => [s.status, s.body?.error])));
  if (issued.length === 2) {
    const nums = issued.map((x) => Number(x.split('-').pop()));
    check('two consecutive numbers', nums[1] - nums[0], 1);
    check('no number is issued twice', new Set(issued).size, 2);
  }
  const all = (await call('signer@example.com', 'GET', '/api/certificates')).body
    .filter((c) => c.site === 'SITE-DEMO')
    .map((c) => Number(c.number.split('-').pop()))
    .sort((a, b) => a - b);
  const gapless = all.every((v, i) => i === 0 || v === all[i - 1] + 1);
  checkTrue('the per-site sequence has no gap afterwards', gapless, JSON.stringify(all));
  check('the first SITE-DEMO certificate is number 1', all[0], 1);

  // ---- a scoped read names the moment it saw ------------------------------
  const read = await call('auditor@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  checkTrue('a scoped read answers read_at', !!read.body.read_at, JSON.stringify(read.body.read_at));
  const gen = await call('auditor@example.com', 'GET', '/api/lots/LOT-N6-0001/genealogy');
  checkTrue('the genealogy answers read_at', !!gen.body.read_at, '');
  const recon = await call('auditor@example.com', 'GET', '/api/reconciliation');
  checkTrue('the reconciliation answers read_at', !!recon.body.read_at, '');

  // ---- a method version published while a figure exists -------------------
  const before2 = await call('quality@example.com', 'GET', '/api/lots/LOT-N6-0001/carbon');
  const mv = await call('quality@example.com', 'POST', '/api/carbon-methods/CM-PA6/versions', {
    standard: 'ISO 14067', functional_unit: '1 kg of pellet', boundary: 'cradle-to-gate',
    allocation_basis: 'mass', reviewer: 'Ilse Grootveld',
    emission_factors: [{ name: 'grid electricity', source: 'EcoBase 2026', year: 2026, value_mg_per_kwh: 250000 }],
  });
  check('a new method version is published', mv.status, 201);
  const after2 = await call('quality@example.com', 'GET', '/api/lots/LOT-N6-0001/carbon');
  check('the figure in flight keeps the version it was computed under',
    after2.body.method_version, before2.body.method_version);
  checkTrue('the predecessor stays readable',
    (await call('quality@example.com', 'GET', '/api/carbon-methods/CM-PA6/versions/2')).status === 200, '');

  // a recomputation against a closed period is refused unless a restatement is open
  const reason = 'A superseded emission factor set was replaced by the 2026 publication.';
  const blocked = await call('quality@example.com', 'POST', '/api/carbon-figures/CFG-0001/recompute', { reason });
  check('a recomputation against a closed period is refused', blocked.status, 409);
  check('the refusal names the rule', blocked.body.error, 'period_closed');

  // open a restatement, and it becomes possible
  const rst = await call('claims@example.com', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/restatements',
    { reason: 'A revised emission factor set changes the carbon figure the period issued.' });
  check('a restatement opens against the closed period', rst.status, 201);
  checkTrue('the restatement enumerates every certificate issued from the period',
    Array.isArray(rst.body.certificates) && rst.body.complete === true, JSON.stringify(rst.body).slice(0, 200));

  const rec = await call('quality@example.com', 'POST', '/api/carbon-figures/CFG-0001/recompute', { reason });
  check('a recomputation answers with the reference it took', rec.status, 201);
  checkTrue('the recomputation enumerates every certificate carrying the superseded figure',
    Array.isArray(rec.body.certificates_carrying_superseded_figure), JSON.stringify(rec.body).slice(0, 200));
  checkTrue('the recomputation records a person, a date and a reason',
    !!rec.body.recomputed_by && !!rec.body.recomputed_on && !!rec.body.reason, '');
  checkTrue('the new figure stands alongside the old one', rec.body.supersedes === 'CFG-0001', '');

  // one resolution per certificate, and a second is refused
  if (rst.body.certificates?.length) {
    const target = rst.body.certificates[0].number;
    const r1 = await call('claims@example.com', 'POST', `/api/restatements/${rst.body.reference}/resolutions`,
      { certificate: target, outcome: 'unaffected', reason: 'The revised factor does not move this certificate.' });
    check('a resolution is recorded', r1.status, 201);
    const r2 = await call('claims@example.com', 'POST', `/api/restatements/${rst.body.reference}/resolutions`,
      { certificate: target, outcome: 'withdrawn', reason: 'A second resolution against the same certificate.' });
    check('a second resolution against the same certificate is refused', r2.status, 409);
    const many = await call('claims@example.com', 'POST', `/api/restatements/${rst.body.reference}/resolutions`,
      { certificate: ['A', 'B'], outcome: 'unaffected', reason: 'More than one at a time.' });
    check('no route resolves more than one certificate at a time', many.status, 400);
  }

  // ---- a period closes, then refuses to reopen and refuses a write --------
  const closeP = await call('claims@example.com', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/close', {});
  if (closeP.status === 201) {
    check('closing settles the carry-over per category',
      typeof closeP.body.settlement.post_consumer.carried_forward_g, 'number');
    const reclose = await call('claims@example.com', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/close', {});
    check('a closed period refuses to reopen', reclose.status, 409);
    const write = await call('claims@example.com', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/allocations',
      { lot: 'LOT-N6-0003', category: 'post_consumer', mass_g: 1 });
    check('a closed period refuses every further write', write.status, 409);
    checkTrue('a closed period reports closed_on and cut_off',
      !!closeP.body.closed_on && !!closeP.body.cut_off, JSON.stringify(closeP.body));
  } else {
    checkTrue('the close names what blocks it', !!closeP.body.blocking, JSON.stringify(closeP.body).slice(0, 200));
  }

  // ---- the carry-over worked case ----------------------------------------
  const bp = await call('claims@example.com', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  const cap = bp.body.categories.post_consumer.carry_over_cap_g;
  check('with 360000 g in and a limit of 2000 bp, at most 72000 g carries forward', cap, 72000);

  // ---- the record still verifies after all of that ------------------------
  const chk = await call('auditor@example.com', 'GET', '/api/record/check');
  check('the chain still verifies after concurrent writes', chk.body.holds, true);

  console.log(`\npass ${pass}  fail ${fail}`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(2); });

// Third verification pass: the stated race outcomes, the conservation
// invariants, and the document as plain text. Development harness; not shipped.
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
  tokens[who] = (await res.json()).access_token;
  return tokens[who];
}
let n = 0;
async function call(who, method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (who) headers.authorization = `Bearer ${await login(who)}`;
  if (method !== 'GET' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = `v3-${Date.now()}-${n++}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let j = null;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}

async function run() {
  /* ---------------- the transfer conserves credit across the journey ------- */
  const before = await Promise.all([
    call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1'),
    call('claims', 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1'),
  ]);
  const totalBefore = before.reduce((s, r) => s + r.body.post_consumer.total_credit_g + r.body.pre_consumer.total_credit_g, 0);
  const trf = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/transfers', { from_period: 'BP-PILOT-N6-2026H1', category: 'post_consumer', mass_g: 20000, moved_on: '2026-06-01' });
  ok('a transfer lands with a reference', trf.status === 201 && !!trf.body.reference, trf.body);
  const after = await Promise.all([
    call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1'),
    call('claims', 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1'),
  ]);
  const totalAfter = after.reduce((s, r) => s + r.body.post_consumer.total_credit_g + r.body.pre_consumer.total_credit_g, 0);
  ok('total credit across the two periods is unchanged by the journey', totalBefore === totalAfter, { totalBefore, totalAfter });
  const inbound = after[0].body.inbound_credits.find((x) => x.movement === trf.body.reference);
  ok('the receiving period reports it as inbound, never fresh', inbound && inbound.fresh_credit === false && inbound.origin_site === 'SITE-PILOT', inbound);
  ok('credits_in_g did not rise: a transfer is not a fresh credit', after[0].body.post_consumer.credits_in_g === before[0].body.post_consumer.credits_in_g, { b: before[0].body.post_consumer.credits_in_g, a: after[0].body.post_consumer.credits_in_g });

  /* ---------------- a blend dilutes with non-claimable material ------------ */
  const lotsBefore = await call('claims', 'GET', '/api/lots');
  const l1 = lotsBefore.body.find((x) => x.reference === 'LOT-N6-0001');
  const l3 = lotsBefore.body.find((x) => x.reference === 'LOT-N6-0003');
  const blend = await call('quality', 'POST', '/api/lots/LOT-N6-0001/blend', { with: 'LOT-N6-0003' });
  const expected = Math.floor((l1.mass_g * l1.content_bp + l3.mass_g * l3.content_bp) / (l1.mass_g + l3.mass_g));
  ok('the blend is mass-weighted and floored', blend.body.content_bp === expected, { got: blend.body.content_bp, expected });
  ok('the blend never exceeds the stronger parent', blend.body.content_bp <= Math.max(l1.content_bp, l3.content_bp));
  ok('the blend names both sites', JSON.stringify(blend.body.sites) === '["SITE-DEMO","SITE-PILOT"]', blend.body.sites);
  ok('the blend takes the weaker claim type', blend.body.claim_type === 'mass_balance', blend.body.claim_type);
  ok('the blend carries the provisional flag of the weaker', blend.body.provisional_factor === true, blend.body);

  /* ---------------- the allocation basis mismatch answers 409 -------------- */
  const mv = await call('quality', 'POST', '/api/carbon-methods/CM-PA6/versions', { boundary: 'cradle-to-gate', allocation_basis: 'economic', reviewer: 'Ilse Grootveld', emission_factors: [] });
  ok('a version on a different allocation basis publishes', mv.status === 201, mv.body);
  const recomp = await call('quality', 'POST', '/api/carbon-figures/CFG-0003/recompute', { reason: 'Moved onto the economic allocation basis.' });
  ok('the figure recomputes onto the new version', recomp.status === 201, recomp.body);
  const mismatch = await call('quality', 'GET', '/api/lots/LOT-N6-0003/carbon');
  ok('a basis disagreement answers 409 naming the mismatch', mismatch.status === 409 && mismatch.body.error === 'allocation_basis_mismatch', mismatch.body);
  ok('the 409 names both bases', mismatch.body.period_basis === 'mass' && mismatch.body.method_basis === 'economic', mismatch.body);

  /* ---------------- two signatures at one site, at the same moment --------- */
  // Clear the way: review the override, close the deviation, close the period.
  await call('claims', 'POST', '/api/overrides/OVR-0001/review', {});
  await call('quality', 'POST', '/api/deviations/DEV-0001/close', { outcome: 'root_cause_found' });
  await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 });
  const closed = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  ok('the period closes', closed.status === 200, closed.body);
  ok('a closed period reports closed_on and cut_off', !!closed.body.closed_on && !!closed.body.cut_off, closed.body);
  const readBack = await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  ok('the closed period reads back with both', !!readBack.body.closed_on && !!readBack.body.cut_off && readBack.body.state === 'closed', { c: readBack.body.closed_on, k: readBack.body.cut_off });

  const pre = await call('signer', 'POST', '/api/certificates/preview', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS' });
  ok('all eight conditions hold before the race', pre.body.all_satisfied === true, pre.body.conditions.filter((x) => !x.satisfied));

  const sigHeaders = async (k) => ({ 'content-type': 'application/json', authorization: `Bearer ${await login('signer')}`, 'Idempotency-Key': `sig-${Date.now()}-${k}` });
  const [sa, sb] = await Promise.all([
    fetch(`${BASE}/api/certificates`, { method: 'POST', headers: await sigHeaders('a'), body: JSON.stringify({ lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }) }),
    fetch(`${BASE}/api/certificates`, { method: 'POST', headers: await sigHeaders('b'), body: JSON.stringify({ lot: 'LOT-N6-0001', recipient: 'CUS-VANTA', password: PW }) }),
  ]);
  const [ja, jb] = [await sa.json(), await sb.json()];
  ok('neither signature is lost', sa.status === 201 && sb.status === 201, { a: sa.status, b: sb.status, ja: ja.error, jb: jb.error });
  const numbers = [ja.number, jb.number].filter(Boolean).sort();
  ok('two distinct numbers were issued', numbers.length === 2 && numbers[0] !== numbers[1], numbers);
  ok('the numbers are consecutive', numbers[0] === 'CERT-DEMO-000001' && numbers[1] === 'CERT-DEMO-000002', numbers);

  const all = await call('quality', 'GET', '/api/certificates');
  const demo = all.body.filter((x) => x.site === 'SITE-DEMO').map((x) => Number(x.number.split('-').pop())).sort((x, y) => x - y);
  ok('the sequence has no gap afterwards', demo.every((v, i) => v === i + 1), demo);
  ok('no number is issued twice', new Set(demo).size === demo.length, demo);

  // Five at once, under real contention, to be sure the invariant is the lock
  // rather than the scheduler happening to serialise two requests.
  const burst = await Promise.all(
    [1, 2, 3, 4, 5].map(async (i) =>
      fetch(`${BASE}/api/certificates`, {
        method: 'POST',
        headers: await sigHeaders(`burst${i}`),
        body: JSON.stringify({ lot: 'LOT-N6-0001', recipient: i % 2 ? 'CUS-HELIOS' : 'CUS-VANTA', password: PW }),
      }),
    ),
  );
  const burstBodies = await Promise.all(burst.map((r) => r.json()));
  ok('every signature in a burst of five lands', burst.every((r) => r.status === 201), burst.map((r) => r.status));
  const burstNumbers = burstBodies.map((b) => b.number);
  ok('a burst of five issues five distinct numbers', new Set(burstNumbers).size === 5, burstNumbers);
  const all2 = await call('quality', 'GET', '/api/certificates');
  const demo2 = all2.body.filter((x) => x.site === 'SITE-DEMO' && x.version === 1).map((x) => Number(x.number.split('-').pop())).sort((x, y) => x - y);
  ok('the sequence is still gapless after the burst', demo2.every((v, i) => v === i + 1), demo2);
  ok('the pilot sequence is untouched by the demo burst', all2.body.filter((x) => x.site === 'SITE-PILOT').every((x) => /^CERT-PILOT-0000/.test(x.number)));

  /* ---------------- the document as plain text ---------------------------- */
  const docRes = await fetch(`${BASE}/api/certificates/${numbers[0]}/document`);
  const doc = await docRes.text();
  ok('the document is served as plain text', (docRes.headers.get('content-type') || '').startsWith('text/plain'), docRes.headers.get('content-type'));
  const iType = doc.indexOf('CLAIM TYPE');
  const iPct = doc.indexOf('RECYCLED CONTENT');
  ok('a reader moving by heading reaches the claim type before the percentage', iType > 0 && iPct > iType, { iType, iPct });
  ok('the claim type survives as a word', /mass_balance/.test(doc));
  ok('the percentage survives as a word', /basis points/.test(doc));
  ok('the carbon figure survives with its four components', /Boundary:/.test(doc) && /Method version:/.test(doc) && /Uncertainty:/.test(doc) && /mg CO2e per kg/.test(doc));
  ok('the permitted statement survives', /WHAT YOU MAY SAY/.test(doc) && /WHAT YOU MAY NOT SAY/.test(doc));
  ok('the verification address is printed', new RegExp(`ravel.example.com/verify/${numbers[0]}`).test(doc));
  ok('no yield figure appears in the document', !/yield/i.test(doc), doc.match(/.{0,40}yield.{0,40}/i));

  const doc2 = await (await fetch(`${BASE}/api/certificates/${numbers[0]}/document`)).text();
  ok('two reads return identical bytes', doc === doc2 && Buffer.byteLength(doc) === Buffer.byteLength(doc2), Buffer.byteLength(doc));

  /* ---------------- a re-issue is a new version at a new address ----------- */
  const re = await call('signer', 'POST', `/api/certificates/${numbers[0]}/reissue`, { password: PW, reason: 'A verification re-issue.' });
  ok('a re-issue produces a new version', re.status === 201 && re.body.version === 2, re.body);
  const oldDoc = await (await fetch(`${BASE}/api/certificates/${numbers[0]}/document?version=1`)).text();
  const newDoc = await (await fetch(`${BASE}/api/certificates/${numbers[0]}/document?version=2`)).text();
  ok('the old version keeps its original bytes', oldDoc === doc, { same: oldDoc === doc });
  ok('the new version is at a new address with new bytes', newDoc !== oldDoc && /Version: 2/.test(newDoc), re.body.address);

  /* ---------------- the withdrawal, end to end ---------------------------- */
  const wd = await call('signer', 'POST', `/api/certificates/${numbers[1]}/withdraw`, { reason: 'A verification withdrawal of the second signature.' });
  ok('the withdrawal performs five consequences in one action', wd.status === 200 && wd.body.notified_recipients.length >= 1 && wd.body.void_statements.length >= 1 && Array.isArray(wd.body.derived_certificates) && wd.body.batch_traversal.complete === true, Object.keys(wd.body));
  ok('the reverse traversal names the underlying batches', wd.body.batch_traversal.batches.includes('BATCH-1001'), wd.body.batch_traversal.batches);
  const wdDoc = await (await fetch(`${BASE}/api/certificates/${numbers[1]}/document`)).text();
  ok('the document stays readable and states the withdrawal', /WITHDRAWN/.test(wdDoc) && /verification withdrawal/.test(wdDoc));
  const vfy = await (await fetch(`${BASE}/api/verify/${numbers[1]}`)).json();
  ok('the address resolves and states the withdrawal', vfy.found === true && vfy.state === 'withdrawn');

  /* ---------------- the replay after a recomputation ---------------------- */
  const rep = await call('auditor', 'GET', `/api/certificates/${numbers[0]}/replay?version=1`);
  ok('replay answers with both values and the input versions', rep.status === 200 && !!rep.body.issued && !!rep.body.recomputed && !!rep.body.input_versions, Object.keys(rep.body));
  ok('agreement and disagreement are both ordinary answers', typeof rep.body.agrees === 'boolean', rep.body.agrees);

  /* ---------------- the verify route is rate limited ---------------------- */
  let limited = false;
  for (let i = 0; i < 200; i++) {
    const r = await fetch(`${BASE}/api/verify/CERT-PILOT-000001`);
    if (r.status === 429) { limited = true; break; }
  }
  ok('the public verification route is rate limited', limited);

  /* ---------------- the chain still holds after all of it ----------------- */
  const chain = await call('auditor', 'GET', '/api/record/check');
  ok('the digest chain holds after every act in this pass', chain.body.holds === true, chain.body);

  console.log(`\npassed ${pass}, failed ${fail}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });

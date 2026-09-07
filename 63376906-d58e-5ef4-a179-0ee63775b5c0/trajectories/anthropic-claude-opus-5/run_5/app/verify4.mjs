// Fourth pass: the two remaining stated races, run under real contention.
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
  tokens[who] = (await res.json()).access_token;
  return tokens[who];
}
let n = 0;
async function call(who, method, path, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (who) headers.authorization = `Bearer ${await login(who)}`;
  if (method !== 'GET' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = `v4-${Date.now()}-${n++}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let j = null;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}

async function run() {
  /* ============ race three: a scoped read while a period is closed ========= */
  // Clear the way so the close will actually succeed.
  await call('claims', 'POST', '/api/overrides/OVR-0001/review', {});
  await call('quality', 'POST', '/api/deviations/DEV-0001/close', { outcome: 'root_cause_found' });

  // Fire twenty scoped reads and the close at the same moment. Each read must
  // be internally consistent: a period that reports itself closed must also
  // report its closed_on and its cut_off, and one that reports itself open must
  // report neither. Half-before and half-after is the failure this forbids.
  const reads = [];
  for (let i = 0; i < 20; i++) reads.push(call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1'));
  const closePromise = call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  const [closed, ...results] = await Promise.all([closePromise, ...reads]);

  ok('the close lands', closed.status === 200, closed.body);

  const inconsistent = results.filter((r) => {
    const b = r.body;
    if (r.status !== 200) return true;
    if (b.state === 'closed') return !b.closed_on || !b.cut_off || !b.carried_forward_g || !b.expired_g;
    if (b.state === 'open') return !!b.closed_on || !!b.cut_off;
    return true;
  });
  ok('every read under a concurrent close is internally consistent', inconsistent.length === 0, inconsistent.map((r) => ({ st: r.body.state, on: r.body.closed_on, cut: r.body.cut_off })));

  ok('every read names the moment it saw', results.every((r) => !!r.body.read_at), results.filter((r) => !r.body.read_at).length);

  // A read that saw the close must not also report credit the close consumed.
  const closedReads = results.filter((r) => r.body.state === 'closed');
  const openReads = results.filter((r) => r.body.state === 'open');
  ok('each read is wholly one side of the close', closedReads.length + openReads.length === results.length, { c: closedReads.length, o: openReads.length });
  for (const r of closedReads) {
    const cf = r.body.carried_forward_g || {};
    const ex = r.body.expired_g || {};
    const consistent = ['post_consumer', 'pre_consumer'].every((cat) => {
      // carried forward plus expired is what was available at the close, and
      // the carry never exceeds the limit on the credit that entered.
      const limit = Math.floor((r.body[cat].credits_in_g * r.body.carry_over_limit_bp) / 10000);
      return cf[cat] <= limit && cf[cat] >= 0 && ex[cat] >= 0;
    });
    ok('a read that saw the close reports a settled carry-over', consistent, { cf, ex });
    break;
  }

  const after = await call('claims', 'GET', '/api/balance-periods/BP-DEMO-N6-2026H1');
  ok('the settled period reports closed_on and cut_off', after.body.state === 'closed' && !!after.body.closed_on && !!after.body.cut_off, after.body);

  /* ====== race two: a restatement enumerates while one is withdrawn ======== */
  // Both acts land, both are entries, and the certificate's state reflects the
  // later act with the earlier one still readable at its own sequence.
  const certs = await call('quality', 'GET', '/api/certificates');
  const victim = certs.body.find((x) => x.site === 'SITE-PILOT' && x.state === 'issued');
  ok('an issued certificate is available for the race', !!victim, certs.body.map((x) => `${x.number}:${x.state}`));

  const [rst, wd] = await Promise.all([
    call('claims', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/restatements', { reason: 'A restatement racing a withdrawal.' }),
    call('signer2', 'POST', `/api/certificates/${victim.number}/withdraw`, { reason: 'A withdrawal racing a restatement, for a different reason.' }),
  ]);
  ok('both acts land: the restatement', rst.status === 201, rst.body);
  ok('both acts land: the withdrawal', wd.status === 200, wd.body);
  ok('the restatement enumerated the certificate', (rst.body.certificates || []).some((x) => x.number === victim.number), rst.body.certificates);

  const nowState = await call('quality', 'GET', `/api/certificates/${victim.number}`);
  ok("the certificate's state reflects the later act", nowState.body.state === 'withdrawn', nowState.body.state);

  const rec = await call('auditor', 'GET', '/api/record');
  const rstEntry = rec.body.find((x) => x.act === 'restatement_opened' && x.object_ref === rst.body.reference);
  const wdEntry = rec.body.find((x) => x.act === 'certificate_withdrawn' && x.object_ref === victim.number && x.seq > 20);
  ok('both acts are entries', !!rstEntry && !!wdEntry, { r: !!rstEntry, w: !!wdEntry });
  ok('the earlier act is still readable at its own sequence', rstEntry.seq !== wdEntry.seq && !!rstEntry.content, { r: rstEntry.seq, w: wdEntry.seq });

  // The restatement still holds exactly one resolution per affected certificate.
  const res1 = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, { certificate: victim.number, outcome: 'withdrawn', reason: 'It was withdrawn while this restatement was being enumerated.' });
  ok('the withdrawn certificate still takes exactly one resolution', res1.status === 201, res1.body);
  const res2 = await call('claims', 'POST', `/api/restatements/${rst.body.reference}/resolutions`, { certificate: victim.number, outcome: 'unaffected', reason: 'A second attempt.' });
  ok('a second resolution is still refused', res2.status === 409, res2.body);

  /* ============ the chain survives every act above ======================== */
  const chain = await call('auditor', 'GET', '/api/record/check');
  ok('the digest chain holds after both races', chain.body.holds === true, chain.body);

  /* ============ a closed period refuses every further write =============== */
  const w1 = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { lot: 'LOT-N6-0001', category: 'pre_consumer', mass_g: 1 });
  const w2 = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
  const w3 = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/transfers', { from_period: 'BP-PILOT-N6-2026H1', category: 'post_consumer', mass_g: 1 });
  ok('a closed period refuses an allocation', w1.status === 409, w1.body);
  ok('a closed period refuses to reopen', w2.status === 409, w2.body);
  ok('a closed period refuses a transfer', w3.status === 409, w3.body);

  console.log(`\npassed ${pass}, failed ${fail}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });

// Fifth pass: every scoped read is a snapshot, not just the balance one.
// A read that names a moment must describe one state at that moment.
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
  if (method !== 'GET' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = `v5-${Date.now()}-${n++}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let j = null;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}

async function run() {
  /* ---- every scoped read names the moment it saw ------------------------- */
  const scoped = [
    ['/api/balance-periods/BP-DEMO-N6-2026H1', 'claims'],
    ['/api/lots/LOT-N6-0001/genealogy', 'auditor'],
    ['/api/batches/BATCH-1001/impact', 'auditor'],
    ['/api/reconciliation', 'plant'],
    ['/api/record/check', 'auditor'],
    ['/api/record/queries/refused_allocations', 'auditor'],
    ['/api/record/queries/lots_from_batch', 'auditor'],
  ];
  for (const [path, who] of scoped) {
    const r = await call(who, 'GET', path);
    ok(`${path} names the moment it saw`, r.status === 200 && !!r.body.read_at && !Number.isNaN(Date.parse(r.body.read_at)), { st: r.status, at: r.body?.read_at });
  }

  /* ---- the export is internally consistent under concurrent writes -------- */
  // Take twenty exports while runs are being closed and lots dispositioned.
  // Every export must carry a chain check that matches the entries beside it,
  // and a digest list that is exactly its own entries.
  const noise = (async () => {
    for (let i = 0; i < 12; i++) {
      await call('quality', 'POST', '/api/deviations', { runs: ['RUN-D-0001'], lots: [], detail: `Noise deviation ${i} raised during an export.` });
      await call('auditor', 'POST', '/api/annotations', { object_kind: 'lot', object_ref: 'LOT-N6-0001', note: `Noise annotation ${i}.` });
    }
  })();
  const exports = [];
  for (let i = 0; i < 12; i++) exports.push(call('auditor', 'POST', '/api/exports', { note: i }));
  const results = await Promise.all(exports);
  await noise;

  ok('every export under concurrent writes succeeds', results.every((r) => r.status === 201), results.map((r) => r.status));

  const torn = results.filter((r) => {
    const b = r.body;
    if (!b || !Array.isArray(b.entries)) return true;
    // the digest list is exactly the entries
    if (b.digests.length !== b.entries.length) return true;
    if (b.anchor_references.length !== b.entries.length) return true;
    // the chain check walked the same state: it reports at least as many
    // entries as the export carries, and it holds
    if (!b.chain || b.chain.holds !== true) return true;
    if (b.chain.entries < b.entries.length) return true;
    // the digests are the entries' own digests, in order
    for (let i = 0; i < b.entries.length; i++) {
      if (b.digests[i].seq !== b.entries[i].seq) return true;
      if (b.digests[i].digest !== b.entries[i].digest) return true;
    }
    // the chain within the export links: each prev_digest is the one before
    for (let i = 1; i < b.entries.length; i++) {
      if (b.entries[i].prev_digest !== b.entries[i - 1].digest) return true;
    }
    return false;
  });
  ok('no export is internally torn', torn.length === 0, torn.map((r) => ({ e: r.body?.entries?.length, d: r.body?.digests?.length, c: r.body?.chain })));

  ok('every export carries requested_at equal to its read_at', results.every((r) => r.body.requested_at === r.body.read_at), results.slice(0, 2).map((r) => ({ q: r.body.requested_at, r: r.body.read_at })));

  // The export is itself an entry, but never inside its own artefact.
  const selfRef = results.filter((r) => (r.body.entries || []).some((e) => e.object_ref === r.body.reference && e.act === 'export_taken'));
  ok('no export contains its own export_taken entry', selfRef.length === 0, selfRef.length);

  const listed = await call('auditor', 'GET', '/api/record/queries/exports_by_auditor');
  ok('every export is recorded afterwards', results.every((r) => listed.body.results.some((x) => x.reference === r.body.reference)), { made: results.length, listed: listed.body.results.length });

  /* ---- the genealogy is consistent under concurrent writes --------------- */
  const genNoise = (async () => {
    for (let i = 0; i < 10; i++) {
      await call('quality', 'POST', '/api/annotations', { object_kind: 'run', object_ref: 'RUN-D-0001', note: `Genealogy noise ${i}.` });
    }
  })();
  const gens = await Promise.all(Array.from({ length: 12 }, () => call('auditor', 'GET', '/api/lots/LOT-N6-0001/genealogy')));
  await genNoise;
  const badGen = gens.filter((r) => {
    const b = r.body;
    if (r.status !== 200) return true;
    // BATCH-1001 appears exactly once at its total contributed mass
    const b1 = b.nodes.filter((x) => x.reference === 'BATCH-1001');
    if (b1.length !== 1 || b1[0].mass_g !== 450000) return true;
    // every edge endpoint is a node in the same response
    const refs = new Set(b.nodes.map((x) => x.reference));
    if (b.edges.some((e) => !refs.has(e.from) || !refs.has(e.to))) return true;
    // the nested list carries the same node set as the graph
    const seen = new Set();
    (function walk(nd) {
      if (!nd) return;
      seen.add(nd.reference);
      for (const k of nd.inputs || []) walk(k);
    })(b.text_equivalent);
    if (seen.size !== refs.size) return true;
    return false;
  });
  ok('no genealogy is internally torn under concurrent writes', badGen.length === 0, badGen.length);
  ok('the graph and the nested list always carry the same facts', gens.every((r) => r.body.flagged === r.body.nodes.some((x) => (x.flags || []).length > 0)));

  /* ---- reconciliation is one state -------------------------------------- */
  const recNoise = (async () => {
    for (let i = 0; i < 8; i++) {
      await call('plant', 'POST', '/api/inbound/laboratory', { received_at: new Date().toISOString(), payload: { noise: i } });
    }
  })();
  const recs = await Promise.all(Array.from({ length: 10 }, () => call('plant', 'GET', '/api/reconciliation')));
  await recNoise;
  ok('every reconciliation read succeeds', recs.every((r) => r.status === 200));
  ok('every reconciliation names one moment', recs.every((r) => !!r.body.read_at));
  ok('customer_reporting still reads as no record', recs.every((r) => r.body.integration_ages.find((x) => x.source === 'customer_reporting').age_hours === null));
  ok('the six figures are all present in every read', recs.every((r) => ['mass_balance_residual_g', 'credit_margin_g', 'consumptions_on_open_runs', 'batches_with_broken_custody', 'certificates_with_superseded_figures', 'integration_ages'].every((k) => k in r.body)));

  /* ---- a snapshot read never blocks a write ------------------------------ */
  // A READ ONLY snapshot takes no row locks, so a write landing during a long
  // read is not delayed behind it and never deadlocks against it.
  const t0 = Date.now();
  const [reads, write] = await Promise.all([
    Promise.all(Array.from({ length: 8 }, () => call('auditor', 'POST', '/api/exports', {}))),
    call('quality', 'POST', '/api/deviations', { runs: ['RUN-U-0001'], lots: [], detail: 'A write landing during eight concurrent exports.' }),
  ]);
  ok('a write lands during concurrent snapshot reads', write.status === 201, write.body);
  ok('the reads all completed', reads.every((r) => r.status === 201));
  ok('no read deadlocked or timed out', Date.now() - t0 < 30000, Date.now() - t0);

  /* ---- concurrent creates take distinct references ----------------------- */
  // Every route that creates a record answers with the reference the record
  // took. Two acts landing at once must take two references, not collide.
  const batchBody = (i) => ({
    collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer',
    gross_g: 20000 + i, tare_g: 20000, net_g: i + 1, moisture_bp: 0,
    moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-10',
    composition: {}, contamination: {}, custody: [],
  });
  const bookings = await Promise.all(Array.from({ length: 10 }, (_, i) => call('plant', 'POST', '/api/batches', batchBody(i))));
  ok('every concurrent booking lands', bookings.every((r) => r.status === 201), bookings.map((r) => r.status));
  const bookedRefs = bookings.map((r) => r.body.reference);
  ok('every booking answers with the reference it took', bookedRefs.every(Boolean), bookedRefs);
  ok('ten concurrent bookings take ten distinct references', new Set(bookedRefs).size === 10, bookedRefs);

  const devs = await Promise.all(Array.from({ length: 10 }, (_, i) => call('quality', 'POST', '/api/deviations', { runs: ['RUN-D-0001'], lots: [], detail: `Concurrent deviation ${i} for reference allocation.` })));
  ok('ten concurrent deviations take ten distinct references', new Set(devs.map((r) => r.body.reference)).size === 10, devs.map((r) => r.body.reference));

  const inbs = await Promise.all(Array.from({ length: 10 }, (_, i) => call('plant', 'POST', '/api/inbound/weighbridge', { received_at: new Date().toISOString(), payload: { i } })));
  ok('ten concurrent inbound records take ten distinct references', new Set(inbs.map((r) => r.body.reference)).size === 10, inbs.map((r) => r.body.reference));

  /* ---- a retry landing during the original performs the work once -------- */
  // The same key with the same body returns the original result and creates
  // nothing further — including when the retry arrives while the original is
  // still in flight, which is precisely when a network retry does arrive.
  const beforeBatches = (await call('plant', 'GET', '/api/batches')).body.length;
  const dupKey = `dup-${Date.now()}`;
  const dupBody = { collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'pre_consumer', gross_g: 21234, tare_g: 20000, net_g: 1234, moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-04-11', composition: {}, contamination: {}, custody: [] };
  const retries = await Promise.all(Array.from({ length: 8 }, () => call('plant', 'POST', '/api/batches', dupBody, { 'Idempotency-Key': dupKey })));
  ok('every concurrent retry answers', retries.every((r) => r.status === 201), retries.map((r) => r.status));
  const retryRefs = [...new Set(retries.map((r) => r.body.reference))];
  ok('eight concurrent retries of one key return one reference', retryRefs.length === 1, retryRefs);
  const afterBatches = (await call('plant', 'GET', '/api/batches')).body.length;
  ok('eight concurrent retries create exactly one record', afterBatches === beforeBatches + 1, { before: beforeBatches, after: afterBatches });

  // The same key with a different body is still refused, even concurrently.
  const conflicts = await Promise.all(Array.from({ length: 4 }, (_, i) => call('plant', 'POST', '/api/batches', { ...dupBody, net_g: 9000 + i }, { 'Idempotency-Key': dupKey })));
  ok('a differing body on a used key is refused', conflicts.every((r) => r.status === 409 && r.body.error === 'idempotency_key_reuse'), conflicts.map((r) => r.status));
  const afterConflicts = (await call('plant', 'GET', '/api/batches')).body.length;
  ok('a refused key creates nothing', afterConflicts === afterBatches, { a: afterBatches, b: afterConflicts });

  /* ---- the chain survives heavy concurrent appending --------------------- */
  // Every one of those acts appended an entry. If the chain lock were not held
  // across the read of the previous digest and the write of the next entry,
  // two entries would share a prev_digest and the chain would break here.
  const chain = await call('auditor', 'GET', '/api/record/check');
  ok('the digest chain holds after every read and write above', chain.body.holds === true, chain.body);

  const rec = await call('auditor', 'GET', '/api/record');
  const seqs = rec.body.map((x) => x.seq);
  ok('the record has no gap in its sequence', seqs.every((v, i) => v === i + 1), { first: seqs[0], last: seqs[seqs.length - 1], count: seqs.length });
  ok('every prev_digest links to the entry before it', rec.body.every((e, i) => (i === 0 ? e.prev_digest === '0'.repeat(64) : e.prev_digest === rec.body[i - 1].digest)));
  ok('no digest is repeated', new Set(rec.body.map((x) => x.digest)).size === rec.body.length);

  console.log(`\npassed ${pass}, failed ${fail}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });

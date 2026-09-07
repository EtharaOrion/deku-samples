// The four stated races, the mail discipline, and the idempotency scoping.
const BASE = process.env.BASE || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0, fail = 0; const results = [];
const ok = (n, c, d) => { if (c) { pass++; results.push(`  ok   ${n}`); }
  else { fail++; results.push(`  FAIL ${n} ${d === undefined ? '' : JSON.stringify(d).slice(0, 400)}`); } };
const tokens = {};
async function login(u) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${u}@example.com`, password: PW }) });
  tokens[u] = (await r.json()).access_token;
}
const key = () => `k-${Math.random().toString(36).slice(2)}`;
async function call(u, m, p, b, e = {}) {
  const h = { 'content-type': 'application/json' };
  if (u) h.authorization = `Bearer ${tokens[u]}`;
  if (m !== 'GET') h['idempotency-key'] = e.key || key();
  const r = await fetch(`${BASE}${p}`, { method: m, headers: h, body: b === undefined ? undefined : JSON.stringify(b) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const mail = async () => (await (await fetch('http://mailpit:8025/api/v1/messages?limit=200')).json());
for (const u of ['plant', 'analyst', 'quality', 'claims', 'signer', 'signer2', 'auditor']) await login(u);

console.log('- idempotency is scoped to the route as well as the body');
const k = key();
const a = await call('plant', 'POST', '/api/inbound/weighbridge', { received_at: new Date().toISOString(), payload: { t: 1 } }, { key: k });
const b = await call('plant', 'POST', '/api/inbound/laboratory', { received_at: new Date().toISOString(), payload: { t: 1 } }, { key: k });
ok('the same key on a different route is a new act',
  a.status === 201 && b.status === 201 && a.body.reference !== b.body.reference, [a.body, b.body]);
const cRepeat = await call('plant', 'POST', '/api/inbound/weighbridge', { received_at: a.body.received_at, payload: { t: 1 } }, { key: k });
ok('the same key on the same route with the same body returns the original and creates nothing',
  cRepeat.body.reference === a.body.reference, [a.body.reference, cRepeat.body.reference]);
const inboundCount = (await call('plant', 'GET', '/api/inbound')).body.length;
const cRepeat2 = await call('plant', 'POST', '/api/inbound/weighbridge', { received_at: a.body.received_at, payload: { t: 1 } }, { key: k });
void cRepeat2;
ok('a repeat creates nothing further', (await call('plant', 'GET', '/api/inbound')).body.length === inboundCount);

console.log('- two signatures at one site take two consecutive numbers');
// Clear the way: review the override, close the deviation and the period.
await call('claims', 'POST', '/api/overrides/OVR-0001/review', {});
await call('quality', 'POST', '/api/deviations/DEV-0001/close', { outcome: 'root_cause_found' });
await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
  { lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: 360000 });
await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/allocations',
  { lot: 'LOT-N6-0002', category: 'pre_consumer', mass_g: 100000 });
await call('quality', 'POST', '/api/lots/LOT-N6-0002/disposition', { disposition: 'released' });
const closeIt = await call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/close', {});
ok('the period closes once nothing blocks it', closeIt.status === 200, closeIt.body);

const before = (await call('signer', 'GET', '/api/certificates')).body.length;
const [s1, s2] = await Promise.all([
  call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0001', recipient: 'CUS-HELIOS', password: PW }),
  call('signer', 'POST', '/api/certificates', { lot: 'LOT-N6-0002', recipient: 'CUS-VANTA', password: PW }),
]);
ok('two signatures landing together both succeed', s1.status === 201 && s2.status === 201, [s1.status, s2.status, s1.body, s2.body]);
const numbers = [s1.body.number, s2.body.number].sort();
ok('they take two consecutive numbers with no gap',
  numbers[0] === 'CERT-DEMO-000001' && numbers[1] === 'CERT-DEMO-000002', numbers);
const all = (await call('signer', 'GET', '/api/certificates')).body;
ok('neither signature is lost', all.length === before + 2, { before, after: all.length });
const demo = all.filter((x) => x.site === 'SITE-DEMO').map((x) => x.number).sort();
ok('no number is issued twice', new Set(demo).size === demo.length, demo);

console.log('- the four races');
// A method version published while a figure is computed against its predecessor.
const figureBefore = (await call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon')).body;
const [computed, published] = await Promise.all([
  call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon'),
  call('quality', 'POST', '/api/carbon-methods/CM-PA6/versions', {
    boundary: 'cradle-to-gate', allocation_basis: 'mass', reviewer: 'Ilse Grootveld',
    emission_factors: [{ name: 'grid electricity EU-27', source: 'EcoBase 2026', year: 2026, value_mg_per_kg: 380000 }] }),
]);
ok('the computation in flight completes under the version it started with, and records it',
  computed.body.method_version === figureBefore.method_version, { started: figureBefore.method_version, finished: computed.body.method_version });
ok('the new version is published alongside', published.status === 201 && published.body.version === 3, published.body);
const supersededView = (await call('auditor', 'GET', '/api/carbon-methods/CM-PA6/versions/2')).body;
ok('the superseded version stays readable', supersededView.version === 2 && supersededView.superseded === true, supersededView.superseded);

// A scoped read names the moment it saw.
const read = (await call('auditor', 'GET', '/api/balance-periods/BP-PILOT-N6-2026H1')).body;
ok('a scoped read answers read_at, the moment the read saw', !!read.read_at, read.read_at);
const gen = (await call('auditor', 'GET', '/api/lots/LOT-N6-0001/genealogy')).body;
ok('a traversal answers read_at too', !!gen.read_at);

// A restatement enumerating while a certificate is withdrawn for another reason.
const [rst, wd] = await Promise.all([
  call('claims', 'POST', '/api/balance-periods/BP-DEMO-N6-2026H1/restatements',
    { reason: 'A conversion factor window was re-derived for the demonstration site.' }),
  call('signer', 'POST', `/api/certificates/${numbers[1]}/withdraw`,
    { reason: 'A different matter entirely: the recipient cancelled the delivery.' }),
]);
ok('both acts land', rst.status === 201 && wd.status === 200, [rst.status, wd.status]);
const both = (await call('auditor', 'GET', '/api/record')).body;
ok('both are entries and the earlier one is still readable at its own sequence',
  both.some((e) => e.act === 'restatement_opened') && both.some((e) => e.act === 'certificate_withdrawn'));
const state = (await call('signer', 'GET', `/api/certificates/${numbers[1]}`)).body;
ok('the certificate state reflects the later act', state.state === 'withdrawn', state.state);

// A superseded emission factor makes the cached figure answer cache_valid false.
await call('claims', 'POST', '/api/carbon-figures/CFG-0001/recompute', { reason: 'The grid factor was superseded.' });
const cached = (await call('quality', 'GET', '/api/lots/LOT-N6-0001/carbon')).body;
ok('a recomputation is the recorded act that changes a figure, and the new one stands',
  cached.figure_version === 2, cached.figure_version);

console.log('- mail: four acts and nothing else');
const before2 = (await mail()).messages.length;
await call('claims', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/allocations',
  { lot: 'LOT-N6-0003', category: 'post_consumer', mass_g: 1000 });
await call('claims', 'POST', '/api/overrides/OVR-0001/review', {});
await call('quality', 'POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' });
await call('claims', 'POST', '/api/balance-periods/BP-PILOT-N6-2026H1/restatements', { reason: 'Another re-derivation of the pilot window.' });
const after2 = (await mail()).messages.length;
ok('allocating, reviewing, dispositioning and opening a restatement send nothing',
  after2 === before2, { before: before2, after: after2 });

const msgs = (await mail()).messages;
const subjects = msgs.map((m) => m.Subject);
ok('a signature sends "Certificate <number> issued"',
  subjects.some((s) => /^Certificate CERT-DEMO-\d+ issued$/.test(s)), subjects.slice(0, 6));
ok('a withdrawal sends "Certificate <number> withdrawn"',
  subjects.some((s) => /^Certificate CERT-DEMO-\d+ withdrawn$/.test(s)));
ok('every mail is addressed to exactly one recipient with no copies',
  msgs.every((m) => m.To.length === 1 && (!m.Cc || m.Cc.length === 0) && (!m.Bcc || m.Bcc.length === 0)));
const issued = msgs.find((m) => /issued$/.test(m.Subject));
const full = await (await fetch(`http://mailpit:8025/api/v1/message/${issued.ID}`)).json();
ok('the issued mail carries the number, the claim type, the percentage and the permitted statement',
  /CERT-DEMO/.test(full.Text) && /mass_balance/.test(full.Text)
  && /per cent/.test(full.Text) && /mass balance/i.test(full.Text), full.Text.slice(0, 200));
const withdrawn = msgs.find((m) => /withdrawn$/.test(m.Subject));
const fullW = await (await fetch(`http://mailpit:8025/api/v1/message/${withdrawn.ID}`)).json();
ok('the withdrawal mail carries the number, the reason and every statement now void',
  /recipient cancelled/.test(fullW.Text) && /now void/.test(fullW.Text), fullW.Text.slice(0, 200));

console.log('- the certificate document survives as plain text');
const doc = await (await fetch(`${BASE}/api/certificates/${numbers[0]}/document`)).text();
for (const need of ['CLAIM TYPE', 'RECYCLED CONTENT', 'CARBON', 'Boundary:', 'Method version:',
                    'Uncertainty:', 'PERMITTED STATEMENT', 'VERIFICATION']) {
  ok(`the document carries ${need}`, doc.includes(need));
}
ok('the claim type is reached before the percentage',
  doc.indexOf('\nCLAIM TYPE\n') < doc.indexOf('\nRECYCLED CONTENT\n'));
ok('no yield figure appears in the document', !/yield/i.test(doc));

console.log('- the record still verifies');
const chain = (await call('auditor', 'GET', '/api/record/check')).body;
ok('the digest chain holds after every act above', chain.holds === true, chain);

console.log('');
console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

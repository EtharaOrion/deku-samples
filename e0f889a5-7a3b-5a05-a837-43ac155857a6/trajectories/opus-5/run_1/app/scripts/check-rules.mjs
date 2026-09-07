// Check the rules that a page cannot show you: authorization boundaries,
// single-winner concurrency, and the firmware refusals.
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const PW = 'deku-demo-pw-2026';

let failures = 0;
const ok = (name, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? ' ' : '!'} ${name}${detail ? `  ${detail}` : ''}`);
};

const api = async (path, opts = {}) => {
  const res = await fetch(`${BASE}/api${path}`, opts);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
};

const login = async (email) => {
  const r = await api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  if (!r.body?.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body.access_token;
};

const auth = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

console.log('== auth');
const iris = await login('customer@example.com');
const rune = await login('customer2@example.com');
ok('both seeded accounts sign in on the seeded password', Boolean(iris && rune));

const bad = await api('/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'customer@example.com', password: 'wrong' }),
});
ok('a wrong password is refused', bad.status === 401, `status ${bad.status}`);

const dup = await api('/auth/signup', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'customer@example.com', password: 'anotherpassword', name: 'Someone' }),
});
ok('signup refuses a registered address', dup.status === 409, `status ${dup.status}`);

const noToken = await api('/account/devices');
ok('an absent token is refused', noToken.status === 401);
const badToken = await api('/account/devices', { headers: { authorization: 'Bearer not-a-real-token' } });
ok('an invalid token is refused', badToken.status === 401);

console.log('\n== the ownership boundary');
const runeDevices = await api('/account/devices', { headers: auth(rune) });
const runeSerial = runeDevices.body.data[0]?.serial;
ok("Rune sees Rune's camera", runeSerial === 'VA2609NRWB2Z', `saw ${runeSerial}`);

const irisReadsRunes = await api(`/account/devices/${runeSerial}`, { headers: auth(iris) });
ok("Iris reading Rune's camera is not found, never forbidden", irisReadsRunes.status === 404, `status ${irisReadsRunes.status}`);

const irisRegistersRunes = await api('/account/devices', {
  method: 'POST', headers: auth(iris), body: JSON.stringify({ serial: runeSerial }),
});
ok(
  "registering someone else's camera is refused with the right words",
  irisRegistersRunes.status === 409 && irisRegistersRunes.body.message === 'That camera is registered to someone else.',
  `${irisRegistersRunes.status} ${JSON.stringify(irisRegistersRunes.body?.message)}`,
);

const irisRenamesRunes = await api(`/account/devices/${runeSerial}`, {
  method: 'PATCH', headers: auth(iris), body: JSON.stringify({ nickname: 'mine now' }),
});
ok("renaming another customer's camera is refused", irisRenamesRunes.status === 404);

const irisReleasesRunes = await api(`/account/devices/${runeSerial}`, { method: 'DELETE', headers: auth(iris) });
ok("releasing another customer's camera is refused", irisReleasesRunes.status === 404);

const stillRunes = await api(`/account/devices/${runeSerial}`, { headers: auth(rune) });
ok('and the camera is unchanged afterwards', stillRunes.status === 200 && stillRunes.body.serial === runeSerial);

console.log('\n== registering a serial');
const unknown = await api('/account/devices', {
  method: 'POST', headers: auth(iris), body: JSON.stringify({ serial: 'VC2609ZZZZZZ' }),
});
ok(
  'an unknown serial says so',
  unknown.body?.message === 'We do not recognise that serial number.',
  JSON.stringify(unknown.body?.message),
);

const malformed = await api('/account/devices', {
  method: 'POST', headers: auth(iris), body: JSON.stringify({ serial: 'NOT-A-SERIAL' }),
});
ok(
  'a serial of the wrong shape is refused before any lookup',
  malformed.status === 400 && malformed.body.message === 'We do not recognise that serial number.',
  `status ${malformed.status}`,
);

const blocked = await api('/account/devices', {
  method: 'POST', headers: auth(iris), body: JSON.stringify({ serial: 'VC2609WJ3DKT' }),
});
ok('a blocked device is refused as blocked', blocked.status === 409 && /blocked/i.test(blocked.body.message || ''), JSON.stringify(blocked.body?.message));

console.log('\n== two simultaneous registrations of one serial');
// VA2609KTMHX4 is seeded as sold with no live owner.
const race = await Promise.all([
  api('/account/devices', { method: 'POST', headers: auth(iris), body: JSON.stringify({ serial: 'VA2609KTMHX4' }) }),
  api('/account/devices', { method: 'POST', headers: auth(rune), body: JSON.stringify({ serial: 'VA2609KTMHX4' }) }),
]);
const won = race.filter((r) => r.status === 201).length;
const lost = race.filter((r) => r.status === 409).length;
ok('exactly one wins and the other is refused', won === 1 && lost === 1, `won ${won}, refused ${lost}`);

console.log('\n== a flash session');
const manifest = await api('/firmware/manifest?model=compact');
const seven2 = manifest.body.entries.find((e) => e.version === '7.2');
ok('the manifest carries every named field', Boolean(
  seven2 && seven2.build && seven2.channel && seven2.min_firmware && seven2.min_app_version
  && seven2.size_bytes && /^[0-9a-f]{64}$/.test(seven2.sha256)
));

const wrongModel = await api('/flash-sessions', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 240 }), // an A1 image
});
ok('an image for another product is refused before it starts', wrongModel.status === 422, `status ${wrongModel.status}`);

const sessionsBefore = await countSessions();
const below = await api('/flash-sessions', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ serial: 'VA2609NRWB2Z', target_build: 240, reported_version: '1.9' }),
});
ok('an image above the version the device reports is refused', below.status === 422, `status ${below.status}`);
ok('and the refusal writes no session row', (await countSessions()) === sessionsBefore);

const started = await api('/flash-sessions', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 720 }),
});
ok('a valid session starts', started.status === 201 && started.body.state === 'started', `status ${started.status}`);

// The version recorded is the one the device reports, never the one requested.
const completed = await api(`/flash-sessions/${started.body.id}/complete`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reported_version: '7.1' }),
});
ok(
  'completing records the version read back, not the one requested',
  completed.body.reported_version === '7.1' && completed.body.target_version === '7.2',
  `reported ${completed.body?.reported_version}, target ${completed.body?.target_version}`,
);

const deviceAfter = await api('/devices/VC2609PVDA7Q/public');
ok("and the device now reports the version it read back", deviceAfter.body.firmware_version === '7.1', deviceAfter.body?.firmware_version);

// A failed session leaves the version as it was.
const second = await api('/flash-sessions', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 720 }),
});
await api(`/flash-sessions/${second.body.id}/fail`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reason: 'cable pulled' }),
});
const afterFail = await api('/devices/VC2609PVDA7Q/public');
ok('a failed session leaves the version as it was', afterFail.body.firmware_version === '7.1', afterFail.body?.firmware_version);

console.log('\n== pagination');
const products = await api('/products?page_size=2');
ok('a list carries data, next_cursor and has_more', Array.isArray(products.body.data)
  && 'next_cursor' in products.body && 'has_more' in products.body);
ok('and the page size is honoured', products.body.data.length === 2, `got ${products.body.data.length}`);
const nextPage = await api(`/products?page_size=2&cursor=${encodeURIComponent(products.body.next_cursor)}`);
const firstHandles = products.body.data.map((p) => p.handle);
const nextHandles = nextPage.body.data.map((p) => p.handle);
ok('the cursor never repeats a row', !nextHandles.some((h) => firstHandles.includes(h)), `${firstHandles} then ${nextHandles}`);

const capped = await api('/account/orders?limit=500', { headers: auth(iris) });
ok('a page size above the cap is refused, naming the cap', capped.status === 400 && /100/.test(capped.body.message || ''));

console.log('\n== releases order by build, never by date');
const releases = await api('/releases');
const builds = releases.body.data.map((r) => r.build);
ok('newest build first', JSON.stringify(builds) === JSON.stringify([2000, 1440, 1430, 1420]), JSON.stringify(builds));
const sameDay = releases.body.data.filter((r) => r.released_on === '2024-05-20').map((r) => r.version);
ok('two releases sharing a date still order deterministically', JSON.stringify(sameDay) === JSON.stringify(['1.4.3', '1.4.2']), JSON.stringify(sameDay));

console.log('\n== error bodies');
const missing = await api('/products/does-not-exist');
ok('an error carries a code, a message and the request id',
  missing.status === 404 && missing.body.code && missing.body.message && missing.body.request_id,
  JSON.stringify(missing.body));

async function countSessions() {
  const { pool } = await import('../server/db.js');
  const r = await pool.query('SELECT count(*)::int AS n FROM flash_session');
  return r.rows[0].n;
}

console.log(`\n${failures === 0 ? 'all rules hold' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

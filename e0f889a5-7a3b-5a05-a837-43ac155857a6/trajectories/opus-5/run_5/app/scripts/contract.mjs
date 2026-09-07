// Checks the guarantees that are easy to fake and hard to hold:
// concurrency, authorization, flash semantics, pagination and mail restraint.
const BASE = process.env.TEST_BASE || 'http://localhost:4180';

const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

function session() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async call(method, path, body, headers = {}) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const [k, v] = pair.split('=');
        const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map((s) => s.split('=')));
        if (v === '') delete jar[k]; else jar[k] = v;
        cookie = Object.entries(jar).map(([a, b]) => `${a}=${b}`).join('; ');
      }
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: res.status, json, text };
    },
  };
}

const PW = 'deku-demo-pw-2026';
async function signIn(email) {
  const s = session();
  const r = await s.call('POST', '/api/auth/login', { email, password: PW });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${r.text}`);
  return { s, token: r.json.access_token };
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// ------------------------------------------------------------------ auth
{
  const anon = session();
  const r = await anon.call('GET', '/api/account/devices');
  check('visitor cannot list cameras', r.status === 401, `status ${r.status}`);
  const r2 = await anon.call('POST', '/api/account/devices', { serial: 'VA2609KTMHX4' });
  check('visitor cannot register a serial', r2.status === 401, `status ${r2.status}`);
  const r3 = await anon.call('GET', '/api/account/orders');
  check('visitor cannot list orders', r3.status === 401, `status ${r3.status}`);
  check('error body carries a request_id', typeof r3.json?.request_id === 'string' && r3.json.request_id.length > 0);
  check('error body carries a machine code', typeof r3.json?.code === 'string');

  const bad = await anon.call('GET', '/api/account/devices', null, auth('not-a-real-token'));
  check('an absent or bogus token is rejected', bad.status === 401, `status ${bad.status}`);

  const dup = await anon.call('POST', '/api/auth/signup', {
    email: 'customer@example.com', password: 'another-password', name: 'Someone',
  });
  check('signup refuses a registered address', dup.status === 409, `status ${dup.status}`);
}

// ------------------------------------------------- the ownership boundary
const iris = await signIn('customer@example.com');
const rune = await signIn('customer2@example.com');

{
  // VA2609NRWB2Z belongs to customer2. Iris must not read or take it.
  const read = await iris.s.call('GET', '/api/account/devices/VA2609NRWB2Z', null, auth(iris.token));
  check("another customer's camera reads as not found", read.status === 404, `status ${read.status}`);

  const take = await iris.s.call('POST', '/api/account/devices', { serial: 'VA2609NRWB2Z' }, auth(iris.token));
  check('registering an owned camera is refused', take.status === 409, `status ${take.status}`);
  check('refusal names the right message', take.json?.message === 'That camera is registered to someone else.', take.json?.message);

  const rename = await iris.s.call('PATCH', '/api/account/devices/VA2609NRWB2Z', { nickname: 'mine now' }, auth(iris.token));
  check("cannot rename another customer's camera", rename.status === 404, `status ${rename.status}`);
  const release = await iris.s.call('DELETE', '/api/account/devices/VA2609NRWB2Z', null, auth(iris.token));
  check("cannot release another customer's camera", release.status === 404, `status ${release.status}`);

  const unknown = await iris.s.call('POST', '/api/account/devices', { serial: 'VC2699ZZZZZZ' }, auth(iris.token));
  check('an unknown serial is refused with the right words',
    unknown.json?.message === 'We do not recognise that serial number.', unknown.json?.message);

  const misshapen = await iris.s.call('POST', '/api/account/devices', { serial: 'NOTASERIAL1' }, auth(iris.token));
  check('a misshapen serial is refused before lookup', misshapen.status === 400, `status ${misshapen.status}`);

  const blocked = await iris.s.call('POST', '/api/account/devices', { serial: 'VC2609WJ3DKT' }, auth(iris.token));
  check('a blocked device is refused as blocked', blocked.json?.code === 'device_blocked', blocked.json?.code);
}

// --------------------------------- two simultaneous registrations of one serial
{
  const [a, b] = await Promise.all([
    iris.s.call('POST', '/api/account/devices', { serial: 'VA2609KTMHX4' }, auth(iris.token)),
    rune.s.call('POST', '/api/account/devices', { serial: 'VA2609KTMHX4' }, auth(rune.token)),
  ]);
  const wins = [a, b].filter((r) => r.status === 201).length;
  const losers = [a, b].filter((r) => r.status === 409);
  check('exactly one registration wins', wins === 1, `statuses ${a.status},${b.status}`);
  check('the loser gets a 409 naming the resource', losers.length === 1 && Boolean(losers[0].json?.code),
    losers[0]?.json?.code);

  // Release it again so the walkthrough can register it later.
  for (const who of [iris, rune]) {
    await who.s.call('DELETE', '/api/account/devices/VA2609KTMHX4', null, auth(who.token));
  }
}

// ------------------------------------------------------------ flash sessions
{
  // Wrong model: the A1 image (build 240) on a Cricket.
  const wrong = await iris.s.call('POST', '/api/flash-sessions', { serial: 'VC2609PVDA7Q', target_build: 240 });
  check('an image for another product is refused', wrong.status === 422, `status ${wrong.status}`);
  check('the refusal says which model it is for', /Vela A1/.test(wrong.json?.message ?? ''), wrong.json?.message);

  // Below min firmware: 6.11 needed, device reports 6.0.
  const below = await iris.s.call('POST', '/api/flash-sessions', {
    serial: 'VC2609PVDA7Q', target_build: 720, reported_version: '6.0',
  });
  check('an image above the reported version is refused', below.status === 422, `status ${below.status}`);
  check('no session row is written on refusal', below.json?.code === 'below_min_firmware', below.json?.code);

  // A real write: asked for 7.2, device reports 7.2.
  const started = await iris.s.call('POST', '/api/flash-sessions', { serial: 'VC2609PVDA7Q', target_build: 720 });
  check('a valid session starts', started.status === 201 && started.json?.state === 'started', `status ${started.status}`);

  // At most one session in started per device.
  const second = await iris.s.call('POST', '/api/flash-sessions', { serial: 'VC2609PVDA7Q', target_build: 720 });
  check('a second live session is refused', second.status === 409, `status ${second.status}`);

  // Completing records the version read back from the device, never the requested one.
  const done = await iris.s.call('POST', `/api/flash-sessions/${started.json.id}/complete`, { reported_version: '7.1' });
  check('the session records the reported version, not the requested one',
    done.json?.reported_version === '7.1' && done.json?.device_firmware_version === '7.1',
    `reported ${done.json?.reported_version} requested ${started.json?.target_version}`);

  // A failed session leaves the version as it was.
  const s2 = await iris.s.call('POST', '/api/flash-sessions', { serial: 'VC2609PVDA7Q', target_build: 720 });
  const failed = await iris.s.call('POST', `/api/flash-sessions/${s2.json.id}/fail`, { reason: 'cable pulled' });
  check('a failed session leaves the firmware as it was',
    failed.json?.device_firmware_version === '7.1', failed.json?.device_firmware_version);

  // Put the device back on 7.0 so the graded /doctor journey to 7.2 is real.
  const s3 = await iris.s.call('POST', '/api/flash-sessions', { serial: 'VC2609PVDA7Q', target_build: 700 });
  await iris.s.call('POST', `/api/flash-sessions/${s3.json.id}/complete`, { reported_version: '7.0' });
}

// ------------------------------------------------------------ pagination
{
  const anon = session();
  const capped = await anon.call('GET', '/api/releases?limit=500');
  check('a page size above the cap is refused', capped.status === 400, `status ${capped.status}`);
  check('the refusal names the cap', /100/.test(capped.json?.message ?? ''), capped.json?.message);

  const page = await anon.call('GET', '/api/releases?page_size=2');
  check('a list carries data, next_cursor and has_more',
    Array.isArray(page.json?.data) && 'next_cursor' in page.json && 'has_more' in page.json);
  check('the first page holds the page size', page.json?.data?.length === 2, `${page.json?.data?.length}`);
  check('releases order by build descending',
    page.json?.data?.[0]?.build === 2000 && page.json?.data?.[1]?.build === 1440,
    `${page.json?.data?.map((r) => r.build).join(',')}`);

  const next = await anon.call('GET', `/api/releases?page_size=2&cursor=${encodeURIComponent(page.json.next_cursor)}`);
  check('the cursor walks to the next page without repeating',
    next.json?.data?.[0]?.build === 1430 && next.json?.data?.[1]?.build === 1420,
    `${next.json?.data?.map((r) => r.build).join(',')}`);
  check('1.4.3 sorts above 1.4.2 despite the shared date',
    next.json?.data?.[0]?.version === '1.4.3' && next.json?.data?.[1]?.version === '1.4.2');
  check('has_more is false on the last page', next.json?.has_more === false, `${next.json?.has_more}`);
}

// ---------------------------------------- the last yellow A1, twice at once
{
  const a = session(), b = session();
  const address = {
    name: 'Race One', line1: '1 Test Street', city: 'Portland',
    region: 'OR', postal_code: '97209', country: 'US',
  };
  for (const [s, mail] of [[a, 'race-a@example.com'], [b, 'race-b@example.com']]) {
    await s.call('GET', '/api/cart');
    await s.call('POST', '/api/cart/lines', { sku: 'VELA-A1-YELLOW', quantity: 1 });
    await s.call('POST', '/api/cart/delivery', { email: mail, shipping_address: address, shipping_method: 'Standard' });
  }
  const [ra, rb] = await Promise.all([
    a.call('POST', '/api/orders', {}, { 'Idempotency-Key': `race-a-${Date.now()}` }),
    b.call('POST', '/api/orders', {}, { 'Idempotency-Key': `race-b-${Date.now()}` }),
  ]);
  const wins = [ra, rb].filter((r) => r.status === 201).length;
  const rejected = [ra, rb].filter((r) => r.status === 409);
  check('only one checkout takes the last yellow A1', wins === 1, `statuses ${ra.status},${rb.status}`);
  check('the loser is rejected with a 409', rejected.length === 1, rejected[0]?.json?.code);

  const stock = await session().call('GET', '/api/products/flagship');
  const yellow = stock.json?.variants?.find((v) => v.sku === 'VELA-A1-YELLOW');
  check('available never goes negative', yellow?.available >= 0, `available ${yellow?.available}`);
  check('the last unit is gone', yellow?.available === 0, `available ${yellow?.available}`);
}

// ------------------------------------------------- no mail short of confirmed
{
  const before = await (await fetch('http://mailpit:8025/api/v1/messages?limit=1')).json();
  const s = session();
  await s.call('GET', '/api/cart');
  await s.call('POST', '/api/cart/lines', { sku: 'VELA-CABLE-1M', quantity: 1 });
  await s.call('PATCH', '/api/cart/lines/1', { quantity: 2 }).catch(() => {});
  const iris2 = await signIn('customer@example.com');
  await iris2.s.call('POST', '/api/account/devices', { serial: 'VA2609KTMHX4' }, auth(iris2.token));
  await iris2.s.call('DELETE', '/api/account/devices/VA2609KTMHX4', null, auth(iris2.token));
  await new Promise((r) => setTimeout(r, 500));
  const after = await (await fetch('http://mailpit:8025/api/v1/messages?limit=1')).json();
  check('no mail follows a cart change, a registration or a release',
    after.messages_count === before.messages_count,
    `${before.messages_count} -> ${after.messages_count}`);
}

console.log('');
const failed = checks.filter((c) => !c.pass);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log('failures:');
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);

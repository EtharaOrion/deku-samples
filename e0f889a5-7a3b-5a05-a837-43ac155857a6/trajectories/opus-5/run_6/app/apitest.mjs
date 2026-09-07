const B = 'http://127.0.0.1:4173';
const PW = 'deku-demo-pw-2026';
let pass = 0;
let fail = 0;
const results = [];

function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    results.push(`  ok  ${name}`);
  } else {
    fail += 1;
    results.push(`FAIL  ${name}${detail ? ` :: ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

async function req(path, options = {}) {
  const res = await fetch(B + path, options);
  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

const json = (obj) => ({ 'Content-Type': 'application/json' });

async function main() {
  // ---- health, logs and request ids
  let r = await req('/api/health');
  check('health 200', r.status === 200, r.body);

  r = await req('/api/nope');
  check('unknown api route 404 with request_id', r.status === 404 && r.body.request_id && r.body.code === 'not_found', r.body);

  // ---- auth
  r = await req('/api/auth/login', { method: 'POST', headers: json(), body: JSON.stringify({ email: 'customer@example.com', password: PW }) });
  check('login works with seeded password', r.status === 200 && r.body.access_token, r.body);
  const token = r.body.access_token;
  const auth = { Authorization: `Bearer ${token}` };

  r = await req('/api/auth/login', { method: 'POST', headers: json(), body: JSON.stringify({ email: 'customer@example.com', password: 'wrong' }) });
  check('bad password rejected 401', r.status === 401 && r.body.request_id, r.body);

  r = await req('/api/auth/me', { headers: auth });
  check('me with bearer', r.status === 200 && r.body.customer.email === 'customer@example.com', r.body);

  r = await req('/api/auth/me');
  check('me without token 401', r.status === 401, r.body);

  r = await req('/api/auth/me', { headers: { Authorization: 'Bearer notatoken' } });
  check('me with bogus token 401', r.status === 401, r.body);

  r = await req('/api/auth/signup', { method: 'POST', headers: json(), body: JSON.stringify({ email: 'CUSTOMER@example.com', password: 'abcdefgh', name: 'Copy' }) });
  check('signup refuses a registered address (case-insensitive)', r.status === 409, r.body);

  // second customer
  r = await req('/api/auth/login', { method: 'POST', headers: json(), body: JSON.stringify({ email: 'customer2@example.com', password: PW }) });
  const token2 = r.body.access_token;
  const auth2 = { Authorization: `Bearer ${token2}` };
  check('second seeded account logs in', r.status === 200 && token2, r.body);

  // ---- catalogue
  r = await req('/api/products');
  check('products list has data/next_cursor/has_more', Array.isArray(r.body.data) && 'next_cursor' in r.body && 'has_more' in r.body, Object.keys(r.body));
  check('protection never listed', !r.body.data.some((p) => p.kind === 'protection'), r.body.data.map((p) => p.handle));
  check('catalogue order is editorial', r.body.data.map((p) => p.handle).join(',') === 'flagship,compact,mount,case,cable', r.body.data.map((p) => p.handle));

  r = await req('/api/products?page_size=500');
  check('page_size above cap refused naming the cap', r.status === 400 && /100/.test(r.body.message), r.body);
  r = await req('/api/products?limit=500');
  check('limit=500 as a page size refused naming the cap', r.status === 400 && /100/.test(r.body.message), r.body);

  r = await req('/api/products?page_size=2');
  check('page_size honoured', r.body.data.length === 2 && r.body.has_more === true && r.body.next_cursor, r.body);
  const c1 = r.body.next_cursor;
  const firstPage = r.body.data.map((p) => p.handle);
  r = await req(`/api/products?page_size=2&cursor=${encodeURIComponent(c1)}`);
  check('keyset cursor continues without repeats', !r.body.data.some((p) => firstPage.includes(p.handle)), r.body.data.map((p) => p.handle));

  r = await req('/api/products/flagship');
  check('product has blocks and variants with sku/price/available', r.body.blocks.length > 0 && r.body.variants[0].sku && 'available' in r.body.variants[0], Object.keys(r.body));
  const graphite = r.body.variants.find((v) => v.sku === 'VELA-A1-GRAPHITE');
  check('VELA-A1-GRAPHITE has 4 available (Only 4 left)', graphite.available === 4 && graphite.availability === 'low', graphite);

  r = await req('/api/products/compact');
  const yellow = r.body.variants.find((v) => v.sku === 'VELA-CRICKET-YELLOW');
  check('VELA-CRICKET-YELLOW is the sold out variant', yellow.available === 0 && yellow.availability === 'sold_out', yellow);

  r = await req('/api/products/mount');
  check('mount is discontinued with support date', r.body.status === 'discontinued' && r.body.support_until === '2029-09-01', r.body.support_until);

  r = await req('/api/products/nosuchthing');
  check('unknown product 404', r.status === 404, r.body);

  // ---- cart, price notice, protection
  let cartToken = null;
  const cartHeaders = () => (cartToken ? { 'X-Cart-Token': cartToken, ...json() } : json());

  r = await req('/api/cart/lines', { method: 'POST', headers: cartHeaders(), body: JSON.stringify({ sku: 'VELA-CASE-STD', quantity: 1 }) });
  cartToken = r.body.token;
  check('add to cart snapshots the price', r.body.lines[0].unit_price_minor === 7900, r.body.lines);

  r = await req('/api/cart/protection', { method: 'POST', headers: cartHeaders(), body: JSON.stringify({ enabled: true }) });
  check('protection rung 1 for 7900 subtotal', r.body.protection_rung.sku === 'VELA-PROTECT-1' && r.body.lines.some((l) => l.sku === 'VELA-PROTECT-1'), r.body.protection_rung);
  check('protection excluded from tax', r.body.tax_minor === 790, { tax: r.body.tax_minor, subtotal: r.body.subtotal_minor });

  r = await req('/api/cart/lines', { method: 'POST', headers: cartHeaders(), body: JSON.stringify({ sku: 'VELA-A1-GRAPHITE', quantity: 1 }) });
  check('protection rung follows the cart up', r.body.protection_rung.sku === 'VELA-PROTECT-3' && r.body.lines.some((l) => l.sku === 'VELA-PROTECT-3'), r.body.protection_rung);

  r = await req('/api/cart/protection', { method: 'POST', headers: cartHeaders(), body: JSON.stringify({ enabled: false }) });
  check('protection can be turned off', !r.body.protection_enabled, r.body.protection_enabled);

  r = await req('/api/cart/lines', { method: 'POST', headers: cartHeaders(), body: JSON.stringify({ sku: 'VELA-CRICKET-YELLOW', quantity: 1 }) });
  check('sold out variant refused', r.status === 400 && r.body.code === 'sold_out', r.body);

  r = await req('/api/cart/lines', { method: 'POST', headers: cartHeaders(), body: JSON.stringify({ sku: 'VELA-MOUNT-CLAMP', quantity: 1 }) });
  check('discontinued product refused', r.status === 400, r.body);

  r = await req('/api/cart/lines', { method: 'POST', headers: cartHeaders(), body: JSON.stringify({ sku: 'VELA-PROTECT-2', quantity: 1 }) });
  check('protection not addable as a normal line', r.status === 400, r.body);

  // price change notice
  const { Client } = await import('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("UPDATE variant SET price_minor = 8400 WHERE sku = 'VELA-CASE-STD'");
  r = await req('/api/cart', { headers: cartHeaders() });
  const notice = r.body.notices.find((n) => n.code === 'price_changed');
  check(
    'price change renders the exact notice',
    notice && notice.message === 'The price of Travel Case changed from $79.00 to $84.00 since you added it.',
    notice,
  );

  // placing an order with a changed line is refused
  await req('/api/cart/delivery', {
    method: 'POST',
    headers: cartHeaders(),
    body: JSON.stringify({
      email: 'guest@example.com',
      shipping_address: { name: 'G', line1: '1 A St', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' },
      shipping_method: 'standard',
    }),
  });
  r = await req('/api/orders', { method: 'POST', headers: { ...cartHeaders(), 'Idempotency-Key': `t-${Date.now()}` } });
  check('order refused when a line changed price', r.status === 409 && r.body.code === 'price_changed', r.body);
  await db.query("UPDATE variant SET price_minor = 7900 WHERE sku = 'VELA-CASE-STD'");

  // ---- concurrent checkouts for the last VELA-A1-YELLOW
  const makeCart = async (sku) => {
    const res = await req('/api/cart/lines', { method: 'POST', headers: json(), body: JSON.stringify({ sku, quantity: 1 }) });
    const t = res.body.token;
    await req('/api/cart/delivery', {
      method: 'POST',
      headers: { 'X-Cart-Token': t, ...json() },
      body: JSON.stringify({
        email: 'race@example.com',
        shipping_address: { name: 'R', line1: '2 B St', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' },
        shipping_method: 'standard',
      }),
    });
    return t;
  };
  const ta = await makeCart('VELA-A1-YELLOW');
  const tb = await makeCart('VELA-A1-YELLOW');
  const [ra, rb] = await Promise.all([
    req('/api/orders', { method: 'POST', headers: { 'X-Cart-Token': ta, 'Idempotency-Key': `race-a-${Date.now()}`, ...json() } }),
    req('/api/orders', { method: 'POST', headers: { 'X-Cart-Token': tb, 'Idempotency-Key': `race-b-${Date.now()}`, ...json() } }),
  ]);
  const statuses = [ra.status, rb.status].sort();
  check('one of two racing checkouts for the last unit wins', statuses[0] === 201 && statuses[1] === 409, { a: ra.status, b: rb.status, ab: ra.body, bb: rb.body });
  const loser = ra.status === 409 ? ra : rb;
  check('the loser names the resource', /YELLOW/.test(JSON.stringify(loser.body)), loser.body);
  const inv = await db.query("SELECT available, committed FROM inventory_level i JOIN variant v ON v.id=i.variant_id WHERE v.sku='VELA-A1-YELLOW'");
  check('available never negative, committed rose by one', inv.rows[0].available === 0 && inv.rows[0].committed === 1, inv.rows[0]);
  const kbCount = await db.query("SELECT count(*) FROM \"order\" WHERE email='race@example.com' AND status='confirmed'");
  check('exactly one confirmed order from the race', Number(kbCount.rows[0].count) === 1, kbCount.rows[0]);

  // ---- guest order journey and access token
  const gt = await (async () => {
    let res = await req('/api/cart/lines', { method: 'POST', headers: json(), body: JSON.stringify({ sku: 'VELA-CRICKET-GRAPHITE', quantity: 1 }) });
    const t = res.body.token;
    await req('/api/cart/lines', { method: 'POST', headers: { 'X-Cart-Token': t, ...json() }, body: JSON.stringify({ sku: 'VELA-CASE-STD', quantity: 1 }) });
    await req('/api/cart/delivery', {
      method: 'POST',
      headers: { 'X-Cart-Token': t, ...json() },
      body: JSON.stringify({
        email: 'GUEST@Example.com',
        shipping_address: { name: 'Guest', line1: '9 C St', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' },
        shipping_method: 'express',
      }),
    });
    return t;
  })();
  r = await req('/api/cart', { headers: { 'X-Cart-Token': gt } });
  check('express shipping in totals', r.body.shipping_minor === 2500 && r.body.tax_minor === 3780 && r.body.total_minor === 37800 + 2500 + 3780, r.body);

  const key = `guest-${Date.now()}`;
  r = await req('/api/orders', { method: 'POST', headers: { 'X-Cart-Token': gt, 'Idempotency-Key': key, ...json() } });
  check('guest order created', r.status === 201 && r.body.number && r.body.access_token, r.body);
  const guestOrder = r.body;
  check('order email lowercased for the billing key', guestOrder.killbill_external_key === 'guest@example.com', guestOrder.killbill_external_key);
  check('invoice amount matches the total', guestOrder.killbill_invoice_amount === '415.80'.replace('415.80', String((guestOrder.total_minor / 100).toFixed(2))), guestOrder.killbill_invoice_amount);
  check(
    'total equals lines + shipping + tax - discount',
    guestOrder.total_minor === guestOrder.lines.reduce((s, l) => s + l.total_minor, 0) + guestOrder.shipping_minor + guestOrder.tax_minor - guestOrder.discount_minor,
    guestOrder,
  );

  r = await req(`/api/orders/${guestOrder.number}?access_token=${guestOrder.access_token}`);
  check('order readable by access token', r.status === 200 && r.body.number === guestOrder.number, r.body);
  r = await req(`/api/orders/${guestOrder.number}`);
  check('order not readable without the token', r.status === 404, r.body);
  r = await req(`/api/orders/${guestOrder.number}`, { headers: auth });
  check("another party's order reads as not found", r.status === 404, r.body);

  // idempotent replay
  const r2 = await req('/api/orders', { method: 'POST', headers: { 'X-Cart-Token': gt, 'Idempotency-Key': key, ...json() } });
  check('replayed key returns the same order', r2.body.number === guestOrder.number, r2.body);
  const cnt = await db.query("SELECT count(*) FROM \"order\" WHERE email='guest@example.com'");
  check('no second order row from the replay', Number(cnt.rows[0].count) === 1, cnt.rows[0]);

  // ---- account lists
  r = await req('/api/account/orders', { headers: auth });
  check('account orders paginated shape', Array.isArray(r.body.data) && 'next_cursor' in r.body && 'has_more' in r.body, Object.keys(r.body));
  check('customer sees their seeded order', r.body.data.some((o) => o.number === 'VE-2026-0001'), r.body.data.map((o) => o.number));

  r = await req('/api/account/orders');
  check('visitor cannot list orders', r.status === 401, r.body);

  r = await req('/api/account/devices', { headers: auth });
  check('devices list shape', r.body.data[0] && 'serial' in r.body.data[0] && 'update_available' in r.body.data[0], r.body.data[0]);
  const own = r.body.data.find((d) => d.serial === 'VC2609PVDA7Q');
  check('seeded camera shows update available (7.0 -> 7.2)', own && own.update_available === true && own.firmware_version === '7.0', own);

  r = await req('/api/account/devices');
  check('visitor cannot list cameras', r.status === 401, r.body);

  // ---- device registration
  r = await req('/api/account/devices', { method: 'POST', headers: json(), body: JSON.stringify({ serial: 'VA2609KTMHX4' }) });
  check('visitor cannot register a serial', r.status === 401, r.body);

  r = await req('/api/account/devices', { method: 'POST', headers: { ...auth, ...json() }, body: JSON.stringify({ serial: 'VA2609NRWB2Z' }) });
  check("another customer's camera refused with the exact words", r.status === 409 && r.body.message === 'That camera is registered to someone else.', r.body);
  let rows = await db.query('SELECT count(*) FROM device_ownership WHERE released_at IS NULL');
  const ownershipBefore = Number(rows.rows[0].count);

  r = await req('/api/account/devices', { method: 'POST', headers: { ...auth, ...json() }, body: JSON.stringify({ serial: 'VC2609WJ3DKT' }) });
  check('blocked device refused as blocked', r.status === 422 && /blocked/i.test(r.body.message), r.body);

  r = await req('/api/account/devices', { method: 'POST', headers: { ...auth, ...json() }, body: JSON.stringify({ serial: 'VC2609ZZZZZZ' }) });
  check('unknown serial refused with the exact words', r.body.message === 'We do not recognise that serial number.', r.body);

  r = await req('/api/account/devices', { method: 'POST', headers: { ...auth, ...json() }, body: JSON.stringify({ serial: 'VC26O9PVDA7Q' }) });
  check('serial with a forbidden character refused before lookup', r.status === 400 && r.body.code === 'invalid_serial', r.body);

  rows = await db.query('SELECT count(*) FROM device_ownership WHERE released_at IS NULL');
  check('refusals wrote no ownership row', Number(rows.rows[0].count) === ownershipBefore, rows.rows[0]);

  // concurrent registration of one free serial
  const [x, y] = await Promise.all([
    req('/api/account/devices', { method: 'POST', headers: { ...auth, ...json() }, body: JSON.stringify({ serial: 'VA2609KTMHX4' }) }),
    req('/api/account/devices', { method: 'POST', headers: { ...auth2, ...json() }, body: JSON.stringify({ serial: 'VA2609KTMHX4' }) }),
  ]);
  const regStatuses = [x.status, y.status].sort();
  check('two simultaneous registrations: one wins, one refused', regStatuses[0] === 201 && regStatuses[1] === 409, { x: x.status, y: y.status, xb: x.body, yb: y.body });
  rows = await db.query(
    "SELECT count(*) FROM device_ownership o JOIN device d ON d.id=o.device_id WHERE d.serial='VA2609KTMHX4' AND o.released_at IS NULL",
  );
  check('exactly one live ownership row', Number(rows.rows[0].count) === 1, rows.rows[0]);

  const winnerAuth = x.status === 201 ? auth : auth2;
  const loserAuth = x.status === 201 ? auth2 : auth;

  r = await req('/api/account/devices/VA2609KTMHX4', { headers: loserAuth });
  check("the loser cannot read the camera (not found, not forbidden)", r.status === 404, r.body);
  r = await req('/api/account/devices/VA2609KTMHX4', { method: 'PATCH', headers: { ...loserAuth, ...json() }, body: JSON.stringify({ nickname: 'mine now' }) });
  check('the loser cannot rename it', r.status === 404, r.body);
  r = await req('/api/account/devices/VA2609KTMHX4', { method: 'DELETE', headers: loserAuth });
  check('the loser cannot release it', r.status === 404, r.body);
  rows = await db.query("SELECT nickname FROM device WHERE serial='VA2609KTMHX4'");
  check('state unchanged by the refusals', rows.rows[0].nickname === null, rows.rows[0]);

  r = await req('/api/account/devices/VA2609KTMHX4', { method: 'PATCH', headers: { ...winnerAuth, ...json() }, body: JSON.stringify({ nickname: 'Studio body' }) });
  check('owner can rename', r.status === 200 && r.body.nickname === 'Studio body', r.body);

  r = await req('/api/account/devices/VA2609KTMHX4', { method: 'DELETE', headers: winnerAuth });
  check('owner can release', r.status === 200, r.body);
  rows = await db.query(
    "SELECT count(*) FROM device_ownership o JOIN device d ON d.id=o.device_id WHERE d.serial='VA2609KTMHX4' AND o.released_at IS NULL",
  );
  check('release grants it to nobody', Number(rows.rows[0].count) === 0, rows.rows[0]);

  // ---- releases
  r = await req('/api/releases');
  check('releases newest build first, date is not the sort key', r.body.data.map((x) => x.version).join(',') === '2.0.0,1.4.4,1.4.3,1.4.2', r.body.data.map((x) => x.version));
  check('release notes carry only the four groups', Object.keys(r.body.data[0].notes).every((k) => ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'].includes(k)), Object.keys(r.body.data[0].notes));
  check('digest is 64 lowercase hex', /^[0-9a-f]{64}$/.test(r.body.data[0].sha256), r.body.data[0].sha256);
  r = await req('/api/releases/1.4.3');
  check('one release by version', r.status === 200 && r.body.build === 1430, r.body);

  // ---- firmware manifest
  r = await req('/api/firmware/manifest?model=compact');
  check('manifest for one product with the required fields', r.body.entries.every((e) => 'version' in e && 'build' in e && 'channel' in e && 'min_firmware' in e && 'min_app_version' in e && 'size_bytes' in e && 'sha256' in e), r.body.entries[0]);
  check('manifest carries generated_at and product', Boolean(r.body.generated_at && r.body.product), Object.keys(r.body));
  check('only general channel offered by default', r.body.entries.every((e) => e.channel === 'general'), r.body.entries.map((e) => e.channel));

  // ---- flash sessions
  r = await req('/api/flash-sessions', { method: 'POST', headers: json(), body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 240 }) });
  check('image for another product refused', r.status === 422 && r.body.code === 'wrong_model', r.body);
  let sess = await db.query('SELECT count(*) FROM flash_session');
  check('refusal wrote no session row', Number(sess.rows[0].count) === 0, sess.rows[0]);

  // below min firmware: A1 device VA2609NRWB2Z runs 2.4, image 2.4 needs 2.0 -> allowed. Make a below case:
  await db.query("UPDATE device SET firmware_version='6.10' WHERE serial='VC2609PVDA7Q'");
  r = await req('/api/flash-sessions', { method: 'POST', headers: json(), body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 720 }) });
  check('image below min_firmware refused', r.status === 422 && r.body.code === 'below_min_firmware', r.body);
  let fw = await db.query("SELECT firmware_version FROM device WHERE serial='VC2609PVDA7Q'");
  check('refusal left the firmware untouched', fw.rows[0].firmware_version === '6.10', fw.rows[0]);
  await db.query("UPDATE device SET firmware_version='7.0' WHERE serial='VC2609PVDA7Q'");

  r = await req('/api/flash-sessions', { method: 'POST', headers: json(), body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 720 }) });
  check('session starts', r.status === 201 && r.body.state === 'started', r.body);
  const sessionId = r.body.id;

  const dup = await req('/api/flash-sessions', { method: 'POST', headers: json(), body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 700 }) });
  check('at most one started session per device', dup.status === 409, dup.body);

  r = await req(`/api/flash-sessions/${sessionId}/complete`, { method: 'POST', headers: json(), body: JSON.stringify({ reported_version: '7.1' }) });
  check('completion records what the device reported, not what was asked', r.body.reported_version === '7.1' && r.body.device.firmware_version === '7.1', r.body);

  // failure leaves the version alone
  r = await req('/api/flash-sessions', { method: 'POST', headers: json(), body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 720 }) });
  const failing = r.body.id;
  r = await req(`/api/flash-sessions/${failing}/fail`, { method: 'POST', headers: json(), body: JSON.stringify({ reason: 'cable pulled' }) });
  check('failed session recorded', r.body.state === 'failed', r.body);
  fw = await db.query("SELECT firmware_version FROM device WHERE serial='VC2609PVDA7Q'");
  check('failed session left the version as it was', fw.rows[0].firmware_version === '7.1', fw.rows[0]);
  await db.query("UPDATE device SET firmware_version='7.0' WHERE serial='VC2609PVDA7Q'");

  // ---- no mail for anything but a confirmed order
  const mail = await (await fetch('http://mailpit:8025/api/v1/messages?limit=200')).json();
  const subjects = mail.messages.map((m) => m.Subject);
  check('every mail is an order confirmation', subjects.every((s) => s.startsWith('Order confirmed: ')), subjects);
  const guestMails = mail.messages.filter((m) => m.To.some((t) => t.Address === 'guest@example.com'));
  check('exactly one mail for the guest order', guestMails.length === 1, subjects);
  check('mail has no cc and no bcc, one recipient', guestMails.every((m) => m.To.length === 1 && (!m.Cc || m.Cc.length === 0) && (!m.Bcc || m.Bcc.length === 0)), guestMails[0]);
  const detail = await (await fetch(`http://mailpit:8025/api/v1/message/${guestMails[0].ID}`)).json();
  check('mail subject is the order number', detail.Subject === `Order confirmed: ${guestOrder.number}`, detail.Subject);
  check('mail body names lines, quantities and the total', /Vela Cricket/.test(detail.Text) && /x1/.test(detail.Text) && /Total \$440\.80/.test(detail.Text), detail.Text.slice(0, 400));

  await db.end();

  results.push('', `pass ${pass}, fail ${fail}`);
  console.log(results.join('\n'));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.log(results.join('\n'));
  console.error('HARNESS ERROR', e);
  process.exit(2);
});

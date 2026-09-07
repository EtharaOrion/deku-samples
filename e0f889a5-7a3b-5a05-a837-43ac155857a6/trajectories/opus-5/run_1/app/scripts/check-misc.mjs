// The remaining contract details: order access by token, the protection rungs,
// expired tokens, quantity bounds, and the manifest's channel rule.
import { pool } from '../server/db.js';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
let failures = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? ' ' : '!'} ${name}${detail ? `  ${detail}` : ''}`);
};

const session = () => {
  const jar = [];
  return async (path, opts = {}) => {
    const res = await fetch(`${BASE}/api${path}`, {
      ...opts, headers: { ...(opts.headers || {}), cookie: jar.join('; ') },
    });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const pair = c.split(';')[0];
      const name = pair.split('=')[0];
      const i = jar.findIndex((j) => j.startsWith(`${name}=`));
      if (i >= 0) jar[i] = pair; else jar.push(pair);
    }
    let body = null;
    try { body = await res.json(); } catch { /* none */ }
    return { status: res.status, body };
  };
};

console.log('== the shipment protection rungs');
const rungCases = [
  ['VELA-CABLE-1M', 1, 1900, 98],       // 1..9999
  ['VELA-CASE-STD', 1, 7900, 98],
  ['VELA-CRICKET-GRAPHITE', 1, 29900, 298], // 10000..49999
  ['VELA-A1-GRAPHITE', 1, 89900, 598],  // 50000..99999
  ['VELA-A1-GRAPHITE', 2, 179800, 1198], // 100000+
];
for (const [sku, qty, subtotal, price] of rungCases) {
  const call = session();
  await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku, quantity: qty }),
  });
  const cart = await call('/cart');
  ok(`a subtotal of ${subtotal} chooses the ${price} rung`,
    cart.body.subtotal_minor === subtotal && cart.body.protection_rung?.price_minor === price,
    `subtotal ${cart.body.subtotal_minor}, rung ${cart.body.protection_rung?.price_minor}`);
  ok('  and the toggle is unticked by default', cart.body.protection_enabled === false);
}

console.log('\n== protection is excluded from tax');
{
  const call = session();
  await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-CRICKET-GRAPHITE', quantity: 1 }),
  });
  const before = await call('/cart');
  const on = await call('/cart/protection', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  ok('the tax does not move when protection is added',
    on.body.tax_minor === before.body.tax_minor, `${before.body.tax_minor} then ${on.body.tax_minor}`);
  ok('but the total rises by exactly the rung',
    on.body.total_minor === before.body.total_minor + on.body.protection_minor,
    `${before.body.total_minor} + ${on.body.protection_minor} vs ${on.body.total_minor}`);
  ok('and the label reads with the rung price',
    on.body.protection_rung.label === 'Protect this shipment against loss, theft and damage for $2.98',
    JSON.stringify(on.body.protection_rung.label));
}

console.log('\n== quantity bounds');
{
  const call = session();
  const tooMany = await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-CABLE-1M', quantity: 11 }),
  });
  ok('a quantity above ten is refused', tooMany.status === 400, `status ${tooMany.status}`);
  const zero = await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-CABLE-1M', quantity: 0 }),
  });
  ok('a quantity below one is refused', zero.status === 400, `status ${zero.status}`);
  const soldOut = await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-CRICKET-YELLOW', quantity: 1 }),
  });
  ok('a sold-out variant cannot be added', soldOut.status === 409, `status ${soldOut.status}`);
  const gone = await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-MOUNT-CLAMP', quantity: 1 }),
  });
  ok('a discontinued product cannot be added', gone.status === 409, `status ${gone.status}`);
  const protection = await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-PROTECT-2', quantity: 1 }),
  });
  ok('protection is not addable as an item', protection.status === 400, `status ${protection.status}`);
}

console.log('\n== an order read by its access token');
{
  const call = session();
  await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-CABLE-2M', quantity: 1 }),
  });
  await call('/cart/delivery', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'token-test@example.com',
      shipping_address: { name: 'T', line1: '1 Road', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' },
      shipping_method: 'express',
    }),
  });
  const placed = await call('/orders', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  ok('the order is placed', placed.status === 201, `status ${placed.status}`);
  const token = placed.body.access_token;
  ok('and returns an access token', Boolean(token));

  // Express delivery is 2500 and tax excludes shipping.
  ok('express delivery costs 2500', placed.body.shipping_minor === 2500, String(placed.body.shipping_minor));
  ok('tax is ten percent of the line subtotal only',
    placed.body.tax_minor === 240, String(placed.body.tax_minor));

  // A visitor with no cookies reads it by token alone.
  const stranger = await fetch(`${BASE}/api/orders/${placed.body.number}?access_token=${encodeURIComponent(token)}`);
  ok('a visitor reads it with the token', stranger.status === 200, `status ${stranger.status}`);

  const withoutToken = await fetch(`${BASE}/api/orders/${placed.body.number}`);
  ok('and cannot without one', withoutToken.status === 404, `status ${withoutToken.status}`);

  const wrongToken = await fetch(`${BASE}/api/orders/${placed.body.number}?access_token=nonsense`);
  ok('a wrong token reads as not found', wrongToken.status === 404, `status ${wrongToken.status}`);
}

console.log('\n== an expired token');
{
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'customer@example.com', password: 'deku-demo-pw-2026' }),
  });
  const { access_token: token } = await login.json();
  const before = await fetch(`${BASE}/api/account/devices`, { headers: { authorization: `Bearer ${token}` } });
  ok('the fresh token works', before.status === 200);

  const ownedBefore = await pool.query(
    `SELECT count(*)::int AS n FROM device_ownership o JOIN device d ON d.id = o.device_id
     WHERE d.serial = 'VA2609KTMHX4' AND o.released_at IS NULL`,
  );

  const { sha256hex } = await import('../server/lib/crypto.js');
  await pool.query(`UPDATE auth_token SET expires_at = now() - interval '1 hour' WHERE token_hash = $1`, [sha256hex(token)]);

  const after = await fetch(`${BASE}/api/account/devices`, { headers: { authorization: `Bearer ${token}` } });
  ok('an expired token is refused', after.status === 401, `status ${after.status}`);

  const mutation = await fetch(`${BASE}/api/account/devices`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ serial: 'VA2609KTMHX4' }),
  });
  ok('and mutates nothing', mutation.status === 401, `status ${mutation.status}`);
  const owned = await pool.query(
    `SELECT count(*)::int AS n FROM device_ownership o JOIN device d ON d.id = o.device_id
     WHERE d.serial = 'VA2609KTMHX4' AND o.released_at IS NULL`,
  );
  ok('the ownership rows are unchanged',
    owned.rows[0].n === ownedBefore.rows[0].n, `${ownedBefore.rows[0].n} then ${owned.rows[0].n}`);
}

console.log('\n== the manifest never offers a closed channel');
{
  // Put a beta image in the catalogue, then check it is not offered.
  const product = await pool.query(`SELECT id FROM product WHERE handle = 'compact'`);
  await pool.query(
    `INSERT INTO firmware (product_id, version, build, min_firmware, min_app_version, channel, size_bytes, sha256, released_on)
     VALUES ($1,'7.3',730,'6.11','1.4.0','beta',41300000,'f1e2d3c4b5a6978869504132231405f6e7d8c9b0a1928374655647382910abcd','2025-01-05')
     ON CONFLICT (product_id, build) DO UPDATE SET channel = 'beta'`,
    [product.rows[0].id],
  );
  try {
    const plain = await fetch(`${BASE}/api/firmware/manifest?model=compact`).then((r) => r.json());
    ok('a beta image is not offered to a device that has not opted in',
      !plain.entries.some((e) => e.version === '7.3'),
      JSON.stringify(plain.entries.map((e) => e.version)));

    const opted = await fetch(`${BASE}/api/firmware/manifest?model=compact&channels=beta`).then((r) => r.json());
    ok('and is offered once it has', opted.entries.some((e) => e.version === '7.3'),
      JSON.stringify(opted.entries.map((e) => e.version)));

    // A session for a channel the device has not opted into is refused.
    const refused = await fetch(`${BASE}/api/flash-sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serial: 'VC2609PVDA7Q', target_build: 730 }),
    });
    ok('and a flash session for it is refused', refused.status === 422, `status ${refused.status}`);
  } finally {
    await pool.query(`DELETE FROM firmware WHERE build = 730`);
  }
}

await pool.end();
console.log(`\n${failures === 0 ? 'the remaining rules hold' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

// A cart line stores the unit price at add time. Every cart read compares it to
// the current price and renders a notice. Placing an order re-prices every line
// and refuses if a line changed since the cart was last shown.
import { pool } from '../server/db.js';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
let failures = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? ' ' : '!'} ${name}${detail ? `  ${detail}` : ''}`);
};

const jar = [];
const call = async (path, opts = {}) => {
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

const setPrice = (sku, minor) =>
  pool.query('UPDATE variant SET price_minor = $2 WHERE sku = $1', [sku, minor]);

const ORIGINAL = 7900;
try {
  await setPrice('VELA-CASE-STD', ORIGINAL);

  console.log('== add a Travel Case at $79.00, then change the price');
  await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-CASE-STD', quantity: 1 }),
  });
  await call('/cart'); // the cart has now been shown at 7900
  await setPrice('VELA-CASE-STD', 8400);

  const changed = await call('/cart');
  const notice = changed.body.notices.find((n) => n.kind === 'price_change');
  ok('the cart read carries a price notice', Boolean(notice));
  ok(
    'the notice names the item, the old price and the new',
    notice?.message === 'The price of Travel Case changed from $79.00 to $84.00 since you added it.',
    JSON.stringify(notice?.message),
  );
  ok('and the line still holds the price it was added at',
    changed.body.lines[0].unit_price_minor === ORIGINAL, String(changed.body.lines[0].unit_price_minor));

  const seen = await pool.query(`SELECT count(*)::int AS n FROM "order" WHERE email = 'reprice@example.com'`);
  const ordersBefore = seen.rows[0].n;

  console.log('\n== place the order with a line that changed since it was shown');
  await call('/cart/delivery', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'reprice@example.com',
      shipping_address: { name: 'R', line1: '1 Road', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' },
      shipping_method: 'standard',
    }),
  });

  // Change the price again, after the last cart read.
  await setPrice('VELA-CASE-STD', 9100);
  const refused = await call('/orders', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  ok('the order is refused', refused.status === 409, `status ${refused.status}`);
  ok('with a code the interface can act on', refused.body?.code === 'price_changed', refused.body?.code);

  const afterRefusal = await pool.query(`SELECT count(*)::int AS n FROM "order" WHERE email = 'reprice@example.com'`);
  ok('and no order was written by the refusal', afterRefusal.rows[0].n === ordersBefore, `${afterRefusal.rows[0].n} vs ${ordersBefore}`);

  const repriced = await call('/cart');
  const after = repriced.body.notices.find((n) => n.kind === 'price_change');
  ok('the re-priced cart carries the notice', Boolean(after), JSON.stringify(after?.message));

  console.log('\n== placing again, now that the cart has been seen at the new price');
  const accepted = await call('/orders', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  ok('the order goes through', accepted.status === 201, `status ${accepted.status}`);
  ok('at the current price, not the one snapshotted',
    accepted.body?.lines?.[0]?.unit_price_minor === 9100, String(accepted.body?.lines?.[0]?.unit_price_minor));

  // The total equals the sum of its lines plus shipping plus tax minus discount.
  const o = accepted.body;
  const lineSum = o.lines.reduce((s, l) => s + l.total_minor, 0);
  ok('the total equals lines + shipping + tax − discount',
    o.total_minor === lineSum + o.shipping_minor + o.tax_minor - o.discount_minor,
    `${lineSum} + ${o.shipping_minor} + ${o.tax_minor} - ${o.discount_minor} vs ${o.total_minor}`);
} finally {
  await setPrice('VELA-CASE-STD', ORIGINAL);
  await pool.end();
}

console.log(`\n${failures === 0 ? 'the re-pricing rules hold' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

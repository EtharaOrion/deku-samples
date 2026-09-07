// Two concurrent checkouts for the last VELA-A1-YELLOW must not both succeed:
// one wins, the other is rejected before any invoice exists, and available
// never goes negative.
import { pool } from '../server/db.js';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';

const stockOf = async (sku) => {
  const r = await pool.query(
    'SELECT i.available, i.committed FROM inventory_level i JOIN variant v ON v.id = i.variant_id WHERE v.sku = $1',
    [sku],
  );
  return r.rows[0];
};

const invoiceCount = async () => {
  const url = new URL(`${process.env.PAYMENTS_API_URL}/1.0/kb/invoices/pagination`);
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYMENTS_ADMIN_USER}:${process.env.PAYMENTS_ADMIN_PASSWORD}`).toString('base64')}`,
      'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY,
      'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET,
    },
  });
  const rows = await res.json();
  return rows.filter((i) => i.status !== 'VOID').length;
};

// One shopper: a fresh cart, the last yellow A1, an address and a method.
async function shopper(label) {
  const jar = [];
  const call = async (path, opts = {}) => {
    const res = await fetch(`${BASE}/api${path}`, {
      ...opts,
      headers: { ...(opts.headers || {}), cookie: jar.join('; ') },
    });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookie) {
      const pair = c.split(';')[0];
      const name = pair.split('=')[0];
      const idx = jar.findIndex((j) => j.startsWith(`${name}=`));
      if (idx >= 0) jar[idx] = pair; else jar.push(pair);
    }
    let body = null;
    try { body = await res.json(); } catch { /* no body */ }
    return { status: res.status, body };
  };

  await call('/cart/lines', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'VELA-A1-YELLOW', quantity: 1 }),
  });
  await call('/cart/delivery', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `race-${label}@example.com`,
      shipping_address: { name: `Racer ${label}`, line1: '1 Test Road', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' },
      shipping_method: 'standard',
    }),
  });
  return { label, place: () => call('/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }) };
}

const before = await stockOf('VELA-A1-YELLOW');
const invoicesBefore = await invoiceCount();
console.log('before:', before, 'invoices:', invoicesBefore);

const a = await shopper('a');
const b = await shopper('b');

// Both submit at the same moment.
const [ra, rb] = await Promise.all([a.place(), b.place()]);
console.log('a:', ra.status, ra.body?.number || ra.body?.code);
console.log('b:', rb.status, rb.body?.number || rb.body?.code);

const after = await stockOf('VELA-A1-YELLOW');
const invoicesAfter = await invoiceCount();
console.log('after:', after, 'invoices:', invoicesAfter);

const wins = [ra, rb].filter((r) => r.status === 201).length;
const refusals = [ra, rb].filter((r) => r.status === 409).length;

let bad = 0;
const ok = (name, cond, detail = '') => { if (!cond) bad++; console.log(`${cond ? ' ' : '!'} ${name}${detail ? `  ${detail}` : ''}`); };

ok('exactly one checkout wins', wins === 1, `wins ${wins}`);
ok('the other is refused with a conflict', refusals === 1, `refusals ${refusals}`);
ok('available never goes negative', Number(after.available) >= 0, `available ${after.available}`);
ok('available fell by exactly one', Number(after.available) === Number(before.available) - 1);
ok('committed rose by exactly one', Number(after.committed) === Number(before.committed) + 1);
ok('exactly one invoice was raised', invoicesAfter === invoicesBefore + 1, `${invoicesBefore} then ${invoicesAfter}`);

const loser = ra.status === 409 ? ra : rb;
ok('the refusal names the resource that was taken', /VELA-A1-YELLOW/.test(JSON.stringify(loser.body)), JSON.stringify(loser.body?.message));

await pool.end();
console.log(bad === 0 ? '\nthe single-winner rule holds' : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);

// Submitting the same order twice produces one order, one invoice and one mail.
// Everything is counted in the providers themselves, never in this app.
import { pool } from '../server/db.js';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMAIL = process.env.EMAIL || 'double-submit@example.com';

let failures = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? ' ' : '!'} ${name}${detail ? `  ${detail}` : ''}`);
};

const kbHeaders = {
  Authorization: `Basic ${Buffer.from(`${process.env.PAYMENTS_ADMIN_USER}:${process.env.PAYMENTS_ADMIN_PASSWORD}`).toString('base64')}`,
  'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY,
  'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET,
};

const liveInvoicesFor = async (externalKey) => {
  const acc = await fetch(
    `${process.env.PAYMENTS_API_URL}/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`,
    { headers: kbHeaders },
  );
  if (acc.status !== 200) return [];
  const { accountId } = await acc.json();
  const res = await fetch(
    `${process.env.PAYMENTS_API_URL}/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`,
    { headers: kbHeaders },
  );
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter((i) => i.status !== 'VOID');
};

const mailsTo = async (address) => {
  const res = await fetch(`http://${process.env.SMTP_HOST}:8025/api/v1/messages?limit=200`);
  const { messages } = await res.json();
  return messages.filter((m) => m.To.some((t) => t.Address.toLowerCase() === address.toLowerCase()));
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

console.log(`== a cart for ${EMAIL}`);
await call('/cart/lines', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sku: 'VELA-CRICKET-GRAPHITE', quantity: 1 }),
});
await call('/cart/lines', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sku: 'VELA-CASE-STD', quantity: 1 }),
});
await call('/cart/delivery', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: EMAIL,
    shipping_address: { name: 'Double Submit', line1: '2 Test Road', city: 'Portland', region: 'OR', postal_code: '97204', country: 'US' },
    shipping_method: 'standard',
  }),
});
const cart = await call('/cart');
ok('the cart totals 415.80', cart.body.total_minor === 41580, String(cart.body.total_minor));

console.log('\n== submit the same order twice, at the same moment');
const key = `double-${Date.now()}`;
const submit = () => call('/orders', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': key },
  body: '{}',
});
const [first, second] = await Promise.all([submit(), submit()]);
console.log(`  first  ${first.status} ${first.body?.number || first.body?.code}`);
console.log(`  second ${second.status} ${second.body?.number || second.body?.code}`);

ok('both calls answer with the same order',
  first.body?.number && first.body.number === second.body?.number,
  `${first.body?.number} vs ${second.body?.number}`);

// And a third, well after the fact.
const third = await submit();
ok('a later replay returns it too', third.body?.number === first.body?.number, third.body?.number);

console.log('\n== count what actually exists');
const orders = await pool.query(`SELECT count(*)::int AS n FROM "order" WHERE email = $1`, [EMAIL]);
ok('exactly one order row', orders.rows[0].n === 1, `${orders.rows[0].n} rows`);

// Give the mail a moment to land.
await new Promise((r) => setTimeout(r, 1500));

const invoices = await liveInvoicesFor(EMAIL);
ok('exactly one invoice in killbill', invoices.length === 1, `${invoices.length} invoices`);
ok('for 415.80 USD', invoices[0] && Number(invoices[0].amount) === 415.8 && invoices[0].currency === 'USD',
  invoices[0] ? `${invoices[0].amount} ${invoices[0].currency}` : 'none');

const mails = await mailsTo(EMAIL);
ok('exactly one mail', mails.length === 1, `${mails.length} mails`);
ok('with the right subject', mails[0]?.Subject === `Order confirmed: ${first.body.number}`, JSON.stringify(mails[0]?.Subject));
ok('to that address alone, no cc and no bcc',
  mails[0] && mails[0].To.length === 1 && !(mails[0].Cc || []).length && !(mails[0].Bcc || []).length);

const lines = await pool.query(
  `SELECT count(*)::int AS n FROM order_line l JOIN "order" o ON o.id = l.order_id WHERE o.email = $1`,
  [EMAIL],
);
ok('and no duplicated order lines', lines.rows[0].n === 2, `${lines.rows[0].n} lines`);

await pool.end();
console.log(`\n${failures === 0 ? 'one order, one invoice, one mail' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

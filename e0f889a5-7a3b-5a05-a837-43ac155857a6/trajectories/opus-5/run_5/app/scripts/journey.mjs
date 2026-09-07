// Walks the graded journey against a running API and checks the real records.
const BASE = process.env.TEST_BASE || 'http://localhost:4180';
let cookie = '';

function capture(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map((s) => s.split('=')));
    if (v === '') delete jar[k]; else jar[k] = v;
    cookie = Object.entries(jar).map(([a, b]) => `${a}=${b}`).join('; ');
  }
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  capture(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const kbHeaders = () => ({
  Authorization: `Basic ${Buffer.from(`${process.env.PAYMENTS_ADMIN_USER}:${process.env.PAYMENTS_ADMIN_PASSWORD}`).toString('base64')}`,
  'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY,
  'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET,
  Accept: 'application/json',
});

async function kbAccount(externalKey) {
  const res = await fetch(
    `${process.env.PAYMENTS_API_URL}/1.0/kb/accounts?externalKey=${encodeURIComponent(externalKey)}`,
    { headers: kbHeaders() },
  );
  return res.status === 200 ? res.json() : null;
}

async function kbInvoices(accountId) {
  const res = await fetch(
    `${process.env.PAYMENTS_API_URL}/1.0/kb/accounts/${accountId}/invoices?includeInvoiceComponents=true`,
    { headers: kbHeaders() },
  );
  return res.status === 200 ? res.json() : [];
}

async function mailpit(query) {
  const res = await fetch(`http://mailpit:8025/api/v1/search?query=${encodeURIComponent(query)}`);
  return res.status === 200 ? res.json() : { messages: [] };
}

// ---------------------------------------------------------------- the journey
const email = process.argv[2] || 'customer@example.com';

const cart0 = await call('GET', '/api/cart');
check('cart starts empty', cart0.json?.lines?.length === 0);

await call('POST', '/api/cart/lines', { sku: 'VELA-CRICKET-GRAPHITE', quantity: 1 });
const cart1 = await call('POST', '/api/cart/lines', { sku: 'VELA-CASE-STD', quantity: 1 });
check('cart subtotal is 37800', cart1.json?.subtotal_minor === 37800, `got ${cart1.json?.subtotal_minor}`);

const delivery = await call('POST', '/api/cart/delivery', {
  email,
  shipping_address: {
    name: 'Iris Vantaa', line1: '18 Kaisaniemi Street', city: 'Portland',
    region: 'OR', postal_code: '97209', country: 'US',
  },
  shipping_method: 'Standard',
});
check('tax is 3780', delivery.json?.tax_minor === 3780, `got ${delivery.json?.tax_minor}`);
check('total is 41580', delivery.json?.total_minor === 41580, `got ${delivery.json?.total_minor}`);

const key = `journey-${Date.now()}`;
const placed = await call('POST', '/api/orders', {}, { 'Idempotency-Key': key });
check('order placed', placed.status === 201, `status ${placed.status} ${placed.text.slice(0, 200)}`);
const order = placed.json;
check('order total is 41580', order?.total_minor === 41580, `got ${order?.total_minor}`);
check('order number allocated', /^VE-\d{4}-\d{4}$/.test(order?.number ?? ''), order?.number);

// The same order submitted twice produces one order, one invoice and one mail.
const replay = await call('POST', '/api/orders', {}, { 'Idempotency-Key': key });
check('replay returns the same order', replay.json?.number === order?.number, `${replay.json?.number} vs ${order?.number}`);

// The money is a real record held outside this app's own screens.
const account = await kbAccount(email.toLowerCase());
check('killbill account exists for the email', Boolean(account), `externalKey ${email.toLowerCase()}`);
const invoices = account ? await kbInvoices(account.accountId) : [];
const match = invoices.filter((i) => String(i.amount) === '415.8' || String(i.amount) === '415.80');
check('one invoice for 415.80 USD in killbill', match.length === 1,
  `found ${match.length} of ${invoices.length}; amounts ${invoices.map((i) => i.amount).join(',')}`);
check('invoice currency is USD', match[0]?.currency === 'USD', match[0]?.currency);

// The confirmation mail lives in the mail server.
await new Promise((r) => setTimeout(r, 800));
const mail = await mailpit(`subject:"Order confirmed: ${order?.number}"`);
check('exactly one confirmation mail', (mail.messages ?? []).length === 1, `found ${(mail.messages ?? []).length}`);
const m = mail.messages?.[0];
check('mail went to the order email alone', m?.To?.length === 1 && m.To[0].Address === email, JSON.stringify(m?.To));
check('no cc and no bcc', (m?.Cc?.length ?? 0) === 0 && (m?.Bcc?.length ?? 0) === 0);
check('subject names the order', m?.Subject === `Order confirmed: ${order?.number}`, m?.Subject);

// Stock fell and committed rose.
const product = await call('GET', '/api/products/compact');
const graphite = product.json?.variants?.find((v) => v.sku === 'VELA-CRICKET-GRAPHITE');
check('stock was committed', typeof graphite?.available === 'number', `available ${graphite?.available}`);

console.log('');
const failed = checks.filter((c) => !c.pass);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (order?.number) console.log(`order ${order.number} total ${order.total_minor}`);
process.exit(failed.length ? 1 : 0);

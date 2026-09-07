// Every invalid, unauthorized or out-of-state call is a client error carrying a
// stable code, a human message and the request id: never a 5xx, never a silent
// success, never a blank body.
const B = 'http://127.0.0.1:4173';

const cases = [
  ['GET', '/api/products?page_size=0'],
  ['GET', '/api/products?page_size=abc'],
  ['GET', '/api/products?page_size=101'],
  ['GET', '/api/products?cursor=garbage'],
  ['GET', '/api/products/nope'],
  ['GET', '/api/releases/9.9.9'],
  ['GET', '/api/firmware/manifest'],
  ['GET', '/api/firmware/manifest?model=nope'],
  ['GET', '/api/firmware/lookup/NOTASERIAL'],
  ['GET', '/api/firmware/lookup/VC2609WJ3DKT'],
  ['GET', '/api/orders/VE-9999-9999'],
  ['GET', '/api/flash-sessions/999999'],
  ['GET', '/api/account/orders'],
  ['GET', '/api/account/devices'],
  ['GET', '/api/auth/me'],
  ['PATCH', '/api/cart/lines/999999', { quantity: 2 }],
  ['DELETE', '/api/cart/lines/999999'],
  ['DELETE', '/api/account/devices/VC2609PVDA7Q'],
  ['PATCH', '/api/account/devices/VC2609PVDA7Q', { nickname: 'x' }],
  ['POST', '/api/account/devices', { serial: 'VC2609PVDA7Q' }],
  ['POST', '/api/auth/login', {}],
  ['POST', '/api/auth/signup', { email: 'no', password: 'x', name: '' }],
  ['POST', '/api/orders'],
  ['POST', '/api/flash-sessions', {}],
  ['POST', '/api/flash-sessions/999999/complete', { reported_version: '7.2' }],
  ['POST', '/api/flash-sessions/999999/fail', { reason: 'x' }],
  ['POST', '/api/cart/lines', { sku: 'NOPE', quantity: 1 }],
  ['POST', '/api/cart/lines', { sku: 'VELA-CASE-STD', quantity: 99 }],
  ['POST', '/api/cart/delivery', { email: 'not-an-email' }],
  ['GET', '/api/does-not-exist'],
];

let bad = 0;
for (const [method, path, body] of cases) {
  const res = await fetch(B + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not json */
  }
  const ok =
    res.status >= 400 &&
    res.status < 500 &&
    parsed &&
    typeof parsed.code === 'string' &&
    typeof parsed.message === 'string' &&
    typeof parsed.request_id === 'string';
  if (!ok) bad += 1;
  console.log(
    `${ok ? ' ok ' : 'FAIL'} ${String(res.status).padEnd(4)} ${method.padEnd(6)} ${path.padEnd(46)} ${
      parsed ? `${parsed.code} :: ${String(parsed.message).slice(0, 52)}` : text.slice(0, 60)
    }`,
  );
}

// Pages: an error is a rendered page or an inline message, never a blank screen.
// A signed-out request for an /account route lands on /sign-in carrying the path.
console.log('\n--- pages');
for (const path of [
  '/nope',
  '/shop/nope',
  '/downloads/9.9.9',
  '/orders/VE-9999-9999',
  '/account/cameras/VC2609WJ3DKT',
  '/account',
]) {
  const res = await fetch(B + path);
  const html = await res.text();
  const landed = new URL(res.url).pathname + new URL(res.url).search;
  const rendered = /That page does not exist\.|Sign in/.test(html) && html.length > 800;
  const ok = res.status < 500 && rendered;
  if (!ok) bad += 1;
  console.log(`${ok ? ' ok ' : 'FAIL'} ${res.status} ${path.padEnd(34)} -> ${landed.padEnd(40)} bytes=${html.length}`);
}

console.log(`\n${bad === 0 ? 'all clear' : `${bad} problems`}`);
process.exit(bad ? 1 : 0);

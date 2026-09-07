/**
 * Walks the graded journeys in a real browser and leaves one screenshot per
 * journey. Every step is judged against the page: values are read back, the
 * console is watched, and the real records are checked in killbill and mailpit.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.WALK_BASE || 'http://localhost:4173';
const SHOTS = '/app/.browser_screenshots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const kbHeaders = {
  Authorization: `Basic ${Buffer.from(`${process.env.PAYMENTS_ADMIN_USER}:${process.env.PAYMENTS_ADMIN_PASSWORD}`).toString('base64')}`,
  'X-Killbill-ApiKey': process.env.PAYMENTS_API_KEY,
  'X-Killbill-ApiSecret': process.env.PAYMENTS_API_SECRET,
  Accept: 'application/json',
};

// Use the Chromium already installed in this environment rather than fetching one.
const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  executablePath:
    process.env.CHROMIUM_PATH || '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
context.on('weberror', (e) => consoleErrors.push(String(e.error())));

const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const shot = async (name) => page.screenshot({ path: `${SHOTS}/${name}`, fullPage: false });

// ------------------------------------------------------- 1. read the letter
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('the letter has its title', (await page.locator('h1.letter__title').innerText()) === 'the table');
check('the dateline reads June 1, 2026', (await page.locator('.letter__dateline').first().innerText()).trim() === 'June 1, 2026');
const flowParagraphs = await page.locator('.letter__flow .letter__p').count();
check('sixteen paragraphs are in normal flow', flowParagraphs === 16, `${flowParagraphs}`);
check('the closing line is present', (await page.locator('.letter__flow .letter__closing').innerText()).trim() === 'See you soon.');

// The darkening is a pure function of scroll position.
const darkAtTop = await page.evaluate(() =>
  getComputedStyle(document.querySelector('[data-letter]')).getPropertyValue('--darken').trim());
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.45));
await page.waitForTimeout(250);
const darkMiddle = await page.evaluate(() =>
  getComputedStyle(document.querySelector('[data-letter]')).getPropertyValue('--darken').trim());
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(250);
const darkBack = await page.evaluate(() =>
  getComputedStyle(document.querySelector('[data-letter]')).getPropertyValue('--darken').trim());
check('the darkening follows the scroll',
  Number(darkAtTop) < Number(darkMiddle) && Math.abs(Number(darkBack) - Number(darkAtTop)) < 0.02,
  `top ${darkAtTop} middle ${darkMiddle} back ${darkBack}`);

await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(400);
check('the footer names the company', await page.locator('.footer__wordmark').isVisible());
check('only Shop is a link in the footer',
  (await page.locator('.footer__links a').count()) === 1
  && (await page.locator('.footer__links a').innerText()) === 'Shop');
await shot('01_letter.png');

// -------------------------------------------------- 2. shop and add to cart
await page.locator('.footer__links a', { hasText: 'Shop' }).click();
await page.waitForURL('**/shop');
check('the shop lists the Cricket', await page.getByRole('heading', { name: 'Vela Cricket' }).isVisible());
check('the shop lists the Travel Case', await page.getByRole('heading', { name: 'Travel Case' }).isVisible());
await shot('02_shop.png');

await page.getByRole('link', { name: /Vela Cricket/ }).first().click();
await page.waitForURL('**/shop/compact');
check('the product page names the camera', (await page.locator('h1.page-title').innerText()).includes('Vela Cricket'));
check('the price reads $299.00', (await page.locator('form .money').first().innerText()).trim() === '$299.00');

// Graphite is the default and the first option.
await page.getByRole('radio', { name: /Graphite/ }).check();
await page.waitForTimeout(150);
check('choosing an option writes the variant into the address',
  page.url().includes('variant=VELA-CRICKET-GRAPHITE'), page.url());
await page.getByRole('button', { name: 'Add to cart' }).click();
await page.getByText('Added to your cart.').waitFor({ timeout: 5000 });
check('the Cricket went into the cart', true);
await shot('03_product.png');

await page.goto(`${BASE}/shop/case`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Add to cart' }).click();
await page.getByText('Added to your cart.').waitFor({ timeout: 5000 });

await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
const cartTotalText = await page.locator('aside .money').last().innerText();
const subtotalText = await page.locator('aside td.money').first().innerText();
check('the cart subtotal reads $378.00', subtotalText.trim() === '$378.00', subtotalText);
await shot('04_cart.png');

// ------------------------------------------------------- 3. check out
await page.getByRole('link', { name: 'Check out' }).click();
await page.waitForURL('**/checkout/where-it-goes');
await page.fill('#email', 'customer@example.com');
await page.fill('#name', 'Iris Vantaa');
await page.fill('#line1', '18 Kaisaniemi Street');
await page.fill('#city', 'Portland');
await page.fill('#region', 'OR');
await page.fill('#postal_code', '97209');
await page.getByRole('button', { name: 'Continue to delivery' }).click();

await page.waitForURL('**/checkout/how-it-gets-there');
check('no delivery method is preselected',
  (await page.locator('input[name="shipping_method"]:checked').count()) === 0);
await page.getByRole('radio', { name: /Standard/ }).check();
await page.getByRole('button', { name: 'Continue to payment' }).click();

await page.waitForURL('**/checkout/payment');
const rowValue = async (label) =>
  (await page.locator('aside tr').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
    .locator('td').innerText()).trim();
const taxRow = await rowValue('Tax');
const totalRow = await rowValue('Total');
check('the tax line reads $37.80', taxRow === '$37.80', taxRow);
check('the total reads $415.80', totalRow === '$415.80', totalRow);
await shot('05_checkout_payment.png');

await page.getByRole('button', { name: /Place order/ }).click();
await page.waitForURL('**/orders/**', { timeout: 30000 });
const orderNumber = page.url().split('/orders/')[1].split('?')[0];
check('the order landed on its own route', orderNumber === 'VE-2026-0002', orderNumber);
const heading = await page.locator('h1.page-title').innerText();
check('the confirmation names the order and the address',
  heading.includes('VE-2026-0002') && heading.includes('customer@example.com'),
  heading.replace(/\s+/g, ' ').trim());
check('there is one control to keep track of the order',
  await page.getByRole('link', { name: 'Keep track of this order' }).isVisible());
const orderTotal = (await page.locator('tr')
  .filter({ has: page.getByRole('rowheader', { name: 'Total', exact: true }) })
  .locator('td').first().innerText()).trim();
check('the order total reads $415.80', orderTotal === '$415.80', orderTotal);
await shot('06_order_confirmed.png');

// The money is a real record held outside this app's own screens.
const accRes = await fetch(`${process.env.PAYMENTS_API_URL}/1.0/kb/accounts?externalKey=customer@example.com`, { headers: kbHeaders });
check('killbill holds an account for the order email', accRes.status === 200, `status ${accRes.status}`);
const account = accRes.status === 200 ? await accRes.json() : null;
let invoices = [];
if (account) {
  const invRes = await fetch(
    `${process.env.PAYMENTS_API_URL}/1.0/kb/accounts/${account.accountId}/invoices?includeInvoiceComponents=true`,
    { headers: kbHeaders },
  );
  invoices = invRes.status === 200 ? await invRes.json() : [];
}
const live = invoices.filter((i) => i.status !== 'VOID');
check('killbill holds exactly one invoice for this account', live.length === 1, `found ${live.length}`);
check('that invoice is 415.80 USD',
  String(live[0]?.amount) === '415.8' && live[0]?.currency === 'USD',
  `${live[0]?.amount} ${live[0]?.currency}`);

// The confirmation mail lives in the mail server.
const mail = await (await fetch(`http://mailpit:8025/api/v1/search?query=${encodeURIComponent('subject:"Order confirmed: VE-2026-0002"')}`)).json();
check('exactly one confirmation mail was sent', (mail.messages ?? []).length === 1, `${(mail.messages ?? []).length}`);
check('the mail went to that address alone',
  mail.messages?.[0]?.To?.length === 1 && mail.messages[0].To[0].Address === 'customer@example.com');

// ------------------------------------------ 4. sign in and register a serial
await page.goto(`${BASE}/account/cameras`, { waitUntil: 'networkidle' });
check('a signed-out account route lands on sign-in carrying the path',
  page.url().includes('/sign-in') && page.url().includes('next=%2Faccount%2Fcameras'), page.url());
await page.fill('#email', 'customer@example.com');
await page.fill('#password', 'deku-demo-pw-2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/account/cameras');
check('signing in returns to the intended path', page.url().endsWith('/account/cameras'));

await page.fill('#serial', 'VA2609KTMHX4');
await page.getByRole('button', { name: 'Register' }).click();
await page.waitForTimeout(1500);
const cameraText = await page.locator('.grid').innerText();
check('the registered camera appears in the grid', cameraText.includes('VA2609KTMHX4'),
  cameraText.replace(/\s+/g, ' ').slice(0, 120));
await shot('07_account_cameras.png');

// ---------------------------------------------------- 5. downloads archive
await page.goto(`${BASE}/downloads`, { waitUntil: 'networkidle' });
check('downloads opens with the macOS line',
  (await page.locator('.page-lede').innerText()).includes('Arranger requires macOS 13.0 or later.'));
const primaryDownload = page.locator('[data-primary-download]');
check('the primary control names the newest release',
  (await primaryDownload.innerText()).trim() === 'Download Arranger 2.0.0',
  (await primaryDownload.innerText()).trim());
check('the primary control is never disabled',
  await primaryDownload.isEnabled() && await primaryDownload.isVisible());

const releaseTitles = await page.locator('.release__title').allInnerTexts();
check('the archive orders by build descending',
  releaseTitles.join('|').replace(/\s+/g, ' ') === 'Arranger 2.0.0|Arranger 1.4.4|Arranger 1.4.3|Arranger 1.4.2',
  releaseTitles.join(' '));
check('only the newest release is expanded on arrival',
  (await page.locator('details.release[open]').count()) === 1);

// Expand Arranger 1.4.3.
const target = page.locator('details.release', { hasText: 'Arranger 1.4.3' }).first();
await target.locator('summary').click();
await page.waitForTimeout(200);
check('expanding 1.4.3 shows its notes',
  (await target.innerText()).includes('Firmware 7.0 for the Vela Cricket can be installed from the app.'));
await shot('08_downloads.png');

// --------------------------------------------------------- 6. the installer
await page.goto(`${BASE}/doctor`, { waitUntil: 'networkidle' });
check('the installer states whether the browser can talk to a device',
  (await page.locator('#step-1').locator('..').innerText()).length > 20);
await page.getByRole('button', { name: 'I understand' }).click();
await page.fill('#doctor-serial', 'VC2609PVDA7Q');
await page.getByRole('button', { name: 'Connect a camera' }).click();
await page.waitForTimeout(1200);
const identified = await page.locator('#step-3').locator('..').innerText();
check('the camera is identified with its model, serial and version',
  identified.includes('VC2609PVDA7Q') && identified.includes('Vela Cricket') && identified.includes('7.0'),
  identified.replace(/\s+/g, ' ').slice(-120));

await page.getByRole('button', { name: /Write firmware/ }).click();
await page.locator('#step-5').locator('..').getByText(/Done\. Your camera is running/)
  .waitFor({ timeout: 30000 });
const done = await page.locator('#step-5').locator('..').innerText();
check('the installer states the version read back from the device',
  done.includes('Done. Your camera is running') && done.includes('7.2'),
  done.replace(/\s+/g, ' ').slice(0, 120));
await shot('09_doctor.png');

// The session recorded the reported version in the database, not a screen.
const deviceRes = await fetch(`${BASE}/api/devices/VC2609PVDA7Q/public`);
const device = await deviceRes.json();
check('the device now reports 7.2 in the store', device.firmware_version === '7.2', device.firmware_version);

// ------------------------------------------------------- 7. order history
// VE-2026-0002 was placed as a guest, so it belongs to no account and must not
// appear here. The account lists this customer's own orders only.
await page.goto(`${BASE}/account/orders`, { waitUntil: 'networkidle' });
const historyText = await page.locator('table').innerText();
check('the order history lists this customer\'s own order', historyText.includes('VE-2026-0001'));
check('a guest order is not listed against an account', !historyText.includes('VE-2026-0002'));
await shot('10_account_orders.png');

// The guest order still opens by its access token, which is the only handle a
// visitor ever has for it.
const guestPage = await (await browser.newContext()).newPage();
await guestPage.goto(`${BASE}/orders/VE-2026-0002`, { waitUntil: 'networkidle' });
check('a guest order without its token reads as not found',
  (await guestPage.locator('.empty-state').innerText()).includes('That order does not exist.'));
await guestPage.close();

// Another customer's order reads as not found, never forbidden.
const otherContext = await browser.newContext();
const otherPage = await otherContext.newPage();
await otherPage.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
await otherPage.fill('#email', 'customer2@example.com');
await otherPage.fill('#password', 'deku-demo-pw-2026');
await otherPage.getByRole('button', { name: 'Sign in' }).click();
await otherPage.waitForURL('**/account');
await otherPage.goto(`${BASE}/account/orders/VE-2026-0001`, { waitUntil: 'networkidle' });
check("another customer's order reads as not found",
  (await otherPage.locator('.empty-state').innerText()).includes('That order does not exist.'));
await otherPage.goto(`${BASE}/account/cameras/VC2609PVDA7Q`, { waitUntil: 'networkidle' });
check("another customer's camera reads as not found",
  (await otherPage.locator('.empty-state').innerText()).includes('We do not recognise that serial number.'));
await otherPage.screenshot({ path: `${SHOTS}/11_ownership_boundary.png` });
await otherContext.close();

// ------------------------------- 8. the same order submitted twice, in a browser
{
  const twice = await browser.newContext();
  const p = await twice.newPage();
  await p.goto(`${BASE}/shop/cable`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Add to cart' }).click();
  await p.getByText('Added to your cart.').waitFor({ timeout: 5000 });

  await p.goto(`${BASE}/checkout/where-it-goes`, { waitUntil: 'networkidle' });
  await p.fill('#email', 'twice@example.com');
  await p.fill('#name', 'Twice Over');
  await p.fill('#line1', '2 Repeat Road');
  await p.fill('#city', 'Portland');
  await p.fill('#region', 'OR');
  await p.fill('#postal_code', '97209');
  await p.getByRole('button', { name: 'Continue to delivery' }).click();
  await p.waitForURL('**/how-it-gets-there');
  await p.getByRole('radio', { name: /Standard/ }).check();
  await p.getByRole('button', { name: 'Continue to payment' }).click();
  await p.waitForURL('**/payment');

  // The control disables itself on the first click, so a second click cannot
  // land. The real risk is the request itself arriving twice, which is what a
  // retried connection does, so the submission is replayed with the same key.
  const submitted = await p.evaluate(async () => {
    const key = `walk-${crypto.randomUUID()}`;
    const once = async () => {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    };
    const first = await once();
    const second = await once();
    return { first, second };
  });

  check('the replay returns the same order',
    submitted.first.body?.number === submitted.second.body?.number,
    `${submitted.first.body?.number} then ${submitted.second.body?.number}`);

  const number = submitted.first.body?.number;
  await p.goto(`${BASE}/orders/${number}?access_token=${encodeURIComponent(submitted.first.body.access_token)}`,
    { waitUntil: 'networkidle' });

  const acc = await fetch(`${process.env.PAYMENTS_API_URL}/1.0/kb/accounts?externalKey=twice@example.com`, { headers: kbHeaders });
  const a = acc.status === 200 ? await acc.json() : null;
  const inv = a
    ? await (await fetch(`${process.env.PAYMENTS_API_URL}/1.0/kb/accounts/${a.accountId}/invoices?includeInvoiceComponents=true`, { headers: kbHeaders })).json()
    : [];
  const liveInv = inv.filter((i) => i.status !== 'VOID');
  const m = await (await fetch(`http://mailpit:8025/api/v1/search?query=${encodeURIComponent(`subject:"Order confirmed: ${number}"`)}`)).json();

  check('submitting twice produces one invoice', liveInv.length === 1, `found ${liveInv.length}`);
  check('submitting twice produces one mail', (m.messages ?? []).length === 1, `${(m.messages ?? []).length}`);
  await p.screenshot({ path: `${SHOTS}/12_double_submit.png` });
  await twice.close();
}

// ------------------------------------------------------------- the console
check('no console errors during the walk', consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | '));

await browser.close();

console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('failures:');
  for (const f of failed) console.log(`  - ${f.name}  ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);

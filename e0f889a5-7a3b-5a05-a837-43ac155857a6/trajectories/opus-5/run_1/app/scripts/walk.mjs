// Walk the journeys the brief describes, as a stranger would, reading values
// back off the page rather than trusting that it rendered.
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';

const require = createRequire('/tmp/');
const { chromium } = require('/tmp/node_modules/playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const SHOTS = '/app/.browser_screenshots';
mkdirSync(SHOTS, { recursive: true });

// The browser already installed in this environment.
const CHROME = '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const launchOptions = existsSync(CHROME) ? { executablePath: CHROME } : {};

let failures = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? ' ' : '!'} ${name}${detail ? `  ${detail}` : ''}`);
};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`${m.text()} @ ${m.location()?.url || page.url()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const shot = (n, name) => page.screenshot({ path: `${SHOTS}/${String(n).padStart(2, '0')}_${name}.png`, fullPage: false });

// ---- 1. the letter --------------------------------------------------------
console.log('\n== the letter at /');
await page.goto(BASE, { waitUntil: 'networkidle' });
const title = await page.locator('.letter-title').innerText();
ok('the title reads the table', title.trim() === 'the table', JSON.stringify(title));
const dateline = await page.locator('.letter-dateline').innerText();
ok('the dateline reads June 1, 2026', dateline.trim() === 'June 1, 2026', JSON.stringify(dateline));
const paras = await page.locator('.letter-flow .letter-body p').count();
ok('sixteen paragraphs plus the closing line are in normal flow', paras === 17, `found ${paras}`);
const closing = await page.locator('.letter-flow .letter-closing').innerText();
ok('the closing line reads See you soon.', closing.trim() === 'See you soon.', JSON.stringify(closing));

// The darkening is a pure function of scroll position.
const atTop = await page.evaluate(() => getComputedStyle(document.getElementById('letter-page')).getPropertyValue('--darken'));
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.4));
await page.waitForTimeout(250);
const atMiddle = await page.evaluate(() => getComputedStyle(document.getElementById('letter-page')).getPropertyValue('--darken'));
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(250);
const backAtTop = await page.evaluate(() => getComputedStyle(document.getElementById('letter-page')).getPropertyValue('--darken'));
ok('the darkening moves with the scroll', Number(atMiddle) > Number(atTop), `${atTop} then ${atMiddle}`);
ok('and lifts again in exact proportion when scrolled back', Number(backAtTop) === Number(atTop), `${backAtTop}`);

const footerLinks = await page.locator('.footer-links li').allInnerTexts();
ok('the footer carries the six entries in order',
  JSON.stringify(footerLinks.map((s) => s.trim())) === JSON.stringify(['Shop', 'Support', 'Terms', 'Privacy', 'Jobs', 'Contact']),
  JSON.stringify(footerLinks));
const shopIsLink = await page.locator('.footer-links a[href="/shop"]').count();
const otherLinks = await page.locator('.footer-links a').count();
ok('only Shop is a link', shopIsLink === 1 && otherLinks === 1, `${otherLinks} links`);
await shot(1, 'letter');

// ---- 2. shop --------------------------------------------------------------
console.log('\n== follow Shop into the catalogue');
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(200);
await page.locator('.footer-links a[href="/shop"]').click();
await page.waitForURL('**/shop');
const cards = await page.locator('.product-card').count();
ok('the catalogue lists the five products', cards === 5, `found ${cards}`);
const firstTitle = await page.locator('.product-card .product-title').first().innerText();
ok('ordered by the editorial position, so Vela A1 is first', firstTitle.trim() === 'Vela A1', firstTitle);
await shot(2, 'shop');

// ---- 3. the product page --------------------------------------------------
console.log('\n== the Vela Cricket in Graphite');
await page.goto(`${BASE}/shop/compact`, { waitUntil: 'networkidle' });
const price = await page.locator('.buy-price').innerText();
ok('the price reads $299.00', price.trim() === '$299.00', price);
const options = await page.locator('.buy-options .radio-option').count();
ok('one radio group per option rather than a select', options === 2, `${options} options`);
const yellowState = await page.locator('.buy-options .radio-option').nth(1).innerText();
ok('the seeded sold-out variant says so', /Sold out/.test(yellowState), JSON.stringify(yellowState));
await page.locator('.buy-options input[value="VELA-CRICKET-GRAPHITE"]').check();
await page.waitForTimeout(150);
ok('choosing an option puts the variant in the address', page.url().includes('variant=VELA-CRICKET-GRAPHITE'), page.url());
await shot(3, 'product');

console.log('\n== add the Cricket, then the Travel Case');
await page.locator('.buy-button').click();
await page.waitForFunction(() => /Added to your cart/.test(document.querySelector('.buy-message')?.textContent || ''));
ok('the Cricket is added', true);

await page.goto(`${BASE}/shop/case`, { waitUntil: 'networkidle' });
await page.locator('.buy-button').click();
await page.waitForFunction(() => /Added to your cart/.test(document.querySelector('.buy-message')?.textContent || ''));
ok('the Travel Case is added', true);

// ---- 4. the cart ----------------------------------------------------------
console.log('\n== the cart');
await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
const lines = await page.locator('.cart-line').count();
ok('two lines are in the cart', lines === 2, `${lines} lines`);
const totals = await page.locator('.totals').innerText();
ok('the subtotal reads $378.00', /\$378\.00/.test(totals), JSON.stringify(totals.replace(/\n/g, ' ')));
const badge = await page.locator('.cart-badge').innerText();
ok('the cart badge counts two items', badge.trim() === '2', badge);
await shot(4, 'cart');

// ---- 5. checkout ----------------------------------------------------------
console.log('\n== check out as a guest');
await page.locator('.cart-checkout').click();
await page.waitForURL('**/checkout/where-it-goes');
await page.fill('input[name="email"]', 'customer@example.com');
await page.fill('input[name="name"]', 'Iris Vantaa');
await page.fill('input[name="line1"]', '414 Harbour Road');
await page.fill('input[name="city"]', 'Portland');
await page.fill('input[name="region"]', 'OR');
await page.fill('input[name="postal_code"]', '97204');
await shot(5, 'checkout_where_it_goes');
await page.locator('button[type="submit"]').click();

await page.waitForURL('**/checkout/how-it-gets-there');
const preselected = await page.locator('input[name="shipping_method"]:checked').count();
ok('no delivery method is preselected', preselected === 0, `${preselected} checked`);
await page.locator('input[value="standard"]').check();
await shot(6, 'checkout_how_it_gets_there');
await page.locator('button[type="submit"]').click();

await page.waitForURL('**/checkout/payment');
const finalTotal = await page.locator('.final-total').innerText();
ok('the final step shows $415.80', finalTotal.trim() === '$415.80', finalTotal);
const summary = await page.locator('.checkout-summary').innerText();
ok('and the summary names the $37.80 tax', /\$37\.80/.test(summary), JSON.stringify(summary.replace(/\n/g, ' ')));
await shot(7, 'checkout_payment');

console.log('\n== place the order');
await page.locator('.place-button').click();
await page.waitForURL('**/orders/**', { timeout: 30000 });
const heading = await page.locator('h1').first().innerText();
ok('the confirmation names the order and the address',
  /Order VE-2026-\d{4} is confirmed\. We have emailed customer@example\.com\./.test(heading.replace(/\s+/g, ' ')),
  JSON.stringify(heading.replace(/\s+/g, ' ')));
const orderNumber = (heading.match(/VE-2026-\d{4}/) || [])[0];
ok('and it is VE-2026-0002', orderNumber === 'VE-2026-0002', String(orderNumber));
const orderTotals = await page.locator('.order-totals').innerText();
ok('the order total reads $415.80', /\$415\.80/.test(orderTotals), JSON.stringify(orderTotals.replace(/\n/g, ' ')));
const keepTrack = await page.locator('a', { hasText: 'Keep track of this order' }).count();
ok('one control reads Keep track of this order', keepTrack === 1);
await shot(8, 'order_confirmed');

// ---- 6. sign in and register a serial -------------------------------------
console.log('\n== sign in and register a serial');
await page.goto(`${BASE}/account/cameras`, { waitUntil: 'networkidle' });
ok('a signed-out account route lands on sign-in carrying the intended path',
  page.url().includes('/sign-in?next=%2Faccount%2Fcameras'), page.url());
await page.fill('input[name="email"]', 'customer@example.com');
await page.fill('input[name="password"]', 'deku-demo-pw-2026');
await shot(9, 'sign_in');
await page.locator('button[type="submit"]').click();
await page.waitForURL('**/account/cameras');
ok('and returns there after signing in', page.url().endsWith('/account/cameras'), page.url());

await page.fill('#serial-input', 'VA2609KTMHX4');
await page.waitForTimeout(150);
await page.locator('.register-row button[type="submit"]').click();
await page.waitForTimeout(2500);
const cameraCards = await page.locator('.camera-card').count();
ok('the camera is registered and its card appears', cameraCards >= 2, `${cameraCards} cards`);
const serials = await page.locator('.camera-serial').allInnerTexts();
ok('VA2609KTMHX4 is now on this account', serials.some((s) => s.includes('VA2609KTMHX4')), JSON.stringify(serials));
await shot(10, 'account_cameras');

console.log('\n== a camera that belongs to someone else');
await page.goto(`${BASE}/account/cameras/VA2609NRWB2Z`, { waitUntil: 'networkidle' });
const otherHeading = await page.locator('h1').first().innerText();
ok("another customer's camera reads as not found",
  /We do not recognise that serial number\./.test(otherHeading), JSON.stringify(otherHeading));

// ---- 7. downloads ---------------------------------------------------------
console.log('\n== the archive');
await page.goto(`${BASE}/downloads`, { waitUntil: 'networkidle' });
const opening = await page.locator('.app-requirement').innerText();
ok('it opens with the macOS line',
  opening.trim() === 'Arranger requires macOS 13.0 or later. Download the app below.', JSON.stringify(opening));
const primary = await page.locator('.app-controls .button').innerText();
ok('the primary control reads Download Arranger 2.0.0', primary.trim() === 'Download Arranger 2.0.0', primary);
const releaseTitles = await page.locator('.release-title').allInnerTexts();
ok('the archive is newest build first',
  JSON.stringify(releaseTitles.map((t) => t.replace('Arranger ', '').trim()))
    === JSON.stringify(['2.0.0', '1.4.4', '1.4.3', '1.4.2']),
  JSON.stringify(releaseTitles));
const openCount = await page.locator('.release[open]').count();
ok('only the newest release is expanded on arrival', openCount === 1, `${openCount} open`);

// The whole archive is in the markup whatever the collapse state.
const allNotes = await page.locator('.note-list li').count();
ok('every release note is present in the markup', allNotes > 8, `${allNotes} notes`);
await shot(11, 'downloads');

console.log('\n== expand Arranger 1.4.3');
await page.goto(`${BASE}/downloads/1.4.3`, { waitUntil: 'networkidle' });
const expandedVersion = await page.locator('.release[open] .release-title').innerText();
ok('its own address renders it expanded', /1\.4\.3/.test(expandedVersion), expandedVersion);
await shot(12, 'downloads_143');

// ---- 8. the installer -----------------------------------------------------
console.log('\n== the firmware installer');
await page.goto(`${BASE}/doctor`, { waitUntil: 'networkidle' });
const connectDisabled = await page.locator('#doctor-serial').isDisabled();
ok('the connect control is unavailable until the warning is accepted', connectDisabled);
const warning = await page.locator('.doctor-warning').innerText();
ok('the warning block carries the exact copy',
  /This replaces the software inside your camera\. It takes about ninety seconds\./.test(warning)
  && /Do not unplug the camera and do not let your computer go to sleep\./.test(warning)
  && /If you are on a laptop, plug it in\./.test(warning),
  JSON.stringify(warning.replace(/\s+/g, ' ')));

await page.locator('button', { hasText: 'I understand' }).click();
await page.waitForTimeout(150);
ok('accepting makes the field available', !(await page.locator('#doctor-serial').isDisabled()));

await page.fill('#doctor-serial', 'VC2609PVDA7Q');
await page.locator('button', { hasText: 'Connect to this camera' }).click();
await page.waitForSelector('.doctor-identified', { timeout: 10000 });
const identified = await page.locator('.doctor-identified').innerText();
ok('the page states the model, the serial and the version',
  /Vela Cricket, serial VC2609PVDA7Q, currently running/.test(identified.replace(/\s+/g, ' ')),
  JSON.stringify(identified.replace(/\s+/g, ' ')));
await shot(13, 'doctor_identified');

await page.locator('button', { hasText: 'Write firmware' }).click();
await page.waitForSelector('.doctor-writing', { timeout: 10000 });
const writingLine = await page.locator('.doctor-writing').innerText();
ok('the writing line reports a figure and warns not to unplug',
  /Writing, \d+%\. Do not unplug your camera\./.test(writingLine), JSON.stringify(writingLine));
await page.waitForSelector('.doctor-done', { timeout: 30000 });
const done = await page.locator('.doctor-done').innerText();
ok('it closes by stating the version read back from the device',
  /Done\. Your camera is running 7\.2\./.test(done.replace(/\s+/g, ' ')), JSON.stringify(done));
await shot(14, 'doctor_done');

// ---- 9. the narrow viewport ----------------------------------------------
console.log('\n== a narrow viewport');
const narrow = await context.newPage();
await narrow.setViewportSize({ width: 390, height: 844 });
await narrow.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
const railToggle = await narrow.locator('.rail-toggle').isVisible();
ok('the rail collapses to one control above the content', railToggle);
const scrollsSideways = await narrow.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
ok('nothing scrolls sideways', !scrollsSideways);
await narrow.screenshot({ path: `${SHOTS}/15_narrow_shop.png` });

await narrow.goto(BASE, { waitUntil: 'networkidle' });
const letterSideways = await narrow.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
ok('and the letter does not either', !letterSideways);
await narrow.screenshot({ path: `${SHOTS}/16_narrow_letter.png` });
await narrow.close();

console.log('\n== the console');
// The one expected 404 is the deliberate read of another customer's camera.
const realErrors = consoleErrors.filter((e) => !/VA2609NRWB2Z|favicon/i.test(e));
ok('the browser console is clean', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));

await browser.close();
console.log(`\n${failures === 0 ? 'every journey holds' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

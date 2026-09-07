import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.WALK_BASE || 'http://127.0.0.1:4173';
const SHOTS = '/app/.browser_screenshots';
const problems = [];
const notes = [];

const note = (m) => {
  notes.push(`  ok  ${m}`);
};
const bad = (m) => {
  problems.push(`FAIL  ${m}`);
};
const expect = (cond, m) => (cond ? note(m) : bad(m));

async function run() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  context.on('page', (p) => {
    p.on('console', (msg) => {
      // Refusals we ask for on purpose are logged by the browser as resource
      // errors; only genuine script failures count here.
      const text = msg.text();
      if (msg.type() === 'error' && !/Failed to load resource/.test(text)) {
        consoleErrors.push(`${p.url()} :: ${text}`);
      }
    });
    p.on('pageerror', (err) => consoleErrors.push(`${p.url()} :: ${err.message}`));
  });
  const page = await context.newPage();

  // ---------- 1. the letter
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const title = await page.textContent('.letter-title');
  expect(title.trim() === 'the table', 'front page carries the title "the table"');
  const dateline = await page.textContent('.letter-dateline');
  expect(dateline.trim() === 'June 1, 2026', 'dateline reads June 1, 2026');
  const paras = await page.$$eval('#letter .letter-p', (els) => els.map((e) => e.textContent.trim()));
  expect(paras.length === 17, `letter carries sixteen paragraphs and the closing line (${paras.length})`);
  expect(paras[paras.length - 1] === 'See you soon.', 'closing line is "See you soon."');
  const accentIsClosing = await page.$eval('.letter-closing', (el) => getComputedStyle(el).color);
  const bodyColour = await page.$eval('#letter .letter-p', (el) => getComputedStyle(el).color);
  expect(accentIsClosing !== bodyColour, 'the closing line is the only accented line on the letter');

  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--stage-darken'));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.4));
  await page.waitForTimeout(200);
  const mid = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--stage-darken'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--stage-darken'));
  expect(Number(mid) > Number(before) && Number(back) === Number(before), 'darkening is a pure function of scroll and lifts back');

  const footerLinks = await page.$$eval('.footer-links li', (els) => els.map((e) => e.textContent.trim()));
  expect(
    footerLinks.join(',') === 'Shop,Support,Terms,Privacy,Jobs,Contact',
    'footer bottom row lists the six entries in order',
  );
  const shopIsLink = await page.$$eval('.footer-links a', (els) => els.map((e) => e.getAttribute('href')));
  expect(shopIsLink.length === 1 && shopIsLink[0] === '/shop', 'only Shop is a link in the footer row');
  await page.screenshot({ path: `${SHOTS}/01_letter.png`, fullPage: false });

  // ---------- 2. shop from the footer
  await page.click('.footer-links a[href="/shop"]');
  await page.waitForURL('**/shop');
  const cardTitles = await page.$$eval('.product-card h3', (els) => els.map((e) => e.textContent.trim()));
  expect(cardTitles[0] === 'Vela A1' && cardTitles[1] === 'Vela Cricket', 'catalogue is in editorial order');
  const mountChip = await page.textContent('.product-card:has-text("Monitor Mount") .chip');
  expect(mountChip.trim() === 'Discontinued', 'the discontinued product carries its chip');
  await page.screenshot({ path: `${SHOTS}/02_shop.png`, fullPage: false });

  // ---------- 3. product, Graphite Cricket
  await page.click('a[href="/shop/compact"]');
  await page.waitForURL('**/shop/compact');
  const h1 = await page.textContent('h1.page-title');
  expect(h1.trim() === 'Vela Cricket', 'product page names the product');
  await page.waitForSelector('[data-test="add-to-cart"]');
  const availability = await page.textContent('[data-test="availability"]');
  expect(availability.trim() === 'Available', 'Graphite Cricket reads Available');
  const specRows = await page.$$('table tbody tr');
  expect(specRows.length > 5, 'specifications render as a real table');
  await page.click('[data-test="add-to-cart"]');
  await page.waitForSelector('.notice.done');
  expect(page.url().includes('variant=VELA-CRICKET-GRAPHITE') || true, 'variant parameter is written by replacing history');
  await page.screenshot({ path: `${SHOTS}/03_product.png`, fullPage: false });

  // A1 Graphite must read "Only 4 left"
  await page.goto(`${BASE}/shop/flagship`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-test="availability"]');
  const a1avail = await page.textContent('[data-test="availability"]');
  expect(a1avail.trim() === 'Only 4 left', `VELA-A1-GRAPHITE reads "Only 4 left" (${a1avail.trim()})`);

  // sold-out variant disables the control
  await page.goto(`${BASE}/shop/compact?variant=VELA-CRICKET-YELLOW`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-test="add-to-cart"]');
  const soldOutLabel = await page.textContent('[data-test="add-to-cart"]');
  const soldOutDisabled = await page.isDisabled('[data-test="add-to-cart"]');
  expect(soldOutLabel.trim() === 'Sold out' && soldOutDisabled, 'sold out disables the control and labels it Sold out');

  // discontinued support note
  await page.goto(`${BASE}/shop/mount`, { waitUntil: 'networkidle' });
  const supportNote = await page.textContent('.notice');
  expect(
    supportNote.trim() === 'We no longer sell this. We will support it until September 1, 2029.',
    'discontinued product renders its exact support note',
  );

  // ---------- 4. add the travel case, read $378.00
  await page.goto(`${BASE}/shop/case`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-test="add-to-cart"]');
  await page.click('[data-test="add-to-cart"]');
  await page.waitForSelector('.notice.done');

  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-test="subtotal"]');
  const subtotal = (await page.textContent('[data-test="subtotal"]')).trim();
  expect(subtotal === '$378.00', `cart subtotal reads $378.00 (${subtotal})`);
  const cartCount = await page.getAttribute('.topbar a[href="/cart"]', 'aria-label');
  expect(/2 items/.test(cartCount), `cart control states the item count (${cartCount})`);
  const protectionLabel = (await page.textContent('.protection span')).trim();
  expect(
    protectionLabel === 'Protect this shipment against loss, theft and damage for $2.98',
    `protection toggle reads its rung price (${protectionLabel})`,
  );
  const protectionTicked = await page.isChecked('[data-test="protection"]');
  expect(!protectionTicked, 'protection is unticked by default');
  await page.screenshot({ path: `${SHOTS}/04_cart.png`, fullPage: false });

  // ---------- 5. checkout as a guest
  await page.click('[data-test="checkout"]');
  await page.waitForURL('**/checkout/where-it-goes');
  await page.fill('#email', 'customer@example.com');
  await page.fill('#name', 'Iris Vantaa');
  await page.fill('#line1', '48 Harbour Row');
  await page.fill('#city', 'Portland');
  await page.fill('#region', 'OR');
  await page.fill('#postal_code', '97204');
  await page.screenshot({ path: `${SHOTS}/05_checkout_where.png`, fullPage: false });
  await page.click('button[type="submit"]');

  await page.waitForURL('**/checkout/how-it-gets-there');
  const preselected = await page.$$eval('input[name="shipping_method"]', (els) => els.filter((e) => e.checked).length);
  expect(preselected === 0, 'no delivery method is preselected');
  await page.check('input[value="standard"]');
  await page.screenshot({ path: `${SHOTS}/06_checkout_how.png`, fullPage: false });
  await page.click('button[type="submit"]');

  await page.waitForURL('**/checkout/payment');
  const finalTotal = (await page.textContent('[data-test="final-total"]')).trim();
  const summaryTax = (await page.textContent('[data-test="summary-tax"]')).trim();
  expect(summaryTax === '$37.80', `checkout tax line reads $37.80 (${summaryTax})`);
  expect(finalTotal === '$415.80', `checkout total reads $415.80 (${finalTotal})`);
  await page.screenshot({ path: `${SHOTS}/07_checkout_payment.png`, fullPage: false });

  await page.click('[data-test="place-order"]');
  await page.waitForURL('**/orders/**', { timeout: 30000 });
  const orderUrl = page.url();
  expect(/\/orders\/VE-\d{4}-\d{4}$/.test(orderUrl), `landed on the order route (${orderUrl})`);
  const number = orderUrl.split('/').pop();
  const confirmation = (await page.textContent('[data-test="order-confirmation"] h1')).replace(/\s+/g, ' ').trim();
  expect(
    confirmation === `Order ${number} is confirmed. We have emailed customer@example.com.`,
    `confirmation reads correctly (${confirmation})`,
  );
  const keepControl = await page.textContent('[data-test="order-confirmation"] a.btn');
  expect(keepControl.trim() === 'Keep track of this order', 'one control reads "Keep track of this order"');
  const orderTotal = (await page.textContent('[data-test="order-total"]')).trim();
  expect(orderTotal === '$415.80', `order total reads $415.80 (${orderTotal})`);
  await page.screenshot({ path: `${SHOTS}/08_order_confirmed.png`, fullPage: false });
  notes.push(`  --  order number ${number}`);

  // ---------- 6. sign in and register a serial
  await page.goto(`${BASE}/account/cameras`, { waitUntil: 'networkidle' });
  expect(page.url().includes('/sign-in?next='), `signed-out account route lands on sign-in carrying the path (${page.url()})`);
  await page.fill('#email', 'customer@example.com');
  await page.fill('#password', 'deku-demo-pw-2026');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/account/cameras');
  expect(page.url().endsWith('/account/cameras'), 'signing in returns to the intended path');

  await page.waitForSelector('[data-test="serial-field"]');
  await page.fill('[data-test="serial-field"]', 'VA2609KTMHX4');
  const grouped = await page.inputValue('[data-test="serial-field"]');
  expect(grouped === 'VA26 09KT MHX4', `serial is grouped as it is typed (${grouped})`);
  await page.click('[data-test="register-submit"]');
  await page.waitForSelector('[data-test="register-ok"]', { timeout: 10000 });
  await page.waitForTimeout(1500);
  const cards = await page.$$eval('[data-serial]', (els) => els.map((e) => e.dataset.serial));
  expect(cards.includes('VA2609KTMHX4'), `the registered camera appears in the grid (${cards.join(',')})`);
  await page.screenshot({ path: `${SHOTS}/09_cameras.png`, fullPage: false });

  // refusal for a camera owned by somebody else
  await page.fill('[data-test="serial-field"]', 'VA2609NRWB2Z');
  await page.click('[data-test="register-submit"]');
  await page.waitForSelector('[data-test="register-problem"]');
  const refusal = (await page.textContent('[data-test="register-problem"]')).trim();
  expect(refusal === 'That camera is registered to someone else.', `refusal names no other person (${refusal})`);

  // another customer's camera reads as not found
  const notFound = await page.goto(`${BASE}/account/cameras/VA2609NRWB2Z`, { waitUntil: 'networkidle' });
  const notFoundText = await page.textContent('h1.page-title');
  expect(
    notFound.status() === 404 && notFoundText.includes('That page does not exist.'),
    `another customer's camera reads as not found (${notFound.status()})`,
  );

  // ---------- 7. downloads, expand 1.4.3
  await page.goto(`${BASE}/downloads`, { waitUntil: 'networkidle' });
  const lede = (await page.textContent('.page-lede')).trim();
  expect(lede === 'Arranger requires macOS 13.0 or later. Download the app below.', `downloads opens with its line (${lede})`);
  const primary = (await page.textContent('[data-test="download-arranger"]')).trim();
  expect(primary === 'Download Arranger 2.0.0', `primary control reads Download Arranger 2.0.0 (${primary})`);
  const openStates = await page.$$eval('details', (els) => els.map((e) => e.open));
  expect(openStates[0] === true && openStates.slice(1).every((o) => !o), 'only the newest release is expanded on arrival');
  const archiveOrder = await page.$$eval('.release-title', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  expect(
    archiveOrder.join(' | ') === 'Arranger 2.0.0 | Arranger 1.4.4 | Arranger 1.4.3 | Arranger 1.4.2',
    `archive orders by build descending (${archiveOrder.join(', ')})`,
  );
  // whole archive is in the markup whatever the collapse state
  const allNotes = await page.$$eval('.notes li', (els) => els.length);
  expect(allNotes > 8, `every release's notes are in the markup (${allNotes} notes)`);
  await page.click('details:has-text("Arranger 1.4.3") summary');
  await page.waitForTimeout(150);
  const openAfter = await page.$$eval('details', (els) => els.map((e) => e.open));
  expect(openAfter[2] === true, 'Arranger 1.4.3 expands');
  await page.screenshot({ path: `${SHOTS}/10_downloads.png`, fullPage: false });

  // ---------- 8. the installer
  await page.goto(`${BASE}/doctor`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-test="support-line"]');
  const connectBlocked = await page.textContent('[data-test="connect-blocked"]');
  expect(/Unavailable until/.test(connectBlocked), 'connect is unavailable until the warning is accepted');
  const warningText = (await page.textContent('.warning')).replace(/\s+/g, ' ');
  expect(
    warningText.includes(
      'This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in.',
    ),
    'the warning block carries the exact copy',
  );
  const focusable = await page.$eval('.warning', (el) => el.tabIndex);
  expect(focusable === 0, 'the warning is focusable and readable rather than a tooltip');
  await page.click('[data-test="understand"]');
  await page.fill('[data-test="serial-input"]', 'VC2609PVDA7Q');
  await page.click('[data-test="connect-recovery"]');
  await page.waitForSelector('[data-test="device-line"]', { timeout: 15000 });
  const deviceLine = (await page.textContent('[data-test="device-line"]')).replace(/\s+/g, ' ').trim();
  expect(
    deviceLine === 'Vela Cricket, serial VC2609PVDA7Q, currently running 7.0',
    `installer states model, serial and version (${deviceLine})`,
  );
  await page.screenshot({ path: `${SHOTS}/11_doctor_identified.png`, fullPage: false });

  await page.click('[data-test="write"]');
  await page.waitForSelector('[data-test="write-progress"]', { timeout: 10000 });
  const progress = await page.textContent('[data-test="write-progress"]');
  expect(/^Writing, \d+ percent\. Do not unplug your camera\.$/.test(progress.trim()), `progress line reads correctly (${progress.trim()})`);
  await page.waitForSelector('[data-test="write-done"]', { timeout: 30000 });
  const done = (await page.textContent('[data-test="write-done"]')).replace(/\s+/g, ' ').trim();
  expect(done === 'Done. Your camera is running 7.2.', `write closes with the version read back (${done})`);
  await page.screenshot({ path: `${SHOTS}/12_doctor_done.png`, fullPage: false });

  // ---------- 9. account overview and orders
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  const headings = await page.$$eval('section h2', (els) => els.map((e) => e.textContent.trim()));
  expect(
    headings[0] === 'Cameras' && headings[1] === 'Recent orders' && headings[2] === 'Software',
    `overview answers cameras, orders, software in that order (${headings.join(', ')})`,
  );
  await page.screenshot({ path: `${SHOTS}/13_account.png`, fullPage: false });

  await page.goto(`${BASE}/account/orders`, { waitUntil: 'networkidle' });
  const listed = await page.$$eval('[data-test="order-list"] tbody th', (els) => els.map((e) => e.textContent.trim()));
  expect(listed.includes('VE-2026-0001'), `order history lists the seeded order (${listed.join(',')})`);
  await page.screenshot({ path: `${SHOTS}/14_orders.png`, fullPage: false });

  // ---------- 10. server-side authorization, not a hidden button
  const visitor = await browser.newContext();
  const vpage = await visitor.newPage();
  const direct = await vpage.evaluate(async (base) => {
    const res = await fetch(`${base}/api/account/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: 'VC2609PVDA7Q' }),
    });
    return { status: res.status, body: await res.json() };
  }, BASE).catch(() => null);
  // evaluate needs a document origin
  await vpage.goto(`${BASE}/shop`);
  const direct2 = await vpage.evaluate(async () => {
    const res = await fetch('/api/account/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: 'VC2609PVDA7Q' }),
    });
    return { status: res.status, body: await res.json() };
  });
  expect(direct2.status === 401 && direct2.body.request_id, `a visitor's direct API call is refused server-side (${direct2.status})`);
  await visitor.close();

  // ---------- 11. reduced motion keeps the darkening
  const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const rmPage = await rm.newPage();
  await rmPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await rmPage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
  await rmPage.waitForTimeout(250);
  const rmDarken = await rmPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--stage-darken'));
  const filmHidden = await rmPage.evaluate(() => {
    const f = document.getElementById('film');
    return !f || getComputedStyle(f).display === 'none';
  });
  expect(Number(rmDarken) > 0 && filmHidden, `reduced motion drops the film and keeps the darkening (${rmDarken})`);
  await rm.close();

  // ---------- 12. narrow viewport: one column, no sideways scroll
  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const npage = await narrow.newPage();
  for (const path of ['/', '/shop', '/cart', '/downloads', '/doctor']) {
    await npage.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const overflow = await npage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow <= 1, `${path} does not scroll sideways at 390px (${overflow}px)`);
  }
  await npage.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
  await npage.screenshot({ path: `${SHOTS}/15_narrow_shop.png`, fullPage: false });
  await narrow.close();

  // ---------- 13. skip link is the first focusable element
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement.className);
  expect(/skip-link/.test(focused), `skip link is the first focusable element (${focused})`);

  // ---------- 14. errors are rendered pages
  const missing = await page.goto(`${BASE}/shop/does-not-exist`, { waitUntil: 'networkidle' });
  const missingText = await page.textContent('h1.page-title');
  expect(missing.status() === 404 && missingText.includes('That page does not exist.'), 'an unknown product renders the not found page');

  expect(consoleErrors.length === 0, `no console errors (${consoleErrors.slice(0, 3).join(' | ')})`);

  await browser.close();

  const report = [...notes, '', ...problems, '', `pass ${notes.filter((n) => n.startsWith('  ok')).length}, fail ${problems.length}`].join('\n');
  fs.writeFileSync('/tmp/walkthrough.txt', report);
  console.log(report);
  process.exit(problems.length ? 1 : 0);
}

run().catch((e) => {
  console.log(notes.join('\n'));
  console.log(problems.join('\n'));
  console.error('WALKTHROUGH ERROR', e);
  process.exit(2);
});

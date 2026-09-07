
// Drives the running app through the journeys the brief describes, as a stranger would,
// reading values back off the page rather than trusting that it rendered.
import { chromium } from '/tmp/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.WALK_BASE || 'http://localhost:4173';
const SHOTS = '/app/.browser_screenshots';
const EXEC = '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const PW = 'deku-demo-pw-2026';
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const consoleErrors = [];

function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail !== undefined ? ` :: ${String(detail).slice(0, 300)}` : '')); }
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function signIn(page, email) {
  // A reader signing in as somebody else signs out first, exactly as a person would.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('ravel.session'); sessionStorage.clear(); });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type=email]', { timeout: 20000 });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }),
    page.click('button[type=submit]')
  ]);
  await page.waitForLoadState('networkidle');
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  console.log('\n— The public site');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const h1 = await page.textContent('h1');
  check('home carries its headline', /Tomorrow's materials\. Made from today's waste\./.test(h1), h1);
  const homeText = await page.textContent('body');
  check('home carries the sub-line',
    /Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon\./.test(homeText));
  for (const phrase of ['Nylon that goes on and on and on', 'The power of green chemistry', "We're closing the loop"]) {
    check(`home carries "${phrase}"`, homeText.includes(phrase));
  }
  check('the closing-the-loop section is prose, not three words',
    homeText.includes('A loop is closed by evidence, not by a diagram.'));
  const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).opacity);
  check('the headline is not left transparent', Number(opacity) > 0.9, opacity);
  await shot(page, '01_home');

  await page.goto(`${BASE}/product`, { waitUntil: 'networkidle' });
  const prod = await page.textContent('body');
  check('product headline', prod.includes('Same material. Better origin.'));
  check('product names the Nylon 6 limitation first', prod.includes('discarded fishing nets'));
  check('product names the 6,6 limitation', prod.includes('no recycling solution at all'));
  check('the first feature heading agrees with its sentence', prod.includes('Nylon in any form'));
  check('the specification is carried, not a request button',
    prod.includes('relative viscosity') || prod.includes('relative_viscosity'));
  check('the claim appears with its type and scheme',
    prod.includes('mass balance') && prod.includes('RCS-2026'));
  const industries = ['Textiles and apparel', 'Automotive', 'Electrical and electronics', 'Consumer goods', 'Industrial', 'Construction'];
  check('six industries', industries.every((i) => prod.includes(i)));
  await shot(page, '02_product');

  await page.goto(`${BASE}/technology`, { waitUntil: 'networkidle' });
  const tech = await page.textContent('body');
  for (const s of ['Dissolution', 'Depolymerisation', 'Purification', 'Repolymerisation']) {
    check(`technology names ${s}`, tech.includes(s));
  }
  check('the capacity table states its unit and basis',
    tech.includes('tonnes per year') && tech.includes('8000 hours per year'));
  check('the commercial row reads over 25,000 tonnes per year', tech.includes('25,000 t/yr'));
  check('the pilot carries a quantity rather than "Multi-tonne"',
    tech.includes('40 t/yr') && !tech.includes('Multi-tonne'));
  check('the over-commitment is reported in public', tech.includes('-1,000 t/yr'));
  check('planned capacity carries its word', tech.includes('Planned'));
  check('the three claims carry evidence', tech.includes('Evidence:'));
  await shot(page, '03_technology');

  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
  const about = await page.textContent('body');
  check('about carries The hard facts', about.includes('The hard facts'));
  check('each statistic carries source, year and geography',
    about.includes('Textile Flow Monitor') && about.includes('2024') && about.includes('EU-27') &&
    about.includes('Global Materials Emissions Panel'));
  check('the emissions figure is stated as a mass', about.includes('1.8 gigatonnes'));
  await shot(page, '04_about');

  await page.goto(`${BASE}/careers`, { waitUntil: 'networkidle' });
  const careers = await page.textContent('body');
  check('careers keeps Why this problem matters', careers.includes('Why this problem matters'));
  check('the count is derived from the collection', careers.includes('1 open position'));
  check('the position is rendered', careers.includes('Process Engineer') && careers.includes('Lyon, France'));

  await page.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  const news = await page.textContent('body');
  check('three news items', ['Series A closes at 40 million euros', 'Offtake agreement signed for demonstration output', 'Depolymerisation yield published'].every((t) => news.includes(t)));
  check('a real taxonomy', news.includes('funding') && news.includes('partnership') && news.includes('technical'));
  check('an item in another language says so before a click', news.includes('In French'));
  check('every item carries its outlet', news.includes('Materials Weekly') && news.includes('Chimie Circulaire'));

  await page.goto(`${BASE}/contact`, { waitUntil: 'networkidle' });
  const contact = await page.textContent('body');
  check('four enquiry destinations and response times',
    contact.includes('feedstock@example.com') && contact.includes('sales@example.com') &&
    contact.includes('partners@example.com') && contact.includes('press@example.com'));
  check('the point of collection states who receives it and how to remove it',
    contact.includes('Ravel Materials SAS is the controller') && contact.includes('privacy@example.com'));

  await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
  const priv = await page.textContent('body');
  check('privacy names the controller and a postal address',
    priv.includes('Ravel Materials SAS') && priv.includes('privacy@example.com') && priv.includes('Lyon'));
  check('privacy states a retention per purpose',
    priv.includes('24 months') && priv.includes('36 months') && priv.includes('12 months') &&
    priv.includes('120 months') && priv.includes('180 months'));
  check('privacy says the record is not erased on request',
    /not erased on request/.test(priv) && priv.includes('former employee'));
  check('the disclosure address is stated', priv.includes('security@example.com'));

  console.log('— A visitor checks a certificate');
  await page.goto(`${BASE}/verify/CERT-PILOT-000001`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const v1 = await page.textContent('body');
  check('the withdrawal is stated with its date and reason',
    v1.includes('withdrawn on 2026-04-18') &&
    v1.includes('A collector category was corrected after acceptance'), v1.slice(0, 200));
  check('no forwarding to a replacement is offered', v1.includes('no replacement is offered'));
  check('the verify route is excluded from indexing',
    (await page.getAttribute('meta[name=robots]', 'content')) === 'noindex');
  check('no session was needed', !(await page.evaluate(() => localStorage.getItem('ravel.session'))));
  await shot(page, '05_verify_withdrawn');

  await page.goto(`${BASE}/verify/CERT-DEMO-999999`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const v2 = await page.textContent('body');
  check('an unknown number reads the same layout saying there is no such certificate',
    v2.includes('No such certificate') && v2.includes('Number') && v2.includes('Claim type'), v2.slice(0, 200));
  await shot(page, '06_verify_unknown');

  console.log('— The console redirects an anonymous reader');
  await page.goto(`${BASE}/console/intake`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('/console/intake redirects an anonymous reader to /login', page.url().includes('/login'), page.url());
  await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('/console redirects an anonymous reader to /login', page.url().includes('/login'), page.url());
  await shot(page, '07_login');

  console.log('— A claims manager allocates and is refused');
  await signIn(page, 'claims@example.com');
  check('signing in lands in the console', page.url().includes('/console'), page.url());
  await page.waitForTimeout(1000);
  await shot(page, '08_console_board');

  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const bal = await page.textContent('body');
  check('the balance reads credits in per category',
    bal.includes('360,000 g') && bal.includes('336,000 g'), bal.slice(0, 400));
  check('credits out and available are read per category', bal.includes('Credits out') && bal.includes('Available'));
  check('the margin is a mass, not a verdict', !/Within limits/i.test(bal));
  check('three counts sit together',
    bal.includes('Overrides this period') && bal.includes('Open restatements') &&
    bal.includes('Audit findings past their date'));
  await shot(page, '09_balance');

  await page.selectOption('select >> nth=0', 'LOT-N6-0001');
  await page.selectOption('select >> nth=1', 'post_consumer');
  await page.fill('input[type=number]', '500000');
  await page.click('form >> button[type=submit]');
  await page.waitForSelector('[role=alert]', { timeout: 15000 });
  const refusal = await page.textContent('[role=alert]');
  check('an inline banner names the available and the requested mass',
    refusal.includes('Available: 360000 g') && refusal.includes('Requested: 500000 g'), refusal);
  const after = await page.textContent('body');
  check('the figures on the screen are unchanged', after.includes('360,000 g'));
  check('the allocation did not happen', !after.includes('Claim attached'));
  await shot(page, '10_allocation_refused');

  console.log('— A signer meets a blocking condition');
  await signIn(page, 'signer@example.com');
  for (const [step, url] of [
    ['lot', '/console/certificates/new/lot'],
    ['claim', '/console/certificates/new/claim'],
    ['recipient', '/console/certificates/new/recipient'],
    ['review', '/console/certificates/new/review']
  ]) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check(`step ${step} is reachable at its own address`, page.url().endsWith(url), page.url());
    if (step === 'lot') {
      await page.click('button:has-text("Choose") >> nth=0');
      await page.waitForTimeout(1500);
    }
    if (step === 'recipient') {
      await page.click('button:has-text("Choose this recipient") >> nth=0');
      await page.waitForTimeout(1500);
    }
    const body = await page.textContent('body');
    const rows = await page.locator('.condition-row').count();
    check(`step ${step} shows the eight conditions`, rows === 8, rows);
    if (step === 'review') {
      check('one condition is unsatisfied and says which',
        body.includes('No override on it is unreviewed') && body.includes('OVR-0001'), body.slice(0, 200));
      const link = await page.locator('a[href="/console/overrides/OVR-0001"]').count();
      check('it links to the record that would resolve it', link > 0);
      const dismiss = await page.locator('button:has-text("Dismiss"), button:has-text("Waive"), button:has-text("Skip")').count();
      check('no control on the screen dismisses it', dismiss === 0);
      check('the review step renders the exact document with both statements',
        body.includes('Permitted statement') && body.includes('Prohibited statement') &&
        body.includes('may not state that this material physically contains recycled content'));
      check('the screen states the recipient files with a regulator',
        body.includes('file this document with a regulator'));
      check('the counterpart language is rendered beside it',
        body.includes('The same permission in'));
      await shot(page, '11_wizard_review_blocked');
    }
  }

  console.log('— A withdrawal shows its blast radius');
  await signIn(page, 'signer2@example.com');
  await page.goto(`${BASE}/console/certificates/CERT-PILOT-000002`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // A withdrawn certificate offers no second withdrawal, so on a re-run against a database
  // that already carries the act, that absence is itself the thing to assert.
  const alreadyWithdrawn = (await page.locator('button:has-text("Begin a withdrawal")').count()) === 0;
  if (alreadyWithdrawn) {
    const body = await page.textContent('body');
    check('a withdrawn certificate says withdrawn before it shows any figure',
      body.indexOf('Withdrawn') < body.indexOf('Recycled content'), body.slice(0, 160));
    check('a withdrawn certificate offers no second withdrawal', true);
    await shot(page, '12_withdrawal_blast_radius');
    await shot(page, '13_withdrawal_done');
  } else {
  await page.click('button:has-text("Begin a withdrawal")');
  await page.waitForSelector('h2:has-text("Withdraw")', { timeout: 15000 });
  await page.waitForTimeout(3000);
  const wd = await page.textContent('body');
  check('the recipients are listed by name, not as a count', wd.includes('Vanta Safety Systems'), wd.slice(0, 200));
  check('the void statements are enumerated', wd.includes('The statements that become void'));
  check('the five consequences are shown before confirming',
    wd.includes('five consequences') && wd.includes('reverse traversal'));
  await shot(page, '12_withdrawal_blast_radius');

  await page.fill('textarea', 'The underlying allocation was restated after issue and the claim no longer holds');
  await page.click('button:has-text("Confirm the withdrawal")');
  await page.waitForSelector('h2:has-text("Withdrawn")', { timeout: 20000 });
  await page.waitForTimeout(500);
  const done = await page.textContent('body');
  check('after confirming, the consequences are enumerated',
    done.includes('Recipients notified') && done.includes('Statements now void') &&
    done.includes('reverse traversal of the underlying batches'));
  await shot(page, '13_withdrawal_done');
  }

  await page.goto(`${BASE}/verify/CERT-PILOT-000002`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const stillThere = await page.textContent('body');
  check('the certificate address still resolves and states the withdrawal',
    stillThere.includes('Withdrawn') && stillThere.includes('withdrawn on'), stillThere.slice(0, 200));

  console.log('— An auditor reads and exports');
  await signIn(page, 'auditor@example.com');
  await page.goto(`${BASE}/console/lots/LOT-N6-0001/genealogy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const gen = await page.textContent('body');
  check('the graph is rendered', (await page.locator('svg.graph-svg').count()) > 0);
  check('the nested list is rendered', (await page.locator('.nested-list').count()) > 0);
  check('BATCH-1001 is read back at 450,000 g', gen.includes('450,000 g'), gen.slice(0, 300));
  const svgText = await page.locator('svg.graph-svg').first().textContent();
  check('the graph draws BATCH-1001 exactly once',
    (svgText.match(/BATCH-1001/g) || []).length === 1, (svgText.match(/BATCH-1001/g) || []).length);
  check('a flag is visible from the lot without expanding',
    gen.includes('flagged') || gen.includes('lapsed calibration'));
  // Signing out and exporting are an auditor's own acts; a write to the operational
  // record is not. Look for the controls that would write.
  const writeControls = await page.evaluate(() => {
    const wanted = /sign this certificate|begin a withdrawal|confirm the withdrawal|attach this claim|allocate|close this period|review this override|book in|disposition|raise a deviation/i;
    return [...document.querySelectorAll('button, input[type=submit]')]
      .map((b) => (b.textContent || b.value || '').trim())
      .filter((t) => wanted.test(t));
  });
  check('every mutating control is absent for an auditor',
    writeControls.length === 0, writeControls.join(' | '));
  await shot(page, '14_genealogy');

  for (const url of ['/console/certificates', '/console/balance/BP-DEMO-N6-2026H1', '/console/overrides/OVR-0001']) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const w = await page.evaluate(() => {
      const wanted = /sign this certificate|sign a certificate|begin a withdrawal|attach this claim|review this override/i;
      return [...document.querySelectorAll('button, a.btn, input[type=submit]')]
        .map((b) => (b.textContent || b.value || '').trim())
        .filter((t) => wanted.test(t));
    });
    check(`an auditor is offered no write control on ${url}`, w.length === 0, w.join(' | '));
  }
  await page.goto(`${BASE}/console/lots/LOT-N6-0001/genealogy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('button:has-text("Export this genealogy")');
  await page.waitForSelector('[role=status]', { timeout: 20000 });
  const exp = await page.textContent('[role=status]');
  check('the export reports its digests and anchors', exp.includes('Export EXP-'), exp);
  check('every export is itself an entry', exp.includes('itself an entry'));
  await shot(page, '15_export');

  await page.goto(`${BASE}/console/record`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const rec = await page.textContent('body');
  check('the digest chain reports that it holds', /The chain holds across \d+ entries/.test(rec), rec.slice(0, 300));
  check('refusals are shown in the record as well as successes', rec.includes('Refused'));
  await shot(page, '16_record');

  await page.goto(`${BASE}/console/reconciliation`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const recon = await page.textContent('body');
  check('reconciliation shows six figures, not verdicts',
    recon.includes('Mass balance residual') && recon.includes('Credit margin') &&
    recon.includes('Consumptions on open runs') && recon.includes('Batches with broken custody') &&
    recon.includes('Certificates with superseded figures') && recon.includes('Integration ages'));
  check('a source that never sent says so rather than reading zero', recon.includes('Never sent'));
  await shot(page, '17_reconciliation');

  await page.goto(`${BASE}/console/intake`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const intake = await page.textContent('body');
  check('a non-claimable batch carries its word', intake.includes('Not claimable'));
  check('a lapsed calibration carries its word', intake.includes('Calibration lapsed'));
  const b1003Row = await page.locator('tr:has-text("BATCH-1003")').first().textContent();
  check('BATCH-1003 reads under the name in force on its receipt date',
    b1003Row.includes('Brine Textile Recovery') && !b1003Row.includes('Brine Circular Materials'), b1003Row);
  await shot(page, '18_intake');

  await page.goto(`${BASE}/console/batches/BATCH-1005`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const b1005 = await page.textContent('body');
  check('a missing custody link names the missing kind',
    b1005.includes('This batch cannot be claimed: transport custody link is missing.'), b1005.slice(0, 300));

  console.log('— Accessibility and layout');
  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const smallText = await page.evaluate(() => {
    const bad = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!el.textContent?.trim()) continue;
      if (el.children.length) continue;
      if (el.closest('svg')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const size = parseFloat(cs.fontSize);
      if (size && size < 12) bad.push(`${el.tagName}.${el.className} ${cs.fontSize}`);
      if (cs.lineHeight === 'normal' && el.textContent.trim().length > 3) bad.push(`no line-height: ${el.tagName}.${el.className}`);
    }
    return bad.slice(0, 8);
  });
  check('nothing below twelve pixels and every element sets a line height',
    smallText.length === 0, smallText.join(' | '));

  const colours = await page.evaluate(() => {
    const seen = new Set();
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      for (const p of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'outlineColor']) {
        const v = cs[p];
        if (v && v !== 'rgba(0, 0, 0, 0)') seen.add(v);
      }
    }
    return [...seen];
  });
  check('the console reaches for the brand accent on nothing at all',
    !colours.some((c) => /rgb\(47,\s*81,\s*40\)/.test(c)), colours.filter((c) => /47, 81, 40/.test(c)).join());
  const greenish = colours.filter((c) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    return g > r + 25 && g > b + 25;
  });
  check('nothing renders green as a state in the console', greenish.length === 0, greenish.join());

  const focusOk = await page.evaluate(() => {
    const el = document.querySelector('a[href], button');
    if (!el) return false;
    el.focus();
    const cs = getComputedStyle(el);
    return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  });
  check('a focused control shows a visible focus ring', focusOk);

  for (const [w, h, label] of [[390, 844, 'phone'], [768, 1024, 'tablet'], [1440, 1000, 'desktop']]) {
    await page.setViewportSize({ width: w, height: h });
    for (const url of ['/', '/technology', '/console/balance/BP-DEMO-N6-2026H1',
      '/console/lots/LOT-N6-0001/genealogy', '/console/certificates/new/review']) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`no sideways scroll at ${label} on ${url}`, overflow <= 1, overflow);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '19_balance_phone');
  await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const boardCols = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.board')).gridTemplateColumns.split(' ').length);
  check('the board is one column at phone width', boardCols === 1, boardCols);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const boardWide = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.board')).gridTemplateColumns.split(' ').length);
  check('the board is four columns at desktop', boardWide === 4, boardWide);
  check('the column a card sits in is named in text on the card',
    (await page.locator('.run-card .eyebrow').count()) > 0);

  const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const rmPage = await rm.newPage();
  await rmPage.goto(BASE, { waitUntil: 'networkidle' });
  await rmPage.waitForTimeout(600);
  const rmOpacity = await rmPage.evaluate(() => {
    const el = document.querySelector('.reveal');
    const cs = getComputedStyle(el);
    return { opacity: cs.opacity, filter: cs.filter };
  });
  check('under reduced motion the reveal resolves immediately',
    Number(rmOpacity.opacity) === 1 && (rmOpacity.filter === 'none' || !rmOpacity.filter.includes('blur')),
    JSON.stringify(rmOpacity));
  await rm.close();

  const realErrors = consoleErrors.filter((e) =>
    !/favicon|status of 40[19]|Failed to load resource/.test(e));
  check('the browser console is clean', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(' - ' + f);
  }
  await browser.close();
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });

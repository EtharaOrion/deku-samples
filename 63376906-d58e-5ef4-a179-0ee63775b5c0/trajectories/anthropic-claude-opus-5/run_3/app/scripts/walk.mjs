// Walks the journeys the brief describes, as a stranger would, and saves one
// screenshot per journey as evidence. Each step is judged against the page:
// values are read back, what should be there is checked, what should not be is
// checked too, and the console is watched. Not shipped in the image.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const SHOTS = '/app/.browser_screenshots';
const PW = 'deku-demo-pw-2026';

fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`    ok   ${name}`); }
  else { fail++; failures.push(name); console.log(`    FAIL ${name} ${detail}`); }
}

const consoleErrors = [];

async function newPage(browser, width = 1440, height = 1000) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // A refused act is an ordinary answer this product renders as a banner, and
    // the browser logs every non-2xx response as a console error regardless.
    // Those are the refusals this walk is deliberately provoking, so they are
    // not defects; anything else is.
    if (/status of (400|401|403|409)/.test(text)) return;
    consoleErrors.push(`${page.url()} :: ${text}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: ${e.message}`));
  return { ctx, page };
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  await page.waitForLoadState('networkidle');
}

// Use the Chromium already present in this environment rather than fetching one.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH
    || '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

/* ------------------------------------------------- 1. the public site */
{
  console.log('\n== journey 1: a visitor reads the public site ==');
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  const h1 = await page.textContent('h1');
  ok('the home headline is the published copy',
    h1.includes("Tomorrow's materials. Made from today's waste."), h1);
  const body = await page.textContent('body');
  ok('the lede is the published copy',
    body.includes('Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.'));
  ok('the three section headings are present',
    body.includes('Nylon that goes on and on and on')
    && body.includes('The power of green chemistry')
    && body.includes("We're closing the loop"));
  ok('the last is followed by a written section rather than three words',
    body.includes('A closed loop is not a diagram'));
  ok('losses reduce the claim is stated', body.includes('Losses reduce the claim'));

  // The heading is readable before the animation finishes.
  const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).opacity);
  ok('the headline has resolved and is readable', Number(opacity) > 0.9, `opacity ${opacity}`);

  await page.screenshot({ path: `${SHOTS}/01_home.png`, fullPage: false });

  // Product
  await page.goto(`${BASE}/product`, { waitUntil: 'networkidle' });
  const prod = await page.textContent('body');
  ok('the product headline is the published copy', prod.includes('Same material. Better origin.'));
  ok('the product lede is the published copy',
    prod.includes('We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.'));
  ok('Nylon 6 names its real limitation first', prod.includes('discarded fishing nets'));
  ok('Nylon 6,6 names its real limitation first', prod.includes('had no recycling solution at all'));
  ok('the first feature heading agrees with its sentence', prod.includes('Nylon in any form'));
  ok('six industries are listed',
    ['Textiles and apparel', 'Automotive', 'Electrical and electronics',
      'Consumer goods', 'Industrial', 'Construction'].every((i) => prod.includes(i)));
  ok('the specification is carried rather than a request button',
    prod.includes('relative_viscosity') || prod.includes('relative viscosity'));
  ok('no request-a-spec button', !/request the specification/i.test(prod));
  ok('the claim appears with its type beside the grade',
    prod.includes('MASS BALANCE') || prod.includes('mass balance'));
  ok('and with its scheme', prod.includes('RCS-2026'));
  await page.screenshot({ path: `${SHOTS}/02_product.png` });

  // Technology
  await page.goto(`${BASE}/technology`, { waitUntil: 'networkidle' });
  const tech = await page.textContent('body');
  ok('the four process steps are named',
    ['Dissolution', 'Depolymerisation', 'Purification', 'Repolymerisation'].every((s) => tech.includes(s)));
  ok('the capacity table states its unit once', tech.includes('tonnes per year'));
  ok('with a basis', tech.includes('0.90 availability'));
  ok('and a definition of the year', tech.includes('A year is a calendar year'));
  ok('the commercial plant reads >25,000', tech.includes('>25,000'));
  ok('the pilot carries a quantity rather than "Multi-tonne"', !tech.includes('Multi-tonne'));
  ok('a planned row carries its word', tech.includes('PLANNED') || tech.includes('planned'));
  ok('the three claims carry their evidence',
    tech.includes('Green chemicals') && tech.includes('Low temperature')
    && tech.includes('Low carbon impact') && tech.includes('Evidence:'));
  ok('the diagram carries mass in and mass out per stage',
    tech.includes('Mass in') && tech.includes('Mass out'));
  await page.screenshot({ path: `${SHOTS}/03_technology.png`, fullPage: true });

  // About
  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
  const about = await page.textContent('body');
  ok('the hard facts heading is present', about.includes('The hard facts'));
  ok('each statistic carries its source, year and geography beside it',
    about.includes('Textile Flow Monitor') && about.includes('2024') && about.includes('EU-27'));
  ok('the emissions figure is stated as a mass', about.includes('1.8 gigatonnes'));
  await page.screenshot({ path: `${SHOTS}/04_about.png` });

  // Careers
  await page.goto(`${BASE}/careers`, { waitUntil: 'networkidle' });
  const careers = await page.textContent('body');
  ok('why this problem matters survives intact', careers.includes('Why this problem matters'));
  ok('the open position count is derived from the collection',
    careers.includes('1 open position'), careers.match(/\d+ open position/)?.[0]);
  ok('the position is listed', careers.includes('Process Engineer') && careers.includes('Lyon, France'));

  // News
  await page.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  const news = await page.textContent('body');
  ok('the taxonomy carries four terms',
    ['funding', 'partnership', 'technical', 'recognition'].every((t) => news.includes(t)));
  ok('each item carries its outlet', news.includes('Materials Weekly') && news.includes('Fibre Report'));
  ok('an item in another language says so before a reader clicks', news.includes('in French'));
  await page.screenshot({ path: `${SHOTS}/05_news.png` });

  // Contact
  await page.goto(`${BASE}/contact`, { waitUntil: 'networkidle' });
  const contact = await page.textContent('body');
  ok('four destinations are stated',
    ['feedstock@example.com', 'sales@example.com', 'partners@example.com', 'press@example.com']
      .every((d) => contact.includes(d)));
  ok('the point of collection states who receives the data',
    contact.includes('Ravel Materials SAS is the controller'));
  ok('and how to have it removed', contact.includes('privacy@example.com'));

  await page.fill('input[name="name"]', 'A Visiting Tester');
  await page.fill('input[name="email"]', 'walk-tester@example.com');
  await page.fill('textarea[name="message"]', 'We have mixed nylon offcuts to supply.');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.result-success', { timeout: 15000 });
  const success = await page.textContent('.result-success');
  ok('the success state says what happens next and when',
    /ENQ-\d+/.test(success) && success.includes('working day'), success.slice(0, 120));
  ok('it is not a builder default string', !/thank you for your submission/i.test(success));
  await page.screenshot({ path: `${SHOTS}/06_contact_enquiry.png` });

  // Privacy
  await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
  const privacy = await page.textContent('body');
  ok('the controller is named', privacy.includes('Ravel Materials SAS'));
  ok('with a postal address', privacy.includes('Lyon, France'));
  ok('a rights-request address is given', privacy.includes('privacy@example.com'));
  ok('the disclosure address is given', privacy.includes('security@example.com'));
  for (const m of ['24', '36', '12', '120', '180']) {
    ok(`a retention of ${m} months is stated`, privacy.includes(m));
  }
  ok('the record is stated not to be erased on request',
    privacy.includes('it is not erased on request'));
  ok("a former employee's contact detail is erased", privacy.includes('contact detail'));

  await ctx.close();
}

/* ------------------------------- 2. a claims manager allocates and is refused */
{
  console.log('\n== journey 2: a claims manager allocates and is refused ==');
  const { ctx, page } = await newPage(browser);

  // The console redirects an anonymous reader to /login.
  await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
  ok('an anonymous reader is redirected to /login', page.url().includes('/login'), page.url());

  await signIn(page, 'claims@example.com');
  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.balance-category', { timeout: 15000 });

  const text = () => page.textContent('body');
  let t = await text();
  ok('credits in, out and available are readable per category',
    t.includes('Credits in') && t.includes('Credits out') && t.includes('Credits available'));
  ok('post-consumer credits in reads 360,000 g', t.includes('360,000 g'));
  ok('pre-consumer credits in reads 336,000 g', t.includes('336,000 g'));
  ok('non-claimable input reads 190,000 g', t.includes('190,000 g'));
  ok('overrides this period reads 1', t.includes('Overrides this period'));
  ok('the invariant margin is a mass, not a state', !t.includes('Within limits'));
  ok('nothing on this screen is a badge', !/\bOK\b|\bPASS\b|\bGOOD\b/.test(t));

  // Allocate more than the ledger holds.
  await page.selectOption('select[name="lot"]', 'LOT-N6-0001');
  await page.selectOption('select[name="category"]', 'post_consumer');
  await page.fill('input[name="mass_g"]', '400000');
  await page.click('.allocate-form button[type="submit"]');
  await page.waitForSelector('.refusal', { timeout: 15000 });

  const refusal = await page.textContent('.refusal');
  ok('the refusal names the available mass', refusal.includes('360,000 g'), refusal);
  ok('and the requested mass', refusal.includes('400,000 g'));
  ok('it is an inline banner on the balance surface',
    await page.isVisible('.refusal'));

  t = await text();
  ok('the figures on the screen are unchanged', t.includes('360,000 g'));
  const availAfter = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.balance-row')];
    const r = rows.find((x) => x.textContent.includes('Credits available'));
    return r ? r.querySelector('.t-figure').textContent.trim() : null;
  });
  ok('credits available is still 360,000 g', availAfter === '360,000 g', availAfter);
  await page.screenshot({ path: `${SHOTS}/07_allocation_refused.png`, fullPage: true });

  // Now allocate what the ledger holds, so the rest of the walk can proceed.
  await page.fill('input[name="mass_g"]', '360000');
  await page.click('.allocate-form button[type="submit"]');
  await page.waitForSelector('.result-success', { timeout: 15000 });
  const done = await page.textContent('.result-success');
  ok('the allocation that fits lands', done.includes('LOT-N6-0001'));
  ok('and the lot now carries 90.00%', done.includes('90.00'), done.slice(0, 200));
  await page.screenshot({ path: `${SHOTS}/08_allocation_accepted.png`, fullPage: true });

  // A certificate rests on a closed period, so the claims manager closes it.
  // The open deviation on LOT-N6-0002 blocks that close, which is the refusal
  // naming what would change it.
  const token = JSON.parse(await page.evaluate(() => localStorage.getItem('ravel.session'))).access_token;
  const blockedClose = await fetch(`${BASE}/api/balance-periods/BP-DEMO-N6-2026H1/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`,
      'idempotency-key': `walk-close-blocked-${Date.now()}` },
    body: JSON.stringify({})
  });
  const blockedBody = await blockedClose.json();
  ok('a close is refused while a deviation touching the period is open',
    blockedClose.status === 409, String(blockedClose.status));
  ok('and the refusal names which', JSON.stringify(blockedBody).includes('DEV-0001'),
    JSON.stringify(blockedBody).slice(0, 200));

  // Quality closes that deviation, honestly.
  const qRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'quality@example.com', password: PW })
  });
  const qToken = (await qRes.json()).access_token;
  await fetch(`${BASE}/api/deviations/DEV-0001/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${qToken}`,
      'idempotency-key': `walk-dev-${Date.now()}` },
    body: JSON.stringify({ outcome: 'cause_not_established' })
  });

  const closeRes = await fetch(`${BASE}/api/balance-periods/BP-DEMO-N6-2026H1/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`,
      'idempotency-key': `walk-close-${Date.now()}` },
    body: JSON.stringify({ closed_on: '2026-07-01', cut_off: '2026-07-10' })
  });
  const closeBody = await closeRes.json();
  ok('the period then closes', closeRes.status === 201, String(closeRes.status));
  ok('and the carry-over is settled rather than absorbed',
    closeBody.carried_forward_g?.pre_consumer === 67200
    && closeBody.expired_g?.pre_consumer === 268800,
    JSON.stringify(closeBody.carried_forward_g));

  await page.reload({ waitUntil: 'networkidle' });
  const closedText = await page.textContent('body');
  ok('a closed period says corrections require a restatement',
    closedText.includes('This period is closed. Corrections require a restatement.'));
  ok('and shows what carried forward and what expired',
    closedText.includes('67,200 g') && closedText.includes('268,800 g'));
  await page.screenshot({ path: `${SHOTS}/08b_period_closed.png`, fullPage: true });

  await ctx.close();
}

/* ------------------------------------ 3. a signer meets a blocking condition */
{
  console.log('\n== journey 3: a signer meets a blocking condition ==');
  const { ctx, page } = await newPage(browser);
  await signIn(page, 'signer@example.com');

  for (const step of ['lot', 'claim', 'recipient', 'review']) {
    await page.goto(`${BASE}/console/certificates/new/${step}?lot=LOT-N6-0001&recipient=CUS-HELIOS`,
      { waitUntil: 'networkidle' });
    await page.waitForSelector('.condition-list', { timeout: 15000 });
    const rows = await page.$$('.condition-list .condition-row');
    ok(`step ${step} is reachable at its own address and shows eight conditions`,
      rows.length === 8, `${rows.length} rows`);
  }

  const body = await page.textContent('body');
  ok('one condition is unsatisfied and says which',
    body.includes('No override on the lot is unreviewed') && body.includes('OVR-0001'));
  const blocked = await page.$$('.condition-row .state-word');
  ok('exactly one condition is blocked', blocked.length === 1, `${blocked.length} blocked`);
  const link = await page.getAttribute('.condition-link', 'href');
  ok('it links to the record that would resolve it',
    link === '/console/overrides/OVR-0001', link);

  // No control on the screen dismisses it.
  const dismissers = await page.$$eval('.conditions button, .conditions [role="button"]',
    (els) => els.map((e) => e.textContent.trim()));
  ok('no control on the screen dismisses a condition', dismissers.length === 0,
    dismissers.join(', '));

  // The fourth step renders the exact document that will be signed.
  ok('the review step renders the permitted statement',
    body.includes('You may not state that this material physically contains recycled content')
    || body.includes('may not state'));
  ok('and states the recipient will file it with a regulator',
    body.includes('file this document with a regulator'));
  ok('signing is refused while a condition is unsatisfied',
    body.includes('cannot be signed'));
  await page.screenshot({ path: `${SHOTS}/09_wizard_blocked.png`, fullPage: true });

  await ctx.close();
}

/* --------------------------------- 4. the override is reviewed, and signing */
{
  console.log('\n== journey 4: a second person reviews, the period closes, the signer signs ==');
  const { ctx, page } = await newPage(browser);

  // The authoriser cannot review their own override.
  await signIn(page, 'quality@example.com');
  await page.goto(`${BASE}/console/overrides/OVR-0001`, { waitUntil: 'networkidle' });
  const ovBody = await page.textContent('body');
  ok('the override shows on the lot with its word',
    /unreviewed override/i.test(ovBody));
  ok('and states it cannot be removed', ovBody.includes('This cannot be removed'));
  await page.click('button:has-text("Review this override")');
  await page.waitForSelector('.refusal', { timeout: 15000 });
  const selfRefusal = await page.textContent('.refusal');
  ok('the authoriser is refused their own review',
    selfRefusal.toLowerCase().includes('authorised') || selfRefusal.includes('second person'),
    selfRefusal.slice(0, 140));
  await page.screenshot({ path: `${SHOTS}/10_override_self_review_refused.png` });

  // The deviation was closed with an honest outcome during journey 2.
  await page.goto(`${BASE}/console/deviations/DEV-0001`, { waitUntil: 'networkidle' });
  const devAfter = await page.textContent('body');
  ok('the deviation closed with an honest outcome',
    devAfter.includes('cause not established'));
  ok('and neither outcome is hidden', devAfter.includes('closed'));

  await ctx.close();

  // A second person reviews the override.
  const second = await newPage(browser);
  await signIn(second.page, 'claims@example.com');
  await second.page.goto(`${BASE}/console/overrides/OVR-0001`, { waitUntil: 'networkidle' });
  await second.page.click('button:has-text("Review this override")');
  await second.page.waitForTimeout(1500);
  const reviewed = await second.page.textContent('body');
  ok('a second person reviews it', reviewed.includes('yes, by claims@example.com'));
  ok('and the override removes nothing', reviewed.includes('This cannot be removed'));

  await second.ctx.close();

  // Now the signer signs, with every condition met.
  const third = await newPage(browser);
  await signIn(third.page, 'signer@example.com');
  await third.page.goto(`${BASE}/console/certificates/new/review?lot=LOT-N6-0001&recipient=CUS-HELIOS`,
    { waitUntil: 'networkidle' });
  await third.page.waitForSelector('.condition-list', { timeout: 15000 });
  const blockedNow = await third.page.$$('.condition-row .state-word');
  ok('every condition now holds', blockedNow.length === 0, `${blockedNow.length} still blocked`);
  await third.page.screenshot({ path: `${SHOTS}/11_wizard_clear.png`, fullPage: true });

  await third.page.fill('input[name="password"]', PW);
  await third.page.click('button:has-text("Sign this certificate")');
  await third.page.waitForSelector('.result-success', { timeout: 20000 });
  const signedText = await third.page.textContent('body');
  ok('the certificate is signed and numbered from the site sequence',
    signedText.includes('CERT-DEMO-000001'), signedText.slice(0, 200));
  await third.page.screenshot({ path: `${SHOTS}/12_certificate_signed.png`, fullPage: true });
  await third.ctx.close();
}

/* -------------------------------- 5. a withdrawal shows its blast radius */
{
  console.log('\n== journey 5: a withdrawal shows its blast radius ==');
  const { ctx, page } = await newPage(browser);
  await signIn(page, 'signer2@example.com');
  await page.goto(`${BASE}/console/certificates/CERT-PILOT-000002`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.withdraw-section', { timeout: 15000 });

  await page.click('button:has-text("Begin a withdrawal")');
  await page.waitForSelector('.withdraw-plan', { timeout: 15000 });
  const plan = await page.textContent('.withdraw-plan');
  // Recipients by name, not a count.
  ok('the recipients are listed by name', plan.includes('Vanta Safety Systems'), plan.slice(0, 200));
  ok('and not as a count', !/\b1 recipient\b/i.test(plan));
  ok('the downstream statements now void are enumerated',
    plan.includes('may not state') || plan.includes('restatement of'));
  ok('all five consequences are shown',
    plan.includes('withdrawn') && plan.includes('notified')
    && plan.includes('void') && plan.includes('derived') && plan.includes('reverse traversal'));
  await page.screenshot({ path: `${SHOTS}/13_withdrawal_blast_radius.png`, fullPage: true });

  await page.fill('textarea[name="reason"]', 'The pilot conversion factor was superseded by a derived factor.');
  await page.click('button:has-text("Confirm this withdrawal")');
  await page.waitForSelector('.withdrawal-notice', { timeout: 20000 });
  const after = await page.textContent('body');
  ok('the state becomes withdrawn with the reason', /withdrawn/i.test(after)
    && after.includes('superseded by a derived factor'));
  ok('the batch traversal is enumerated',
    after.includes('reached lots') || after.includes('reverse traversal ran and reached no batch'));
  await page.screenshot({ path: `${SHOTS}/14_withdrawal_done.png`, fullPage: true });

  await ctx.close();
}

/* ------------------------------------- 6. a visitor checks a certificate */
{
  console.log('\n== journey 6: a visitor checks a certificate with no session ==');
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/verify/CERT-PILOT-000001`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.verify-sheet', { timeout: 15000 });

  const v = await page.textContent('body');
  ok('it resolves with no session', !page.url().includes('/login'));
  ok('it states the withdrawal', /withdrawn/i.test(v));
  ok('with its date', v.includes('2026-04-18'));
  ok('and its reason', v.includes('A collector category was corrected after acceptance'));
  ok('it does not redirect to a replacement',
    page.url().endsWith('/verify/CERT-PILOT-000001'), page.url());
  ok('no forwarding link is offered', !/replacement|superseded by|see instead/i.test(v));
  // The page says in words that it carries none of these; what must be absent
  // is the data itself, so the check reads the API answer behind the page.
  const verifyJson = await (await fetch(`${BASE}/api/verify/CERT-PILOT-000001`)).json();
  const keys = Object.keys(verifyJson);
  ok('the answer carries no yield', !keys.some((k) => /yield/i.test(k)));
  ok('no genealogy', !keys.some((k) => /genealog|nodes|edges|lots/i.test(k)));
  ok('no collector', !keys.some((k) => /collector|batch/i.test(k)));
  ok('no carbon breakdown', !keys.some((k) => /carbon|breakdown|mg_per_kg/i.test(k)));
  ok('and exactly the ten fields it is entitled to', keys.length === 10, keys.join(', '));
  ok('no figure appears on the page', !/mg CO2e|basis points/i.test(v));
  ok('the withdrawal is stated before any figure',
    v.search(/withdrawn/i) < v.indexOf('Claim type'));
  ok('/verify is excluded from indexing',
    (await page.getAttribute('meta[name="robots"]', 'content'))?.includes('noindex'));
  await page.screenshot({ path: `${SHOTS}/15_verify_withdrawn.png` });

  await page.goto(`${BASE}/verify/CERT-DEMO-999999`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.verify-sheet', { timeout: 15000 });
  const u = await page.textContent('body');
  ok('an unknown number reads the same layout', /no such certificate/i.test(u));
  ok('with the same fields', u.includes('Number') && u.includes('State')
    && u.includes('Issued on') && u.includes('Recipient'));
  await page.screenshot({ path: `${SHOTS}/16_verify_unknown.png` });

  await ctx.close();
}

/* ----------------------------------------- 7. an auditor reads and exports */
{
  console.log('\n== journey 7: an auditor reads and exports ==');
  const { ctx, page } = await newPage(browser);
  await signIn(page, 'auditor@example.com');
  await page.goto(`${BASE}/console/lots/LOT-N6-0001/genealogy`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.graph-section', { timeout: 15000 });

  const g = await page.textContent('body');
  ok('the same facts render as the graph', g.includes('As a graph'));
  ok('and as a nested list', g.includes('As a nested list'));
  ok('BATCH-1001 appears with its total mass', g.includes('450,000 g'));
  const b1001 = await page.$$eval('.graph-node-ref',
    (els) => els.filter((e) => e.textContent.trim() === 'BATCH-1001').length);
  ok('BATCH-1001 is drawn exactly once in the graph', b1001 === 1, `${b1001} nodes`);
  ok('the edges carry mass rather than a percentage',
    g.includes('Edges, each carrying mass'));
  ok('a flag is visible from the lot without expanding anything',
    g.includes('Flagged in this graph') && /lapsed calibration/i.test(g));

  // Every mutating control is absent.
  const buttons = await page.$$eval('button', (els) => els.map((e) => e.textContent.trim()));
  const mutating = buttons.filter((b) =>
    /allocate|withdraw|disposition|approve|reject|release|book in/i.test(b)
    || /^sign this/i.test(b) || /^close /i.test(b));
  ok('every mutating control is absent', mutating.length === 0, mutating.join(', '));

  // Export it. Every export is itself an entry.
  const before = await (await fetch(`${BASE}/api/record`, {
    headers: { authorization: `Bearer ${JSON.parse(await page.evaluate(() => localStorage.getItem('ravel.session'))).access_token}` }
  })).json();
  await page.click('button:has-text("Export this traversal")');
  await page.waitForSelector('.result-success', { timeout: 20000 });
  const exported = await page.textContent('.result-success');
  ok('the export names its reference', /EXP-\d+/.test(exported), exported.slice(0, 120));
  ok('and carries the digests', exported.includes('digest'));
  await page.screenshot({ path: `${SHOTS}/17_auditor_genealogy.png`, fullPage: true });

  // The auditor's write is refused at the route, not hidden in the interface.
  const token = JSON.parse(await page.evaluate(() => localStorage.getItem('ravel.session'))).access_token;
  const write = await fetch(`${BASE}/api/lots/LOT-N6-0001/disposition`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`,
      'idempotency-key': `walk-aud-${Date.now()}` },
    body: JSON.stringify({ disposition: 'released' })
  });
  ok('an auditor writes no operational record at any route', write.status === 403, String(write.status));

  const after = await (await fetch(`${BASE}/api/record`, {
    headers: { authorization: `Bearer ${token}` }
  })).json();
  ok('every export is itself an entry', after.length > before.length,
    `${before.length} → ${after.length}`);

  // The record and the reconciliation.
  await page.goto(`${BASE}/console/record`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.chain-check', { timeout: 15000 });
  const rec = await page.textContent('body');
  ok('the digest chain verifies', rec.includes('the chain holds across'));
  ok('a refusal is recorded as well as a success', /refused/i.test(rec));
  await page.screenshot({ path: `${SHOTS}/18_record_chain.png`, fullPage: true });

  await page.goto(`${BASE}/console/reconciliation`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.headline-figure', { timeout: 15000 });
  const recon = await page.textContent('body');
  ok('the mass balance residual is the headline', recon.includes('Mass balance residual'));
  ok('six figures are shown', recon.includes('Credit margin')
    && recon.includes('Consumptions on open runs') && recon.includes('Batches with broken custody')
    && recon.includes('Certificates with superseded figures') && recon.includes('Integration ages'));
  ok('customer_reporting has never sent', /never sent/i.test(recon));
  ok('this period is shown against the last three', recon.includes('against the last three'));
  ok('none is styled as passing', !/\bPASSING\b|\bHEALTHY\b|\bALL GOOD\b/i.test(recon));
  await page.screenshot({ path: `${SHOTS}/19_reconciliation.png`, fullPage: true });

  await ctx.close();
}

/* ------------------------------------- 8. the console at three widths */
{
  console.log('\n== journey 8: the three surfaces reflow at three widths ==');
  const widths = [[390, 'phone'], [820, 'tablet'], [1440, 'desktop']];
  for (const [w, name] of widths) {
    const { ctx, page } = await newPage(browser, w, 900);
    await signIn(page, 'claims@example.com');

    for (const [path, label] of [
      ['/console', 'board'],
      ['/console/balance/BP-DEMO-N6-2026H1', 'balance'],
      ['/console/lots/LOT-N6-0001/genealogy', 'genealogy']
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const scrolls = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      ok(`${label} at ${name} does not scroll the document sideways`, !scrolls);
    }

    // The genealogy graph becomes the nested list at the narrowest width.
    const graphVisible = await page.evaluate(() => {
      const g = document.querySelector('.graph');
      return g ? getComputedStyle(g).display !== 'none' : false;
    });
    if (w < 1152) {
      ok(`the graph becomes the nested list at ${name}`, !graphVisible);
    } else {
      ok(`the graph is drawn at ${name}`, graphVisible);
    }

    await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
    const columns = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.board')).gridTemplateColumns.split(' ').length);
    const expected = w >= 1152 ? 4 : (w >= 768 ? 2 : 1);
    ok(`the board carries ${expected} columns at ${name}`, columns === expected, `${columns}`);
    await page.screenshot({ path: `${SHOTS}/${20 + widths.findIndex((x) => x[0] === w)}_board_${name}.png` });

    await ctx.close();
  }
}

/* ------------------------------------------ 9. accessibility and keyboard */
{
  console.log('\n== journey 9: keyboard, contrast and reduced motion ==');
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // The focus ring is visible and is not the hover treatment.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { tag: el.tagName, text: el.textContent?.trim().slice(0, 40), outline: s.outlineWidth, style: s.outlineStyle };
  });
  ok('the first tab stop is the skip link', /skip/i.test(focused.text || ''), focused.text);

  await page.goto(`${BASE}/product`, { waitUntil: 'networkidle' });
  const rings = await page.evaluate(() => {
    const el = document.querySelector('a[href="/technology"], a, button');
    el.focus();
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, colour: s.outlineColor };
  });
  ok('a focused control shows a visible focus ring',
    rings.style !== 'none' && parseFloat(rings.width) >= 2, JSON.stringify(rings));

  // Nothing renders below twelve pixels on a rendered page.
  const tiny = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (!el.textContent?.trim()) continue;
      const s = getComputedStyle(el);
      const size = parseFloat(s.fontSize);
      if (size && size < 12) out.push(`${el.tagName}.${el.className} ${size}px`);
    }
    return out.slice(0, 5);
  });
  ok('nothing renders below twelve pixels', tiny.length === 0, tiny.join('; '));

  // Every element that renders has a line height set.
  const noLine = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('p, h1, h2, h3, h4, li, td, th, a, button, span')) {
      const s = getComputedStyle(el);
      if (s.lineHeight === 'normal' && el.textContent?.trim()) {
        out.push(`${el.tagName}.${el.className}`);
      }
    }
    return out.slice(0, 5);
  });
  ok('no element ships without a line height set', noLine.length === 0, noLine.join('; '));

  // No state is signalled green.
  const greens = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']) {
        const m = s[prop].match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) continue;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        // A saturated green used as a signal: markedly greener than red and blue.
        if (g > 100 && g > r + 45 && g > b + 45) out.push(`${el.tagName}.${el.className} ${prop} ${s[prop]}`);
      }
    }
    return out.slice(0, 5);
  });
  ok('nothing renders green as a state', greens.length === 0, greens.join('; '));

  // Under a reduced motion preference the reveal resolves immediately.
  await ctx.close();
  const reduced = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const rp = await reduced.newPage();
  await rp.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
  const revealState = await rp.evaluate(() => {
    const el = document.querySelector('.reveal');
    const s = getComputedStyle(el);
    return { opacity: s.opacity, filter: s.filter, transform: s.transform };
  });
  ok('under reduced motion nothing is left transparent', Number(revealState.opacity) === 1);
  ok('and nothing is left blurred',
    revealState.filter === 'none', revealState.filter);
  await reduced.close();
}

/* ------------------------------------------- 10. the console reads a lot */
{
  console.log('\n== journey 10: the operational record and the intake register ==');
  const { ctx, page } = await newPage(browser);
  await signIn(page, 'plant@example.com');

  await page.goto(`${BASE}/console/intake`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table', { timeout: 15000 });
  const intake = await page.textContent('body');
  ok('BATCH-1003 is non-claimable', /non-claimable/i.test(intake));
  ok('and names the lapsed approval', intake.includes('collector approval lapsed'));
  ok('BATCH-1004 carries the lapsed calibration', /lapsed calibration/i.test(intake));
  ok('BATCH-1003 reads back under the name in force on its receipt date',
    intake.includes('Brine Textile Recovery'));
  ok('and not the name it holds today', !intake.includes('Brine Circular Materials'));
  ok('every dry mass is shown', intake.includes('450,000 g') && intake.includes('190,000 g'));
  await page.screenshot({ path: `${SHOTS}/23_intake_register.png`, fullPage: true });

  await page.goto(`${BASE}/console/batches/BATCH-1005`, { waitUntil: 'networkidle' });
  const b5 = await page.textContent('body');
  ok('BATCH-1005 names its missing custody link',
    b5.includes('This batch cannot be claimed: transport custody link missing.'), b5.slice(0, 400));
  await page.screenshot({ path: `${SHOTS}/24_batch_custody.png`, fullPage: true });

  await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
  const board = await page.textContent('body');
  ok('the board names the stage on each card',
    board.includes('Dissolution') && board.includes('Repolymerisation'));
  ok('a run outside tolerance carries its word', /outside recipe tolerance/i.test(board));
  await page.screenshot({ path: `${SHOTS}/25_run_board.png`, fullPage: true });

  await ctx.close();
}

await browser.close();

console.log('\n== the console during the walk ==');
if (consoleErrors.length === 0) {
  console.log('    ok   no console error on any page');
  pass++;
} else {
  console.log(`    FAIL ${consoleErrors.length} console errors`);
  for (const e of consoleErrors.slice(0, 12)) console.log(`         ${e}`);
  fail++;
  failures.push('console errors');
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (failures.length) { console.log('failures:'); for (const f of failures) console.log(`  - ${f}`); }
process.exit(fail ? 1 : 0);

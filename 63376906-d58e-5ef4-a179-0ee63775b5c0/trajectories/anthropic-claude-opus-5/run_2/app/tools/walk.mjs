// Drives the journeys the brief describes, as a stranger would, and leaves one
// screenshot per journey in /app/.browser_screenshots/.
import { chromium } from 'playwright';

const BASE = process.env.WALK_BASE || 'http://localhost:4173';
const SHOTS = '/app/.browser_screenshots';
const PW = 'deku-demo-pw-2026';

const problems = [];
const note = (s) => console.log(s);
const fail = (s) => { problems.push(s); console.log(`  PROBLEM ${s}`); };

const browser = await chromium.launch();

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', PW);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/console/, { timeout: 15000 });
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}`, fullPage: true });

/* -------------------------------------------- 1. the public site */
{
  note('\n== 1. a visitor reads the public site ==');
  const { ctx, page, errors } = await fresh();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const h1 = await page.textContent('h1');
  if (!h1.includes("Tomorrow's materials")) fail(`home heading reads "${h1}"`);
  const body = await page.textContent('body');
  for (const phrase of ['Nylon that goes on and on and on', 'The power of green chemistry',
    "We're closing the loop", 'Losses reduce the claim']) {
    if (!body.includes(phrase)) fail(`home is missing the copy "${phrase}"`);
  }
  await shot(page, '01_home.png');

  await page.click('a[href="/technology"]');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('table', { timeout: 10000 });
  await page.waitForTimeout(500);
  const tech = await page.textContent('body');
  for (const s of ['Dissolution', 'Depolymerisation', 'Purification', 'Repolymerisation',
    '8000 hours per year', 'planned']) {
    if (!tech.includes(s)) fail(`technology is missing "${s}"`);
  }
  if (!tech.includes('-1,000,000 kg')) fail('technology does not report the negative uncommitted capacity');
  await shot(page, '02_technology.png');

  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
  const about = await page.textContent('body');
  for (const s of ['The hard facts', 'Textile Flow Monitor', '2024', 'Global',
    '1.8 gigatonnes']) {
    if (!about.includes(s)) fail(`about is missing "${s}"`);
  }
  await shot(page, '03_about_statistics.png');

  await page.goto(`${BASE}/careers`, { waitUntil: 'networkidle' });
  const careers = await page.textContent('body');
  if (!careers.includes('1 open position')) fail('the careers count is not derived from its collection');
  if (!careers.includes('Why this problem matters')) fail('careers is missing its heading');
  if (!careers.includes('Process Engineer')) fail('careers does not list the open role');

  await page.goto(`${BASE}/news`, { waitUntil: 'networkidle' });
  const news = await page.textContent('body');
  for (const s of ['funding', 'partnership', 'technical', 'Materials Weekly', 'French']) {
    if (!news.includes(s)) fail(`news is missing "${s}"`);
  }

  await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
  const priv = await page.textContent('body');
  for (const s of ['Ravel Materials SAS', 'privacy@example.com', 'security@example.com',
    '180 months', 'is not erased on request']) {
    if (!priv.includes(s)) fail(`privacy is missing "${s}"`);
  }

  if (errors.length) fail(`console errors on the public site: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/* ------------------------------- 2. a visitor checks a certificate */
{
  note('\n== 2. a visitor checks a certificate, with no session ==');
  const { ctx, page, errors } = await fresh();
  await page.goto(`${BASE}/verify/CERT-PILOT-000001`, { waitUntil: 'networkidle' });
  const t = await page.textContent('body');
  if (!/withdrawn/i.test(t)) fail('the verification page does not state the withdrawal');
  if (!t.includes('2026-04-18')) fail('the verification page does not state the withdrawal date');
  if (!t.includes('A collector category was corrected after acceptance')) {
    fail('the verification page does not state the withdrawal reason');
  }
  const forwards = await page.$$eval('a[href*="/verify/"]', (els) => els.map((e) => e.getAttribute('href')));
  if (forwards.some((h) => !h.endsWith('CERT-PILOT-000001'))) {
    fail(`the verification page forwards to a replacement: ${forwards.join(', ')}`);
  }
  if (page.url() !== `${BASE}/verify/CERT-PILOT-000001`) fail('the verification page redirected');
  await shot(page, '04_verify_withdrawn.png');

  await page.goto(`${BASE}/verify/CERT-DEMO-999999`, { waitUntil: 'networkidle' });
  const u = await page.textContent('body');
  if (!u.includes('Not found') && !u.includes('There is no such certificate')) {
    fail('an unknown number does not read the same layout saying there is no such certificate');
  }
  await shot(page, '05_verify_unknown.png');
  if (errors.length) fail(`console errors on verify: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/* ------------------------- 3. the console redirects an anonymous reader */
{
  note('\n== 3. the console redirects an anonymous reader ==');
  const { ctx, page } = await fresh();
  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (!page.url().endsWith('/login')) fail(`anonymous reader landed at ${page.url()} rather than /login`);
  await shot(page, '06_login.png');
  await ctx.close();
}

/* -------------------- 4. a claims manager allocates and is refused */
{
  note('\n== 4. a claims manager allocates and is refused ==');
  const { ctx, page, errors } = await fresh();
  await signIn(page, 'claims@example.com');
  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const before = await page.textContent('body');
  for (const s of ['360,000 g', '336,000 g', '190,000 g']) {
    if (!before.includes(s)) fail(`the balance screen does not show ${s}`);
  }
  // No input control governs a derived figure: the only inputs are the
  // allocation's own lot, category and mass.
  const inputs = await page.$$eval('input, select, textarea', (els) =>
    els.map((e) => e.getAttribute('name') || e.type || e.tagName));
  if (inputs.length > 3) fail(`the balance screen carries ${inputs.length} controls: ${inputs.join(',')}`);

  await page.selectOption('select >> nth=0', 'LOT-N6-0001');
  await page.selectOption('select >> nth=1', 'post_consumer');
  await page.fill('input[type=number]', '500000');
  await page.click('button[type=submit]');
  await page.waitForSelector('[role=alert]', { timeout: 10000 });
  const banner = await page.textContent('[role=alert]');
  if (!banner.includes('360,000 g')) fail('the banner does not name the available mass');
  if (!banner.includes('500,000 g')) fail('the banner does not name the requested mass');
  const after = await page.textContent('body');
  if (!after.includes('360,000 g')) fail('the figures on the screen changed after a refusal');
  await shot(page, '07_balance_allocation_refused.png');
  const unexpected = errors.filter((e) => !/409|Conflict/.test(e));
  if (unexpected.length) fail(`console errors on the balance screen: ${unexpected.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/* ------------------- 5. a signer meets a blocking condition */
{
  note('\n== 5. a signer meets a blocking condition ==');
  const { ctx, page, errors } = await fresh();
  await signIn(page, 'signer@example.com');

  await page.goto(`${BASE}/console/certificates/new/lot`, { waitUntil: 'networkidle' });
  await page.click('table tbody tr:first-child button');
  await page.waitForTimeout(1200);
  let t = await page.textContent('body');
  if ((t.match(/satisfied/g) || []).length < 8) fail('step one does not show the eight conditions');
  if (!t.includes('OVR-0001')) fail('step one does not name the blocking override');
  await shot(page, '08_wizard_step1_lot.png');

  for (const [step, file] of [['claim', '09_wizard_step2_claim.png'],
    ['recipient', '10_wizard_step3_recipient.png']]) {
    await page.goto(`${BASE}/console/certificates/new/${step}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    t = await page.textContent('body');
    if (!t.includes('not satisfied')) fail(`step ${step} does not show the unsatisfied condition`);
    if (step === 'recipient') await page.click('table tbody tr:first-child button');
    await page.waitForTimeout(400);
    await shot(page, file);
  }

  await page.goto(`${BASE}/console/certificates/new/review`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  t = await page.textContent('body');
  if (!t.includes('no_unreviewed_override'.replace(/_/g, ' '))) {
    fail('the review step does not name the condition that blocks');
  }
  if (!t.includes('You may not state that this material physically contains recycled content.')) {
    fail('the review step does not render the prohibited statement');
  }
  const signDisabled = await page.getAttribute('button[type=submit]', 'disabled');
  if (signDisabled === null) fail('the sign control is not blocked while a condition is unsatisfied');
  // No control on the screen dismisses a condition.
  const dismissers = await page.$$eval('.condition button, .condition a, .sheet button', (els) =>
    els.map((e) => (e.textContent || '').trim().toLowerCase())
      .filter((s) => /dismiss|waive|ignore|proceed anyway|acknowledge|force/.test(s)));
  if (dismissers.length) fail(`the wizard offers a dismissing control: ${dismissers.join(', ')}`);
  await shot(page, '11_wizard_step4_review_blocked.png');
  if (errors.length) fail(`console errors in the wizard: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/* ------------- 6. the override is reviewed and the certificate signs */
{
  note('\n== 6. a second person reviews, and the certificate signs ==');
  const { ctx, page } = await fresh();
  await signIn(page, 'claims@example.com');
  const reviewed = await page.evaluate(async () => {
    const r = await fetch('/api/overrides/OVR-0001/review', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'walk-review-' + Date.now(),
        authorization: 'Bearer ' + localStorage.getItem('ravel.token'),
      },
      body: '{}',
    });
    return { status: r.status, body: await r.json() };
  });
  if (reviewed.status !== 200) fail(`the review was refused: ${JSON.stringify(reviewed.body)}`);
  await ctx.close();

  const s = await fresh();
  await signIn(s.page, 'signer@example.com');
  await s.page.goto(`${BASE}/console/certificates/new/lot`, { waitUntil: 'networkidle' });
  await s.page.click('table tbody tr:first-child button');
  await s.page.waitForTimeout(1200);
  await s.page.goto(`${BASE}/console/certificates/new/recipient`, { waitUntil: 'networkidle' });
  await s.page.waitForTimeout(800);
  await s.page.click('table tbody tr:first-child button');
  await s.page.waitForTimeout(400);
  await s.page.goto(`${BASE}/console/certificates/new/review`, { waitUntil: 'networkidle' });
  await s.page.waitForTimeout(1200);
  let t = await s.page.textContent('body');
  if (t.includes('not satisfied')) fail('a condition still blocks after the review');
  await s.page.fill('input[type=password]', PW);
  await s.page.click('button[type=submit]');
  await s.page.waitForURL(/\/console\/certificates\/CERT-/, { timeout: 20000 });
  const number = s.page.url().split('/').pop();
  note(`  signed ${number}`);
  if (!/^CERT-DEMO-\d{6}$/.test(number)) fail(`the number ${number} is not from the SITE-DEMO sequence`);
  await s.page.waitForTimeout(800);
  t = await s.page.textContent('body');
  if (!t.includes('mass balance')) fail('the certificate does not name its claim type');
  if (/yield/i.test(t)) fail('a yield figure appears on the certificate view');
  await shot(s.page, '12_certificate_signed.png');
  await s.ctx.close();
}

/* --------------------- 7. a withdrawal shows its blast radius */
{
  note('\n== 7. a withdrawal shows its blast radius ==');
  const { ctx, page, errors } = await fresh();
  await signIn(page, 'signer2@example.com');
  await page.goto(`${BASE}/console/certificates/CERT-PILOT-000002`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('button:has-text("Begin a withdrawal")');
  await page.waitForTimeout(400);
  const t = await page.textContent('body');
  // Recipients by name, not a count.
  if (!t.includes('Vanta Safety Systems')) fail('the withdrawal does not name the recipient');
  if (!t.includes('Statements the recipient must stop making')) {
    fail('the withdrawal does not enumerate the void statements');
  }
  if (!t.includes('You may not state that this material physically contains recycled content.') &&
      !t.includes('claimed by mass balance')) {
    fail('the void statements are not the actual statements');
  }
  await shot(page, '13_withdrawal_blast_radius.png');

  await page.fill('textarea', 'The pilot conversion factor was restated after issue');
  await page.click('button:has-text("Confirm the withdrawal")');
  await page.waitForSelector('text=The withdrawal landed', { timeout: 20000 });
  const after = await page.textContent('body');
  if (!after.includes('Notified by name')) fail('the withdrawal does not report who was notified');
  await shot(page, '14_withdrawal_confirmed.png');
  await ctx.close();

  // After confirming, the certificate address still resolves and states the withdrawal.
  const v = await fresh();
  await v.page.goto(`${BASE}/verify/CERT-PILOT-000002`, { waitUntil: 'networkidle' });
  const vt = await v.page.textContent('body');
  if (!/withdrawn/i.test(vt)) fail('the withdrawn certificate does not state its withdrawal publicly');
  await shot(v.page, '15_verify_after_withdrawal.png');
  await v.ctx.close();
  if (errors.length) fail(`console errors during withdrawal: ${errors.slice(0, 3).join(' | ')}`);
}

/* -------------------------- 8. an auditor reads and exports */
{
  note('\n== 8. an auditor reads and exports ==');
  const { ctx, page, errors } = await fresh();
  await signIn(page, 'auditor@example.com');
  await page.goto(`${BASE}/console/lots/LOT-N6-0001/genealogy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const t = await page.textContent('body');
  if (!t.includes('As a graph')) fail('the genealogy does not render the graph');
  if (!t.includes('As a nested list')) fail('the genealogy does not render the nested list');
  // The same facts twice: BATCH-1001 once, at 450000 g.
  const occurrences = (t.match(/450,000 g/g) || []).length;
  if (occurrences < 2) fail(`BATCH-1001 at 450,000 g appears ${occurrences} times, not in both forms`);
  if (!t.includes('lapsed calibration')) fail('the genealogy does not carry the lapsed calibration flag');
  await shot(page, '16_genealogy_auditor.png');

  // Every mutating control is absent.
  const controls = await page.$$eval('main button', (els) => els.map((e) => (e.textContent || '').trim()));
  const mutating = controls.filter((c) =>
    /allocate|attach claim|sign this|withdraw|close|approve|disposition|reject|book in/i.test(c));
  if (mutating.length) fail(`the auditor sees mutating controls: ${mutating.join(', ')}`);

  await page.click('button:has-text("Export")');
  await page.waitForSelector('text=Export recorded', { timeout: 15000 });
  const ex = await page.textContent('body');
  if (!/EXP-\d+/.test(ex)) fail('the export did not answer with its reference');
  await shot(page, '17_genealogy_export.png');

  // Every export is itself an entry.
  await page.goto(`${BASE}/console/record`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.fill('input', 'export');
  await page.waitForTimeout(400);
  const rec = await page.textContent('body');
  if (!rec.includes('export produced')) fail('the export is not an entry in the record');
  await shot(page, '18_record_chain.png');
  if (errors.length) fail(`console errors for the auditor: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/* ------------------------------- 9. intake and reconciliation */
{
  note('\n== 9. intake and reconciliation ==');
  const { ctx, page, errors } = await fresh();
  await signIn(page, 'plant@example.com');
  await page.goto(`${BASE}/console/intake`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const t = await page.textContent('body');
  if (!t.includes('Brine Textile Recovery')) fail('intake does not read the name in force on the receipt date');
  if (!t.includes('non-claimable')) fail('intake does not carry the non-claimable word');
  if (!t.includes('lapsed calibration')) fail('intake does not carry the lapsed calibration word');
  await shot(page, '19_intake.png');

  await page.goto(`${BASE}/console/batches/BATCH-1005`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const b = await page.textContent('body');
  if (!b.includes('This batch cannot be claimed: transport.')) {
    fail('the batch does not state which custody link is missing');
  }
  await shot(page, '20_batch_custody.png');

  await page.goto(`${BASE}/console/reconciliation`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const r = await page.textContent('body');
  if (!r.includes('never sent')) fail('reconciliation does not report a source that never sent');
  if (!r.includes('Mass balance residual')) fail('reconciliation is missing its headline figure');
  await shot(page, '21_reconciliation.png');

  await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const board = await page.textContent('body');
  for (const s of ['dissolution', 'depolymerisation', 'purification', 'repolymerisation']) {
    if (!board.toLowerCase().includes(s)) fail(`the board is missing the ${s} column`);
  }
  await shot(page, '22_console_board.png');
  if (errors.length) fail(`console errors on intake: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/* ------------------------------- 10. responsive, three widths */
{
  note('\n== 10. three widths, no sideways scroll ==');
  const widths = [[390, 'phone'], [820, 'tablet'], [1440, 'desktop']];
  const routes = ['/', '/technology', '/console/balance/BP-DEMO-N6-2026H1',
    '/console/lots/LOT-N6-0001/genealogy', '/console/certificates/new/review'];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page, 'signer@example.com');
  for (const [w, name] of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) fail(`${route} at ${name} scrolls sideways by ${overflow}px`);
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${BASE}/console/lots/LOT-N6-0001/genealogy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '23_genealogy_phone.png');
  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '24_balance_phone.png');
  await ctx.close();
}

/* ------------------------ 11. the palette and the type floor */
{
  note('\n== 11. the palette, the type floor, and the forbidden values ==');
  const { ctx, page } = await fresh();
  await signIn(page, 'quality@example.com');

  const css = await (await fetch(`${BASE}/`)).text();
  const linkMatch = css.match(/href="(\/assets\/[^"]+\.css)"/);
  const sheet = await (await fetch(`${BASE}${linkMatch[1]}`)).text();

  const forbidden = ['#2d62ff', '#dd23bb', '#fcf8d8', '#cef5ca', '#114e0b',
    '#f8e4e4', '#3b0b0b', '#5e5515', '#0000'];
  for (const v of forbidden) {
    const re = new RegExp(v.replace('#', '#') + '(?![0-9a-f])', 'i');
    if (re.test(sheet)) fail(`the built stylesheet carries the forbidden value ${v}`);
  }
  const literals = new Set((sheet.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((s) => s.toLowerCase()));
  note(`  colour literals in the built stylesheet: ${[...literals].join(', ')}`);
  if (literals.size > 8) fail(`the stylesheet carries ${literals.size} colour literals, more than eight`);
  if (/transition:\s*all/.test(sheet)) fail('the stylesheet declares transition: all');

  // Nothing renders below twelve pixels, and no state is signalled green.
  for (const route of ['/', '/console', '/console/balance/BP-DEMO-N6-2026H1', '/console/intake']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const tooSmall = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        if (!el.textContent?.trim()) continue;
        const s = getComputedStyle(el);
        if (parseFloat(s.fontSize) < 12) out.push(el.tagName + ':' + s.fontSize);
      }
      return out.slice(0, 5);
    });
    if (tooSmall.length) fail(`${route} renders text below twelve pixels: ${tooSmall.join(', ')}`);

    const greens = await page.evaluate(() => {
      const parse = (c) => (c.match(/\d+/g) || []).map(Number);
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
          const [r, g, b, a] = parse(getComputedStyle(el)[prop]);
          if (a === 0 || r === undefined) continue;
          // A saturated green used as a state signal.
          if (g > 100 && g > r + 45 && g > b + 45) out.push(`${el.tagName}.${prop}=rgb(${r},${g},${b})`);
        }
      }
      return [...new Set(out)].slice(0, 5);
    });
    if (greens.length) fail(`${route} signals a state in green: ${greens.join(', ')}`);
  }

  // The focus ring is visible and is not the hover treatment.
  await page.goto(`${BASE}/console`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { tag: el.tagName, outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle };
  });
  if (focus.outlineStyle === 'none' || parseFloat(focus.outlineWidth) < 1) {
    fail(`the focus ring is not visible: ${JSON.stringify(focus)}`);
  }
  await shot(page, '25_focus_and_palette.png');
  await ctx.close();
}

await browser.close();

console.log(`\n===== walk finished with ${problems.length} problem(s) =====`);
if (problems.length) { problems.forEach((p) => console.log(' - ' + p)); process.exit(1); }

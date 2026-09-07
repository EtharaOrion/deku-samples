// Byte budgets per route class, and WCAG AA contrast for every role against
// the ground. Run with the app served from its production build.
import { chromium } from 'playwright';

const BASE = process.env.WALK_BASE || 'http://localhost:4173';
const problems = [];
const fail = (s) => { problems.push(s); console.log(`  PROBLEM ${s}`); };
const ok = (s) => console.log(`  ok   ${s}`);

const BUDGETS = {
  public: { paint: 220000, images: 450000, script: 220000, fonts: 140000 },
  console: { paint: 320000, images: 80000, script: 700000, fonts: 140000 },
  heavy: { paint: 360000, images: 80000, script: 800000, fonts: 140000 },
};

const ROUTES = [
  ['/', 'public'], ['/product', 'public'], ['/technology', 'public'], ['/about', 'public'],
  ['/careers', 'public'], ['/news', 'public'], ['/contact', 'public'], ['/privacy', 'public'],
  ['/console', 'console'], ['/console/intake', 'console'], ['/console/record', 'console'],
  ['/console/reconciliation', 'console'],
  ['/console/balance/BP-DEMO-N6-2026H1', 'heavy'],
  ['/console/certificates/new/review', 'heavy'],
];

const browser = await chromium.launch();

console.log('\n== byte budgets, uncached, at desktop ==');
for (const [route, cls] of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const seen = { script: 0, css: 0, font: 0, image: 0, doc: 0, media: 0 };
  page.on('response', async (res) => {
    try {
      const t = res.request().resourceType();
      const len = Number(res.headers()['content-length'] || 0) ||
        (await res.body().catch(() => Buffer.alloc(0))).length;
      if (t === 'script') seen.script += len;
      else if (t === 'stylesheet') seen.css += len;
      else if (t === 'font') seen.font += len;
      else if (t === 'image') seen.image += len;
      else if (t === 'document') seen.doc += len;
      else if (t === 'media') seen.media += len;
    } catch {}
  });
  if (cls !== 'public') {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type=email]', 'signer@example.com');
    await page.fill('input[type=password]', 'deku-demo-pw-2026');
    await page.click('button[type=submit]');
    await page.waitForURL(/console/);
    for (const k of Object.keys(seen)) seen[k] = 0;
  }
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const b = BUDGETS[cls];
  const paint = seen.doc + seen.css + seen.script;
  const parts = [];
  if (paint > b.paint) fail(`${route}: ${paint} bytes before first paint, over ${b.paint}`);
  if (seen.script > b.script) fail(`${route}: ${seen.script} script bytes, over ${b.script}`);
  if (seen.image > b.images) fail(`${route}: ${seen.image} image bytes, over ${b.images}`);
  if (seen.font > b.fonts) fail(`${route}: ${seen.font} font bytes, over ${b.fonts}`);
  // Media loads on interaction and never before.
  if (seen.media > 0) fail(`${route}: ${seen.media} media bytes before interaction, over 0`);
  console.log(`  ${route.padEnd(38)} paint ${String(paint).padStart(7)}  script ${String(seen.script).padStart(7)}  font ${String(seen.font).padStart(6)}  img ${String(seen.image).padStart(6)}  media ${seen.media}`);
  await ctx.close();
}

console.log('\n== contrast, WCAG AA at every size and AAA for ink at body size ==');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const ratios = await page.evaluate(() => {
    const lum = (hex) => {
      const n = hex.replace('#', '');
      const v = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const s = getComputedStyle(document.documentElement);
    const role = (n) => s.getPropertyValue(n).trim();
    const ground = role('--ground');
    const paper = role('--paper');
    return {
      ink_on_ground: ratio(role('--ink'), ground),
      ink_on_paper: ratio(role('--ink'), paper),
      muted_on_ground: ratio(role('--muted'), ground),
      muted_on_paper: ratio(role('--muted'), paper),
      accent_on_ground: ratio(role('--accent'), ground),
      highlight_on_ground: ratio(role('--highlight'), ground),
      focus_on_ground: ratio(role('--focus'), ground),
      ground_vs_paper: ratio(ground, paper),
    };
  });
  for (const [k, v] of Object.entries(ratios)) console.log(`  ${k.padEnd(22)} ${v.toFixed(2)}:1`);
  if (ratios.ink_on_ground < 7) fail(`ink on ground is ${ratios.ink_on_ground.toFixed(2)}:1, below AAA at body size`);
  else ok('ink clears AAA against the ground at body size');
  if (ratios.muted_on_ground < 4.5) fail(`muted on ground is ${ratios.muted_on_ground.toFixed(2)}:1, below AA`);
  else ok('muted clears AA against the ground at body size');
  if (ratios.accent_on_ground < 4.5) fail(`accent on ground is ${ratios.accent_on_ground.toFixed(2)}:1, below AA`);
  else ok('accent clears AA against the ground');
  if (ratios.highlight_on_ground < 4.5) fail(`highlight on ground is ${ratios.highlight_on_ground.toFixed(2)}:1, below AA`);
  else ok('highlight clears AA against the ground');
  if (ratios.focus_on_ground < 3) fail(`the focus ring is ${ratios.focus_on_ground.toFixed(2)}:1, below the non-text minimum`);
  else ok('the focus ring clears the non-text minimum');
  // Paper is lighter than the ground and distinguishable without a border.
  if (ratios.ground_vs_paper < 1.02) fail('paper is not distinguishable from the ground');
  else ok('paper is distinguishable from the ground without a border');
  await ctx.close();
}

console.log('\n== keyboard reaches every control ==');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'claims@example.com');
  await page.fill('input[type=password]', 'deku-demo-pw-2026');
  await page.click('button[type=submit]');
  await page.waitForURL(/console/);
  await page.goto(`${BASE}/console/balance/BP-DEMO-N6-2026H1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const focusable = [...document.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    const unreachable = focusable.filter((el) => el.tabIndex < 0);
    // An icon-only control carries a label.
    const unlabelled = [...document.querySelectorAll('button, a')].filter((el) => {
      const text = (el.textContent || '').trim();
      return !text && !el.getAttribute('aria-label') && !el.getAttribute('title');
    });
    return { focusable: focusable.length, unreachable: unreachable.length, unlabelled: unlabelled.length };
  });
  console.log(`  ${r.focusable} focusable controls`);
  if (r.unreachable) fail(`${r.unreachable} controls the keyboard cannot reach`);
  else ok('the keyboard reaches every control');
  if (r.unlabelled) fail(`${r.unlabelled} icon-only controls carry no label`);
  else ok('every icon-only control carries a label');
  await ctx.close();
}

await browser.close();
console.log(`\n===== ${problems.length} problem(s) =====`);
if (problems.length) { problems.forEach((p) => console.log(' - ' + p)); process.exit(1); }

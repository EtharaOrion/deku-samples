/** Measures the front-end specification against the running pages. */
import { chromium } from 'playwright';

const BASE = process.env.WALK_BASE || 'http://localhost:4173';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};
const near = (a, b, tol = 0.6) => Math.abs(Number(a) - Number(b)) <= tol;

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  executablePath: process.env.CHROMIUM_PATH || '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
});

// ------------------------------------------------- the measured type scale
async function measure(width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const out = await page.evaluate(() => {
    const title = document.querySelector('.letter__title');
    const body = document.querySelector('.letter__flow .letter__p');
    const root = document.documentElement;
    const cs = (el) => getComputedStyle(el);
    return {
      display: parseFloat(cs(title).fontSize),
      displayLh: parseFloat(cs(title).lineHeight),
      displayWeight: cs(title).fontWeight,
      displayTracking: cs(title).letterSpacing,
      body: parseFloat(cs(body).fontSize),
      bodyLh: parseFloat(cs(body).lineHeight),
      bodyTracking: cs(body).letterSpacing,
      rootFs: parseFloat(cs(root).fontSize),
      rootLh: parseFloat(cs(document.body).lineHeight),
    };
  });
  await ctx.close();
  return out;
}

const at390 = await measure(390, 800);
check('display is 46.8px at 390px', near(at390.display, 46.8), `${at390.display}`);
check('letter body is 14.625px at 390px', near(at390.body, 14.625), `${at390.body}`);

const at990 = await measure(990);
check('display is 118.8px at 990px', near(at990.display, 118.8), `${at990.display}`);
check('letter body is 37.125px at 990px', near(at990.body, 37.125), `${at990.body}`);

const at1440 = await measure(1440);
check('display is 48.932px at 1440px', near(at1440.display, 48.932), `${at1440.display}`);
check('letter body is 20.9709px at 1440px', near(at1440.body, 20.9709), `${at1440.body}`);
check('the display size is not monotonic in viewport width',
  at390.display < at990.display && at1440.display < at990.display,
  `${at390.display} then ${at990.display} then ${at1440.display}`);
check('display line height is 0.95 of the size above the tier',
  near(at1440.displayLh / at1440.display, 0.95, 0.02), `${(at1440.displayLh / at1440.display).toFixed(3)}`);
check('display line height is 1.1 of the size below the tier',
  near(at390.displayLh / at390.display, 1.1, 0.02), `${(at390.displayLh / at390.display).toFixed(3)}`);
check('letter body line height is 1.1 of the size',
  near(at1440.bodyLh / at1440.body, 1.1, 0.02), `${(at1440.bodyLh / at1440.body).toFixed(3)}`);
check('display is weight 700', at1440.displayWeight === '700', at1440.displayWeight);
check('display tracking is -0.01em', near(parseFloat(at1440.displayTracking), -0.01 * at1440.display, 0.05),
  at1440.displayTracking);
check('letter body tracking is 0.02em at and above the tier',
  near(parseFloat(at1440.bodyTracking), 0.02 * at1440.body, 0.05), at1440.bodyTracking);
check('letter body has no tracking below the tier',
  at390.bodyTracking === 'normal' || near(parseFloat(at390.bodyTracking), 0, 0.01), at390.bodyTracking);
check('root default is 16px over 24px',
  near(at1440.rootFs, 16, 0.01) && near(at1440.rootLh, 24, 0.01), `${at1440.rootFs}/${at1440.rootLh}`);

const at1550 = await measure(1550);
check('the widest tier tightens the display to -0.02em',
  near(parseFloat((await (async () => at1550.displayTracking)()) ), -0.02 * at1550.display, 0.06),
  at1550.displayTracking);

// ------------------------------------------------------- the frame and shell
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
  const frame = await page.evaluate(() => {
    const bar = document.querySelector('.shell__bar');
    const mark = document.querySelector('.shell__bar .wordmark');
    const card = document.querySelector('.card');
    const cs = (el) => getComputedStyle(el);
    return {
      header: parseFloat(cs(bar).height),
      wordmark: parseFloat(cs(mark).height),
      gutter: parseFloat(cs(bar).paddingLeft),
      radius: cs(card).borderTopLeftRadius,
      border: cs(card).borderTopWidth,
      shadow: cs(card).boxShadow,
      monoStack: cs(document.querySelector('.mono') || document.body).fontFamily,
    };
  });
  check('the header is 80px tall', near(frame.header, 80), `${frame.header}`);
  check('the wordmark is half the header', near(frame.wordmark, 40), `${frame.wordmark}`);
  check('the page gutter is 20px', near(frame.gutter, 20), `${frame.gutter}`);
  check('controls and cards carry a 0.5rem radius', frame.radius === '8px', frame.radius);
  check('the border width is 1px', frame.border === '1px', frame.border);
  check('there is exactly one elevation',
    frame.shadow.includes('0px 2px 4px') && frame.shadow.split('rgba').length === 2, frame.shadow);

  // Tabular numerals wherever figures stack.
  await page.goto(`${BASE}/downloads`, { waitUntil: 'networkidle' });
  const tnum = await page.evaluate(() => {
    const el = document.querySelector('.tnum, .mono');
    return getComputedStyle(el).fontVariantNumeric;
  });
  check('figures are set with tabular numerals', tnum.includes('tabular-nums'), tnum);

  const monoFamily = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.mono')).fontFamily);
  check('identifiers use the system monospace stack',
    monoFamily.includes('ui-monospace') && monoFamily.includes('Courier New'), monoFamily);

  // Every page carries a skip link as its first focusable element.
  for (const route of ['/', '/shop', '/cart', '/downloads', '/doctor', '/sign-in']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => ({
      cls: document.activeElement?.className ?? '',
      text: document.activeElement?.textContent?.trim() ?? '',
    }));
    check(`the skip link is first focusable on ${route}`,
      focused.cls.includes('skip-link'), `${focused.cls} ${focused.text}`.trim());
  }

  // The focus ring never depends on the accent.
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle, offset: cs.outlineOffset };
  });
  check('focus is a 2px solid ring offset 2px',
    ring.width === '2px' && ring.style === 'solid' && ring.offset === '2px',
    JSON.stringify(ring));
  check('the focus ring is not the accent',
    !/217,\s*79,\s*4|255,\s*122,\s*47/.test(ring.color), ring.color);
  await ctx.close();
}

// ------------------------------------------------- the narrow viewport
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });

  const narrow = await page.evaluate(() => ({
    toggleVisible: getComputedStyle(document.querySelector('.rail__toggle')).display !== 'none',
    navHidden: document.querySelector('[data-rail-nav]')?.hidden ?? null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check('the rail collapses to one control below the tier', narrow.toggleVisible && narrow.navHidden === true,
    JSON.stringify(narrow));
  check('nothing scrolls sideways on a narrow viewport',
    narrow.scrollWidth <= narrow.clientWidth + 1, `${narrow.scrollWidth} vs ${narrow.clientWidth}`);

  await page.locator('.rail__toggle').click();
  await page.waitForTimeout(150);
  check('the collapsed rail opens',
    (await page.locator('[data-rail-nav]').isVisible())
    && (await page.locator('.rail__toggle').getAttribute('aria-expanded')) === 'true');

  // The grids fall to one column.
  const columns = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length);
  check('the grid falls to one column', columns === 1, `${columns}`);

  await page.screenshot({ path: '/app/.browser_screenshots/13_narrow_shop.png' });

  // The letter becomes a different page below the tier.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.3));
  await page.waitForTimeout(400);
  const driven = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-block]'));
    const opacities = blocks
      .map((b) => b.querySelector('.letter__p, .letter__closing'))
      .filter(Boolean)
      .map((el) => Number(getComputedStyle(el).opacity));
    const sides = blocks.slice(0, 12).map((b) => b.dataset.side);
    const drivenHidden = document.querySelector('.letter__driven').getAttribute('aria-hidden');
    const flowInDom = document.querySelectorAll('.letter__flow .letter__p').length;
    return {
      distinct: new Set(opacities.map((o) => o.toFixed(2))).size,
      sides,
      drivenHidden,
      flowInDom,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  check('the blocks fade in step with the scroll below the tier', driven.distinct > 1, `${driven.distinct} distinct opacities`);
  check('the driven layer is hidden from assistive technology', driven.drivenHidden === 'true');
  check('the flow copy is never removed from the document', driven.flowInDom === 16, `${driven.flowInDom}`);
  check('the blocks alternate rather than follow one rule',
    new Set(driven.sides).size === 2 && driven.sides.slice(6, 9).join(',') === 'start,start,start',
    driven.sides.join(','));
  check('the letter never scrolls sideways',
    driven.scrollWidth <= driven.clientWidth + 1, `${driven.scrollWidth} vs ${driven.clientWidth}`);
  await page.screenshot({ path: '/app/.browser_screenshots/14_narrow_letter.png' });
  await ctx.close();
}

// --------------------------------------------- reduced motion keeps the dark
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
  await page.waitForTimeout(400);
  const reduced = await page.evaluate(() => {
    const letter = document.querySelector('[data-letter]');
    const video = document.querySelector('[data-film]');
    return {
      darken: Number(getComputedStyle(letter).getPropertyValue('--darken')),
      paused: video?.paused ?? true,
      transition: getComputedStyle(document.querySelector('.button, .rail__link') || document.body).transitionDuration,
    };
  });
  check('the darkening still runs under reduced motion', reduced.darken > 0.1, `${reduced.darken}`);
  check('the film does not play under reduced motion', reduced.paused === true);
  await page.screenshot({ path: '/app/.browser_screenshots/15_reduced_motion.png' });
  await ctx.close();
}

await browser.close();

console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  - ${f.name}  ${f.detail}`);
process.exit(failed.length ? 1 : 0);

/**
 * Audits the surfaces the five journeys do not exercise: the routes nobody
 * clicked through, the accessibility contract, reduced motion, and the
 * responsive steps. Everything is read back off the page.
 */
import { chromium } from 'playwright';

const BASE = process.env.WALK_BASE || 'http://127.0.0.1:4173';
const PW = 'deku-demo-pw-2026';
const SHOTS = '/app/.browser_screenshots';

let pass = 0;
let fail = 0;
const failures = [];
const consoleErrors = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const EXEC =
  process.env.CHROME_PATH ||
  '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';

async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/New_York',
    ...opts,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror :: ${e.message}`));
  return page;
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }),
    page.click('button[type=submit]'),
  ]);
  await page.waitForLoadState('networkidle');
}

/** Relative luminance contrast, for the WCAG AA body-text check. */
function contrast(rgb1, rgb2) {
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(rgb1);
  const b = lum(rgb2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const parseRgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });

  /* ------------------------------------------------- routes never clicked */

  console.log('\n== routes the journeys did not visit ==');
  const page = await newCtx(browser);

  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  check(
    'the get-the-app page reads "Get the App"',
    (await page.locator('h1').innerText()).trim() === 'Get the App',
  );
  check(
    'it carries a scan code drawn as vector geometry',
    (await page.locator('app-scan-code svg').count()) === 1,
  );
  // 25 modules at 9.2 = 230, plus a quiet zone of 4 modules on every side.
  const viewBox = await page.locator('app-scan-code svg').getAttribute('viewBox');
  const [vx, vy, vw, vh] = (viewBox || '').split(/\s+/).map(Number);
  const quiet = 4 * 9.2;
  check(
    'the scan code is a 25x25 module grid at 9.2 with a 4-module quiet zone',
    Math.abs(vx + quiet) < 0.01 &&
      Math.abs(vy + quiet) < 0.01 &&
      Math.abs(vw - (230 + 2 * quiet)) < 0.01 &&
      Math.abs(vh - (230 + 2 * quiet)) < 0.01,
    String(viewBox),
  );
  check(
    'it carries three finder patterns',
    (await page.locator('app-scan-code svg rect[stroke]').count()) === 3,
  );
  await page.screenshot({ path: `${SHOTS}/21_get_the_app.png` });

  await page.goto(`${BASE}/running`, { waitUntil: 'networkidle' });
  check(
    'a category name resolves to the category page',
    (await page.locator('h1').innerText()).trim() === 'Running',
  );
  check('the masthead carries the category glyph', (await page.locator('svg').count()) > 0);
  check(
    'the counts line is present',
    /published event|calendar/.test(await page.locator('.counts').innerText()),
  );
  check(
    'the subscribe button reads Subscribe',
    (await page.locator('.subscribe button').innerText()).trim() === 'Subscribe',
  );
  await page.screenshot({ path: `${SHOTS}/22_category_running.png` });

  await page.goto(`${BASE}/crypto`, { waitUntil: 'networkidle' });
  check(
    'an empty category reads the pinned sentence',
    (await page.locator('.empty-state h2').innerText()).trim() ===
      'There are currently no relevant events near you.',
  );
  check(
    'and offers Explore Events',
    (await page.locator('.empty-state .btn').innerText()).trim() === 'Explore Events',
  );

  await page.goto(`${BASE}/riverside-run-club`, { waitUntil: 'networkidle' });
  check(
    'a calendar slug resolves to the calendar page',
    (await page.locator('h1').innerText()).includes('Riverside Run Club'),
  );
  check(
    'it lists the events on that calendar',
    (await page.locator('.card-link').count()) >= 3,
  );
  await page.screenshot({ path: `${SHOTS}/23_calendar_page.png` });

  await page.goto(`${BASE}/priya-raman`, { waitUntil: 'networkidle' });
  check(
    'an account handle resolves to the profile page',
    (await page.locator('h1').innerText()).includes('Priya Raman'),
  );

  await page.goto(`${BASE}/no-such-thing-at-all`, { waitUntil: 'networkidle' });
  const nf = await page.locator('h1').innerText();
  check('an unknown slug is the not-found page', nf.includes('Page Not Found'), nf);
  check(
    'the not-found body is the pinned sentence',
    (await page.locator('.body').innerText()).trim() ===
      "Looks like you discovered a page that doesn't exist or you don't have access to.",
  );
  check(
    'it offers Return Home',
    (await page.locator('main .btn-primary').innerText()).trim() === 'Return Home',
  );

  await page.goto(`${BASE}/suspended`, { waitUntil: 'networkidle' });
  check(
    'the suspended page reads Account Suspended',
    (await page.locator('h1').innerText()).trim() === 'Account Suspended',
  );
  check(
    'with its pinned body',
    (await page.locator('.body').innerText()).trim() ===
      'This user account is suspended for violating our terms of service.',
  );

  /* -------------------------------------------------- empty states pinned */

  console.log('\n== pinned empty states ==');
  const emptyGuest = await newCtx(browser);
  await signIn(emptyGuest, 'guest3@example.com');
  await emptyGuest.goto(`${BASE}/discover?q=zzzznothingmatchesthis`, {
    waitUntil: 'networkidle',
  });
  check(
    'discover empty state reads No Events Found',
    (await emptyGuest.locator('.empty-state h2').innerText()).trim() === 'No Events Found',
  );
  check(
    'with its pinned body',
    (await emptyGuest.locator('.empty-state p').innerText()).trim() ===
      'Try a wider date range or a different category.',
  );
  check(
    'and a Clear Filters action',
    (await emptyGuest.locator('.empty-state .btn').innerText()).trim() === 'Clear Filters',
  );
  await emptyGuest.screenshot({ path: `${SHOTS}/24_discover_empty.png` });

  /* ------------------------------------------- the composer, end to end */

  console.log('\n== the composer creates a real event ==');
  const host = await newCtx(browser);
  await signIn(host, 'host@example.com');
  await host.goto(`${BASE}/create`, { waitUntil: 'networkidle' });

  check(
    'the title placeholder reads Event Name',
    (await host.locator('#title').getAttribute('placeholder')) === 'Event Name',
  );
  check(
    'the submit button reads Create Event',
    (await host.locator('button[type=submit]').innerText()).trim() === 'Create Event',
  );
  const settingLabels = await host.locator('.s-label').allInnerTexts();
  check(
    'the capacity and theme rows carry their pinned copy',
    settingLabels.includes('Capacity') && settingLabels.includes('Theme'),
    JSON.stringify(settingLabels),
  );
  const inlineWords = await host.locator('.inline').allInnerTexts();
  check(
    'the capacity row reads Unlimited and Waitlist Enabled',
    inlineWords.some((w) => w.includes('Unlimited')) &&
      inlineWords.some((w) => w.includes('Waitlist Enabled')),
    JSON.stringify(inlineWords),
  );
  check(
    'the theme row reads Seasonal',
    (await host.locator('.theme-word').innerText()).trim() === 'Seasonal',
  );
  await host.screenshot({ path: `${SHOTS}/25_composer.png` });

  const title = `Audit Night ${Date.now()}`;
  await host.fill('#title', title);
  await host.fill('#starts', '2031-07-04T18:00');
  await host.fill('#ends', '2031-07-04T20:00');
  await host.fill('#city', 'Berlin');
  await host.locator('.cap').fill('4');
  await Promise.all([
    host.waitForURL(/\/manage\/overview$/, { timeout: 20000 }),
    host.click('button[type=submit]'),
  ]);
  check('creating an event lands on its dashboard', /\/manage\/overview$/.test(host.url()), host.url());
  const newSlug = (host.url().match(/\/event\/([^/]+)\//) || [])[1];
  check('the new event got a slug in the root namespace', !!newSlug, String(newSlug));

  // it is published and discoverable, and its page is themed
  const visitor = await newCtx(browser);
  await visitor.goto(`${BASE}/${newSlug}`, { waitUntil: 'networkidle' });
  check(
    'the new event is live at its own address',
    (await visitor.locator('h1.event-title').innerText()).includes('Audit Night'),
  );
  const ground = await visitor.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  check(
    'and arrives already wearing a derived colour',
    ground !== 'rgb(255, 255, 255)' && ground !== 'rgba(0, 0, 0, 0)',
    ground,
  );

  /* ----------------------------------------- the guest list empty state */

  await host.goto(`${BASE}/event/${newSlug}/manage/guests`, { waitUntil: 'networkidle' });
  check(
    'a new event has the pinned No Guests Yet state',
    (await host.locator('.empty-state h2').innerText()).trim() === 'No Guests Yet',
  );
  check(
    'with its pinned body',
    (await host.locator('.empty-state p').innerText()).trim() ===
      'Share your event link and registrations will appear here.',
  );
  check(
    'and a Copy Link action',
    (await host.locator('.empty-state .btn').innerText()).trim() === 'Copy Link',
  );

  /* ------------------------------------- closing and reopening registration */

  console.log('\n== closing and reopening registration ==');
  await host.goto(`${BASE}/event/${newSlug}/manage/registration`, {
    waitUntil: 'networkidle',
  });
  const openSwitch = host.locator('[role=switch]').last();
  check(
    'the registration switch reports its state to a reader',
    (await openSwitch.getAttribute('aria-checked')) === 'true',
  );
  await openSwitch.click();
  await host.waitForTimeout(1500);
  check(
    'turning it off closes registration',
    (await openSwitch.getAttribute('aria-checked')) === 'false',
  );

  await visitor.goto(`${BASE}/${newSlug}`, { waitUntil: 'networkidle' });
  check(
    'the public panel switches to its closed state',
    (await visitor.locator('.panel-title').innerText()).trim() === 'Registration Is Closed',
  );

  await host.locator('[role=switch]').last().click();
  await host.waitForTimeout(1500);
  await visitor.goto(`${BASE}/${newSlug}`, { waitUntil: 'networkidle' });
  check(
    'turning it back on restores the panel that was there before',
    (await visitor.locator('.panel-title').innerText()).trim() === 'Register',
  );

  /* -------------------------------------------------------- accessibility */

  console.log('\n== accessibility contract ==');
  for (const route of ['/', '/discover', '/thursday-night-5k', '/running', '/login']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    const h1s = await page.locator('h1').count();
    check(`one h1 on ${route}`, h1s === 1, `found ${h1s}`);
  }

  await page.goto(`${BASE}/thursday-night-5k`, { waitUntil: 'networkidle' });
  const landmarks = await page.evaluate(() => ({
    header: document.querySelectorAll('header, [role=banner]').length,
    main: document.querySelectorAll('main, [role=main]').length,
  }));
  check('the bar and the content are landmarks', landmarks.header >= 1 && landmarks.main >= 1,
    JSON.stringify(landmarks));

  // WCAG AA on body text, measured on colours composited the way they paint:
  // every translucent layer is flattened onto the one beneath it, and the
  // element's own opacity is applied, exactly as the screen shows them.
  const bodyContrast = await page.evaluate(() => {
    const parse = (s) => {
      const n = (s.match(/[\d.]+/g) || []).map(Number);
      return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
    };
    const over = (fg, a, bg) => fg.map((f, i) => a * f + (1 - a) * bg[i]);

    const el = document.querySelector('.panel-body');
    // Flatten the background stack from the page ground upwards.
    const stack = [];
    for (let n = el; n; n = n.parentElement) stack.push(n);
    let bg = [255, 255, 255];
    for (const node of stack.reverse()) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.a > 0) bg = over(c.rgb, c.a, bg);
    }
    // The text colour, then the element's own opacity against that background.
    const fg = parse(getComputedStyle(el).color);
    let text = over(fg.rgb, fg.a, bg);
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) {
      opacity *= Number(getComputedStyle(n).opacity);
    }
    text = over(text, opacity, bg);
    return { text, bg };
  });
  const ratio = contrast(bodyContrast.text, bodyContrast.bg);
  check(
    'body text meets WCAG AA (4.5:1)',
    ratio >= 4.5,
    `${ratio.toFixed(2)}:1 ${JSON.stringify(bodyContrast)}`,
  );

  // every icon-only control carries a text name
  const unnamed = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a')) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      if (!text && !label) out.push(el.outerHTML.slice(0, 90));
    }
    return out;
  });
  check('every icon-only control has a text name', unnamed.length === 0, JSON.stringify(unnamed));

  // a visible focus ring that does not affect layout
  const ring = await page.evaluate(() => {
    const btn = document.querySelector('.panel-action, .btn');
    if (!btn) return null;
    btn.focus();
    const s = getComputedStyle(btn);
    return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
  });
  check('a focus ring is drawn as an outline', !!ring && ring.style !== 'none', JSON.stringify(ring));

  // touch targets
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a.btn, input, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 44 && r.width < 44) {
        out.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  check('tappable controls are at least 44px on an axis', small.length === 0, JSON.stringify(small));

  /* --------------------------------------------------------- reduced motion */

  console.log('\n== reduced motion ==');
  const calm = await newCtx(browser, { reducedMotion: 'reduce' });
  await calm.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const landingAnim = await calm.evaluate(() => {
    const el = document.querySelector('.poster');
    return el ? getComputedStyle(el).animationName : 'none';
  });
  check('the landing drift does not run', landingAnim === 'none', landingAnim);

  await calm.goto(`${BASE}/thursday-night-5k`, { waitUntil: 'networkidle' });
  const themeFade = await calm.evaluate(() => {
    const el = document.querySelector('.theme-ground');
    return el ? { name: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity } : null;
  });
  check(
    'the theme fade renders in its final state at once',
    themeFade && themeFade.name === 'none' && themeFade.opacity === '1',
    JSON.stringify(themeFade),
  );
  const hoverStill = await calm.evaluate(() => {
    const el = document.querySelector('.btn');
    return el ? getComputedStyle(el).transitionDuration : '';
  });
  check(
    'hover transitions still run under reduced motion',
    hoverStill !== '' && hoverStill !== '0s',
    hoverStill,
  );

  /* ------------------------------------------------------------ responsive */

  console.log('\n== responsive steps ==');
  const rail = await newCtx(browser);
  await signIn(rail, 'host@example.com');
  await rail.setViewportSize({ width: 1440, height: 900 });
  await rail.goto(`${BASE}/calendars`, { waitUntil: 'networkidle' });
  const wideRail = await rail.evaluate(
    () => document.querySelector('.rail')?.getBoundingClientRect().width,
  );
  check('the signed-in rail is 260px at desktop', Math.round(wideRail) === 260, String(wideRail));

  await rail.setViewportSize({ width: 820, height: 900 });
  await rail.waitForTimeout(400);
  const narrowRail = await rail.evaluate(
    () => document.querySelector('.rail')?.getBoundingClientRect().width,
  );
  check('it collapses to a 56px icon bar below 1000px', Math.round(narrowRail) === 56,
    String(narrowRail));

  // the drawer traps focus and closes on escape
  await rail.click('.menu-btn');
  await rail.waitForTimeout(400);
  const openedRail = await rail.evaluate(
    () => document.querySelector('.rail')?.getBoundingClientRect().width,
  );
  check('the icon bar opens as a drawer', Math.round(openedRail) === 260, String(openedRail));
  await rail.keyboard.press('Escape');
  await rail.waitForTimeout(400);
  const closedRail = await rail.evaluate(
    () => document.querySelector('.rail')?.getBoundingClientRect().width,
  );
  check('and closes on the escape key', Math.round(closedRail) === 56, String(closedRail));
  await rail.screenshot({ path: `${SHOTS}/26_tablet_rail.png` });

  // the guest list drops the email column, then becomes cards
  await rail.setViewportSize({ width: 1440, height: 900 });
  await rail.goto(`${BASE}/event/thursday-night-5k/manage/guests`, {
    waitUntil: 'networkidle',
  });
  const emailWide = await rail.locator('.col-email').first().isVisible();
  check('the guest list keeps its email column at desktop', emailWide);
  await rail.setViewportSize({ width: 600, height: 900 });
  await rail.waitForTimeout(400);
  const emailNarrow = await rail.locator('.col-email').first().isVisible();
  check('it drops the email column below 650px', !emailNarrow);
  await rail.setViewportSize({ width: 420, height: 900 });
  await rail.waitForTimeout(400);
  const asCards = await rail.evaluate(() => {
    const td = document.querySelector('.guests tbody td');
    if (!td) return null;
    return {
      display: getComputedStyle(td).display,
      label: getComputedStyle(td, '::before').content,
    };
  });
  check(
    'and becomes one card per guest below 484px, keeping the header words',
    asCards && asCards.display === 'flex' && /Guest|Status|Ticket/.test(asCards.label || ''),
    JSON.stringify(asCards),
  );
  await rail.screenshot({ path: `${SHOTS}/27_phone_guest_cards.png` });

  /* ------------------------------------------------- keyboard reachability */

  console.log('\n== keyboard ==');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const reached = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    reached.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}${el.id ? '#' + el.id : ''}` : 'none';
      }),
    );
  }
  check(
    'tabbing reaches the email, the password and the submit',
    reached.some((r) => r === 'INPUT#email') &&
      reached.some((r) => r === 'INPUT#password') &&
      reached.some((r) => r.startsWith('BUTTON')),
    JSON.stringify(reached),
  );

  /* ------------------------------------------------------- console health */

  const real = consoleErrors.filter(
    (e) => !/favicon|Failed to load resource/.test(e),
  );
  check('no console errors during the audit', real.length === 0, JSON.stringify(real.slice(0, 5)));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('audit crashed:', e);
  process.exit(2);
});

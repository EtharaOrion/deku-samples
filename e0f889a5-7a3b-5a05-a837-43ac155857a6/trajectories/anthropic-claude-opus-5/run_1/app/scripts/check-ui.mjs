// Check the front-end contract: reduced motion, contrast, focus rings, the
// type scale at its measured points, and the skip link.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire('/tmp/');
const { chromium } = require('/tmp/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const CHROME = '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';

let failures = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? ' ' : '!'} ${name}${detail ? `  ${detail}` : ''}`);
};

// WCAG relative luminance and contrast ratio.
const lum = ([r, g, b]) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const parse = (css) => (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});

// ---- the type scale at its measured points --------------------------------
console.log('== the type scale');
for (const [width, display, body] of [[390, 46.8, 14.625], [990, 118.8, 37.125], [1440, 48.932, 20.9709]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const measured = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const px = (v) => parseFloat(v);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:var(--display-fs)';
    document.body.appendChild(probe);
    const d = px(getComputedStyle(probe).fontSize);
    probe.style.fontSize = 'var(--body-fs)';
    const b = px(getComputedStyle(probe).fontSize);
    probe.remove();
    return { d, b };
  });
  ok(`display at ${width}px is ${display}`, Math.abs(measured.d - display) < 0.6, `measured ${measured.d.toFixed(3)}`);
  ok(`body at ${width}px is ${body}`, Math.abs(measured.b - body) < 0.6, `measured ${measured.b.toFixed(3)}`);
  await ctx.close();
}

// ---- reduced motion -------------------------------------------------------
console.log('\n== reduced motion');
const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(BASE, { waitUntil: 'networkidle' });
await rm.waitForTimeout(600);
const filmPlaying = await rm.evaluate(() => {
  const v = document.getElementById('stage-film');
  return v ? (!v.paused && !v.ended) : false;
});
ok('the film does not play under reduced motion', !filmPlaying);

// The darkening is never removed under reduced motion.
await rm.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
await rm.waitForTimeout(300);
const rmDarken = await rm.evaluate(() =>
  Number(getComputedStyle(document.getElementById('letter-page')).getPropertyValue('--darken')));
ok('but the darkening still runs', rmDarken > 0, `--darken ${rmDarken}`);
await rmCtx.close();

// ---- contrast, focus and the skip link ------------------------------------
console.log('\n== accessibility');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const route of ['/shop', '/cart', '/downloads', '/doctor', '/sign-in']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });

  const first = await page.evaluate(() => {
    const el = document.querySelector('a, button, input, [tabindex]');
    return el ? { text: el.textContent.trim(), href: el.getAttribute('href') } : null;
  });
  ok(`${route}: the skip link is the first focusable element`,
    Boolean(first && /skip/i.test(first.text)), JSON.stringify(first));

  const body = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { color: s.color, background: s.backgroundColor };
  });
  const r = ratio(parse(body.color), parse(body.background));
  ok(`${route}: body text meets AA against its own ground`, r >= 4.5, `ratio ${r.toFixed(2)}`);

  const quiet = await page.evaluate(() => {
    const el = document.querySelector('.page-lede, .field-hint, .totals-note');
    if (!el) return null;
    const s = getComputedStyle(el);
    let bg = 'rgb(0,0,0)';
    let node = el;
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)') { bg = c; break; }
      node = node.parentElement;
    }
    return { color: s.color, background: bg };
  });
  if (quiet) {
    const qr = ratio(parse(quiet.color), parse(quiet.background));
    ok(`${route}: quiet text meets AA too`, qr >= 4.5, `ratio ${qr.toFixed(2)}`);
  }
}

// A visible focus ring that never depends on the accent.
await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
const focus = await page.evaluate(() => {
  const el = document.querySelector('.rail-link');
  el.focus();
  const s = getComputedStyle(el);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor, accent };
});
ok('a focused control takes a visible ring', focus.width === '2px' && focus.style === 'solid', JSON.stringify(focus));

// The accent appears at most once per screen.
for (const route of ['/shop', '/cart', '/downloads']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  const count = await page.evaluate(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const probe = document.createElement('span');
    probe.style.color = accent;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    let n = 0;
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.color === resolved && el.textContent.trim()) n++;
      if (s.backgroundColor === resolved) n++;
    }
    return n;
  });
  ok(`${route}: the accent appears at most once`, count <= 1, `${count} uses`);
}

// On the letter the accent is on the closing line alone.
await page.goto(BASE, { waitUntil: 'networkidle' });
const letterAccent = await page.evaluate(() => {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const probe = document.createElement('span');
  probe.style.color = accent;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const hits = [];
  for (const el of document.querySelectorAll('.letter-flow *')) {
    if (getComputedStyle(el).color === resolved) hits.push(el.className || el.tagName);
  }
  return hits;
});
ok('on the letter the accent is the closing line alone',
  letterAccent.length === 1 && /closing/.test(letterAccent[0]), JSON.stringify(letterAccent));

// Tabular numerals wherever figures stack.
await page.goto(`${BASE}/downloads`, { waitUntil: 'networkidle' });
const tnum = await page.evaluate(() => {
  const el = document.querySelector('.app-size');
  return getComputedStyle(el).fontVariantNumeric;
});
ok('byte sizes are set with tabular numerals', /tabular-nums/.test(tnum), tnum);

const monoStack = await page.evaluate(() => {
  const el = document.querySelector('.app-digest');
  return getComputedStyle(el).fontFamily;
});
ok('digests are monospace and load no web font',
  /ui-monospace/.test(monoStack) && !/Vela Grotesque/.test(monoStack), monoStack);

await browser.close();
console.log(`\n${failures === 0 ? 'the front-end contract holds' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

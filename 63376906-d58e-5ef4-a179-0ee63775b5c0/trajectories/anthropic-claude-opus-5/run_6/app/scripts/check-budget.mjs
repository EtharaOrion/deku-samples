// The byte budget per route, uncached, before first paint and before the surface
// is usable. The chrome counts against every budget.
import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist';
const assets = path.join(dist, 'assets');

const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js'))
  .reduce((s, f) => s + fs.statSync(path.join(assets, f)).size, 0);
const css = fs.readdirSync(assets).filter((f) => f.endsWith('.css'))
  .reduce((s, f) => s + fs.statSync(path.join(assets, f)).size, 0);
const html = fs.statSync(path.join(dist, 'index.html')).size;
const fonts = fs.readdirSync(path.join(dist, 'fonts'))
  .reduce((s, f) => s + fs.statSync(path.join(dist, 'fonts', f)).size, 0);

// no photograph ships at all: the plant is drawn and the interface marks are
// inline vectors, so images before scroll and media before interaction are zero
const images = fs.existsSync(path.join(dist, 'favicon.svg'))
  ? fs.statSync(path.join(dist, 'favicon.svg')).size : 0;
const media = 0;

const beforePaint = html + css;
const scriptBeforeUsable = js;

const BUDGETS = [
  ['Public routes', { paint: 220000, images: 450000, script: 220000, fonts: 140000, media: 0 }],
  ['Console', { paint: 320000, images: 80000, script: 700000, fonts: 140000, media: 0 }],
  ['Balance and certificates', { paint: 360000, images: 80000, script: 800000, fonts: 140000, media: 0 }],
];

let fail = 0;
const check = (label, actual, budget) => {
  const ok = actual <= budget;
  if (!ok) fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual} of ${budget}`);
};

console.log('One build serves every route, so one set of figures answers all three classes.');
console.log(`  html ${html}  css ${css}  js ${js}  fonts ${fonts}  images ${images}  media ${media}\n`);

for (const [name, b] of BUDGETS) {
  console.log(`${name}:`);
  check('  bytes before first paint', beforePaint, b.paint);
  check('  images before scroll', images, b.images);
  check('  script before usable', scriptBeforeUsable, b.script);
  check('  fonts', fonts, b.fonts);
  check('  media before interaction', media, b.media);
}

// no photograph exceeds a quarter of a megabyte
const bigImages = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(jpe?g|png|webp|avif|gif)$/i.test(f) && st.size > 250000) bigImages.push(`${full} ${st.size}`);
  }
};
walk(dist);
console.log(`\n${bigImages.length === 0 ? 'ok  ' : 'FAIL'} no photograph exceeds a quarter of a megabyte ${bigImages.join(', ')}`);
if (bigImages.length) fail += 1;

const maps = [];
const walkMaps = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walkMaps(full);
    else if (f.endsWith('.map')) maps.push(full);
  }
};
walkMaps(dist);
console.log(`${maps.length === 0 ? 'ok  ' : 'FAIL'} no source map ships ${maps.join(', ')}`);
if (maps.length) fail += 1;

process.exit(fail ? 1 : 0);

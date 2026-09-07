// Checks the built stylesheet against the front-end constraints the brief sets:
// the colour-literal budget, the nine banned values, the blanket transition,
// the type scale, and the single breakpoint system. Not shipped in the image.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'client', 'dist', 'assets');
const cssFile = fs.readdirSync(dist).find((f) => f.endsWith('.css'));
const css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
const jsFiles = fs.readdirSync(dist).filter((f) => f.endsWith('.js'));
const js = jsFiles.map((f) => fs.readFileSync(path.join(dist, f), 'utf8')).join('\n');

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${detail}`); fail++; }
};

console.log('\n== the palette ==');

// Every hex literal in the built stylesheet.
const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
const normalised = new Set(hexes.map((h) => {
  if (h.length === 4) return '#' + h.slice(1).split('').map((c) => c + c).join('');
  return h;
}));
// Named colours that are not a role would be a defect too.
const namedColours = [...css.matchAll(/:\s*(red|green|blue|orange|yellow|purple|pink|lime|teal|navy|maroon|olive|aqua|fuchsia|silver|gray|grey|white|black)\b/g)];

console.log(`  distinct colour literals: ${normalised.size} → ${[...normalised].join(' ')}`);
ok('at most eight distinct colour literals', normalised.size <= 8, `found ${normalised.size}`);
ok('no bare named colour outside the roles', namedColours.length === 0,
  namedColours.map((m) => m[1]).join(', '));

const BANNED = ['#2d62ff', '#dd23bb', '#fcf8d8', '#cef5ca', '#114e0b', '#f8e4e4', '#3b0b0b', '#5e5515', '#0000'];
for (const b of BANNED) {
  const inCss = css.toLowerCase().includes(b);
  const inJs = js.toLowerCase().includes(b);
  ok(`${b} appears nowhere`, !inCss && !inJs, inCss ? 'in the stylesheet' : 'in the script');
}

// A token whose name carries a deletion marker is a defect.
ok('no token name carries a deletion marker',
  !/--[a-z0-9-]*(deprecated|old|unused|delete|remove|legacy|temp|tmp|xxx|todo)/i.test(css));

// A shadow token holding a fully transparent value is declared and never seen,
// so it is not declared.
ok('no fully transparent shadow token',
  !/--shadow[^;]*:\s*[^;]*(rgba\([^)]*,\s*0\s*\)|#0000\b|transparent)\s*;/i.test(css));

console.log('\n== motion ==');
ok('transition: all appears on no element', !/transition:\s*all\b/.test(css));
ok('no other blanket transition across every property',
  !/transition-property:\s*all\b/.test(css));
ok('two named durations', /--duration-quick/.test(css) && /--duration-considered/.test(css));
ok('one named curve', (css.match(/--ease\s*:/g) || []).length === 1);
const loops = [...css.matchAll(/animation[^;]*infinite/g)];
ok('nothing loops', loops.length === 0, `${loops.length} infinite animations`);
ok('a reduced-motion preference is honoured', /prefers-reduced-motion:\s*reduce/.test(css));
ok('a forced-colours preference is honoured', /forced-colors:\s*active/.test(css));
ok('a print stylesheet exists', /@media\s+print/.test(css));
ok('hover is applied only where a pointer is present',
  /hover:\s*hover/.test(css) && /pointer:\s*fine/.test(css));

console.log('\n== typography ==');
const steps = ['h1', 'h2', 'h3', 'h4', 'body-big', 'body-regular', 'body-small', 'eyebrow'];
for (const s of steps) {
  ok(`the ${s} step declares one size and one line height`,
    css.includes(`--${s}-size`) && css.includes(`--${s}-line`));
}
// The scale carries no ninth step.
ok('no ninth step at 12.75rem', !css.includes('12.75rem'));
ok('no ninth step at 8.875rem', !css.includes('8.875rem'));
// Nothing renders below twelve pixels: the floor is the eyebrow at 0.875rem.
const tiny = [...css.matchAll(/font-size:\s*(0?\.\d+)rem/g)]
  .map((m) => parseFloat(m[1])).filter((v) => v < 0.75);
ok('nothing renders below twelve pixels', tiny.length === 0, `found ${tiny.join(', ')}rem`);
const pxSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1])).filter((v) => v < 12);
ok('no pixel font-size below twelve', pxSizes.length === 0, `found ${pxSizes.join(', ')}px`);
ok('a serif is never declared with a sans-serif behind it',
  !/--font-serif:[^;]*sans-serif/.test(css));
ok('the mono carries tabular figures', /tabular-nums/.test(css));
ok('the mono carries a slashed zero', /slashed-zero/.test(css) || /'zero'\s*1/.test(css));

console.log('\n== surface ==');
const radii = new Set([...css.matchAll(/--radius-([a-z]+)\s*:/g)].map((m) => m[1]));
ok('three named radius steps and a pill', radii.size === 4, [...radii].join(', '));
const zs = [...css.matchAll(/--z-([a-z]+)\s*:\s*(-?\d+)/g)];
ok('five named stacking steps', zs.length === 5, zs.map((m) => m[1]).join(', '));
const zValues = zs.map((m) => Number(m[2]));
ok('no stacking step past the last', Math.max(...zValues) <= 1000 && Math.min(...zValues) >= -1);
const shadows = [...css.matchAll(/--shadow-([a-z]+)\s*:/g)];
ok('two named shadow steps', shadows.length === 2, shadows.map((m) => m[1]).join(', '));
ok('no three-dimensional context for two-dimensional movement',
  !/transform-style:\s*preserve-3d/.test(css) && !/perspective:\s*\d/.test(css));
ok('no filter recolours a mark', !/filter:\s*invert/.test(css));

console.log('\n== layout ==');
const queries = [...css.matchAll(/@media[^{]*\(min-width:\s*([^)]+)\)/g)].map((m) => m[1].trim());
const distinctQueries = new Set(queries);
console.log(`  breakpoints in use: ${[...distinctQueries].join(', ')}`);
ok('one breakpoint system with two widths', distinctQueries.size <= 2,
  [...distinctQueries].join(', '));
ok('each query written one way', [...distinctQueries].every((q) => q.endsWith('rem')));
ok('a max-width query is not mixed in', !/@media[^{]*max-width/.test(css.replace(/@media\s+print[^{]*/g, '')));
ok('the document does not scroll sideways', /overflow-x:\s*hidden/.test(css));
ok('a wide table scrolls inside its own container', /\.table-scroll\{[^}]*overflow-x:\s*auto/.test(css.replace(/\s+/g, '')) || /overflow-x:auto/.test(css.replace(/\s+/g, '')));

console.log('\n== payload ==');
const cssBytes = Buffer.byteLength(css);
const jsBytes = jsFiles.reduce((s, f) => s + fs.statSync(path.join(dist, f)).size, 0);
const fontDir = path.join(process.cwd(), 'client', 'dist', 'fonts');
const fontBytes = fs.readdirSync(fontDir).filter((f) => f.endsWith('.woff2'))
  .reduce((s, f) => s + fs.statSync(path.join(fontDir, f)).size, 0);
console.log(`  css ${cssBytes} B, js ${jsBytes} B, fonts ${fontBytes} B`);
ok('fonts within the 140000 byte budget', fontBytes <= 140000, `${fontBytes} B`);
ok('script within the console 700000 byte budget', jsBytes <= 700000, `${jsBytes} B`);
ok('bytes before first paint within the public 220000 budget',
  cssBytes + jsBytes <= 220000, `${cssBytes + jsBytes} B`);
ok('no source map ships',
  !fs.readdirSync(dist).some((f) => f.endsWith('.map')));
ok('no general-purpose DOM library ships alongside the framework',
  !/jquery|lodash\.|zepto/i.test(js));

console.log(fail ? `\n==== ${fail} failed ====` : '\n==== every stylesheet check passed ====');
process.exit(fail ? 1 : 0);

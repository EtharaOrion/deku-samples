// Checks the built stylesheet against the palette rules in the brief.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist/assets');
const cssFile = fs.readdirSync(dist).find((f) => f.endsWith('.css'));
const css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
const jsFile = fs.readdirSync(dist).find((f) => f.endsWith('.js'));
const js = fs.readFileSync(path.join(dist, jsFile), 'utf8');

let fail = 0;
const say = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail += 1; };

// nine values must appear nowhere
const FORBIDDEN = ['#2d62ff', '#dd23bb', '#fcf8d8', '#cef5ca', '#114e0b', '#f8e4e4', '#3b0b0b', '#5e5515', '#0000'];
for (const v of FORBIDDEN) {
  const inCss = new RegExp(v.replace('#', '#') + '(?![0-9a-f])', 'i').test(css);
  const inJs = new RegExp(v.replace('#', '#') + '(?![0-9a-f])', 'i').test(js);
  say(!inCss && !inJs, `forbidden value ${v} appears nowhere`);
}

// at most eight distinct colour literals; an alpha variant of a role is that role
const hexes = [...css.matchAll(/#([0-9a-f]{3,8})\b/gi)].map((m) => m[0].toLowerCase());
const rgbas = [...css.matchAll(/rgba?\(([^)]+)\)/gi)].map((m) => m[0].toLowerCase());
const distinctHex = [...new Set(hexes)];
// map each rgba to its underlying rgb triple; if that triple is a declared role, it costs nothing
const roleTriples = new Set(distinctHex.map(toTriple).filter(Boolean));
const strayRgba = rgbas.filter((r) => {
  const nums = r.match(/[\d.]+/g) || [];
  const triple = nums.slice(0, 3).map(Number).join(',');
  return !roleTriples.has(triple);
});
console.log('  distinct hex literals:', distinctHex.join(' '));
console.log('  rgba() values not reducible to a declared role:', strayRgba.length ? strayRgba.join(' ') : 'none');
say(distinctHex.length + strayRgba.length <= 8,
  `at most eight distinct colour literals (found ${distinctHex.length + strayRgba.length})`);

// a token whose name contains a deletion marker is a defect
say(!/--[a-z0-9-]*(deprecated|old|legacy|unused|delete|remove|tmp|temp|v2)[a-z0-9-]*\s*:/i.test(css),
  'no token name carries a deletion marker');

// transition: all appears on no element, and no other blanket transition
say(!/transition\s*:\s*all\b/i.test(css), '`transition: all` appears on no element');
const blanket = [...css.matchAll(/transition(-property)?\s*:\s*([^;}]+)/gi)]
  .map((m) => m[2].trim())
  .filter((v) => /^all\b/i.test(v));
say(blanket.length === 0, 'no blanket transition across every property');

// the scale carries no ninth step
say(!/12\.75rem/.test(css) && !/8\.875rem/.test(css), 'the two display sizes that never rendered are removed');

// nothing renders below twelve pixels: 0.875rem is the floor at 16px root
const remSizes = [...css.matchAll(/font-size\s*:\s*([\d.]+)rem/gi)].map((m) => Number(m[1]));
const pxSizes = [...css.matchAll(/font-size\s*:\s*([\d.]+)px/gi)].map((m) => Number(m[1]));
say(remSizes.every((r) => r * 16 >= 12), `no rem font-size below 12px (min ${Math.min(...remSizes) * 16}px)`);
say(pxSizes.every((p) => p >= 12), 'no px font-size below 12px');

// no source map ships
const maps = fs.readdirSync(dist).filter((f) => f.endsWith('.map'));
say(maps.length === 0, 'no source map ships');

// no general-purpose DOM library alongside the framework
say(!/jquery|\$\.fn\b/i.test(js), 'no general-purpose DOM library ships');

// every step names one size and exactly one line height
const steps = ['h1', 'h2', 'h3', 'h4', 'body-big', 'body-regular', 'body-small', 'eyebrow'];
for (const s of steps) {
  const hasSize = new RegExp(`--step-${s}-size\\s*:`).test(css);
  const hasLh = new RegExp(`--step-${s}-lh\\s*:`).test(css);
  say(hasSize && hasLh, `step ${s} declares one size and one line height`);
}

function toTriple(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

console.log(fail === 0 ? '\nAll stylesheet checks pass.' : `\n${fail} stylesheet checks failed.`);
process.exit(fail ? 1 : 0);

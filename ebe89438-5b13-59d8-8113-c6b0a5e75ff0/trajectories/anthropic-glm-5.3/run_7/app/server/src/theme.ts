import { createHash } from 'node:crypto';

/** hex -> {h,s,l} in 0..360 / 0..1 / 0..1 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { b = c; r = x; }
  const m = l - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hslString(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

function relLum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const la = relLum(a), lb = relLum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type Theme = {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  ok: boolean;
};

/**
 * The whole palette for one event, computed once, on the server, from the
 * event's stored key colour, and handed to the components as tokens.
 */
export function themeFor(themeHex: string): Theme {
  const { h } = hexToHsl(themeHex);
  const groundHex = hslToHex(h, 0.08, 0.94);
  const sunkHex = hslToHex(h, 0.10, 0.90);
  const inkHex = hslToHex(h, 1, 0.11);
  const [r, g, b] = rgbOf(inkHex);

  const theme: Theme = {
    key: themeHex.toLowerCase(),
    ground: groundHex,
    sunk: sunkHex,
    ink: inkHex,
    inkSecondary: `rgba(${r}, ${g}, ${b}, 0.36)`,
    hairline: `rgba(${r}, ${g}, ${b}, 0.08)`,
    panel: `rgba(${r}, ${g}, ${b}, 0.04)`,
    ok: true,
  };
  // A key colour too pale to read from falls back to the neutral pair.
  if (contrast(groundHex, inkHex) < 4.5) {
    return { ...theme, ok: false, ground: '#ffffff', sunk: '#fafafa', ink: '#151515',
      inkSecondary: 'rgba(21, 21, 21, 0.36)', hairline: 'rgba(21, 21, 21, 0.08)', panel: 'rgba(21, 21, 21, 0.04)' };
  }
  return theme;
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function themeCss(theme: Theme): string {
  return `:root{--ev-key:${theme.key};--ev-ground:${theme.ground};--ev-sunk:${theme.sunk};--ev-ink:${theme.ink};--ev-ink-2:${theme.inkSecondary};--ev-hairline:${theme.hairline};--ev-panel:${theme.panel};--ev-ok:${theme.ok ? '1' : '0'}}`;
}

/** Cover generation, shared with the front end by seed hash. */
const COVER_COLORS = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

export type CoverSpec = {
  angle: number;
  stops: [string, string];
  radial1: { x: number; y: number; color: string };
  radial2: { x: number; y: number; color: string };
};

export function coverFor(seed: string): CoverSpec {
  const h1 = parseInt(createHash('sha256').update('a' + seed).digest('hex').slice(0, 8), 16);
  const h2 = parseInt(createHash('sha256').update('b' + seed).digest('hex').slice(0, 8), 16);
  const idx = h1 % COVER_COLORS.length;
  const dir = h2 % 2 === 0 ? 1 : COVER_COLORS.length - 1;
  const stops: [string, string] = [COVER_COLORS[idx], COVER_COLORS[(idx + dir) % COVER_COLORS.length]];
  return {
    angle: (h1 % 360),
    stops,
    radial1: { x: 20 + (h2 % 60), y: 20 + ((h1 >> 5) % 60), color: stops[0] },
    radial2: { x: 20 + ((h2 >> 7) % 60), y: 25 + ((h2 >> 11) % 55), color: stops[1] },
  };
}

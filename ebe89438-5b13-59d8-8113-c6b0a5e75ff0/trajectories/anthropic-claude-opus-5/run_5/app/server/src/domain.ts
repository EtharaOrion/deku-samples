export const CATEGORIES = [
  'family',
  'books',
  'games',
  'tech',
  'food-and-drink',
  'ai',
  'running',
  'arts-and-culture',
  'climate',
  'fitness',
  'wellness',
  'crypto',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const RESERVED_PATHS = [
  'api',
  'app',
  'login',
  'signup',
  'home',
  'calendars',
  'create',
  'discover',
  'settings',
  'event',
  't',
] as const;

export const CATEGORY_SET = new Set<string>(CATEGORIES);
export const RESERVED_SET = new Set<string>(RESERVED_PATHS);

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebab(value: string): boolean {
  return KEBAB.test(value) && value.length >= 2 && value.length <= 80;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

/** Deterministic 32-bit hash, shared with the client so covers match. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const COVER_COLOURS = [
  '#f31a7c',
  '#146aeb',
  '#3cbd2c',
  '#ab46dd',
  '#d69712',
  '#007aff',
  '#28cd41',
  '#ff3b30',
] as const;

export function themeHexFromSeed(seed: string): string {
  const h = hashSeed(seed);
  return COVER_COLOURS[h % COVER_COLOURS.length];
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = ln - c / 2;
  const to = (v: number) =>
    Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

function srgb(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface EventTheme {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  themed: boolean;
}

/**
 * One place derives an event's whole palette from its key colour; components
 * only ever consume the tokens it returns.
 */
export function deriveTheme(themeHex: string): EventTheme {
  const [r, g, b] = hexToRgb(themeHex);
  const [h] = rgbToHsl(r, g, b);
  const ground = hslToHex(h, 8, 94);
  const sunk = hslToHex(h, 10, 90);
  const ink = hslToHex(h, 100, 11);
  const [ir, ig, ib] = hexToRgb(ink);
  const theme: EventTheme = {
    key: themeHex,
    ground,
    sunk,
    ink,
    inkSecondary: `rgba(${ir}, ${ig}, ${ib}, 0.36)`,
    hairline: `rgba(${ir}, ${ig}, ${ib}, 0.08)`,
    panel: `rgba(${ir}, ${ig}, ${ib}, 0.04)`,
    themed: true,
  };
  if (contrastRatio(ground, ink) < 4.5) {
    return {
      key: themeHex,
      ground: '#ffffff',
      sunk: '#fafafa',
      ink: '#151515',
      inkSecondary: 'rgba(21, 21, 21, 0.36)',
      hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)',
      themed: false,
    };
  }
  return theme;
}

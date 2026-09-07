/** The product ships no image files; every picture is drawn by the code. */

export const COVER_COLOURS = [
  '#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd',
  '#d69712', '#007aff', '#28cd41', '#ff3b30',
];

export function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface CoverArt {
  angle: number;
  a: string; b: string;
  r1x: number; r1y: number; r2x: number; r2y: number;
  gradient: string;
  radial: string;
}

/**
 * A cover is a four-stop linear gradient at a hash-derived angle between two
 * neighbouring colours, with two radial gradients over it and a grain overlay.
 */
export function coverArt(seed: string): CoverArt {
  const h = hash32(seed || 'seed');
  const i = h % COVER_COLOURS.length;
  const j = (i + 1) % COVER_COLOURS.length;
  const a = COVER_COLOURS[i];
  const b = COVER_COLOURS[j];
  const angle = (h >>> 3) % 360;
  const r1x = 12 + ((h >>> 5) % 76);
  const r1y = 12 + ((h >>> 9) % 76);
  const r2x = 12 + ((h >>> 13) % 76);
  const r2y = 12 + ((h >>> 17) % 76);
  return {
    angle, a, b, r1x, r1y, r2x, r2y,
    gradient: `linear-gradient(${angle}deg, ${a} 0%, ${mix(a, b, 0.35)} 35%, ${mix(a, b, 0.7)} 70%, ${b} 100%)`,
    radial:
      `radial-gradient(circle at ${r1x}% ${r1y}%, ${withAlpha(b, 0.4)} 0%, ${withAlpha(b, 0)} 55%), ` +
      `radial-gradient(circle at ${r2x}% ${r2y}%, ${withAlpha(a, 0.4)} 0%, ${withAlpha(a, 0)} 55%)`,
  };
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function toRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const int = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function mix(a: string, b: string, t: number): string {
  const A = toRgb(a), B = toRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** An avatar is generated from the display name, never a grey silhouette. */
export function avatarFor(name: string): { bg: string; initial: string } {
  const n = (name || '?').trim();
  const h = hash32(n.toLowerCase());
  return {
    bg: COVER_COLOURS[h % COVER_COLOURS.length],
    initial: (n[0] || '?').toUpperCase(),
  };
}

// ------------------------------------------------------------------- theming

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r: R, g: G, b: B } = toRgb(hex);
  const r = R / 255, g = G / 255, b = B / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hsl(h: number, s: number, l: number): string {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

export interface ThemeTokens {
  theme: string; ground: string; sunk: string; ink: string;
  inkSecondary: string; hairline: string; panel: string; tooPale: boolean;
}

function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The same derivation the server does, for themes the shell did not carry. */
export function deriveTheme(themeHex: string): ThemeTokens {
  const { h, s } = hexToHsl(themeHex);
  const ground = hsl(h, 8, 94);
  const sunk = hsl(h, 10, 90);
  const ink = hsl(h, Math.max(s, 100), 11);
  const { r, g, b } = toRgb(ink);
  if (contrast(ground, ink) < 4.5) {
    return {
      theme: themeHex, ground: '#ffffff', sunk: '#fafafa', ink: '#151515',
      inkSecondary: 'rgba(21, 21, 21, 0.36)', hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)', tooPale: true,
    };
  }
  return {
    theme: themeHex, ground, sunk, ink,
    inkSecondary: `rgba(${r}, ${g}, ${b}, 0.36)`,
    hairline: `rgba(${r}, ${g}, ${b}, 0.08)`,
    panel: `rgba(${r}, ${g}, ${b}, 0.04)`,
    tooPale: false,
  };
}

/**
 * A scan code drawn as vector geometry on a 0 0 230 230 grid: a 25 by 25 module
 * matrix at 9.2 per module with a quiet zone of 4 and three finder patterns.
 */
export function scanMatrix(payload: string): boolean[][] {
  const N = 25;
  const grid: boolean[][] = Array.from({ length: N }, () => new Array(N).fill(false));
  let seed = hash32(payload || 'deku');
  const next = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inFinder(x, y)) continue;
      grid[y][x] = next() > 0.5;
    }
  }
  return grid;
}

export const SCAN_MODULES = 25;
export const SCAN_UNIT = 9.2;
export const SCAN_QUIET = 4;

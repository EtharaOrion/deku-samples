/**
 * The theming layer: an event's whole palette is computed once, here, on the
 * server, and handed to the components as tokens. No component decides its own
 * colour, which is what lets the same registration panel sit correctly on a
 * themed event page and on a plain settings screen.
 */

export type ThemeTokens = {
  theme_hex: string;
  ground: string;
  ground_sunk: string;
  ink: string;
  ink_secondary: string;
  hairline: string;
  panel: string;
  accent: string;
  too_pale: boolean;
};

export const PAPER = '#ffffff';
export const INK = '#151515';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number) {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
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
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

export function hslHex(h: number, s: number, l: number) {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function channel(c: number) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgba(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

/**
 * Ground at 8% saturation and 94% lightness, sunk ground at 10% and 90%, ink at
 * full saturation and 11% lightness, secondary ink at 0.36 alpha, hairlines at
 * 0.08 and the panel fill at 0.04. The measured reference page confirms the
 * last four, its ink #000f3a being a near-black at the blue hue.
 */
export function deriveTheme(themeHex: string): ThemeTokens {
  const hex = /^#[0-9a-fA-F]{6}$/.test(themeHex || '') ? themeHex.toLowerCase() : '#146aeb';
  const [r, g, b] = hexToRgb(hex);
  const [h] = rgbToHsl(r, g, b);

  const ground = hslHex(h, 8, 94);
  const groundSunk = hslHex(h, 10, 90);
  const ink = hslHex(h, 100, 11);

  // If a derived ground fails contrast against its own derived ink, fall back
  // to paper and ink and tell the host the cover is too pale to theme from.
  const tooPale = contrastRatio(ground, ink) < 4.5;
  if (tooPale) {
    return {
      theme_hex: hex,
      ground: PAPER,
      ground_sunk: '#fafafa',
      ink: INK,
      ink_secondary: 'rgba(21, 21, 21, 0.36)',
      hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)',
      accent: hex,
      too_pale: true,
    };
  }

  return {
    theme_hex: hex,
    ground,
    ground_sunk: groundSunk,
    ink,
    ink_secondary: rgba(ink, 0.36),
    hairline: rgba(ink, 0.08),
    panel: rgba(ink, 0.04),
    accent: hex,
    too_pale: false,
  };
}

const COVER_COLOURS = [
  '#f31a7c',
  '#146aeb',
  '#3cbd2c',
  '#ab46dd',
  '#d69712',
  '#007aff',
  '#28cd41',
  '#ff3b30',
];

export function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/** theme_hex is derived once at creation from cover_seed. */
export function themeHexFromSeed(seed: string) {
  const h = hashSeed(seed);
  return COVER_COLOURS[h % COVER_COLOURS.length];
}

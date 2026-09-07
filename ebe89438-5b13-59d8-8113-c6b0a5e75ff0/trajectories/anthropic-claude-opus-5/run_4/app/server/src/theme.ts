/**
 * The theming layer: an event's whole palette is computed once, here, on the
 * server, and handed to the components as tokens. No component picks its own
 * colour, which is why the same registration panel sits correctly on a themed
 * event page and on a plain settings screen.
 */

export interface ThemeTokens {
  key: string;
  ground: string;
  groundSunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  hue: number;
  tooPale: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const PAPER = '#ffffff';
const PAPER_INK = '#151515';

/** The ground at 8/94, the sunk ground at 10/90, the ink at full saturation and 11. */
export function deriveTheme(themeHex: string): ThemeTokens {
  const [h] = rgbToHsl(...hexToRgb(themeHex));
  const hue = Math.round(h);
  const ground = toHex(hslToRgb(hue, 8, 94));
  const groundSunk = toHex(hslToRgb(hue, 10, 90));
  const ink = toHex(hslToRgb(hue, 100, 11));
  const inkRgb = hexToRgb(ink);
  const rgbTriple = `${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}`;

  // A derived ground that fails contrast against its own derived ink falls back
  // to paper and ink, and the host is told the cover is too pale to theme from.
  const tooPale = contrastRatio(ground, ink) < 4.5;
  if (tooPale) {
    return {
      key: themeHex,
      ground: PAPER,
      groundSunk: '#fafafa',
      ink: PAPER_INK,
      inkSecondary: 'rgba(21, 21, 21, 0.36)',
      hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)',
      hue,
      tooPale: true,
    };
  }

  return {
    key: themeHex,
    ground,
    groundSunk,
    ink,
    inkSecondary: `rgba(${rgbTriple}, 0.36)`,
    hairline: `rgba(${rgbTriple}, 0.08)`,
    panel: `rgba(${rgbTriple}, 0.04)`,
    hue,
    tooPale: false,
  };
}

export function themeCssVariables(t: ThemeTokens): string {
  return [
    `--event-key: ${t.key}`,
    `--event-ground: ${t.ground}`,
    `--event-ground-sunk: ${t.groundSunk}`,
    `--event-ink: ${t.ink}`,
    `--event-ink-secondary: ${t.inkSecondary}`,
    `--event-hairline: ${t.hairline}`,
    `--event-panel: ${t.panel}`,
    `--event-hue: ${t.hue}`,
    `--event-stop-1: ${t.key}22`,
    `--event-stop-2: ${t.key}18`,
    `--event-stop-3: ${t.key}14`,
    `--event-stop-4: ${t.key}10`,
  ].join('; ');
}

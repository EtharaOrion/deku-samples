export interface EventTheme {
  key: string;
  ground: string;
  groundSunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  pale: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

function withAlpha(rgb: [number, number, number], a: number): string {
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${a})`;
}

function relLuminance(r: number, g: number, b: number): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = relLuminance(...a), lb = relLuminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Derives an event's whole palette from one key colour. The ground sits at 8%
 * saturation / 94% lightness, the sunk ground at 10% / 90%, and the ink at full
 * saturation / 11% lightness. A key colour too pale to carry its own ink falls
 * back to paper and ink.
 */
export function themeFromHex(key: string): EventTheme {
  const rgb = hexToRgb(key);
  const [h, s] = rgbToHsl(...rgb);
  const ground = hslToRgb(h, Math.min(1, s * 0.08), 0.94);
  const groundSunk = hslToRgb(h, Math.min(1, s * 0.1), 0.9);
  const sat = Math.max(0.55, s);
  const ink = hslToRgb(h, sat, 0.11);
  const pale = contrast(ink, ground) < 4.5;
  if (pale) {
    return {
      key,
      ground: '#ffffff',
      groundSunk: '#fafafa',
      ink: '#000f3a',
      inkSecondary: 'rgba(0, 15, 58, 0.36)',
      hairline: 'rgba(0, 15, 58, 0.08)',
      panel: 'rgba(0, 15, 58, 0.04)',
      pale: true,
    };
  }
  return {
    key,
    ground: rgbToHex(...ground),
    groundSunk: rgbToHex(...groundSunk),
    ink: rgbToHex(...ink),
    inkSecondary: withAlpha(ink, 0.36),
    hairline: withAlpha(ink, 0.08),
    panel: withAlpha(ink, 0.04),
    pale: false,
  };
}

/** Suggested theme colours, cycled by a hash of the cover seed. */
export const THEME_KEYS = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

export function themeKeyForSeed(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return THEME_KEYS[Math.abs(hash) % THEME_KEYS.length];
}

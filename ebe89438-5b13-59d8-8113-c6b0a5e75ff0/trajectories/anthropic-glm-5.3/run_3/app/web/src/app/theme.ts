/** Derives a whole event palette from one key colour, once, on the client
 *  from the server-provided theme_hex. */
export interface EventTheme {
  hex: string;
  ground: string;
  sunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panelFill: string;
  fallback: boolean;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [20, 106, 235];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Theme derivation as pinned by the brief. */
export function themeFromHex(hex: string): EventTheme {
  const rgb = hexToRgb(hex);
  const [h, s] = rgbToHsl(...rgb);
  const ground = hslToHex(h, 0.08, 0.94);
  const sunk = hslToHex(h, 0.10, 0.90);
  const ink = hslToHex(h, 1.0, 0.11);
  const groundRgb = hexToRgb(ground);
  const c = contrast(groundRgb, hexToRgb(ink));
  const fallback = c < 4.5;
  return {
    hex,
    ground: fallback ? '#ffffff' : ground,
    sunk: fallback ? '#fafafa' : sunk,
    ink: fallback ? '#151515' : ink,
    inkSecondary: fallback ? 'rgba(21,21,21,0.36)' : `rgba(0,0,0,0.36)`,
    hairline: fallback ? 'rgba(21,21,21,0.08)' : `rgba(0,0,0,0.08)`,
    panelFill: fallback ? 'rgba(21,21,21,0.04)' : `rgba(0,0,0,0.04)`,
    fallback,
  };
}

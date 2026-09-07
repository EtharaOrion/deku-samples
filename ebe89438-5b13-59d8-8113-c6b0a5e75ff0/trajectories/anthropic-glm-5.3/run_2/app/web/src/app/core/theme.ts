import { Injectable } from '@angular/core';

/**
 * The theming layer. An event's whole palette is computed once from its
 * theme_hex, on the server side of the boundary: this function is pure and
 * shared, so the panel can sit on a themed page or a plain screen unchanged.
 */
export interface ThemeTokens {
  ground: string;
  sunk: string;
  ink: string;
  inkSoft: string;
  hairline: string;
  panelFill: string;
  fallback: boolean;
  hex: string;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb: number[]): string {
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): number[] {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function deriveTheme(hex: string): ThemeTokens {
  try {
    const [r, g, b] = parseHex(hex);
    const [h, s] = rgbToHsl(r, g, b);
    const ground = toHex(hslToRgb(h, Math.min(1, s * 0.08), 0.94));
    const sunk = toHex(hslToRgb(h, Math.min(1, s * 0.10), 0.90));
    const ink = toHex(hslToRgb(h, 1, 0.11));
    // A derived ground must hold contrast against its derived ink.
    const [gr, gg, gb] = parseHex(ground);
    const [ir, ig, ib] = parseHex(ink);
    const lum = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const ratio = (lum([gr, gg, gb]) + 12.75) / (lum([ir, ig, ib]) + 12.75);
    const fallback = ratio < 3;
    return {
      ground: fallback ? '#ffffff' : ground,
      sunk: fallback ? '#fafafa' : sunk,
      ink: fallback ? '#151515' : ink,
      inkSoft: `rgba(0, 15, 58, 0.36)`,
      hairline: `rgba(0, 15, 58, 0.08)`,
      panelFill: `rgba(0, 15, 58, 0.04)`,
      fallback, hex,
    };
  } catch {
    return { ground: '#ffffff', sunk: '#fafafa', ink: '#151515',
      inkSoft: 'rgba(21,21,21,0.36)', hairline: 'rgba(21,21,21,0.08)',
      panelFill: 'rgba(21,21,21,0.04)', fallback: true, hex: '#151515' };
  }
}

@Injectable({ providedIn: 'root' })
export class Theme {
  /** Reads the colour the server placed in the first painted document. */
  fromCookie(): string | null {
    const m = /(?:^|;\s*)event_theme=([^;]+)/.exec(document.cookie);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

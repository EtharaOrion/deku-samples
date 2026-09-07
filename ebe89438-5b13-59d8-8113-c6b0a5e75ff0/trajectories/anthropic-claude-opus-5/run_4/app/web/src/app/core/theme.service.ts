import { Injectable } from '@angular/core';

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

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
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
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
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
  return (
    '#' +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The theming layer computes an event's whole palette once and hands it out as
 * tokens. No component decides its own colour, which is what lets the same
 * registration panel sit on a themed event page and on a plain settings screen.
 */
export function deriveTheme(themeHex: string): ThemeTokens {
  const [h] = rgbToHsl(...hexToRgb(themeHex));
  const hue = Math.round(h);
  const ground = hslToHex(hue, 8, 94);
  const groundSunk = hslToHex(hue, 10, 90);
  const ink = hslToHex(hue, 100, 11);
  const [ir, ig, ib] = hexToRgb(ink);
  const triple = `${ir}, ${ig}, ${ib}`;

  if (contrastRatio(ground, ink) < 4.5) {
    return {
      key: themeHex,
      ground: '#ffffff',
      groundSunk: '#fafafa',
      ink: '#151515',
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
    inkSecondary: `rgba(${triple}, 0.36)`,
    hairline: `rgba(${triple}, 0.08)`,
    panel: `rgba(${triple}, 0.04)`,
    hue,
    tooPale: false,
  };
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private applied: string | null = null;

  /**
   * Applies an event palette to the document. The server has already written
   * these same values into the first document for an event route, so this is a
   * no-op there rather than a repaint.
   */
  apply(themeHex: string): ThemeTokens {
    const t = deriveTheme(themeHex);
    if (this.applied === themeHex) return t;
    const root = document.documentElement;
    root.style.setProperty('--event-key', t.key);
    root.style.setProperty('--event-ground', t.ground);
    root.style.setProperty('--event-ground-sunk', t.groundSunk);
    root.style.setProperty('--event-ink', t.ink);
    root.style.setProperty('--event-ink-secondary', t.inkSecondary);
    root.style.setProperty('--event-hairline', t.hairline);
    root.style.setProperty('--event-panel', t.panel);
    root.style.setProperty('--event-hue', String(t.hue));
    root.style.setProperty('--event-stop-1', `${t.key}22`);
    root.style.setProperty('--event-stop-2', `${t.key}18`);
    root.style.setProperty('--event-stop-3', `${t.key}14`);
    root.style.setProperty('--event-stop-4', `${t.key}10`);
    document.body.classList.add('on-event-theme');
    document.body.style.background = t.ground;
    this.applied = themeHex;
    return t;
  }

  clear() {
    document.body.classList.remove('on-event-theme');
    document.body.style.background = '';
    this.applied = null;
  }

  /** The colour the server wrote into the first document, if it wrote one. */
  preloaded(): { kind?: string; slug?: string; theme_hex?: string; title?: string } | null {
    const el = document.getElementById('preloaded-state');
    if (!el?.textContent) return null;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  }
}

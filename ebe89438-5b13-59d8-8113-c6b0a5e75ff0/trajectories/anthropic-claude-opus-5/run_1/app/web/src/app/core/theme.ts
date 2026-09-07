import { Injectable } from '@angular/core';

export interface EventTheme {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  ok: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rr) h = 60 * (((gg - bb) / d) % 6);
  else if (max === gg) h = 60 * ((bb - rr) / d + 2);
  else h = 60 * ((rr - gg) / d + 4);
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

const toHex = (rgb: [number, number, number]) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The whole palette from one key colour: the ground at 8% saturation and 94%
 * lightness, the sunk ground at 10% and 90%, the ink at full saturation and 11%
 * lightness, and the alpha ramp off that ink. This mirrors the server exactly,
 * so a page painted from the injected block and a page re-derived here agree.
 */
export function deriveTheme(themeHex: string): EventTheme {
  const key = /^#[0-9a-fA-F]{6}$/.test(themeHex || '') ? themeHex.toLowerCase() : '#146aeb';
  const [h] = rgbToHsl(...hexToRgb(key));
  const ground = hslToRgb(h, 0.08, 0.94);
  const sunk = hslToRgb(h, 0.1, 0.9);
  const ink = hslToRgb(h, 1, 0.11);
  const ok = contrast(ground, ink) >= 4.5;
  const g = ok ? ground : ([255, 255, 255] as [number, number, number]);
  const s = ok ? sunk : ([250, 250, 250] as [number, number, number]);
  const i = ok ? ink : ([21, 21, 21] as [number, number, number]);
  return {
    key,
    ground: toHex(g),
    sunk: toHex(s),
    ink: toHex(i),
    inkSecondary: `rgba(${i[0]}, ${i[1]}, ${i[2]}, 0.36)`,
    hairline: `rgba(${i[0]}, ${i[1]}, ${i[2]}, 0.08)`,
    panel: `rgba(${i[0]}, ${i[1]}, ${i[2]}, 0.04)`,
    ok,
  };
}

/**
 * The theming layer computes an event's whole palette once and hands it to the
 * components as tokens. No component decides its own colour.
 */
@Injectable({ providedIn: 'root' })
export class ThemeLayer {
  private applied: string | null = null;

  apply(themeHex: string): EventTheme {
    const theme = deriveTheme(themeHex);
    if (this.applied === theme.key) return theme;
    const root = document.documentElement;
    root.style.setProperty('--event-key', theme.key);
    root.style.setProperty('--event-ground', theme.ground);
    root.style.setProperty('--event-sunk', theme.sunk);
    root.style.setProperty('--event-ink', theme.ink);
    root.style.setProperty('--event-ink-secondary', theme.inkSecondary);
    root.style.setProperty('--event-hairline', theme.hairline);
    root.style.setProperty('--event-panel', theme.panel);
    root.classList.add('event-themed');
    this.applied = theme.key;
    return theme;
  }

  release() {
    document.documentElement.classList.remove('event-themed');
    this.applied = null;
  }
}

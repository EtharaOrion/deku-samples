import type { EventTheme } from './models';

/** The palette the server put into the first document, if this route carries one. */
export function bootTheme(): EventTheme | null {
  const el = document.getElementById('event-theme-data');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as EventTheme;
  } catch {
    return null;
  }
}

const VAR_MAP: Array<[keyof EventTheme, string]> = [
  ['key', '--event-key'],
  ['ground', '--event-ground'],
  ['sunk', '--event-sunk'],
  ['ink', '--event-ink'],
  ['inkRgb', '--event-ink-rgb'],
  ['secondary', '--event-ink-secondary'],
  ['hairline', '--event-hairline'],
  ['panel', '--event-panel'],
];

/**
 * The theming layer hands components tokens; no component picks its own colour.
 * On a route the server already themed this is a no-op repaint of the same values.
 */
export function applyTheme(theme: EventTheme | null) {
  const root = document.documentElement;
  if (!theme) {
    document.body.classList.remove('event-themed');
    return;
  }
  for (const [key, cssVar] of VAR_MAP) root.style.setProperty(cssVar, String(theme[key]));
  root.style.setProperty('--event-hue', String(theme.hue));
  document.body.classList.add('event-themed');
}

export function clearTheme() {
  document.body.classList.remove('event-themed');
}

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#146aeb').replace('#', '');
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
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
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
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

function relLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mirrors the server derivation, for the rare screen that themes from a hex alone. */
export function deriveTheme(themeHex: string): EventTheme {
  const [h] = rgbToHsl(...hexToRgb(themeHex));
  const hue = Math.round(h);
  let ground = hslToHex(hue, 8, 94);
  let sunk = hslToHex(hue, 10, 90);
  let ink = hslToHex(hue, 100, 11);
  let degraded = false;
  if (contrastRatio(ground, ink) < 4.5) {
    ground = '#ffffff';
    sunk = '#fafafa';
    ink = '#151515';
    degraded = true;
  }
  const [ir, ig, ib] = hexToRgb(ink);
  const inkRgb = `${ir}, ${ig}, ${ib}`;
  return {
    key: themeHex,
    hue,
    ground,
    sunk,
    ink,
    inkRgb,
    secondary: `rgba(${inkRgb}, 0.36)`,
    hairline: `rgba(${inkRgb}, 0.08)`,
    panel: `rgba(${inkRgb}, 0.04)`,
    degraded,
  };
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < (seed ?? '').length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

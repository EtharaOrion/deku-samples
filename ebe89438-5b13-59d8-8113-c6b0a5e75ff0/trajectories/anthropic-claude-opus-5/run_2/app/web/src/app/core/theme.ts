import { Injectable } from '@angular/core';
import { EventTheme } from './models';

function hexToHsl(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const int = m ? parseInt(m[1], 16) : 0x146aeb;
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number) {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = L - c / 2;
  const to = (v: number) =>
    Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

function channel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const int = m ? parseInt(m[1], 16) : 0;
  return (
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255)
  );
}

export function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The same derivation the server performs, for themes discovered client-side. */
export function deriveTheme(themeHex: string): EventTheme {
  const { h } = hexToHsl(themeHex);
  const ground = hslToHex(h, 8, 94);
  const sunk = hslToHex(h, 10, 90);
  const ink = hslToHex(h, 100, 11);
  const m = /^#?([0-9a-f]{6})$/i.exec(ink)!;
  const int = parseInt(m[1], 16);
  const rgb = `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
  if (contrast(ground, ink) < 4.5) {
    return {
      key: themeHex,
      ground: '#ffffff',
      sunk: '#fafafa',
      ink: '#151515',
      ink_secondary: 'rgba(21, 21, 21, 0.36)',
      hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)',
      too_pale: true,
    };
  }
  return {
    key: themeHex,
    ground,
    sunk,
    ink,
    ink_secondary: `rgba(${rgb}, 0.36)`,
    hairline: `rgba(${rgb}, 0.08)`,
    panel: `rgba(${rgb}, 0.04)`,
    too_pale: false,
  };
}

/**
 * The theming layer hands components their tokens; no component decides its
 * own colour. The server has already written the palette into the first
 * document, so an event page arrives already wearing it.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** The palette the server injected for this address, if it injected one. */
  readonly preloaded: EventTheme | null = readPreloadedTheme();

  private applied: string | null = null;

  apply(theme: EventTheme) {
    if (this.applied === theme.key) return;
    this.applied = theme.key;
    const root = document.documentElement;
    root.style.setProperty('--event-key', theme.key);
    root.style.setProperty('--event-ground', theme.ground);
    root.style.setProperty('--event-sunk', theme.sunk);
    root.style.setProperty('--event-ink', theme.ink);
    root.style.setProperty('--event-ink-secondary', theme.ink_secondary);
    root.style.setProperty('--event-hairline', theme.hairline);
    root.style.setProperty('--event-panel', theme.panel);
    document.body.style.background = theme.ground;
  }

  applyFromHex(hex: string) {
    if (this.preloaded && this.preloaded.key.toLowerCase() === hex.toLowerCase()) {
      this.apply(this.preloaded);
      return this.preloaded;
    }
    const derived = deriveTheme(hex);
    this.apply(derived);
    return derived;
  }

  clear() {
    this.applied = null;
    const root = document.documentElement;
    for (const name of [
      '--event-key',
      '--event-ground',
      '--event-sunk',
      '--event-ink',
      '--event-ink-secondary',
      '--event-hairline',
      '--event-panel',
    ]) {
      root.style.removeProperty(name);
    }
    document.body.style.background = '';
  }
}

function readPreloadedTheme(): EventTheme | null {
  const el = document.getElementById('event-theme-data');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as EventTheme;
  } catch {
    return null;
  }
}

/**
 * Theme derivation. An event's whole palette is computed once from its
 * `theme_hex` and handed to components as custom properties, so no component
 * decides its own colour.
 */

export type EventTheme = {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  inkSecondary: string;
  hairline: string;
  panel: string;
  button: string;
  buttonActive: string;
  buttonInk: string;
  ok: boolean;
};

function hexToHsl(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h * 100) / 100} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%)`;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((o) => parseInt(c.slice(o, o + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

export function themeFor(themeHex: string): EventTheme {
  const [h, s] = hexToHsl(themeHex);
  const ground = hslToHex(h, 0.08, 0.94);
  const sunk = hslToHex(h, 0.10, 0.90);
  const ink = hslToHex(h, 1, 0.11);
  const button = hslToHex(h, Math.max(0.55, s), 0.45);
  const buttonActive = hslToHex(h, Math.max(0.55, s), 0.38);
  const buttonInk = '#ffffff';
  const ok = contrast(ground, ink) >= 4.5 && contrast(button, buttonInk) >= 3.5;
  return {
    key: themeHex,
    ground: ok ? ground : '#ffffff',
    sunk: ok ? sunk : '#fafafa',
    ink: ok ? ink : '#151515',
    inkSecondary: ok ? `rgba(0, 15, 58, 0.36)` : 'rgba(21, 21, 21, 0.36)',
    hairline: `rgba(0, 15, 58, 0.08)`,
    panel: `rgba(0, 15, 58, 0.04)`,
    button: ok ? button : '#151515',
    buttonActive: ok ? buttonActive : '#000000',
    buttonInk,
    ok,
  };
}

/** Write a theme onto an element as custom properties. */
export function applyTheme(el: HTMLElement, theme: EventTheme): void {
  const st = el.style;
  st.setProperty('--event-ground', theme.ground);
  st.setProperty('--event-sunk', theme.sunk);
  st.setProperty('--event-ink', theme.ink);
  st.setProperty('--event-ink-secondary', theme.inkSecondary);
  st.setProperty('--event-hairline', theme.hairline);
  st.setProperty('--event-panel', theme.panel);
  st.setProperty('--event-button', theme.button);
  st.setProperty('--event-button-active', theme.buttonActive);
  st.setProperty('--event-button-ink', theme.buttonInk);
  st.setProperty('--event-key', theme.key);
}

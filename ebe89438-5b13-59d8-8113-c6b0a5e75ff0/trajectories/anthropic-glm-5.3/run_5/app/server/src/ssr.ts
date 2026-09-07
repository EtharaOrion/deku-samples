/** Derived event palette, computed once on the server and handed to the page as tokens. */
export function deriveTheme(keyHex: string): {
  ground: string;
  sunk: string;
  ink: string;
  inkAlpha: string;
  secondaryInk: string;
  hairline: string;
  panelFill: string;
  buttonInk: string;
  buttonHover: string;
} {
  const { h, s, l } = hexToHsl(keyHex);
  const ground = hslToHex(h, Math.min(0.08, s), 0.94);
  const sunk = hslToHex(h, Math.min(0.10, s), 0.90);
  const ink = hslToHex(h, 1, 0.11);
  return {
    ground,
    sunk,
    ink,
    inkAlpha: hexWithAlpha(ink, 0.64),
    secondaryInk: hexWithAlpha(ink, 0.36),
    hairline: hexWithAlpha(ink, 0.08),
    panelFill: hexWithAlpha(ink, 0.04),
    buttonInk: hexWithAlpha(ink, 0.04),
    buttonHover: hexWithAlpha(ink, 0.64),
  };
}

export function buildThemeVars(keyHex: string): string {
  const t = deriveTheme(keyHex);
  return `:root{--event-key:${keyHex};--event-ground:${t.ground};--event-sunk:${t.sunk};--event-ink:${t.ink};--event-ink-2:${t.secondaryInk};--event-hairline:${t.hairline};--event-panel:${t.panelFill};--event-btn:${t.buttonInk};--event-btn-hover:${t.buttonHover};--event-scrim:${hexWithAlpha(t.ink, 0.8)}}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hexToHsl(hex: string) {
  return rgbToHsl(...Object.values(hexToRgb(hex)) as [number, number, number]);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** White-on-ink style alpha for text over a themed ground. */
function hexWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

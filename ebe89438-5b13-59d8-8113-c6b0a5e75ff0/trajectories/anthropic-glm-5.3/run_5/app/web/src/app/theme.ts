/** Derived event theme, matching the server derivation token for token. */
export type DerivedTheme = {
  key: string;
  ground: string;
  sunk: string;
  ink: string;
  secondaryInk: string;
  hairline: string;
  panelFill: string;
  buttonFill: string;
  buttonHoverFill: string;
  contrastOk: boolean;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
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

function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function deriveTheme(keyHex: string): DerivedTheme {
  const [h, s] = rgbToHsl(...hexToRgb(keyHex));
  const ground = hslToHex(h, Math.min(0.08, s), 0.94);
  const sunk = hslToHex(h, Math.min(0.10, s), 0.90);
  const ink = hslToHex(h, 1, 0.11);
  const ratio = contrastRatio(ink, ground);
  return {
    key: keyHex,
    ground,
    sunk,
    ink,
    secondaryInk: withAlpha(ink, 0.36),
    hairline: withAlpha(ink, 0.08),
    panelFill: withAlpha(ink, 0.04),
    buttonFill: withAlpha(ink, 0.04),
    buttonHoverFill: withAlpha(ink, 0.64),
    contrastOk: ratio >= 4.5,
  };
}

/** Paints the page-level custom properties for one event theme. */
export function applyThemeVars(el: HTMLElement | null, theme: DerivedTheme): void {
  const target = el ?? document.documentElement;
  target.style.setProperty('--event-key', theme.key);
  target.style.setProperty('--event-ground', theme.ground);
  target.style.setProperty('--event-sunk', theme.sunk);
  target.style.setProperty('--event-ink', theme.ink);
  target.style.setProperty('--event-ink-2', theme.secondaryInk);
  target.style.setProperty('--event-hairline', theme.hairline);
  target.style.setProperty('--event-panel', theme.panelFill);
  target.style.setProperty('--event-btn', theme.buttonFill);
  target.style.setProperty('--event-btn-hover', theme.buttonHoverFill);
}

export function clearThemeVars(el: HTMLElement | null = null): void {
  const target = el ?? document.documentElement;
  for (const p of ['--event-key', '--event-ground', '--event-sunk', '--event-ink', '--event-ink-2', '--event-hairline', '--event-panel', '--event-btn', '--event-btn-hover']) {
    target.style.removeProperty(p);
  }
}

const GRADIENT_STEPS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

export function rampStep(hex: string): number {
  // nearest step of the ten-step ramp by luminance distance
  const l = luminance(hex);
  const steps = GRADIENT_STEPS.map((step) => ({ step, l: step / 100 }));
  return steps.reduce((best, cur) => (Math.abs(cur.l - l) < Math.abs(best.l - l) ? cur : best), steps[0]).step;
}

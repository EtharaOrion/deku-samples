/**
 * The theming layer: an event's whole palette is computed once, on the server,
 * and handed to the page as tokens, so the first document the browser paints is
 * already wearing the event's colours.
 */

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const int = m ? parseInt(m[1], 16) : 0x146aeb;
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function hsl(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(aHex: string, bHex: string): number {
  const toRgb = (h: string): [number, number, number] => {
    const int = parseInt(h.replace('#', ''), 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  };
  const la = relativeLuminance(toRgb(aHex));
  const lb = relativeLuminance(toRgb(bHex));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ThemeTokens = {
  theme_hex: string;
  ground: string;
  sunk: string;
  ink: string;
  ink_secondary: string;
  hairline: string;
  panel: string;
  accent: string;
  too_pale: boolean;
};

/**
 * Ground at 8% saturation and 94% lightness, sunk at 10%/90%, ink at full
 * saturation and 11% lightness, secondary ink at 0.36 alpha, hairlines at 0.08
 * and the panel fill at 0.04.
 */
export function deriveTheme(themeHex: string): ThemeTokens {
  const { h, s } = hexToHsl(themeHex);
  const ground = hsl(h, 8, 94);
  const sunk = hsl(h, 10, 90);
  const ink = hsl(h, Math.max(s, 100), 11);
  const [ir, ig, ib] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16)) as [number, number, number];
  const inkRgb = `${ir}, ${ig}, ${ib}`;
  const tooPale = contrastRatio(ground, ink) < 4.5;
  if (tooPale) {
    return {
      theme_hex: themeHex, ground: '#ffffff', sunk: '#fafafa', ink: '#151515',
      ink_secondary: 'rgba(21, 21, 21, 0.36)', hairline: 'rgba(21, 21, 21, 0.08)',
      panel: 'rgba(21, 21, 21, 0.04)', accent: themeHex, too_pale: true,
    };
  }
  return {
    theme_hex: themeHex,
    ground,
    sunk,
    ink,
    ink_secondary: `rgba(${inkRgb}, 0.36)`,
    hairline: `rgba(${inkRgb}, 0.08)`,
    panel: `rgba(${inkRgb}, 0.04)`,
    accent: themeHex,
    too_pale: false,
  };
}

export function themeCssVars(t: ThemeTokens): string {
  return [
    `--event-theme:${t.theme_hex}`,
    `--event-ground:${t.ground}`,
    `--event-sunk:${t.sunk}`,
    `--event-ink:${t.ink}`,
    `--event-ink-secondary:${t.ink_secondary}`,
    `--event-hairline:${t.hairline}`,
    `--event-panel:${t.panel}`,
    `--event-accent:${t.accent}`,
  ].join(';');
}

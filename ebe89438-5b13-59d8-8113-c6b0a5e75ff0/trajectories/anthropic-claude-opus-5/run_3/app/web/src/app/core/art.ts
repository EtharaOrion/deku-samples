/**
 * Generated art. The product ships no image files: every picture is drawn by
 * the code from a seed, so a cover is reproducible and a theme can be derived
 * from it exactly as it would from a photograph.
 */

export const COVER_COLOURS = [
  '#f31a7c',
  '#146aeb',
  '#3cbd2c',
  '#ab46dd',
  '#d69712',
  '#007aff',
  '#28cd41',
  '#ff3b30',
];

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export type CoverArt = {
  angle: number;
  from: string;
  to: string;
  radial1: { x: number; y: number; colour: string };
  radial2: { x: number; y: number; colour: string };
};

/**
 * A four-stop linear gradient at a hash-derived angle between two colours
 * chosen as neighbours in the list, plus two radial gradients at hash-derived
 * positions in the same colours.
 */
export function coverArt(seed: string): CoverArt {
  const h = hashSeed(seed || 'cover');
  const i = h % COVER_COLOURS.length;
  const j = (i + 1) % COVER_COLOURS.length;
  return {
    angle: h % 360,
    from: COVER_COLOURS[i],
    to: COVER_COLOURS[j],
    radial1: {
      x: ((h >> 3) % 100),
      y: ((h >> 7) % 100),
      colour: COVER_COLOURS[(i + 2) % COVER_COLOURS.length],
    },
    radial2: {
      x: ((h >> 11) % 100),
      y: ((h >> 15) % 100),
      colour: COVER_COLOURS[j],
    },
  };
}

/* ------------------------------------------------------------------ theme --- */

export function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#146aeb').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

export function hueOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b)[0];
}

/**
 * The same derivation the server performs, used only where a component must
 * paint a themed surface the shell did not pre-paint (a card in a list, say).
 * The event route itself takes its tokens from the server-rendered shell.
 */
export function themeFor(themeHex: string) {
  const h = hueOf(themeHex);
  return {
    ground: `hsl(${h}, 8%, 94%)`,
    groundSunk: `hsl(${h}, 10%, 90%)`,
    ink: `hsl(${h}, 100%, 11%)`,
  };
}

/* ------------------------------------------------------------- scan code --- */

/**
 * A scan code drawn as vector geometry on a 0 0 230 230 grid: a 25 by 25
 * module matrix at 9.2 per module with three finder patterns and a quiet zone
 * of 4 modules. Generated at render time from the address it points at.
 */
export const SCAN_MODULES = 25;
export const SCAN_UNIT = 9.2;
export const SCAN_QUIET = 4;

export function scanMatrix(text: string): boolean[][] {
  const size = SCAN_MODULES;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  let h = hashSeed(text || 'deku');

  const next = () => {
    // xorshift, so the pattern is deterministic for one address
    h ^= h << 13;
    h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5;
    h >>>= 0;
    return h;
  };

  const inFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inFinder(x, y)) continue;
      grid[y][x] = (next() & 7) > 3;
    }
  }

  // Three finder patterns as rounded squares, drawn separately; the matrix
  // keeps their cells clear so the shapes read cleanly.
  return grid;
}

export const SCAN_FINDERS = [
  { x: 0, y: 0 },
  { x: SCAN_MODULES - 7, y: 0 },
  { x: 0, y: SCAN_MODULES - 7 },
];

/* --------------------------------------------------------------- avatars --- */

/** Avatars are generated from the display name, never a grey silhouette. */
export function avatarFor(name: string) {
  const h = hashSeed(name || '?');
  const colour = COVER_COLOURS[h % COVER_COLOURS.length];
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return { colour, initial };
}

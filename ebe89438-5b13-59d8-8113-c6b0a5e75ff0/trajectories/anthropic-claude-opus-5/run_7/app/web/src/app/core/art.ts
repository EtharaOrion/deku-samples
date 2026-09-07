/**
 * The zero-asset art layer. The product ships no image files: every cover,
 * avatar and scan code here is drawn from geometry derived from a seed, so it
 * stays sharp at any size and can be recoloured on the fly.
 */

export const COVER_COLOURS = [
  '#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd',
  '#d69712', '#007aff', '#28cd41', '#ff3b30',
];

/** The same 32-bit hash the server uses, so art matches its theme. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface CoverArt {
  angle: number;
  from: string;
  to: string;
  radial1: { x: number; y: number; colour: string };
  radial2: { x: number; y: number; colour: string };
}

/**
 * A cover is a four-stop linear gradient at a hash-derived angle between two
 * neighbouring colours of the palette, with two radial gradients over it.
 */
export function coverArt(seed: string): CoverArt {
  const h = hashString(seed || 'seed');
  const i = h % COVER_COLOURS.length;
  const j = (i + 1) % COVER_COLOURS.length; // neighbours in that list
  return {
    angle: h % 360,
    from: COVER_COLOURS[i],
    to: COVER_COLOURS[j],
    radial1: {
      x: 10 + ((h >> 3) % 80),
      y: 10 + ((h >> 7) % 80),
      colour: COVER_COLOURS[(i + 3) % COVER_COLOURS.length],
    },
    radial2: {
      x: 10 + ((h >> 11) % 80),
      y: 10 + ((h >> 15) % 80),
      colour: COVER_COLOURS[(i + 5) % COVER_COLOURS.length],
    },
  };
}

/** The CSS background stack for a cover tile, radials blended plus-lighter. */
export function coverBackground(seed: string): string {
  const a = coverArt(seed);
  return [
    `radial-gradient(circle at ${a.radial1.x}% ${a.radial1.y}%, ${hexA(a.radial1.colour, 0.4)}, transparent 60%)`,
    `radial-gradient(circle at ${a.radial2.x}% ${a.radial2.y}%, ${hexA(a.radial2.colour, 0.4)}, transparent 60%)`,
    `linear-gradient(${a.angle}deg, ${a.from} 0%, ${mix(a.from, a.to, 0.35)} 35%, ${mix(a.from, a.to, 0.7)} 70%, ${a.to} 100%)`,
  ].join(', ');
}

export function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** A stable hue for an avatar, derived from the display name. */
export function avatarColour(name: string): string {
  return COVER_COLOURS[hashString(name || '?') % COVER_COLOURS.length];
}

export function initialOf(name: string): string {
  const t = (name ?? '').trim();
  return t ? t[0].toUpperCase() : '?';
}

/**
 * A scan code drawn as vector geometry: a 25x25 module matrix on a 0 0 230 230
 * grid at 9.2 per module, with three finder patterns and a 4-module quiet
 * zone. It encodes the address deterministically for the eye, not for a
 * scanner spec, and needs no third-party library.
 */
export interface ScanCode {
  modules: boolean[][];
  size: number;
  moduleSize: number;
  finderRadius: number;
}

export function scanCode(text: string): ScanCode {
  const SIZE = 25;
  const grid: boolean[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));

  // Fill from a seeded stream so the same address always draws the same code.
  let state = hashString(text || 'deku');
  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      grid[y][x] = (next() & 7) > 3;
    }
  }

  // Clear the three finder zones plus their separators; they are drawn as
  // rounded squares rather than as modules.
  const clear = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const gx = ox + x;
        const gy = oy + y;
        if (gx >= 0 && gx < SIZE && gy >= 0 && gy < SIZE) grid[gy][gx] = false;
      }
    }
  };
  clear(0, 0);
  clear(SIZE - 7, 0);
  clear(0, SIZE - 7);

  return { modules: grid, size: SIZE, moduleSize: 9.2, finderRadius: 15.456 };
}

/**
 * The zero-asset guide. The product ships no image files: every picture here is
 * drawn by the code from a seed, so a generated cover feeds the theme derivation
 * exactly as a photograph would.
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
] as const;

/** The same 32-bit hash the server uses, so a cover matches on both sides. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface CoverRecipe {
  angle: number;
  from: string;
  to: string;
  radials: Array<{ x: number; y: number; colour: string }>;
}

/** Two of the eight colours, chosen as neighbours in that list. */
export function coverRecipe(seed: string): CoverRecipe {
  const h = hashSeed(seed);
  const first = h % COVER_COLOURS.length;
  const second = (first + 1) % COVER_COLOURS.length;
  const angle = ((h >>> 8) % 360);
  return {
    angle,
    from: COVER_COLOURS[first],
    to: COVER_COLOURS[second],
    radials: [
      {
        x: 10 + ((h >>> 3) % 80),
        y: 10 + ((h >>> 11) % 80),
        colour: COVER_COLOURS[(first + 2) % COVER_COLOURS.length],
      },
      {
        x: 10 + ((h >>> 17) % 80),
        y: 10 + ((h >>> 23) % 80),
        colour: COVER_COLOURS[(second + 3) % COVER_COLOURS.length],
      },
    ],
  };
}

export function coverBackground(seed: string): string {
  const r = coverRecipe(seed);
  return `linear-gradient(${r.angle}deg, ${r.from} 0%, ${mix(r.from, r.to, 0.35)} 34%, ${mix(
    r.from,
    r.to,
    0.7,
  )} 68%, ${r.to} 100%)`;
}

export function coverRadials(seed: string): string {
  const r = coverRecipe(seed);
  return r.radials
    .map((rad) => `radial-gradient(60% 60% at ${rad.x}% ${rad.y}%, ${withAlpha(rad.colour, 0.4)} 0%, ${withAlpha(rad.colour, 0)} 100%)`)
    .join(', ');
}

export function coverKey(seed: string): string {
  return coverRecipe(seed).from;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function toRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  const to = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

/** Avatars are generated from the display name, never a grey silhouette. */
export function avatarColour(name: string): string {
  const h = hashSeed(name || 'guest');
  return COVER_COLOURS[h % COVER_COLOURS.length];
}

export function initial(name: string): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

/**
 * A scan code drawn as vector geometry from the address it points at: a 25 by 25
 * module matrix on a 0 0 230 230 grid at 9.2 per module, with three finder
 * patterns and a quiet zone of 4 modules.
 */
export interface ScanCode {
  modules: boolean[][];
  size: number;
  moduleSize: number;
  quietZone: number;
  finderRadius: number;
}

export function scanCode(payload: string): ScanCode {
  const size = 25;
  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  // A deterministic fill derived from the payload, so the same address always
  // draws the same code.
  let state = hashSeed(payload) || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };

  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (inFinder(r, c)) continue;
      modules[r][c] = (next() & 7) > 3;
    }
  }

  // Three finder patterns, drawn as rounded squares by the component.
  const drawFinder = (top: number, left: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        modules[top + r][left + c] = edge || core;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // A timing line, so it reads as a scan code rather than as noise.
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
  }

  return { modules, size, moduleSize: 9.2, quietZone: 4, finderRadius: 15.456 };
}

/** Landing shows 22 poster tiles at desktop, 12 at tablet and 8 on a phone. */
export function posterCount(width: number): number {
  if (width < 650) return 8;
  if (width < 1000) return 12;
  return 22;
}

export interface PosterPlacement {
  left: number;
  top: number;
  size: number;
  rotate: number;
  delay: number;
  duration: number;
}

/** Positions the poster wall on a clock, never on scroll position. */
export function posterPlacements(count: number, seed = 'poster-wall'): PosterPlacement[] {
  let state = hashSeed(seed) || 7;
  const rnd = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state % 10000) / 10000;
  };
  const out: PosterPlacement[] = [];
  const columns = Math.ceil(Math.sqrt(count * 1.6));
  const rows = Math.ceil(count / columns);
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    out.push({
      left: (col / columns) * 100 + (rnd() * 8 - 4),
      top: (row / rows) * 100 + (rnd() * 10 - 5),
      size: 86 + rnd() * 74,
      rotate: rnd() * 16 - 8,
      delay: rnd() * 1000,
      duration: 900 + rnd() * 600,
    });
  }
  return out;
}

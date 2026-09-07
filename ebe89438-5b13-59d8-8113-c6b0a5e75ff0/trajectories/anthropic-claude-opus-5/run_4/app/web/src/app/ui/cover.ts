/**
 * The zero-asset cover. Every picture in this product is drawn by the code from
 * an event's cover_seed: a four-stop linear gradient at a hash-derived angle
 * between two neighbouring colours, two radial gradients in the same colours at
 * 0.4 alpha blended plus-lighter, a fractal-noise grain at 0.06 alpha, and the
 * title in white. A generated cover feeds the theme derivation exactly as a
 * photograph would.
 */

export const COVER_COLORS = [
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
  return h >>> 0;
}

export interface CoverArt {
  angle: number;
  from: string;
  to: string;
  radials: Array<{ x: number; y: number; color: string; r: number }>;
  key: string;
}

export function coverArt(seed: string): CoverArt {
  const h = hashSeed(seed);
  const i = h % COVER_COLORS.length;
  const j = (i + 1) % COVER_COLORS.length;
  return {
    angle: (h >>> 8) % 360,
    from: COVER_COLORS[i]!,
    to: COVER_COLORS[j]!,
    radials: [
      { x: 12 + ((h >>> 3) % 70), y: 8 + ((h >>> 5) % 60), color: COVER_COLORS[j]!, r: 55 },
      { x: 20 + ((h >>> 11) % 70), y: 30 + ((h >>> 13) % 60), color: COVER_COLORS[i]!, r: 45 },
    ],
    key: COVER_COLORS[i]!,
  };
}

/** The CSS background stack for one cover tile. */
export function coverBackground(seed: string): string {
  const a = coverArt(seed);
  const radials = a.radials
    .map((r) => `radial-gradient(circle at ${r.x}% ${r.y}%, ${r.color}66, transparent ${r.r}%)`)
    .join(', ');
  return `${radials}, linear-gradient(${a.angle}deg, ${a.from}, ${a.to} 38%, ${a.from} 72%, ${a.to})`;
}

export function coverKeyColor(seed: string): string {
  return coverArt(seed).key;
}

import { Injectable } from '@angular/core';

/**
 * Generated art. The product ships no image files: every cover, avatar hue and
 * scan code is drawn from a seed by code.
 */

const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function hash32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface CoverArt {
  angle: number;
  neighbours: [string, string];
  radialA: { x: number; y: number; colour: string };
  radialB: { x: number; y: number; colour: string };
  noiseSeed: number;
}

export function coverArt(seed: string): CoverArt {
  const a = hash32(seed);
  const b = hash32(`${seed}-b`);
  const c = hash32(`${seed}-c`);
  const first = a % PALETTE.length;
  // neighbours in the pinned list
  const second = (first + 1 + (b % 2)) % PALETTE.length;
  return {
    angle: (a % 360) + (b % 90) / 2,
    neighbours: [PALETTE[first], PALETTE[second]],
    radialA: { x: 18 + (a % 60), y: 14 + (b % 50), colour: PALETTE[(first + 2) % PALETTE.length] },
    radialB: { x: 25 + (c % 55), y: 40 + (a % 45), colour: PALETTE[(second + 3) % PALETTE.length] },
    noiseSeed: c % 1000,
  };
}

export function linearGradient(art: CoverArt): string {
  return `linear-gradient(${art.angle}deg, ${art.neighbours[0]} 0%, ${art.neighbours[1]} 55%, ${art.neighbours[0]} 100%)`;
}

export function radialGradients(art: CoverArt): string {
  return [
    `radial-gradient(circle at ${art.radialA.x}% ${art.radialA.y}%, ${art.radialA.colour} 0%, transparent 55%)`,
    `radial-gradient(circle at ${art.radialB.x}% ${art.radialB.y}%, ${art.radialB.colour} 0%, transparent 50%)`,
  ].join(', ');
}

/** Grain: an SVG data URI of fractal noise, desaturated, tiled at 300px. */
export function grainUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
  <filter id="n" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="300" height="300" filter="url(#n)" opacity="0.55"/>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const GRAIN_URL = grainUrl();

/** Avatar colour from a display name: a coloured circle carrying the initial. */
const AVATAR_HUES = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41'];
export function avatarHue(name: string): string {
  return AVATAR_HUES[hash32(name) % AVATAR_HUES.length];
}
export function initial(name: string): string {
  const trimmed = (name || '?').trim();
  return trimmed ? trimmed[0]!.toUpperCase() : '?';
}

/** The brand mark: a four-pointed star with concave sides on the box 0 0 133 134. */
export const STAR_PATH =
  'M66.5 0 L82 42 L133 67 L82 92 L66.5 134 L51 92 L0 67 L51 42 Z';

/**
 * Scan code drawn as vector geometry: a 25 x 25 module matrix at 9.2 per module
 * on a 0 0 230 230 grid, three finder patterns as rounded squares, a quiet zone
 * of 4 modules. The matrix is derived deterministically from the address.
 */
export interface ScanCode {
  size: number;
  modules: boolean[][];
  quiet: number;
}

export function scanCodeFor(text: string): ScanCode {
  const size = 25;
  const modules: boolean[][] = [];
  let state = hash32(text) || 1;
  const rnd = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0xffffffff;
  };
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      row.push(rnd() > 0.5);
    }
    modules.push(row);
  }
  // finder patterns
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        modules[oy + y][ox + x] = edge || core;
      }
    }
    // keep a quiet ring around each finder
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const iy = oy + y, ix = ox + x;
        if (iy < 0 || iy >= size || ix < 0 || ix >= size) continue;
        if (y === -1 || y === 7 || x === -1 || x === 7) modules[iy][ix] = false;
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  return { size, modules, quiet: 4 };
}

/** Calendar file for "Add to Calendar". */
export function icsFor(title: string, slug: string, startsAt: string, endsAt: string, city: string): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gather//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${slug}@gather`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt)}`,
    `SUMMARY:${title.replace(/[,;]/g, ' ')}`,
    `LOCATION:${city.replace(/[,;]/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

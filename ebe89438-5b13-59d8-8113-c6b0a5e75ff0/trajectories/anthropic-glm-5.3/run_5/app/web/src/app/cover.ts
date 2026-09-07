import { Injectable } from '@angular/core';

const COVER_COLORS = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function hash32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashDjb2(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** The generated cover: a four-stop gradient, two radial glows, grain and the title. */
export function coverLayers(seed: string): { angle: number; a: string; b: string; glow1: { x: number; y: number }; glow2: { x: number; y: number }; grainId: string } {
  const h1 = hash32(seed);
  const h2 = hashDjb2(seed);
  const idx = h1 % COVER_COLORS.length;
  const a = COVER_COLORS[idx];
  const b = COVER_COLORS[(idx + 1 + (Math.floor(h2 / 13) % 2)) % COVER_COLORS.length];
  const angle = h2 % 360;
  const glow1 = { x: (h1 % 100) / 100, y: ((h1 >> 7) % 100) / 100 };
  const glow2 = { x: ((h1 >> 3) % 100) / 100, y: ((h1 >> 11) % 100) / 100 };
  return { angle, a, b, glow1, glow2, grainId: `g${h1 % 9973}` };
}

export function coverBackground(seed: string): string {
  const { angle, a, b, glow1, glow2 } = coverLayers(seed);
  return [
    `linear-gradient(${angle}deg, ${a} 0%, ${a} 26%, ${b} 68%, ${b} 100%)`,
    `radial-gradient(circle at ${glow1.x * 100}% ${glow1.y * 100}%, ${a}66 0%, transparent 55%)`,
    `radial-gradient(circle at ${glow2.x * 100}% ${glow2.y * 100}%, ${b}66 0%, transparent 55%)`,
  ].join(', ');
}

export function avatarColor(name: string): string {
  const h = hash32(name);
  return `hsl(${h % 360} 62% 42%)`;
}

export function avatarInitial(name: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

@Injectable({ providedIn: 'root' })
export class CoverService {
  background(seed: string): string {
    return coverBackground(seed);
  }
  color(name: string): string {
    return avatarColor(name);
  }
  initial(name: string): string {
    return avatarInitial(name);
  }
}

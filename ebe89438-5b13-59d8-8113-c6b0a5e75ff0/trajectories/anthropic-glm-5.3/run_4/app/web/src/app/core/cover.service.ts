import { Injectable } from '@angular/core';

/**
 * Generated covers: every picture is drawn by the code from a cover seed.
 * A square filled with a four-stop linear gradient at a hash-derived angle
 * between neighbouring palette hues, two radial gradients blended
 * plus-lighter, a fractal-noise grain, and the title set in white.
 */

const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export type CoverSpec = {
  from: string;
  to: string;
  angle: number;
  radialA: { x: number; y: number; color: string };
  radialB: { x: number; y: number; color: string };
  uid: string;
};

export function coverFor(seed: string): CoverSpec {
  const rnd = xmur3(seed);
  const h1 = rnd(), h2 = rnd(), h3 = rnd(), h4 = rnd(), h5 = rnd();
  const i = h1 % PALETTE.length;
  const j = (i + 1 + (h2 % (PALETTE.length - 1))) % PALETTE.length;
  const k = (i + 3) % PALETTE.length;
  return {
    from: PALETTE[i],
    to: PALETTE[j],
    angle: h3 % 360,
    radialA: { x: 12 + (h4 % 70), y: 10 + (h5 % 60), color: PALETTE[k] },
    radialB: { x: 15 + (h1 % 65), y: 30 + (h3 % 60), color: PALETTE[j] },
    uid: seed.replace(/[^a-z0-9-]/gi, '') + (h2 % 9999),
  };
}

/** A cross-browser feTurbulence grain id, stable per seed. */
export function grainId(seed: string): string {
  return `grain-${coverFor(seed).uid}`;
}

@Injectable({ providedIn: 'root' })
export class CoverService {
  /** SVG markup for one cover tile, drawn to size by CSS. */
  svg(seed: string, title: string): string {
    const c = coverFor(seed);
    const gid = grainId(seed);
    return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="lin-${c.uid}" gradientTransform="rotate(${c.angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${c.from}"/>
      <stop offset="34%" stop-color="${mix(c.from, c.to, 0.34)}"/>
      <stop offset="67%" stop-color="${mix(c.from, c.to, 0.67)}"/>
      <stop offset="100%" stop-color="${c.to}"/>
    </linearGradient>
    <radialGradient id="rad-${c.uid}">
      <stop offset="0%" stop-color="${c.radialA.color}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${c.radialA.color}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rad2-${c.uid}">
      <stop offset="0%" stop-color="${c.radialB.color}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${c.radialB.color}" stop-opacity="0"/>
    </radialGradient>
    <filter id="${gid}" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" result="n"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="300" height="300" fill="url(#lin-${c.uid})"/>
  <rect width="300" height="300" fill="url(#rad-${c.uid})" style="mix-blend-mode:plus-lighter"/>
  <rect width="300" height="300" fill="url(#rad2-${c.uid})" style="mix-blend-mode:plus-lighter"/>
  <rect width="300" height="300" filter="url(#${gid})" opacity="0.06"/>
  <text x="24" y="252" fill="#ffffff" font-family="Inter, -apple-system, sans-serif" font-size="36" font-weight="700" style="filter: drop-shadow(0 0 5px rgba(0,0,0,0.2))">${escapeXml(shorten(title))}</text>
</svg>`;
  }

  dataUri(seed: string, title: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(this.svg(seed, title))}`;
  }
}

function shorten(t: string): string {
  const words = t.split(/\s+/);
  if (words.length <= 3) return t;
  return words.slice(0, 3).join(' ');
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]!));
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const f = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

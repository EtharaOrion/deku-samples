import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';

const PALETTE = [
  '#f31a7c',
  '#146aeb',
  '#3cbd2c',
  '#ab46dd',
  '#d69712',
  '#007aff',
  '#28cd41',
  '#ff3b30',
];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface CoverArt {
  angle: number;
  a: string;
  b: string;
  r1: { x: number; y: number; c: string };
  r2: { x: number; y: number; c: string };
}

/** Each cover is generated from the event's cover_seed; the product ships no images. */
export function coverArt(seed: string): CoverArt {
  const h = hash(seed || 'seed');
  const idx = h % PALETTE.length;
  // two colours chosen as neighbours in that list
  const a = PALETTE[idx];
  const b = PALETTE[(idx + 1) % PALETTE.length];
  return {
    angle: h % 360,
    a,
    b,
    r1: {
      x: 12 + ((h >> 3) % 76),
      y: 10 + ((h >> 7) % 60),
      c: PALETTE[(idx + 2) % PALETTE.length],
    },
    r2: {
      x: 15 + ((h >> 11) % 70),
      y: 30 + ((h >> 15) % 65),
      c: PALETTE[(idx + 5) % PALETTE.length],
    },
  };
}

/**
 * A square filled with a four-stop linear gradient at a hash-derived angle,
 * two radial gradients blended plus-lighter, a fractal-noise grain overlay and
 * the title in white. A generated cover feeds the theme derivation exactly as
 * a photograph would.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="cover" [class.tile]="tile()" [innerHTML]="svg()"></div>`,
  styles: [
    `
      .cover {
        width: 100%;
        aspect-ratio: 1;
        overflow: hidden;
        border-radius: inherit;
        position: relative;
      }
      .cover ::ng-deep svg {
        width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
})
export class CoverComponent {
  private sanitizer = inject(DomSanitizer);

  readonly seed = input.required<string>();
  readonly title = input<string>('');
  readonly tile = input<boolean>(false);
  /** Drawn once and left alone; nothing here animates. */
  readonly showTitle = input<boolean>(true);

  readonly svg = computed<SafeHtml>(() => {
    const art = coverArt(this.seed());
    const id = `c${hash(this.seed()).toString(36)}`;
    const words = this.showTitle() ? escapeXml(this.title()) : '';
    const lines = wrap(words, 18).slice(0, 3);
    const fontSize = 12; // 12% of the square's height
    const startY = 50 - (lines.length - 1) * (fontSize * 0.6);

    const markup = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="${id}g" gradientTransform="rotate(${art.angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${art.a}"/>
      <stop offset="38%" stop-color="${mix(art.a, art.b, 0.4)}"/>
      <stop offset="72%" stop-color="${mix(art.a, art.b, 0.75)}"/>
      <stop offset="100%" stop-color="${art.b}"/>
    </linearGradient>
    <radialGradient id="${id}r1" cx="${art.r1.x}%" cy="${art.r1.y}%" r="58%">
      <stop offset="0%" stop-color="${art.r1.c}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${art.r1.c}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}r2" cx="${art.r2.x}%" cy="${art.r2.y}%" r="52%">
      <stop offset="0%" stop-color="${art.r2.c}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${art.r2.c}" stop-opacity="0"/>
    </radialGradient>
    <filter id="${id}n" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="100" height="100" fill="url(#${id}g)"/>
  <g style="mix-blend-mode:plus-lighter">
    <rect width="100" height="100" fill="url(#${id}r1)"/>
    <rect width="100" height="100" fill="url(#${id}r2)"/>
  </g>
  <rect width="100" height="100" filter="url(#${id}n)" opacity="0.06"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="50" y="${startY + i * fontSize * 1.05}" text-anchor="middle" dominant-baseline="middle"
           font-family="Inter, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff"
           style="filter: drop-shadow(rgba(0, 0, 0, 0.2) 0px 0px 5px)">${line}</text>`,
    )
    .join('')}
</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(markup);
  });
}

function escapeXml(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(text: string, per: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= per) line += ' ' + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

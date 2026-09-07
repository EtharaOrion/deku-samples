import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { hashSeed } from '../core/theme';

const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

/**
 * Every picture in this product is drawn by the code. A cover is a gradient
 * square derived from the event's cover_seed, with two radial washes, a grain
 * overlay and the title set into it.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cover-wrap" [class.nudging]="nudge()" [style.border-radius]="radius()">
      <div class="cover-under" [innerHTML]="svg()" aria-hidden="true"></div>
      <div class="cover-art" [innerHTML]="svg()" role="img" [attr.aria-label]="'Cover art for ' + title()"></div>
      <div class="cover-glow" aria-hidden="true" [style.background]="glowFill()"></div>
      <div class="cover-sheen" aria-hidden="true" [style.background]="glowFill()"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .cover-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        filter: saturate(2);
        isolation: isolate;
      }
      .cover-art,
      .cover-under {
        position: absolute;
        inset: 0;
      }
      .cover-art {
        transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      }
      .cover-under {
        filter: brightness(0.8) blur(24px) saturate(1.2);
        mix-blend-mode: multiply;
        opacity: 0.2;
      }
      .nudging .cover-art {
        animation: nudge 1000ms linear infinite;
      }
      .cover-glow,
      .cover-sheen {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .cover-glow {
        -webkit-mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.5;
      }
      .cover-sheen {
        -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.3;
      }
      :host ::ng-deep svg {
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
  readonly radius = input<string>('12px');
  readonly nudge = input<boolean>(false);
  readonly showTitle = input<boolean>(true);

  private hash = computed(() => hashSeed(this.seed() || 'seed'));

  readonly colors = computed<[string, string]>(() => {
    const i = this.hash() % PALETTE.length;
    return [PALETTE[i], PALETTE[(i + 1) % PALETTE.length]];
  });

  readonly glowFill = computed(() => {
    const [a, b] = this.colors();
    return `linear-gradient(135deg, ${a}, ${b})`;
  });

  readonly svg = computed<SafeHtml>(() => {
    const h = this.hash();
    const [a, b] = this.colors();
    const angle = (h % 360) + 0;
    const cx1 = 15 + (h % 60);
    const cy1 = 10 + ((h >> 3) % 60);
    const cx2 = 30 + ((h >> 6) % 60);
    const cy2 = 40 + ((h >> 9) % 55);
    const id = `c${h.toString(36)}`;
    const words = (this.title() || '').trim();
    const lines = wrap(words, 16).slice(0, 3);
    const fontSize = 12; // 12% of the square's height
    const startY = 88 - (lines.length - 1) * (fontSize * 1.05);
    const titleMarkup = this.showTitle() && words
      ? lines
          .map(
            (line, i) =>
              `<text x="8" y="${startY + i * fontSize * 1.05}" fill="#ffffff" font-family="Inter Variable, Inter, sans-serif" font-weight="700" font-size="${fontSize}" style="filter:drop-shadow(rgba(0,0,0,0.2) 0px 0px 5px)">${escapeXml(line)}</text>`,
          )
          .join('')
      : '';

    return this.sanitizer.bypassSecurityTrustHtml(`
<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lg-${id}" gradientTransform="rotate(${angle}, 0.5, 0.5)">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="33%" stop-color="${mix(a, b, 0.35)}"/>
      <stop offset="66%" stop-color="${mix(a, b, 0.7)}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="r1-${id}">
      <stop offset="0%" stop-color="${b}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${b}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="r2-${id}">
      <stop offset="0%" stop-color="${a}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${a}" stop-opacity="0"/>
    </radialGradient>
    <filter id="grain-${id}" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="100" height="100" fill="url(#lg-${id})"/>
  <g style="mix-blend-mode:plus-lighter">
    <circle cx="${cx1}" cy="${cy1}" r="46" fill="url(#r1-${id})"/>
    <circle cx="${cx2}" cy="${cy2}" r="42" fill="url(#r2-${id})"/>
  </g>
  <rect width="100" height="100" filter="url(#grain-${id})" opacity="0.06"/>
  ${titleMarkup}
</svg>`);
  });
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= max) line += ' ' + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

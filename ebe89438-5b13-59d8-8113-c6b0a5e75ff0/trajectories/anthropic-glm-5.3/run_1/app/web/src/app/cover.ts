import { Component, Input } from '@angular/core';

const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Generated cover: a square painted entirely from the seed — four-stop linear
 * gradient at a hash-derived angle, two radial glows, grain, and the title.
 * No image files ship with this product.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  template: `
    <div class="cover-wrap" [style.width]="size" [style.height]="size" [attr.aria-hidden]="title ? null : 'true'">
      <div class="cover-back" [style.background]="backdrop"></div>
      <div class="cover" [style.background]="paint" [style.borderRadius]="radius">
        <svg class="grain" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <filter id="grain-{{ uid }}">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
            <feColorMatrix type="saturate" values="0"/>
          </filter>
          <rect width="100" height="100" [attr.filter]="'url(#grain-' + uid + ')'" opacity="0.06"/>
        </svg>
        <svg class="glow" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id="g1-{{ uid }}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" [attr.stop-color]="glowA" stop-opacity="0.4"/>
              <stop offset="100%" [attr.stop-color]="glowA" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="g2-{{ uid }}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" [attr.stop-color]="glowB" stop-opacity="0.4"/>
              <stop offset="100%" [attr.stop-color]="glowB" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="sheen-{{ uid }}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect [attr.x]="g1x" [attr.y]="g1y" width="96" height="96" [attr.fill]="'url(#g1-' + uid + ')'" style="mix-blend-mode: plus-lighter"/>
          <rect [attr.x]="g2x" [attr.y]="g2y" width="96" height="96" [attr.fill]="'url(#g2-' + uid + ')'" style="mix-blend-mode: plus-lighter"/>
          <circle cx="50" cy="50" r="46" [attr.fill]="'url(#sheen-' + uid + ')'" opacity="0.18"/>
        </svg>
        @if (title) {
          <span class="cover-title">{{ title }}</span>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cover-wrap { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 11px; isolation: isolate; }
    .cover-back { position: absolute; inset: -4%; filter: brightness(0.8) blur(24px) saturate(1.2); mix-blend-mode: multiply; opacity: .2; }
    .cover { position: absolute; inset: 0; transform: matrix(1.005, 0, 0, 1.005, 0, 0); border-radius: 11px; display: flex; align-items: flex-end; overflow: hidden; }
    .cover-title { color: #ffffff; font-weight: 700; font-size: 12%; line-height: 1.15; padding: 6% 7%; text-shadow: rgba(0,0,0,.2) 0 0 5px; font-family: var(--sans); word-break: break-word; }
    .grain, .glow { position: absolute; inset: 0; width: 100%; height: 100%; }
    .glow { mix-blend-mode: plus-lighter; }
    .cover-wrap { filter: saturate(2); }
  `],
})
export class CoverComponent {
  @Input({ required: true }) seed!: string;
  @Input() title = '';
  @Input() theme: string | null = null;
  @Input() size = '100%';
  @Input() radius = '12.8% / 5.7%';
  @Input() elliptical = true;
  uid = Math.random().toString(36).slice(2, 8);

  get h1() { return hash(this.seed || 'seed'); }
  get angle() { return this.h1 % 360; }
  get a() { return PALETTE[this.h1 % PALETTE.length]; }
  get b() { return PALETTE[(this.h1 + 1) % PALETTE.length]; }
  get glowA() { return PALETTE[(this.h1 + 3) % PALETTE.length]; }
  get glowB() { return PALETTE[(this.h1 + 5) % PALETTE.length]; }
  get g1x() { return (this.h1 % 30) - 10; }
  get g1y() { return ((this.h1 >> 3) % 30) - 10; }
  get g2x() { return 40 + ((this.h1 >> 5) % 30); }
  get g2y() { return 30 + ((this.h1 >> 7) % 30); }
  get paint() {
    const a = this.a, b = this.b;
    const c = this.glowA, d = this.glowB;
    return `linear-gradient(${this.angle}deg, ${a} 0%, ${c} 38%, ${d} 66%, ${b} 100%)`;
  }
  get backdrop() { return this.paint; }
}

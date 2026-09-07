import { Component, Input, OnChanges } from '@angular/core';

/**
 * Generated covers: the zero-asset substitution. A square filled with a
 * four-stop linear gradient between two neighbouring palette colours at a
 * hash-derived angle, two radial gradients blended plus-lighter, a fractal
 * grain overlay, and the title in white at 12 percent of the tile height.
 */
const PALETTE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function hash(str: string): number[] {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    h1 = (h1 ^ str.charCodeAt(i)) * 16777619 >>> 0;
    h2 = (h2 + str.charCodeAt(i) * (i + 7)) >>> 0;
  }
  return [h1 >>> 0, h2 >>> 0, (h1 ^ h2) >>> 0];
}

export function coverGradient(seed: string): {
  angle: number; c1: string; c2: string; r1: string; r2: string;
} {
  const [a, b, c] = hash(seed);
  const i = a % PALETTE.length;
  const j = (i + 1 + (b % (PALETTE.length - 1))) % PALETTE.length;
  return {
    angle: (a % 360),
    c1: PALETTE[i], c2: PALETTE[j],
    r1: `${20 + (b % 60)}% ${20 + (c % 60)}%`,
    r2: `${20 + (c % 60)}% ${20 + (a % 60)}%`,
  };
}

@Component({
  selector: 'cc-cover',
  standalone: true,
  template: `
  <div class="cover-wrap" [style.width.px]="size" [style.height.px]="size">
    <div class="cover-blurred" [style.background]="bg"></div>
    <div class="cover-main" [style.background]="bg">
      <div class="cover-radials" [style.background]="radials"></div>
      <div class="cover-grain"></div>
      @if (title) {<div class="cover-title" [style.font-size.px]="size * 0.12">{{ title }}</div>}
    </div>
    <div class="cover-glow" [style.background]="glow"></div>
    <div class="cover-sheen" [style.background]="glow"></div>
  </div>`,
  styles: [`
    :host { display: block; }
    .cover-wrap { position: relative; border-radius: 12.8% / 5.7%; overflow: hidden; isolation: isolate; }
    .cover-main { position: absolute; inset: 0; transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      animation: nudge 1000ms linear infinite; }
    .cover-blurred { position: absolute; inset: -12%;
      filter: brightness(0.8) blur(24px) saturate(1.2); mix-blend-mode: multiply; opacity: 0.2; }
    .cover-radials { position: absolute; inset: 0; mix-blend-mode: plus-lighter; opacity: 0.4; }
    .cover-glow, .cover-sheen { position: absolute; inset: 0; pointer-events: none;
      filter: saturate(2); }
    .cover-glow { mask: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0)); -webkit-mask: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0)); }
    .cover-sheen { mask: radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0)); -webkit-mask: radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0)); }
    .cover-grain { position: absolute; inset: 0; opacity: 0.06; mix-blend-mode: overlay;
      background-image: repeating-conic-gradient(#000 0% 0.0001%, #fff 0.0002% 0.0003%);
      background-size: 300px 300px; }
    .cover-title { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      padding: 8%; color: #fff; font-weight: 700; text-align: center; line-height: 1.15;
      text-shadow: rgba(0,0,0,0.2) 0px 0px 5px; }
    @media (prefers-reduced-motion: reduce) { .cover-main { animation: none; } }
  `],
})
export class Cover implements OnChanges {
  @Input() seed = '';
  @Input() title = '';
  @Input() size = 160;
  bg = '';
  radials = '';
  glow = '';

  ngOnChanges(): void {
    const g = coverGradient(this.seed || this.title || 'seed');
    this.bg = `linear-gradient(${g.angle}deg, ${g.c1} 0%, ${g.c2} 50%, ${g.c1} 100%)`;
    this.radials = `radial-gradient(circle at ${g.r1}, ${g.c1} 0%, transparent 60%),
      radial-gradient(circle at ${g.r2}, ${g.c2} 0%, transparent 60%)`;
    this.glow = `linear-gradient(135deg, ${g.c1}, ${g.c2})`;
  }
}

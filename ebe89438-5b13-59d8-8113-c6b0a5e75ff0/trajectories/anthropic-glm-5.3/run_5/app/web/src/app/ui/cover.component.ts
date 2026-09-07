import { Component, Input } from '@angular/core';
import { coverBackground } from '../cover';

/**
 * A generated cover: gradient, glows, grain and the title, drawn by the code.
 * The glow and sheen layers sit under a saturating wrapper so the light reads
 * as colour rather than a grey halo.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  template: `
    <div class="cover-wrap" [class.rounded]="rounded" [style.width.px]="size" [style.height.px]="size">
      <div class="cover-blur" [style.background]="bg"></div>
      <div class="cover-saturate">
        <div class="cover-art" [style.background]="bg">
          <div class="cover-grain" aria-hidden="true"></div>
          <div class="cover-glow" aria-hidden="true"></div>
          <div class="cover-sheen" aria-hidden="true"></div>
          @if (showTitle) {
            <span class="cover-title">{{ title }}</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
    :host { display: block; }
    .cover-wrap { position: relative; width: 100%; height: 100%; border-radius: 12.8% / 5.7%; overflow: hidden; }
    .cover-wrap.rounded { border-radius: 11px; }
    .cover-blur {
      position: absolute; inset: -6%;
      filter: brightness(0.8) blur(24px) saturate(1.2);
      mix-blend-mode: multiply; opacity: 0.2;
    }
    .cover-saturate { position: absolute; inset: 0; filter: saturate(2); }
    .cover-art {
      position: absolute; inset: 0;
      transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      animation: nudge 1000ms linear infinite;
      display: flex; align-items: flex-end; padding: 10%;
      overflow: hidden;
    }
    .cover-grain {
      position: absolute; inset: 0; opacity: 0.06;
      background-image: repeating-conic-gradient(rgba(255,255,255,0.5) 0%, rgba(0,0,0,0.5) 0.05%, transparent 0.1%);
      background-size: 300px 300px;
      mix-blend-mode: overlay;
    }
    .cover-glow {
      position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0));
      mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0));
      -webkit-mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0));
    }
    .cover-sheen {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0));
      mask-image: radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0));
      -webkit-mask-image: radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0));
      opacity: 0.5;
    }
    .cover-title {
      position: relative; z-index: 2;
      color: #fff; font-weight: 700; font-size: 12%;
      line-height: 1.15; text-shadow: rgba(0,0,0,0.2) 0px 0px 5px;
    }
    @media (prefers-reduced-motion: reduce) { .cover-art { animation: none; } }
  `],
})
export class CoverComponent {
  @Input({ required: true }) seed!: string;
  @Input() title = '';
  @Input() showTitle = true;
  @Input() size: number | null = null;
  @Input() rounded = false;

  get bg(): string {
    return coverBackground(this.seed);
  }
}

import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { coverArt } from '../core/art';

/**
 * A generated cover: a square filled with a four-stop linear gradient at a
 * hash-derived angle, two radial gradients blended plus-lighter, a grain
 * overlay drawn as fractal noise, and the title in white.
 *
 * The glow and sheen layers sit under a wrapper carrying filter: saturate(2)
 * so the glow reads as coloured light rather than a grey halo, and a blurred
 * copy sits beneath the cover. The blurs are painted once and left alone: only
 * position and opacity ever move.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cover-wrap" [style.width.px]="size" [style.height.px]="size">
      <div class="cover-blur" [style.background]="gradient()" aria-hidden="true"></div>
      <div class="cover-saturate">
        <div class="cover-glow" [style.background]="flat()" aria-hidden="true"></div>
        <div class="cover-sheen" [style.background]="flat()" aria-hidden="true"></div>
      </div>
      <div class="cover" [style.background]="gradient()" [class.nudge]="drift">
        <div class="cover-radials" [style.background]="radials()" aria-hidden="true"></div>
        <svg class="cover-grain" aria-hidden="true">
          <filter [attr.id]="grainId">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" [attr.filter]="'url(#' + grainId + ')'" />
        </svg>
        @if (showTitle) {
          <span class="cover-title" [style.font-size.px]="size * 0.12">{{ title }}</span>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .cover-wrap {
        position: relative;
        max-width: 100%;
        aspect-ratio: 1;
      }

      /* Beneath the cover, a blurred copy of it. */
      .cover-blur {
        position: absolute;
        inset: 0;
        filter: brightness(0.8) blur(24px) saturate(1.2);
        mix-blend-mode: multiply;
        opacity: 0.2;
        border-radius: 12.8% / 5.7%;
        z-index: -1;
      }

      .cover-saturate {
        position: absolute;
        inset: 0;
        filter: saturate(2);
        pointer-events: none;
      }

      .cover-glow {
        position: absolute;
        inset: 0;
        -webkit-mask-image: radial-gradient(
          96px at calc(50% + 10px) calc(50% + 10px),
          rgb(255, 255, 255),
          rgba(255, 255, 255, 0)
        );
        mask-image: radial-gradient(
          96px at calc(50% + 10px) calc(50% + 10px),
          rgb(255, 255, 255),
          rgba(255, 255, 255, 0)
        );
        opacity: 0.9;
      }

      .cover-sheen {
        position: absolute;
        inset: 0;
        -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.7;
      }

      /* Cover tiles use the elliptical radius so the corner curve tracks the
         tile's aspect ratio rather than staying constant. */
      .cover {
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 12.8% / 5.7%;
        overflow: hidden;
        display: flex;
        align-items: flex-end;
        padding: 8%;
        transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      }

      .cover.nudge {
        animation: nudge 1000ms linear infinite;
      }

      .cover-radials {
        position: absolute;
        inset: 0;
        mix-blend-mode: plus-lighter;
      }

      .cover-grain {
        position: absolute;
        inset: 0;
        width: 300px;
        height: 300px;
        opacity: 0.06;
        pointer-events: none;
      }

      .cover-title {
        position: relative;
        color: #ffffff;
        font-weight: 700;
        line-height: 1.15;
        text-shadow: rgba(0, 0, 0, 0.2) 0px 0px 5px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }
    `,
  ],
})
export class CoverComponent {
  @Input({ required: true }) seed = '';
  @Input() title = '';
  @Input() size = 332;
  @Input() showTitle = true;
  @Input() drift = false;

  readonly grainId = `grain-${Math.random().toString(36).slice(2, 9)}`;

  private art = computed(() => coverArt(this.seedValue()));
  private seedValue = signal('');

  ngOnChanges() {
    this.seedValue.set(this.seed);
  }

  gradient() {
    const a = this.art();
    return `linear-gradient(${a.angle}deg, ${a.from} 0%, ${a.from} 28%, ${a.to} 72%, ${a.to} 100%)`;
  }

  flat() {
    const a = this.art();
    return `linear-gradient(${a.angle}deg, ${a.from}, ${a.to})`;
  }

  radials() {
    const a = this.art();
    return (
      `radial-gradient(circle at ${a.radial1.x}% ${a.radial1.y}%, ${this.alpha(a.radial1.colour)}, transparent 60%),` +
      `radial-gradient(circle at ${a.radial2.x}% ${a.radial2.y}%, ${this.alpha(a.radial2.colour)}, transparent 60%)`
    );
  }

  private alpha(hex: string) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.4)`;
  }
}

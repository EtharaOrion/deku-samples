import { Component, Input, computed, signal } from '@angular/core';
import { coverArt, withAlpha } from '../core/art';

/**
 * A generated cover tile: gradient, two radials, a grain overlay drawn as
 * fractal noise, the title in white, plus the glow, sheen and blurred
 * under-layer the theme system asks for.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  template: `
    <div class="wrap" [style.--tile-a]="art().a" [style.--tile-b]="art().b">
      <div class="under" [style.background]="art().gradient" aria-hidden="true"></div>
      <div class="tile" [class.nudge]="drift" [style.border-radius]="radius">
        <div class="base" [style.background]="art().gradient"></div>
        <div class="radials" [style.background]="art().radial"></div>
        <svg class="grain" aria-hidden="true" focusable="false">
          <filter [attr.id]="grainId">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" [attr.filter]="'url(#' + grainId + ')'" />
        </svg>
        <div class="glow" [style.background]="flat()"></div>
        <div class="sheen" [style.background]="flat()"></div>
        @if (showTitle) { <span class="title">{{ title }}</span> }
      </div>
    </div>
  `,
  styles: [`
    .wrap { position: relative; width: 100%; filter: saturate(2); }
    .tile {
      position: relative; width: 100%; aspect-ratio: 1; overflow: hidden;
      isolation: isolate; transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      display: flex; align-items: flex-end; padding: 8%;
    }
    .tile.nudge { animation: nudge 1000ms linear infinite; }
    .base, .radials, .glow, .sheen { position: absolute; inset: 0; }
    .radials { mix-blend-mode: plus-lighter; }
    .grain { position: absolute; inset: 0; width: 300px; height: 300px; opacity: 0.06; }
    .glow {
      -webkit-mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
      mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
    }
    .sheen {
      -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
      mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
    }
    .under {
      position: absolute; inset: 0; filter: brightness(0.8) blur(24px) saturate(1.2);
      mix-blend-mode: multiply; opacity: 0.2; z-index: -1;
    }
    .title {
      position: relative; z-index: 2; color: #ffffff; font-weight: 700;
      font-size: 12cqh; line-height: 1.15; text-shadow: rgba(0, 0, 0, 0.2) 0px 0px 5px;
      font-family: var(--sans);
    }
    .tile { container-type: size; }
  `],
})
export class CoverComponent {
  @Input() seed = '';
  @Input() title = '';
  @Input() radius = '12.8% / 5.7%';
  @Input() showTitle = true;
  @Input() drift = false;

  private seedSig = signal('');
  art = computed(() => coverArt(this.seedSig() || this.seed));
  grainId = `grain-${Math.random().toString(36).slice(2, 9)}`;

  flat = computed(() => {
    const a = this.art();
    return `linear-gradient(${a.angle}deg, ${a.a} 0%, ${a.b} 100%)`;
  });

  ngOnChanges() { this.seedSig.set(this.seed); }
}

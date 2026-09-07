import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coverBackground, coverKey, coverRadials } from '../core/art';

/**
 * A generated cover: a square filled with a four-stop linear gradient at a
 * hash-derived angle between two neighbouring colours, two radial gradients in
 * the same colours at 0.4 alpha blended plus-lighter, a grain overlay drawn as
 * fractal noise, and the title at 12% of the square's height.
 *
 * Every tile carries a glow layer and a sheen layer, both masked and filled with
 * a flat two-stop gradient in the tile's own colour, under a wrapper carrying
 * `filter: saturate(2)` so the glow reads as coloured light rather than a grey
 * halo. Beneath the cover sits a blurred copy of it. The blurs are painted once
 * and left alone; only position and opacity move.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="wrap" [style.border-radius]="radius()">
      <span class="under" [style.background]="background()" aria-hidden="true"></span>
      <span class="glow-wrap" aria-hidden="true">
        <span class="glow" [style.background]="flat()"></span>
        <span class="sheen" [style.background]="flat()"></span>
      </span>
      <span class="tile" [style.border-radius]="radius()" [style.background]="background()">
        <span class="radials" [style.background]="radials()" aria-hidden="true"></span>
        <span class="grain" aria-hidden="true"></span>
        @if (showTitle()) {
          <span class="cover-title">{{ title() }}</span>
        }
      </span>
    </span>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        aspect-ratio: 1 / 1;
        width: 100%;
      }
      .wrap {
        position: absolute;
        inset: 0;
        display: block;
        filter: saturate(2);
      }
      /* A blurred copy of the cover beneath it. */
      .under {
        position: absolute;
        inset: 6% 6% 0 6%;
        filter: brightness(0.8) blur(24px) saturate(1.2);
        mix-blend-mode: multiply;
        opacity: 0.2;
        border-radius: inherit;
        z-index: -1;
      }
      .glow-wrap { position: absolute; inset: -12%; pointer-events: none; }
      .glow {
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
        opacity: 0.55;
      }
      .sheen {
        position: absolute;
        inset: 0;
        -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.35;
      }
      .tile {
        position: absolute;
        inset: 0;
        overflow: hidden;
        display: flex;
        align-items: flex-end;
        padding: 8%;
        transform: matrix(1.005, 0, 0, 1.005, 0, 0);
        animation: nudge 1000ms linear infinite;
        box-shadow: var(--hairline-inset);
      }
      .radials { position: absolute; inset: 0; mix-blend-mode: plus-lighter; }
      /* Grain: fractal noise at base frequency 0.9 with 4 octaves, desaturated
         and tiled at 300px. */
      .grain {
        position: absolute;
        inset: 0;
        opacity: 0.06;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
        background-size: 300px 300px;
      }
      .cover-title {
        position: relative;
        color: #ffffff;
        font-weight: 700;
        font-size: calc(var(--cover-size, 200px) * 0.12);
        line-height: 1.1;
        text-shadow: rgba(0, 0, 0, 0.2) 0px 0px 5px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }
      @media (prefers-reduced-motion: reduce) {
        .tile { animation: none; }
      }
    `,
  ],
  host: { '[style.--cover-size.px]': 'pixelSize()' },
})
export class CoverComponent {
  readonly seed = input.required<string>();
  readonly title = input('');
  readonly showTitle = input(true);
  /** Cover tiles use the elliptical radius so the curve tracks the aspect ratio. */
  readonly radius = input('12.8% / 5.7%');
  readonly pixelSize = input(200);

  readonly background = computed(() => coverBackground(this.seed()));
  readonly radials = computed(() => coverRadials(this.seed()));
  readonly flat = computed(() => {
    const key = coverKey(this.seed());
    return `linear-gradient(180deg, ${key} 0%, ${key} 100%)`;
  });
}

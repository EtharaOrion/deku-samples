import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coverArt, coverBackground } from './cover';

/**
 * One generated cover tile: a gradient ground, a glow layer and a sheen layer
 * each masked with their own radial, both filled from the tile's own colour and
 * saturated so the glow reads as coloured light rather than a grey halo, a
 * blurred copy beneath, and the title drawn at 12 percent of the square.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cover-wrap" [class.anim-nudge]="drift()">
      <div class="under" [style.background]="bg()" aria-hidden="true"></div>
      <div class="saturate">
        <div class="tile" [style.background]="bg()" [class.rounded-media]="media()">
          <div class="grain" aria-hidden="true"></div>
          <div class="glow" [style.background]="flat()" aria-hidden="true"></div>
          <div class="sheen" [style.background]="flat()" aria-hidden="true"></div>
          @if (showTitle()) {
            <span class="title">{{ title() }}</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        aspect-ratio: 1;
      }
      .cover-wrap {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .under {
        position: absolute;
        inset: 6% 6% 0 6%;
        filter: brightness(0.8) blur(24px) saturate(1.2);
        mix-blend-mode: multiply;
        opacity: 0.2;
        z-index: -1;
        border-radius: 12.8% / 5.7%;
      }
      .saturate {
        filter: saturate(2);
        width: 100%;
        height: 100%;
      }
      .tile {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border-radius: 12.8% / 5.7%;
        display: flex;
        align-items: flex-end;
        transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      }
      .tile.rounded-media {
        border-radius: 11px;
      }
      .grain {
        position: absolute;
        inset: 0;
        opacity: 0.06;
        background-image: var(--grain-url);
        background-size: 300px 300px;
        filter: grayscale(1);
        pointer-events: none;
      }
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
        pointer-events: none;
      }
      .sheen {
        position: absolute;
        inset: 0;
        -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.7;
        pointer-events: none;
      }
      .title {
        position: relative;
        color: #ffffff;
        font-weight: 700;
        font-size: 12cqh;
        line-height: 1.15;
        padding: 8%;
        text-shadow: rgba(0, 0, 0, 0.2) 0px 0px 5px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }
      .tile {
        container-type: size;
      }
      .anim-nudge {
        animation: nudge 1000ms linear infinite;
      }
    `,
  ],
})
export class CoverComponent {
  seed = input.required<string>();
  title = input<string>('');
  showTitle = input<boolean>(true);
  drift = input<boolean>(false);
  media = input<boolean>(false);

  readonly bg = computed(() => coverBackground(this.seed()));
  readonly flat = computed(() => {
    const a = coverArt(this.seed());
    return `linear-gradient(${a.angle}deg, ${a.to}, ${a.from})`;
  });
}

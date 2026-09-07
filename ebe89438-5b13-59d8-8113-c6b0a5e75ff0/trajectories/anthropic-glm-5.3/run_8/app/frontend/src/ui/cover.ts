import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { coverArt, GRAIN_URL, linearGradient, radialGradients } from '../art';

/**
 * A generated cover: a four-stop linear gradient at a hash-derived angle
 * between neighbouring palette colours, two radial gradients blended
 * plus-lighter, a grain overlay at 0.06 alpha, and the title in white. Beneath
 * it sits a blurred copy with the nudge clock running under a saturate wrapper.
 */
@Component({
  selector: 'g-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [class.compact]="compact">
      <div class="under" [style.backgroundImage]="linear"></div>
      <div class="tile" [style.backgroundImage]="radials + ', ' + linear">
        <div class="grain" [style.backgroundImage]="grain"></div>
        @if (showTitle) {
          <div class="title" [style.fontSize]="titleSize">{{ title }}</div>
        }
        <div class="glow" [style.backgroundImage]="glowFill"></div>
        <div class="sheen" [style.backgroundImage]="glowFill"></div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .wrap { position: relative; width: 100%; padding-bottom: 100%; }
    .under, .tile { position: absolute; inset: 0; border-radius: 12.8% / 5.7%; overflow: hidden; }
    .under {
      filter: brightness(0.8) blur(24px) saturate(1.2);
      mix-blend-mode: multiply; opacity: 0.2;
      transform: scale(0.985);
    }
    .wrap:not(.compact) .tile { animation: none; }
    .tile { box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.12); }
    .glow, .sheen { position: absolute; inset: 0; pointer-events: none; }
    .glow {
      filter: saturate(2);
      -webkit-mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0));
      mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0));
    }
    .sheen {
      -webkit-mask-image: radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0));
      mask-image: radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0));
      opacity: 0.5;
    }
    .grain {
      position: absolute; inset: 0; opacity: 0.06;
      background-size: 300px 300px; pointer-events: none; mix-blend-mode: overlay;
    }
    .title {
      position: absolute; left: 0; right: 0; bottom: 8%; text-align: center;
      color: #fff; font-weight: 700; padding: 0 9%;
      text-shadow: rgba(0,0,0,0.2) 0 0 5px;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
    }
    @media (prefers-reduced-motion: no-preference) {
      .under { animation: nudge 1000ms linear infinite; will-change: transform; }
      .tile { transform: matrix(1.005, 0, 0, 1.005, 0, 0); }
    }
    @keyframes nudge {
      0% { transform: translate3d(0,0,0); }
      25% { transform: translate3d(5px,-8px,0); }
      50% { transform: translate3d(-4px,6px,0); }
      75% { transform: translate3d(6px,3px,0); }
      100% { transform: translate3d(0,0,0); }
    }
  `],
})
export class Cover {
  @Input({ required: true }) seed!: string;
  @Input() title = '';
  @Input() showTitle = true;
  @Input() compact = false;

  get art() {
    return coverArt(this.seed);
  }
  get linear(): string {
    return linearGradient(this.art);
  }
  get radials(): string {
    return radialGradients(this.art);
  }
  get grain(): string {
    return GRAIN_URL;
  }
  get glowFill(): string {
    const [a, b] = this.art.neighbours;
    return `linear-gradient(140deg, ${a}, ${b})`;
  }
  get titleSize(): string {
    return this.compact ? '9px' : '12%';
  }
}

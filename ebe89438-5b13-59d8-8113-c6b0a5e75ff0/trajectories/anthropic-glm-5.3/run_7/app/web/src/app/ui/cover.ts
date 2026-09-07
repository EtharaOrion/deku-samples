import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coverSpec } from '../core/tokens';

/**
 * A cover generated from the event's seed: a four-stop linear gradient, two
 * radial gradients blended plus-lighter, a grain overlay and the title.
 */
@Component({
  selector: 'app-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [style.--cover-a]="spec().stops[0]" [style.--cover-b]="spec().stops[1]"
         [style.filter]="'saturate(2)'">
      <div class="under" aria-hidden="true"></div>
      <div class="tile" [style.background]="gradient()" aria-hidden="true"></div>
      @if (title()) {
        <span class="title" aria-hidden="true">{{ title() }}</span>
      }
      <svg class="grain" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <filter id="g{{ uid }}">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" [attr.filter]="'url(#g' + uid + ')'" opacity="0.06" />
      </svg>
      <div class="glow" aria-hidden="true"></div>
      <div class="sheen" aria-hidden="true"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .wrap {
      position: relative; width: 100%; aspect-ratio: 1 / 1;
      border-radius: 12.8% / 5.7%; overflow: hidden; isolation: isolate;
    }
    .under {
      position: absolute; inset: -6%;
      background: linear-gradient(var(--angle), var(--cover-a), var(--cover-a) 40%, var(--cover-b));
      filter: brightness(0.8) blur(24px) saturate(1.2);
      mix-blend-mode: multiply; opacity: 0.2;
      transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      z-index: -1;
    }
    .tile { position: absolute; inset: 0; transform: matrix(1.005, 0, 0, 1.005, 0, 0); }
    .title {
      position: absolute; left: 8%; right: 8%; bottom: 7%;
      color: #fff; font: 700 12% 'Source Serif 4', Georgia, serif; line-height: 1.1;
      text-shadow: rgba(0, 0, 0, 0.2) 0px 0px 5px; z-index: 2;
    }
    .grain { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; }
    .glow, .sheen {
      position: absolute; inset: 0; z-index: 4; pointer-events: none;
      background: linear-gradient(135deg, var(--cover-a), var(--cover-b));
    }
    .glow {
      mask: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
      -webkit-mask: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
      opacity: 0.28;
    }
    .sheen {
      mask: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
      -webkit-mask: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
      opacity: 0.12;
    }
  `],
})
export class CoverComponent {
  static nextUid = 0;
  seed = input.required<string>();
  title = input<string | undefined>(undefined);
  uid = ++CoverComponent.nextUid;

  spec = computed(() => coverSpec(this.seed()));
  gradient = computed(() => {
    const s = this.spec();
    return [
      `linear-gradient(${s.angle}deg, ${s.stops[0]}, ${s.stops[0]} 22%, ${s.stops[1]} 62%, ${s.stops[1]})`,
      `radial-gradient(circle at ${s.r1.x}% ${s.r1.y}%, ${s.r1.color}66, transparent 60%)`,
      `radial-gradient(circle at ${s.r2.x}% ${s.r2.y}%, ${s.r2.color}66, transparent 55%)`,
    ].join(', ');
  });
}

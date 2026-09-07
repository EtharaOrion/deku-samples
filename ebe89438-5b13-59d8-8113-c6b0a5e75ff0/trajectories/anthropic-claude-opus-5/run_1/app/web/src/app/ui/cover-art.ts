import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PALETTE = [
  '#f31a7c',
  '#146aeb',
  '#3cbd2c',
  '#ab46dd',
  '#d69712',
  '#007aff',
  '#28cd41',
  '#ff3b30',
];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Every picture in the product is drawn by the code. A cover is a four-stop
 * linear gradient at a hash-derived angle between two neighbouring colours,
 * two radial gradients blended plus-lighter, a fractal-noise grain, and the
 * title in white.
 */
@Component({
  selector: 'app-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cover" [class.cover-glowing]="glow()" [style.border-radius]="radius()">
      <svg
        class="cover-art"
        [attr.viewBox]="'0 0 400 400'"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        [attr.aria-label]="'Generated cover for ' + title()"
      >
        <defs>
          <linearGradient [attr.id]="ids().lin" [attr.gradientTransform]="'rotate(' + angle() + ' 0.5 0.5)'">
            <stop offset="0%" [attr.stop-color]="pair()[0]" />
            <stop offset="35%" [attr.stop-color]="mix()[0]" />
            <stop offset="70%" [attr.stop-color]="mix()[1]" />
            <stop offset="100%" [attr.stop-color]="pair()[1]" />
          </linearGradient>
          <radialGradient [attr.id]="ids().r1" [attr.cx]="spots()[0].x + '%'" [attr.cy]="spots()[0].y + '%'" r="60%">
            <stop offset="0%" [attr.stop-color]="pair()[1]" stop-opacity="0.4" />
            <stop offset="100%" [attr.stop-color]="pair()[1]" stop-opacity="0" />
          </radialGradient>
          <radialGradient [attr.id]="ids().r2" [attr.cx]="spots()[1].x + '%'" [attr.cy]="spots()[1].y + '%'" r="55%">
            <stop offset="0%" [attr.stop-color]="pair()[0]" stop-opacity="0.4" />
            <stop offset="100%" [attr.stop-color]="pair()[0]" stop-opacity="0" />
          </radialGradient>
          <filter [attr.id]="ids().grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="400" height="400" [attr.fill]="'url(#' + ids().lin + ')'" />
        <g style="mix-blend-mode: plus-lighter">
          <rect width="400" height="400" [attr.fill]="'url(#' + ids().r1 + ')'" />
          <rect width="400" height="400" [attr.fill]="'url(#' + ids().r2 + ')'" />
        </g>
        <rect width="400" height="400" [attr.filter]="'url(#' + ids().grain + ')'" opacity="0.06" />
        @if (showTitle()) {
          <text
            x="200"
            y="215"
            text-anchor="middle"
            fill="#ffffff"
            font-weight="700"
            font-size="48"
            [attr.font-family]="'Inter, sans-serif'"
            style="paint-order: stroke; filter: drop-shadow(rgba(0, 0, 0, 0.2) 0px 0px 5px)"
          >
            {{ shortTitle() }}
          </text>
        }
      </svg>
      @if (glow()) {
        <!-- the glow and sheen read as coloured light under saturate(2) -->
        <span class="cover-lightwrap" aria-hidden="true">
          <span class="cover-glow" [style.background]="flat()"></span>
          <span class="cover-sheen" [style.background]="flat()"></span>
        </span>
      }
    </div>
  `,
  styles: [
    `
      .cover {
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        overflow: hidden;
        background: var(--paper-inset);
      }
      .cover-art {
        width: 100%;
        height: 100%;
        display: block;
      }
      .cover-lightwrap {
        position: absolute;
        inset: 0;
        filter: saturate(2);
        pointer-events: none;
      }
      .cover-glow,
      .cover-sheen {
        position: absolute;
        inset: 0;
        display: block;
      }
      .cover-glow {
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
      .cover-sheen {
        -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.35;
      }
    `,
  ],
})
export class CoverArt {
  readonly seed = input.required<string>();
  readonly title = input<string>('');
  readonly radius = input<string>('var(--r-media)');
  readonly glow = input<boolean>(false);
  readonly showTitle = input<boolean>(true);

  private readonly h = computed(() => hash(this.seed() || 'seed'));

  readonly ids = computed(() => {
    const n = this.h().toString(36);
    return { lin: `lin-${n}`, r1: `r1-${n}`, r2: `r2-${n}`, grain: `gr-${n}` };
  });

  readonly angle = computed(() => this.h() % 360);

  /** Two colours chosen as neighbours in the list. */
  readonly pair = computed<[string, string]>(() => {
    const i = this.h() % PALETTE.length;
    return [PALETTE[i], PALETTE[(i + 1) % PALETTE.length]];
  });

  readonly mix = computed<[string, string]>(() => {
    const [a, b] = this.pair();
    return [a, b];
  });

  readonly flat = computed(() => {
    const [a, b] = this.pair();
    return `linear-gradient(${a}, ${b})`;
  });

  readonly spots = computed(() => {
    const h = this.h();
    return [
      { x: 10 + (h % 70), y: 5 + ((h >> 5) % 60) },
      { x: 20 + ((h >> 9) % 70), y: 30 + ((h >> 13) % 60) },
    ];
  });

  readonly shortTitle = computed(() => {
    const t = this.title();
    return t.length > 18 ? t.slice(0, 17) + '\u2026' : t;
  });
}

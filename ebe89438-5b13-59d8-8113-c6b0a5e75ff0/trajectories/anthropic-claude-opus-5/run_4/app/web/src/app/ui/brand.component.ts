import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * A four-pointed star with concave sides on the coordinate box 0 0 133 134,
 * filled with the current text colour and drawn from geometry rather than an
 * image file. The wordmark sits at weight 700 with -0.02em tracking, the mark
 * at the cap-height of the final letter offset up by 2px.
 */
@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="lockup" routerLink="/" [class.tinted]="tinted()" aria-label="Community Calendar, home">
      <span class="word">Community Calendar</span><svg
        class="mark"
        viewBox="0 0 133 134"
        [attr.width]="markSize()"
        [attr.height]="markSize()"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M66.5 0c2.2 34.6 8.9 51.6 22.6 60.7C99.4 67.5 113.7 70.2 133 67c-34.6 2.3-51.5 9-60.6 22.7-6.8 10.2-9.5 24.6-6.3 44 -2.2-34.6-8.9-51.6-22.6-60.7C33.3 66.2 19 63.5 0 67c34.6-2.3 51.5-9 60.6-22.7C67.4 34.1 70.1 19.7 66.5 0z"
          fill="currentColor"
        />
      </svg>
    </a>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .lockup {
        display: inline-flex;
        align-items: baseline;
        color: var(--ink);
        font-weight: 700;
        letter-spacing: -0.02em;
        transition: color var(--dur) var(--ease);
        white-space: nowrap;
      }
      .lockup.tinted {
        color: #f31a7c;
      }
      @media (hover: hover) {
        .lockup.tinted:hover {
          color: #d5176d;
        }
      }
      /* The mark sits at the cap-height of the final letter, offset up by 2px. */
      .mark {
        display: inline-block;
        margin-left: 2px;
        transform: translateY(-2px);
      }
      .word {
        line-height: 1;
      }
    `,
  ],
})
export class BrandComponent {
  markSize = input<number>(13);
  tinted = input<boolean>(false);
}

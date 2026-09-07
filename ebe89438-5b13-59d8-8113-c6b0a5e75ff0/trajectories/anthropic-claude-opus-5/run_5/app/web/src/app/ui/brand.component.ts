import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A four-pointed star with concave sides on the coordinate box 0 0 133 134,
 * filled with the current text colour and drawn from geometry, never an image
 * file. The wordmark sits at weight 700 with -0.02em tracking, and the mark at
 * the cap-height of the final letter offset up by 2px.
 */
@Component({
  selector: 'app-brand',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lockup" [class.lockup--tinted]="tinted()">
      <svg
        class="mark"
        [attr.width]="markSize()"
        [attr.height]="markSize()"
        viewBox="0 0 133 134"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M66.5 0c1.6 34.2 6.5 50.6 18.2 58.9C93.6 65 108.5 66.9 133 67c-24.5.1-39.4 2-48.3 8.1-11.7 8.3-16.6 24.7-18.2 58.9-1.6-34.2-6.5-50.6-18.2-58.9C39.4 69 24.5 67.1 0 67c24.5-.1 39.4-2 48.3-8.1C60 50.6 64.9 34.2 66.5 0Z"
        />
      </svg>
      @if (!markOnly()) {
        <span class="word" [style.font-size.px]="wordSize()">Deku</span>
      }
    </span>
  `,
  styles: [
    `
      :host { display: inline-flex; line-height: 0; }
      .lockup {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--ink);
      }
      .lockup--tinted { color: var(--pink); }
      .lockup--tinted:hover { color: var(--pink-hover); }
      .mark { transform: translateY(-2px); flex: none; }
      .word {
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1;
      }
    `,
  ],
})
export class BrandComponent {
  readonly markSize = input(18);
  readonly wordSize = input(19);
  readonly markOnly = input(false);
  readonly tinted = input(false);
}

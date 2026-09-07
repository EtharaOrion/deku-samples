import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORY_HUES } from '../core/models';

/**
 * The brand mark: a four-pointed star with concave sides on the coordinate box
 * 0 0 133 134, drawn from geometry rather than an image file and filled with
 * the current text colour.
 */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (asLink()) {
      <a class="lockup" routerLink="/" aria-label="Deku, home">
        <svg viewBox="0 0 133 134" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true">
          <path fill="currentColor" [attr.d]="STAR" />
        </svg>
        <span class="wordmark">Deku</span>
      </a>
    } @else {
      <span class="lockup">
        <svg viewBox="0 0 133 134" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true">
          <path fill="currentColor" [attr.d]="STAR" />
        </svg>
        <span class="wordmark">Deku</span>
      </span>
    }
  `,
  styles: [
    `
      .lockup {
        display: inline-flex;
        align-items: center;
        gap: var(--s2);
        color: inherit;
        text-decoration: none;
        font-weight: 700;
        letter-spacing: -0.02em;
        font-size: 18px;
        line-height: 24px;
      }
      svg {
        flex: 0 0 auto;
        position: relative;
        top: -2px;
      }
      .wordmark {
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      :host(.tinted) .lockup {
        color: var(--pink);
      }
      @media (hover: hover) {
        :host(.tinted) .lockup:hover {
          color: var(--pink-active);
        }
      }
    `,
  ],
})
export class Brand {
  readonly size = input<number>(18);
  readonly asLink = input<boolean>(true);
  /* four points with concave sides, drawn from geometry on the 0 0 133 134 box */
  readonly STAR =
    'M66.5 0C69 34 40 34 66.5 67 40 100 69 100 66.5 134 64 100 93 100 66.5 67 93 34 64 34 66.5 0Z ' +
    'M0 67C34 64.5 34 93.5 67 67 100 93.5 100 64.5 133 67 100 69.5 100 40.5 67 67 34 40.5 34 69.5 0 67Z';
}

/**
 * The twelve category glyphs on a 24 grid at stroke 1.5 with round caps and
 * joins and no fill, each in its assigned hue.
 */
@Component({
  selector: 'app-category-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      [attr.stroke]="hue()"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.width.px]="size()"
      [style.height.px]="size()"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('family') {
          <path d="M3 10.5 12 3l9 7.5V21H3z" />
          <path d="M12 17.5c-1.6-1.3-3-2.2-3-3.6a1.6 1.6 0 0 1 3-.7 1.6 1.6 0 0 1 3 .7c0 1.4-1.4 2.3-3 3.6Z" />
        }
        @case ('books') {
          <rect x="3" y="4" width="7.5" height="16" rx="1" />
          <rect x="13.5" y="4" width="7.5" height="16" rx="1" />
          <path d="M12 4v16" />
        }
        @case ('games') {
          <path d="M12 3 21 8v8l-9 5-9-5V8Z" />
          <path d="M12 12 21 8M12 12l-9-4M12 12v9" />
        }
        @case ('tech') {
          <rect x="2.5" y="5" width="19" height="14" rx="3" />
          <path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2" />
        }
        @case ('food-and-drink') {
          <path d="M3.5 13h17a8.5 8.5 0 0 1-17 0Z" />
          <path d="M9 3c-1 1.2-1 2.3 0 3.5s1 2.3 0 3.5M14.5 4c-.8 1-.8 1.9 0 2.9s.8 1.9 0 2.9" />
        }
        @case ('ai') {
          <path d="M11.2 4.5a3 3 0 0 0-5 2.2 2.8 2.8 0 0 0-1.4 4.6A3 3 0 0 0 6.6 16a3 3 0 0 0 4.6 3.3Z" />
          <path d="M12.8 4.5a3 3 0 0 1 5 2.2 2.8 2.8 0 0 1 1.4 4.6A3 3 0 0 1 17.4 16a3 3 0 0 1-4.6 3.3Z" />
        }
        @case ('running') {
          <circle cx="15" cy="4.6" r="1.9" />
          <path d="m13.6 9-3.4 2.2 1.9 3.3-1.3 5.3M13.6 9l3.6 1.6 1.6 3.4M13.6 9 9 8 6 10.4M12.1 14.5l3.9 1.4 1.4 3.9" />
        }
        @case ('arts-and-culture') {
          <path d="M12 3a9 9 0 0 0 0 18c1.3 0 1.8-.9 1.4-1.8-.5-1.1.3-2.2 1.5-2.2H17a4 4 0 0 0 4-4c0-5.2-4-10-9-10Z" />
          <circle cx="8" cy="9.5" r="1" />
          <circle cx="12" cy="7" r="1" />
          <circle cx="16" cy="9.5" r="1" />
          <circle cx="8" cy="14.5" r="1" />
        }
        @case ('climate') {
          <circle cx="12" cy="12" r="9" />
          <path d="M3.5 9.5h17M3.5 14.5h17M12 3a15 15 0 0 0 0 18 15 15 0 0 0 0-18Z" />
          <path d="M14 13.5c2-.4 3.2-2 3.4-4-2 .2-3.6 1.5-4 3.4" />
        }
        @case ('fitness') {
          <path d="M6.5 8v8M4 10v4M17.5 8v8M20 10v4M6.5 12h11" />
        }
        @case ('wellness') {
          <path d="M12 4c1.8 1.8 2.6 3.7 2.6 5.6S13.8 13.4 12 15c-1.8-1.6-2.6-3.5-2.6-5.4S10.2 5.8 12 4Z" />
          <path d="M12 15c-1.8-1-3.7-1.3-5.6-.9.3 1.9 1.4 3.4 3.1 4.4M12 15c1.8-1 3.7-1.3 5.6-.9-.3 1.9-1.4 3.4-3.1 4.4" />
          <path d="M12 15v5" />
        }
        @case ('crypto') {
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 8.5h4a2.2 2.2 0 0 1 0 4.4h-4M9.5 12.9h4.2a2.2 2.2 0 0 1 0 4.4H9.5M11 6.5v11M13.5 6.5v11" />
        }
        @default {
          <circle cx="12" cy="12" r="9" />
        }
      }
    </svg>
  `,
  styles: [':host { display: inline-flex }'],
})
export class CategoryIcon {
  readonly name = input.required<string>();
  readonly size = input<number>(24);
  readonly hue = computed(() => CATEGORY_HUES[this.name()] ?? 'var(--icon-stroke)');
}

/** Interface icons, built the same way and named on every icon-only control. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.width.px]="size()"
      [style.height.px]="size()"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('home') { <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /> }
        @case ('compass') {
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2 5-5 2 2-5z" />
        }
        @case ('calendar') {
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        }
        @case ('plus') { <path d="M12 5v14M5 12h14" /> }
        @case ('settings') {
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.8h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
        }
        @case ('chevron-right') { <path d="m9 5 7 7-7 7" /> }
        @case ('chevron-left') { <path d="m15 5-7 7 7 7" /> }
        @case ('chevron-down') { <path d="m5 9 7 7 7-7" /> }
        @case ('menu') { <path d="M4 7h16M4 12h16M4 17h16" /> }
        @case ('close') { <path d="m6 6 12 12M18 6 6 18" /> }
        @case ('copy') {
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        }
        @case ('ticket') {
          <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
          <path d="M12 8v1M12 12v1M12 16v1" />
        }
        @case ('check') { <path d="m5 12 5 5 9-11" /> }
        @case ('pin') {
          <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        }
        @case ('download') { <path d="M12 3v12M7 11l5 5 5-5M4 21h16" /> }
        @case ('search') {
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        }
        @case ('logout') { <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M11 8 7 12l4 4M7 12h11" /> }
        @case ('arrow-right') { <path d="M4 12h15M13 6l6 6-6 6" /> }
        @case ('users') {
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-1.8-4" />
        }
        @default { <circle cx="12" cy="12" r="9" /> }
      }
    </svg>
  `,
  styles: [':host { display: inline-flex }'],
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input<number>(20);
}

/** Avatars are generated from the display name, never a grey silhouette. */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="background()"
      [style.font-size.px]="size() * 0.42"
      [attr.title]="name()"
      aria-hidden="true"
      >{{ initial() }}</span
    >
  `,
  styles: [
    `
      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 100%;
        color: #ffffff;
        font-weight: 600;
        box-shadow: var(--hairline-inset);
        flex: 0 0 auto;
        user-select: none;
      }
    `,
  ],
})
export class Avatar {
  readonly name = input<string>('');
  readonly size = input<number>(32);

  private readonly h = computed(() => {
    const s = this.name() || '?';
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  });

  readonly initial = computed(() => (this.name().trim()[0] || '?').toUpperCase());

  readonly background = computed(() => {
    const hues = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff'];
    return hues[this.h() % hues.length];
  });
}

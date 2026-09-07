import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CATEGORY_HUES, CATEGORY_LABELS } from '../core/models';
import { avatarHue, initialsOf } from '../core/format';

/** The brand mark: a four-pointed star with concave sides, drawn from geometry. */
@Component({
  selector: 'app-brand',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lockup" [class.tinted]="tinted()">
      <svg viewBox="0 0 133 134" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M66.5 0c2.6 34.2 32.3 63.9 66.5 67-34.2 3.1-63.9 32.8-66.5 67-2.6-34.2-32.3-63.9-66.5-67C34.2 63.9 63.9 34.2 66.5 0Z"
        />
      </svg>
      @if (showWord()) {
        <span class="word">Deku</span>
      }
    </span>
  `,
  styles: [
    `
      .lockup {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
        color: inherit;
      }
      .lockup svg {
        position: relative;
        top: 2px;
        transform: translateY(-2px);
        flex: none;
      }
      .word {
        font-weight: 700;
        letter-spacing: -0.02em;
        font-size: 18px;
        line-height: 24px;
      }
      .tinted {
        color: var(--pink);
        transition: color 0.21s ease-out;
      }
      @media (hover: hover) {
        .tinted:hover {
          color: #d5176d;
        }
      }
    `,
  ],
})
export class BrandComponent {
  readonly size = input<number>(16);
  readonly showWord = input<boolean>(true);
  readonly tinted = input<boolean>(false);
}

/** Twelve category glyphs on a 24 grid, stroke 1.5, round caps, no fill. */
@Component({
  selector: 'app-category-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      [attr.stroke]="hue()"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      role="img"
      [attr.aria-label]="label()"
    >
      @switch (name()) {
        @case ('family') {
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M12 17.5s-3-1.9-3-3.8a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 1.9-3 3.8-3 3.8Z" />
        }
        @case ('books') {
          <rect x="3" y="4" width="7.5" height="16" rx="1" />
          <rect x="13.5" y="4" width="7.5" height="16" rx="1" />
          <path d="M10.5 8h3M10.5 16h3" />
        }
        @case ('games') {
          <path d="M12 3 21 8v8l-9 5-9-5V8z" />
          <path d="m3 8 9 5 9-5M12 13v8" />
        }
        @case ('tech') {
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="m9 10-2 2 2 2M15 10l2 2-2 2M13 9.5l-2 5" />
        }
        @case ('food-and-drink') {
          <path d="M3.5 12.5h17a8.5 8.5 0 0 1-8.5 7.5 8.5 8.5 0 0 1-8.5-7.5Z" />
          <path d="M9 8.5c1-1 1-2 0-3M14 8.5c1-1 1-2 0-3" />
        }
        @case ('ai') {
          <path d="M11 5.5A3 3 0 0 0 6 7.6 2.6 2.6 0 0 0 4.4 12 2.8 2.8 0 0 0 6.2 16.6 3 3 0 0 0 11 18.6z" />
          <path d="M13 5.5A3 3 0 0 1 18 7.6 2.6 2.6 0 0 1 19.6 12a2.8 2.8 0 0 1-1.8 4.6A3 3 0 0 1 13 18.6z" />
        }
        @case ('running') {
          <circle cx="14.5" cy="4.8" r="1.8" />
          <path d="m8 21 2.5-5 3-2-1-4.5-3.5 2L7 14" />
          <path d="m13.5 9.5 3.5 2 1.5 4M12.5 14l2.5 3 .5 4" />
        }
        @case ('arts-and-culture') {
          <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-1.8s-.7-1.2-.7-2c0-.8.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.6-4-8.8-9-8.8Z" />
          <circle cx="8" cy="9.5" r="1" />
          <circle cx="12" cy="7.5" r="1" />
          <circle cx="16" cy="9.5" r="1" />
          <circle cx="7.5" cy="14" r="1" />
        }
        @case ('climate') {
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8" />
          <path d="M12 3c4 4.5 4 13.5 0 18-4-4.5-4-13.5 0-18Z" />
        }
        @case ('fitness') {
          <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
        }
        @case ('wellness') {
          <path d="M12 4c2 2.5 2 5.5 0 8-2-2.5-2-5.5 0-8Z" />
          <path d="M12 12c-2.6-1.3-5.4-1-7.5.7 1.6 2.4 4.4 3.5 7.5 2.6" />
          <path d="M12 12c2.6-1.3 5.4-1 7.5.7-1.6 2.4-4.4 3.5-7.5 2.6" />
          <path d="M12 15.3V20" />
        }
        @case ('crypto') {
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8h4a2 2 0 0 1 0 4h-4h4a2 2 0 0 1 0 4h-4M11.5 6v12M14 6v12" />
        }
        @default {
          <circle cx="12" cy="12" r="9" />
        }
      }
    </svg>
  `,
  styles: [':host { display: inline-flex; }'],
})
export class CategoryIconComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(24);
  readonly hue = computed(() => CATEGORY_HUES[this.name()] ?? 'var(--icon-stroke)');
  readonly label = computed(() => CATEGORY_LABELS[this.name()] ?? this.name());
}

export type InterfaceIconName =
  | 'home'
  | 'calendar'
  | 'plus'
  | 'compass'
  | 'settings'
  | 'menu'
  | 'close'
  | 'chevron'
  | 'copy'
  | 'ticket'
  | 'download'
  | 'check'
  | 'arrow-right'
  | 'search'
  | 'users';

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        }
        @case ('calendar') {
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('compass') {
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2 5-5 2 2-5z" />
        }
        @case ('settings') {
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
        }
        @case ('menu') {
          <path d="M4 7h16M4 12h16M4 17h16" />
        }
        @case ('close') {
          <path d="M6 6l12 12M18 6 6 18" />
        }
        @case ('chevron') {
          <path d="m9 5 7 7-7 7" />
        }
        @case ('copy') {
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        }
        @case ('ticket') {
          <path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 3.9v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-3.9z" />
          <path d="M14 6.5v11" stroke-dasharray="2 2" />
        }
        @case ('download') {
          <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" />
        }
        @case ('check') {
          <path d="m5 12.5 4.5 4.5L19 7" />
        }
        @case ('arrow-right') {
          <path d="M4 12h15M13 6l6 6-6 6" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20a6 6 0 0 1 12 0M16.5 5.2a3.2 3.2 0 0 1 0 5.6M17 14.4A6 6 0 0 1 21 20" />
        }
      }
    </svg>
  `,
  styles: [':host { display: inline-flex; }'],
})
export class IconComponent {
  readonly name = input.required<InterfaceIconName>();
  readonly size = input<number>(20);
}

/** No grey silhouettes: an avatar is the initial on its own generated hue. */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="avatar" [style.width.px]="size()" [style.height.px]="size()" [style.background]="hue()" [attr.title]="name()">
      <span class="sr-only">{{ name() }}</span>
      <span aria-hidden="true" [style.font-size.px]="size() * 0.42">{{ initial() }}</span>
    </span>
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
        flex: none;
      }
    `,
  ],
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(24);
  readonly initial = computed(() => initialsOf(this.name()));
  readonly hue = computed(() => avatarHue(this.name()));
}

/** The one spinner in the product, for a control that is working. */
@Component({
  selector: 'app-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="rotator" [attr.width]="size()" [attr.height]="size()" viewBox="0 0 66 66" aria-hidden="true">
      <circle class="path" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" cx="33" cy="33" r="30" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .rotator {
        animation: rotator 1.4s linear infinite;
      }
      .path {
        stroke-dasharray: 187;
        stroke-dashoffset: 0;
        transform-origin: center;
        animation: dash 1.4s ease-in-out infinite;
      }
    `,
  ],
})
export class SpinnerComponent {
  readonly size = input<number>(20);
}

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';

/**
 * Every symbol is drawn from geometry, never an icon font and never an image
 * file, so it stays sharp at any size and can be recoloured on the fly.
 * The twelve category glyphs sit on a 24 grid at stroke 1.5 with round caps
 * and joins and no fill, each in its assigned hue.
 */
export const CATEGORY_HUES: Record<string, string> = {
  family: '#f31a7c',
  books: '#146aeb',
  games: '#ab46dd',
  tech: '#3cbd2c',
  'food-and-drink': '#d69712',
  ai: '#ab46dd',
  running: '#3cbd2c',
  'arts-and-culture': '#f31a7c',
  climate: '#3cbd2c',
  fitness: '#146aeb',
  wellness: '#ab46dd',
  crypto: '#d69712',
};

@Component({
  selector: 'app-category-icon',
  standalone: true,
  imports: [NgSwitch, NgSwitchCase, NgSwitchDefault],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      [attr.stroke]="hue"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      role="img"
      [attr.aria-label]="label"
      [ngSwitch]="category"
    >
      <ng-container *ngSwitchCase="'family'">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        <path d="M12 17.5s-2.6-1.8-2.6-3.4a1.5 1.5 0 0 1 2.6-1 1.5 1.5 0 0 1 2.6 1c0 1.6-2.6 3.4-2.6 3.4z" />
      </ng-container>
      <ng-container *ngSwitchCase="'books'">
        <path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z" />
        <path d="M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" />
        <path d="M12 7v12" />
      </ng-container>
      <ng-container *ngSwitchCase="'games'">
        <path d="M12 3 21 8v8l-9 5-9-5V8z" />
        <path d="M12 12 21 8M12 12v9M12 12 3 8" />
      </ng-container>
      <ng-container *ngSwitchCase="'tech'">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M9.5 10 7 12.5 9.5 15M14.5 10 17 12.5 14.5 15" />
      </ng-container>
      <ng-container *ngSwitchCase="'food-and-drink'">
        <path d="M4 12h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8z" />
        <path d="M9 8c0-1.2 1-1.6 1-2.6S9 4 9 4M14 8c0-1.2 1-1.6 1-2.6S14 4 14 4" />
      </ng-container>
      <ng-container *ngSwitchCase="'ai'">
        <path d="M12 5.5A3 3 0 0 0 6.5 7 3 3 0 0 0 5 12a3 3 0 0 0 1.5 5 3 3 0 0 0 5.5 1.5z" />
        <path d="M12 5.5A3 3 0 0 1 17.5 7 3 3 0 0 1 19 12a3 3 0 0 1-1.5 5 3 3 0 0 1-5.5 1.5z" />
        <path d="M12 5.5v13" />
      </ng-container>
      <ng-container *ngSwitchCase="'running'">
        <circle cx="14.5" cy="4.75" r="1.75" />
        <path d="M13 9.5 9 12l1.5 3.5L8 21" />
        <path d="M13 9.5 16 12l1 4M13 9.5 9.5 8 6 9.5" />
      </ng-container>
      <ng-container *ngSwitchCase="'arts-and-culture'">
        <path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6 0 2.6-2.1 3.9-4 3.9h-1.4c-1.2 0-2 .9-2 1.9 0 .5.2.9.5 1.3.3.4.4.7.4 1.1 0 .7-.6 1.2-1.6 1.2-4.7 0-8.9-3.6-8.9-8.4S7.3 3.5 12 3.5z" />
        <circle cx="8.5" cy="9.5" r="0.9" />
        <circle cx="12" cy="7.5" r="0.9" />
        <circle cx="15.5" cy="9" r="0.9" />
        <circle cx="8" cy="14" r="0.9" />
      </ng-container>
      <ng-container *ngSwitchCase="'climate'">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.8 10.5h16.4M5.5 16.5h13" />
        <path d="M12 20.5c3-3.4 3-13.6 0-17" />
        <path d="M15.5 6.5c2 .4 3.4 2.2 3 4.5-2.3.4-4-1-4.2-3z" />
      </ng-container>
      <ng-container *ngSwitchCase="'fitness'">
        <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />
      </ng-container>
      <ng-container *ngSwitchCase="'wellness'">
        <path d="M12 20c0-4 2-7 5.5-8.5C17 15.5 15 19 12 20z" />
        <path d="M12 20c0-4-2-7-5.5-8.5C7 15.5 9 19 12 20z" />
        <path d="M12 20c-1.5-3.5-1.5-7 0-10.5 1.5 3.5 1.5 7 0 10.5z" />
        <path d="M12 20c1-3.6 3.6-6 7-6.6M12 20c-1-3.6-3.6-6-7-6.6" />
      </ng-container>
      <ng-container *ngSwitchCase="'crypto'">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.5 8.5h4a2.25 2.25 0 0 1 0 4.5h-4M9.5 13h4.2a2.25 2.25 0 0 1 0 4.5H9.5M9.5 8.5v9M11.5 6.5v2M11.5 17.5v2" />
      </ng-container>
      <ng-container *ngSwitchDefault>
        <circle cx="12" cy="12" r="8.5" />
      </ng-container>
    </svg>
  `,
})
export class CategoryIconComponent {
  @Input() category = '';
  @Input() size = 24;
  @Input() label = '';

  get hue() {
    return CATEGORY_HUES[this.category] ?? 'currentColor';
  }
}

/**
 * The brand mark: a four-pointed star with concave sides on the coordinate box
 * 0 0 133 134, filled with the current text colour, drawn from geometry rather
 * than an image file.
 */
@Component({
  selector: 'app-brand-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size * (134 / 133)"
      viewBox="0 0 133 134"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M66.5 0C68.6 35.4 97.9 64.9 133 67c-35.1 2.1-64.4 31.6-66.5 67-2.1-35.4-31.4-64.9-66.5-67C35.1 64.9 64.4 35.4 66.5 0z"
      />
    </svg>
  `,
})
export class BrandMarkComponent {
  @Input() size = 20;
}

/** Interface icons, built the same way as the category glyphs. */
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [NgSwitch, NgSwitchCase, NgSwitchDefault],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [ngSwitch]="name"
    >
      <ng-container *ngSwitchCase="'home'">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      </ng-container>
      <ng-container *ngSwitchCase="'compass'">
        <circle cx="12" cy="12" r="8.5" />
        <path d="m15.5 8.5-2 5-5 2 2-5z" />
      </ng-container>
      <ng-container *ngSwitchCase="'calendar'">
        <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      </ng-container>
      <ng-container *ngSwitchCase="'plus'">
        <path d="M12 5.5v13M5.5 12h13" />
      </ng-container>
      <ng-container *ngSwitchCase="'settings'">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
      </ng-container>
      <ng-container *ngSwitchCase="'chevron-right'">
        <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
      </ng-container>
      <ng-container *ngSwitchCase="'chevron-left'">
        <path d="M14.5 5.5 8 12l6.5 6.5" />
      </ng-container>
      <ng-container *ngSwitchCase="'arrow-right'">
        <path d="M4.5 12h15M13.5 6l6 6-6 6" />
      </ng-container>
      <ng-container *ngSwitchCase="'close'">
        <path d="M6 6l12 12M18 6 6 18" />
      </ng-container>
      <ng-container *ngSwitchCase="'menu'">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </ng-container>
      <ng-container *ngSwitchCase="'copy'">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
      </ng-container>
      <ng-container *ngSwitchCase="'download'">
        <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
      </ng-container>
      <ng-container *ngSwitchCase="'check'">
        <path d="m5 12.5 4.5 4.5L19 7" />
      </ng-container>
      <ng-container *ngSwitchCase="'pin'">
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </ng-container>
      <ng-container *ngSwitchCase="'ticket'">
        <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5V14a2 2 0 0 0 0-4z" />
        <path d="M13 7v10" stroke-dasharray="2 2" />
      </ng-container>
      <ng-container *ngSwitchCase="'clock'">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5.2l3.2 2" />
      </ng-container>
      <ng-container *ngSwitchDefault>
        <circle cx="12" cy="12" r="8.5" />
      </ng-container>
    </svg>
  `,
})
export class IconComponent {
  @Input() name = '';
  @Input() size = 20;
}

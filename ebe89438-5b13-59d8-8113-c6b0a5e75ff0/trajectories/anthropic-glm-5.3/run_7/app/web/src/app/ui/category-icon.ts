import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Every symbol is drawn from geometry, never an icon font, never an image. */
const GLYPHS: Record<string, string> = {
  family: 'M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-4.5h4V20M12 9.2c.9 0 1.6.7 1.6 1.6S12.9 12.4 12 12.4s-1.6-.7-1.6-1.6S11.1 9.2 12 9.2Z',
  books: 'M4.5 4.5h5.5v15H4.5zM14 4.5h5.5v15H14zM10 4.5v15M14 4.5v15',
  games: 'M12 3.2 20.2 7.9v8.4L12 21l-8.2-4.7V7.9L12 3.2ZM3.8 7.9 12 12.6l8.2-4.7M12 12.6V21',
  tech: 'M4 6.5h16v11H4zM9.4 10 7.2 12l2.2 2M14.6 10l2.2 2-2.2 2M13 9.4l-2 5.2',
  'food-and-drink': 'M4.5 13.5h15a7.5 6.5 0 0 1-15 0ZM8 10.5c0-2 1-2 1-4M12 10.5c0-2 1-2 1-4M16 10.5c0-2 1-2 1-4',
  ai: 'M9.4 5.2C6.6 5.7 4.6 8 4.6 10.8c0 3.1 2.5 5.7 5.6 5.7 1 0 1.8.8 1.8 1.8 0-1 .8-1.8 1.8-1.8 3.1 0 5.6-2.6 5.6-5.7 0-2.8-2-5.1-4.8-5.6M9.4 5.2c.9 1.6 1.5 3.4 1.5 5.6 0 2.2-.6 4-1.5 5.6M14.6 5.2c-.9 1.6-1.5 3.4-1.5 5.6 0 2.2.6 4 1.5 5.6',
  running: 'M14.5 4.6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM9.5 8.6 6 11.2l1.5 2.2M9.5 8.6l4-.3 1.6 3.2 3.4 1.2M11 15.4l-2.4 3.6M13.5 11.5l-2.5 3.9 2 3.6',
  'arts-and-culture': 'M12 4.2c5 0 8.4 3.1 8.4 7 0 3.9-3.4 6.6-7.4 6.6-1.4 0-2.6-.5-3.4-1.4-1.2 1.1-2.9 1-4-.1-1.2-1.2-1.2-3.1.1-4.3M7.4 8.2h.01M11 6.6h.01M14.8 7.6h.01M16.4 11.2h.01',
  climate: 'M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6ZM4.4 12h15.2M12 4.2c-2.4 2.2-3.6 4.9-3.6 7.8s1.2 5.6 3.6 7.8M12 4.2c2.4 2.2 3.6 4.9 3.6 7.8s-1.2 5.6-3.6 7.8M14.6 9c-2.6 0-4 1.2-4 2.8 0 1.4 1 2 2.2 2.3.9.2 1.4.6 1.4 1.2 0 .8-.8 1.3-2 1.3',
  fitness: 'M3 9.5v5M5.5 7.5v9M8.5 10.5h7M18.5 7.5v9M21 9.5v5M8.5 9v6M15.5 9v6',
  wellness: 'M12 4.5c1.9 0 3 1.4 3 2.9 0 1.6-1.1 2.9-3 2.9S9 9 9 7.4c0-1.5 1.1-2.9 3-2.9ZM6.2 9.4c1.9 0 3 1.3 3 2.9 0 1.5-1.1 2.8-3 2.8s-3-1.3-3-2.8c0-1.6 1.1-2.9 3-2.9ZM17.8 9.4c1.9 0 3 1.3 3 2.9 0 1.5-1.1 2.8-3 2.8s-3-1.3-3-2.8c0-1.6 1.1-2.9 3-2.9ZM12 11.6c1.6 0 2.8 1.2 2.8 2.8 0 2.6-1.4 4.6-2.8 4.6s-2.8-2-2.8-4.6c0-1.6 1.2-2.8 2.8-2.8Z',
  crypto: 'M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6ZM10 8.4h3.2a1.6 1.6 0 0 1 0 3.2H10zM10 11.6h3.6a1.7 1.7 0 0 1 0 3.4H10zM11 7v8.4M13 7v8.4',
};

@Component({
  selector: 'app-category-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 24 24'" [attr.width]="size()" [attr.height]="size()"
         fill="none" stroke="currentColor" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round"
         [attr.aria-hidden]="label() ? null : 'true'"
         [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null">
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: [':host{display:inline-flex;line-height:0}'],
})
export class CategoryIconComponent {
  name = input.required<string>();
  size = input(24);
  label = input<string | undefined>(undefined);
  path() { return GLYPHS[this.name()] ?? GLYPHS['books']; }
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { CATEGORY_HUES } from '../core/models';

export type IconName =
  | 'family'
  | 'books'
  | 'games'
  | 'tech'
  | 'food-and-drink'
  | 'ai'
  | 'running'
  | 'arts-and-culture'
  | 'climate'
  | 'fitness'
  | 'wellness'
  | 'crypto'
  | 'home'
  | 'compass'
  | 'calendar'
  | 'plus'
  | 'settings'
  | 'ticket'
  | 'users'
  | 'sliders'
  | 'gauge'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'arrow-right'
  | 'copy'
  | 'download'
  | 'close'
  | 'menu'
  | 'check'
  | 'pin'
  | 'clock'
  | 'search'
  | 'logout';

/**
 * Every symbol is drawn from geometry on a 24 grid at stroke 1.5 with round
 * caps and joins and no fill, never an icon font and never an image file, so it
 * stays sharp at any size and can be recoloured on the fly.
 */
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
      [attr.stroke]="stroke()"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [innerHTML]="markup()"
    ></svg>
  `,
  styles: [':host { display: inline-flex; line-height: 0; }'],
})
export class IconComponent {
  private sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly label = input<string | null>(null);
  readonly colour = input<string | null>(null);

  readonly stroke = computed(() => this.colour() ?? CATEGORY_HUES[this.name()] ?? 'currentColor');

  // The geometry is a fixed constant table in this file; nothing untrusted is
  // ever inlined here.
  readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(PATHS[this.name()] ?? ''),
  );
}

const PATHS: Record<IconName, string> = {
  // The twelve category glyphs.
  family:
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V20h14V9.8"/><path d="M12 17.4s-2.6-1.7-2.6-3.3a1.5 1.5 0 0 1 2.6-1 1.5 1.5 0 0 1 2.6 1c0 1.6-2.6 3.3-2.6 3.3Z"/>',
  books:
    '<rect x="3" y="4" width="7.5" height="16" rx="1"/><rect x="13.5" y="4" width="7.5" height="16" rx="1"/><path d="M10.5 7.5h3M10.5 16.5h3M12 4v16"/>',
  games:
    '<path d="M12 3 21 8v8l-9 5-9-5V8l9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  tech:
    '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M9.5 10 7 12l2.5 2"/><path d="M14.5 10 17 12l-2.5 2"/>',
  'food-and-drink':
    '<path d="M4 12h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8Z"/><path d="M9 8c0-1.4 1-1.8 1-3S9 3.4 9 3"/><path d="M14.5 8c0-1.4 1-1.8 1-3s-1-1.6-1-2"/>',
  ai: '<path d="M11 5a2.6 2.6 0 0 0-4.6 1.6A2.5 2.5 0 0 0 4.5 9a2.5 2.5 0 0 0 .8 1.8A2.6 2.6 0 0 0 5 13a2.6 2.6 0 0 0 1.6 2.4A2.5 2.5 0 0 0 11 19Z"/><path d="M13 5a2.6 2.6 0 0 1 4.6 1.6A2.5 2.5 0 0 1 19.5 9a2.5 2.5 0 0 1-.8 1.8A2.6 2.6 0 0 1 19 13a2.6 2.6 0 0 1-1.6 2.4A2.5 2.5 0 0 1 13 19Z"/>',
  running:
    '<circle cx="15.5" cy="4.75" r="1.75"/><path d="M13.6 9 10 11.4 8 15"/><path d="M13.6 9l2.6 1.4.8 3.2"/><path d="M17 13.6 15 21"/><path d="m10.6 11.9-.8 3.4L6 18.5"/>',
  'arts-and-culture':
    '<path d="M12 3.2c-5 0-8.8 3.6-8.8 8.2 0 4.5 3.6 7.4 7.4 7.4 1.8 0 2.3-1.1 1.8-2-.5-1 .2-2 1.4-2h2c2.8 0 4.9-2 4.9-4.5 0-4-3.9-7.1-8.7-7.1Z"/><circle cx="7.9" cy="11.2" r="1"/><circle cx="10.6" cy="7.6" r="1"/><circle cx="14.6" cy="7.6" r="1"/><circle cx="17.3" cy="10.8" r="1"/>',
  climate:
    '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/><path d="M12 3.4a13 13 0 0 1 0 17.2 13 13 0 0 1 0-17.2Z"/><path d="M15.4 14.6c2.2.4 3.6-.9 4-3.2-2.4-.5-3.8.8-4 3.2Z"/>',
  fitness:
    '<path d="M6.5 9v6M4 10.5v3M17.5 9v6M20 10.5v3"/><path d="M6.5 12h11"/>',
  wellness:
    '<path d="M12 4c1.9 1.9 1.9 5.5 0 7.4-1.9-1.9-1.9-5.5 0-7.4Z"/><path d="M12 11.4c1.9-1.9 5.5-1.9 7.4 0-1.9 1.9-5.5 1.9-7.4 0Z"/><path d="M12 11.4c-1.9-1.9-5.5-1.9-7.4 0 1.9 1.9 5.5 1.9 7.4 0Z"/><path d="M12 11.4c1.4 1.4 1.9 4 1.1 6.3-2.3-.8-3.6-2.9-3.6-4.9"/><path d="M12 11.4c-1.4 1.4-1.9 4-1.1 6.3"/>',
  crypto:
    '<circle cx="12" cy="12" r="8.6"/><path d="M10 8.4h3.4a2 2 0 0 1 0 4H10Zm0 4h3.7a2 2 0 0 1 0 4H10Z"/><path d="M11.2 6.6v11M13.6 6.6v11"/>',

  // Interface icons follow the same construction.
  home: '<path d="M3 10.6 12 3.4l9 7.2"/><path d="M5.2 9.4V20h13.6V9.4"/><path d="M9.8 20v-5.4h4.4V20"/>',
  compass: '<circle cx="12" cy="12" r="8.6"/><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5Z"/>',
  calendar:
    '<rect x="3.4" y="5" width="17.2" height="15.6" rx="2.4"/><path d="M3.4 9.6h17.2M8.2 3.4v3.6M15.8 3.4v3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6"/>',
  ticket:
    '<path d="M4 8.4A2.4 2.4 0 0 1 6.4 6h11.2A2.4 2.4 0 0 1 20 8.4v1.4a2.2 2.2 0 0 0 0 4.4v1.4a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 15.6v-1.4a2.2 2.2 0 0 0 0-4.4Z"/><path d="M13.6 6v12" stroke-dasharray="2 2.4"/>',
  users:
    '<circle cx="9.2" cy="8.4" r="3.2"/><path d="M3.4 19.4a5.8 5.8 0 0 1 11.6 0"/><path d="M15.4 5.6a3.2 3.2 0 0 1 0 6"/><path d="M16.8 14.2a5.8 5.8 0 0 1 3.8 5.2"/>',
  sliders:
    '<path d="M4 7.4h10M18 7.4h2M4 16.6h4M12 16.6h8"/><circle cx="16" cy="7.4" r="2"/><circle cx="10" cy="16.6" r="2"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 12 3.6-3"/><circle cx="12" cy="17" r="1.2"/>',
  'chevron-right': '<path d="m9.5 5.5 6.4 6.5-6.4 6.5"/>',
  'chevron-left': '<path d="m14.5 5.5-6.4 6.5 6.4 6.5"/>',
  'chevron-down': '<path d="m5.5 9.5 6.5 6.4 6.5-6.4"/>',
  'arrow-right': '<path d="M4.5 12h15"/><path d="m13.4 6 6 6-6 6"/>',
  copy:
    '<rect x="8.6" y="8.6" width="11.4" height="11.4" rx="2.2"/><path d="M15.4 8.6V6.2A2.2 2.2 0 0 0 13.2 4H6.2A2.2 2.2 0 0 0 4 6.2v7a2.2 2.2 0 0 0 2.2 2.2h2.4"/>',
  download: '<path d="M12 3.6v11.2"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M4.4 19.4h15.2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12.6 4.6 4.6L19 6.8"/>',
  pin: '<path d="M12 21s6.4-5.6 6.4-10.2A6.4 6.4 0 0 0 5.6 10.8C5.6 15.4 12 21 12 21Z"/><circle cx="12" cy="10.6" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7v5.2l3.4 2"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="m15.6 15.6 4 4"/>',
  logout: '<path d="M9.4 4.4H6.2A2.2 2.2 0 0 0 4 6.6v10.8a2.2 2.2 0 0 0 2.2 2.2h3.2"/><path d="M15 8.2 19 12l-4 3.8"/><path d="M19 12H9.8"/>',
};

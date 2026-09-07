import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CATEGORY_HUES, CATEGORY_LABELS } from '../core/models';

/**
 * Every symbol is drawn from geometry on a 24 grid at stroke 1.5 with round
 * caps and joins and no fill, never an icon font and never an image file, so it
 * stays sharp at any size and can be recoloured on the fly.
 */
const PATHS: Record<string, string> = {
  // Twelve category glyphs
  family:
    '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M12 16.4c-1.6-1.2-2.6-2-2.6-3a1.4 1.4 0 0 1 2.6-.75A1.4 1.4 0 0 1 14.6 13.4c0 1-1 1.8-2.6 3z"/>',
  books:
    '<rect x="3" y="5" width="7.5" height="14" rx="1"/><rect x="13.5" y="5" width="7.5" height="14" rx="1"/><path d="M10.5 8.5h3M10.5 15.5h3"/>',
  games: '<path d="M12 3.2 20.5 8v8L12 20.8 3.5 16V8z"/><path d="M3.5 8 12 12.6 20.5 8M12 12.6v8.2"/>',
  tech: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2"/>',
  'food-and-drink':
    '<path d="M3.5 12.5h17a8.5 8.5 0 0 1-8.5 7 8.5 8.5 0 0 1-8.5-7z"/><path d="M9 8.5c-1-1 .6-1.8 0-3M14 8.5c-1-1 .6-1.8 0-3"/>',
  ai: '<path d="M11 5.5a2.6 2.6 0 0 0-4.6 1.7A2.5 2.5 0 0 0 4.6 11a2.6 2.6 0 0 0 .9 4 2.5 2.5 0 0 0 2.6 3.4c.7.8 1.9 1 2.9.4z"/><path d="M13 5.5a2.6 2.6 0 0 1 4.6 1.7A2.5 2.5 0 0 1 19.4 11a2.6 2.6 0 0 1-.9 4 2.5 2.5 0 0 1-2.6 3.4c-.7.8-1.9 1-2.9.4z"/>',
  running:
    '<circle cx="14.5" cy="4.8" r="1.8"/><path d="m8 20.5 2.6-4.4-2.3-2.6.9-4.3 3.4-1.4 2.4 2.6 3 1"/><path d="m10.3 11.2-4 1.3M13.6 13.5 15.4 17l1.6 3.5"/>',
  'arts-and-culture':
    '<path d="M12 3.5c-4.7 0-8.5 3.6-8.5 8s3.8 7.2 8.5 7.2c1.3 0 1.9-.9 1.9-1.8 0-1.4-1.2-1.7-1.2-2.8 0-.9.8-1.5 1.9-1.5h1.4c3 0 4.5-1.6 4.5-4.1 0-3-3.5-5-8.5-5z"/><circle cx="7.6" cy="10.4" r=".9"/><circle cx="11" cy="7.6" r=".9"/><circle cx="15" cy="8.4" r=".9"/><circle cx="7.8" cy="14.4" r=".9"/>',
  climate:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
  fitness:
    '<path d="M4 9.5v5M7 7.5v9M17 7.5v9M20 9.5v5M7 12h10"/>',
  wellness:
    '<path d="M12 20.5c0-4 1.8-7 3.6-9M12 20.5c0-4-1.8-7-3.6-9M12 20.5V9M12 20.5c-2.4-1-4.6-1.6-7.4-1.8M12 20.5c2.4-1 4.6-1.6 7.4-1.8"/><path d="M12 9c1.4-1.8 1.4-4 0-5.5C10.6 5 10.6 7.2 12 9z"/>',
  crypto: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 8.5h4a2.5 2.5 0 0 1 0 5h-4M9.5 13.5h5M11.5 6.5v11"/>',

  // Interface icons
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  'chevron-left': '<path d="m15 5-7 7 7 7"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M15 5.5A2 2 0 0 0 13 3.5H5.5a2 2 0 0 0-2 2V13a2 2 0 0 0 2 2"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>',
  location: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  ticket:
    '<path d="M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.7a2 2 0 0 0 0 3.6v1.7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.7a2 2 0 0 0 0-3.6z"/><path d="M14 7v10"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 6.2a3.2 3.2 0 0 1 0 6M17.5 14.6a5.5 5.5 0 0 1 3 4.9"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  logout: '<path d="M15 5H6.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H15M11 12h9M16.5 8l3.5 4-3.5 4"/>',
};

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
      [attr.stroke]="hue()"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [innerHTML]="markup()"
    ></svg>
  `,
  styles: [':host{display:inline-flex;line-height:0}'],
})
export class IconComponent {
  private sanitizer = inject(DomSanitizer);

  name = input.required<string>();
  size = input<number>(20);
  color = input<string>('');

  readonly hue = computed(() => this.color() || 'currentColor');

  /** The geometry is a constant in this file, never anything a visitor typed. */
  readonly markup = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(PATHS[this.name()] ?? PATHS['compass']!),
  );
}

export function categoryHue(name: string): string {
  return CATEGORY_HUES[name] ?? '#48484a';
}

export function categoryLabel(name: string): string {
  return CATEGORY_LABELS[name] ?? name;
}

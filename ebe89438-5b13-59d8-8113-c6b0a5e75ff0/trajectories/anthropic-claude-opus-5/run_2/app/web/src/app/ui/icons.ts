import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CATEGORY_HUES } from '../core/models';

/**
 * Every symbol is drawn from geometry, never an icon font and never an image
 * file. The twelve category glyphs sit on a 24 grid at stroke 1.5 with round
 * caps and joins and no fill, each in its assigned hue.
 */
const CATEGORY_PATHS: Record<string, string> = {
  // a house pentagon with a heart
  family:
    '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M12 17.5c-1.6-1.2-2.8-2.1-2.8-3.3a1.5 1.5 0 0 1 2.8-.8 1.5 1.5 0 0 1 2.8.8c0 1.2-1.2 2.1-2.8 3.3z"/>',
  // two rectangles joined by a spine
  books:
    '<path d="M12 6.5C10.6 5.2 8.8 4.6 6 4.6a1 1 0 0 0-1 1V18a1 1 0 0 0 1 1c2.8 0 4.6.6 6 1.9"/><path d="M12 6.5c1.4-1.3 3.2-1.9 6-1.9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1c-2.8 0-4.6.6-6 1.9z"/><path d="M12 6.5v14.4"/>',
  // an isometric cube
  games:
    '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5"/><path d="M12 12v9"/>',
  // a rounded rectangle holding an angle-bracket glyph
  tech: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m9.5 10-2 2 2 2"/><path d="m14.5 10 2 2-2 2"/>',
  // a bowl arc with two steam curves
  'food-and-drink':
    '<path d="M3.5 13h17a8.5 8.5 0 0 1-17 0z"/><path d="M9.5 4.5c-.8 1 .8 1.9 0 2.9"/><path d="M14.5 4.5c-.8 1 .8 1.9 0 2.9"/>',
  // two mirrored brain lobes
  ai: '<path d="M12 5.2A3 3 0 0 0 6.6 7a3 3 0 0 0-1.4 5.2A3 3 0 0 0 7 17.6a3 3 0 0 0 5 1.2z"/><path d="M12 5.2A3 3 0 0 1 17.4 7a3 3 0 0 1 1.4 5.2A3 3 0 0 1 17 17.6a3 3 0 0 1-5 1.2z"/><path d="M12 5.2v13.6"/>',
  // a figure mid-stride
  running:
    '<circle cx="15.5" cy="5" r="1.6"/><path d="m8 21 2.6-4.7-2.1-3.2.9-4.4 3.6-1.4 2.6 2.4 2.9.9"/><path d="m11.2 12.6-3.9.6-1.8 2.6"/><path d="m13 16.3 2.8 1.2 1.3 3.5"/>',
  // a palette ellipse with four holes
  'arts-and-culture':
    '<path d="M12 3.5c-4.7 0-8.5 3.5-8.5 7.8 0 4.4 3.6 6.4 6 6.4 1.6 0 1.6 1.3 1.1 2.1-.4.7.2 1.4 1 1.3 4.6-.5 8.9-4.2 8.9-9.4 0-4.6-3.8-8.2-8.5-8.2z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.6" r="1"/><circle cx="16" cy="10" r="1"/><circle cx="16.4" cy="14" r="1"/>',
  // a globe with a leaf
  climate:
    '<circle cx="11.5" cy="12" r="7.8"/><path d="M3.8 12h15.4"/><path d="M11.5 4.2c2.1 2.2 3.2 5 3.2 7.8s-1.1 5.6-3.2 7.8c-2.1-2.2-3.2-5-3.2-7.8s1.1-5.6 3.2-7.8z"/><path d="M18 8.4c1.4-1.4 3.4-1.7 3.4-1.7s.1 2.2-1.3 3.6"/>',
  // a dumbbell
  fitness:
    '<path d="M4 9.5v5"/><path d="M20 9.5v5"/><rect x="6" y="7.5" width="3" height="9" rx="1"/><rect x="15" y="7.5" width="3" height="9" rx="1"/><path d="M9 12h6"/>',
  // a five-petal lotus
  wellness:
    '<path d="M12 20.2c-4.2 0-7.6-2.4-7.6-4.3 0-.9 1-1.6 2.5-1.9"/><path d="M12 20.2c4.2 0 7.6-2.4 7.6-4.3 0-.9-1-1.6-2.5-1.9"/><path d="M12 20.2c-2.4-1.9-3.8-4.4-3.8-7 0-2.4 1.4-4.6 3.8-6.4 2.4 1.8 3.8 4 3.8 6.4 0 2.6-1.4 5.1-3.8 7z"/><path d="M8.2 13.2c-1.4-1-2.9-1.4-4-1.2"/><path d="M15.8 13.2c1.4-1 2.9-1.4 4-1.2"/>',
  // a circle with a currency mark
  crypto:
    '<circle cx="12" cy="12" r="8.2"/><path d="M10 8.2h3.4a2 2 0 0 1 0 4H10zm0 4h3.8a2 2 0 0 1 0 4H10zm0-4v7.9"/><path d="M11.4 6.6v1.6M11.4 15.8v1.6"/>',
};

const UI_PATHS: Record<string, string> = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  discover: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3.5v3M16 3.5v3"/>',
  create: '<path d="M12 5v14M5 12h14"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>',
  ticket:
    '<path d="M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V10a2 2 0 0 0 0 4v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14a2 2 0 0 0 0-4z"/><path d="M13 6.5v11"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9"/>',
  check: '<path d="m5 12.5 5 5 9-11"/>',
  location:
    '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M17.5 14.6a5.5 5.5 0 0 1 3 5.4"/>',
  door: '<path d="M14.5 3.5H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h8.5"/><path d="M11 12h9.5"/><path d="m17.5 8.5 3.5 3.5-3.5 3.5"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M4.5 20h15"/>',
  arrow: '<path d="M5 12h13"/><path d="m12.5 6 6 6-6 6"/>',
  logout:
    '<path d="M14.5 3.5H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h8.5"/><path d="M11 12h10"/><path d="m17.5 8.5 3.5 3.5-3.5 3.5"/>',
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
      [attr.stroke]="stroke()"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [innerHTML]="paths()"
    ></svg>
  `,
  styles: [':host { display: inline-flex; flex: none; }'],
})
export class IconComponent {
  /* The markup is a fixed literal from the tables above, never visitor input. */
  private sanitizer = inject(DomSanitizer);

  readonly name = input.required<string>();
  readonly size = input<number>(24);
  readonly hue = input<string>('');

  readonly stroke = computed(
    () => this.hue() || CATEGORY_HUES[this.name()] || 'currentColor',
  );

  readonly paths = computed<SafeHtml>(() => {
    const key = this.name();
    return this.sanitizer.bypassSecurityTrustHtml(
      CATEGORY_PATHS[key] || UI_PATHS[key] || UI_PATHS['discover'],
    );
  });
}

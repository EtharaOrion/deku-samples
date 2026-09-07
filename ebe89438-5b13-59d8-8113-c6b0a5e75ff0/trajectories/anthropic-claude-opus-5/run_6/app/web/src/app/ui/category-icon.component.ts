import { Component, Input } from '@angular/core';
import { CATEGORY_HUES, CATEGORY_LABELS } from '../core/models';

/**
 * The twelve category glyphs, on a 24 grid at stroke 1.5 with round caps and
 * joins and no fill, each in its assigned hue. Drawn from geometry, never an
 * icon font and never an image file.
 */
@Component({
  selector: 'app-category-icon',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
         [style.color]="hue" stroke="currentColor" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round"
         role="img" [attr.aria-label]="label">
      <title>{{ label }}</title>
      @switch (name) {
        @case ('family') {
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" />
          <path d="M12 17.5s-2.8-1.9-2.8-3.6a1.6 1.6 0 0 1 2.8-1 1.6 1.6 0 0 1 2.8 1c0 1.7-2.8 3.6-2.8 3.6Z" />
        }
        @case ('books') {
          <rect x="3" y="4" width="7.5" height="16" rx="1" />
          <rect x="13.5" y="4" width="7.5" height="16" rx="1" />
          <path d="M10.5 8h3M10.5 16h3" />
        }
        @case ('games') {
          <path d="M12 3 21 8v8l-9 5-9-5V8l9-5Z" />
          <path d="M3 8l9 5 9-5M12 13v8" />
        }
        @case ('tech') {
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M9.5 10 7 12l2.5 2M14.5 10 17 12l-2.5 2" />
        }
        @case ('food-and-drink') {
          <path d="M3.5 12h17a8.5 8.5 0 0 1-8.5 8 8.5 8.5 0 0 1-8.5-8Z" />
          <path d="M9 3c-1 1.2-1 2.3 0 3.5S10 9 9 9.5M15 3c-1 1.2-1 2.3 0 3.5s0 2.5-1 3" />
        }
        @case ('ai') {
          <path d="M11 5.5A3 3 0 0 0 5.5 7 2.6 2.6 0 0 0 4 9.4a2.7 2.7 0 0 0 .8 2A2.8 2.8 0 0 0 5 15a3 3 0 0 0 6 1.2Z" />
          <path d="M13 5.5A3 3 0 0 1 18.5 7 2.6 2.6 0 0 1 20 9.4a2.7 2.7 0 0 1-.8 2A2.8 2.8 0 0 1 19 15a3 3 0 0 1-6 1.2Z" />
          <path d="M12 5v14" />
        }
        @case ('running') {
          <circle cx="15" cy="4.5" r="1.8" />
          <path d="M8 21l2.8-5 2.2-2.2-1-4.3-3 2.2-1.5 3" />
          <path d="M13 9.5 16.5 12l1.5 4M13.5 13.5 16 21" />
        }
        @case ('arts-and-culture') {
          <path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.5-1-1.6-1-2.7 0-.9.7-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-4-4-7-9-7Z" />
          <circle cx="8" cy="10" r="1" /><circle cx="11.5" cy="7" r="1" />
          <circle cx="15.5" cy="8" r="1" /><circle cx="17.5" cy="11.5" r="1" />
        }
        @case ('climate') {
          <circle cx="12" cy="12" r="9" />
          <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
          <path d="M14 10c2.5-.5 4-2 4.5-4-2.5.2-4 1.5-4.5 4Z" />
        }
        @case ('fitness') {
          <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
        }
        @case ('wellness') {
          <path d="M12 21c0-4 2-7 5-8.5-3-1-5.5.5-5 8.5Z" />
          <path d="M12 21c0-4-2-7-5-8.5 3-1 5.5.5 5 8.5Z" />
          <path d="M12 21c-2-3.5-2-7.5 0-10.5 2 3 2 7 0 10.5Z" />
          <path d="M12 21c1.5-3 4-4.5 7-4.5-1.5 3-4 4.5-7 4.5ZM12 21c-1.5-3-4-4.5-7-4.5 1.5 3 4 4.5 7 4.5Z" />
        }
        @case ('crypto') {
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 8.5h4a2.2 2.2 0 0 1 0 4.4h-4M9.5 12.9h4.4a2.2 2.2 0 0 1 0 4.4H9.5M11 6.5v11M13.5 6.5v11" />
        }
        @default { <circle cx="12" cy="12" r="8" /> }
      }
    </svg>
  `,
})
export class CategoryIconComponent {
  @Input() name = 'running';
  @Input() size = 24;
  get hue() { return CATEGORY_HUES[this.name] || 'var(--ink)'; }
  get label() { return CATEGORY_LABELS[this.name] || this.name; }
}

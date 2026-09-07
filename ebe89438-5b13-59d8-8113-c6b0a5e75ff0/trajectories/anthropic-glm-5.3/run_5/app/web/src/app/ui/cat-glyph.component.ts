import { Component, Input } from '@angular/core';

/** The twelve category glyphs, drawn on a 24 grid at stroke 1.5, no fill. */
@Component({
  selector: 'app-cat-glyph',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" [attr.stroke]="hue"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      @switch (slug) {
        @case ('family') {
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10.5V20h13v-9.5" />
          <path d="M12 17.2s-2.6-1.6-2.6-3.4c0-.9.7-1.6 1.5-1.6.5 0 .9.2 1.1.6.2-.4.6-.6 1.1-.6.8 0 1.5.7 1.5 1.6 0 1.8-2.6 3.4-2.6 3.4z" />
        }
        @case ('books') {
          <rect x="3.5" y="4.5" width="7" height="15" rx="1" />
          <rect x="13.5" y="4.5" width="7" height="15" rx="1" />
          <path d="M12 4.5v15" />
        }
        @case ('games') {
          <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9" />
        }
        @case ('tech') {
          <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
          <path d="m10 9.5-3 2.5 3 2.5M14 9.5l3 2.5-3 2.5" />
        }
        @case ('food-and-drink') {
          <path d="M4 13h16a8 8 0 0 1-16 0z" />
          <path d="M9.5 9c0-1.5 1-2 1-3.5M14.5 9c0-1.5 1-2 1-3.5" />
        }
        @case ('ai') {
          <path d="M9.5 5.5a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h1v-13h-1z" />
          <path d="M14.5 5.5a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1v-13h1z" />
          <path d="M6.5 12h11" />
        }
        @case ('running') {
          <circle cx="15.5" cy="5.5" r="1.8" />
          <path d="M7 20.5l3.2-4.6 3-.8 1.6-3.6-3 1.2-2.2-1.6" />
          <path d="M13.2 14.6 15 18l2.5 2.5M10.2 15.9l-1.4 4.6" />
        }
        @case ('arts-and-culture') {
          <ellipse cx="12" cy="13" rx="8.5" ry="6" transform="rotate(-18 12 13)" />
          <circle cx="8" cy="11" r="1" /><circle cx="12" cy="10" r="1" /><circle cx="15.5" cy="12" r="1" /><circle cx="10.5" cy="15" r="1" />
        }
        @case ('climate') {
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c-3 2.5-3 14.5 0 17M12 3.5c3 2.5 3 14.5 0 17" />
          <path d="M14.5 16.5c0-1.4 1.2-2 2-2.6.8.6 2 1.2 2 2.6a2 2 0 0 1-4 0z" />
        }
        @case ('fitness') {
          <path d="M4 9v6M6.5 7.5v9M17.5 7.5v9M20 9v6M6.5 12h11" />
        }
        @case ('wellness') {
          <path d="M12 20c-1.5-1.5-5-2-5-5.5 0-2.2 1.6-3.5 3.2-3.5 1 0 1.6.4 1.8 1 .2-.6.8-1 1.8-1 1.6 0 3.2 1.3 3.2 3.5 0 3.5-3.5 4-5 5.5z" />
          <path d="M12 11.5V4M8 7c1.5 0 2.5 1 4 2.5C13.5 8 14.5 7 16 7M12 4c-1.2-1-2.4-1.2-3.5-1M12 4c1.2-1 2.4-1.2 3.5-1" />
        }
        @case ('crypto') {
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 8h3.2a2 2 0 0 1 0 4H9.5zM9.5 12h3.7a2 2 0 0 1 0 4H9.5zM11 6.5v2M11 15.5v2" />
        }
        @default {
          <circle cx="12" cy="12" r="8.5" />
        }
      }
    </svg>
  `,
})
export class CatGlyphComponent {
  @Input({ required: true }) slug!: string;
  @Input() size = 20;
  @Input() hue = '#146aeb';
}

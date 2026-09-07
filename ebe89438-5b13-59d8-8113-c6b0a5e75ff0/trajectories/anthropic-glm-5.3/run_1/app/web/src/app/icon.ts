import { Component, Input } from '@angular/core';

const CATEGORY_HUES: Record<string, string> = {
  family: '#d69712', books: '#ab46dd', games: '#3cbd2c', tech: '#146aeb',
  'food-and-drink': '#d69712', ai: '#ab46dd', running: '#3cbd2c', 'arts-and-culture': '#ab46dd',
  climate: '#3cbd2c', fitness: '#007aff', wellness: '#f31a7c', crypto: '#d69712',
};

/** Every symbol drawn from geometry on a 24 grid, stroke 1.5, round joins. */
@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
         [attr.stroke]="hue" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name) {
        @case ('family') { <path d="M3 11 L12 4 L21 11 V20 H14 V15 H10 V20 H3 Z"/><path d="M12 17.5 C10.6 16.4 10 15.6 10 14.9 C10 14.3 10.5 13.9 11.1 13.9 C11.5 13.9 11.8 14.1 12 14.4 C12.2 14.1 12.5 13.9 12.9 13.9 C13.5 13.9 14 14.3 14 14.9 C14 15.6 13.4 16.4 12 17.5 Z"/> }
        @case ('books') { <rect x="4" y="4" width="7" height="16" rx="1"/><rect x="13" y="4" width="7" height="16" rx="1"/><path d="M11.5 5 V19"/> }
        @case ('games') { <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z"/><path d="M12 3 V12 M4 7.5 L12 12 L20 7.5 M12 21 V12"/> }
        @case ('tech') { <rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 10 L7 12 L9 14 M15 10 L17 12 L15 14 M13 9.5 L11 14.5"/> }
        @case ('food-and-drink') { <path d="M4 12 H20 C20 16.4 16.4 20 12 20 C7.6 20 4 16.4 4 12 Z"/><path d="M9 8 C9 6.5 10 6.5 10 5 M14 8 C14 6.5 15 6.5 15 5"/> }
        @case ('ai') { <path d="M11 5 C8.8 5 7 6.8 7 9 C7 12 9.5 14 11 14 C12.5 14 15 12 15 9 C15 6.8 13.2 5 11 5 Z M11 14 V19"/><path d="M11 5 C11 5 8 5.7 8 9 M11 14 C11 14 8 13.6 7.4 11"/> }
        @case ('running') { <circle cx="15.5" cy="5.5" r="1.8"/><path d="M8 21 L11 16 L9 12.5 L12 8.5 L15 11 L18.5 12 M9 12.5 L5.5 13.5 M12 8.5 L9.5 6.5"/> }
        @case ('arts-and-culture') { <ellipse cx="12" cy="13" rx="9" ry="7"/><circle cx="7" cy="10" r=".9"/><circle cx="12" cy="8.5" r=".9"/><circle cx="17" cy="10" r=".9"/><circle cx="9" cy="16" r=".9"/><circle cx="15" cy="16" r=".9"/> }
        @case ('climate') { <circle cx="12" cy="12" r="9"/><path d="M3 12 H21 M12 3 C9 6 9 18 12 21 M12 3 C15 6 15 18 12 21"/><path d="M14 15 C11 15 9.5 13.5 9.5 11.5 C12 11.5 14 12.8 14 15 Z"/> }
        @case ('fitness') { <path d="M3 9 V15 M6 7.5 V16.5 M18 7.5 V16.5 M21 9 V15 M6 12 H18"/> }
        @case ('wellness') { <path d="M12 20 C12 20 4 16 4 10.5 C4 8 6 6.5 8 6.5 C10 6.5 12 8.5 12 10 C12 8.5 14 6.5 16 6.5 C18 6.5 20 8 20 10.5 C20 16 12 20 12 20 Z"/> }
        @case ('crypto') { <circle cx="12" cy="12" r="9"/><path d="M9.5 8 H13 C14.1 8 15 8.9 15 10 C15 11.1 14.1 12 13 12 H9.5 H13.5 C14.6 12 15.5 12.9 15.5 14 C15.5 15.1 14.6 16 13.5 16 H9.5 M11 6.5 V8 M11 16 V17.5 M9.5 12 H13"/> }
        @default { <circle cx="12" cy="12" r="9"/> }
      }
    </svg>
  `,
  styles: [':host{display:inline-flex;}'],
})
export class IconComponent {
  @Input({ required: true }) name!: string;
  @Input() size = 24;
  get hue() { return CATEGORY_HUES[this.name] ?? '#48484a'; }
}

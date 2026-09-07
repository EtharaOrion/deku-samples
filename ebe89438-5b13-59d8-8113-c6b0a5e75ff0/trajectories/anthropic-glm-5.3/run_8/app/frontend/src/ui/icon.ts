import { ChangeDetectionStrategy, Component, computed, Input } from '@angular/core';

/**
 * Interface and category glyphs, drawn from geometry on a 24 grid at stroke
 * 1.5px with round caps and joins and no fill, so they stay sharp at any size
 * and can be recoloured on the fly.
 */
const GLYPHS: Record<string, string[]> = {
  family: [
    'M3 11 L12 4 L21 11', 'M5 10v9h14v-9',
    'M12 17.2 c-1.5-1-2.6-1.8-2.6-3 a1.4 1.4 0 0 1 2.6-.7 a1.4 1.4 0 0 1 2.6.7 c0 1.2-1.1 2-2.6 3z',
  ],
  books: ['M3.5 4.5h7v15h-7z', 'M13.5 4.5h7v15h-7z', 'M12 4.5v15'],
  games: ['M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z', 'M12 3 L12 12 M4 7.5 L12 12 L20 7.5 M12 12 L12 21'],
  tech: ['M3.5 7.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z', 'M9.5 9.5 L7 12 L9.5 14.5', 'M14.5 9.5 L17 12 L14.5 14.5'],
  'food-and-drink': ['M4 14 a8 4.5 0 0 0 16 0 Z', 'M9.5 10.5 c-.6-1.2 0-2 .6-3 c.6-1 .6-1.8 0-2.8', 'M14 10.5 c-.6-1.2 0-2 .6-3 c.6-1 .6-1.8 0-2.8'],
  ai: [
    'M11 5.5 a3.5 3.5 0 0 0-3.4 4.3 A3.2 3.2 0 0 0 5 13 a3.2 3.2 0 0 0 2.6 3 A3.5 3.5 0 0 0 11 18.5 Z',
    'M13 5.5 a3.5 3.5 0 0 1 3.4 4.3 A3.2 3.2 0 0 1 19 13 a3.2 3.2 0 0 1-2.6 3 A3.5 3.5 0 0 1 13 18.5 Z',
    'M12 5.5v13',
  ],
  running: [
    'M15.5 5.5m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0',
    'M8 20 l2.5-5 -2-2.5 1-4 3.5 1 2 2.5 3 .5', 'M10.5 15 L8.5 17', 'M8 8.5 l2.5-.5 1.5 2',
  ],
  'arts-and-culture': [
    'M5.2 9.4 a8.5 6 0 1 0 13.6 -3.9 a8.5 6 0 1 0 -13.6 3.9z',
    'M8 11m-0.9 0a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0',
    'M12 9.6m-0.9 0a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0',
    'M15.5 10.6m-0.9 0a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0',
    'M10 15m-0.9 0a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0',
  ],
  climate: ['M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0', 'M3.7 12h16.6', 'M12 3.5 c-3 3-3 6 0 8.5 c3-2.5 3-5.5 0-8.5z'],
  fitness: ['M4 9v6', 'M6.5 7.5v9', 'M9 12h6', 'M17.5 7.5v9', 'M20 9v6'],
  wellness: [
    'M12 5 c2 1.6 2.6 4.2 1.2 6.4', 'M12 5 c-2 1.6-2.6 4.2-1.2 6.4',
    'M5.4 8.6 c2.4.4 4.2 2.2 4.8 4.6', 'M18.6 8.6 c-2.4.4-4.2 2.2-4.8 4.6',
    'M6.5 18.5 c1.6-3 3.5-4.5 5.5-4.5s3.9 1.5 5.5 4.5',
  ],
  crypto: ['M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0', 'M9.5 8h4', 'M9.5 11.5h4', 'M12 8v8.5', 'M14.5 8v3.5'],
  calendar: ['M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z', 'M3.5 9.5h17', 'M8 3v4', 'M16 3v4'],
  pin: ['M12 21 c4-4.5 6.5-7.6 6.5-11a6.5 6.5 0 1 0-13 0c0 3.4 2.5 6.5 6.5 11z', 'M12 10m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0'],
  clock: ['M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0', 'M12 7v5.5l3.5 2'],
  'arrow-right': ['M4 12h16', 'M14 6l6 6-6 6'],
  'chevron-right': ['M9 5l7 7-7 7'],
  'chevron-down': ['M5 9l7 7 7-7'],
  check: ['M4.5 12.5l5 5 10-11'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M5.5 5.5l13 13', 'M18.5 5.5l-13 13'],
  copy: ['M8.5 10.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z', 'M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M4.5 20h15'],
  ticket: ['M3.5 8.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 0 0 4 2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 0 0-4z', 'M14.5 7v10'],
  user: ['M12 8.5m-3.8 0a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0 -7.6 0', 'M4.8 20c1.2-3.6 4-5.4 7.2-5.4s6 1.8 7.2 5.4'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2'],
  search: ['M11 11m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0', 'M16 16l4.5 4.5'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  home: ['M4 11l8-6.5 8 6.5', 'M6 9.5V20h12V9.5'],
  settings: ['M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M12 3.5v2.2', 'M12 18.3v2.2', 'M4.6 7.8l1.9 1.1', 'M17.5 15.1l1.9 1.1', 'M4.6 16.2l1.9-1.1', 'M17.5 8.9l1.9-1.1'],
  list: ['M8 6.5h12', 'M8 12h12', 'M8 17.5h12', 'M4 6.5h.01', 'M4 12h.01', 'M4 17.5h.01'],
  door: ['M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20', 'M4 20h16', 'M14.8 12m-0.9 0a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0'],
  globe: ['M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0', 'M3.7 9.5c5 1.6 11.6 1.6 16.6 0', 'M3.7 14.5c5-1.6 11.6-1.6 16.6 0'],
  star: ['M12 3l2 5.5L19.5 10 14 12l-2 6-2-6-5.5-2L10 8.5z'],
};

@Component({
  selector: 'g-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
         [attr.stroke]="colour" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true" focusable="false">
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: [`:host { display: inline-flex; line-height: 0; }`],
})
export class Icon {
  @Input({ required: true }) name!: string;
  @Input() size = 20;
  @Input() colour: string | undefined;

  paths = computed(() => GLYPHS[this.name] ?? GLYPHS['star']!);
}

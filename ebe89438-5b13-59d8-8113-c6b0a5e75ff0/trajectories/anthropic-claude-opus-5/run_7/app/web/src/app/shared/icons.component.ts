import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';

/**
 * Every symbol is drawn from geometry, never an icon font and never an image
 * file. The twelve category glyphs sit on a 24 grid at stroke 1.5 with round
 * caps and joins and no fill, each in its assigned hue.
 */
export const CATEGORY_HUES: Record<string, string> = {
  family: '#f31a7c',
  books: '#ab46dd',
  games: '#146aeb',
  tech: '#48484a',
  'food-and-drink': '#d69712',
  ai: '#ab46dd',
  running: '#3cbd2c',
  'arts-and-culture': '#d69712',
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
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
         [attr.stroke]="hue" stroke-width="1.5" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true" [ngSwitch]="name">
      <!-- Family: a house pentagon with a heart -->
      <g *ngSwitchCase="'family'">
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        <path d="M12 17.5c-1.6-1.2-3-2.3-3-3.7a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 1.4-1.4 2.5-3 3.7z" />
      </g>
      <!-- Books: two rectangles joined by a spine -->
      <g *ngSwitchCase="'books'">
        <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
        <path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />
      </g>
      <!-- Games: an isometric cube -->
      <g *ngSwitchCase="'games'">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
      </g>
      <!-- Tech: a rounded rectangle holding an angle-bracket glyph -->
      <g *ngSwitchCase="'tech'">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M9.5 9.5 7 12l2.5 2.5M14.5 9.5 17 12l-2.5 2.5" />
      </g>
      <!-- Food and Drink: a bowl arc with two steam curves -->
      <g *ngSwitchCase="'food-and-drink'">
        <path d="M3 13h18a9 9 0 0 1-9 8 9 9 0 0 1-9-8z" />
        <path d="M9 3c-1 1.2-1 2.3 0 3.5s1 2.3 0 3.5M14.5 4c-.8 1-.8 1.9 0 2.9s.8 1.9 0 2.9" />
      </g>
      <!-- AI: two mirrored brain lobes -->
      <g *ngSwitchCase="'ai'">
        <path d="M12 5.5a3 3 0 0 0-5.4 1.2A2.8 2.8 0 0 0 5 12a2.8 2.8 0 0 0 1.6 5.3A3 3 0 0 0 12 18.5z" />
        <path d="M12 5.5a3 3 0 0 1 5.4 1.2A2.8 2.8 0 0 1 19 12a2.8 2.8 0 0 1-1.6 5.3A3 3 0 0 1 12 18.5z" />
      </g>
      <!-- Running: a figure mid-stride -->
      <g *ngSwitchCase="'running'">
        <circle cx="15.5" cy="4.5" r="1.8" />
        <path d="M13.5 9.5 10 11l-2 4M13.5 9.5l3 2 .5 4M13.5 9.5 11 20M16.5 11.5 20 10" />
      </g>
      <!-- Arts and Culture: a palette ellipse with four holes -->
      <g *ngSwitchCase="'arts-and-culture'">
        <path d="M12 3c5 0 9 3.6 9 8 0 2.6-2.2 3.4-3.7 3.4h-1.5c-1.2 0-2 .9-2 1.9 0 .5.2 1 .5 1.4.3.4.4.8.4 1.2 0 1.1-1 2.1-2.7 2.1-5 0-9-4-9-9s4-9 9-9z" />
        <circle cx="8" cy="9" r=".9" /><circle cx="12" cy="7" r=".9" />
        <circle cx="16" cy="9" r=".9" /><circle cx="7.5" cy="13.5" r=".9" />
      </g>
      <!-- Climate: a globe with a leaf -->
      <g *ngSwitchCase="'climate'">
        <circle cx="11" cy="12" r="8.2" />
        <path d="M2.9 12h16.2M11 3.9c2.2 2.3 2.2 13.9 0 16.2M11 3.9c-2.2 2.3-2.2 13.9 0 16.2" />
        <path d="M17.5 6.5c2.5-.6 4 .4 4 .4s-.6 2.4-2.6 3.1" />
      </g>
      <!-- Fitness: a dumbbell -->
      <g *ngSwitchCase="'fitness'">
        <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
      </g>
      <!-- Wellness: a five-petal lotus -->
      <g *ngSwitchCase="'wellness'">
        <path d="M12 4c1.8 2 2.6 4 2.6 6.4S13.5 15 12 16.5c-1.5-1.5-2.6-3.7-2.6-6.1S10.2 6 12 4z" />
        <path d="M12 16.5c-2-.4-4.4-1.8-5.6-3.6-.6-1-.9-2-.9-2 1.9-.4 3.9.1 5.3 1.2" />
        <path d="M12 16.5c2-.4 4.4-1.8 5.6-3.6.6-1 .9-2 .9-2-1.9-.4-3.9.1-5.3 1.2" />
        <path d="M4 15.5c2 3 5 4.5 8 4.5s6-1.5 8-4.5" />
      </g>
      <!-- Crypto: a circle with a currency mark -->
      <g *ngSwitchCase="'crypto'">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M10 8h3.2a2.2 2.2 0 0 1 0 4.4H10zM10 12.4h3.6a2.2 2.2 0 0 1 0 4.4H10zM10 8v8.8M11.6 6v2M11.6 16.8v2" />
      </g>
      <g *ngSwitchDefault>
        <circle cx="12" cy="12" r="8.5" />
      </g>
    </svg>
  `,
})
export class CategoryIconComponent {
  @Input() name = 'family';
  @Input() size = 24;
  @Input() colour?: string;
  get hue(): string { return this.colour ?? CATEGORY_HUES[this.name] ?? 'currentColor'; }
}

/** Interface icons, drawn on the same construction as the category glyphs. */
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [NgSwitch, NgSwitchCase, NgSwitchDefault],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true" [ngSwitch]="name">
      <path *ngSwitchCase="'home'" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      <g *ngSwitchCase="'search'"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></g>
      <g *ngSwitchCase="'calendar'">
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </g>
      <path *ngSwitchCase="'plus'" d="M12 5v14M5 12h14" />
      <g *ngSwitchCase="'settings'">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
      </g>
      <path *ngSwitchCase="'chevron-right'" d="m9 5 7 7-7 7" />
      <path *ngSwitchCase="'chevron-left'" d="m15 5-7 7 7 7" />
      <path *ngSwitchCase="'chevron-down'" d="m5 9 7 7 7-7" />
      <path *ngSwitchCase="'arrow-right'" d="M4 12h16m-6-6 6 6-6 6" />
      <path *ngSwitchCase="'close'" d="M6 6l12 12M18 6 6 18" />
      <path *ngSwitchCase="'check'" d="m4 12.5 5 5L20 6.5" />
      <g *ngSwitchCase="'copy'">
        <rect x="9" y="9" width="12" height="12" rx="2.5" />
        <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      </g>
      <g *ngSwitchCase="'ticket'">
        <path d="M3 9V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V9a3 3 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V15a3 3 0 0 0 0-6z" />
        <path d="M14 5v14" stroke-dasharray="2 2" />
      </g>
      <g *ngSwitchCase="'pin'">
        <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.6" />
      </g>
      <path *ngSwitchCase="'menu'" d="M4 7h16M4 12h16M4 17h16" />
      <g *ngSwitchCase="'users'">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
      </g>
      <g *ngSwitchCase="'download'">
        <path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 19h16" />
      </g>
      <g *ngSwitchCase="'logout'">
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h11" />
      </g>
      <g *ngSwitchDefault><circle cx="12" cy="12" r="8.5" /></g>
    </svg>
  `,
})
export class IconComponent {
  @Input() name = 'check';
  @Input() size = 20;
}

import { Component } from '@angular/core';

/**
 * Every symbol is drawn from geometry on a 24 grid: stroke 1.5, round caps,
 * no fill. It stays sharp at any size and can be recoloured on the fly.
 */
const CATEGORY_HUES: Record<string, string> = {
  'family': '#146aeb', 'books': '#ab46dd', 'games': '#d69712', 'tech': '#146aeb',
  'food-and-drink': '#3cbd2c', 'ai': '#ab46dd', 'running': '#f31a7c',
  'arts-and-culture': '#ab46dd', 'climate': '#3cbd2c', 'fitness': '#007aff',
  'wellness': '#d69712', 'crypto': '#f31a7c',
};

@Component({
  selector: 'cc-category-icon',
  standalone: true,
  template: `<svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    [style.color]="hue" aria-hidden="true"><ng-content /></svg>`,
})
export class CategoryIcon {
  size = 24;
  category = '';
  hue = '#48484a';
}

/** The brand mark: a four-pointed star with concave sides, from geometry. */
@Component({
  selector: 'cc-brand-mark',
  standalone: true,
  template: `<svg width="20" height="20" viewBox="0 0 133 134" fill="currentColor" aria-hidden="true">
    <path d="M 66.5 0 C 70 40 93.5 63.5 133 67 C 93.5 70.5 70 94 66.5 134
             C 63 94 39.5 70.5 0 67 C 39.5 63.5 63 40 66.5 0 Z"/>
  </svg>`,
})
export class BrandMark {}

/** The four brand paths of the source's sign-in mark are deliberately absent. */
@Component({ selector: 'cc-icon', standalone: true,
  template: `<svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <ng-content /></svg>` })
export class Icon { size = 20; }

export function categoryHue(cat: string): string { return CATEGORY_HUES[cat] ?? '#48484a'; }
export { CATEGORY_HUES };

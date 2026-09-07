import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** The four-pointed star with concave sides, drawn from geometry. */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 133 134" [attr.width]="size()" [attr.height]="size()" fill="currentColor"
         aria-hidden="true" focusable="false">
      <path d="M66.5 0c4.2 30.6 25.9 52.3 56.5 56.5-30.6 4.2-52.3 25.9-56.5 56.5C62.3 82.4 40.6 60.7 10 56.5 40.6 52.3 62.3 30.6 66.5 0Z" />
    </svg>
  `,
  styles: [':host{display:inline-flex;line-height:0}'],
})
export class BrandMarkComponent {
  size = input(20);
}

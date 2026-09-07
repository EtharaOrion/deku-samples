import { Component, Input } from '@angular/core';

/** Four-pointed star with concave sides, drawn from geometry on a 0 0 133 134 box. */
@Component({
  selector: 'app-brand-mark',
  standalone: true,
  template: `
    <svg viewBox="0 0 133 134" [attr.width]="size" [attr.height]="size" aria-hidden="true" focusable="false">
      <path
        d="M66.5 0 L82.6 51.4 Q84.7 58 91.3 60.1 L133 66.5 L91.3 72.9 Q84.7 75 82.6 81.6 L66.5 134 L50.4 81.6 Q48.3 75 41.7 72.9 L0 66.5 L41.7 60.1 Q48.3 58 50.4 51.4 Z"
        fill="currentColor" />
    </svg>
  `,
})
export class BrandMarkComponent {
  @Input() size = 18;
}

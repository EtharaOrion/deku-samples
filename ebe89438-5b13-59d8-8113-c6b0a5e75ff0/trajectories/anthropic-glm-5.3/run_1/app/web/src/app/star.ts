import { Component, Input } from '@angular/core';

/** The four-pointed star with concave sides, drawn from geometry: 0 0 133 134. */
@Component({
  selector: 'app-star',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size * 134 / 133" viewBox="0 0 133 134" fill="currentColor" aria-hidden="true">
      <path d="M 66.5 0 C 69 30 89 50 133 67 C 89 84 69 104 66.5 134 C 64 104 44 84 0 67 C 44 50 64 30 66.5 0 Z"/>
    </svg>
  `,
  styles: [':host{display:inline-flex;}'],
})
export class StarComponent {
  @Input() size = 18;
}

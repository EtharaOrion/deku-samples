import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** A four-pointed star with concave sides on the box 0 0 133 134, from geometry. */
@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a [routerLink]="link" class="lockup" [class.tinted]="tinted" aria-label="Deku Events, home">
      <svg viewBox="0 0 133 134" [attr.width]="size" [attr.height]="size" aria-hidden="true" focusable="false">
        <path fill="currentColor"
          d="M66.5 0C69 36 97 64 133 67c-36 3-64 31-66.5 67C64 98 36 70 0 67 36 64 64 36 66.5 0Z" />
      </svg>
      @if (showWord) { <span class="word">Deku</span> }
    </a>
  `,
  styles: [`
    .lockup {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--ink); text-decoration: none; border-radius: var(--r-menu);
    }
    .lockup svg { display: block; transform: translateY(-2px); }
    .word { font-weight: 700; letter-spacing: -0.02em; font-size: 18px; }
    .tinted { color: var(--pink); }
    .tinted:hover { color: #d5176d; }
  `],
})
export class BrandComponent {
  @Input() link = '/';
  @Input() size = 18;
  @Input() showWord = true;
  @Input() tinted = false;
}

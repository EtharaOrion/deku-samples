import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StarComponent } from './star';


/** Brand lockup: star beside the wordmark, weight 700, -0.02em. */
@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [RouterLink, StarComponent],
  template: `
    <a class="brand" [routerLink]="link" [class.suspended]="suspended" aria-label="Deku home">
      <app-star [size]="18"></app-star>
      <span class="word">deku</span>
    </a>
  `,
  styles: [`
    .brand { display: inline-flex; align-items: flex-start; gap: 6px; text-decoration: none; color: var(--ink); }
    .word { font-weight: 700; letter-spacing: -0.02em; font-size: 17px; line-height: 20px; }
    .brand app-star { margin-top: 1px; }
    .brand.suspended { color: var(--pink); }
    .brand.suspended:hover { color: var(--pink-dark); }
  `],
})
export class BrandComponent {
  @Input() link: any[] = ['/'];
  @Input() suspended = false;
}

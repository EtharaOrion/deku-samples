import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STAR_PATH } from '../../core/visuals';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="nf">
      <h1 class="serif">404 · Page Not Found</h1>
      <p class="body">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </div>
  `,
  styles: [`
    .nf { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center; }
    h1 { font-size: 32px; line-height: 40px; }
    .body { color: var(--muted); max-width: 420px; font-size: 16px; line-height: 24px; }
  `],
})
export class NotFoundComponent {
  star = STAR_PATH;
}

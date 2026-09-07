import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** The same wording as the routed not-found page, for embedding. */
@Component({
  selector: 'cc-not-found-embed',
  standalone: true,
  imports: [RouterLink],
  template: `
  <div class="wrap">
    <h1 class="h1-display big">404 · Page Not Found</h1>
    <p class="lede">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
    <a class="btn btn-primary" routerLink="/">Return Home</a>
  </div>`,
  styles: [`
    .wrap { min-height: 60vh; display: grid; place-content: center; justify-items: center;
      text-align: center; gap: 16px; }
    .big { font-size: 36px; line-height: 44px; margin: 0; }
    .lede { color: var(--muted); max-width: 440px; margin: 0 0 8px; }
  `],
})
export class NotFoundEmbed {}

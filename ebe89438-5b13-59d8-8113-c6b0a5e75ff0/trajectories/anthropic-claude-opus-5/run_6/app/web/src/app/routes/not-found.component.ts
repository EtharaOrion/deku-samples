import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';

/**
 * The same page answers a route that never existed and a route the visitor may
 * not see, because wording that differed would confirm a private event exists.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, PublicBarComponent],
  template: `
    <app-public-bar />
    <main id="main" class="wrap">
      <h1 class="code">404 &middot; Page Not Found</h1>
      <p class="t-long body">
        Looks like you discovered a page that doesn't exist or you don't have access to.
      </p>
      <a routerLink="/" class="btn btn-primary">Return Home</a>
    </main>
  `,
  styles: [`
    .wrap {
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center;
    }
    .code { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 40px; }
    .body { color: var(--ink-64); max-width: 46ch; }
  `],
})
export class NotFoundComponent {}

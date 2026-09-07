import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';

/** The same page answers a route that never existed and a route the visitor
 *  may not see, because wording that differed would confirm a private event. */
@Component({
  selector: 'cc-not-found',
  standalone: true,
  imports: [PublicBar, RouterLink],
  template: `
  <cc-public-bar></cc-public-bar>
  <main class="container wrap">
    <h1 class="h1-display big">404 · Page Not Found</h1>
    <p class="lede">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
    <a class="btn btn-primary" routerLink="/">Return Home</a>
  </main>`,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-content: center; justify-items: center;
      text-align: center; gap: 16px; padding-top: 64px; }
    .big { font-size: 40px; line-height: 48px; margin: 0; }
    .lede { color: var(--muted); max-width: 460px; margin: 0 0 16px; }
  `],
})
export class NotFound {}

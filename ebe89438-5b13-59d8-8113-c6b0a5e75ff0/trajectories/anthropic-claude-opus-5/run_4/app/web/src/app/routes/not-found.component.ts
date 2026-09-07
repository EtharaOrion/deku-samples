import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TopBarComponent } from '../ui/top-bar.component';

/**
 * The same page answers a route that never existed and a route the visitor may
 * not see, because wording that differed would confirm a private event exists.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main class="page" id="main">
      <h1><span class="code">404</span><span class="dot" aria-hidden="true">·</span><span>Page Not Found</span></h1>
      <p class="t-prose">
        Looks like you discovered a page that doesn't exist or you don't have access to.
      </p>
      <a class="btn btn-primary btn-pill" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [
    `
      .page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s4);
        text-align: center;
        padding: 96px var(--s5) var(--s8);
      }
      h1 {
        display: flex;
        align-items: center;
        gap: var(--s3);
        font-family: var(--serif);
        font-weight: 400;
        font-size: 32px;
        line-height: 38px;
      }
      .dot {
        color: var(--ink-36);
      }
      p {
        color: var(--ink-64);
        max-width: 420px;
      }
    `,
  ],
})
export class NotFoundComponent {}

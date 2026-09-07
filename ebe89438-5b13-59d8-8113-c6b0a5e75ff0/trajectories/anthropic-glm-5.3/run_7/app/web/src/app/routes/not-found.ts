import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicShellComponent } from '../shells/public-shell';

/**
 * The same page answers a route that never existed and a route the visitor
 * may not see, so the wording cannot confirm a private record exists.
 */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicShellComponent],
  template: `
    <app-public-shell>
      <div class="wrap">
        <h1>404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a routerLink="/" class="btn btn-primary">Return Home</a>
      </div>
    </app-public-shell>
  `,
  styles: [`
    .wrap { min-height: calc(100vh - 64px); display: flex; flex-direction: column; gap: 12px;
      align-items: center; justify-content: center; text-align: center; padding: 24px; }
    h1 { font: 700 22px/26px var(--sans); }
    p { color: var(--ink-64); max-width: 40ch; }
  `],
})
export class NotFoundComponent {}

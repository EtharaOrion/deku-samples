import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';

/**
 * One page answers a route that never existed and a route the visitor may not
 * see; wording that differed would confirm a private event exists.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, PublicBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <div class="public-shell centre">
      <main id="main" class="holder">
        <h1 class="serif">404 · Page Not Found</h1>
        <p class="t-longform">Looks like you discovered a page that doesn’t exist or you don’t have access to.</p>
        <a class="btn btn-primary btn-pill" routerLink="/">Return Home</a>
      </main>
    </div>
  `,
  styles: [
    `
      .centre {
        align-items: center;
        justify-content: center;
        padding: var(--s5);
      }
      .holder {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s4);
        max-width: 480px;
      }
      h1 {
        font-size: 32px;
        line-height: 40px;
        font-weight: 400;
      }
      p {
        color: var(--ink-64);
      }
    `,
  ],
})
export class NotFoundComponent implements OnInit {
  ngOnInit(): void {
    clearTheme();
  }
}

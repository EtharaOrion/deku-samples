import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';
import { ThemeService } from '../core/theme.service';

/**
 * The same page answers a route that never existed and a route the visitor may
 * not see, because wording that differed would confirm a private event exists.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, PublicBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <main id="main" class="wrap">
      <h1 class="head">
        <span class="head__code">404</span>
        <span class="head__dot" aria-hidden="true">·</span>
        <span class="head__word">Page Not Found</span>
      </h1>
      <p class="body t-prose">
        Looks like you discovered a page that doesn't exist or you don't have access to.
      </p>
      <a class="btn btn--primary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s4);
        padding: 96px var(--s5) var(--s8);
        text-align: center;
      }
      .head {
        display: flex;
        align-items: baseline;
        gap: var(--s3);
        font-family: var(--serif);
        font-weight: 400;
        font-size: 36px;
        line-height: 42px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .head__dot { color: var(--ink-36); }
      .body { color: var(--ink-64); max-width: 460px; }
    `,
  ],
})
export class NotFoundPage implements OnInit {
  private theme = inject(ThemeService);

  ngOnInit(): void {
    this.theme.clear();
  }
}

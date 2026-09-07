import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandComponent } from '../ui/brand.component';
import { ThemeService } from '../core/theme.service';

/** The one route where the lockup is tinted pink, darkening on hover. */
@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="wrap">
      <a routerLink="/" aria-label="Deku, go to the landing page">
        <app-brand [tinted]="true" [markSize]="24" [wordSize]="24" />
      </a>
      <h1 class="head">Account Suspended</h1>
      <p class="body t-prose">
        This user account is suspended for violating our terms of service.
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
        padding: var(--s8) var(--s5);
        text-align: center;
      }
      .head { font-family: var(--serif); font-weight: 400; font-size: 36px; line-height: 42px; }
      .body { color: var(--ink-64); max-width: 460px; }
    `,
  ],
})
export class SuspendedPage implements OnInit {
  private theme = inject(ThemeService);

  ngOnInit(): void {
    this.theme.clear();
  }
}

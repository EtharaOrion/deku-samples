import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { clearTheme } from '../core/theme';
import { BrandComponent } from '../ui/icons.component';

@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="holder">
      <main id="main" class="inner">
        <a routerLink="/" class="lock"><app-brand [size]="22" [tinted]="true" /></a>
        <h1 class="serif">Account Suspended</h1>
        <p class="t-longform">This user account is suspended for violating our terms of service.</p>
        <a class="btn btn-primary btn-pill" routerLink="/">Return Home</a>
      </main>
    </div>
  `,
  styles: [
    `
      .holder {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s5);
      }
      .inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s4);
        text-align: center;
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
export class SuspendedComponent implements OnInit {
  ngOnInit(): void {
    clearTheme();
  }
}

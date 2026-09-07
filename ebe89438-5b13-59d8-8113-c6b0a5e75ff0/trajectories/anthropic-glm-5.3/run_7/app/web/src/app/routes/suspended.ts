import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '../ui/brand-mark';

/** The one route where the lockup is tinted pink, darkening on hover. */
@Component({
  selector: 'app-suspended',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <div class="wrap">
      <a class="brand" routerLink="/" aria-label="Community Calendar home">
        <app-brand-mark [size]="18" /><span class="word">Calendar</span>
      </a>
      <h1>Account Suspended</h1>
      <p>This user account is suspended for violating our terms of service.</p>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; flex-direction: column; gap: 12px; align-items: center;
      justify-content: center; text-align: center; padding: 24px; }
    .brand { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: #f31a7c; }
    .brand .word { font: 700 16px/24px var(--sans); letter-spacing: -0.02em; }
    @media (hover: hover) { .brand:hover { color: #d5176d; } }
    h1 { font: 700 22px/26px var(--sans); }
    p { color: var(--ink-64); max-width: 40ch; }
  `],
})
export class SuspendedComponent {}

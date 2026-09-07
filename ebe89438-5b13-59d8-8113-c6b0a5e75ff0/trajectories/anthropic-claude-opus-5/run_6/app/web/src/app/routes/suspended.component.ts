import { Component } from '@angular/core';
import { BrandComponent } from '../ui/brand.component';

@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [BrandComponent],
  template: `
    <main id="main" class="wrap">
      <app-brand [tinted]="true" />
      <h1 class="serif">Account Suspended</h1>
      <p class="t-long body">This user account is suspended for violating our terms of service.</p>
    </main>
  `,
  styles: [`
    .wrap {
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center;
    }
    h1 { font-size: 32px; line-height: 40px; }
    .body { color: var(--ink-64); max-width: 46ch; }
  `],
})
export class SuspendedComponent {}

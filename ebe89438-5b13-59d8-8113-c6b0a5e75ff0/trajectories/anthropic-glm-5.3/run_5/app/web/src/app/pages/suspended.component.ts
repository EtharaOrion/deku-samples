import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '../ui/brand-mark.component';

@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <main class="page" role="main">
      <a class="brand suspended-brand" routerLink="/">
        <app-brand-mark [size]="18"></app-brand-mark>
        <span>Deku</span>
      </a>
      <h1 class="screen-title">Account Suspended</h1>
      <p class="body-copy copy">This user account is suspended for violating our terms of service.</p>
      <a class="btn secondary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [
    `
    .page { min-height: 100vh; display: flex; flex-direction: column; gap: 16px; align-items: flex-start; justify-content: center; max-width: 560px; margin: 0 auto; padding: 32px 24px; }
    .suspended-brand { color: #f31a7c; }
    .suspended-brand:hover { color: #d5176d; }
    .copy { color: var(--ink-2); margin: 0; }
  `],
})
export class SuspendedComponent {}

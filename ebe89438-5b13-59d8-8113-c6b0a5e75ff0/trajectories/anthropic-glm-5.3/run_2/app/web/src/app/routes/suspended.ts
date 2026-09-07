import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'cc-suspended',
  standalone: true,
  imports: [RouterLink],
  template: `
  <main class="wrap">
    <a routerLink="/" class="brand tinted" aria-label="Community Calendar home">Community Calendar</a>
    <h1 class="h1-display title">Account Suspended</h1>
    <p class="lede">This user account is suspended for violating our terms of service.</p>
  </main>`,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-content: center; justify-items: center;
      text-align: center; gap: 12px; }
    .brand { font-weight: 700; letter-spacing: -0.02em; font-size: 16px; }
    .tinted { color: #f31a7c; }
    .tinted:hover { color: #d5176d; }
    .title { font-size: 36px; margin: 8px 0 0; }
    .lede { color: var(--muted); max-width: 420px; }
  `],
})
export class Suspended {}

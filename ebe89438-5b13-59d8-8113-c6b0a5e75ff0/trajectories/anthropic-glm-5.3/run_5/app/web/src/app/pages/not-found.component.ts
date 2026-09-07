import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TopbarComponent } from '../ui/topbar.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TopbarComponent],
  template: `
    <div class="nf-page">
      <app-topbar></app-topbar>
      <main class="nf" role="main">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p class="nf-body">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn primary" routerLink="/">Return Home</a>
      </main>
    </div>
  `,
  styles: [
    `
    .nf-page { min-height: 100vh; padding-top: 64px; }
    .nf { max-width: 560px; margin: 0 auto; padding: 64px 24px; display: flex; flex-direction: column; gap: 16px; }
    .nf-title { font-size: 22px; line-height: 26px; font-weight: 700; }
    .nf-body { font-size: 16px; line-height: 24px; color: var(--ink-2); margin: 0; }
  `],
})
export class NotFoundComponent {}

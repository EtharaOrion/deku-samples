import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBarComponent } from '../public-bar';

@Component({
  selector: 'route-not-found', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBarComponent],
  template: `
    <public-bar></public-bar>
    <main id="main" class="content-frame page">
      <div class="nf card card-lg elevated onboarding-card">
        <p class="t-overline tertiary">404 · Page Not Found</p>
        <h1 class="t-display nf-title">Page Not Found</h1>
        <p class="t-para ink-2">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a routerLink="/" class="btn btn-primary">Return Home</a>
      </div>
    </main>
  `,
  styles: [`
    .page{display:flex;justify-content:center;padding-top:64px}
    .nf{max-width:480px;padding:48px 40px;display:flex;flex-direction:column;gap:16px;text-align:center;align-items:center}
    .nf-title{font-size:34px;line-height:40px}
    .ink-2{color:var(--ink-2)}
  `],
})
export class NotFoundComponent { }

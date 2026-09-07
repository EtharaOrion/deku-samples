import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '../widgets';

@Component({
  selector: 'route-suspended', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <main id="main" class="page">
      <div class="card card-lg elevated">
        <a routerLink="/" class="susp-brand" aria-label="Community Calendar home">
          <brand-mark [size]="18"></brand-mark><span>Community Calendar</span>
        </a>
        <h1 class="t-display">Account Suspended</h1>
        <p class="t-para">This user account is suspended for violating our terms of service.</p>
        <a routerLink="/" class="link">Return Home</a>
      </div>
    </main>
  `,
  styles: [`
    .page{min-height:100vh;display:grid;place-items:center;padding:24px}
    .card{max-width:480px;padding:48px 40px;display:flex;flex-direction:column;gap:16px;text-align:center;align-items:center}
    .susp-brand{display:inline-flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;color:var(--pink)}
    @media (hover:hover){ .susp-brand:hover{color:#d5176d} }
  `],
})
export class SuspendedComponent { }

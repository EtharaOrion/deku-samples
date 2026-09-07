import { Component, Input } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiService } from '../api.service';
import { avatarColor, avatarInitial } from '../cover';
import { BrandMarkComponent } from './brand-mark.component';

/** The signed-in shell: a persistent left rail so the queue and the door stay one click away. */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, BrandMarkComponent],
  template: `
    <div class="shell">
      <aside class="shell-rail" role="complementary" aria-label="Account navigation">
        <a class="brand" routerLink="/">
          <app-brand-mark [size]="18"></app-brand-mark>
          <span>Deku</span>
        </a>
        <nav class="rail-nav" aria-label="Destinations">
          @for (item of nav; track item.path) {
            <a class="nav-item" [routerLink]="item.path" routerLinkActive="active"
               ariaCurrentWhenActive="page">
              {{ item.label }}
            </a>
          }
        </nav>
        <div class="rail-account">
          <span class="avatar" [style.background]="avatarColor(account()?.display_name ?? '?')">{{ initial(account()?.display_name ?? '?') }}</span>
          <span class="rail-name">
            <span class="rail-display">{{ account()?.display_name }}</span>
            <span class="rail-role">{{ account()?.role === 'host' ? 'Host' : 'Guest' }}</span>
          </span>
          <button class="icon-btn" type="button" (click)="logout()" aria-label="Sign out" title="Sign out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h11" />
            </svg>
          </button>
        </div>
      </aside>
      <main class="shell-content" role="main">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [
    `
    .rail-nav { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; }
    .nav-item.active { background: var(--ink); color: var(--paper); }
    .rail-name { display: flex; flex-direction: column; line-height: 16px; flex: 1; min-width: 0; }
    .rail-display { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rail-role { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  `],
})
export class ShellComponent {
  readonly account;

  constructor(private api: ApiService, private router: Router) {
    this.account = api.account;
  }

  get nav(): Array<{ path: string; label: string }> {
    if (this.api.isHost()) {
      return [
        { path: '/calendars', label: 'Calendars' },
        { path: '/create', label: 'Create' },
        { path: '/discover', label: 'Discover' },
        { path: '/settings/profile', label: 'Settings' },
      ];
    }
    return [
      { path: '/home', label: 'Home' },
      { path: '/discover', label: 'Discover' },
      { path: '/settings/profile', label: 'Settings' },
    ];
  }

  avatarColor(name: string): string {
    return avatarColor(name);
  }

  initial(name: string): string {
    return avatarInitial(name);
  }

  logout() {
    this.api.clearSession();
    this.router.navigate(['/']);
  }
}

import { Component, inject, signal, computed, effect } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastsComponent } from '../ui/toasts.component';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { STAR_PATH, initials, avatarHue } from '../core/visuals';
import { localClock } from '../core/time';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, interval, map, startWith } from 'rxjs';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ToastsComponent],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="public-bar" role="banner">
      <a class="brand" routerLink="/" aria-label="Gatherline home">
        <svg width="26" height="26" viewBox="0 0 133 134" aria-hidden="true"><path [attr.d]="star" fill="currentColor"/></svg>
        <span class="word">Gatherline</span>
      </a>
      <div class="clock" aria-live="off">{{ clock() }}</div>
      <nav class="bar-links" aria-label="Primary">
        <a routerLink="/discover" class="bar-link">Discover Events</a>
        @if (account(); as acc) {
          <a class="avatar-chip" routerLink="/home" [attr.aria-label]="'Signed in as ' + acc.display_name">
            <span class="avatar" [style.background]="hue(acc.display_name)">{{ initials(acc.display_name) }}</span>
          </a>
        } @else {
          <a class="bar-action" routerLink="/login">Sign In</a>
        }
      </nav>
    </header>
    <main id="main" role="main"><router-outlet /></main>
    <app-toasts></app-toasts>
  `,
  styles: [`
    :host { display: block; }
    .public-bar {
      position: fixed; top: 0; left: 0; right: 0; height: 64px; z-index: 200;
      display: flex; align-items: center; gap: 24px;
      padding: 0 24px;
      background: transparent;
      color: var(--bar-ink, var(--ink));
    }
    .public-bar a, .public-bar .clock { color: var(--bar-ink, var(--ink)); }
    .brand { color: var(--bar-ink, var(--ink)); }
    .clock { margin-left: auto; font-size: 13px; line-height: 16px; color: var(--bar-ink-secondary, var(--ink-36)); white-space: nowrap; }
    .bar-links { display: flex; align-items: center; gap: 16px; }
    .bar-link { font-size: 14px; line-height: 20px; color: var(--bar-ink-secondary, var(--ink-64)); min-height: 44px; display: inline-flex; align-items: center; }
    .bar-link:hover { color: var(--bar-ink, var(--ink)); }
    .avatar-chip { min-height: 44px; display: inline-flex; align-items: center; }
    .avatar {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 100%;
      color: #ffffff; font-size: 13px; font-weight: 600;
      box-shadow: rgba(0, 15, 58, 0.08) 0px 0px 0px 0.5px inset;
    }
    main { min-height: 60vh; }
    @media (max-width: 650px) { .clock { display: none; } }
  `],
})
export class ShellComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  toasts = inject(ToastService);
  star = STAR_PATH;

  account = this.auth.account;

  clock = toSignal(
    interval(60000).pipe(
      startWith(0),
      map(() => localClock(new Date())),
    ),
    { initialValue: localClock(new Date()) },
  );

  constructor() {
    this.auth.restore();
    effect(() => {
      // An expired token clears and sends the visitor to sign in.
      void this.auth.ready();
    });
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      window.scrollTo({ top: 0 });
    });
  }

  initials = initials;
  hue = avatarHue;
}

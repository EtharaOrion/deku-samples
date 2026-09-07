import { Component, OnDestroy } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { BrandMark } from '../ui/icons';
import { Avatar } from '../ui/avatar';
import { Auth } from '../core/auth';
import { TimeFmt } from '../core/time';

/**
 * One fixed bar on every public route: transparent over the page ground,
 * no border, no shadow, 64px tall, depth 200.
 */
@Component({
  selector: 'cc-public-bar',
  standalone: true,
  imports: [RouterLink, BrandMark, Avatar],
  template: `
  <header class="bar">
    <a class="brand" routerLink="/" aria-label="Community Calendar home">
      <cc-brand-mark></cc-brand-mark>
      <span class="wordmark">Community Calendar</span>
    </a>
    <time class="clock tertiary" [attr.datetime]="iso" [attr.title]="zone">{{ clock }}</time>
    <nav class="bar-nav" aria-label="Main">
      <a routerLink="/discover" class="bar-link">Discover Events</a>
      @if (auth.account) {
        <a class="bar-account" routerLink="/home" [attr.aria-label]="'Your account, ' + auth.account.display_name">
          <cc-avatar [name]="auth.account.display_name" [size]="32"></cc-avatar>
        </a>
      } @else {
        <a routerLink="/login" class="btn btn-sm invert-hover btn-p">Sign In</a>
      }
    </nav>
  </header>`,
  styles: [`
    .bar { position: fixed; inset: 0 0 auto 0; height: 64px; z-index: 200;
      display: flex; align-items: center; gap: 24px; padding: 0 24px;
      background: transparent; }
    .brand { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); }
    .wordmark { font-weight: 700; letter-spacing: -0.02em; font-size: 15px; }
    .clock { margin-left: auto; font-size: 13px; line-height: 16px; white-space: nowrap; }
    .bar-nav { display: flex; align-items: center; gap: 20px; }
    .bar-link { font-size: 14px; color: var(--ink-64); }
    .bar-link:hover { color: var(--ink); }
    .bar-account { display: inline-flex; }
    @media (max-width: 650px) { .wordmark { display: none; } .clock { display: none; } }
  `],
})
export class PublicBar implements OnDestroy {
  clock = '';
  iso = '';
  zone = '';
  private timer: ReturnType<typeof setInterval>;

  constructor(public auth: Auth, private fmt: TimeFmt) {
    const tick = () => {
      const now = new Date();
      this.clock = fmt.clock(now);
      this.iso = now.toISOString();
      this.zone = fmt.localZone();
    };
    tick();
    // Updating once a minute on the minute keeps the anchor honest.
    const delay = 60_000 - (Date.now() % 60_000);
    const self = this;
    const loop = (): void => {
      tick();
      self.timer = setTimeout(loop, 60_000) as unknown as ReturnType<typeof setInterval>;
    };
    this.timer = setTimeout(loop, delay) as unknown as ReturnType<typeof setInterval>;
  }

  ngOnDestroy(): void { clearTimeout(this.timer); }
}

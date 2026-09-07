import { Component, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandComponent } from './brand';
import { Auth } from './auth';
import { AvatarComponent } from './avatar';

/**
 * The slim fixed public bar: brand lockup, the visitor's live local time on a
 * one-minute clock, Discover Events, and the sign-in pill / avatar.
 */
@Component({
  selector: 'app-public-bar',
  standalone: true,
  imports: [RouterLink, BrandComponent, AvatarComponent],
  template: `
    <header class="bar">
      <nav class="inner" aria-label="Main">
        <app-brand></app-brand>
        <span class="clock" aria-label="Your local time">{{ clock() }}</span>
        <span class="spacer"></span>
        <a class="link" routerLink="/discover">Discover Events</a>
        @if (auth.account(); as acct) {
          <a class="avatar-link" [routerLink]="acct.role === 'host' ? '/calendars' : '/home'" aria-label="Your account">
            <app-avatar [name]="acct.display_name" [size]="28" [ariaHidden]="true"></app-avatar>
          </a>
        } @else {
          <a class="sign-pill" routerLink="/login">Sign In</a>
        }
      </nav>
    </header>
    <div class="bar-space"></div>
  `,
  styles: [`
    .bar { position: fixed; top: 0; left: 0; right: 0; height: 64px; z-index: 200;
      display: flex; align-items: center; padding: 0 24px;
      background: transparent; border: none; box-shadow: none; }
    .bar-space { height: 64px; }
    .inner { display: flex; align-items: center; gap: 24px; width: 100%; max-width: 1360px; margin: 0 auto; }
    .clock { font-size: 13px; line-height: 16px; color: var(--ink-36); font-variant-numeric: tabular-nums; }
    .spacer { flex: 1; }
    .sign-pill {
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 19px; padding: 8px 20px; min-height: 44px; text-decoration: none;
      background: rgba(21, 21, 21, 0.04); color: rgba(21, 21, 21, 0.64);
      border: 1px solid rgba(21, 21, 21, 0.08);
      font-size: 16px; line-height: 24px; font-weight: 500;
    }
    .sign-pill:hover { background: rgba(21, 21, 21, 0.64); color: #ffffff; border-color: rgba(21, 21, 21, 0.64); }
    .avatar-link { display: inline-flex; }
    @media (max-width: 650px) { .clock { display: none; } }
  `],
})
export class PublicBarComponent implements OnDestroy {
  clockTick: number | null = null;
  clockVal = formatClock(new Date());
  clock = () => this.clockVal;
  constructor(public auth: Auth) {
    const tick = () => {
      const d = new Date();
      this.clockVal = formatClock(d);
      const delay = 60000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      this.clockTick = window.setTimeout(tick, delay);
    };
    const d = new Date();
    this.clockTick = window.setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
  }
  ngOnDestroy() { if (this.clockTick) clearTimeout(this.clockTick); }
}

function formatClock(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const m = String(d.getMinutes()).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${h}:${m} ${ampm} GMT${sign}${oh}:${om}`;
}

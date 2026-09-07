import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { ApiService } from './api.service';
import { NoticeService } from './notice.service';
import { AvatarComponent, BrandMarkComponent } from './widgets';

/** The slim fixed bar every public route carries. */
@Component({
  selector: 'public-bar', standalone: true,
  imports: [RouterLink, BrandMarkComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topbar" role="banner">
      <a routerLink="/" class="brand-lockup" aria-label="Community Calendar home">
        <brand-mark [size]="18"></brand-mark>
        <span class="wordmark">Community Calendar</span>
      </a>
      <span class="bar-time" aria-hidden="true">{{ clock() }}</span>
      <nav class="bar-links" aria-label="Public">
        <a routerLink="/discover" class="link">Discover Events</a>
        <a routerLink="/app" class="link">Get the App</a>
      </nav>
      <span class="bar-spacer"></span>
      @if (api.account; as acct) {
        <a routerLink="/home" class="bar-account" [attr.aria-label]="'Your account, ' + acct.display_name">
          <cc-avatar [name]="acct.display_name" [size]="32"></cc-avatar>
        </a>
      } @else {
        <a routerLink="/login" class="chrome-signin">Sign In</a>
      }
    </header>
  `,
  styles: [`
    :host{display:block}
    .brand-lockup{display:inline-flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;font-size:17px;color:var(--ink)}
    .bar-time{font-size:13px;line-height:16px;color:var(--ink-3);font-variant-numeric:tabular-nums;min-width:170px}
    .bar-links{display:flex;gap:20px}
    .bar-spacer{flex:1}
    .bar-account{display:inline-flex;border-radius:100px}
    @media (max-width:900px){ .bar-time{display:none} }
    @media (max-width:649px){ .bar-links .link:first-child{display:none} }
  `],
})
export class PublicBarComponent {
  api = inject(ApiService);
  clock = signal('');

  constructor() {
    this.startClock();
  }

  private startClock() {
    const tick = () => this.clock.set(formatLocalNow());
    tick();
    const now = new Date();
    const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    setTimeout(() => { tick(); setInterval(tick, 60000); }, delay);
  }
}

export function formatLocalNow(): string {
  const d = new Date();
  let time = '';
  try {
    time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch { time = d.toISOString().slice(11, 16); }
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${time} GMT${sign}${hh}:${mm}`;
}

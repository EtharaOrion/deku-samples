import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { BehaviorSubject, interval, Observable, Subscription } from 'rxjs';
import { AuthService, type Account } from './api';
import { NoticeService } from './notice';
import { IconDirective } from './icons';

/** Brand mark: a four-pointed star with concave sides, drawn from geometry. */
@Component({
  selector: 'app-brand',
  standalone: true,
  template: `
    <svg viewBox="0 0 133 134" width="22" height="22" aria-hidden="true" focusable="false">
      <path fill="currentColor"
        d="M66.5 0c3.4 30.5 26 53.1 66.5 67-40.5 13.9-63.1 36.5-66.5 67-3.4-30.5-26-53.1-66.5-67C40.5 53.1 63.1 30.5 66.5 0Z" />
    </svg>
    <span class="wordmark">Deku</span>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 7px; color: inherit; }
    .wordmark { font-weight: 700; letter-spacing: -0.02em; font-size: 17px; line-height: 22px; }
    svg { margin-bottom: 2px; }
  `],
})
export class BrandMark {}

/** Live local time in the bar: `1:34 PM GMT+5:30`, on the minute. */
@Component({
  selector: 'app-local-time',
  standalone: true,
  template: `<span class="localtime" [attr.aria-label]="'Your time is ' + text">{{ text }}</span>`,
  styles: [`
    :host { display: inline-flex; }
    .localtime { font-size: 13px; line-height: 16px; color: var(--ink-36); font-variant-numeric: tabular-nums; }
  `],
})
export class LocalTimeComponent implements OnInit, OnDestroy {
  text = '';
  private sub?: Subscription;
  ngOnInit() {
    const tick = () => {
      const d = new Date();
      const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const off = -d.getTimezoneOffset();
      const sign = off >= 0 ? '+' : '-';
      const abs = Math.abs(off);
      const tz = `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
      this.text = `${time} ${tz}`;
    };
    tick();
    this.sub = interval(1000).subscribe(() => tick());
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }
}

/** Notices bar. */
@Component({
  selector: 'app-notices',
  standalone: true,
  template: `
    <div class="notice-stack" aria-live="polite">
      @for (n of notices; track n.id) {
        <div class="notice" [class.notice-success]="n.kind==='success'" [class.notice-warn]="n.kind==='warn'"
             [class.notice-danger]="n.kind==='danger'" role="status">
          <span>{{ n.text }}</span>
          <button type="button" class="notice-x" (click)="dismiss(n.id)" aria-label="Dismiss this message">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .notice-stack { position: fixed; right: 16px; bottom: 16px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
    .notice { position: static; }
    .notice-x { margin-left: auto; font-size: 18px; color: var(--ink-64); min-width: 32px; min-height: 32px; }
  `],
})
export class NoticesComponent {
  notices: any[] = [];
  private svc = inject(NoticeService);
  constructor() { this.svc.notices$.subscribe(n => (this.notices = n)); }
  dismiss(id: number) { this.svc.dismiss(id); }
}

/** Slim fixed bar on public routes. */
@Component({
  selector: 'app-public-bar',
  standalone: true,
  imports: [RouterLink, AsyncPipe, BrandMark, LocalTimeComponent, IconDirective],
  template: `
    <header class="bar">
      <a routerLink="/" class="brand" aria-label="Deku home"><app-brand /></a>
      <app-local-time />
      <nav class="bar-nav" aria-label="Main">
        <a routerLink="/discover" class="link">Discover Events</a>
      </nav>
      @if (account$ | async; as acct) {
        <a [routerLink]="acct.role === 'host' ? '/calendars' : '/home'" class="avatar-link" aria-label="Your account">
          <span class="avatar">{{ initial(acct.display_name) }}</span>
        </a>
      } @else {
        <a routerLink="/login" class="bar-action">Sign In</a>
      }
    </header>
  `,
  styles: [`
    .bar {
      position: fixed; top: 0; left: 0; right: 0; height: 64px; z-index: 200;
      display: flex; align-items: center; gap: 24px; padding: 0 24px;
      background: transparent; border: none; box-shadow: none;
    }
    .brand { color: var(--ink); display: inline-flex; align-items: center; }
    .bar-nav { display: flex; gap: 16px; margin-left: auto; }
    .avatar-link { display: inline-flex; }
    .avatar {
      width: 32px; height: 32px; border-radius: 100%;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--ink); color: var(--paper); font-size: 13px; font-weight: 600;
    }
  `],
})
export class PublicBarComponent {
  public auth = inject(AuthService);
  account$ = this.auth.account$;
  initial(name: string) { return (name?.trim()?.[0] ?? '?').toUpperCase(); }
}

/** Left rail for signed-in routes. */
@Component({
  selector: 'app-side-rail',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AsyncPipe, BrandMark, IconDirective],
  template: `
    <aside class="rail" [class.open]="drawerOpen" aria-label="Account navigation">
      <div class="rail-top">
        <a routerLink="/" class="brand" aria-label="Deku home"><app-brand /></a>
        <button type="button" class="rail-close" (click)="drawerOpen = false" aria-label="Close navigation"
                [hidden]="!isNarrow">✕</button>
      </div>
      <nav class="rail-nav">
        @for (item of items; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" class="rail-item"
             [attr.aria-current]="rla.isActive ? 'page' : null"
             #rla="routerLinkActive" (click)="drawerOpen = false">
            <svg [appIcon]="item.icon" [size]="20"></svg>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
      <div class="rail-foot">
        @if (account$ | async; as acct) {
          <a [routerLink]="acct.role === 'host' ? '/calendars' : '/home'" class="rail-account">
            <span class="avatar">{{ initial(acct.display_name) }}</span>
            <span class="rail-account-text">
              <span class="rail-account-name">{{ acct.display_name }}</span>
              <span class="rail-account-role">{{ acct.role === 'host' ? 'Host' : 'Guest' }}</span>
            </span>
          </a>
          <button type="button" class="rail-item rail-signout" (click)="signOut()">
            <svg [appIcon]="'logout'" [size]="20"></svg><span>Sign Out</span>
          </button>
        }
      </div>
    </aside>
    @if (drawerOpen) { <div class="rail-scrim" (click)="drawerOpen = false" aria-hidden="true"></div> }
  `,
  styles: [`
    :host { display: contents; }
    .rail {
      width: var(--rail-w); min-height: 100vh; position: sticky; top: 0;
      display: flex; flex-direction: column; gap: 16px; padding: 24px 16px;
      border-right: 1px solid var(--divider); background: var(--paper);
    }
    .rail-top { display: flex; align-items: center; justify-content: space-between; }
    .brand { color: var(--ink); }
    .rail-nav { display: flex; flex-direction: column; gap: 4px; }
    .rail-item {
      display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px;
      border-radius: 6px; color: var(--ink-64); font-size: 15px; line-height: 22px;
    }
    .rail-item:hover { background: var(--ink-04); color: var(--ink); }
    .rail-item.active { background: var(--ink-04); color: var(--ink); font-weight: 600; }
    .rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
    .rail-account { display: flex; gap: 10px; align-items: center; padding: 8px 12px; border-radius: 6px; color: var(--ink); }
    .rail-account:hover { background: var(--ink-04); }
    .rail-account-text { display: flex; flex-direction: column; }
    .rail-account-name { font-size: 14px; line-height: 18px; font-weight: 500; }
    .rail-account-role { font-size: 11px; line-height: 16px; color: var(--muted); }
    .avatar {
      width: 28px; height: 28px; border-radius: 100%; background: var(--ink); color: var(--paper);
      display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;
    }
    .rail-signout { width: 100%; text-align: left; }
    .rail-close { display: none; }
    .rail-scrim { display: none; }
    @media (max-width: 999px) {
      .rail {
        position: fixed; top: 0; bottom: 0; left: 0; z-index: 1000;
        transform: translateX(-100%); transition: transform .3s var(--ease);
      }
      .rail.open { transform: none; }
      .rail-close { display: inline-flex; }
      .rail-scrim { display: block; position: fixed; inset: 0; z-index: 999; background: rgba(21,21,21,.8); }
    }
  `],
})
export class SideRailComponent implements OnInit, OnDestroy {
  @Input() items: { path: string; label: string; icon: string }[] = [];
  @Input() isNarrow = false;
  drawerOpen = false;
  private auth = inject(AuthService);
  private router = inject(Router);
  account$: Observable<Account | null> = this.auth.account$;
  ngOnInit() {}
  ngOnDestroy() {}
  initial(name: string) { return (name?.trim()?.[0] ?? '?').toUpperCase(); }
  signOut() {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}

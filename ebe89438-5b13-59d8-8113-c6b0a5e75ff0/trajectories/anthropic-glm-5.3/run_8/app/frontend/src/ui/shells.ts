import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api, homeFor } from '../api';
import { Toast } from '../domain';
import { Brand, Clock } from './brand';
import { Avatar, Notices } from './bits';
import { Icon } from './icon';

/**
 * The slim fixed public bar: brand lockup, the visitor's live local time, a
 * Discover link and a Sign In pill that becomes the account avatar.
 */
@Component({
  selector: 'g-public-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="bar">
      <g-brand />
      <div class="grow"></div>
      <g-clock />
      <nav class="bar-nav" aria-label="Main">
        <a routerLink="/discover" class="bar-link">Discover Events</a>
        @if (api.account(); as acct) {
          <a [routerLink]="homeFor(acct)" class="avatar-link" [attr.aria-label]="'Your account, ' + acct.display_name">
            <g-avatar [name]="acct.display_name" size="lg" />
          </a>
        } @else {
          <a routerLink="/login" class="btn btn-primary btn-pill btn-sm">Sign In</a>
        }
      </nav>
    </header>
    <div class="bar-spacer"></div>
    <main id="main" class="shell-main"><router-outlet /></main>
    <footer class="foot">
      <span>Gather — events start here.</span>
      <nav aria-label="Legal">
        <a routerLink="/app">Get the App</a> ·
        <a routerLink="/legal">Terms</a>
      </nav>
    </footer>
    <g-notices />
  `,
  imports: [RouterOutlet, RouterLink, Brand, Clock, Avatar, Notices],
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    .grow { flex: 1; }
    .bar-nav { display: flex; align-items: center; gap: 20px; }
    .bar-link { font-size: 14px; line-height: 20px; color: var(--ink-64); text-decoration: none; padding: 10px 0; }
    @media (hover: hover) { .bar-link:hover { color: var(--ink); } }
    .avatar-link { display: inline-flex; padding: 8px; border-radius: 100px; }
    @media (max-width: 650px) {
      g-clock { display: none; }
      .bar { padding: 0 16px; gap: 12px; }
    }
  `],
})
export class PublicShell {
  api = inject(Api);
  homeFor = homeFor;
}

/**
 * The signed-in shell: a persistent left rail of 260px that collapses below
 * 1000px to a 56px icon bar opening a scrim-backed drawer.
 */
@Component({
  selector: 'g-app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="frame">
      <aside class="rail" [class.open]="drawerOpen()">
        <div class="rail-head">
          <g-brand />
          <button class="btn btn-quiet btn-sm rail-close" (click)="drawerOpen.set(false)" aria-label="Close menu">
            <g-icon name="close" [size]="18" />
          </button>
        </div>
        <nav class="rail-nav" aria-label="Account">
          @for (item of items(); track item.path) {
            <a [routerLink]="item.path" class="nav-item" routerLinkActive="active"
               [attr.aria-current]="isCurrent(item.path) ? 'page' : null">
              <g-icon [name]="item.icon" [size]="20" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="rail-foot">
          <div class="account row">
            <g-avatar [name]="api.account()?.display_name ?? 'G'" size="lg" />
            <div class="account-text">
              <div class="t-row strong">{{ api.account()?.display_name }}</div>
              <div class="t-caption">{{ api.account()?.email }}</div>
            </div>
          </div>
          <button class="btn btn-quiet btn-sm wide" (click)="signOut()">Sign out</button>
        </div>
      </aside>
      @if (drawerOpen()) {
        <div class="rail-scrim" (click)="drawerOpen.set(false)"></div>
      }
      <div class="rail-bar">
        <button class="btn btn-quiet btn-sm" (click)="drawerOpen.set(true)" aria-label="Open menu">
          <g-icon name="menu" [size]="20" />
        </button>
        <g-brand />
        <div class="grow"></div>
        <g-avatar [name]="api.account()?.display_name ?? 'G'" size="lg" />
      </div>
      <main id="main" class="shell-main content-col"><router-outlet /></main>
    </div>
    <g-notices />
  `,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand, Avatar, Notices, Icon],
  styles: [`
    :host { display: block; min-height: 100vh; }
    .frame { display: flex; min-height: 100vh; }
    .rail {
      width: 260px; flex: none; display: flex; flex-direction: column; gap: 24px;
      padding: 24px 16px; position: sticky; top: 0; height: 100vh;
      border-right: 1px solid var(--divider); background: var(--paper);
    }
    .rail-head { display: flex; align-items: center; justify-content: space-between; padding: 0 8px; }
    .rail-close { display: none; }
    .rail-nav { display: flex; flex-direction: column; gap: 4px; }
    .nav-item {
      display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px;
      border-radius: 6px; text-decoration: none; color: var(--ink-64); font-size: 15px; line-height: 22px;
    }
    @media (hover: hover) { .nav-item:hover { background: var(--ink-04); color: var(--ink); } }
    .nav-item.active { background: var(--ink); color: var(--paper); font-weight: 500; }
    .rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 4px; }
    .account { gap: 10px; padding: 8px; }
    .account-text { min-width: 0; }
    .strong { font-weight: 500; }
    .wide { justify-content: flex-start; }
    .rail-bar { display: none; }
    .rail-scrim { display: none; }
    .content-col { padding: 32px 48px 64px; max-width: 1080px; width: 100%; margin: 0 auto; }
    .grow { flex: 1; }

    @media (max-width: 999px) {
      .rail {
        position: fixed; z-index: var(--z-menu); left: 0; top: 0; bottom: 0;
        transform: translateX(-100%); transition: transform 0.3s var(--ease);
        box-shadow: var(--shadow-card);
      }
      .rail.open { transform: none; }
      .rail-close { display: inline-flex; }
      .rail-scrim {
        display: block; position: fixed; inset: 0; z-index: calc(var(--z-menu) - 1);
        background: rgba(21, 21, 21, 0.8);
      }
      .rail-bar {
        display: flex; align-items: center; gap: 16px; position: fixed; top: 0; left: 0; right: 0;
        height: 56px; z-index: var(--z-bar); padding: 0 12px;
        background: var(--paper); border-bottom: 1px solid var(--divider);
      }
      .content-col { padding: 80px 16px 48px; }
    }
  `],
})
export class AppShell {
  api = inject(Api);
  private router = inject(Router);
  drawerOpen = signal(false);

  items = computed(() => {
    const acct = this.api.account();
    if (!acct) return [];
    const base = [
      { path: '/home', label: 'Home', icon: 'home' },
      { path: '/discover', label: 'Discover', icon: 'search' },
      { path: '/settings/profile', label: 'Settings', icon: 'settings' },
    ];
    if (acct.role === 'host') {
      base.splice(0, 1, { path: '/calendars', label: 'Calendars', icon: 'calendar' }, { path: '/create', label: 'Create', icon: 'plus' });
    }
    return base;
  });

  isCurrent(path: string): boolean {
    return this.router.url === path || this.router.url.startsWith(path + '/');
  }

  signOut(): void {
    this.api.logout();
    this.router.navigate(['/']);
  }
}

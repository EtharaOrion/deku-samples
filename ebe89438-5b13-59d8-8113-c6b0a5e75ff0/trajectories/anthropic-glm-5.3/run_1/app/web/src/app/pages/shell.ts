import { Component, signal, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs';
import { BrandComponent } from '../brand';
import { AvatarComponent } from '../avatar';
import { Auth } from '../auth';
import { Api } from '../api';

/**
 * The signed-in shell: a 260px persistent left rail above 1000px, a 56px icon
 * bar with a scrim-backed drawer below it. The rail never scrolls.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, BrandComponent, AvatarComponent, CommonModule],
  template: `
    <div class="shell">
      <aside class="rail" [attr.aria-label]="'Signed in navigation'" [class.open]="drawerOpen()">
        <div class="rail-top">
          <app-brand></app-brand>
          <button class="icon-btn" type="button" (click)="drawerOpen.set(false)" aria-label="Close navigation">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>
          </button>
        </div>
        <nav class="rail-nav" aria-label="Your destinations">
          @for (item of items(); track item.path) {
            <a class="nav-item" [routerLink]="item.path" routerLinkActive="active" (click)="drawerOpen.set(false)"
               [attr.aria-current]="router.url === item.path ? 'page' : null">
              <span class="nav-dot" aria-hidden="true"></span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="rail-foot">
          <button class="account" type="button" (click)="logout()" aria-label="Sign out">
            <app-avatar [name]="auth.account()?.display_name || '?'" [size]="28"></app-avatar>
            <span class="account-text">
              <span class="account-name">{{ auth.account()?.display_name }}</span>
              <span class="account-role">{{ auth.account()?.role === 'host' ? 'Host' : 'Guest' }} · Sign out</span>
            </span>
          </button>
        </div>
      </aside>
      @if (drawerOpen()) {
        <div class="drawer-scrim" (click)="drawerOpen.set(false)" aria-hidden="true"></div>
      }
      <div class="content-col">
        <button class="mobile-bar" type="button" (click)="drawerOpen.set(true)" aria-label="Open navigation">
          <app-brand></app-brand>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 7 H20 M4 12 H20 M4 17 H20"/></svg>
        </button>
        <div class="content"><router-outlet></router-outlet></div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .shell { display: flex; min-height: 100vh; }
    .rail { width: 260px; flex: none; border-right: 1px solid var(--divider); padding: 20px 16px; display: flex; flex-direction: column; gap: 24px; position: sticky; top: 0; height: 100vh; background: var(--paper); }
    .rail-top { display: flex; justify-content: space-between; align-items: center; }
    .icon-btn { display: none; }
    .rail-nav { display: flex; flex-direction: column; gap: 4px; }
    .nav-item { display: flex; align-items: center; gap: 10px; border-radius: 6px; padding: 10px 12px; text-decoration: none; color: var(--ink-64); font-size: 15px; line-height: 22px; min-height: 44px; }
    .nav-item:hover { background: var(--ink-04); color: var(--ink); }
    .nav-item.active { background: var(--ink); color: var(--paper); }
    .nav-dot { width: 6px; height: 6px; border-radius: 100%; background: currentColor; opacity: .35; flex: none; }
    .nav-item.active .nav-dot { opacity: 1; }
    .rail-foot { margin-top: auto; }
    .account { display: flex; gap: 10px; align-items: center; background: none; border: 0; padding: 8px; border-radius: 8px; cursor: pointer; width: 100%; text-align: left; color: var(--ink); }
    .account:hover { background: var(--ink-04); }
    .account-text { display: flex; flex-direction: column; align-items: flex-start; }
    .account-name { font-size: 14px; line-height: 18px; font-weight: 500; }
    .account-role { font-size: 11px; line-height: 16px; color: var(--muted); }
    .content-col { flex: 1; min-width: 0; }
    .content { padding: 32px 40px; max-width: 1080px; }
    .mobile-bar { display: none; }
    .drawer-scrim { display: none; }
    @media (max-width: 1000px) {
      .rail { position: fixed; z-index: 1000; left: 0; top: 0; bottom: 0; transform: translateX(-100%); transition: transform .3s var(--ease-panel); }
      .rail.open { transform: translateX(0); }
      .icon-btn { display: inline-flex; background: none; border: 0; padding: 8px; color: var(--ink); }
      .drawer-scrim { display: block; position: fixed; inset: 0; background: rgba(21,21,21,.8); z-index: 999; }
      .mobile-bar { display: flex; align-items: center; justify-content: space-between; position: fixed; top: 0; left: 0; right: 0; height: 56px; z-index: 200; background: var(--paper); border-bottom: 1px solid var(--divider); padding: 0 16px; }
      .content { padding: 80px 16px 32px; }
    }
  `],
})
export class ShellComponent implements OnDestroy {
  drawerOpen = signal(false);
  private sub: any;

  constructor(public auth: Auth, public router: Router, private api: Api) {
    this.sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.drawerOpen.set(false));
  }

  items() {
    const role = this.auth.account()?.role;
    if (role === 'host') return [
      { path: '/calendars', label: 'Calendars' },
      { path: '/create', label: 'Create' },
      { path: '/discover', label: 'Discover' },
      { path: '/settings/profile', label: 'Settings' },
    ];
    return [
      { path: '/home', label: 'Home' },
      { path: '/discover', label: 'Discover' },
      { path: '/settings/profile', label: 'Settings' },
    ];
  }

  logout() {
    this.auth.clear();
    this.router.navigateByUrl('/');
  }

  ngOnDestroy() { if (this.sub) this.sub.unsubscribe(); }
}

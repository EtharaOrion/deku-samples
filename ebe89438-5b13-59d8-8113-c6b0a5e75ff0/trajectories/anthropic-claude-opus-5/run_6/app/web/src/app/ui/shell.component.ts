import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BrandComponent } from './brand.component';
import { AvatarComponent } from './avatar.component';
import { AuthService } from '../core/auth.service';

/**
 * One shell for every signed-in route: a persistent left rail of 260px that
 * collapses below 1000px to a 56px icon bar opening as a scrim-backed drawer.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandComponent, AvatarComponent],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="shell">
      <button type="button" class="drawer-toggle" (click)="drawerOpen.set(true)"
              aria-label="Open navigation" [attr.aria-expanded]="drawerOpen()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      @if (drawerOpen()) {
        <div class="drawer-scrim" (click)="drawerOpen.set(false)"></div>
      }

      <nav class="rail" [class.open]="drawerOpen()" aria-label="Main">
        <div class="rail-top">
          <app-brand />
          @if (drawerOpen()) {
            <button type="button" class="close" (click)="drawerOpen.set(false)" aria-label="Close navigation">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          }
        </div>
        <ul class="nav">
          @for (item of items(); track item.path) {
            <li>
              <a class="nav-item" [routerLink]="item.path" routerLinkActive="current"
                 [routerLinkActiveOptions]="{ exact: item.exact }"
                 #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null"
                 (click)="drawerOpen.set(false)">
                <span class="glyph" aria-hidden="true" [innerHTML]="item.icon"></span>
                <span>{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>
        <div class="account">
          <app-avatar [name]="auth.account()?.display_name || ''" [size]="32" [decorative]="true" />
          <div class="who">
            <span class="t-caption name">{{ auth.account()?.display_name }}</span>
            <span class="t-badge role">{{ auth.account()?.role }}</span>
          </div>
          <button type="button" class="btn btn-quiet btn-sm signout" (click)="auth.logout()">Sign Out</button>
        </div>
      </nav>

      <div class="content">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [`
    .shell { min-height: 100vh; display: grid; grid-template-columns: 260px 1fr; }
    .rail {
      position: fixed; top: 0; bottom: 0; width: 260px; padding: 24px 16px;
      display: flex; flex-direction: column; gap: 24px;
      border-right: 1px solid var(--divider); background: var(--paper); overflow: hidden;
    }
    .rail-top { display: flex; align-items: center; justify-content: space-between; }
    .nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .nav-item {
      display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px;
      border-radius: var(--r-nav); color: var(--ink-64); font-size: 15px;
      transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
    }
    @media (hover: hover) { .nav-item:hover { background: var(--ink-04); color: var(--ink); } }
    .nav-item.current { background: var(--ink-04); color: var(--ink); font-weight: 500; }
    .glyph { display: inline-flex; width: 20px; }
    .account { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--divider); padding-top: 16px; }
    .who { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .role { color: var(--muted); }
    .signout { padding: 0 8px; }
    .content { grid-column: 2; min-width: 0; }
    .drawer-toggle { display: none; }
    .drawer-scrim { display: none; }
    @media (max-width: 999px) {
      .shell { grid-template-columns: 56px 1fr; }
      .rail { width: 56px; padding: 16px 8px; align-items: center; }
      .rail .nav-item span:last-child, .rail .who, .rail .signout { display: none; }
      .rail .nav-item { justify-content: center; padding: 0; }
      .rail.open {
        width: 260px; padding: 24px 16px; align-items: stretch; z-index: var(--z-scrim);
        box-shadow: var(--elev-primary);
      }
      .rail.open .nav-item span:last-child, .rail.open .who, .rail.open .signout { display: inline-flex; }
      .rail.open .nav-item { justify-content: flex-start; padding: 0 12px; }
      .drawer-toggle {
        display: inline-flex; position: fixed; left: 8px; bottom: 16px; z-index: var(--z-menu);
        width: 40px; height: 40px; align-items: center; justify-content: center;
        border-radius: var(--r-nav); border: 1px solid var(--ink-08); background: var(--paper); cursor: pointer;
      }
      .drawer-scrim { display: block; position: fixed; inset: 0; background: var(--ink-80); z-index: var(--z-scrim); }
    }
  `],
})
export class ShellComponent {
  auth = inject(AuthService);
  drawerOpen = signal(false);

  private icon = {
    home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z"/></svg>',
    calendars: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    create: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    discover: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    settings: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/></svg>',
  };

  items = () => this.auth.isHost()
    ? [
        { path: '/calendars', label: 'Calendars', icon: this.icon.calendars, exact: false },
        { path: '/create', label: 'Create', icon: this.icon.create, exact: false },
        { path: '/discover', label: 'Discover', icon: this.icon.discover, exact: false },
        { path: '/settings/profile', label: 'Settings', icon: this.icon.settings, exact: false },
      ]
    : [
        { path: '/home', label: 'Home', icon: this.icon.home, exact: false },
        { path: '/discover', label: 'Discover', icon: this.icon.discover, exact: false },
        { path: '/settings/profile', label: 'Settings', icon: this.icon.settings, exact: false },
      ];

  @HostListener('document:keydown.escape')
  onEscape() { this.drawerOpen.set(false); }
}

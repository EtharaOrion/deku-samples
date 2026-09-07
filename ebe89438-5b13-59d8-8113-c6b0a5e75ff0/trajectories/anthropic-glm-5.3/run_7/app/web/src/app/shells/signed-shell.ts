import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Api } from '../core/api';
import { BrandMarkComponent } from '../ui/brand-mark';
import { AvatarComponent } from '../ui/avatar';
import { ClockComponent } from './public-shell';

type NavItem = { label: string; path: string; icon: string };

/**
 * One shell for every signed-in route: a persistent left rail of 260px that
 * collapses below 1000px to an icon bar opening a scrim-backed drawer.
 */
@Component({
  selector: 'app-signed-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent, AvatarComponent, ClockComponent],
  template: `
    <div class="layout">
      <aside class="rail" [class.open]="drawer()" aria-label="Signed in navigation">
        <a class="brand" routerLink="/" (click)="drawer.set(false)" aria-label="Community Calendar home">
          <app-brand-mark [size]="18" /><span class="word">Calendar</span>
        </a>
        <nav class="destinations">
          @for (item of items(); track item.path) {
            <a [routerLink]="item.path" class="item" [class.current]="isCurrent(item.path)"
               [attr.aria-current]="isCurrent(item.path) ? 'page' : null"
               (click)="drawer.set(false)">
              <span class="glyph" [innerHTML]="item.icon"></span>
              <span class="label">{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="account">
          <app-avatar [name]="name()" [size]="28" [label]="name()" />
          <div class="who">
            <span class="nm">{{ name() }}</span>
            <span class="hd">@{{ handle() }}</span>
          </div>
          <button type="button" class="out" (click)="signOut()" aria-label="Sign out">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h9M13 12h7.5M17.5 8.5 21 12l-3.5 3.5"/></svg>
          </button>
        </div>
      </aside>

      @if (drawer()) {
        <div class="scrim" (click)="drawer.set(false)" aria-hidden="true"></div>
      }

      <main class="content"><ng-content /></main>
    </div>

    <div class="iconbar">
      <a routerLink="/" aria-label="Community Calendar home"><app-brand-mark [size]="18" /></a>
      @for (item of items(); track item.path) {
        <a [routerLink]="item.path" class="ic" [class.current]="isCurrent(item.path)"
           [attr.aria-current]="isCurrent(item.path) ? 'page' : null"
           [attr.aria-label]="item.label" (click)="drawer.set(false)">
          <span [innerHTML]="item.icon"></span>
        </a>
      }
      <button type="button" class="ic" (click)="toggleDrawer()" aria-label="Open navigation menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .layout { display: block; min-height: 100vh; }
    .rail {
      position: fixed; top: 0; left: 0; bottom: 0; width: 260px; padding: 20px 16px;
      display: flex; flex-direction: column; gap: 24px; background: var(--panel);
      z-index: var(--z-menu); overflow-y: auto;
    }
    .brand { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--ink); padding: 4px 8px; }
    .brand .word { font: 700 16px/24px var(--sans); letter-spacing: -0.02em; }
    .destinations { display: flex; flex-direction: column; gap: 4px; }
    .item {
      display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 10px;
      border-radius: var(--r-nav); text-decoration: none; color: var(--ink-64);
      font-size: 15px; line-height: 22px;
    }
    .item.current { background: var(--ink-04); color: var(--ink); font-weight: 600; }
    .glyph, .ic span { display: inline-flex; }
    .glyph :svg { display: block; }
    .account { margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 8px; }
    .who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .nm { font-size: 14px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hd { font-size: 12px; line-height: 16px; color: var(--muted); }
    .out { border: none; background: none; color: var(--ink-64); cursor: pointer; padding: 8px; border-radius: var(--r-nav); min-height: 44px; }
    .content { margin-left: 260px; padding: 32px 32px 64px; }
    .iconbar { display: none; }
    .scrim { position: fixed; inset: 0; background: var(--ink-80); z-index: calc(var(--z-menu) - 1); }

    @media (max-width: 999px) {
      .rail {
        transform: translateX(-100%); transition: transform var(--dur) var(--ease);
        width: min(300px, 84vw); box-shadow: var(--shadow-primary);
      }
      .rail.open { transform: none; }
      .content { margin-left: 0; padding: 64px 16px 96px; }
      .iconbar {
        display: flex; align-items: center; gap: 8px; position: fixed; top: 0; left: 0; right: 0;
        height: 56px; padding: 0 12px; background: var(--panel); z-index: var(--z-bar);
        border-bottom: 1px solid var(--divider);
      }
      .iconbar > a { display: inline-flex; padding: 8px; border-radius: var(--r-nav); color: var(--ink); }
      .ic {
        display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px;
        border: none; background: none; color: var(--ink-64); border-radius: var(--r-nav); cursor: pointer;
        text-decoration: none;
      }
      .ic.current { background: var(--ink-04); color: var(--ink); }
    }
  `],
})
export class SignedShellComponent {
  api = inject(Api);
  private router = inject(Router);
  drawer = signal(false);
  current = signal(this.router.url);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.current.set((e as NavigationEnd).urlAfterRedirects);
    });
  }

  name = computed(() => this.api.account()?.display_name ?? 'You');
  handle = computed(() => this.api.account()?.handle ?? '');

  items = computed<NavItem[]>(() => {
    const base: NavItem[] = [{ label: 'Discover', path: '/discover', icon: ICONS.search }];
    const host = this.api.isHost();
    const own: NavItem[] = host
      ? [
          { label: 'Calendars', path: '/calendars', icon: ICONS.calendar },
          { label: 'Create', path: '/create', icon: ICONS.plus },
          { label: 'Discover', path: '/discover', icon: ICONS.search },
          { label: 'Settings', path: '/settings/profile', icon: ICONS.gear },
        ]
      : [
          { label: 'Home', path: '/home', icon: ICONS.home },
          { label: 'Discover', path: '/discover', icon: ICONS.search },
          { label: 'Settings', path: '/settings/profile', icon: ICONS.gear },
        ];
    void base;
    return own;
  });

  isCurrent(path: string): boolean {
    const url = this.current();
    if (path === '/discover') return url === '/discover' || url.startsWith('/discover?');
    return url === path || url.startsWith(path + '/');
  }

  toggleDrawer() { this.drawer.update((v) => !v); }

  signOut() {
    this.api.logout();
    this.router.navigate(['/']);
  }
}

const ICONS = {
  home: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4.5 20 11M6 9.8V19.5h12V9.8"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M8 4v4M16 4v4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.2"/><path d="m15.6 15.6 4 4"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3.8v2.4M12 17.8v2.4M4.6 7.8l2 1.2M17.4 15l2 1.2M4.6 16.2l2-1.2M17.4 9l2-1.2"/></svg>`,
};

import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from '../core/api';
import { ThemeService } from '../core/theme';
import { IconComponent } from '../ui/icons';
import { AvatarComponent, BrandComponent } from '../ui/kit';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

/**
 * Every signed-in route sits inside one shell: a persistent left rail of 260px
 * at 1000px and above, collapsing below that to a 56px bar of icons that opens
 * as a scrim-backed drawer trapping focus and closing on the escape key.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    BrandComponent,
    AvatarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>

    <div class="shell" [class.drawer-open]="drawerOpen()">
      @if (drawerOpen()) {
        <div class="scrim" (click)="closeDrawer()" aria-hidden="true"></div>
      }

      <nav class="rail" aria-label="Main">
        <div class="rail-head">
          <app-brand [size]="18" [word]="wide()"></app-brand>
        </div>

        <ul class="nav">
          @for (item of items(); track item.path) {
            <li>
              <a
                [routerLink]="item.path"
                routerLinkActive="current"
                #rla="routerLinkActive"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                (click)="closeDrawer()"
              >
                <app-icon [name]="item.icon" [size]="20" hue="currentColor"></app-icon>
                <span class="label">{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>

        <div class="rail-foot">
          @if (account(); as me) {
            <a class="account" routerLink="/settings/profile" (click)="closeDrawer()">
              <app-avatar [name]="me.display_name" [size]="32"></app-avatar>
              <span class="who">
                <span class="name">{{ me.display_name }}</span>
                <span class="role">{{ me.role === 'host' ? 'Host' : 'Guest' }}</span>
              </span>
            </a>
            <button type="button" class="sign-out" (click)="signOut()">
              <app-icon name="logout" [size]="18" hue="currentColor"></app-icon>
              <span class="label">Sign Out</span>
            </button>
          }
        </div>
      </nav>

      <div class="body">
        <div class="mobile-bar">
          <button
            type="button"
            class="menu-btn"
            (click)="toggleDrawer()"
            [attr.aria-expanded]="drawerOpen()"
          >
            <app-icon name="menu" [size]="22" hue="currentColor"></app-icon>
            <span class="sr-only">Open the navigation menu</span>
          </button>
          <app-brand [size]="16"></app-brand>
        </div>

        <main class="content" id="main">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        min-height: 100vh;
        background: var(--paper);
      }

      /* The rail never scrolls with the content. */
      .rail {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        width: 260px;
        display: flex;
        flex-direction: column;
        padding: 24px 16px;
        border-right: 1px solid var(--ink-08);
        background: var(--paper);
        z-index: var(--z-menu);
      }
      .rail-head {
        padding: 0 8px 24px;
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .nav a {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        padding: 0 12px;
        border-radius: var(--r-nav);
        color: var(--ink-64);
        font-size: 15px;
        line-height: 22px;
        font-weight: 500;
      }
      @media (hover: hover) {
        .nav a:hover { background: var(--ink-04); color: var(--ink); }
      }
      /* The current destination is a filled item, never colour alone. */
      .nav a.current {
        background: var(--ink-04);
        color: var(--ink);
        font-weight: 600;
      }
      .rail-foot {
        border-top: 1px solid var(--ink-08);
        padding-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .account {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: var(--r-nav);
        color: var(--ink);
        min-height: 44px;
      }
      @media (hover: hover) {
        .account:hover { background: var(--ink-04); }
      }
      .who { display: flex; flex-direction: column; min-width: 0; }
      .name {
        font-size: 15px;
        line-height: 20px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .role { font-size: 11px; line-height: 16px; color: var(--ink-36); }
      .sign-out {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        padding: 0 12px;
        border: none;
        background: none;
        border-radius: var(--r-nav);
        color: var(--ink-64);
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        text-align: left;
      }
      @media (hover: hover) {
        .sign-out:hover { background: var(--ink-04); color: var(--ink); }
      }

      .body {
        flex: 1;
        margin-left: 260px;
        min-width: 0;
      }
      .content {
        padding: 48px 32px 96px;
        max-width: 1260px;
      }
      .mobile-bar { display: none; }

      /* Below the desktop switch the rail is a 56px icon bar with a drawer. */
      @media (max-width: 999px) {
        .rail {
          width: 56px;
          padding: 16px 8px;
          align-items: center;
        }
        .rail-head { padding: 0 0 16px; }
        .nav a { justify-content: center; padding: 0; width: 40px; }
        .nav .label { display: none; }
        .account { justify-content: center; padding: 8px; }
        .who { display: none; }
        .sign-out { justify-content: center; padding: 0; }
        .sign-out .label { display: none; }
        .body { margin-left: 56px; }
        .content { padding: 24px 24px 96px; }

        .drawer-open .rail {
          width: 260px;
          align-items: stretch;
          padding: 24px 16px;
          box-shadow: var(--shadow-primary);
        }
        .drawer-open .rail .label { display: inline; }
        .drawer-open .rail .nav a { justify-content: flex-start; padding: 0 12px; width: auto; }
        .drawer-open .rail .who { display: flex; }
        .drawer-open .rail .account { justify-content: flex-start; padding: 8px 12px; }
        .drawer-open .rail .sign-out { justify-content: flex-start; padding: 0 12px; }
        .scrim {
          position: fixed;
          inset: 0;
          background: rgba(21, 21, 21, 0.8);
          z-index: calc(var(--z-menu) - 1);
        }
        .mobile-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          height: 56px;
          padding: 0 16px;
          border-bottom: 1px solid var(--ink-08);
        }
        .menu-btn {
          width: 44px;
          height: 44px;
          border: none;
          background: none;
          border-radius: var(--r-nav);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--ink);
        }
      }
      @media (max-width: 649px) {
        .content { padding: 16px 16px 96px; }
      }
    `,
  ],
})
export class AppShellComponent {
  private api = inject(Api);
  private router = inject(Router);
  private theme = inject(ThemeService);

  readonly account = this.api.account;
  readonly drawerOpen = signal(false);
  readonly wide = signal(window.innerWidth >= 1000);

  /** A guest sees Home, Discover and Settings; a host sees Calendars, Create, Discover, Settings. */
  readonly items = computed<NavItem[]>(() => {
    const role = this.account()?.role;
    if (role === 'host') {
      return [
        { path: '/calendars', label: 'Calendars', icon: 'calendar' },
        { path: '/create', label: 'Create', icon: 'create' },
        { path: '/discover', label: 'Discover', icon: 'discover' },
        { path: '/settings/profile', label: 'Settings', icon: 'settings' },
      ];
    }
    return [
      { path: '/home', label: 'Home', icon: 'home' },
      { path: '/discover', label: 'Discover', icon: 'discover' },
      { path: '/settings/profile', label: 'Settings', icon: 'settings' },
    ];
  });

  constructor() {
    // The signed-in screens are never themed by an event.
    this.theme.clear();
  }

  toggleDrawer() {
    this.drawerOpen.update((v) => !v);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.drawerOpen()) this.closeDrawer();
  }

  @HostListener('window:resize')
  onResize() {
    this.wide.set(window.innerWidth >= 1000);
    if (window.innerWidth >= 1000) this.drawerOpen.set(false);
  }

  /** Logout returns to /. */
  signOut() {
    this.api.logout();
    this.router.navigateByUrl('/');
  }
}

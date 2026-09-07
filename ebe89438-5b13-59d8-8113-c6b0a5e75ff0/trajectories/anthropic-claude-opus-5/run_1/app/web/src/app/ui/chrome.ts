import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../core/auth';
import { visitorClock } from '../core/timefmt';
import { Avatar, Brand, Icon } from './icons';

/**
 * One fixed bar on every public route: transparent over the page ground, no
 * border and no shadow, 64px tall at depth 200.
 */
@Component({
  selector: 'app-public-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Brand, Avatar],
  template: `
    <header class="bar">
      <app-brand [size]="18" />
      <div class="bar-right">
        <!-- the anchor for every time the product shows -->
        <span class="clock t-caption" aria-label="Your local time">{{ clock() }}</span>
        <a class="bar-link t-body" routerLink="/discover">Discover Events</a>
        @if (auth.signedIn()) {
          <a class="bar-account" [routerLink]="auth.landingRoute()" [attr.aria-label]="'Your account, ' + auth.account()!.display_name">
            <app-avatar [name]="auth.account()!.display_name" [size]="32" />
          </a>
        } @else {
          <a class="btn btn-pill bar-signin" routerLink="/login">Sign In</a>
        }
      </div>
    </header>
  `,
  styles: [
    `
      .bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 64px;
        z-index: var(--z-bar);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        padding: 0 var(--s5);
        background: transparent;
        border: 0;
        box-shadow: none;
        color: var(--ink);
      }
      .bar-right {
        display: flex;
        align-items: center;
        gap: var(--s4);
      }
      .clock {
        color: var(--ink-tertiary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .bar-link {
        color: var(--ink-secondary);
        white-space: nowrap;
      }
      @media (hover: hover) {
        .bar-link:hover {
          color: var(--ink);
        }
      }
      .bar-signin {
        min-height: 44px;
        padding: 0 var(--s4);
      }
      .bar-account {
        display: inline-flex;
        min-width: 44px;
        min-height: 44px;
        align-items: center;
        justify-content: center;
      }
      @media (max-width: 649px) {
        .bar {
          padding: 0 var(--s4);
          gap: var(--s2);
        }
        .clock {
          display: none;
        }
      }
    `,
  ],
})
export class PublicBar implements OnDestroy {
  readonly auth = inject(Auth);
  readonly clock = signal(visitorClock());
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scheduleOnTheMinute();
  }

  /** Updates once a minute, on the minute. */
  private scheduleOnTheMinute() {
    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    this.timer = setTimeout(() => {
      this.clock.set(visitorClock());
      this.scheduleOnTheMinute();
    }, Math.max(500, delay));
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

/**
 * The signed-in shell: a persistent left rail of 260px at 1000px and above,
 * collapsing to a 56px icon bar with a scrim-backed drawer below that.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Brand, Icon, Avatar],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="shell" [class.drawer-open]="drawerOpen()">
      <button
        type="button"
        class="drawer-toggle"
        (click)="drawerOpen.set(true)"
        aria-label="Open the navigation menu"
        [attr.aria-expanded]="drawerOpen()"
      >
        <app-icon name="menu" [size]="22" />
      </button>

      @if (drawerOpen()) {
        <div class="drawer-scrim" (click)="drawerOpen.set(false)"></div>
      }

      <nav class="rail" aria-label="Main">
        <div class="rail-top">
          <app-brand [size]="18" />
          <button
            type="button"
            class="drawer-close"
            (click)="drawerOpen.set(false)"
            aria-label="Close the navigation menu"
          >
            <app-icon name="close" [size]="20" />
          </button>
        </div>
        <ul class="rail-nav">
          @for (item of items(); track item.path) {
            <li>
              <a
                class="rail-item interactive"
                [routerLink]="item.path"
                routerLinkActive="rail-item-current"
                [routerLinkActiveOptions]="{ exact: item.path === '/home' }"
                #rla="routerLinkActive"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                (click)="drawerOpen.set(false)"
              >
                <app-icon [name]="item.icon" [size]="20" />
                <span>{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>
        <div class="rail-account">
          <app-avatar [name]="auth.account()?.display_name ?? ''" [size]="32" />
          <span class="rail-account-text">
            <span class="rail-name t-caption">{{ auth.account()?.display_name }}</span>
            <span class="rail-role t-badge">{{ auth.account()?.role === 'host' ? 'Host' : 'Guest' }}</span>
          </span>
          <button type="button" class="rail-out" (click)="auth.logout()" aria-label="Sign out">
            <app-icon name="logout" [size]="18" />
          </button>
        </div>
      </nav>

      <main class="shell-main" id="main">
        <ng-content />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 260px 1fr;
        background: var(--paper);
      }
      .rail {
        position: fixed;
        top: 0;
        bottom: 0;
        width: 260px;
        display: flex;
        flex-direction: column;
        gap: var(--s5);
        padding: var(--s5) var(--s4);
        border-right: 1px solid var(--ink-hairline);
        background: var(--paper);
        overflow: hidden;
      }
      .rail-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 32px;
        padding-left: var(--s2);
      }
      .rail-nav {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        flex: 1;
      }
      .rail-item {
        display: flex;
        align-items: center;
        gap: var(--s3);
        min-height: 44px;
        padding: 0 var(--s3);
        border-radius: var(--r-nav);
        color: var(--ink-secondary);
        font-size: 15px;
        line-height: 22px;
        text-decoration: none;
      }
      @media (hover: hover) {
        .rail-item:hover {
          background: var(--ink-fill);
          color: var(--ink);
        }
      }
      /* the current destination is a filled item and an accessible marking */
      .rail-item-current {
        background: var(--ink-fill);
        color: var(--ink);
        font-weight: 600;
      }
      .rail-account {
        display: flex;
        align-items: center;
        gap: var(--s2);
        padding: var(--s2);
        border-top: 1px solid var(--ink-hairline);
        padding-top: var(--s4);
      }
      .rail-account-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .rail-name {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rail-role {
        color: var(--ink-tertiary);
      }
      .rail-out {
        background: none;
        border: 0;
        cursor: pointer;
        color: var(--ink-tertiary);
        min-width: 44px;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      @media (hover: hover) {
        .rail-out:hover {
          color: var(--ink);
        }
      }
      .shell-main {
        grid-column: 2;
        padding: var(--s7) var(--s5) var(--s8);
        min-width: 0;
      }
      .drawer-toggle,
      .drawer-close,
      .drawer-scrim {
        display: none;
      }

      @media (max-width: 999px) {
        .shell {
          grid-template-columns: 1fr;
        }
        .rail {
          transform: translateX(-100%);
          transition: transform var(--dur) var(--ease-panel);
          z-index: var(--z-scrim);
          box-shadow: var(--elev-primary);
        }
        .drawer-open .rail {
          transform: translateX(0);
        }
        .drawer-close {
          display: inline-flex;
          background: none;
          border: 0;
          cursor: pointer;
          color: var(--ink-secondary);
          min-width: 44px;
          min-height: 44px;
          align-items: center;
          justify-content: center;
        }
        .drawer-toggle {
          display: inline-flex;
          position: fixed;
          top: var(--s2);
          left: var(--s2);
          z-index: var(--z-menu);
          width: 44px;
          height: 44px;
          align-items: center;
          justify-content: center;
          background: var(--paper);
          border: 1px solid var(--ink-hairline);
          border-radius: var(--r-nav);
          cursor: pointer;
          color: var(--ink);
        }
        .drawer-open .drawer-scrim {
          display: block;
          position: fixed;
          inset: 0;
          background: var(--ink-scrim);
          z-index: 9900;
        }
        .shell-main {
          grid-column: 1;
          padding: var(--s8) var(--s4) var(--s8);
        }
      }
    `,
  ],
})
export class Shell {
  readonly auth = inject(Auth);
  private router = inject(Router);
  readonly drawerOpen = signal(false);

  /** A guest sees Home, Discover and Settings; a host sees Calendars, Create,
      Discover and Settings. */
  readonly items = computed<NavItem[]>(() =>
    this.auth.isHost()
      ? [
          { path: '/calendars', label: 'Calendars', icon: 'calendar' },
          { path: '/create', label: 'Create', icon: 'plus' },
          { path: '/discover', label: 'Discover', icon: 'compass' },
          { path: '/settings/profile', label: 'Settings', icon: 'settings' },
        ]
      : [
          { path: '/home', label: 'Home', icon: 'home' },
          { path: '/discover', label: 'Discover', icon: 'compass' },
          { path: '/settings/profile', label: 'Settings', icon: 'settings' },
        ]
  );

  constructor() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.drawerOpen()) this.drawerOpen.set(false);
    });
  }
}

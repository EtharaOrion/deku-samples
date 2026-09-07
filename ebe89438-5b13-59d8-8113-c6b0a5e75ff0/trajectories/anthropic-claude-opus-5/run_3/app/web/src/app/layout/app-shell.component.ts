import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../core/session.service';
import { AvatarComponent, LockupComponent } from '../shared/ui';
import { IconComponent } from '../shared/icons.component';

type NavItem = { path: string; label: string; icon: string };

/**
 * Every signed-in route sits inside one shell: a persistent left rail of 260px
 * at 1000px and above, collapsing below that to a 56px bar of icons that opens
 * as a scrim-backed drawer trapping focus and closing on the escape key.
 * The rail never scrolls with the content.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LockupComponent, AvatarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <button type="button" class="rail-toggle" (click)="drawerOpen.set(true)" aria-label="Open the navigation">
        <app-icon name="menu" [size]="20" />
      </button>

      @if (drawerOpen()) {
        <div class="drawer-scrim" (click)="drawerOpen.set(false)"></div>
      }

      <nav class="rail" [class.open]="drawerOpen()" aria-label="Main">
        <div class="rail-head">
          <app-lockup />
          <button type="button" class="drawer-close" (click)="drawerOpen.set(false)" aria-label="Close the navigation">
            <app-icon name="close" [size]="18" />
          </button>
        </div>

        <ul class="nav">
          @for (item of navItems(); track item.path) {
            <li>
              <a
                [routerLink]="item.path"
                routerLinkActive="current"
                #rla="routerLinkActive"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                (click)="drawerOpen.set(false)"
              >
                <app-icon [name]="item.icon" [size]="18" />
                <span>{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>

        <div class="rail-foot">
          @if (session.account(); as account) {
            <div class="account-block">
              <app-avatar [name]="account.display_name" [size]="32" />
              <span class="account-name">
                <span class="name">{{ account.display_name }}</span>
                <span class="role t-caption">{{ account.role === 'host' ? 'Host' : 'Guest' }}</span>
              </span>
            </div>
            <button type="button" class="btn-text signout" (click)="session.signOut()">Sign Out</button>
          }
        </div>
      </nav>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        min-height: 100vh;
        display: flex;
        background: var(--paper);
      }

      .rail {
        width: 260px;
        flex: none;
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        display: flex;
        flex-direction: column;
        padding: 20px 16px;
        gap: 24px;
        border-right: 1px solid var(--ink-08);
        background: var(--paper);
        overflow-y: auto;
      }

      .rail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px;
      }

      .drawer-close,
      .rail-toggle {
        display: none;
      }

      .nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }

      .nav a {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 12px;
        min-height: 44px;
        border-radius: var(--r-nav);
        color: var(--ink-64);
        font-size: 15px;
        line-height: 22px;
      }

      @media (hover: hover) {
        .nav a:hover {
          background: var(--ink-04);
          color: var(--ink);
        }
      }

      /* The current destination is marked by a filled navigation item and by an
         accessible current-page marking, never by colour alone. */
      .nav a.current {
        background: var(--ink-04);
        color: var(--ink);
        font-weight: 600;
      }

      .rail-foot {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 16px;
        border-top: 1px solid var(--ink-08);
      }

      .account-block {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 8px;
      }

      .account-name {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .name {
        font-size: 15px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .role {
        color: var(--muted);
      }

      .signout {
        align-self: flex-start;
        min-height: 44px;
      }

      .content {
        flex: 1;
        min-width: 0;
        margin-left: 260px;
        padding: 40px 32px 80px;
      }

      @media (max-width: 999px) {
        .rail {
          transform: translateX(-100%);
          transition: transform var(--dur) var(--ease);
          z-index: 1000;
          width: 260px;
        }

        .rail.open {
          transform: translateX(0);
        }

        .drawer-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--ink-64);
          border-radius: var(--r-nav);
        }

        .drawer-scrim {
          position: fixed;
          inset: 0;
          background: var(--ink-80);
          z-index: 999;
        }

        .rail-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 56px;
          border: none;
          border-right: 1px solid var(--ink-08);
          background: var(--paper);
          cursor: pointer;
          color: var(--ink-64);
          z-index: 200;
          align-items: flex-start;
          padding-top: 20px;
        }

        .content {
          margin-left: 56px;
          padding: 32px 24px 80px;
        }
      }

      @media (max-width: 649px) {
        .content {
          padding: 24px 16px 80px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .rail {
          transition: none;
        }
      }
    `,
  ],
})
export class AppShellComponent {
  session = inject(SessionService);
  readonly drawerOpen = signal(false);

  /** A guest sees Home, Discover and Settings; a host sees Calendars, Create,
      Discover and Settings. */
  readonly navItems = computed<NavItem[]>(() => {
    const host = this.session.isHost();
    return host
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
        ];
  });

  @HostListener('document:keydown.escape')
  onEscape() {
    this.drawerOpen.set(false);
  }
}

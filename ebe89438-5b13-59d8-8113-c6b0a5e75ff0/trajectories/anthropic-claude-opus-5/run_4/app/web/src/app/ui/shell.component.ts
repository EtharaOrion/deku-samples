import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from '../core/session.service';
import { AvatarComponent } from './avatar.component';
import { BrandComponent } from './brand.component';
import { IconComponent } from './icon.component';

interface Destination {
  path: string;
  label: string;
  icon: string;
}

/**
 * Every signed-in route sits inside one shell: a persistent left rail of 260px
 * at 1000px and above, collapsing below that to a 56px bar of icons that opens
 * as a scrim-backed drawer trapping focus and closing on the escape key. The
 * rail never scrolls with the content.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, BrandComponent, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" (keydown.escape)="drawerOpen.set(false)">
      <button
        type="button"
        class="drawer-toggle"
        (click)="drawerOpen.set(true)"
        aria-label="Open navigation"
        [attr.aria-expanded]="drawerOpen()"
      >
        <app-icon name="menu" [size]="22" />
      </button>

      @if (drawerOpen()) {
        <div class="drawer-scrim" (click)="drawerOpen.set(false)"></div>
      }

      <nav class="rail" [class.open]="drawerOpen()" aria-label="Sections">
        <div class="rail-head">
          <app-brand />
          <button
            type="button"
            class="close-drawer"
            (click)="drawerOpen.set(false)"
            aria-label="Close navigation"
          >
            <app-icon name="close" [size]="20" />
          </button>
        </div>

        <ul class="dests">
          @for (d of destinations(); track d.path) {
            <li>
              <a
                [routerLink]="d.path"
                routerLinkActive="current"
                #rla="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: d.path === '/home' || d.path === '/calendars' }"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                (click)="drawerOpen.set(false)"
              >
                <app-icon [name]="d.icon" [size]="20" />
                <span>{{ d.label }}</span>
              </a>
            </li>
          }
        </ul>

        <div class="account-block">
          @if (session.account(); as a) {
            <a class="who" routerLink="/settings/profile" (click)="drawerOpen.set(false)">
              <app-avatar [name]="a.display_name" [size]="32" />
              <span class="names">
                <span class="t-row name">{{ a.display_name }}</span>
                <span class="t-caption handle">&#64;{{ a.handle }}</span>
              </span>
            </a>
            <button type="button" class="btn btn-text btn-sm sign-out" (click)="session.logout()">
              <app-icon name="logout" [size]="18" />
              <span>Sign Out</span>
            </button>
          }
        </div>
      </nav>

      <main class="content" id="main">
        <ng-content />
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
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        width: 260px;
        display: flex;
        flex-direction: column;
        gap: var(--s5);
        padding: var(--s5) var(--s4);
        border-right: 1px solid var(--ink-08);
        background: var(--paper);
        z-index: 1000;
        overflow: hidden auto;
      }
      .rail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--s2);
        min-height: 44px;
      }
      .close-drawer {
        display: none;
        background: none;
        border: 0;
        cursor: pointer;
        color: var(--ink-64);
        width: 44px;
        height: 44px;
        align-items: center;
        justify-content: center;
        border-radius: var(--r-nav);
      }
      .dests {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .dests a {
        display: flex;
        align-items: center;
        gap: var(--s3);
        min-height: 44px;
        padding: 0 var(--s3);
        border-radius: var(--r-nav);
        color: var(--ink-64);
        font-size: 15px;
        line-height: 22px;
        transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
      }
      @media (hover: hover) {
        .dests a:hover {
          background: var(--ink-04);
          color: var(--ink);
        }
      }
      .dests a.current {
        background: var(--ink-04);
        color: var(--ink);
        font-weight: 600;
      }
      .account-block {
        margin-top: auto;
        border-top: 1px solid var(--ink-08);
        padding-top: var(--s3);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }
      .who {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s2) var(--s3);
        border-radius: var(--r-nav);
        color: inherit;
        min-height: 44px;
      }
      @media (hover: hover) {
        .who:hover {
          background: var(--ink-04);
        }
      }
      .names {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .name {
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .handle {
        color: var(--muted);
      }
      .sign-out {
        justify-content: flex-start;
      }
      .content {
        flex: 1;
        margin-left: 260px;
        padding: var(--s7) var(--s5) var(--s8);
        min-width: 0;
      }
      .drawer-toggle {
        display: none;
      }
      .drawer-scrim {
        display: none;
      }

      @media (max-width: 999px) {
        .rail {
          transform: translateX(-100%);
          transition: transform var(--dur) var(--ease);
          width: 280px;
          box-shadow: var(--elev-card);
        }
        .rail.open {
          transform: translateX(0);
        }
        .close-drawer {
          display: inline-flex;
        }
        .content {
          margin-left: 56px;
          padding: var(--s6) var(--s4) var(--s8);
        }
        .drawer-toggle {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 56px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: var(--s5);
          background: var(--paper);
          border: 0;
          border-right: 1px solid var(--ink-08);
          color: var(--ink-64);
          cursor: pointer;
          z-index: 200;
        }
        .drawer-scrim {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(21, 21, 21, 0.8);
          z-index: 999;
        }
      }
      @media (max-width: 649px) {
        .content {
          padding: var(--s5) var(--s4) var(--s8);
        }
      }
    `,
  ],
})
export class ShellComponent {
  session = inject(SessionService);
  readonly drawerOpen = signal(false);

  /** A guest sees Home, Discover and Settings; a host sees Calendars, Create, Discover and Settings. */
  readonly destinations = computed<Destination[]>(() =>
    this.session.isHost()
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
        ],
  );
}

import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AvatarComponent, BrandComponent, IconComponent, type InterfaceIconName } from './icons.component';

interface NavItem {
  label: string;
  path: string;
  icon: InterfaceIconName;
}

/**
 * The signed-in shell: a persistent 260px rail at 1000px and above, collapsing
 * to a 56px icon bar with a scrim-backed drawer below it.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, BrandComponent, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.drawer-open]="drawerOpen()">
      <nav class="rail" aria-label="Sections">
        <a class="brand" routerLink="/" aria-label="Deku, go to the landing page">
          <app-brand [size]="18" [showWord]="true" />
        </a>
        <ul class="nav">
          @for (item of items(); track item.path) {
            <li>
              <a
                class="nav-item"
                [routerLink]="item.path"
                routerLinkActive="current"
                #rla="routerLinkActive"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                (click)="closeDrawer()"
              >
                <app-icon [name]="item.icon" [size]="20" />
                <span class="label">{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>
        <div class="account-block">
          @if (account(); as acc) {
            <a class="who" routerLink="/settings/profile" (click)="closeDrawer()">
              <app-avatar [name]="acc.display_name" [size]="32" />
              <span class="who-copy">
                <span class="t-caption name">{{ acc.display_name }}</span>
                <span class="t-badge role">{{ acc.role === 'host' ? 'Host' : 'Guest' }}</span>
              </span>
            </a>
            <button type="button" class="btn btn-text sign-out" (click)="signOut()">Sign Out</button>
          }
        </div>
      </nav>

      <button type="button" class="drawer-toggle" (click)="toggleDrawer()" [attr.aria-expanded]="drawerOpen()">
        <span class="sr-only">{{ drawerOpen() ? 'Close the navigation drawer' : 'Open the navigation drawer' }}</span>
        <app-icon [name]="drawerOpen() ? 'close' : 'menu'" [size]="20" />
      </button>

      @if (drawerOpen()) {
        <div class="scrim" (click)="closeDrawer()" aria-hidden="true"></div>
      }

      <div class="content">
        <main id="main">
          <ng-content />
        </main>
      </div>
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
        border-right: 1px solid var(--ink-08);
        padding: var(--s5) var(--s3);
        display: flex;
        flex-direction: column;
        gap: var(--s5);
        background: var(--paper);
        z-index: var(--z-menu);
        overflow: hidden;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        padding: 0 var(--s2);
        min-height: 44px;
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        flex: 1;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: var(--s3);
        min-height: 44px;
        padding: 0 var(--s3);
        border-radius: var(--r-nav);
        color: var(--ink-64);
        transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
      }
      @media (hover: hover) {
        .nav-item:hover {
          background: var(--ink-04);
          color: var(--ink);
        }
      }
      .nav-item.current {
        background: var(--ink-08);
        color: var(--ink);
        font-weight: 600;
      }
      .account-block {
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
        padding: var(--s2);
        border-radius: var(--r-nav);
        min-height: 44px;
      }
      @media (hover: hover) {
        .who:hover {
          background: var(--ink-04);
        }
      }
      .who-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .name {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .role {
        color: var(--muted);
      }
      .sign-out {
        justify-content: flex-start;
      }
      .drawer-toggle {
        display: none;
      }
      .content {
        margin-left: 260px;
        flex: 1;
        min-width: 0;
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: var(--s6) var(--s5) var(--s8);
      }
      .scrim {
        position: fixed;
        inset: 0;
        background: rgba(21, 21, 21, 0.8);
        z-index: 999;
      }

      @media (max-width: 999px) {
        .rail {
          width: 56px;
          padding: var(--s5) var(--s2);
          align-items: center;
        }
        .rail .label,
        .rail .who-copy,
        .rail .sign-out,
        .rail .brand .word {
          display: none;
        }
        .nav-item {
          justify-content: center;
          padding: 0;
          width: 40px;
        }
        .content {
          margin-left: 56px;
        }
        main {
          padding: var(--s6) var(--s4) var(--s8);
        }
        .drawer-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: fixed;
          top: var(--s3);
          left: 8px;
          width: 40px;
          height: 40px;
          border-radius: var(--r-nav);
          border: 1px solid var(--ink-08);
          background: var(--paper);
          color: var(--ink);
          z-index: 1001;
          cursor: pointer;
        }
        .rail {
          padding-top: 68px;
        }
        .drawer-open .rail {
          width: 260px;
          padding: var(--s5) var(--s3);
          padding-top: 68px;
          align-items: stretch;
        }
        .drawer-open .rail .label,
        .drawer-open .rail .who-copy,
        .drawer-open .rail .sign-out,
        .drawer-open .rail .brand .word {
          display: inline;
        }
        .drawer-open .nav-item {
          justify-content: flex-start;
          padding: 0 var(--s3);
          width: auto;
        }
      }
    `,
  ],
})
export class AppShellComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  readonly account = this.api.account;
  readonly drawerOpen = signal(false);

  readonly items = computed<NavItem[]>(() => {
    const acc = this.account();
    if (acc?.role === 'host') {
      return [
        { label: 'Calendars', path: '/calendars', icon: 'calendar' },
        { label: 'Create', path: '/create', icon: 'plus' },
        { label: 'Discover', path: '/discover', icon: 'compass' },
        { label: 'Settings', path: '/settings/profile', icon: 'settings' },
      ];
    }
    return [
      { label: 'Home', path: '/home', icon: 'home' },
      { label: 'Discover', path: '/discover', icon: 'compass' },
      { label: 'Settings', path: '/settings/profile', icon: 'settings' },
    ];
  });

  toggleDrawer() {
    this.drawerOpen.update((v) => !v);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeDrawer();
  }

  signOut() {
    this.api.logout();
    void this.router.navigateByUrl('/');
  }
}

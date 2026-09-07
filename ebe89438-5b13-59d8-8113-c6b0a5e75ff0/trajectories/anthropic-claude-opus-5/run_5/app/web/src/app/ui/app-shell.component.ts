import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandComponent } from './brand.component';
import { AvatarComponent } from './avatar.component';
import { IconComponent, type IconName } from './icon.component';

interface Destination {
  path: string;
  label: string;
  icon: IconName;
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
  imports: [RouterLink, RouterLinkActive, BrandComponent, AvatarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <nav
        class="rail"
        [class.rail--open]="drawerOpen()"
        aria-label="Primary"
        (keydown)="onRailKeydown($event)"
      >
        <div class="rail__top">
          <a routerLink="/" class="rail__brand" aria-label="Deku, go to the landing page">
            <app-brand [markSize]="20" [wordSize]="20" [markOnly]="compact()" />
          </a>
          <button
            type="button"
            class="rail__close"
            (click)="closeDrawer()"
            [attr.aria-expanded]="drawerOpen()"
          >
            <app-icon name="close" [size]="20" colour="currentColor" />
            <span class="visually-hidden">Close the navigation drawer</span>
          </button>
        </div>

        <ul class="rail__items">
          @for (d of destinations(); track d.path) {
            <li>
              <a
                class="nav"
                [routerLink]="d.path"
                routerLinkActive="nav--current"
                #rla="routerLinkActive"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                (click)="closeDrawer()"
              >
                <app-icon [name]="d.icon" [size]="20" colour="currentColor" />
                <span class="nav__label">{{ d.label }}</span>
              </a>
            </li>
          }
        </ul>

        <div class="rail__foot">
          <a class="account" routerLink="/settings/profile" (click)="closeDrawer()">
            <app-avatar [name]="auth.account()?.display_name || ''" [size]="32" />
            <span class="account__lines">
              <span class="t-caption account__name">{{ auth.account()?.display_name }}</span>
              <span class="t-badge account__role">{{ auth.account()?.role }}</span>
            </span>
          </a>
          <button type="button" class="btn btn--text sign-out" (click)="auth.logout()">
            <app-icon name="logout" [size]="18" colour="currentColor" />
            <span class="nav__label">Sign Out</span>
          </button>
        </div>
      </nav>

      @if (drawerOpen()) {
        <div class="scrim" (click)="closeDrawer()"></div>
      }

      <div class="body">
        <div class="topbar">
          <button type="button" class="topbar__menu" (click)="openDrawer()">
            <app-icon name="menu" [size]="22" colour="currentColor" />
            <span class="visually-hidden">Open the navigation drawer</span>
          </button>
          <app-brand [markSize]="18" [wordSize]="18" />
        </div>
        <main id="main" class="content">
          <ng-content />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: var(--paper); }
      .shell { display: flex; min-height: 100vh; }

      .rail {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        width: 260px;
        display: flex;
        flex-direction: column;
        gap: var(--s4);
        padding: var(--s4);
        border-right: 1px solid var(--divider);
        background: var(--paper);
        z-index: var(--z-menu);
      }
      .rail__top { display: flex; align-items: center; justify-content: space-between; min-height: 44px; }
      .rail__brand { color: var(--ink); display: inline-flex; align-items: center; }
      .rail__close {
        display: none;
        border: 0;
        background: transparent;
        color: var(--ink-64);
        min-width: 44px;
        min-height: 44px;
        cursor: pointer;
        align-items: center;
        justify-content: center;
      }
      .rail__items { display: flex; flex-direction: column; gap: var(--s1); flex: 1; overflow-y: auto; }
      .nav {
        display: flex;
        align-items: center;
        gap: var(--s3);
        min-height: 44px;
        padding: 0 var(--s3);
        border-radius: var(--r-nav);
        color: var(--ink-64);
      }
      @media (hover: hover) {
        .nav:hover { background: var(--ink-04); color: var(--ink); }
      }
      /* The current destination is a filled item and an accessible current-page
         marking, never colour alone. */
      .nav--current { background: var(--ink-04); color: var(--ink); font-weight: 500; }
      .nav__label { font-size: 15px; line-height: 22px; }

      .rail__foot { display: flex; flex-direction: column; gap: var(--s2); }
      .account {
        display: flex;
        align-items: center;
        gap: var(--s2);
        padding: var(--s2);
        border-radius: var(--r-nav);
        color: inherit;
        min-height: 44px;
      }
      @media (hover: hover) {
        .account:hover { background: var(--ink-04); }
      }
      .account__lines { display: flex; flex-direction: column; min-width: 0; }
      .account__name { font-weight: 500; }
      .account__role { color: var(--muted); text-transform: capitalize; }
      .sign-out { justify-content: flex-start; }

      .body { flex: 1; min-width: 0; margin-left: 260px; }
      .content {
        max-width: 1080px;
        margin: 0 auto;
        padding: var(--s6) var(--s5) var(--s8);
      }
      .topbar { display: none; }

      .scrim {
        position: fixed;
        inset: 0;
        background: rgba(21, 21, 21, 0.8);
        z-index: 999;
      }

      @media (max-width: 999px) {
        .rail {
          width: 288px;
          transform: translateX(-100%);
          transition: transform var(--dur) var(--ease);
          box-shadow: var(--elev-fine);
        }
        .rail--open { transform: translateX(0); }
        .rail__close { display: inline-flex; }
        .body { margin-left: 0; }
        .topbar {
          display: flex;
          align-items: center;
          gap: var(--s3);
          height: 56px;
          padding: 0 var(--s4);
          border-bottom: 1px solid var(--divider);
          position: sticky;
          top: 0;
          background: var(--paper);
          z-index: var(--z-bar);
        }
        .topbar__menu {
          border: 0;
          background: transparent;
          color: var(--ink);
          min-width: 44px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .content { padding: var(--s5) var(--s4) var(--s8); }
      }
      @media (max-width: 649px) {
        .content { padding: var(--s4) var(--s4) var(--s8); }
      }
      @media (prefers-reduced-motion: reduce) {
        .rail { transition: none; }
      }
    `,
  ],
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  readonly drawerOpen = signal(false);
  readonly compact = signal(false);

  /** A guest sees Home, Discover and Settings; a host sees Calendars, Create,
   *  Discover and Settings. */
  readonly destinations = computed<Destination[]>(() =>
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
        ],
  );

  openDrawer(): void {
    this.drawerOpen.set(true);
    queueMicrotask(() => {
      document.querySelector<HTMLElement>('.rail .nav')?.focus();
    });
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) this.closeDrawer();
  }

  /** The drawer traps focus while it is open. */
  onRailKeydown(event: KeyboardEvent): void {
    if (!this.drawerOpen() || event.key !== 'Tab') return;
    const rail = event.currentTarget as HTMLElement;
    const items = Array.from(
      rail.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

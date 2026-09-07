import {
  ChangeDetectionStrategy, Component, HostListener, inject, signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../core/api.service';
import { BrandComponent, AvatarComponent } from './ui.components';
import { IconComponent } from './icons.component';

interface NavItem { label: string; link: string; icon: string; }

/**
 * The signed-in shell: a persistent left rail of 260px at 1000px and above,
 * collapsing below that to a 56px bar of icons that opens as a scrim-backed
 * drawer trapping focus and closing on the escape key. The rail never scrolls
 * with the content.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, BrandComponent, AvatarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <button type="button" class="drawer-toggle" (click)="openDrawer()"
              aria-label="Open navigation">
        <app-icon name="menu" [size]="22" />
      </button>

      @if (drawerOpen()) {
        <div class="drawer-scrim" (click)="closeDrawer()"></div>
      }

      <nav class="rail" [class.rail-open]="drawerOpen()" aria-label="Main">
        <div class="rail-head">
          <app-brand [size]="18" />
        </div>

        <ul class="nav">
          @for (item of navItems(); track item.link) {
            <li>
              <a [routerLink]="item.link" routerLinkActive="current"
                 [routerLinkActiveOptions]="{ exact: item.link === '/home' }"
                 #rla="routerLinkActive"
                 [attr.aria-current]="rla.isActive ? 'page' : null"
                 (click)="closeDrawer()">
                <app-icon [name]="item.icon" [size]="20" />
                <span>{{ item.label }}</span>
              </a>
            </li>
          }
        </ul>

        <div class="rail-foot">
          @if (api.account(); as acct) {
            <div class="acct">
              <app-avatar [name]="acct.display_name" [size]="32" [decorative]="true" />
              <div class="acct-text">
                <span class="name">{{ acct.display_name }}</span>
                <span class="caption tertiary role">{{ acct.role }}</span>
              </div>
            </div>
          }
          <button type="button" class="btn btn-text logout" (click)="logout()">
            <app-icon name="logout" [size]="18" />
            <span>Sign out</span>
          </button>
        </div>
      </nav>

      <div class="content">
        <ng-content />
      </div>
    </div>
  `,
  styles: [`
    .shell { min-height: 100vh; display: flex; background: var(--paper); }
    .rail {
      position: fixed; top: 0; bottom: 0; left: 0; width: 260px;
      border-right: 1px solid var(--ink-hairline);
      display: flex; flex-direction: column; padding: var(--s5) var(--s3);
      background: var(--paper); z-index: var(--z-menu);
    }
    .rail-head { padding: 0 var(--s2) var(--s5); }
    .nav { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .nav a {
      display: flex; align-items: center; gap: var(--s3);
      padding: var(--s2) var(--s3); min-height: 44px;
      border-radius: var(--r-nav); color: var(--ink-secondary);
      transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
    }
    @media (hover: hover) { .nav a:hover { background: var(--ink-fill); color: var(--ink); } }
    /* The current destination is a filled item plus an accessible marking,
       never colour alone. */
    .nav a.current { background: var(--ink-fill); color: var(--ink); font-weight: 500; }

    .rail-foot { border-top: 1px solid var(--ink-hairline); padding-top: var(--s3); }
    .acct { display: flex; align-items: center; gap: var(--s2); padding: var(--s2); }
    .acct-text { display: flex; flex-direction: column; min-width: 0; }
    .name { font-size: 14px; line-height: 20px; font-weight: 500; }
    .role { text-transform: capitalize; }
    .logout { justify-content: flex-start; width: 100%; padding: var(--s2); }

    .content { flex: 1; margin-left: 260px; min-width: 0; }
    .drawer-toggle { display: none; }
    .drawer-scrim { display: none; }

    @media (max-width: 999px) {
      .rail {
        width: 260px; transform: translateX(-100%);
        transition: transform var(--dur) var(--ease);
      }
      .rail-open { transform: translateX(0); }
      .content { margin-left: 56px; }
      .drawer-toggle {
        position: fixed; top: 0; left: 0; bottom: 0; width: 56px;
        display: flex; align-items: flex-start; justify-content: center;
        padding-top: var(--s5); background: var(--paper);
        border-right: 1px solid var(--ink-hairline); cursor: pointer;
        z-index: var(--z-bar); color: var(--ink);
      }
      .drawer-scrim {
        display: block; position: fixed; inset: 0;
        background: var(--ink-scrim); z-index: 999;
      }
    }
  `],
})
export class ShellComponent {
  api = inject(ApiService);
  private router = inject(Router);
  drawerOpen = signal(false);

  /** A guest sees Home, Discover and Settings; a host sees Calendars, Create,
   *  Discover and Settings. */
  navItems(): NavItem[] {
    const guest: NavItem[] = [
      { label: 'Home', link: '/home', icon: 'home' },
      { label: 'Discover', link: '/discover', icon: 'search' },
      { label: 'Settings', link: '/settings/profile', icon: 'settings' },
    ];
    const host: NavItem[] = [
      { label: 'Calendars', link: '/calendars', icon: 'calendar' },
      { label: 'Create', link: '/create', icon: 'plus' },
      { label: 'Discover', link: '/discover', icon: 'search' },
      { label: 'Settings', link: '/settings/profile', icon: 'settings' },
    ];
    return this.api.isHost ? host : guest;
  }

  openDrawer() {
    this.drawerOpen.set(true);
    queueMicrotask(() => {
      document.querySelector<HTMLElement>('.rail-open .nav a')?.focus();
    });
  }

  closeDrawer() { this.drawerOpen.set(false); }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.drawerOpen()) this.closeDrawer(); }

  logout() {
    this.api.clearSession();
    this.router.navigate(['/']);
  }
}

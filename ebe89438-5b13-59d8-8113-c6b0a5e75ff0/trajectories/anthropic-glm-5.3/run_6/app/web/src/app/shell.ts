import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, AfterViewInit, ElementRef, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from './api.service';
import { NoticeService } from './notice.service';
import { AvatarComponent, BrandMarkComponent } from './widgets';
import { formatLocalNow } from './public-bar';

/**
 * The signed-in shell: a persistent left rail the persona can reach everything from.
 */
@Component({
  selector: 'app-shell', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, BrandMarkComponent, AvatarComponent],
  template: `
    <div class="shell">
      <nav class="rail" aria-label="Signed in">
        <a routerLink="/" class="rail-brand" aria-label="Community Calendar home">
          <brand-mark [size]="18"></brand-mark><span>Community Calendar</span>
        </a>
        @for (d of destinations(); track d.path) {
          <a [routerLink]="d.path" routerLinkActive="active" class="nav-item"
             ariaCurrentWhenActive="page">
            @if (d.icon) { <span class="nav-glyph" aria-hidden="true">{{ d.icon }}</span> }
            {{ d.label }}
          </a>
        }
        <span class="rail-spacer"></span>
        @if (api.account; as acct) {
          <div class="rail-account">
            <cc-avatar [name]="acct.display_name" [size]="28"></cc-avatar>
            <span class="rail-account-name">{{ acct.display_name }}</span>
            <button type="button" class="link" (click)="logout()" aria-label="Sign out">Sign out</button>
          </div>
        }
      </nav>
      <div class="mobile-bar" role="banner">
        <a routerLink="/" class="rail-brand"><brand-mark [size]="16"></brand-mark><span>Community Calendar</span></a>
        <button type="button" class="btn btn-sm btn-ghost menu-btn" (click)="drawerOpen.set(true)" aria-label="Open menu">Menu</button>
      </div>
      <main class="content" role="main">
        <ng-content></ng-content>
      </main>
    </div>
    @if (drawerOpen()) {
      <div class="scrim" (click)="closeDrawer()" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="spread" style="padding:16px">
            <a routerLink="/" class="rail-brand"><brand-mark [size]="16"></brand-mark><span>Community Calendar</span></a>
            <button type="button" class="link" (click)="closeDrawer()" aria-label="Close menu">Close</button>
          </div>
          @for (d of destinations(); track d.path) {
            <a [routerLink]="d.path" routerLinkActive="active" class="nav-item" (click)="closeDrawer()">{{ d.label }}</a>
          }
          <button type="button" class="nav-item" (click)="logout()">Sign out</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host{display:block}
    .rail-brand{display:inline-flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;font-size:16px;color:var(--ink)}
    .nav-glyph{font-size:14px;opacity:.7}
    .rail-account{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;border-top:1px solid var(--hairline)}
    .rail-account-name{flex:1;font-size:14px;line-height:18px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mobile-bar{position:fixed;top:0;left:0;right:0;height:56px;display:flex;align-items:center;justify-content:space-between;
      padding:0 16px;background:var(--paper);border-bottom:1px solid var(--hairline);z-index:var(--z-bar)}
    .menu-btn{min-height:36px}
    .drawer{position:absolute;top:0;left:0;bottom:0;width:min(320px,84vw);background:var(--paper);
      display:flex;flex-direction:column;gap:4px;padding:8px;animation:panel-in .3s var(--panel-curve)}
  `],
})
export class AppShellComponent {
  api = inject(ApiService);
  private notice = inject(NoticeService);
  drawerOpen = signal(false);

  destinations = computed(() => {
    const acct = this.api.account;
    const base = [{ path: '/discover', label: 'Discover', icon: '·' }];
    if (!acct) return base;
    if (acct.role === 'host') {
      return [{ path: '/calendars', label: 'Calendars', icon: '·' }, { path: '/create', label: 'Create', icon: '+' }, ...base, { path: '/settings/profile', label: 'Settings', icon: '·' }];
    }
    return [{ path: '/home', label: 'Home', icon: '·' }, ...base, { path: '/settings/profile', label: 'Settings', icon: '·' }];
  });

  closeDrawer() { this.drawerOpen.set(false); }

  async logout() {
    await this.api.logout();
    this.notice.say('You are signed out.', 'info');
    location.assign('/');
  }
}

/** A dialog: card of at most 480px over a scrim, focus trapped, escape closes. */
@Component({
  selector: 'cc-dialog', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="scrimClick($event)" role="presentation">
      <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="title()" #panel (keydown)="onKey($event)">
        <div class="spread dialog-head">
          <h2 class="t-modal">{{ title() }}</h2>
          @if (closable()) {
            <button type="button" class="link" (click)="closed.emit()" aria-label="Close dialog">Close</button>
          }
        </div>
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .dialog-head{margin-bottom:16px}
  `],
})
export class DialogComponent implements AfterViewInit {
  title = input<string>('');
  closable = input<boolean>(true);
  closed = output<void>();
  panel = viewChild<ElementRef<HTMLElement>>('panel');
  private prevFocus: HTMLElement | null = null;

  ngAfterViewInit() {
    this.prevFocus = document.activeElement as HTMLElement;
    const el = this.panel()?.nativeElement;
    if (el) {
      const items = el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (items.length) setTimeout(() => items[0].focus(), 30);
    }
  }

  scrimClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('scrim') && this.closable()) this.closed.emit();
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.closable()) { this.closed.emit(); return; }
    if (e.key === 'Tab') {
      const panel = (e.currentTarget as HTMLElement);
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  ngOnDestroy() { this.prevFocus?.focus?.(); }
}

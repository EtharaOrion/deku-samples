import { Component, HostListener, ElementRef, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMark } from '../ui/icons';
import { Avatar } from '../ui/avatar';
import { Auth } from '../core/auth';

/**
 * The signed-in shell: a persistent left rail of 260px above 1000px, a 56px
 * icon bar with a focus-trapping drawer below it. The rail never scrolls with
 * the content.
 */
@Component({
  selector: 'cc-shell',
  standalone: true,
  imports: [RouterLink, BrandMark, Avatar],
  template: `
  <div class="shell">
    <aside class="rail" [class.rail-open]="drawer" aria-label="Account navigation">
      <a class="brand" routerLink="/" (click)="drawer=false">
        <cc-brand-mark></cc-brand-mark><span class="wordmark">Community Calendar</span>
      </a>
      <nav class="rail-nav stack-8">
        @for (d of destinations; track d.path) {
          <a class="nav-item" [routerLink]="d.path" routerLinkActive="nav-current"
             [class.aria-current]="''" [attr.aria-current]="d.path === current ? 'page' : null"
             (click)="drawer=false">
            <span class="nav-glyph" [innerHTML]="d.glyph"></span>
            <span class="nav-label">{{ d.label }}</span>
          </a>
        }
      </nav>
      <div class="rail-foot">
        <button class="nav-item" type="button" (click)="logout()">
          <span class="nav-glyph">${'&#8592;'}</span><span class="nav-label">Sign Out</span>
        </button>
        <a class="rail-account" routerLink="/settings/profile" (click)="drawer=false">
          <cc-avatar [name]="auth.account?.display_name ?? ''" [size]="28"></cc-avatar>
          <span class="rail-name">{{ auth.account?.display_name }}</span>
        </a>
      </div>
    </aside>
    @if (drawer) {
      <div class="scrim" (click)="drawer=false" aria-hidden="true"></div>
    }
    <main class="content"><ng-content></ng-content></main>
  </div>
  <button class="rail-toggle" type="button" (click)="openDrawer()" aria-label="Open navigation menu"
          [attr.aria-expanded]="drawer">&#977;</button>`,
  styles: [`
    .shell { display: grid; grid-template-columns: 260px minmax(0,1fr); min-height: 100vh; }
    .rail { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column;
      gap: 24px; padding: 24px 16px; border-right: 1px solid var(--divider);
      background: var(--paper); z-index: 300; }
    .brand { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); padding: 0 8px; }
    .wordmark { font-weight: 700; letter-spacing: -0.02em; font-size: 15px; }
    .rail-nav { display: flex; flex-direction: column; }
    .nav-item { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 10px;
      border-radius: 6px; color: var(--ink-64); font-size: 15px; border: 0; background: none;
      text-align: left; width: 100%; }
    .nav-item:hover { background: var(--ink-04); color: var(--ink); }
    .nav-current { background: var(--ink-04); color: var(--ink); font-weight: 500;
      box-shadow: inset 3px 0 0 var(--ink); }
    .nav-glyph { width: 20px; display: inline-flex; justify-content: center; }
    .rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
    .rail-account { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
      border-radius: 6px; color: var(--ink-64); }
    .rail-account:hover { background: var(--ink-04); color: var(--ink); }
    .rail-name { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .content { padding: 32px 40px; max-width: 1160px; }
    .scrim { position: fixed; inset: 0; background: rgba(21,21,21,0.8); z-index: 250; }
    .rail-toggle { display: none; }
    @media (max-width: 1000px) {
      .shell { grid-template-columns: 1fr; }
      .rail { position: fixed; inset: 0 auto 0 0; width: 280px; transform: translateX(-100%);
        transition: transform 0.3s var(--ease-out); z-index: 1000; }
      .rail-open { transform: none; }
      .rail-toggle { display: inline-flex; position: fixed; left: 12px; top: 12px; z-index: 200;
        width: 44px; height: 44px; border-radius: 100px; border: 1px solid var(--ink-08);
        background: var(--paper); font-size: 18px; }
      .content { padding: 76px 16px 32px; }
    }
  `],
})
export class Shell {
  drawer = false;
  current = '';
  destinations: { path: string; label: string; glyph: string }[] = [];

  constructor(public auth: Auth) {}

  ngOnInit(): void {
    // A guest sees Home, Discover and Settings; a host sees Calendars, Create,
    // Discover and Settings.
    const guest = [
      { path: '/home', label: 'Home', glyph: '&#8962;' },
      { path: '/discover', label: 'Discover', glyph: '&#9906;' },
      { path: '/settings/profile', label: 'Settings', glyph: '&#9881;' },
    ];
    const host = [
      { path: '/calendars', label: 'Calendars', glyph: '&#128197;' },
      { path: '/create', label: 'Create', glyph: '&#43;' },
      { path: '/discover', label: 'Discover', glyph: '&#9906;' },
      { path: '/settings/profile', label: 'Settings', glyph: '&#9881;' },
    ];
    this.destinations = this.auth.isHost ? host : guest;
  }

  openDrawer(): void { this.drawer = true; }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.drawer = false; }

  logout(): void {
    this.drawer = false;
    this.auth.logout();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { BrandMarkComponent } from '../ui/brand-mark';
import { AvatarComponent } from '../ui/avatar';

/** The visitor's local time, live, updating once a minute on the minute. */
@Component({
  selector: 'app-clock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="clock">{{ now() }}</span>`,
  styles: [`
    .clock { font-size: 13px; line-height: 16px; color: var(--ink-36); font-variant-numeric: tabular-nums; }
  `],
})
export class ClockComponent {
  now = signal(this.render());
  constructor() {
    const tick = () => {
      const ms = 60000 - (Date.now() % 60000);
      setTimeout(() => { this.now.set(this.render()); tick(); }, ms);
    };
    tick();
  }
  private render(): string {
    const d = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(d);
    const off = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).format(d).match(/GMT[^\s,]*/);
    return `${time} ${off ? off[0] : tz}`;
  }
}

/** The slim fixed bar every public route carries. */
@Component({
  selector: 'app-public-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BrandMarkComponent, AvatarComponent, ClockComponent],
  template: `
    <header class="bar">
      <a class="brand" routerLink="/" aria-label="Community Calendar home">
        <app-brand-mark [size]="18" />
        <span class="word">Calendar</span>
      </a>
      <app-clock />
      <nav class="links" aria-label="Public">
        <a routerLink="/discover">Discover Events</a>
        @if (api.signedIn()) {
          <a [routerLink]="api.isHost() ? '/calendars' : '/home'" class="account" aria-label="Your account">
            <app-avatar [name]="name()" [size]="28" [label]="name()" />
          </a>
        } @else {
          <a routerLink="/login" class="signin btn btn-invert">Sign In</a>
        }
      </nav>
    </header>
    <main class="content"><ng-content /></main>
  `,
  styles: [`
    :host { display: block; }
    .bar {
      position: fixed; inset: 0 0 auto 0; height: 64px; padding: 0 24px;
      display: flex; align-items: center; gap: 24px; z-index: var(--z-bar);
      background: transparent; border: none; box-shadow: none;
    }
    .brand { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--ink); }
    .brand .word { font: 700 16px/24px var(--sans); letter-spacing: -0.02em; }
    .links { margin-left: auto; display: flex; align-items: center; gap: 16px; }
    .links a:not(.account) { font-size: 14px; line-height: 20px; text-decoration: none; color: var(--ink-64); }
    .signin { min-height: 36px; padding: 0 14px; font-size: 14px; }
    .content { padding-top: 64px; min-height: 100vh; }
  `],
})
export class PublicShellComponent {
  api = inject(Api);
  name = computed(() => this.api.account()?.display_name ?? 'You');
}

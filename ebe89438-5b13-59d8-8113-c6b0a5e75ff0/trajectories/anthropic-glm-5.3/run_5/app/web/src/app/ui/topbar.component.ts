import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimeService } from '../time.service';
import { ApiService } from '../api.service';
import { avatarColor, avatarInitial } from '../cover';
import { BrandMarkComponent } from './brand-mark.component';

/** The slim fixed bar on every public route: brand, live local time, discover, account. */
@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <header class="topbar" role="banner">
      <a class="brand" routerLink="/">
        <app-brand-mark [size]="18"></app-brand-mark>
        <span>Deku</span>
      </a>
      <span class="clock" aria-label="Your local time">{{ clock }}</span>
      <nav class="bar-links" aria-label="Public">
        <a routerLink="/discover" class="bar-link">Discover Events</a>
        <a routerLink="/app" class="bar-link">Get the App</a>
      </nav>
      <span class="spacer"></span>
      @if (account(); as acct) {
        <a class="account-link" [routerLink]="acct.role === 'host' ? '/calendars' : '/home'" aria-label="Your account">
          <span class="avatar" [style.background]="avatarColor(acct.display_name)">{{ initial(acct.display_name) }}</span>
        </a>
      } @else {
        <a routerLink="/login" class="btn secondary small pill">Sign In</a>
      }
    </header>
  `,
  styles: [
    `
    .clock { font-size: 13px; color: var(--ink-3); letter-spacing: 0.02em; }
    .bar-links { display: flex; gap: 16px; }
    .bar-link { font-size: 15px; text-decoration: none; color: var(--ink-2); }
    .bar-link:hover { color: var(--ink); }
    .spacer { flex: 1; }
    .account-link { display: inline-flex; }
    @media (max-width: 700px) { .clock { display: none; } }
    @media (max-width: 560px) { .bar-links { display: none; } }
  `],
})
export class TopbarComponent {
  @Input() theme = false;
  readonly account;

  constructor(private time: TimeService, private api: ApiService) {
    this.account = api.account;
  }

  get clock(): string {
    return this.time.clockLabel();
  }

  avatarColor(name: string): string {
    return avatarColor(name);
  }

  initial(name: string): string {
    return avatarInitial(name);
  }
}

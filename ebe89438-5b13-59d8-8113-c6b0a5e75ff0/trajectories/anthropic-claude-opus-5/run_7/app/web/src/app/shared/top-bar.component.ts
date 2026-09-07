import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { barClock } from '../core/time';
import { BrandComponent, AvatarComponent } from './ui.components';

/**
 * One fixed bar on every public route: transparent over the page ground, no
 * border and no shadow, 64px tall at depth 200. The clock is the anchor for
 * every time the product shows and updates once a minute on the minute.
 */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink, BrandComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar" role="banner">
      <app-brand [size]="18" />
      <span class="clock caption" aria-label="Your local time">{{ clock() }}</span>
      <span class="grow"></span>
      <a routerLink="/discover" class="discover-link">Discover Events</a>
      @if (api.account(); as acct) {
        <a [routerLink]="acct.role === 'host' ? '/calendars' : '/home'" class="account-link"
           [attr.aria-label]="'Your account, ' + acct.display_name">
          <app-avatar [name]="acct.display_name" [size]="32" [decorative]="true" />
        </a>
      } @else {
        <a routerLink="/login" class="btn btn-primary btn-pill signin">Sign In</a>
      }
    </header>
  `,
  styles: [`
    .bar {
      position: fixed; top: 0; left: 0; right: 0; height: 64px;
      display: flex; align-items: center; gap: var(--s4);
      padding: 0 var(--s5);
      background: transparent; border: none; box-shadow: none;
      z-index: var(--z-bar);
    }
    .clock { color: var(--ink-tertiary); font-variant-numeric: tabular-nums; }
    .grow { flex: 1; }
    .discover-link {
      color: var(--ink-secondary); font-size: 16px;
      min-height: 44px; display: inline-flex; align-items: center;
    }
    .discover-link:hover { color: var(--ink); }
    .signin { min-height: 38px; }
    .account-link {
      display: inline-flex; min-width: 44px; min-height: 44px;
      align-items: center; justify-content: center;
    }
    @media (max-width: 649px) {
      .bar { padding: 0 var(--s4); gap: var(--s3); }
      .clock { display: none; }
    }
  `],
})
export class TopBarComponent implements OnInit, OnDestroy {
  api = inject(ApiService);
  private router = inject(Router);
  clock = signal(barClock());
  private timer: any = null;

  ngOnInit() {
    // Updates once a minute, on the minute.
    const toNextMinute = 60000 - (Date.now() % 60000);
    this.timer = setTimeout(() => {
      this.clock.set(barClock());
      this.timer = setInterval(() => this.clock.set(barClock()), 60000);
    }, toNextMinute);
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
    clearInterval(this.timer);
  }
}

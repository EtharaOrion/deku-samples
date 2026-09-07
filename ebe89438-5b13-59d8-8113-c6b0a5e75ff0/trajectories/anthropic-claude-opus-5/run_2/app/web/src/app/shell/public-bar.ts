import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { visitorClock } from '../core/time';
import { AvatarComponent, BrandComponent } from '../ui/kit';

/**
 * One fixed bar on every public route, transparent over the page ground,
 * carrying no border and no shadow, 64px tall at depth 200.
 */
@Component({
  selector: 'app-public-bar',
  standalone: true,
  imports: [RouterLink, BrandComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <app-brand [size]="18"></app-brand>

      <div class="right">
        <!-- the visitor's local time, live, anchoring every time the product shows -->
        <span class="clock" aria-label="Your local time">{{ clock() }}</span>
        <a class="discover-link" routerLink="/discover">Discover Events</a>

        @if (account(); as me) {
          <a class="account" routerLink="/home" [attr.aria-label]="'Your account, ' + me.display_name">
            <app-avatar [name]="me.display_name" [size]="32"></app-avatar>
          </a>
        } @else {
          <a class="btn btn-pill sign-in" routerLink="/login">Sign In</a>
        }
      </div>
    </header>
  `,
  styles: [
    `
      .bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 64px;
        z-index: var(--z-bar);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        background: transparent;
        border: none;
        box-shadow: none;
      }
      .right {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .clock {
        font-size: 13px;
        line-height: 16px;
        color: var(--ink-64);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .discover-link {
        font-size: 16px;
        line-height: 24px;
        color: var(--ink-64);
        white-space: nowrap;
      }
      @media (hover: hover) {
        .discover-link:hover { color: var(--ink); }
      }
      .sign-in {
        min-height: 38px;
        padding: 0 16px;
      }
      .account {
        display: inline-flex;
        border-radius: 100%;
        min-width: 44px;
        min-height: 44px;
        align-items: center;
        justify-content: center;
      }
      @media (max-width: 649px) {
        .bar { padding: 0 16px; gap: 8px; }
        .clock { display: none; }
        .right { gap: 12px; }
      }
      @media (max-width: 483px) {
        .discover-link { display: none; }
      }
    `,
  ],
})
export class PublicBarComponent implements OnDestroy {
  private api = inject(Api);
  readonly account = this.api.account;

  readonly clock = signal(visitorClock());
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scheduleTick();
  }

  /** Updates once a minute on the minute. */
  private scheduleTick() {
    const now = new Date();
    const delay =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20;
    this.timer = setTimeout(() => {
      this.clock.set(visitorClock());
      this.scheduleTick();
    }, delay);
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}

import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../core/session.service';
import { localClock } from '../core/time';
import { AvatarComponent } from './avatar.component';
import { BrandComponent } from './brand.component';

/**
 * One fixed bar on every public route, transparent over the page ground,
 * carrying no border and no shadow, 64px tall at depth 200. The visitor's local
 * time is live, updating once a minute on the minute, and is the anchor for
 * every time the product shows.
 */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLink, BrandComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <app-brand />
      <time class="clock t-caption" [attr.datetime]="isoNow()">{{ clock() }}</time>
      <nav class="right" aria-label="Primary">
        <a class="discover" routerLink="/discover">Discover Events</a>
        @if (session.signedIn()) {
          <a class="acct" [routerLink]="session.landingRoute()" [attr.aria-label]="'Your account, ' + session.account()!.display_name">
            <app-avatar [name]="session.account()!.display_name" [size]="32" />
          </a>
        } @else {
          <a class="btn btn-pill sign-in" routerLink="/login">Sign In</a>
        }
      </nav>
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
        z-index: 200;
        display: flex;
        align-items: center;
        gap: var(--s5);
        padding: 0 var(--s5);
        background: transparent;
        border: 0;
        box-shadow: none;
      }
      .clock {
        color: var(--ink-36);
        font-variant-numeric: tabular-nums;
      }
      .right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: var(--s4);
      }
      .discover {
        color: var(--ink-64);
        font-size: 16px;
        line-height: 24px;
        display: inline-flex;
        align-items: center;
        min-height: 44px;
      }
      @media (hover: hover) {
        .discover:hover {
          color: var(--ink);
        }
      }
      .sign-in {
        text-decoration: none;
      }
      .acct {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
      }
      @media (max-width: 649px) {
        .bar {
          gap: var(--s3);
          padding: 0 var(--s4);
        }
        .clock {
          display: none;
        }
      }
      @media (max-width: 483px) {
        .discover {
          display: none;
        }
      }
    `,
  ],
})
export class TopBarComponent implements OnInit, OnDestroy {
  session = inject(SessionService);
  private router = inject(Router);

  readonly clock = signal(localClock());
  readonly isoNow = signal(new Date().toISOString());
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.scheduleTick();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Ticks once a minute, on the minute. */
  private scheduleTick() {
    const now = new Date();
    const msToNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    this.timer = setTimeout(() => {
      this.clock.set(localClock());
      this.isoNow.set(new Date().toISOString());
      this.scheduleTick();
    }, msToNextMinute);
  }
}

import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../core/session.service';
import { clockLine, msToNextMinute } from '../core/time';
import { AvatarComponent, LockupComponent } from '../shared/ui';

/**
 * One fixed bar on every public route, transparent over the page ground,
 * carrying no border and no shadow, 64px tall at depth 200.
 */
@Component({
  selector: 'app-public-bar',
  standalone: true,
  imports: [RouterLink, LockupComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <app-lockup />
      <div class="right">
        <!-- The visitor's local time, live, acting as the anchor for every
             time the product shows. -->
        <span class="clock t-caption" aria-label="Your local time">{{ clock() }}</span>
        <a routerLink="/discover" class="discover">Discover Events</a>
        @if (session.isSignedIn()) {
          <a [routerLink]="session.isHost() ? '/calendars' : '/home'" class="account" aria-label="Your account">
            <app-avatar [name]="session.account()!.display_name" [size]="32" />
          </a>
        } @else {
          <a routerLink="/login" class="btn btn-pill signin">Sign In</a>
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
        padding: 0 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        background: transparent;
        border: none;
        box-shadow: none;
        z-index: 200;
      }

      .right {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .clock {
        color: var(--ink-36);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .discover {
        color: var(--ink-64);
        font-size: 15px;
        white-space: nowrap;
      }

      @media (hover: hover) {
        .discover:hover {
          color: var(--ink);
        }
      }

      .signin {
        min-height: 38px;
        text-decoration: none;
      }

      .account {
        display: inline-flex;
        border-radius: 100%;
        min-height: 44px;
        min-width: 44px;
        align-items: center;
        justify-content: center;
      }

      @media (max-width: 649px) {
        .bar {
          padding: 0 16px;
          gap: 8px;
        }
        .clock {
          display: none;
        }
      }
    `,
  ],
})
export class PublicBarComponent implements OnInit, OnDestroy {
  session = inject(SessionService);
  readonly clock = signal(clockLine());
  private timer: any = null;

  ngOnInit() {
    // Updating once a minute on the minute.
    const tick = () => {
      this.clock.set(clockLine());
      this.timer = setTimeout(tick, msToNextMinute());
    };
    this.timer = setTimeout(tick, msToNextMinute());
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}

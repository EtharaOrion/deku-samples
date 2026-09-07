import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { clockLabel, visitorZone } from '../core/format';
import { AvatarComponent, BrandComponent } from './icons.component';

/** One fixed bar on every public route, transparent over the page ground. */
@Component({
  selector: 'app-public-bar',
  standalone: true,
  imports: [RouterLink, BrandComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <a class="brand" routerLink="/" aria-label="Deku, go to the landing page">
        <app-brand [size]="18" />
      </a>
      <span class="clock t-caption" aria-label="Your local time">{{ clock() }}</span>
      <nav class="right" aria-label="Primary">
        <a class="link t-body" routerLink="/discover">Discover Events</a>
        @if (account(); as acc) {
          <a class="account" routerLink="/home" [attr.aria-label]="'Signed in as ' + acc.display_name">
            <app-avatar [name]="acc.display_name" [size]="32" />
          </a>
        } @else {
          <a class="btn btn-pill signin" routerLink="/login">Sign In</a>
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
        padding: 0 var(--s5);
        display: flex;
        align-items: center;
        gap: var(--s4);
        background: transparent;
        border: 0;
        box-shadow: none;
        z-index: var(--z-bar);
      }
      .brand {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
      }
      .clock {
        color: var(--ink-64);
        font-variant-numeric: tabular-nums;
      }
      .right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: var(--s4);
      }
      .link {
        color: var(--ink-64);
        display: inline-flex;
        align-items: center;
        min-height: 44px;
      }
      @media (hover: hover) {
        .link:hover {
          color: var(--ink);
        }
      }
      .signin {
        min-height: 38px;
        border: 1px solid var(--ink-08);
      }
      .account {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
      }
      @media (max-width: 649px) {
        .bar {
          padding: 0 var(--s4);
          gap: var(--s3);
        }
        .clock {
          display: none;
        }
      }
    `,
  ],
})
export class PublicBarComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  readonly account = this.api.account;
  readonly clock = signal(clockLabel(visitorZone()));
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.scheduleTick();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Updates once a minute, on the minute; a clock, never a scroll listener. */
  private scheduleTick() {
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    this.timer = setTimeout(() => {
      this.clock.set(clockLabel(visitorZone()));
      this.scheduleTick();
    }, Math.max(1000, msToNextMinute));
  }
}

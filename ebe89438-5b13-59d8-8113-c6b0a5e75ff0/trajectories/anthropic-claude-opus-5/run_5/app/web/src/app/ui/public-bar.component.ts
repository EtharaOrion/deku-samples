import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { visitorClock } from '../core/time';
import { AvatarComponent } from './avatar.component';
import { BrandComponent } from './brand.component';

/**
 * One fixed bar on every public route, transparent over the page ground,
 * carrying no border and no shadow, 64px tall at depth 200. Left to right: the
 * brand lockup, the visitor's local time updating once a minute on the minute,
 * the Discover Events link, and a Sign In pill that becomes the avatar once
 * signed in.
 */
@Component({
  selector: 'app-public-bar',
  standalone: true,
  imports: [RouterLink, BrandComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <a routerLink="/" class="bar__brand" aria-label="Deku, go to the landing page">
        <app-brand />
      </a>
      <time class="bar__clock t-caption" [attr.datetime]="isoNow()">{{ clock() }}</time>
      <span class="spacer"></span>
      <a routerLink="/discover" class="bar__link t-caption">Discover Events</a>
      @if (auth.signedIn()) {
        <a
          class="bar__account"
          [routerLink]="auth.isHost() ? '/calendars' : '/home'"
          [attr.aria-label]="'Signed in as ' + (auth.account()?.display_name || '') "
        >
          <app-avatar [name]="auth.account()?.display_name || ''" [size]="32" />
        </a>
      } @else {
        <a class="btn btn--pill bar__signin" [routerLink]="'/login'" [queryParams]="nextParams()"
          >Sign In</a
        >
      }
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
        display: flex;
        align-items: center;
        gap: var(--s4);
        padding: 0 var(--s5);
        z-index: var(--z-bar);
        background: transparent;
        border: 0;
        box-shadow: none;
      }
      .bar__brand { color: inherit; display: inline-flex; align-items: center; min-height: 44px; }
      html[data-event-theme='on'] .bar__brand { color: var(--event-ink); }
      .bar__clock {
        color: var(--ink-36);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      html[data-event-theme='on'] .bar__clock { color: var(--event-ink-secondary); }
      .bar__link {
        color: var(--ink-64);
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
      }
      html[data-event-theme='on'] .bar__link { color: var(--event-ink); }
      @media (hover: hover) {
        .bar__link:hover { color: var(--blue); }
      }
      .bar__signin { min-height: 38px; }
      .bar__account {
        display: inline-flex;
        min-width: 44px;
        min-height: 44px;
        align-items: center;
        justify-content: center;
      }
      @media (max-width: 649px) {
        .bar { padding: 0 var(--s4); gap: var(--s3); }
        .bar__clock { display: none; }
      }
    `,
  ],
})
export class PublicBarComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  readonly clock = signal(visitorClock());
  readonly isoNow = signal(new Date().toISOString());

  private timer: ReturnType<typeof setTimeout> | null = null;

  nextParams(): Record<string, string> {
    const path = this.router.url.split('?')[0];
    return path && path !== '/' ? { next: path } : {};
  }

  ngOnInit(): void {
    this.scheduleTick();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Updates once a minute, on the minute. */
  private scheduleTick(): void {
    const now = new Date();
    const msToNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    this.timer = setTimeout(() => {
      this.clock.set(visitorClock());
      this.isoNow.set(new Date().toISOString());
      this.scheduleTick();
    }, msToNextMinute);
  }
}

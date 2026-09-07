import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandComponent } from './brand.component';
import { AvatarComponent } from './avatar.component';
import { AuthService } from '../core/auth.service';
import { visitorClock } from '../core/time';

/**
 * One fixed bar on every public route: the lockup, the visitor's live local
 * time, a link to discovery, and a sign-in pill that becomes the avatar.
 */
@Component({
  selector: 'app-public-bar',
  standalone: true,
  imports: [RouterLink, BrandComponent, AvatarComponent],
  template: `
    <header class="bar">
      <app-brand />
      <div class="grow"></div>
      <span class="clock" aria-label="Your local time">{{ clock() }}</span>
      <a routerLink="/discover" class="discover">Discover Events</a>
      @if (auth.isSignedIn()) {
        <a [routerLink]="auth.isHost() ? '/calendars' : '/home'" class="me"
           [attr.aria-label]="'Your account, ' + auth.account()!.display_name">
          <app-avatar [name]="auth.account()!.display_name" [size]="32" [decorative]="true" />
        </a>
      } @else {
        <a routerLink="/login" class="btn btn-primary btn-pill signin">Sign In</a>
      }
    </header>
  `,
  styles: [`
    .bar {
      position: fixed; top: 0; left: 0; right: 0; height: 64px;
      display: flex; align-items: center; gap: 16px; padding: 0 24px;
      z-index: var(--z-bar); background: transparent; border: none; box-shadow: none;
    }
    .clock { font-size: 13px; line-height: 16px; color: var(--ink-64); font-variant-numeric: tabular-nums; }
    .discover { color: var(--ink-64); font-size: 15px; }
    .discover:hover { color: var(--ink); }
    .signin { min-height: 36px; }
    .me { display: inline-flex; border-radius: 100%; }
    @media (max-width: 649px) {
      .bar { padding: 0 16px; gap: 10px; }
      .clock { display: none; }
    }
  `],
})
export class PublicBarComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  clock = signal(visitorClock());
  private timer?: any;

  ngOnInit() {
    // updates once a minute, on the minute
    const tick = () => {
      this.clock.set(visitorClock());
      const now = new Date();
      const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      this.timer = setTimeout(tick, Math.max(1000, delay));
    };
    const now = new Date();
    this.timer = setTimeout(tick, (60 - now.getSeconds()) * 1000 - now.getMilliseconds());
  }

  ngOnDestroy() { clearTimeout(this.timer); }
}

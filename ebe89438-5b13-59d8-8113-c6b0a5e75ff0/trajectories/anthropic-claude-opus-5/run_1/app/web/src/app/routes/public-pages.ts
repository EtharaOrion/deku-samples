import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Notices } from '../core/notices';
import {
  CATEGORY_LABELS,
  CATEGORY_SENTENCES,
  type CalendarPage,
  type CategoryPage,
  type PublicAccount,
} from '../core/models';
import { PublicBar } from '../ui/chrome';
import { CoverArt } from '../ui/cover-art';
import { Avatar, Brand, CategoryIcon } from '../ui/icons';
import { EventCard, ScanCode } from '../ui/shared';

/* ---------------------------------------------------------------- */
/* category                                                          */
/* ---------------------------------------------------------------- */

@Component({
  selector: 'app-category-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, PublicBar, CategoryIcon, EventCard, CoverArt],
  template: `
    <app-public-bar />
    <main id="main" class="page wrap">
      <section class="masthead">
        <div class="masthead-text">
          <app-category-icon [name]="name()" [size]="48" />
          <h1 class="t-serif cat-title">{{ label() }}</h1>
          <p class="counts t-overline">
            {{ data()?.event_count ?? 0 }} published
            {{ (data()?.event_count ?? 0) === 1 ? 'event' : 'events' }} &middot;
            {{ data()?.calendar_count ?? 0 }}
            {{ (data()?.calendar_count ?? 0) === 1 ? 'calendar' : 'calendars' }}
          </p>
          <p class="t-prose sentence">{{ sentence() }}</p>
          <form class="subscribe" (submit)="subscribe($event)">
            <label class="sr-only" [attr.for]="'sub-' + name()">Your email address</label>
            <input
              class="field-control"
              [id]="'sub-' + name()"
              type="email"
              name="email"
              [(ngModel)]="email"
              placeholder="you@example.com"
            />
            <button class="btn btn-primary" type="submit">Subscribe</button>
          </form>
        </div>
        <div class="deco" aria-hidden="true">
          <app-cover [seed]="'category-' + name()" [showTitle]="false" radius="var(--r-card-lg)" />
        </div>
      </section>

      @if (loading()) {
        <ul class="grid" aria-busy="true">
          @for (n of [1, 2, 3]; track n) {
            <li><div class="sk sk-card" style="height: 260px"></div></li>
          }
        </ul>
      } @else if ((data()?.events?.length ?? 0) > 0) {
        <h2 class="t-section shelf-h">Upcoming</h2>
        <ul class="grid">
          @for (e of data()!.events; track e.slug) {
            <li><app-event-card [event]="e" /></li>
          }
        </ul>
        @if (data()!.calendars.length) {
          <h2 class="t-section shelf-h">Calendars</h2>
          <ul class="grid-cal">
            @for (c of data()!.calendars; track c.slug) {
              <li>
                <a class="card lift cal-card interactive" [routerLink]="['/', c.slug]">
                  <app-category-icon [name]="c.category" [size]="24" />
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption muted">{{ c.city }} &middot; {{ c.published_event_count }} published</span>
                </a>
              </li>
            }
          </ul>
        }
      } @else {
        <div class="empty">
          <h2>There are currently no relevant events near you.</h2>
          <p>Widen the search and something else may catch your eye.</p>
          <a class="btn btn-primary" routerLink="/discover">Explore Events</a>
        </div>
      }
    </main>
  `,
  styles: [
    `
      .wrap {
        padding-top: calc(64px + var(--s7));
        padding-bottom: var(--s8);
      }
      .masthead {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s5);
        margin-bottom: var(--s7);
        align-items: center;
      }
      @media (min-width: 650px) {
        .masthead {
          grid-template-columns: 1fr 280px;
        }
      }
      .masthead-text {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        align-items: flex-start;
      }
      .cat-title {
        font-size: 44px;
        line-height: 52px;
        letter-spacing: -0.02em;
      }
      .counts {
        color: var(--ink-secondary);
      }
      .sentence {
        color: var(--ink-secondary);
        max-width: 520px;
      }
      .subscribe {
        display: flex;
        gap: var(--s2);
        width: 100%;
        max-width: 420px;
        flex-wrap: wrap;
      }
      .subscribe .field-control {
        flex: 1 1 200px;
      }
      .deco {
        display: block;
      }
      @media (max-width: 649px) {
        .deco {
          display: none;
        }
        .cat-title {
          font-size: 32px;
          line-height: 40px;
        }
      }
      .shelf-h {
        color: var(--ink-secondary);
        margin: var(--s6) 0 var(--s4);
      }
      .grid,
      .grid-cal {
        display: grid;
        gap: var(--s4);
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid,
        .grid-cal {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .grid,
        .grid-cal {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      .cal-card {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        padding: var(--s4);
        color: var(--ink);
      }
      .muted {
        color: var(--ink-tertiary);
      }
    `,
  ],
})
export class CategoryRoute {
  readonly name = input.required<string>();
  private api = inject(Api);
  private notices = inject(Notices);
  readonly loading = signal(true);
  readonly data = signal<CategoryPage | null>(null);
  email = '';

  readonly label = computed(() => CATEGORY_LABELS[this.name()] ?? this.name());
  readonly sentence = computed(
    () => CATEGORY_SENTENCES[this.name()] ?? 'Gatherings in this category, as they are published.'
  );

  constructor() {
    queueMicrotask(() => {
      this.api.category(this.name()).subscribe({
        next: (d) => {
          this.data.set(d);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    });
  }

  subscribe(e: Event) {
    e.preventDefault();
    if (!this.email.trim()) {
      this.notices.refuse('Enter a valid email address.');
      return;
    }
    this.notices.success(`We will let ${this.email.trim()} know when something new appears here.`);
    this.email = '';
  }
}

/* ---------------------------------------------------------------- */
/* calendar                                                          */
/* ---------------------------------------------------------------- */

@Component({
  selector: 'app-calendar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBar, CategoryIcon, EventCard],
  template: `
    <app-public-bar />
    <main id="main" class="page wrap">
      @if (loading()) {
        <div class="sk sk-title" style="width: 40%; height: 44px"></div>
        <div class="sk sk-text" style="width: 25%"></div>
      } @else if (cal(); as c) {
        <header class="head">
          <app-category-icon [name]="c.category" [size]="40" />
          <h1 class="t-serif cal-title">{{ c.name }}</h1>
          <p class="t-caption muted">/{{ c.slug }} &middot; {{ c.city }}</p>
          @if (!c.is_public) {
            <span class="pill pill-pink">Private</span>
          }
        </header>
        @if (c.events.length) {
          <ul class="grid">
            @for (e of c.events; track e.slug) {
              <li><app-event-card [event]="e" /></li>
            }
          </ul>
        } @else {
          <div class="empty">
            <h2>No Events Yet</h2>
            <p>This calendar has not published anything so far.</p>
            <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
          </div>
        }
      }
    </main>
  `,
  styles: [
    `
      .wrap {
        padding-top: calc(64px + var(--s7));
        padding-bottom: var(--s8);
      }
      .head {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        align-items: flex-start;
        margin-bottom: var(--s6);
      }
      .cal-title {
        font-size: 40px;
        line-height: 48px;
        letter-spacing: -0.02em;
      }
      .muted {
        color: var(--ink-tertiary);
      }
      .grid {
        display: grid;
        gap: var(--s4);
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    `,
  ],
})
export class CalendarPublicRoute {
  readonly slug = input.required<string>();
  private api = inject(Api);
  private router = inject(Router);
  readonly loading = signal(true);
  readonly cal = signal<CalendarPage | null>(null);

  constructor() {
    queueMicrotask(() => {
      this.api.calendar(this.slug()).subscribe({
        next: (c) => {
          this.cal.set(c);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.router.navigate(['/not-found'], { skipLocationChange: true });
        },
      });
    });
  }
}

/* ---------------------------------------------------------------- */
/* profile                                                           */
/* ---------------------------------------------------------------- */

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBar, Avatar, CategoryIcon],
  template: `
    <app-public-bar />
    <main id="main" class="page wrap">
      @if (loading()) {
        <div class="sk sk-title" style="width: 30%; height: 44px"></div>
      } @else if (account(); as a) {
        <header class="head">
          <app-avatar [name]="a.display_name" [size]="64" />
          <h1 class="t-serif name">{{ a.display_name }}</h1>
          <p class="t-caption muted">&#64;{{ a.handle }} &middot; {{ a.role === 'host' ? 'Host' : 'Guest' }}</p>
        </header>
        @if (a.calendars.length) {
          <h2 class="t-section shelf-h">Calendars</h2>
          <ul class="grid">
            @for (c of a.calendars; track c.slug) {
              <li>
                <a class="card lift cal-card interactive" [routerLink]="['/', c.slug]">
                  <app-category-icon [name]="c.category" [size]="24" />
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption muted">{{ c.city }} &middot; {{ c.published_event_count }} published</span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <div class="empty">
            <h2>Nothing Public Yet</h2>
            <p>This account has no public calendars to show.</p>
            <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
          </div>
        }
      }
    </main>
  `,
  styles: [
    `
      .wrap {
        padding-top: calc(64px + var(--s7));
        padding-bottom: var(--s8);
      }
      .head {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        align-items: flex-start;
        margin-bottom: var(--s6);
      }
      .name {
        font-size: 40px;
        line-height: 48px;
      }
      .muted {
        color: var(--ink-tertiary);
      }
      .shelf-h {
        color: var(--ink-secondary);
        margin-bottom: var(--s4);
      }
      .grid {
        display: grid;
        gap: var(--s4);
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      .cal-card {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        padding: var(--s4);
        color: var(--ink);
      }
    `,
  ],
})
export class ProfileRoute {
  readonly handle = input.required<string>();
  private api = inject(Api);
  private router = inject(Router);
  readonly loading = signal(true);
  readonly account = signal<PublicAccount | null>(null);

  constructor() {
    queueMicrotask(() => {
      this.api.account(this.handle()).subscribe({
        next: (a) => {
          this.account.set(a);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.router.navigate(['/not-found'], { skipLocationChange: true });
        },
      });
    });
  }
}

/* ---------------------------------------------------------------- */
/* system pages                                                      */
/* ---------------------------------------------------------------- */

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBar],
  template: `
    <app-public-bar />
    <main id="main" class="sys">
      <h1 class="t-serif sys-title">404 &middot; Page Not Found</h1>
      <p class="t-prose sys-body">
        Looks like you discovered a page that doesn't exist or you don't have access to.
      </p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [
    `
      .sys {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s4);
        padding: var(--s8) var(--s5);
        text-align: center;
      }
      .sys-title {
        font-size: 36px;
        line-height: 44px;
      }
      .sys-body {
        color: var(--ink-secondary);
        max-width: 480px;
      }
    `,
  ],
})
export class NotFoundRoute {}

@Component({
  selector: 'app-suspended',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Brand],
  template: `
    <main id="main" class="sys">
      <app-brand class="tinted" [size]="22" />
      <h1 class="t-serif sys-title">Account Suspended</h1>
      <p class="t-prose sys-body">This user account is suspended for violating our terms of service.</p>
    </main>
  `,
  styles: [
    `
      .sys {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s4);
        padding: var(--s8) var(--s5);
        text-align: center;
      }
      .sys-title {
        font-size: 36px;
        line-height: 44px;
      }
      .sys-body {
        color: var(--ink-secondary);
        max-width: 480px;
      }
    `,
  ],
})
export class SuspendedRoute {}

@Component({
  selector: 'app-get-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicBar, ScanCode, CoverArt],
  template: `
    <app-public-bar />
    <main id="main" class="page wrap">
      <h1 class="t-serif title">Get the App</h1>
      <p class="t-prose lede">
        Point a camera at the code and the whole calendar comes with you. Everything here works in a
        browser too, on any screen.
      </p>
      <div class="scan-holder">
        <div class="stickers" aria-hidden="true">
          @for (s of stickers; track s.k) {
            <span class="sticker" [style.transform]="'rotate(' + s.deg + 'deg)'" [style.top.px]="s.top" [style.left.px]="s.left">
              <app-cover [seed]="'sticker-' + s.k" [showTitle]="false" radius="var(--r-menu)" />
            </span>
          }
        </div>
        <div class="card scan-card">
          <app-scan-code [value]="url" [size]="200" />
          <p class="t-caption muted">{{ url }}</p>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      .wrap {
        padding-top: calc(64px + var(--s7));
        padding-bottom: var(--s8);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s4);
        text-align: center;
      }
      .title {
        font-size: 40px;
        line-height: 48px;
      }
      .lede {
        color: var(--ink-secondary);
        max-width: 480px;
      }
      .scan-holder {
        position: relative;
        margin-top: var(--s5);
      }
      .scan-card {
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s3);
        position: relative;
        z-index: 1;
        box-shadow: var(--glass-rim);
      }
      .muted {
        color: var(--ink-tertiary);
        word-break: break-all;
      }
      .stickers {
        position: absolute;
        inset: -60px;
        z-index: -1;
      }
      .sticker {
        position: absolute;
        width: 64px;
        display: block;
        opacity: 0.85;
      }
    `,
  ],
})
export class GetAppRoute {
  readonly url = typeof location !== 'undefined' ? location.origin : '/';
  readonly stickers = [
    { k: 1, deg: -8, top: 0, left: 0 },
    { k: 2, deg: 6, top: 10, left: 220 },
    { k: 3, deg: -5, top: 230, left: 4 },
    { k: 4, deg: 9, top: 240, left: 216 },
  ];
}

@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicBar],
  template: `
    <app-public-bar />
    <main id="main" class="page wrap">
      <h1 class="t-serif title">Terms and Privacy</h1>
      <h2 class="t-section">What this is</h2>
      <p class="t-prose">
        Deku hosts calendars for small public gatherings. An account holds your name, your email
        address and the events you have registered for, and nothing else.
      </p>
      <h2 class="t-section">What we send</h2>
      <p class="t-prose">
        We write to you when your registration changes: when you take a seat, when you move onto a
        waiting list, when a host decides about your request, and when a host calls an event off. We
        send nothing else.
      </p>
      <h2 class="t-section">What hosts see</h2>
      <p class="t-prose">
        The host of an event sees your name, your email address and your registration status for
        that event alone. No host can see another host's guest list.
      </p>
    </main>
  `,
  styles: [
    `
      .wrap {
        padding-top: calc(64px + var(--s7));
        padding-bottom: var(--s8);
        max-width: 640px;
      }
      .title {
        font-size: 36px;
        line-height: 44px;
        margin-bottom: var(--s5);
      }
      h2 {
        margin: var(--s5) 0 var(--s2);
        color: var(--ink-secondary);
      }
      p {
        color: var(--ink);
      }
    `,
  ],
})
export class LegalRoute {}

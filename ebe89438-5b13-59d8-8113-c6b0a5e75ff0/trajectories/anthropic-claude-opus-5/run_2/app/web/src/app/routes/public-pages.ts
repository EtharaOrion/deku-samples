import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import {
  CATEGORY_BLURB,
  CATEGORY_HUES,
  CATEGORY_LABELS,
  CategorySummary,
  EventSummary,
  PublicCalendar,
  PublicProfile,
  Ticket,
} from '../core/models';
import { ThemeService } from '../core/theme';
import {
  dateInZone,
  icsFor,
  rangeInZone,
  timeInZone,
  visitorZone,
  zoneAbbreviation,
  zonesDiffer,
} from '../core/time';
import { PublicBarComponent } from '../shell/public-bar';
import { CoverComponent } from '../ui/cover';
import { IconComponent } from '../ui/icons';
import {
  AvatarComponent,
  BrandComponent,
  EmptyStateComponent,
  PillComponent,
  ScanCodeComponent,
  SkeletonComponent,
} from '../ui/kit';
import { STATUS_TONES, STATUS_WORDS } from '../core/models';

/* ------------------------------------------------------------- 404 / system */

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, PublicBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap" id="main">
      <p class="code-line">404 · Page Not Found</p>
      <h1 class="display headline">Page Not Found</h1>
      <p class="body">
        Looks like you discovered a page that doesn't exist or you don't have access to.
      </p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 96px 24px;
        gap: 16px;
      }
      .code-line {
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        color: var(--ink-36);
        letter-spacing: 0.04em;
      }
      .headline { font-size: 40px; line-height: 48px; }
      .body { max-width: 420px; color: var(--ink-64); line-height: 25.6px; }
    `,
  ],
})
export class NotFoundComponent {
  constructor() {
    inject(ThemeService).clear();
  }
}

@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap" id="main">
      <a class="tinted" href="/"><app-brand [size]="20" [link]="false" tint="#f31a7c"></app-brand></a>
      <h1 class="display headline">Account Suspended</h1>
      <p class="body">This user account is suspended for violating our terms of service.</p>
    </main>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 96px 24px;
        gap: 16px;
      }
      .headline { font-size: 32px; line-height: 40px; }
      .body { max-width: 420px; color: var(--ink-64); line-height: 25.6px; }
      /* the one route where the lockup is tinted */
      .tinted:hover ::ng-deep svg { fill: #d5176d; }
    `,
  ],
})
export class SuspendedComponent {
  constructor() {
    inject(ThemeService).clear();
  }
}

@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [PublicBarComponent, ScanCodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap" id="main">
      <h1 class="display headline">Get the App</h1>
      <p class="body">
        Point a camera at the code to open Community Calendar on your phone. There is no
        native application to install: the web app is the app.
      </p>

      <div class="code-frame">
        <span class="sticker s1" aria-hidden="true"></span>
        <span class="sticker s2" aria-hidden="true"></span>
        <app-scan-code [value]="address"></app-scan-code>
        <span class="sticker s3" aria-hidden="true"></span>
        <span class="sticker s4" aria-hidden="true"></span>
      </div>
      <p class="address">{{ address }}</p>
    </main>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 120px 24px 64px;
        gap: 16px;
      }
      .headline { font-size: 40px; line-height: 48px; }
      .body { max-width: 420px; color: var(--ink-64); line-height: 25.6px; }
      .code-frame {
        position: relative;
        width: min(280px, 80vw);
        margin-top: 16px;
        color: var(--ink);
      }
      .sticker {
        position: absolute;
        width: 44px;
        height: 30px;
        border-radius: 4px;
        background: var(--ink-04);
        box-shadow: var(--shadow-card);
      }
      .s1 { top: -18px; left: -14px; transform: rotate(-8deg); background: rgba(243, 26, 124, 0.16); }
      .s2 { top: -14px; right: -18px; transform: rotate(7deg); background: rgba(20, 106, 235, 0.16); }
      .s3 { bottom: -16px; left: -18px; transform: rotate(6deg); background: rgba(60, 189, 44, 0.16); }
      .s4 { bottom: -18px; right: -12px; transform: rotate(-9deg); background: rgba(214, 151, 18, 0.18); }
      .address { font-size: 13px; line-height: 16px; color: var(--ink-36); margin-top: 24px; }
    `,
  ],
})
export class GetAppComponent {
  readonly address = window.location.origin;
  constructor() {
    inject(ThemeService).clear();
  }
}

/* ------------------------------------------------------------- category */

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    IconComponent,
    CoverComponent,
    SkeletonComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap" id="main">
      <header class="masthead">
        <div class="mast-copy">
          <app-icon [name]="name()" [size]="48"></app-icon>
          <h1 class="display headline">{{ label() }}</h1>
          <p class="counts">
            {{ summary()?.event_count ?? 0 }} published
            {{ (summary()?.event_count ?? 0) === 1 ? 'event' : 'events' }} ·
            {{ summary()?.calendar_count ?? 0 }}
            {{ (summary()?.calendar_count ?? 0) === 1 ? 'calendar' : 'calendars' }}
          </p>
          <p class="blurb">{{ blurb() }}</p>

          <form class="subscribe" (submit)="$event.preventDefault()">
            <label class="sr-only" for="sub-email">Your email address</label>
            <input id="sub-email" class="field-input" type="email" placeholder="you@example.com" />
            <button type="submit" class="btn">Subscribe</button>
          </form>
        </div>

        <div class="decorative" aria-hidden="true">
          <span class="deco-glow" [style.background]="hue()"></span>
          <app-icon [name]="name()" [size]="120"></app-icon>
        </div>
      </header>

      @if (loading()) {
        <ul class="grid">
          @for (n of [1, 2, 3]; track n) {
            <li><app-skeleton height="150px" radius="12px"></app-skeleton></li>
          }
        </ul>
      } @else if (events().length === 0) {
        <app-empty-state
          heading="There are currently no relevant events near you."
          body="Nothing is published in this category just yet."
        >
          <a class="btn" routerLink="/discover">Explore Events</a>
        </app-empty-state>
      } @else {
        <h2 class="section-title">Upcoming</h2>
        <ul class="grid">
          @for (e of events(); track e.slug) {
            <li>
              <a class="card-link" [routerLink]="'/' + e.slug">
                <span class="cover"><app-cover [seed]="e.cover_seed" [title]="e.title"></app-cover></span>
                <span class="c-title">{{ e.title }}</span>
                <span class="c-meta">{{ e.city }}</span>
              </a>
            </li>
          }
        </ul>
      }

      @if ((summary()?.calendars?.length ?? 0) > 0) {
        <h2 class="section-title">Calendars</h2>
        <ul class="grid">
          @for (c of summary()!.calendars; track c.slug) {
            <li>
              <a class="cal-card" [routerLink]="'/' + c.slug">
                <span class="c-title">{{ c.name }}</span>
                <span class="c-meta">{{ c.city }} · {{ c.published_count }} published</span>
              </a>
            </li>
          }
        </ul>
      }
    </main>
  `,
  styles: [
    `
      .wrap { max-width: 1080px; margin: 0 auto; padding: 112px 24px 96px; }
      .masthead {
        display: flex;
        gap: 48px;
        align-items: center;
        margin-bottom: 48px;
      }
      .mast-copy { flex: 1; min-width: 0; }
      .headline { font-size: 40px; line-height: 48px; margin: 16px 0 8px; }
      .counts { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--ink-64); }
      .blurb { margin-top: 12px; color: var(--ink-64); line-height: 25.6px; max-width: 520px; }
      .subscribe { display: flex; gap: 8px; margin-top: 24px; max-width: 420px; }
      .subscribe input { flex: 1; }
      .decorative {
        position: relative;
        width: 260px;
        height: 200px;
        border-radius: var(--r-card-lg);
        background: var(--paper-inset);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        overflow: hidden;
      }
      .deco-glow {
        position: absolute;
        width: 200px;
        height: 200px;
        border-radius: 100%;
        filter: blur(60px);
        opacity: 0.35;
      }
      .section-title {
        font-size: 22px;
        line-height: 26px;
        font-family: var(--font-display);
        font-weight: 400;
        margin: 32px 0 16px;
      }
      .grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
      .card-link, .cal-card { display: block; color: var(--ink); }
      .cover {
        display: block;
        border-radius: var(--r-card);
        overflow: hidden;
        box-shadow: var(--shadow-card);
      }
      .cal-card {
        padding: 16px;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--shadow-card);
      }
      .c-title { display: block; font-size: 14px; line-height: 21px; font-weight: 500; margin-top: 12px; }
      .cal-card .c-title { margin-top: 0; }
      .c-meta { display: block; font-size: 13px; line-height: 16px; color: var(--ink-36); }
      @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
      @media (min-width: 1000px) { .grid { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 649px) {
        .decorative { display: none; }
        .masthead { gap: 24px; }
      }
      @media (max-width: 483px) { .wrap { padding: 96px 16px 64px; } }
    `,
  ],
})
export class CategoryComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private theme = inject(ThemeService);

  readonly name = input.required<string>();
  readonly summary = signal<CategorySummary | null>(null);
  readonly events = signal<EventSummary[]>([]);
  readonly loading = signal(true);

  private controller = new AbortController();
  private loaded: string | null = null;

  readonly label = computed(() => CATEGORY_LABELS[this.name()] ?? this.name());
  readonly blurb = computed(() => CATEGORY_BLURB[this.name()] ?? '');
  readonly hue = computed(() => CATEGORY_HUES[this.name()] ?? '#146aeb');

  constructor() {
    this.theme.clear();
  }

  ngOnInit() {
    this.load();
  }

  private load() {
    const name = this.name();
    if (this.loaded === name) return;
    this.loaded = name;
    this.loading.set(true);
    Promise.all([
      this.api.categorySummary(name, this.controller.signal).catch(() => null),
      this.api
        .listEvents({ category: name, limit: 24 }, this.controller.signal)
        .catch(() => ({ items: [], total: 0 })),
    ]).then(([summary, page]) => {
      this.summary.set(summary);
      this.events.set(page.items);
      this.loading.set(false);
    });
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

/* --------------------------------------------------------- calendar page */

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    CoverComponent,
    AvatarComponent,
    PillComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap" id="main">
      @if (calendar(); as c) {
        <header class="head">
          <app-avatar [name]="c.name" [size]="56"></app-avatar>
          <div>
            <h1 class="display headline">{{ c.name }}</h1>
            <p class="meta">
              {{ c.city }} · Kept by
              <a [routerLink]="'/' + c.owner_handle">{{ c.owner_name }}</a>
            </p>
            @if (!c.is_public) {
              <app-pill word="Private" tone="danger"></app-pill>
            }
          </div>
        </header>

        @if (c.events.length === 0) {
          <app-empty-state
            heading="No Events Yet"
            body="Nothing is published on this calendar right now."
          >
            <a class="btn" routerLink="/discover">Discover Events</a>
          </app-empty-state>
        } @else {
          <ul class="grid">
            @for (e of c.events; track e.slug) {
              <li>
                <a class="card-link" [routerLink]="'/' + e.slug">
                  <span class="cover"><app-cover [seed]="e.cover_seed" [title]="e.title"></app-cover></span>
                  <span class="c-title">{{ e.title }}</span>
                  <span class="c-meta">{{ e.city }}</span>
                </a>
              </li>
            }
          </ul>
        }
      }
    </main>
  `,
  styles: [
    `
      .wrap { max-width: 1080px; margin: 0 auto; padding: 112px 24px 96px; }
      .head { display: flex; gap: 16px; align-items: center; margin-bottom: 32px; }
      .headline { font-size: 32px; line-height: 40px; }
      .meta { font-size: 13px; line-height: 18px; color: var(--ink-64); margin-top: 4px; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
      .card-link { display: block; color: var(--ink); }
      .cover { display: block; border-radius: var(--r-card); overflow: hidden; box-shadow: var(--shadow-card); }
      .c-title { display: block; font-size: 14px; line-height: 21px; font-weight: 500; margin-top: 12px; }
      .c-meta { display: block; font-size: 13px; line-height: 16px; color: var(--ink-36); }
      @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
      @media (min-width: 1000px) { .grid { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 483px) { .wrap { padding: 96px 16px 64px; } }
    `,
  ],
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);

  readonly slug = input.required<string>();
  readonly calendar = signal<PublicCalendar | null>(null);
  private controller = new AbortController();

  constructor() {
    inject(ThemeService).clear();
  }

  ngOnInit() {
    this.api
      .publicCalendar(this.slug(), this.controller.signal)
      .then((c) => this.calendar.set(c))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

/* ---------------------------------------------------------- profile page */

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap" id="main">
      @if (profile(); as p) {
        <header class="head">
          <app-avatar [name]="p.display_name" [size]="56"></app-avatar>
          <div>
            <h1 class="display headline">{{ p.display_name }}</h1>
            <p class="meta">&#64;{{ p.handle }} · {{ p.role === 'host' ? 'Host' : 'Guest' }}</p>
          </div>
        </header>

        @if (p.calendars.length === 0) {
          <app-empty-state
            heading="No Public Calendars"
            body="This account does not keep a calendar anyone can browse."
          >
            <a class="btn" routerLink="/discover">Discover Events</a>
          </app-empty-state>
        } @else {
          <ul class="list">
            @for (c of p.calendars; track c.slug) {
              <li>
                <a class="cal" [routerLink]="'/' + c.slug">
                  <span class="c-title">{{ c.name }}</span>
                  <span class="c-meta">{{ c.city }}</span>
                </a>
              </li>
            }
          </ul>
        }
      }
    </main>
  `,
  styles: [
    `
      .wrap { max-width: 720px; margin: 0 auto; padding: 112px 24px 96px; }
      .head { display: flex; gap: 16px; align-items: center; margin-bottom: 32px; }
      .headline { font-size: 32px; line-height: 40px; }
      .meta { font-size: 13px; line-height: 18px; color: var(--ink-64); margin-top: 4px; }
      .list { display: flex; flex-direction: column; gap: 12px; }
      .cal {
        display: block;
        padding: 16px;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--shadow-card);
        color: var(--ink);
      }
      .c-title { display: block; font-size: 15px; line-height: 22px; font-weight: 500; }
      .c-meta { display: block; font-size: 13px; line-height: 16px; color: var(--ink-36); }
      @media (max-width: 483px) { .wrap { padding: 96px 16px 64px; } }
    `,
  ],
})
export class ProfilePageComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);

  readonly handle = input.required<string>();
  readonly profile = signal<PublicProfile | null>(null);
  private controller = new AbortController();

  constructor() {
    inject(ThemeService).clear();
  }

  ngOnInit() {
    this.api
      .publicProfile(this.handle(), this.controller.signal)
      .then((p) => this.profile.set(p))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

/* ------------------------------------------------------------ ticket page */

/**
 * Anyone presenting the code, signed in or not, because a ticket that needs an
 * account is not presentable at a door.
 */
@Component({
  selector: 'app-ticket-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, PillComponent, ScanCodeComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap themed-page" id="main">
      @if (loading()) {
        <div class="card-shell">
          <app-skeleton height="28px" width="70%"></app-skeleton>
          <app-skeleton height="18px" width="50%"></app-skeleton>
          <app-skeleton height="180px" radius="12px"></app-skeleton>
        </div>
      } @else if (ticket(); as t) {
        <article class="ticket">
          <h1 class="display title">{{ t.title }}</h1>

          <p class="when">{{ whenLine(t) }}</p>
          <p class="zone">{{ zoneLine(t) }}</p>
          @if (showVisitor(t)) {
            <p class="zone">Your time: {{ visitorLine(t) }}</p>
          }
          <p class="where">{{ t.city }}</p>

          <p class="status-row">
            <app-pill [word]="statusWord(t)" [tone]="statusTone(t)"></app-pill>
            @if (t.checked_in_at) {
              <span class="arrived">Arrived {{ arrivedAt(t) }}</span>
            }
          </p>

          <p class="code">{{ t.ticket_code }}</p>

          <div class="scan"><app-scan-code [value]="ticketUrl()"></app-scan-code></div>

          <div class="actions">
            <button type="button" class="btn" (click)="addToCalendar(t)">Add to Calendar</button>
            <a class="btn" [routerLink]="'/' + t.event_slug">View Event</a>
          </div>
        </article>
      }
    </main>
  `,
  styles: [
    `
      :host { display: block; background: var(--event-ground); min-height: 100vh; }
      .wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 112px 24px 64px;
        min-height: 100vh;
      }
      .ticket, .card-shell {
        width: 100%;
        max-width: 400px;
        background: var(--paper);
        border-radius: var(--r-card-lg);
        padding: 32px;
        box-shadow: var(--shadow-primary);
        text-align: center;
        color: var(--ink);
      }
      .card-shell { display: flex; flex-direction: column; gap: 12px; }
      .title { font-size: 26px; line-height: 32px; margin-bottom: 16px; }
      .when { font-size: 16px; line-height: 24px; font-weight: 500; }
      .zone, .where { font-size: 13px; line-height: 18px; color: var(--ink-64); }
      .where { margin-top: 8px; }
      .status-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin: 16px 0;
        flex-wrap: wrap;
      }
      .arrived { font-size: 11px; line-height: 16px; color: var(--ink-64); }
      /* the one place a code may sit in a monospace face */
      .code {
        font-family: var(--font-mono);
        font-size: 22px;
        line-height: 26px;
        font-weight: 600;
        letter-spacing: 0.04em;
        padding: 12px;
        background: var(--paper-inset);
        border-radius: var(--r-input);
        margin-bottom: 24px;
      }
      .scan { width: 200px; margin: 0 auto 24px; color: var(--ink); }
      .actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
      @media (max-width: 483px) {
        .wrap { padding: 88px 16px 48px; }
        .ticket { padding: 24px; }
      }
    `,
  ],
})
export class TicketPageComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private themes = inject(ThemeService);

  readonly code = input.required<string>();
  readonly ticket = signal<Ticket | null>(null);
  readonly loading = signal(true);
  private controller = new AbortController();

  constructor() {
    const preloaded = this.themes.preloaded;
    if (preloaded) this.themes.apply(preloaded);
  }

  ngOnInit() {
    this.api
      .getTicket(this.code(), this.controller.signal)
      .then((t) => {
        this.ticket.set(t);
        this.themes.applyFromHex(t.theme_hex);
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.loading.set(false);
        // a code that never existed gets the not-found page
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  ticketUrl() {
    return `${window.location.origin}/t/${this.code()}`;
  }

  whenLine(t: Ticket) {
    return rangeInZone(t.starts_at, t.ends_at, t.time_zone);
  }

  zoneLine(t: Ticket) {
    return `${t.time_zone} (${zoneAbbreviation(t.starts_at, t.time_zone)})`;
  }

  showVisitor(t: Ticket) {
    return zonesDiffer(t.starts_at, t.time_zone);
  }

  visitorLine(t: Ticket) {
    return `${rangeInZone(t.starts_at, t.ends_at, visitorZone())} (${zoneAbbreviation(
      t.starts_at,
      visitorZone(),
    )})`;
  }

  statusWord(t: Ticket) {
    return STATUS_WORDS[t.status];
  }

  statusTone(t: Ticket) {
    return STATUS_TONES[t.status];
  }

  arrivedAt(t: Ticket) {
    return t.checked_in_at ? timeInZone(t.checked_in_at, t.time_zone) : '';
  }

  /** Hands the visitor a calendar file for that event. */
  addToCalendar(t: Ticket) {
    const blob = new Blob([icsFor({ ...t, slug: t.event_slug })], {
      type: 'text/calendar;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.event_slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

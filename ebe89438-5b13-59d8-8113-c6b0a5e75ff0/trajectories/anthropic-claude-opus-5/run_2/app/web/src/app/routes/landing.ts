import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, EventSummary } from '../core/models';
import { ThemeService } from '../core/theme';
import { CoverComponent, coverArt } from '../ui/cover';
import { IconComponent } from '../ui/icons';
import { PublicBarComponent } from '../shell/public-bar';
import { SkeletonComponent } from '../ui/kit';

interface Poster {
  seed: string;
  title: string;
  slug: string;
  top: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  hue: string;
}

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    CoverComponent,
    IconComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>

    <main id="main">
      <!-- A wall of event posters scattered behind a centred block of text. -->
      <section class="hero">
        <div class="wall" aria-hidden="true">
          @for (p of posters(); track p.seed) {
            <div
              class="poster drift"
              [style.top.%]="p.top"
              [style.left.%]="p.left"
              [style.width.px]="p.size"
              [style.animation-delay.ms]="p.delay"
              [style.animation-duration.ms]="p.duration"
            >
              <span class="halo" [style.background]="p.hue"></span>
              <app-cover [seed]="p.seed" [title]="p.title" [showTitle]="false"></app-cover>
            </div>
          }
        </div>

        <div class="headline">
          <h1 class="title">
            <span class="rotator">
              <span class="landing-word" [class.leaving]="leaving()">{{ adjective() }}</span>
            </span>
            <span class="line">events</span>
            <span class="line gradient">start here</span>
          </h1>

          <p class="blurb">
            A calendar for the people who actually run things: the
            <a class="wavy run" routerLink="/discover" [queryParams]="{ category: 'running' }"
              >run clubs</a
            >, the
            <a class="wavy party" routerLink="/discover" [queryParams]="{ category: 'tech' }"
              >launch parties</a
            >, the
            <a class="wavy firework" routerLink="/discover" [queryParams]="{ category: 'family' }"
              >firework shows</a
            >. Publish an evening at its own address and collect the people who
            want to be there.
          </p>

          <div class="actions">
            <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
            <a class="btn secondary" routerLink="/discover">
              Discover Events
              <app-icon name="arrow" [size]="18" hue="currentColor"></app-icon>
            </a>
          </div>
        </div>
      </section>

      <!-- Two shelves: one of calendars, one of the twelve categories. -->
      <section class="shelf container" aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" class="shelf-title display">Happening soon</h2>
        @if (loading()) {
          <ul class="grid">
            @for (n of [1, 2, 3]; track n) {
              <li class="card-shell">
                <app-skeleton height="180px" radius="12px"></app-skeleton>
                <app-skeleton height="14px" width="70%"></app-skeleton>
                <app-skeleton height="13px" width="45%"></app-skeleton>
              </li>
            }
          </ul>
        } @else if (events().length) {
          <ul class="grid">
            @for (e of events().slice(0, 6); track e.slug) {
              <li>
                <a class="event-card" [routerLink]="'/' + e.slug">
                  <span class="thumb">
                    <app-cover [seed]="e.cover_seed" [title]="e.title"></app-cover>
                  </span>
                  <span class="ec-title">{{ e.title }}</span>
                  <span class="ec-meta">{{ e.city }}</span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="quiet">Nothing is published yet. Yours could be first.</p>
        }
      </section>

      <section class="shelf container" aria-labelledby="categories-heading">
        <h2 id="categories-heading" class="shelf-title display">Browse by category</h2>
        <ul class="cat-grid">
          @for (c of categories; track c) {
            <li>
              <a class="cat-card" [routerLink]="'/' + c">
                <app-icon [name]="c" [size]="24"></app-icon>
                <span>{{ label(c) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <!-- A closing band that repeats the primary action above the footer. -->
      <section class="closing container">
        <h2 class="display closing-title">Your first event takes five minutes.</h2>
        <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
      </section>

      <footer class="footer container">
        <span>Community Calendar</span>
        <a routerLink="/app">Get the App</a>
      </footer>
    </main>
  `,
  styles: [
    `
      :host { display: block; background: var(--paper); }

      .hero {
        position: relative;
        min-height: min(880px, 100vh);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 120px 24px 64px;
        overflow: hidden;
      }

      .wall { position: absolute; inset: 0; z-index: -1; }
      .poster {
        position: absolute;
        border-radius: 12.8% / 5.7%;
        overflow: visible;
        /* only position and opacity move; the halo is painted once */
        animation-name: nudge;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
        will-change: transform;
      }
      .poster app-cover {
        border-radius: 12.8% / 5.7%;
        overflow: hidden;
        display: block;
        box-shadow: var(--shadow-card);
      }
      /* each poster throws its own colour onto the ground around it */
      .halo {
        position: absolute;
        inset: -30%;
        border-radius: 100%;
        filter: blur(48px);
        opacity: 0.28;
        z-index: -1;
      }

      .headline {
        position: relative;
        z-index: 1;
        max-width: 640px;
        text-align: center;
      }
      .title {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 64px;
        line-height: 72px;
        letter-spacing: -0.03em;
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      /* the outgoing word travels up out of a clipping block */
      .rotator {
        display: block;
        overflow: hidden;
        height: 72px;
      }
      .landing-word {
        display: block;
        animation: landing-title-rise 1200ms linear both;
      }
      .landing-word.leaving {
        animation: landing-title-leave 1200ms linear both;
      }
      .line { display: block; }
      .gradient {
        background: linear-gradient(90deg, #f31a7c, #d69712);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .blurb {
        font-size: 16px;
        line-height: 25.6px;
        color: var(--ink-36);
        max-width: 480px;
        margin: 24px auto 0;
      }
      .wavy {
        color: inherit;
        text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09);
        text-underline-offset: 3px;
      }
      @media (hover: hover) {
        .wavy.run:hover { color: #3cbd2c; }
        .wavy.party:hover { color: #f31a7c; }
        .wavy.firework:hover { color: #146aeb; }
      }

      .actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-top: 32px;
        flex-wrap: wrap;
      }
      .secondary { background: var(--ink-04); }
      .secondary app-icon { animation: arrow-fade 600ms linear both; }

      .shelf { padding: 48px 24px; }
      .shelf-title {
        font-size: 22px;
        line-height: 26px;
        margin-bottom: 24px;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 24px;
      }
      .card-shell { display: flex; flex-direction: column; gap: 8px; }
      .event-card { display: block; color: var(--ink); }
      .thumb {
        display: block;
        border-radius: var(--r-card);
        overflow: hidden;
        box-shadow: var(--shadow-card);
        transition: box-shadow var(--dur) var(--ease);
      }
      /* Cards lift on their shadow when pointed at, without moving. */
      @media (hover: hover) {
        .event-card:hover .thumb { box-shadow: var(--shadow-fine); }
      }
      .ec-title {
        display: block;
        font-size: 14px;
        line-height: 21px;
        font-weight: 500;
        margin-top: 12px;
      }
      .ec-meta {
        display: block;
        font-size: 13px;
        line-height: 16px;
        color: var(--ink-36);
      }
      .quiet { color: var(--ink-36); }

      .cat-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .cat-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--shadow-card);
        color: var(--ink);
        font-size: 15px;
        line-height: 22px;
        font-weight: 500;
        min-height: 44px;
      }
      @media (hover: hover) {
        .cat-card:hover { box-shadow: var(--shadow-fine); }
      }

      .closing {
        text-align: center;
        padding: 64px 24px;
      }
      .closing-title { font-size: 32px; line-height: 40px; margin-bottom: 24px; }

      .footer {
        display: flex;
        justify-content: space-between;
        padding: 32px 24px 48px;
        color: var(--ink-36);
        font-size: 13px;
        line-height: 16px;
        border-top: 1px solid var(--ink-08);
      }

      @media (min-width: 484px) {
        .grid { grid-template-columns: repeat(2, 1fr); }
        .cat-grid { grid-template-columns: repeat(3, 1fr); }
      }
      @media (min-width: 1000px) {
        .grid { grid-template-columns: repeat(3, 1fr); }
        .cat-grid { grid-template-columns: repeat(4, 1fr); }
      }
      @media (min-width: 1580px) {
        .grid { grid-template-columns: repeat(4, 1fr); }
        .cat-grid { grid-template-columns: repeat(6, 1fr); }
      }

      @media (max-width: 999px) {
        .title { font-size: 44px; line-height: 50px; }
        .rotator { height: 50px; }
      }
      @media (max-width: 483px) {
        .title { font-size: 36px; line-height: 42px; }
        .rotator { height: 42px; }
        .hero { padding: 96px 16px 48px; }
        .shelf { padding: 32px 16px; }
      }
    `,
  ],
})
export class LandingComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private theme = inject(ThemeService);

  readonly categories = CATEGORIES;
  readonly events = signal<EventSummary[]>([]);
  readonly loading = signal(true);

  readonly adjectiveIndex = signal(0);
  readonly leaving = signal(false);
  readonly adjective = computed(() => ADJECTIVES[this.adjectiveIndex()]);

  private timer: ReturnType<typeof setInterval> | null = null;
  private controller = new AbortController();

  readonly posters = signal<Poster[]>([]);

  ngOnInit() {
    this.theme.clear();
    this.buildPosters();

    // The drift runs on a clock, not on scroll position: no scroll listener.
    this.timer = setInterval(() => {
      this.leaving.set(true);
      setTimeout(() => {
        this.adjectiveIndex.update((i) => (i + 1) % ADJECTIVES.length);
        this.leaving.set(false);
      }, 400);
    }, 2400);

    this.api
      .listEvents({ limit: 24 }, this.controller.signal)
      .then((page) => {
        this.events.set(page.items);
        if (page.items.length) this.buildPosters(page.items);
      })
      .catch(() => undefined)
      .finally(() => this.loading.set(false));
  }

  /** 22 poster tiles at desktop, 12 at tablet and 8 on a phone. */
  private posterCount(): number {
    const w = window.innerWidth;
    if (w < 650) return 8;
    if (w < 1000) return 12;
    return 22;
  }

  private buildPosters(events: EventSummary[] = []) {
    const count = this.posterCount();
    const out: Poster[] = [];
    // deterministic scatter, so the wall is stable between paints
    for (let i = 0; i < count; i++) {
      const source = events.length ? events[i % events.length] : null;
      const seed = source ? `${source.cover_seed}-${i}` : `poster-${i}`;
      const art = coverArt(seed);
      const col = i % 6;
      const row = Math.floor(i / 6);
      out.push({
        seed,
        title: source?.title ?? '',
        slug: source?.slug ?? '',
        left: (col * 17 + ((i * 7) % 9)) - 4,
        top: row * 26 + ((i * 13) % 11) - 6,
        size: 96 + ((i * 29) % 64),
        delay: (i * 137) % 1000,
        duration: 4000 + ((i * 311) % 3000),
        hue: art.a,
      });
    }
    this.posters.set(out);
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.controller.abort();
  }
}

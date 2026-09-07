import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, type CalendarSummary, type EventSummary } from '../core/models';
import { CoverArt } from '../ui/cover-art';
import { PublicBar } from '../ui/chrome';
import { CategoryIcon, Icon } from '../ui/icons';
import { EventCard } from '../ui/shared';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBar, CoverArt, CategoryIcon, Icon, EventCard],
  template: `
    <app-public-bar />
    <main id="main">
      <section class="hero">
        <!-- a wall of posters drifting on the nudge clock, each throwing its own
             colour onto the ground around it -->
        <div class="wall" aria-hidden="true">
          @for (p of posters(); track p.k) {
            <span
              class="poster drift"
              [style.left.%]="p.x"
              [style.top.%]="p.y"
              [style.width.px]="p.size"
              [style.animation-delay.ms]="p.delay"
              [style.--halo]="p.halo"
            >
              <app-cover [seed]="p.seed" [showTitle]="false" radius="var(--r-media)" />
            </span>
          }
        </div>

        <div class="headline">
          <h1 class="title">
            <span class="rise-mask">
              <span class="rise title-rise" [attr.key]="adjectiveIndex()">{{ adjective() }}</span>
            </span>
            <span class="line">events</span>
            <span class="line gradient">start here</span>
          </h1>
          <p class="lede t-prose">
            Deku is where a small public gathering gets its own address. Post
            <a class="wavy run" routerLink="/discover" [queryParams]="{ category: 'running' }">run clubs</a>,
            <a class="wavy party" routerLink="/discover" [queryParams]="{ category: 'tech' }">launch parties</a>
            and
            <a class="wavy fireworks" routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }">firework shows</a>,
            then watch the seats fill.
          </p>
          <div class="hero-actions">
            <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
            <a class="btn btn-quiet" routerLink="/discover">
              Discover Events
              <span class="arrow arrow-fade"><app-icon name="arrow-right" [size]="18" /></span>
            </a>
          </div>
        </div>
      </section>

      <section class="shelf page" aria-labelledby="shelf-calendars">
        <h2 id="shelf-calendars" class="t-section">Calendars to follow</h2>
        @if (loading()) {
          <ul class="grid-cal">
            @for (n of [1, 2, 3]; track n) {
              <li><div class="sk sk-card" style="height: 120px"></div></li>
            }
          </ul>
        } @else if (calendars().length) {
          <ul class="grid-cal">
            @for (c of calendars(); track c.slug) {
              <li>
                <a class="card lift cal-card interactive" [routerLink]="['/', c.slug]">
                  <app-category-icon [name]="c.category" [size]="28" />
                  <span class="cal-name t-card-title">{{ c.name }}</span>
                  <span class="t-caption cal-meta">{{ c.city }} &middot; {{ label(c.category) }}</span>
                  <span class="t-caption cal-count">{{ c.published_event_count }} published</span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="t-prose empty-inline">No calendars are public yet. <a routerLink="/create">Create one</a>.</p>
        }
      </section>

      <section class="shelf page" aria-labelledby="shelf-cats">
        <h2 id="shelf-cats" class="t-section">Browse by category</h2>
        <ul class="grid-cat">
          @for (c of categories; track c) {
            <li>
              <a class="card lift cat-card interactive" [routerLink]="['/', c]">
                <app-category-icon [name]="c" [size]="28" />
                <span class="t-card-title">{{ label(c) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <section class="shelf page" aria-labelledby="shelf-events">
        <h2 id="shelf-events" class="t-section">Happening soon</h2>
        @if (loading()) {
          <ul class="grid-ev">
            @for (n of [1, 2, 3]; track n) {
              <li><div class="sk sk-card" style="height: 260px"></div></li>
            }
          </ul>
        } @else if (events().length) {
          <ul class="grid-ev">
            @for (e of events().slice(0, 6); track e.slug) {
              <li><app-event-card [event]="e" /></li>
            }
          </ul>
        } @else {
          <p class="t-prose empty-inline">Nothing is published yet. <a routerLink="/create">Be the first</a>.</p>
        }
      </section>

      <section class="closing">
        <div class="page closing-inner">
          <h2 class="t-serif closing-title">Your evening deserves its own address.</h2>
          <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
        </div>
      </section>

      <footer class="foot">
        <div class="page foot-inner t-caption">
          <span>Deku &mdash; a hosting tool for small public gatherings.</span>
          <a routerLink="/app" class="link-quiet">Get the App</a>
        </div>
      </footer>
    </main>
  `,
  styles: [
    `
      main {
        padding-top: 64px;
      }
      .hero {
        position: relative;
        min-height: 640px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s8) var(--s5);
        overflow: hidden;
      }
      .wall {
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
      }
      .poster {
        position: absolute;
        display: block;
        opacity: 0.5;
        filter: drop-shadow(0 12px 32px var(--halo));
      }
      /* only position and opacity move; blurs and halos are painted once */
      .drift {
        animation: nudge 1000ms linear infinite;
      }
      .headline {
        position: relative;
        z-index: 1;
        max-width: 640px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s5);
      }
      .title {
        font-family: var(--serif);
        font-weight: 700;
        font-size: 64px;
        line-height: 72px;
        letter-spacing: -0.03em;
        display: flex;
        flex-direction: column;
      }
      .rise-mask {
        display: block;
        overflow: hidden;
        height: 72px;
      }
      .rise {
        display: block;
        animation: landing-title-rise 1200ms linear both;
      }
      .line {
        display: block;
      }
      /* the only place in the product where a gradient touches type */
      .gradient {
        background: linear-gradient(90deg, #f31a7c, #d69712);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .lede {
        max-width: 480px;
        color: var(--ink-tertiary);
      }
      .wavy {
        color: inherit;
        text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09);
        text-underline-offset: 3px;
        transition: color 0.21s ease-out;
      }
      @media (hover: hover) {
        .wavy.run:hover {
          color: #3cbd2c;
        }
        .wavy.party:hover {
          color: #f31a7c;
        }
        .wavy.fireworks:hover {
          color: #146aeb;
        }
      }
      .hero-actions {
        display: flex;
        gap: var(--s3);
        flex-wrap: wrap;
        justify-content: center;
      }
      .arrow {
        display: inline-flex;
        animation: arrow-fade 600ms linear both;
      }
      .shelf {
        padding-top: var(--s7);
        padding-bottom: var(--s2);
      }
      .shelf h2 {
        margin-bottom: var(--s4);
        color: var(--ink-secondary);
      }
      .grid-cal,
      .grid-cat,
      .grid-ev {
        display: grid;
        gap: var(--s4);
      }
      .grid-cal {
        grid-template-columns: 1fr;
      }
      .grid-cat {
        grid-template-columns: repeat(2, 1fr);
      }
      .grid-ev {
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid-cal,
        .grid-ev {
          grid-template-columns: repeat(2, 1fr);
        }
        .grid-cat {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .grid-cal,
        .grid-ev {
          grid-template-columns: repeat(3, 1fr);
        }
        .grid-cat {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      @media (min-width: 1580px) {
        .grid-cal,
        .grid-ev {
          grid-template-columns: repeat(4, 1fr);
        }
        .grid-cat {
          grid-template-columns: repeat(6, 1fr);
        }
      }
      .cal-card,
      .cat-card {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        padding: var(--s4);
        color: var(--ink);
        height: 100%;
      }
      .cat-card {
        align-items: center;
        text-align: center;
        min-height: 96px;
        justify-content: center;
      }
      .cal-meta,
      .cal-count {
        color: var(--ink-tertiary);
      }
      .empty-inline {
        color: var(--ink-secondary);
      }
      .closing {
        margin-top: var(--s8);
        padding: var(--s8) 0;
        background: var(--paper-inset);
        border-top: 1px solid var(--ink-hairline);
      }
      .closing-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s5);
        text-align: center;
      }
      .closing-title {
        font-size: 32px;
        line-height: 40px;
      }
      .foot {
        padding: var(--s5) 0 var(--s7);
      }
      .foot-inner {
        display: flex;
        justify-content: space-between;
        gap: var(--s4);
        color: var(--ink-tertiary);
        flex-wrap: wrap;
      }
      @media (max-width: 999px) {
        .title {
          font-size: 44px;
          line-height: 50px;
        }
        .rise-mask {
          height: 50px;
        }
      }
      @media (max-width: 483px) {
        .title {
          font-size: 36px;
          line-height: 42px;
        }
        .rise-mask {
          height: 42px;
        }
        .hero {
          min-height: 520px;
        }
      }
    `,
  ],
})
export class LandingRoute implements OnDestroy {
  private api = inject(Api);
  readonly categories = CATEGORIES;
  readonly loading = signal(true);
  readonly events = signal<EventSummary[]>([]);
  readonly calendars = signal<CalendarSummary[]>([]);
  readonly adjectiveIndex = signal(0);
  readonly adjective = computed(() => ADJECTIVES[this.adjectiveIndex() % ADJECTIVES.length]);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** 22 tiles at desktop, 12 at tablet and 8 on a phone. */
  readonly posters = computed(() => {
    const count = this.tileCount();
    const halos = [
      'rgba(243, 26, 124, 0.28)',
      'rgba(20, 106, 235, 0.28)',
      'rgba(60, 189, 44, 0.28)',
      'rgba(171, 70, 221, 0.28)',
      'rgba(214, 151, 18, 0.28)',
    ];
    const seeds = this.events().map((e) => e.cover_seed);
    return Array.from({ length: count }, (_, i) => {
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12345.6789;
      return {
        k: i,
        seed: seeds[i % Math.max(1, seeds.length)] ?? `wall-${i}`,
        x: Math.abs(a % 100),
        y: Math.abs(b % 100),
        size: 72 + (i % 4) * 26,
        delay: (i % 8) * 125,
        halo: halos[i % halos.length],
      };
    });
  });

  private readonly width = signal(typeof window === 'undefined' ? 1440 : window.innerWidth);
  private readonly tileCount = computed(() => {
    const w = this.width();
    if (w < 650) return 8;
    if (w < 1000) return 12;
    return 22;
  });

  private onResize = () => this.width.set(window.innerWidth);

  constructor() {
    this.api.landing().subscribe({
      next: (res) => {
        this.events.set(res.events);
        this.calendars.set(res.calendars as unknown as CalendarSummary[]);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    // the drift runs on a clock, never on scroll position: no scroll listener
    this.timer = setInterval(() => this.adjectiveIndex.update((n) => n + 1), 2400);
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener('resize', this.onResize);
  }
}

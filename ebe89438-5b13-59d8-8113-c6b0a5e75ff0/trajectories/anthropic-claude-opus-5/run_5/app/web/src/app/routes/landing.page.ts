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
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { CATEGORIES, CATEGORY_LABELS, type LandingData } from '../core/models';
import { PublicBarComponent } from '../ui/public-bar.component';
import { IconComponent } from '../ui/icon.component';
import { coverBackground, posterCount, posterPlacements, withAlpha, coverKey } from '../core/art';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'] as const;
const HOLD_MS = 2400;

/**
 * A wall of event posters scattered behind a centred block of text. The posters
 * drift on the nudge clock and each throws its own colour onto the ground around
 * it. No scroll listener is attached anywhere on this route: the drift runs on a
 * clock, not on scroll position.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main id="main">
      <section class="hero">
        <div class="wall" aria-hidden="true">
          @for (p of posters(); track p.k) {
            <span
              class="poster drift"
              [style.left.%]="p.left"
              [style.top.%]="p.top"
              [style.width.px]="p.size"
              [style.height.px]="p.size"
              [style.transform]="'rotate(' + p.rotate + 'deg)'"
              [style.animation-delay.ms]="p.delay"
              [style.animation-duration.ms]="p.duration"
            >
              <span class="poster__halo" [style.background]="p.halo"></span>
              <span class="poster__face" [style.background]="p.face"></span>
            </span>
          }
        </div>

        <div class="headline">
          <h1 class="title">
            <span class="title__mask">
              <span class="title__word" [attr.key]="adjectiveIndex()" data-reveal>{{
                adjective()
              }}</span>
            </span>
            <span class="title__line">events</span>
            <span class="title__line title__line--gradient">start here</span>
          </h1>

          <p class="blurb t-prose">
            Deku is where small gatherings live: neighbourhood
            <a class="wavy wavy--green" routerLink="/discover" [queryParams]="{ category: 'running' }"
              >run clubs</a
            >, book
            <a class="wavy wavy--pink" routerLink="/discover" [queryParams]="{ category: 'books' }"
              >launch parties</a
            >
            and the sort of
            <a class="wavy wavy--blue" routerLink="/discover" [queryParams]="{ category: 'family' }"
              >firework shows</a
            >
            somebody organises because nobody else did.
          </p>

          <div class="actions">
            <a class="btn btn--primary" routerLink="/create">Create Your First Event</a>
            <a class="btn btn--pill secondary" routerLink="/discover">
              Discover Events
              <app-icon name="arrow-right" [size]="18" colour="currentColor" />
            </a>
          </div>
        </div>
      </section>

      <section class="shelf page" aria-labelledby="shelf-calendars">
        <h2 class="shelf__head t-screen-title" id="shelf-calendars">Calendars to follow</h2>
        @if (loading()) {
          <ul class="grid grid--calendars">
            @for (n of [1, 2, 3]; track n) {
              <li><div class="skeleton skeleton--card shelf__skeleton"></div></li>
            }
          </ul>
        } @else {
          <ul class="grid grid--calendars">
            @for (c of data()?.calendars ?? []; track c.slug) {
              <li>
                <a class="card card--lift cal" [routerLink]="'/' + c.slug">
                  <span class="cal__glyph">
                    <app-icon [name]="anyIcon(c.category)" [size]="28" />
                  </span>
                  <span class="cal__lines">
                    <span class="t-card-title">{{ c.name }}</span>
                    <span class="t-caption cal__meta"
                      >{{ c.city }} · {{ c.published_event_count }} published</span
                    >
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </section>

      <section class="shelf page" aria-labelledby="shelf-categories">
        <h2 class="shelf__head t-screen-title" id="shelf-categories">Browse by category</h2>
        <ul class="grid grid--categories">
          @for (cat of categories; track cat) {
            <li>
              <a class="card card--lift cat" [routerLink]="'/' + cat">
                <app-icon [name]="anyIcon(cat)" [size]="26" />
                <span class="t-card-title">{{ label(cat) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <section class="closing">
        <div class="page closing__inner">
          <h2 class="closing__head">Somebody has to be the one who organises it.</h2>
          <a class="btn btn--primary" routerLink="/create">Create Your First Event</a>
        </div>
      </section>

      <footer class="footer">
        <div class="page footer__inner t-caption">
          <span>Deku · a community calendar</span>
          <span class="spacer"></span>
          <a routerLink="/discover">Discover</a>
          <a routerLink="/app">Get the App</a>
          <a routerLink="/terms">Terms</a>
        </div>
      </footer>
    </main>
  `,
  styles: [
    `
      .hero {
        position: relative;
        min-height: min(88vh, 820px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 128px var(--s5) var(--s8);
        overflow: hidden;
      }
      .wall { position: absolute; inset: -6%; z-index: var(--z-decor); }
      .poster { position: absolute; display: block; }
      /* Only position and opacity move; the halo is painted once and left alone. */
      .drift { animation-name: nudge; animation-timing-function: linear; animation-iteration-count: infinite; }
      .poster__halo {
        position: absolute;
        inset: -46%;
        border-radius: var(--r-circle);
        filter: blur(46px);
        opacity: 0.5;
      }
      .poster__face {
        position: absolute;
        inset: 0;
        border-radius: var(--r-media);
        opacity: 0.5;
        box-shadow: var(--elev-card);
      }

      .headline {
        position: relative;
        z-index: 1;
        max-width: 640px;
        display: flex;
        flex-direction: column;
        gap: var(--s5);
        align-items: flex-start;
      }
      .title {
        font-family: var(--serif);
        font-weight: 700;
        letter-spacing: -0.03em;
        font-size: 64px;
        line-height: 72px;
        display: flex;
        flex-direction: column;
      }
      .title__mask { display: block; overflow: hidden; height: 1em; line-height: inherit; }
      .title__word { display: block; animation: landing-title-rise 1200ms linear both; }
      .title__line { display: block; }
      .title__line--gradient {
        background: linear-gradient(90deg, #f31a7c 0%, #d69712 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        width: fit-content;
      }
      .blurb { max-width: 480px; color: var(--ink-36); }
      .wavy {
        color: inherit;
        text-decoration: underline;
        text-decoration-style: wavy;
        text-decoration-thickness: 1px;
        text-decoration-color: rgba(21, 21, 21, 0.09);
        text-underline-offset: 3px;
      }
      @media (hover: hover) {
        .wavy--green:hover { color: #3cbd2c; }
        .wavy--pink:hover { color: #f31a7c; }
        .wavy--blue:hover { color: #146aeb; }
      }
      .actions { display: flex; gap: var(--s3); flex-wrap: wrap; }
      .secondary { background: var(--ink-04); color: var(--ink-64); }

      .shelf { padding-block: var(--s7); display: flex; flex-direction: column; gap: var(--s4); }
      .shelf__head { font-family: var(--serif); font-weight: 400; }
      .shelf__skeleton { height: 92px; }
      .grid { display: grid; gap: var(--s3); }
      .grid--calendars { grid-template-columns: 1fr; }
      .grid--categories { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (min-width: 484px) {
        .grid--calendars { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .grid--categories { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      @media (min-width: 1000px) {
        .grid--calendars { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .grid--categories { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
      @media (min-width: 1580px) {
        .grid--calendars { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .grid--categories { grid-template-columns: repeat(6, minmax(0, 1fr)); }
      }

      .cal {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s4);
        color: inherit;
        min-height: 92px;
      }
      .cal__glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: var(--r-menu);
        background: var(--paper-inset);
        flex: none;
      }
      .cal__lines { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .cal__meta { color: var(--muted); }
      .cat {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        padding: var(--s4);
        color: inherit;
        min-height: 96px;
        justify-content: center;
      }

      .closing { padding-block: var(--s8); background: var(--paper-inset); }
      .closing__inner {
        display: flex;
        flex-direction: column;
        gap: var(--s4);
        align-items: center;
        text-align: center;
      }
      .closing__head {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 28px;
        line-height: 36px;
        max-width: 520px;
      }

      .footer { border-top: 1px solid var(--divider); padding-block: var(--s5); }
      .footer__inner { display: flex; gap: var(--s4); color: var(--muted); flex-wrap: wrap; }
      .footer__inner a { color: var(--ink-64); }

      @media (max-width: 999px) {
        .title { font-size: 44px; line-height: 50px; }
      }
      @media (max-width: 483px) {
        .title { font-size: 36px; line-height: 42px; }
        .hero { padding: 104px var(--s4) var(--s7); }
      }
    `,
  ],
})
export class LandingPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private themeService = inject(ThemeService);

  readonly categories = CATEGORIES;
  readonly data = signal<LandingData | null>(null);
  readonly loading = signal(true);
  readonly adjectiveIndex = signal(0);

  readonly adjective = computed(() => ADJECTIVES[this.adjectiveIndex() % ADJECTIVES.length]);

  private timer: ReturnType<typeof setInterval> | null = null;

  readonly posters = computed(() => {
    const events = this.data()?.events ?? [];
    const count = posterCount(typeof window === 'undefined' ? 1200 : window.innerWidth);
    const placements = posterPlacements(count);
    return placements.map((p, i) => {
      const seed = events.length ? events[i % events.length].cover_seed : `poster-${i}`;
      return {
        k: `${i}-${seed}`,
        ...p,
        face: coverBackground(seed),
        halo: `radial-gradient(circle, ${withAlpha(coverKey(seed), 0.5)} 0%, ${withAlpha(
          coverKey(seed),
          0,
        )} 70%)`,
      };
    });
  });

  ngOnInit(): void {
    this.themeService.clear();
    this.api.landing().subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    // The adjective rotates on a clock; no scroll listener is attached at all.
    this.timer = setInterval(() => this.adjectiveIndex.update((v) => v + 1), HOLD_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  label(name: string): string {
    return CATEGORY_LABELS[name] ?? name;
  }

  anyIcon(name: string): any {
    return name;
  }
}

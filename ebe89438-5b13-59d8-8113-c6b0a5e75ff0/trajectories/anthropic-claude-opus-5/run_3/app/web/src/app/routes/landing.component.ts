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
import { CATEGORIES, CATEGORY_LABELS, type CategoryCount, type EventSummary } from '../core/models';
import { PublicBarComponent } from '../layout/public-bar.component';
import { CoverComponent } from '../shared/cover.component';
import { CategoryIconComponent, IconComponent } from '../shared/icons.component';
import { hashSeed } from '../core/art';

type Poster = { seed: string; title: string; slug: string | null; x: number; y: number; delay: number; size: number };

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, CoverComponent, CategoryIconComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main class="landing">
      <!-- A wall of event posters scattered behind a centred block of text.
           The posters drift on the nudge clock, and each throws its own colour
           onto the ground around it. No scroll listener is attached: the drift
           runs on a clock, not on scroll position. -->
      <div class="poster-wall" aria-hidden="true">
        @for (poster of posters(); track poster.seed) {
          <div
            class="poster"
            [style.left.%]="poster.x"
            [style.top.%]="poster.y"
            [style.animation-delay.ms]="poster.delay"
          >
            <app-cover [seed]="poster.seed" [title]="poster.title" [size]="poster.size" [showTitle]="false" />
          </div>
        }
      </div>

      <section class="headline-block">
        <h1 class="headline">
          <span class="word-slot">
            <span class="landing-word" [style.animation-delay.ms]="0">{{ adjective() }}</span>
          </span>
          <span class="line">events</span>
          <span class="line gradient">start here</span>
        </h1>

        <p class="blurb t-longform">
          Deku is where small public gatherings live: the
          <a routerLink="/discover" [queryParams]="{ category: 'running' }" class="ink-link run">run clubs</a>, the
          <a routerLink="/discover" [queryParams]="{ category: 'tech' }" class="ink-link launch">launch parties</a> and
          the
          <a routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }" class="ink-link firework"
            >firework shows</a
          >
          that a city runs on. Publish an evening at its own address, and collect the people who want to be there.
        </p>

        <div class="actions">
          <a routerLink="/create" class="btn btn-primary btn-pill">Create Your First Event</a>
          <a routerLink="/discover" class="btn btn-pill secondary">
            Discover Events
            <span class="arrow"><app-icon name="arrow-right" [size]="16" /></span>
          </a>
        </div>
      </section>

      <section class="shelf" aria-labelledby="calendars-shelf">
        <h2 id="calendars-shelf" class="shelf-title t-overline">Calendars to follow</h2>
        <ul class="calendar-shelf">
          @for (event of featured(); track event.slug) {
            <li>
              <a [routerLink]="'/' + event.slug" class="calendar-card lift">
                <app-cover [seed]="event.cover_seed" [title]="event.title" [size]="220" [showTitle]="false" />
                <span class="cc-title t-card-title">{{ event.title }}</span>
                <span class="cc-meta t-caption">{{ label(event.category) }} &middot; {{ event.city }}</span>
              </a>
            </li>
          } @empty {
            @for (n of [1, 2, 3]; track n) {
              <li><div class="skeleton" style="height: 260px; border-radius: 12px"></div></li>
            }
          }
        </ul>
      </section>

      <section class="shelf" aria-labelledby="categories-shelf">
        <h2 id="categories-shelf" class="shelf-title t-overline">Browse by category</h2>
        <ul class="category-shelf">
          @for (category of categories; track category) {
            <li>
              <a [routerLink]="'/' + category" class="category-card lift">
                <app-category-icon [category]="category" [size]="28" [label]="label(category)" />
                <span class="t-card-title">{{ label(category) }}</span>
                <span class="t-caption count">{{ countFor(category) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <section class="closing-band">
        <h2 class="t-serif closing-title">Your evening, at its own address.</h2>
        <a routerLink="/create" class="btn btn-primary btn-pill">Create Your First Event</a>
      </section>

      <footer class="footer">
        <span class="t-caption">Deku &middot; Community calendars for small public gatherings</span>
        <a routerLink="/terms" class="t-caption">Terms</a>
      </footer>
    </main>
  `,
  styles: [
    `
      .landing {
        position: relative;
        min-height: 100vh;
        padding-top: 64px;
        overflow-x: hidden;
      }

      .poster-wall {
        position: absolute;
        inset: 0;
        height: 780px;
        z-index: -1;
        pointer-events: none;
        overflow: hidden;
      }

      .poster {
        position: absolute;
        animation: nudge 1000ms linear infinite;
        opacity: 0.85;
      }

      .headline-block {
        max-width: 640px;
        margin: 0 auto;
        padding: 96px 24px 64px;
        position: relative;
        z-index: 1;
        text-align: center;
      }

      .headline {
        font-family: var(--serif);
        font-weight: 700;
        font-size: 64px;
        line-height: 72px;
        letter-spacing: -0.03em;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      /* The outgoing word travels up out of a clipping block while the incoming
         word travels up into it, and the two never overlap. */
      .word-slot {
        display: block;
        overflow: hidden;
        height: 72px;
      }

      .landing-word {
        display: block;
        animation: landing-title-rise 1200ms linear both;
      }

      .line {
        display: block;
      }

      /* The only place in the product where a gradient touches type. */
      .gradient {
        background: linear-gradient(90deg, #f31a7c, #d69712);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .blurb {
        max-width: 480px;
        margin: 24px auto 0;
        color: var(--ink-36);
      }

      .ink-link {
        text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09);
        text-underline-offset: 3px;
        transition: color 0.21s ease-out;
      }

      @media (hover: hover) {
        .run:hover { color: #3cbd2c; }
        .launch:hover { color: #f31a7c; }
        .firework:hover { color: #146aeb; }
      }

      .actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-top: 32px;
        flex-wrap: wrap;
      }

      .secondary {
        background: var(--paper);
        color: var(--ink-64);
        box-shadow: var(--ring-onboarding);
      }

      .arrow {
        display: inline-flex;
        animation: arrow-fade 600ms linear both;
      }

      .shelf {
        max-width: 1080px;
        margin: 0 auto;
        padding: 48px 24px 0;
      }

      .shelf-title {
        color: var(--ink-36);
        margin-bottom: 16px;
      }

      .calendar-shelf,
      .category-shelf {
        display: grid;
        gap: 16px;
      }

      .calendar-shelf {
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }

      .category-shelf {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .calendar-card,
      .category-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--elev-card);
      }

      .category-card {
        gap: 6px;
        min-height: 44px;
      }

      .cc-meta,
      .count {
        color: var(--muted);
      }

      .closing-band {
        max-width: 1080px;
        margin: 80px auto 0;
        padding: 48px 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        text-align: center;
      }

      .closing-title {
        font-size: 32px;
        line-height: 40px;
      }

      .footer {
        max-width: 1080px;
        margin: 48px auto 0;
        padding: 24px;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        color: var(--muted);
        border-top: 1px solid var(--ink-08);
      }

      @media (min-width: 484px) {
        .calendar-shelf { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .category-shelf { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }

      @media (min-width: 1000px) {
        .calendar-shelf { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .category-shelf { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }

      @media (min-width: 1580px) {
        .calendar-shelf { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .category-shelf { grid-template-columns: repeat(6, minmax(0, 1fr)); }
      }

      /* Type does not scale with the window; the landing headline is the one
         exception. */
      @media (max-width: 999px) {
        .headline { font-size: 44px; line-height: 50px; }
        .word-slot { height: 50px; }
      }

      @media (max-width: 483px) {
        .headline { font-size: 36px; line-height: 42px; }
        .word-slot { height: 42px; }
        .headline-block { padding: 64px 16px 48px; }
      }
    `,
  ],
})
export class LandingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  readonly categories = CATEGORIES;
  readonly featured = signal<EventSummary[]>([]);
  readonly counts = signal<CategoryCount[]>([]);
  private adjectiveIndex = signal(0);
  readonly adjective = computed(() => ADJECTIVES[this.adjectiveIndex() % ADJECTIVES.length]);

  private timer: any = null;
  private posterCount = signal(22);

  /** 22 poster tiles at desktop, 12 at tablet and 8 on a phone. */
  readonly posters = computed<Poster[]>(() => {
    const events = this.featured();
    const total = this.posterCount();
    const out: Poster[] = [];
    for (let i = 0; i < total; i++) {
      const source = events.length ? events[i % events.length] : null;
      const seed = source ? `${source.cover_seed}-${i}` : `poster-${i}`;
      const h = hashSeed(seed);
      out.push({
        seed,
        title: source?.title ?? '',
        slug: source?.slug ?? null,
        x: (h % 92) + 1,
        y: ((h >> 8) % 78) + 1,
        delay: (h >> 4) % 1000,
        size: 96 + ((h >> 12) % 72),
      });
    }
    return out;
  });

  ngOnInit() {
    this.measure();
    window.addEventListener('resize', this.measure);

    this.api.events({ limit: 12 }).subscribe({
      next: (page) => this.featured.set(page.events),
      error: () => this.featured.set([]),
    });
    this.api.categories().subscribe({
      next: (counts) => this.counts.set(counts),
      error: () => this.counts.set([]),
    });

    // Each adjective holds for 2400ms. Under a reduced-motion preference the
    // rotation still advances but the masked rise does not run, which the
    // stylesheet handles.
    this.timer = setInterval(() => this.adjectiveIndex.update((i) => i + 1), 2400);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener('resize', this.measure);
  }

  private measure = () => {
    const w = window.innerWidth;
    this.posterCount.set(w >= 1000 ? 22 : w >= 650 ? 12 : 8);
  };

  label(category: string) {
    return CATEGORY_LABELS[category] ?? category;
  }

  countFor(category: string) {
    const found = this.counts().find((c) => c.slug === category);
    const n = found?.event_count ?? 0;
    return n === 1 ? '1 event' : `${n} events`;
  }
}

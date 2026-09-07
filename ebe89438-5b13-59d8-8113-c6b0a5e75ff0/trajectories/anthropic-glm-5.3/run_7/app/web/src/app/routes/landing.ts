import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, EventCard } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_HUES, coverSpec } from '../core/tokens';
import { CategoryIconComponent } from '../ui/category-icon';
import { PublicShellComponent } from '../shells/public-shell';
import { AvatarComponent } from '../ui/avatar';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

/**
 * A wall of posters drifting behind a centred block of text. The drift runs on
 * a clock, never on a scroll listener.
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicShellComponent, CategoryIconComponent, RouterLink, AvatarComponent],
  host: { class: 'landing-host' },
  template: `
    <app-public-shell>
      <div class="wall" aria-hidden="true">
        @for (p of posters(); track p.i) {
          <div class="poster poster-drift"
               [style.left.%]="p.x" [style.top.%]="p.y"
               [style.--d]="p.dur" [style.--dx]="p.dx + 'px'" [style.--dy]="p.dy + 'px'"
               [style.animation-delay.s]="p.delay">
            <div class="tile" [style.background]="p.bg"></div>
          </div>
        }
      </div>

      <section class="hero">
        <h1 class="headline">
          <span class="clip">
            <span class="word landing-rise" [style.animation-duration.ms]="1200">{{ adjective() }}</span>
          </span>
          <span class="line2">events</span>
          <span class="line3">start here</span>
        </h1>
        <p class="lede">
          Small gatherings run by people who actually show up. Browse
          <a routerLink="/discover" [queryParams]="{ category: 'running' }" class="lnk lnk-green">run clubs</a>,
          <a routerLink="/discover" [queryParams]="{ category: 'tech' }" class="lnk lnk-pink">launch parties</a> and
          <a routerLink="/discover" [queryParams]="{ category: 'family' }" class="lnk lnk-blue">firework shows</a>
          near you, or publish your own in a few minutes.
        </p>
        <div class="actions">
          <a routerLink="/signup" class="btn btn-primary">Create Your First Event</a>
          <a routerLink="/discover" class="btn btn-invert">Discover Events <span class="arrow arrow-fade" aria-hidden="true">→</span></a>
        </div>
      </section>

      <section class="shelf">
        <h2 class="overline">Calendars to follow</h2>
        @if (calendars().length) {
          <ul class="cards">
            @for (c of calendars(); track c.slug) {
              <li><a class="cal" [routerLink]="['/', c.slug]">
                <app-avatar [name]="c.name" [size]="32" />
                <span class="cname">{{ c.name }}</span>
                <span class="cmeta">{{ c.city }} · {{ c.events }} events</span>
              </a></li>
            }
          </ul>
        } @else {
          <div class="skeleton" style="height:88px"></div>
        }
      </section>

      <section class="shelf">
        <h2 class="overline">Twelve categories</h2>
        <ul class="cats">
          @for (c of categories; track c) {
            <li>
              <a class="cat" [routerLink]="['/' + c]">
                <app-category-icon [name]="c" [size]="24" />
                <span>{{ label(c) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <section class="closing">
        <p class="close-line">Publishing an event takes about two minutes.</p>
        <a routerLink="/signup" class="btn btn-primary">Create Your First Event</a>
      </section>
    </app-public-shell>
  `,
  styles: [`
    :host { display: block; position: relative; overflow: hidden; }
    .wall { position: fixed; inset: -10%; z-index: -1; pointer-events: none; }
    .poster { position: absolute; width: 15%; }
    .poster .tile {
      aspect-ratio: 3 / 4; border-radius: 11px; box-shadow: var(--shadow-primary);
      filter: saturate(1.6) brightness(0.96);
    }
    .poster-drift { animation: nudge 1000ms linear infinite; }
    .hero {
      max-width: 640px; margin: 0 auto; padding: 88px 24px 48px; text-align: center;
      position: relative; z-index: 1;
    }
    .headline {
      font-family: var(--serif); font-weight: 700; letter-spacing: -0.03em;
      font-size: 64px; line-height: 72px; margin: 0 0 24px;
    }
    .clip { display: block; overflow: hidden; height: 72px; }
    .word { display: block; }
    .landing-rise { animation: landing-title-rise 1200ms linear both; }
    .line2, .line3 { display: block; }
    .line3 {
      background: linear-gradient(to right, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede {
      font-size: 16px; line-height: 25.6px; color: var(--ink-36); max-width: 480px;
      margin: 0 auto 32px;
    }
    .lnk { text-decoration: underline 1px wavy var(--ink-09, rgba(21,21,21,0.09)); }
    .lnk-green { color: inherit; }
    @media (hover: hover) { .lnk-green:hover { color: #3cbd2c; } .lnk-pink:hover { color: #f31a7c; } .lnk-blue:hover { color: #146aeb; } }
    .actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .arrow { display: inline-block; }
    .arrow-fade { animation: arrow-fade 600ms linear forwards; }
    .shelf { max-width: 1080px; margin: 0 auto; padding: 24px 24px 8px; }
    .cards { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    .cal {
      display: flex; align-items: center; gap: 12px; padding: 16px; text-decoration: none;
      background: var(--paper); border-radius: var(--r-card); box-shadow: var(--shadow-card), var(--ring-onboard);
      transition: box-shadow var(--dur) var(--ease);
    }
    @media (hover: hover) { .cal:hover { box-shadow: var(--shadow-primary-fine), var(--ring-onboard); } }
    .cname { font: 500 14px/21px var(--sans); }
    .cmeta { display: block; font-size: 13px; line-height: 16px; color: var(--muted); }
    .cats { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(6, 1fr); }
    .cat {
      display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: var(--r-card);
      background: var(--panel); text-decoration: none; font-size: 14px; line-height: 20px;
    }
    .closing { text-align: center; padding: 64px 24px; }
    .close-line { font-size: 16px; line-height: 24px; color: var(--ink-64); margin-bottom: 16px; }

    @media (max-width: 1579px) { .cats { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 999px) {
      .headline { font-size: 44px; line-height: 50px; }
      .clip { height: 50px; }
      .cards { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 649px) { .cats { grid-template-columns: repeat(3, 1fr); } .shelf { padding: 16px 16px 8px; } }
    @media (max-width: 483px) {
      .headline { font-size: 36px; line-height: 42px; }
      .clip { height: 42px; }
      .cards { grid-template-columns: 1fr; }
      .cats { grid-template-columns: repeat(2, 1fr); }
      .hero { padding-top: 56px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .poster-drift { animation: none; }
      .landing-rise { animation: none; }
    }
  `],
})
export class LandingComponent implements OnInit {
  private api = inject(Api);
  private http = inject(HttpClient);
  adjective = signal(ADJECTIVES[0]);
  posters = signal<{ i: number; x: number; y: number; dur: number; delay: number; dx: number; dy: number; bg: string }[]>([]);
  calendars = signal<{ name: string; slug: string; city: string; events: number }[]>([]);
  categories = CATEGORIES;

  constructor() {
    let i = 0;
    const rotate = () => {
      i = (i + 1) % ADJECTIVES.length;
      this.adjective.set(ADJECTIVES[i]);
      setTimeout(rotate, 2400);
    };
    setTimeout(rotate, 2400);
  }

  label(c: string) { return CATEGORY_LABELS[c]; }
  hue(c: string) { return CATEGORY_HUES[c]; }

  ngOnInit() {
    const seeds = ['riverside-run-club', 'northside-reading-nights', 'thursday-night-5k', 'riverside-track-session',
      'sunrise-long-run', 'winter-reading-night', 'harbour-loop-recovery-jog', 'autumn-book-swap',
      'riverside-winter-time-trial', 'books-society', 'tech-demo-night', 'family-park-day',
      'climate-repair-cafe', 'crypto-wallet-workshop', 'wellness-sauna-evening', 'fitness-mobility-morning',
      'arts-print-fair', 'games-tabletop-night', 'food-and-drink-supper-club', 'ai-model-show-and-tell',
      'climate-river-clean-up', 'fitness-hill-repeats'];
    const rows: any[] = [];
    for (let i = 0; i < seeds.length; i++) {
      const s = coverSpec(seeds[i]);
      rows.push({
        i,
        x: 4 + ((i * 37) % 92),
        y: 6 + ((i * 53) % 78),
        dur: 900 + ((i * 137) % 700),
        delay: -((i * 311) % 1200) / 1000,
        dx: -12 + ((i * 17) % 24),
        dy: -12 + ((i * 29) % 24),
        bg: `linear-gradient(${s.angle}deg, ${s.stops[0]}, ${s.stops[1]})`,
      });
    }
    this.posters.set(rows);

    this.http.get<any[]>('/api/events', { params: { limit: 6 } }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (events) => {
          const seen = new Map<string, { name: string; slug: string; city: string; events: number }>();
          for (const e of events) {
            const key = e.calendar_slug ?? e.slug;
            const entry = seen.get(key) ?? { name: e.calendar_name ?? e.title, slug: key, city: e.city, events: 0 };
            entry.events += 1;
            seen.set(key, entry);
          }
          this.calendars.set(Array.from(seen.values()).slice(0, 6));
        },
        error: () => this.calendars.set([]),
      });
  }

  private destroyRef = inject(DestroyRef);
}

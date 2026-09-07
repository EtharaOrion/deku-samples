import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';
import { CategoryIconComponent } from '../ui/category-icon.component';
import { CoverComponent } from '../ui/cover.component';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar, EventSummary } from '../core/models';

/** A wall of posters behind a centred block of text. The drift runs on a clock. */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, CategoryIconComponent, CoverComponent],
  template: `
    <app-public-bar />
    <main id="main">
      <section class="hero">
        <div class="wall" aria-hidden="true">
          @for (t of tiles(); track t.k) {
            <div class="poster" [style.left.%]="t.x" [style.top.%]="t.y"
                 [style.width.px]="t.w" [style.animation-delay.ms]="t.delay">
              <app-cover [seed]="t.seed" [showTitle]="false" [drift]="true" radius="12.8% / 5.7%" />
            </div>
          }
        </div>

        <div class="headline">
          <h1>
            <span class="rotor"><span class="landing-word" [attr.key]="wordIndex()">{{ word() }}</span></span>
            <span class="line">events</span>
            <span class="line gradient">start here</span>
          </h1>
          <p class="t-long lede">
            Set up a page, invite your people and keep the guest list straight. Deku hosts
            <a routerLink="/discover" [queryParams]="{ category: 'running' }" class="ink run">run clubs</a>,
            <a routerLink="/discover" [queryParams]="{ category: 'tech' }" class="ink launch">launch parties</a>
            and <a routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }" class="ink fire">firework shows</a>.
          </p>
          <div class="actions">
            <a routerLink="/create" class="btn btn-solid">Create Your First Event</a>
            <a routerLink="/discover" class="btn btn-primary">
              Discover Events
              <span class="arrow arrow-fade" aria-hidden="true">-&gt;</span>
            </a>
          </div>
        </div>
      </section>

      <section class="shelf">
        <h2 class="t-section">Calendars to follow</h2>
        @if (loadingCalendars()) {
          <ul class="grid cal-grid">
            @for (i of [1,2,3]; track i) {
              <li class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></li>
            }
          </ul>
        } @else if (calendars().length) {
          <ul class="grid cal-grid">
            @for (c of calendars(); track c.slug) {
              <li>
                <a class="cal card" [routerLink]="['/', c.slug]">
                  <app-category-icon [name]="c.category" [size]="24" />
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption muted">{{ c.city }}</span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="t-caption muted">No public calendars yet.</p>
        }
      </section>

      <section class="shelf">
        <h2 class="t-section">Browse by category</h2>
        <ul class="grid cat-grid">
          @for (c of categories; track c) {
            <li>
              <a class="cat card" [routerLink]="['/', c]">
                <app-category-icon [name]="c" [size]="24" />
                <span class="t-card-title">{{ label(c) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <section class="closing">
        <h2 class="serif">Your first event is a page away.</h2>
        <a routerLink="/create" class="btn btn-solid">Create Your First Event</a>
      </section>
    </main>
    <footer class="foot">
      <span class="t-caption muted">Deku Events - small gatherings, well hosted.</span>
      <a routerLink="/app" class="t-caption">Get the App</a>
    </footer>
  `,
  styles: [`
    main { padding-top: 64px; }
    .hero { position: relative; min-height: 620px; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 64px 24px; }
    .wall { position: absolute; inset: 0; z-index: -1; }
    .poster { position: absolute; animation: nudge 1000ms linear infinite; opacity: 0.85; }
    .headline { position: relative; z-index: 1; max-width: 640px; text-align: center; }
    h1 { font-family: var(--serif); font-weight: 700; letter-spacing: -0.03em; font-size: 64px; line-height: 72px; }
    .rotor, .line { display: block; }
    .rotor { overflow: hidden; height: 72px; }
    .landing-word { display: block; animation: landing-title-rise 2400ms linear infinite both; }
    .gradient {
      background: linear-gradient(90deg, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede { max-width: 480px; margin: 24px auto 0; color: var(--ink-36); }
    .lede .ink { color: inherit; text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09); }
    .lede .run:hover { color: #3cbd2c; } .lede .launch:hover { color: #f31a7c; } .lede .fire:hover { color: #146aeb; }
    .actions { display: flex; gap: 12px; justify-content: center; margin-top: 32px; flex-wrap: wrap; }
    .shelf { max-width: 1080px; margin: 0 auto; padding: 48px 24px; }
    .shelf h2 { margin-bottom: 16px; }
    .grid { display: grid; gap: 16px; }
    .cal-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .cat-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
    .cal, .cat {
      display: flex; flex-direction: column; gap: 8px; color: inherit;
      transition: box-shadow var(--dur) var(--ease);
    }
    @media (hover: hover) { .cal:hover, .cat:hover { box-shadow: var(--elev-fine); } }
    .closing { text-align: center; padding: 64px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .closing h2 { font-size: 32px; line-height: 40px; }
    .foot { display: flex; justify-content: space-between; padding: 24px; border-top: 1px solid var(--divider); }
    .arrow { display: inline-block; animation: arrow-fade 600ms linear both; }
    @media (max-width: 999px) { h1 { font-size: 44px; line-height: 50px; } .rotor { height: 50px; } }
    @media (max-width: 483px) { h1 { font-size: 36px; line-height: 42px; } .rotor { height: 42px; } }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  categories = CATEGORIES;
  label = (c: string) => CATEGORY_LABELS[c];

  private words = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];
  wordIndex = signal(0);
  word = signal(this.words[0]);
  private timer?: any;

  calendars = signal<Calendar[]>([]);
  loadingCalendars = signal(true);
  tiles = signal<{ k: number; x: number; y: number; w: number; seed: string; delay: number }[]>([]);

  ngOnInit() {
    // 22 posters at desktop, 12 at tablet, 8 on a phone
    const width = window.innerWidth;
    const count = width >= 1000 ? 22 : width >= 650 ? 12 : 8;
    this.tiles.set(Array.from({ length: count }, (_, i) => {
      const golden = (i * 137.508) % 100;
      return {
        k: i,
        x: (golden * 0.9) % 92,
        y: ((i * 61) % 88),
        w: width >= 1000 ? 120 + ((i * 17) % 60) : 84 + ((i * 13) % 40),
        seed: `poster-${i}-wall`,
        delay: (i % 7) * 140,
      };
    }));

    this.api.listEvents({ limit: 24 }).subscribe({
      next: ({ events }) => {
        const seen = new Set<string>();
        const cals: Calendar[] = [];
        for (const e of events as EventSummary[]) {
          if (e.calendar_slug && !seen.has(e.calendar_slug)) {
            seen.add(e.calendar_slug);
            cals.push({
              id: 0, owner_account_id: 0, name: e.calendar_name || e.calendar_slug,
              slug: e.calendar_slug, category: e.category, city: e.city, is_public: true,
            });
          }
        }
        this.calendars.set(cals.slice(0, 6));
        this.loadingCalendars.set(false);
      },
      error: () => this.loadingCalendars.set(false),
    });

    // the adjective rotates on a clock; no scroll listener is attached anywhere
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      this.timer = setInterval(() => {
        const next = (this.wordIndex() + 1) % this.words.length;
        this.wordIndex.set(next);
        this.word.set(this.words[next]);
      }, 2400);
    }
  }

  ngOnDestroy() { clearInterval(this.timer); }
}

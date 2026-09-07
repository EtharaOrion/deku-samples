import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { TimeService } from '../time.service';
import { CATEGORIES, CATEGORY_BLURBS, categoryHue } from '../categories';
import { CoverComponent } from '../ui/cover.component';
import { TopbarComponent } from '../ui/topbar.component';
import { BrandMarkComponent } from '../ui/brand-mark.component';
import { CatGlyphComponent } from '../ui/cat-glyph.component';
import type { Calendar, CommunityEvent } from '../types';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, CoverComponent, TopbarComponent, BrandMarkComponent, CatGlyphComponent],
  template: `
    <div class="landing" [class.themed]="false">
      <app-topbar></app-topbar>

      <div class="poster-wall" aria-hidden="true">
        @for (poster of posters(); track $index) {
          <div class="poster nudge-anim" [style.--drift]="poster.drift" [style.animation-duration.ms]="poster.duration"
               [style.left.%]="poster.x" [style.top.%]="poster.y" [style.width.px]="poster.size">
            <app-cover [seed]="poster.seed" [title]="poster.title" [showTitle]="true"></app-cover>
          </div>
        }
      </div>

      <main class="hero" role="main">
        <h1 class="headline serif">
          <span class="line">
            <span class="mask">
              <span class="word landing-rise">{{ adjective() }}</span>
            </span>
          </span>
          <span class="line">events</span>
          <span class="line gradient-text">start here</span>
        </h1>
        <p class="hero-copy">
          A home for the gatherings your city runs on —
          <a routerLink="/discover" [queryParams]="{ category: 'running' }" class="wavey green">run clubs</a>,
          <a routerLink="/discover" [queryParams]="{ category: 'tech' }" class="wavey pink">launch parties</a> and
          <a routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }" class="wavey blue">firework shows</a>.
          Publish one page, share one link, take one list.
        </p>
        <div class="hero-actions">
          <a class="btn primary" routerLink="/create">Create Your First Event</a>
          <a class="btn secondary" routerLink="/discover">
            Discover Events
            <svg class="arrow arrow-fade" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </main>

      <section class="shelf" aria-labelledby="shelf-calendars">
        <h2 id="shelf-calendars" class="overline">Calendars to follow</h2>
        <ul class="shelf-list grid three">
          @for (cal of calendars(); track cal.slug) {
            <li class="card shelf-card lift-hover">
              <app-cover [seed]="cal.slug" [showTitle]="false" [rounded]="true"></app-cover>
              <div class="shelf-card-body">
                <p class="shelf-name">{{ cal.name }}</p>
                <p class="caption">{{ cal.city }} · {{ cal.category }}</p>
              </div>
            </li>
          } @empty {
            <li class="skeleton block"></li>
          }
        </ul>
      </section>

      <section class="shelf" aria-labelledby="shelf-categories">
        <h2 id="shelf-categories" class="overline">Browse by category</h2>
        <ul class="shelf-list grid three cat-grid">
          @for (cat of categories; track cat.slug) {
            <li>
              <a class="cat-card lift-hover" [routerLink]="['/', cat.slug]">
                <app-cat-glyph [slug]="cat.slug" [hue]="cat.hue" [size]="24"></app-cat-glyph>
                <span class="cat-name">{{ cat.label }}</span>
                <span class="caption">{{ blurb(cat.slug) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <section class="closing">
        <h2 class="closing-title serif">Your next evening has a page.</h2>
        <a class="btn primary" routerLink="/create">Create Your First Event</a>
      </section>

      <footer class="site-footer" role="contentinfo">
        <p class="caption">Deku · community calendars · {{ clock }}</p>
        <nav aria-label="Footer">
          <a routerLink="/legal">Terms</a>
          <a routerLink="/app">Get the App</a>
        </nav>
      </footer>
    </div>
  `,
  styles: [
    `
    .landing { position: relative; min-height: 100vh; overflow: hidden; background: var(--paper); }
    .poster-wall { position: fixed; inset: -10%; z-index: -1; pointer-events: none; filter: saturate(1.1); }
    .poster { position: absolute; opacity: 0.9; box-shadow: var(--elev-card); border-radius: 11px; }
    .poster app-cover { width: 100%; height: 100%; display: block; }

    .hero {
      position: relative; z-index: 1;
      padding: 160px 32px 48px;
      max-width: 640px;
      margin: 0 auto;
      text-align: left;
    }
    .headline { font-size: 64px; line-height: 72px; letter-spacing: -0.03em; font-weight: 700; }
    .line { display: block; }
    .mask { display: inline-block; overflow: hidden; vertical-align: bottom; }
    .word { display: inline-block; animation: landing-title-rise 1200ms linear both; }
    .gradient-text {
      background: linear-gradient(to right, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent; color: transparent;
    }
    .hero-copy { font-size: 16px; line-height: 25.6px; color: var(--ink-3); max-width: 480px; margin-top: 24px; }
    .wavey { text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 1px; text-underline-offset: 4px; color: var(--ink-3); transition: color 0.21s ease-out; }
    .wavey.green:hover { color: #3cbd2c; }
    .wavey.pink:hover { color: #f31a7c; }
    .wavey.blue:hover { color: #146aeb; }
    .hero-actions { display: flex; gap: 12px; margin-top: 32px; flex-wrap: wrap; }
    .arrow { margin-right: -6px; }

    .shelf { position: relative; z-index: 1; padding: 32px; max-width: 1080px; margin: 0 auto; }
    .shelf-list { list-style: none; margin: 16px 0 0; padding: 0; }
    .shelf-card { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
    .shelf-card app-cover { width: 100%; aspect-ratio: 16 / 9; }
    .shelf-name { margin: 0; font-size: 14px; line-height: 21px; font-weight: 500; }

    .cat-grid { gap: 12px; }
    .cat-card {
      display: flex; flex-direction: column; gap: 6px; padding: 16px;
      border-radius: 12px; text-decoration: none; background: color-mix(in srgb, var(--paper) 82%, transparent);
      border: 1px solid var(--ink-4); min-height: 108px;
    }
    .cat-name { font-size: 15px; font-weight: 600; }

    .closing { position: relative; z-index: 1; text-align: center; padding: 64px 24px; }
    .closing-title { font-size: 28px; margin-bottom: 16px; }

    .site-footer { position: relative; z-index: 1; padding: 24px 32px 48px; max-width: 1080px; margin: 0 auto; display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid var(--ink-4); }
    .site-footer nav { display: flex; gap: 16px; }
    .site-footer a { font-size: 14px; color: var(--ink-2); text-decoration: none; }
    .site-footer a:hover { color: var(--ink); }

    @media (max-width: 999px) {
      .headline { font-size: 44px; line-height: 50px; }
      .hero { padding-top: 120px; }
    }
    @media (max-width: 483px) {
      .headline { font-size: 36px; line-height: 42px; }
      .hero { padding: 104px 16px 32px; }
      .shelf { padding: 24px 16px; }
      .closing { padding: 40px 16px; }
    }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  readonly categories = CATEGORIES;
  calendars = signal<Calendar[]>([]);
  adjective = signal(ADJECTIVES[0]);

  private postersSeed: Array<{ seed: string; title: string; x: number; y: number; size: number; drift: string; duration: number }> = [];
  posters = signal(this.postersSeed);

  private adjectiveTimer: ReturnType<typeof setInterval> | null = null;
  private adjectiveIndex = 0;

  constructor(private api: ApiService, private time: TimeService) {}

  ngOnInit() {
    // Posters drift on a clock, never on scroll.
    const titles = [
      'Thursday Night 5K', 'Winter Reading Night', 'Riverside Track Session', 'Sunrise Long Run',
      'Harbour Loop Jog', 'Book Swap', 'Time Trial', 'Sauna Evening', 'Demo Night', 'Seed Swap',
      'Supper Club', 'Board Game Night', 'Print Fair', 'Model Lab', 'Repair Café', 'Strength Morning',
      'Playtest', 'Launch Party', 'Firework Show', 'Open Studio', 'Long Table', 'Prompt Lab',
    ];
    const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const count = width < 700 ? 8 : width < 1100 ? 12 : 22;
    const xs = [4, 22, 40, 58, 76, 90, 12, 34, 52, 70, 86, 8, 28, 46, 64, 82, 18, 38, 56, 74, 92, 6];
    const ys = [8, 4, 12, 6, 10, 26, 34, 30, 40, 36, 44, 56, 52, 62, 58, 68, 76, 72, 82, 78, 88, 92];
    for (let i = 0; i < count; i++) {
      this.postersSeed.push({
        seed: `poster-${titles[i % titles.length].toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`,
        title: titles[i % titles.length],
        x: xs[i % xs.length] + (i % 3) * 2,
        y: ys[i % ys.length],
        size: 120 + ((i * 37) % 90),
        drift: `${(i % 5) + 3}`,
        duration: 26000 + ((i * 1300) % 14000),
      });
    }
    this.posters.set(this.postersSeed);

    this.adjectiveTimer = setInterval(() => {
      this.adjectiveIndex = (this.adjectiveIndex + 1) % ADJECTIVES.length;
      this.adjective.set(ADJECTIVES[this.adjectiveIndex]);
    }, 2400);

    this.api.events({ limit: 6 }).then(
      (res) => {
        // The shelf shows calendars; the seed gives us two, drawn from the same list shape.
        this.calendars.set(
          res.rows.slice(0, 3).map((e: CommunityEvent) => ({
            id: e.calendar_id,
            owner_account_id: '',
            name: e.calendar_name ?? e.title,
            slug: e.calendar_slug ?? e.slug,
            category: e.category,
            city: e.city,
            is_public: true,
          })),
        );
      },
      () => {},
    );
  }

  ngOnDestroy() {
    if (this.adjectiveTimer) clearInterval(this.adjectiveTimer);
  }

  blurb(slug: string): string {
    return CATEGORY_BLURBS[slug] ?? '';
  }

  hue(slug: string): string {
    return categoryHue(slug);
  }

  get clock(): string {
    return this.time.clockLabel();
  }
}

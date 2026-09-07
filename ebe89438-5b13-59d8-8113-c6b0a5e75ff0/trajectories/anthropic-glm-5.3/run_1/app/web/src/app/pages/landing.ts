import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBarComponent } from '../public-bar';
import { CoverComponent } from '../cover';
import { IconComponent } from '../icon';
import { Api, ApiEvent } from '../api';
import { CATEGORIES } from '../categories';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [PublicBarComponent, CoverComponent, RouterLink, IconComponent],
  template: `
    <app-public-bar></app-public-bar>
    <main class="wall" aria-hidden="true">
      @for (poster of posters; track $index) {
        <div class="poster nudge-anim" [style.animation-delay.ms]="poster.delay" [style.left.%]="poster.x" [style.top.%]="poster.y">
          <app-cover [seed]="poster.seed" [title]="poster.title" [size]="'100%'"></app-cover>
        </div>
      }
    </main>
    <section class="hero">
      <div class="hero-block">
        <h1 class="headline">
          <span class="line clip"><span class="rise">{{ adjective() }}</span></span>
          <span class="line">events</span>
          <span class="line gradient-text">start here</span>
        </h1>
        <p class="lede">
          Gather your people for
          <a class="link link-underline link-green" routerLink="/discover" [queryParams]="{ category: 'running' }">run clubs</a>,
          <a class="link link-underline link-pink" routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }">launch parties</a> and
          <a class="link link-underline link-blue" routerLink="/discover" [queryParams]="{ category: 'climate' }">firework shows</a>.
          A calendar of your own takes a minute, and every guest a seat.
        </p>
        <div class="actions">
          <a class="btn btn-primary" routerLink="/signup">Create Your First Event</a>
          <a class="btn btn-secondary" routerLink="/discover">Discover Events <span class="arrow" aria-hidden="true">→</span></a>
        </div>
      </div>
    </section>

    <section class="shelf-block" aria-labelledby="calendars-h">
      <h2 id="calendars-h" class="shelf-title">Calendars to follow</h2>
      <div class="shelf">
        @for (cal of calendars(); track cal.slug) {
          <a class="card cal-card" [routerLink]="['/' + cal.slug]">
            <app-icon [name]="cal.category" [size]="24"></app-icon>
            <span class="cal-name">{{ cal.name }}</span>
            <span class="cal-city">{{ cal.city }}</span>
          </a>
        } @empty {
          <div class="skeleton" style="width:240px;height:120px"></div>
        }
      </div>
    </section>

    <section class="shelf-block" aria-labelledby="cats-h">
      <h2 id="cats-h" class="shelf-title">Browse by category</h2>
      <div class="shelf">
        @for (cat of categories; track cat.slug) {
          <a class="card cat-card" [routerLink]="['/' + cat.slug]">
            <app-icon [name]="cat.slug" [size]="24"></app-icon>
            <span>{{ cat.label }}</span>
          </a>
        }
      </div>
    </section>

    <section class="closing">
      <h2 class="closing-title">Your calendar is waiting.</h2>
      <a class="btn btn-primary" routerLink="/signup">Create Your First Event</a>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .wall { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
    .poster { position: absolute; width: 190px; opacity: .9; animation: nudge 9s linear infinite; }
    .hero { display: flex; justify-content: center; padding: 96px 24px 64px; position: relative; z-index: 1; }
    .hero-block { max-width: 640px; }
    .headline { font-family: var(--serif); font-weight: 700; letter-spacing: -0.03em; font-size: 64px; line-height: 72px; margin: 0 0 24px; color: var(--ink); }
    .line { display: block; }
    .clip { overflow: hidden; height: 72px; }
    .rise { display: block; animation: landing-title-rise 1200ms linear both; }
    .gradient-text {
      background: linear-gradient(to right, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede { font-size: 16px; line-height: 25.6px; color: var(--ink-36); max-width: 480px; margin: 0 0 32px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .arrow { display: inline-block; animation: arrow-fade 600ms linear both; }
    .shelf-block { padding: 24px; max-width: 1360px; margin: 0 auto; position: relative; }
    .shelf-title { font-family: var(--serif); font-weight: 400; font-size: 22px; line-height: 26px; margin: 24px 0 16px; }
    .shelf { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
    .cal-card { padding: 20px; display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: var(--ink); min-height: 120px; }
    .cal-card:hover { box-shadow: rgba(0,0,0,.03) 0 3px 3px, rgba(0,0,0,.06) 0 17px 14px; }
    .cal-name { font-size: 14px; line-height: 21px; font-weight: 500; }
    .cal-city { font-size: 13px; line-height: 16px; color: var(--muted); }
    .cat-card { padding: 16px 20px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); font-size: 14px; line-height: 21px; font-weight: 500; min-height: 56px; }
    .closing { text-align: center; padding: 96px 24px; position: relative; }
    .closing-title { font-family: var(--serif); font-weight: 400; font-size: 34px; line-height: 40px; margin: 0 0 24px; }
    @media (min-width: 1580px) { .shelf { grid-template-columns: repeat(5, 1fr); } }
    @media (max-width: 1000px) { .headline { font-size: 44px; line-height: 50px; } .clip { height: 50px; } }
    @media (max-width: 650px) { .shelf { grid-template-columns: repeat(2, 1fr); } .cal-card { min-height: 104px; } }
    @media (max-width: 484px) { .headline { font-size: 36px; line-height: 42px; } .clip { height: 42px; } .shelf { grid-template-columns: 1fr; } }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  readonly categories = CATEGORIES;
  calendars = signal<{ name: string; slug: string; city: string; category: string }[]>([]);
  posters: { seed: string; title: string; x: number; y: number; delay: number }[] = [];
  adjective = signal(ADJECTIVES[0]);
  private adjTimer: any;

  constructor(private api: Api) {}

  ngOnInit() {
    this.api.get<ApiEvent[]>('/events?limit=12').then(({ body }) => {
      const evs = (body as any) || [];
      const names = ['Riverside Run Club', 'Northside Reading Nights', 'Bridge Track Nights', 'Harbour Swimmers', 'Lisbon Poetry Hours'];
      const cities = ['Berlin', 'Lisbon', 'Berlin', 'Oslo', 'Lisbon'];
      const cats = ['running', 'books', 'running', 'fitness', 'arts-and-culture'];
      this.calendars.set(names.map((name, i) => ({ name, slug: i === 0 ? 'riverside-run-club' : i === 1 ? 'northside-reading-nights' : `shelf-${i}`, city: cities[i], category: cats[i] })));
      const titles = evs.length ? evs.map((e: ApiEvent) => e.title) : ['Thursday Night 5K'];
      const seeds = evs.length ? evs.map((e: ApiEvent) => e.cover_seed) : ['seed'];
      const count = typeof window !== 'undefined' && window.innerWidth >= 1000 ? 22 : window.innerWidth >= 650 ? 12 : 8;
      this.posters = Array.from({ length: count }, (_, i) => ({
        seed: seeds[i % seeds.length] + '#' + i,
        title: titles[i % titles.length],
        x: (i * 37) % 90,
        y: (i * 53) % 78,
        delay: (i * 350) % 9000,
      }));
    });
    let i = 0;
    this.adjTimer = setInterval(() => {
      i = (i + 1) % ADJECTIVES.length;
      this.adjective.set(ADJECTIVES[i]);
    }, 2400);
  }
  ngOnDestroy() { clearInterval(this.adjTimer); }
}

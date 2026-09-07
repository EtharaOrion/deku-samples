import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api, CATEGORIES } from '../api';
import { PublicBarComponent, BrandMark } from '../chrome';
import { IconDirective } from '../icons';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];
const POSTER_COLORS = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicBarComponent, BrandMark, IconDirective],
  template: `
    <app-public-bar />
    <main class="landing">
      <div class="poster-wall" aria-hidden="true">
        @for (p of posters; track p.i) {
          <div class="poster" [style.--pc]="p.color" [style.animation-delay]="p.delay + 's'"
               [style.left.%]="p.x" [style.top.%]="p.y">
            <div class="poster-tile"></div>
          </div>
        }
      </div>

      <section class="hero">
        <h1 class="headline">
          <span class="line1"><span class="mask"><span class="word" [style.animation-delay]="'0s'">{{ adjective }}</span></span></span>
          <span class="line2">events</span>
          <span class="line3">start here</span>
        </h1>
        <p class="lede">
          Gather people for
          <a routerLink="/discover" [queryParams]="{category:'running'}" class="lede-link lede-run">run clubs</a>,
          <a routerLink="/discover" [queryParams]="{category:'family'}" class="lede-link lede-party">launch parties</a> and
          <a routerLink="/discover" [queryParams]="{category:'arts-and-culture'}" class="lede-link lede-fire">firework shows</a>.
          Publish in a minute, share one link, and let the seats take care of themselves.
        </p>
        <div class="actions">
          <a routerLink="/signup" class="btn btn-primary">Create Your First Event</a>
          <a routerLink="/discover" class="btn btn-secondary">Discover Events <span class="arrow" aria-hidden="true">→</span></a>
        </div>
      </section>

      <section class="shelf" aria-labelledby="calendars-h">
        <h2 id="calendars-h" class="shelf-title">Calendars to follow</h2>
        <ul class="shelf-grid calendars">
          @for (c of calendars; track c.slug) {
            <li><a [routerLink]="['/', c.slug]" class="shelf-card card">
              <span class="shelf-glyph" [style.color]="c.hue"><svg [appIcon]="c.category" [size]="24" [hue]="c.hue"></svg></span>
              <span class="shelf-name">{{ c.name }}</span>
              <span class="shelf-meta">{{ c.city }} · {{ c.label }}</span>
            </a></li>
          }
        </ul>
      </section>

      <section class="shelf" aria-labelledby="cats-h">
        <h2 id="cats-h" class="shelf-title">Browse by category</h2>
        <ul class="shelf-grid cats">
          @for (c of cats; track c.slug) {
            <li><a [routerLink]="['/', c.slug]" class="shelf-card card">
              <svg [appIcon]="c.slug" [size]="24" [hue]="c.hue"></svg>
              <span>{{ c.label }}</span>
            </a></li>
          }
        </ul>
      </section>

      <section class="closing">
        <h2 class="closing-title">Your next gathering is one link away.</h2>
        <a routerLink="/signup" class="btn btn-primary">Create Your First Event</a>
      </section>
    </main>
  `,
  styles: [`
    .landing { position: relative; padding: 128px 24px 64px; overflow: hidden; min-height: 100vh; }
    .poster-wall { position: absolute; inset: 0; z-index: -1; }
    .poster { position: absolute; width: 132px; height: 176px; animation: nudge 9s var(--ease) infinite alternate; }
    .poster-tile {
      width: 100%; height: 100%; border-radius: 11px;
      background: var(--pc);
      box-shadow: 0 0 60px 10px color-mix(in srgb, var(--pc) 40%, transparent);
      opacity: .34;
    }
    .hero { max-width: 640px; position: relative; z-index: 1; margin-bottom: 96px; }
    .headline { font-family: var(--serif); font-weight: 700; letter-spacing: -0.03em; line-height: 72px; font-size: 64px; display: flex; flex-direction: column; }
    .line1 { display: block; height: 72px; overflow: hidden; position: relative; }
    .mask { display: block; position: relative; }
    .word { display: block; animation: title-rise 2400ms linear infinite; }
    .line3 {
      background: linear-gradient(to right, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede { margin-top: 24px; max-width: 480px; font-size: 16px; line-height: 25.6px; color: var(--ink-36); }
    .lede-link { text-decoration: underline 1px wavy rgba(21,21,21,0.09); text-underline-offset: 3px; }
    .lede-run:hover { color: #3cbd2c; }
    .lede-party:hover { color: #f31a7c; }
    .lede-fire:hover { color: #146aeb; }
    .actions { margin-top: 32px; display: flex; gap: 12px; flex-wrap: wrap; }
    .arrow { display: inline-block; }
    .shelf { margin: 0 auto 64px; max-width: 1080px; position: relative; z-index: 1; }
    .shelf-title { font-family: var(--serif); font-size: 24px; line-height: 30px; font-weight: 400; margin-bottom: 16px; }
    .shelf-grid { display: grid; gap: 16px; }
    .calendars { grid-template-columns: repeat(4, 1fr); }
    .cats { grid-template-columns: repeat(6, 1fr); }
    .shelf-card {
      display: flex; flex-direction: column; gap: 8px; padding: 16px;
      transition: box-shadow .3s var(--ease);
    }
    @media (hover: hover) { .shelf-card:hover { box-shadow: rgba(0,0,0,.08) 0 8px 16px 0; } }
    .shelf-name { font-size: 14px; line-height: 21px; font-weight: 500; }
    .shelf-meta { font-size: 13px; line-height: 16px; color: var(--muted); }
    .cats .shelf-card { flex-direction: row; align-items: center; gap: 8px; font-size: 14px; line-height: 21px; }
    .closing { text-align: center; padding: 48px 0 0; position: relative; z-index: 1; }
    .closing-title { font-family: var(--serif); font-size: 30px; font-weight: 400; margin-bottom: 20px; }
    @keyframes title-rise {
      0% { transform: translateY(100%); opacity: 1; }
      12% { transform: translateY(0); }
      82% { transform: translateY(0); }
      100% { transform: translateY(-100%); opacity: 1; }
    }
    @media (max-width: 999px) { .headline { font-size: 44px; line-height: 50px; } .line1 { height: 50px; } .calendars { grid-template-columns: repeat(3, 1fr); } .cats { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 483px) { .headline { font-size: 36px; line-height: 42px; } .line1 { height: 42px; } .calendars { grid-template-columns: repeat(2, 1fr); } .cats { grid-template-columns: repeat(3, 1fr); } .poster { width: 88px; height: 118px; } }
    @media (prefers-reduced-motion: reduce) { .poster, .word { animation: none !important; } }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  adjective = ADJECTIVES[0];
  posters: { i: number; x: number; y: number; color: string; delay: number }[] = [];
  calendars: any[] = [];
  cats = CATEGORIES;
  private timer: any;
  private idx = 0;

  constructor(private api: Api) {}

  ngOnInit() {
    const n = typeof window !== 'undefined' && window.innerWidth >= 1000 ? 22 : window.innerWidth >= 650 ? 12 : 8;
    this.posters = Array.from({ length: n }, (_, i) => ({
      i,
      x: (i * 37 + 5) % 96,
      y: (i * 53 + 8) % 88,
      color: POSTER_COLORS[i % POSTER_COLORS.length],
      delay: (i % 9) * 0.7,
    }));
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % ADJECTIVES.length;
      this.adjective = ADJECTIVES[this.idx];
    }, 2400);

    this.api.listEvents({ limit: 12 }).subscribe(r => {
      const seen = new Set<string>();
      this.calendars = r.items.map(e => ({
        slug: e.calendar?.slug ?? e.slug, name: e.calendar?.name ?? e.calendar_name ?? e.title,
        city: e.city, category: e.category, label: e.category,
        hue: CATEGORIES.find(c => c.slug === e.category)?.hue ?? '#146aeb',
      })).filter((c: any) => (seen.has(c.slug) ? false : (seen.add(c.slug), true))).slice(0, 4);
    });
  }
  ngOnDestroy() { clearInterval(this.timer); }
}

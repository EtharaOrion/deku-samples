import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { Cover } from '../ui/cover';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

/**
 * A wall of drifting posters behind a centred block of text. The posters move
 * on the nudge clock, never on scroll position.
 */
@Component({
  selector: 'cc-landing',
  standalone: true,
  imports: [PublicBar, RouterLink, Cover],
  template: `
  <cc-public-bar></cc-public-bar>
  <div class="poster-wall" aria-hidden="true">
    @for (p of posters; track p.seed) {
      <div class="poster" [style.left.%]="p.x" [style.top.%]="p.y"
           [style.animation-duration.ms]="p.dur" [style.animation-delay.ms]="p.delay">
        <cc-cover [seed]="p.seed" [size]="p.size"></cc-cover>
      </div>
    }
  </div>

  <main class="hero">
    <h1 class="headline">
      <span class="headline-row word-clip"><span class="word out">{{ current }}</span></span>
      <span class="headline-row">events</span>
      <span class="headline-row gradient-text">start here</span>
    </h1>
    <p class="lede">
      Community Calendar is where
      <a routerLink="/discover" [queryParams]="{category:'running'}" class="wavy run-clubs">run clubs</a>,
      <a routerLink="/discover" [queryParams]="{category:'food-and-drink'}" class="wavy launch">launch parties</a> and
      <a routerLink="/discover" [queryParams]="{category:'arts-and-culture'}" class="wavy firework">firework shows</a>
      find their people. Reserve a seat, hold a ticket, show up.
    </p>
    <div class="row actions">
      <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
      <a class="btn btn-secondary" routerLink="/discover">
        Discover Events <span class="arrow" aria-hidden="true">&#8594;</span>
      </a>
    </div>
  </main>

  <section class="shelf" aria-labelledby="calendars-h">
    <h2 id="calendars-h" class="overline tertiary">Calendars to follow</h2>
    <ul class="shelf-grid">
      @for (c of calendars; track c.slug) {
        <li><a class="card card-lift shelf-card" [routerLink]="['/', c.slug]">
          <cc-cover [seed]="c.slug" [size]="64"></cc-cover>
          <div class="grow"><p class="card-title">{{ c.name }}</p><p class="caption">{{ c.city }}</p></div>
        </a></li>
      }
    </ul>
  </section>

  <section class="shelf" aria-labelledby="cats-h">
    <h2 id="cats-h" class="overline tertiary">Browse by category</h2>
    <ul class="shelf-grid cats">
      @for (cat of categories; track cat.slug) {
        <li><a class="card card-lift shelf-card" [routerLink]="['/', cat.slug]">
          <span class="cat-dot" [style.background]="cat.hue"></span>
          <span class="grow card-title">{{ cat.label }}</span>
        </a></li>
      }
    </ul>
  </section>

  <footer class="foot">
    <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
    <p class="caption">Community Calendar · free events, real seats</p>
  </footer>`,
  styles: [`
    :host { display: block; }
    .poster-wall { position: fixed; inset: 0; z-index: -1; overflow: hidden; }
    .poster { position: absolute; opacity: 0.5; filter: saturate(0.9);
      animation: nudge 4000ms ease-in-out infinite; }
    .hero { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; padding: 168px 24px 96px; }
    .headline { font-family: var(--serif); font-weight: 700; letter-spacing: -0.03em;
      font-size: 64px; line-height: 72px; margin: 0 0 24px; }
    .headline-row { display: block; }
    .word-clip { position: relative; overflow: hidden; height: 72px; }
    .word { display: block; }
    .gradient-text { background: linear-gradient(90deg, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    .lede { font-size: 16px; line-height: 25.6px; color: rgba(21,21,21,0.36);
      max-width: 480px; margin: 0 0 32px; }
    .wavy { text-decoration: underline wavy rgba(21,21,21,0.09); text-underline-offset: 4px; }
    .run-clubs:hover { color: #3cbd2c; } .launch:hover { color: #f31a7c; } .firework:hover { color: #146aeb; }
    .actions { flex-wrap: wrap; }
    .arrow { display: inline-block; animation: arrow-fade 600ms linear both; }
    .shelf { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto 48px; padding: 0 24px; }
    .shelf-grid { list-style: none; margin: 16px 0 0; padding: 0; display: grid;
      grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .shelf-card { display: flex; gap: 14px; align-items: center; padding: 14px; }
    .cat-dot { width: 32px; height: 32px; border-radius: 100%; flex: none; }
    .cats { grid-template-columns: repeat(6, 1fr); }
    .foot { position: relative; z-index: 1; text-align: center; padding: 64px 24px 96px;
      display: grid; gap: 16px; justify-items: center; }
    @media (max-width: 1580px) { .shelf-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 1000px) { .headline { font-size: 44px; line-height: 50px; }
      .word-clip { height: 50px; } .shelf-grid { grid-template-columns: repeat(2, 1fr); }
      .cats { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 484px) { .headline { font-size: 36px; line-height: 42px; }
      .word-clip { height: 42px; } .hero { padding-top: 128px; }
      .shelf-grid { grid-template-columns: 1fr; } .cats { grid-template-columns: repeat(2, 1fr); } }
    @media (prefers-reduced-motion: reduce) { .poster { animation: none; } }
  `],
})
export class Landing {
  categories = [
    { slug: 'family', label: 'Family', hue: '#146aeb' },
    { slug: 'books', label: 'Books', hue: '#ab46dd' },
    { slug: 'games', label: 'Games', hue: '#d69712' },
    { slug: 'tech', label: 'Tech', hue: '#146aeb' },
    { slug: 'food-and-drink', label: 'Food & Drink', hue: '#3cbd2c' },
    { slug: 'ai', label: 'AI', hue: '#ab46dd' },
    { slug: 'running', label: 'Running', hue: '#f31a7c' },
    { slug: 'arts-and-culture', label: 'Arts & Culture', hue: '#ab46dd' },
    { slug: 'climate', label: 'Climate', hue: '#3cbd2c' },
    { slug: 'fitness', label: 'Fitness', hue: '#007aff' },
    { slug: 'wellness', label: 'Wellness', hue: '#d69712' },
    { slug: 'crypto', label: 'Crypto', hue: '#f31a7c' },
  ];
  calendars = [
    { slug: 'riverside-run-club', name: 'Riverside Run Club', city: 'Berlin' },
    { slug: 'northside-reading-nights', name: 'Northside Reading Nights', city: 'Lisbon' },
  ];
  current = ADJECTIVES[0];
  private i = 0;

  // 22 posters at desktop, 12 at tablet, 8 on a phone.
  posterCount = 22;
  posters: { seed: string; x: number; y: number; size: number; dur: number; delay: number }[] = [];

  private buildPosters(n: number): void {
    this.posters = Array.from({ length: n }, (_, k) => {
      const cols = n > 14 ? 6 : n > 10 ? 4 : 3;
      const row = Math.floor(k / cols), col = k % cols;
      return {
        seed: `poster-${k}`,
        x: (col * (100 / cols) + (row % 2 ? 6 : 0)) % 100,
        y: (row * (100 / Math.ceil(n / cols)) + 4) % 100,
        size: 96 + ((k * 37) % 80),
        dur: 3600 + ((k * 613) % 2400),
        delay: -(k * 370) % 3600,
      };
    });
  }

  constructor() {
    if (typeof window !== 'undefined') {
      const apply = () => {
        const w = window.innerWidth;
        this.posterCount = w < 484 ? 8 : w < 1000 ? 12 : 22;
        this.buildPosters(this.posterCount);
      };
      apply();
      window.addEventListener('resize', apply);
    }
    setInterval(() => {
      this.i = (this.i + 1) % ADJECTIVES.length;
      this.current = ADJECTIVES[this.i];
    }, 2400);
  }
}

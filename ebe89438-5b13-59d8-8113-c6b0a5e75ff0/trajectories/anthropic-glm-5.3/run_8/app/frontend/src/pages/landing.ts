import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, EventSummary, ShelfCalendar } from '../api';
import { CATEGORIES, categoryMeta } from '../domain';
import { Cover } from '../ui/cover';
import { Icon } from '../ui/icon';
import { DateChip } from '../ui/bits';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

/**
 * The landing wall: posters drifting on a clock behind a centred block of
 * text. No scroll listener is attached at all.
 */
@Component({
  selector: 'g-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wall" aria-hidden="true">
      @for (tile of tiles(); track tile.i) {
        <div class="poster" [style.left.%]="tile.x" [style.top.%]="tile.y"
             [style.animationDuration.s]="tile.dur" [style.animationDelay.s]="tile.delay">
          <div class="poster-colour" [style.background]="tile.colour"></div>
          <g-cover [seed]="tile.seed" [title]="tile.title" [compact]="true" />
        </div>
      }
    </div>

    <section class="hero">
      <h1 class="headline">
        <span class="line">
          <span class="word-clip"><span class="word" [style.animation]="wordAnim()">{{ adjective() }}</span></span>
        </span>
        <span class="line">events</span>
        <span class="line gradient">start here</span>
      </h1>
      <p class="lede">
        Gather is a hosting tool for people who run
        <a class="wavy green" routerLink="/discover" [queryParams]="{ category: 'running' }">run clubs</a>,
        <a class="wavy pink" routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }">launch parties</a> and
        <a class="wavy blue" routerLink="/discover" [queryParams]="{ category: 'climate' }">firework shows</a>.
        Publish an event at its own short address and let people take a seat.
      </p>
      <div class="cta row-wrap">
        <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
        <a class="btn btn-secondary" routerLink="/discover">Discover Events <g-icon name="arrow-right" [size]="16" /></a>
      </div>
    </section>

    <section class="shelf">
      <h2 class="t-overline">Calendars to follow</h2>
      <ul class="cards">
        @for (cal of calendars(); track cal.slug) {
          <li><a class="card cal-card" [routerLink]="['/', cal.slug]">
            <div class="row">
              <g-icon [name]="cal.category" [size]="20" [colour]="categoryMeta(cal.category).hue" />
              <span class="t-row title">{{ cal.name }}</span>
            </div>
            <span class="t-caption muted">{{ cal.city }} · {{ cal.published_count }} events</span>
          </a></li>
        } @empty {
          <li><span class="skeleton skeleton-row"></span></li>
        }
      </ul>
    </section>

    <section class="shelf">
      <h2 class="t-overline">Browse by category</h2>
      <ul class="cards cats">
        @for (cat of categories; track cat.key) {
          <li><a class="card cat-card" [routerLink]="['/', cat.key]">
            <g-icon [name]="cat.key" [size]="24" [colour]="cat.hue" />
            <span class="t-row title">{{ cat.label }}</span>
          </a></li>
        }
      </ul>
    </section>

    <section class="closing">
      <h2 class="t-display closing-title">Your next evening has an address.</h2>
      <a class="btn btn-primary" routerLink="/create">Create Your First Event</a>
    </section>
  `,
  imports: [RouterLink, Cover, Icon, DateChip],
  styles: [`
    :host { display: block; position: relative; overflow: hidden; padding-bottom: 64px; }
    .wall { position: absolute; inset: 0; z-index: -1; overflow: hidden; }
    @media (max-width: 483px) { .wall { opacity: 0.55; } }
    .poster {
      position: absolute; width: 168px; height: 168px; border-radius: 12px;
      box-shadow: var(--shadow-card); overflow: visible;
      animation: nudge 12000ms linear infinite;
    }
    .poster-colour { position: absolute; inset: 12%; border-radius: 12px; filter: blur(48px); opacity: 0.35; }
    @media (prefers-reduced-motion: reduce) { .poster { animation: none; } }

    .hero { display: flex; flex-direction: column; gap: 24px; padding: 48px 24px 0; max-width: 640px; position: relative; z-index: 1; }
    .headline { font-family: var(--serif); font-weight: 700; font-size: 64px; line-height: 72px; letter-spacing: -0.03em; display: flex; flex-direction: column; }
    .line { display: block; }
    .word-clip { display: inline-block; overflow: hidden; vertical-align: bottom; height: 72px; }
    .word { display: inline-block; }
    .gradient {
      background: linear-gradient(90deg, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede { font-size: 16px; line-height: 25.6px; color: var(--ink-36); max-width: 480px; }
    .wavy { text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09); text-underline-offset: 4px; transition: color 0.21s ease-out; }
    .green { color: var(--ink-64); } .pink { color: var(--ink-64); } .blue { color: var(--ink-64); }
    @media (hover: hover) {
      .wavy.green:hover { color: #3cbd2c; }
      .wavy.pink:hover { color: #f31a7c; }
      .wavy.blue:hover { color: #146aeb; }
    }
    .cta { padding-top: 8px; }

    .shelf { padding: 48px 24px 0; }
    .cards { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    .cal-card, .cat-card { display: flex; flex-direction: column; gap: 10px; padding: 16px; text-decoration: none; color: inherit; }
    @media (hover: hover) { .cal-card:hover, .cat-card:hover { box-shadow: var(--shadow-1); } }
    .title { font-weight: 500; }
    .cats { grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); }
    .cat-card { align-items: flex-start; gap: 14px; }

    .closing { padding: 96px 24px 0; display: flex; flex-direction: column; gap: 16px; align-items: flex-start; max-width: 640px; }
    .closing-title { font-size: 32px; line-height: 40px; }

    @keyframes nudge {
      0% { transform: translate3d(0,0,0) rotate(0deg); }
      25% { transform: translate3d(14px,-18px,0) rotate(2deg); }
      50% { transform: translate3d(-10px,12px,0) rotate(-2deg); }
      75% { transform: translate3d(16px,8px,0) rotate(1.5deg); }
      100% { transform: translate3d(0,0,0) rotate(0deg); }
    }

    @media (max-width: 999px) {
      .headline { font-size: 44px; line-height: 50px; }
      .word-clip { height: 50px; }
    }
    @media (max-width: 483px) {
      .headline { font-size: 36px; line-height: 42px; }
      .word-clip { height: 42px; }
    }
  `],
})
export class LandingPage implements OnInit, OnDestroy {
  private api = inject(Api);
  categories = CATEGORIES;
  categoryMeta = categoryMeta;

  calendars = signal<ShelfCalendar[]>([]);
  adjectiveIdx = signal(0);
  adjective = signal(ADJECTIVES[0]!);
  wordAnim = signal('none');
  tiles = signal<{ i: number; x: number; y: number; seed: string; title: string; colour: string; dur: number; delay: number }[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.api.shelves().subscribe((s) => {
      this.calendars.set(s.calendars);
      const count = window.innerWidth < 484 ? 8 : window.innerWidth < 1000 ? 12 : 22;
      const seeds = s.events.map((e: EventSummary) => e);
      const posters = Array.from({ length: count }, (_, i) => {
        const ev = seeds[i % Math.max(1, seeds.length)];
        // scatter on a ring-ish grid so no two posters overlap
        const cols = Math.max(3, Math.ceil(Math.sqrt(count)));
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = ((i * 37) % 13) - 6;
        const jitterY = ((i * 53) % 11) - 5;
        return {
          i,
          x: Math.min(88, Math.max(0, (col * (92 / Math.max(1, cols - 1))) + jitterX)),
          y: Math.min(84, Math.max(0, (row * (86 / Math.max(1, Math.ceil(count / cols) - 1))) + jitterY)),
          seed: ev?.cover_seed ?? `landing-${i}`,
          title: ev?.title ?? 'Gather',
          colour: ev?.theme_hex ?? '#146aeb',
          dur: 10 + ((i * 3) % 9),
          delay: -(i * 1.7),
        };
      });
      this.tiles.set(posters);
    });
    this.timer = setInterval(() => this.rotate(), 2400);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private rotate(): void {
    const next = (this.adjectiveIdx() + 1) % ADJECTIVES.length;
    this.wordAnim.set('landing-title-rise 1200ms linear both');
    this.adjectiveIdx.set(next);
    this.adjective.set(ADJECTIVES[next]!);
  }
}

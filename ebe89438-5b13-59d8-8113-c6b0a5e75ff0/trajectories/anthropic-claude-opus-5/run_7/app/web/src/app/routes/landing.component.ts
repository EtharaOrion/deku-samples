import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, EventSummary } from '../models';
import { TopBarComponent } from '../shared/top-bar.component';
import { CoverComponent } from '../shared/ui.components';
import { CategoryIconComponent, IconComponent } from '../shared/icons.component';
import { coverBackground } from '../core/art';
import { clearTheme } from '../core/theme';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];
const HOLD_MS = 2400;

interface Poster {
  seed: string;
  title: string;
  slug: string | null;
  left: number;
  top: number;
  size: number;
  delay: number;
  rotate: number;
}

/**
 * A wall of posters scattered behind a centred block of text. The posters
 * drift on the `nudge` clock and each throws its own colour onto the ground
 * around it. No scroll listener is attached anywhere on this route: the drift
 * runs on a clock, not on scroll position.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    NgStyle, RouterLink, TopBarComponent, CoverComponent, CategoryIconComponent, IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />

    <main id="main" role="main">
      <section class="hero">
        <div class="wall" aria-hidden="true">
          @for (p of posters(); track p.seed) {
            <div class="poster" [ngStyle]="{
                left: p.left + '%', top: p.top + '%',
                width: p.size + 'px', height: p.size + 'px',
                animationDelay: p.delay + 'ms',
                transform: 'rotate(' + p.rotate + 'deg)'
              }">
              <span class="halo" [ngStyle]="{ background: bg(p.seed) }"></span>
              <app-cover [seed]="p.seed" [size]="p.size" [title]="p.title" [drift]="false" />
            </div>
          }
        </div>

        <div class="headline">
          <h1 class="title display">
            <span class="rotator" aria-live="off">
              <span class="word" [class.title-rise]="true" [attr.key]="index()">{{ adjective() }}</span>
            </span>
            <span class="line">events</span>
            <span class="line gradient">start here</span>
          </h1>
          <p class="blurb">
            From <a class="ink-link run" routerLink="/discover" [queryParams]="{ category: 'running' }">run clubs</a>
            to <a class="ink-link party" routerLink="/discover" [queryParams]="{ category: 'tech' }">launch parties</a>
            to <a class="ink-link fire" routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }">firework shows</a>,
            find the evening you were looking for and take a seat at it.
          </p>
          <div class="actions">
            <a class="btn btn-solid" [routerLink]="createLink()">Create Your First Event</a>
            <a class="btn btn-text arrow" routerLink="/discover">
              Discover Events <app-icon name="arrow-right" [size]="18" />
            </a>
          </div>
        </div>
      </section>

      <!-- shelf one: calendars -->
      <section class="shelf container">
        <h2 class="screen-title">Calendars to follow</h2>
        <ul class="shelf-grid">
          @for (ev of shelfEvents(); track ev.slug) {
            <li>
              <a class="card card-lift shelf-card" [routerLink]="['/', ev.calendar_slug]">
                <app-cover [seed]="ev.calendar_slug" [size]="64" radius="8px" />
                <div class="shelf-meta">
                  <h3 class="card-title">{{ ev.calendar_name }}</h3>
                  <p class="caption tertiary">{{ ev.city }}</p>
                </div>
              </a>
            </li>
          }
        </ul>
      </section>

      <!-- shelf two: the twelve categories -->
      <section class="shelf container">
        <h2 class="screen-title">Browse by category</h2>
        <ul class="cat-grid">
          @for (c of categories; track c) {
            <li>
              <a class="card card-lift cat-card" [routerLink]="['/', c]">
                <app-category-icon [name]="c" [size]="28" />
                <span class="card-title">{{ label(c) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <!-- closing band repeating the primary action -->
      <section class="closing">
        <h2 class="display closing-title">Start the thing you keep meaning to start.</h2>
        <a class="btn btn-solid" [routerLink]="createLink()">Create Your First Event</a>
      </section>

      <footer class="footer container" role="contentinfo">
        <span class="caption tertiary">Deku Events</span>
        <a class="caption" routerLink="/terms">Terms</a>
        <a class="caption" routerLink="/app">Get the App</a>
      </footer>
    </main>
  `,
  styles: [`
    .hero {
      position: relative; min-height: 82vh;
      display: flex; align-items: center; justify-content: center;
      padding: 128px var(--s5) var(--s8); overflow: hidden;
    }
    .wall { position: absolute; inset: 0; z-index: -1; }
    .poster { position: absolute; animation: nudge 1000ms linear infinite; }
    .poster app-cover { opacity: 0.85; }
    /* Each poster throws its own colour onto the ground around it. The halo is
       painted once and left alone; only position moves. */
    .halo {
      position: absolute; inset: -40%; border-radius: 50%;
      filter: blur(48px); opacity: 0.28; z-index: -1;
    }

    .headline { position: relative; z-index: 1; max-width: 640px; text-align: center; }
    .title {
      font-size: 64px; line-height: 72px; font-weight: 700; letter-spacing: -0.03em;
      display: flex; flex-direction: column; align-items: center;
    }
    @media (max-width: 999px) { .title { font-size: 44px; line-height: 50px; } }
    @media (max-width: 483px) { .title { font-size: 36px; line-height: 42px; } }

    /* The outgoing word travels up out of a clipping block while the incoming
       word travels up into it, so the two never overlap. */
    .rotator { display: block; overflow: hidden; height: 1.13em; }
    .word { display: block; }
    .title-rise { animation: landing-title-rise 1200ms linear both; }
    .line { display: block; }
    .gradient {
      background: linear-gradient(90deg, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent; color: transparent;
    }

    .blurb {
      font-size: 16px; line-height: 25.6px; color: var(--ink-tertiary);
      max-width: 480px; margin: var(--s4) auto 0;
    }
    .ink-link {
      color: inherit;
      text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09);
      text-underline-offset: 3px;
    }
    .run:hover { color: #3cbd2c; }
    .party:hover { color: #f31a7c; }
    .fire:hover { color: #146aeb; }

    .actions { display: flex; gap: var(--s3); justify-content: center;
      margin-top: var(--s5); flex-wrap: wrap; }
    .arrow app-icon { animation: arrow-fade 600ms linear both; }

    .shelf { padding: var(--s7) var(--s5); }
    .shelf h2 { margin-bottom: var(--s4); }
    .shelf-grid { display: grid; grid-template-columns: 1fr; gap: var(--s3); }
    @media (min-width: 484px) { .shelf-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1000px) { .shelf-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1580px) { .shelf-grid { grid-template-columns: repeat(4, 1fr); } }
    .shelf-card { display: flex; gap: var(--s3); align-items: center; padding: var(--s3);
      color: inherit; }
    .shelf-card:hover { color: inherit; }
    .shelf-meta { min-width: 0; }

    .cat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s3); }
    @media (min-width: 650px) { .cat-grid { grid-template-columns: repeat(4, 1fr); } }
    @media (min-width: 1000px) { .cat-grid { grid-template-columns: repeat(6, 1fr); } }
    .cat-card {
      display: flex; flex-direction: column; align-items: center; gap: var(--s2);
      padding: var(--s4) var(--s2); text-align: center; color: inherit; min-height: 96px;
      justify-content: center;
    }
    .cat-card:hover { color: inherit; }

    .closing {
      text-align: center; padding: var(--s8) var(--s5);
      display: flex; flex-direction: column; align-items: center; gap: var(--s4);
    }
    .closing-title { font-size: 32px; line-height: 40px; max-width: 560px; }

    .footer { display: flex; gap: var(--s4); justify-content: center;
      padding: var(--s5) var(--s5) var(--s7); }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  categories = CATEGORIES;
  posters = signal<Poster[]>([]);
  shelfEvents = signal<EventSummary[]>([]);
  index = signal(0);
  private timer: any = null;

  adjective() { return ADJECTIVES[this.index() % ADJECTIVES.length]; }
  label(c: string) { return CATEGORY_LABELS[c] ?? c; }
  bg(seed: string) { return coverBackground(seed); }

  createLink(): string {
    // A guest has no calendar to create on, so the action leads to sign-in.
    return this.api.isHost ? '/create' : '/login';
  }

  ngOnInit() {
    clearTheme();
    this.buildWall();
    // The rotation runs on a clock; no scroll listener is attached.
    this.timer = setInterval(() => this.index.update((i) => i + 1), HOLD_MS);

    this.api.listEvents({ limit: 24 }).subscribe({
      next: (r) => {
        if (r.items.length) {
          this.buildWall(r.items);
          const seen = new Set<string>();
          this.shelfEvents.set(r.items.filter((e) => {
            if (seen.has(e.calendar_slug)) return false;
            seen.add(e.calendar_slug);
            return true;
          }).slice(0, 4));
        }
      },
      error: () => { /* the wall stands on its generated seeds alone */ },
    });

    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    window.removeEventListener('resize', this.onResize);
  }

  private onResize = () => this.buildWall(this.lastEvents);
  private lastEvents: EventSummary[] = [];

  /** 22 poster tiles at desktop, 12 at tablet and 8 on a phone. */
  private buildWall(events: EventSummary[] = []) {
    this.lastEvents = events;
    const w = window.innerWidth;
    const count = w >= 1000 ? 22 : w >= 650 ? 12 : 8;
    const out: Poster[] = [];
    for (let i = 0; i < count; i++) {
      const ev = events[i % Math.max(1, events.length)];
      const seed = ev ? `${ev.cover_seed}-${i}` : `poster-${i}`;
      // A deterministic scatter, so the wall does not jump on a re-render.
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12345.6789;
      const fract = (n: number) => n - Math.floor(n);
      out.push({
        seed,
        title: ev?.title ?? '',
        slug: ev?.slug ?? null,
        left: Math.round(fract(a) * 88),
        top: Math.round(fract(b) * 82),
        size: w >= 1000 ? 108 + Math.round(fract(a * 3) * 60) : 76 + Math.round(fract(a * 3) * 34),
        delay: Math.round(fract(b * 5) * 1000),
        rotate: Math.round((fract(a * 7) - 0.5) * 14),
      });
    }
    this.posters.set(out);
  }
}

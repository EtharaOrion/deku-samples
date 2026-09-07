import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar, EventSummary } from '../core/models';
import { coverBackground } from '../ui/cover';
import { BrandComponent } from '../ui/brand.component';
import { IconComponent, categoryHue } from '../ui/icon.component';
import { TopBarComponent } from '../ui/top-bar.component';

interface Poster {
  seed: string;
  slug: string;
  title: string;
  x: number;
  y: number;
  size: number;
  delay: number;
  bg: string;
  key: string;
}

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, TopBarComponent, BrandComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />

    <main id="main">
      <!-- The poster wall. Each tile drifts on the nudge clock and throws its
           own colour onto the ground around it. No scroll listener is attached:
           the drift runs on a clock, not on scroll position. -->
      <div class="wall" aria-hidden="true">
        @for (p of posters(); track p.slug + p.x) {
          <div
            class="poster anim-nudge"
            [style.left.%]="p.x"
            [style.top.%]="p.y"
            [style.width.px]="p.size"
            [style.animation-delay.ms]="p.delay"
          >
            <div class="halo" [style.background]="p.key"></div>
            <div class="tile" [style.background]="p.bg"></div>
          </div>
        }
      </div>

      <section class="hero">
        <h1>
          <span class="rotator">
            <span class="slot">
              @for (w of [current()]; track w) {
                <span class="word anim-landing-title in">{{ w }}</span>
              }
              @for (w of [previous()]; track w + 'p') {
                @if (w) {
                  <span class="word anim-landing-title out">{{ w }}</span>
                }
              }
            </span>
          </span>
          <span class="line">events</span>
          <span class="line gradient">start here</span>
        </h1>

        <p class="blurb t-prose">
          A calendar for the people who actually run things: the
          <a routerLink="/discover" [queryParams]="{ category: 'running' }" class="wavy run">run clubs</a>, the
          <a routerLink="/discover" [queryParams]="{ category: 'tech' }" class="wavy party">launch parties</a>, the
          <a routerLink="/discover" [queryParams]="{ category: 'family' }" class="wavy fire">firework shows</a>.
          Publish one address, collect your guests, and know who is coming.
        </p>

        <div class="actions">
          <a class="btn btn-primary btn-pill" routerLink="/create">Create Your First Event</a>
          <a class="btn btn-pill secondary" routerLink="/discover">
            Discover Events
            <span class="arrow anim-arrow-fade"><app-icon name="arrow" [size]="18" /></span>
          </a>
        </div>
      </section>

      <section class="shelf wrap" aria-labelledby="shelf-calendars">
        <h2 id="shelf-calendars" class="t-overline">Calendars to follow</h2>
        @if (loading()) {
          <ul class="grid cals">
            @for (i of [1, 2, 3]; track i) {
              <li><div class="sk" style="height:118px;border-radius:12px"></div></li>
            }
          </ul>
        } @else if (calendars().length) {
          <ul class="grid cals">
            @for (c of calendars(); track c.slug) {
              <li>
                <a class="cal card card-lift" [routerLink]="['/', c.slug]">
                  <app-icon [name]="c.category" [size]="24" [color]="hue(c.category)" />
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption muted">{{ c.city }} · {{ label(c.category) }}</span>
                  <span class="t-caption muted">{{ c.published_event_count }} published</span>
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="t-caption muted">No calendars are public yet.</p>
        }
      </section>

      <section class="shelf wrap" aria-labelledby="shelf-categories">
        <h2 id="shelf-categories" class="t-overline">Twelve ways in</h2>
        <ul class="grid cats">
          @for (c of categories; track c) {
            <li>
              <a class="cat card card-lift" [routerLink]="['/', c]">
                <app-icon [name]="c" [size]="24" [color]="hue(c)" />
                <span class="t-card-title">{{ label(c) }}</span>
              </a>
            </li>
          }
        </ul>
      </section>

      <section class="closing">
        <h2 class="t-serif">Your evening deserves an address of its own.</h2>
        <a class="btn btn-primary btn-pill" routerLink="/create">Create Your First Event</a>
      </section>
    </main>

    <footer class="foot">
      <app-brand [markSize]="11" />
      <span class="t-caption muted">Free events, one namespace, no nonsense.</span>
    </footer>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        overflow-x: hidden;
      }
      .wall {
        position: absolute;
        inset: 0 0 auto 0;
        height: 860px;
        z-index: -1;
        pointer-events: none;
      }
      .poster {
        position: absolute;
        aspect-ratio: 1;
        animation: nudge 1000ms linear infinite;
      }
      .halo {
        position: absolute;
        inset: -40%;
        filter: blur(48px);
        opacity: 0.16;
        border-radius: 100%;
      }
      .tile {
        position: absolute;
        inset: 0;
        border-radius: 12.8% / 5.7%;
        opacity: 0.5;
        box-shadow: var(--elev-card);
      }
      .hero {
        max-width: 640px;
        margin: 0 auto;
        padding: 168px var(--s5) var(--s8);
        position: relative;
        z-index: 1;
        text-align: center;
      }
      h1 {
        font-family: var(--serif);
        font-weight: 700;
        font-size: 64px;
        line-height: 72px;
        letter-spacing: -0.03em;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .rotator,
      .line {
        display: block;
      }
      .slot {
        display: block;
        position: relative;
        height: 72px;
        overflow: hidden;
      }
      .word {
        display: block;
        position: absolute;
        inset: 0;
        white-space: nowrap;
      }
      .word.in {
        animation: landing-title-rise 1200ms linear both;
      }
      .word.out {
        animation: landing-title-leave 1200ms linear both;
      }
      .gradient {
        background: linear-gradient(90deg, #f31a7c, #d69712);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .blurb {
        max-width: 480px;
        margin: var(--s5) auto 0;
        color: var(--ink-36);
      }
      .wavy {
        color: inherit;
        text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09);
        text-underline-offset: 3px;
      }
      @media (hover: hover) {
        .wavy.run:hover {
          color: #3cbd2c;
        }
        .wavy.party:hover {
          color: #f31a7c;
        }
        .wavy.fire:hover {
          color: #146aeb;
        }
      }
      .actions {
        display: flex;
        gap: var(--s3);
        justify-content: center;
        flex-wrap: wrap;
        margin-top: var(--s6);
      }
      .secondary {
        background: transparent;
        color: var(--ink-64);
        border-color: var(--ink-08);
      }
      .arrow {
        display: inline-flex;
        animation: arrow-fade 600ms linear both;
      }
      .shelf {
        padding: var(--s7) var(--s5);
        position: relative;
        z-index: 1;
      }
      .shelf h2 {
        color: var(--ink-36);
        margin-bottom: var(--s4);
      }
      .grid {
        display: grid;
        gap: var(--s4);
      }
      .cals {
        grid-template-columns: repeat(1, 1fr);
      }
      .cats {
        grid-template-columns: repeat(2, 1fr);
      }
      @media (min-width: 484px) {
        .cals {
          grid-template-columns: repeat(2, 1fr);
        }
        .cats {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .cals {
          grid-template-columns: repeat(3, 1fr);
        }
        .cats {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      @media (min-width: 1580px) {
        .cals {
          grid-template-columns: repeat(4, 1fr);
        }
        .cats {
          grid-template-columns: repeat(6, 1fr);
        }
      }
      .cal,
      .cat {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        padding: var(--s4);
        color: inherit;
        background: var(--paper);
        min-height: 44px;
      }
      .muted {
        color: var(--muted);
      }
      .closing {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s5);
        padding: var(--s8) var(--s5);
        text-align: center;
      }
      .closing h2 {
        font-size: 28px;
        line-height: 36px;
        max-width: 520px;
      }
      .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        padding: var(--s5);
        border-top: 1px solid var(--ink-08);
        flex-wrap: wrap;
      }

      @media (max-width: 999px) {
        h1 {
          font-size: 44px;
          line-height: 50px;
        }
        .slot {
          height: 50px;
        }
        .hero {
          padding-top: 132px;
        }
      }
      @media (max-width: 483px) {
        h1 {
          font-size: 36px;
          line-height: 42px;
        }
        .slot {
          height: 42px;
        }
        .hero {
          padding: 112px var(--s4) var(--s7);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .word.out {
          display: none;
        }
      }
    `,
  ],
})
export class LandingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly posters = signal<Poster[]>([]);
  readonly loading = signal(true);
  readonly current = signal(ADJECTIVES[0]!);
  readonly previous = signal('');

  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;

  hue = categoryHue;
  label = (c: string) => CATEGORY_LABELS[c] ?? c;

  async ngOnInit() {
    this.startRotation();
    try {
      const data = await this.api.landing();
      this.calendars.set(data.calendars);
      this.posters.set(this.buildWall(data.events));
    } catch {
      this.posters.set(this.buildWall([]));
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** The adjective holds for 2400ms and is replaced by the masked rise. */
  private startRotation() {
    this.timer = setInterval(() => {
      this.previous.set(this.current());
      this.index = (this.index + 1) % ADJECTIVES.length;
      this.current.set(ADJECTIVES[this.index]!);
    }, 2400);
  }

  /** 22 tiles at desktop, 12 at tablet, 8 on a phone. */
  private buildWall(events: EventSummary[]): Poster[] {
    const width = typeof window === 'undefined' ? 1400 : window.innerWidth;
    const count = width < 650 ? 8 : width < 1000 ? 12 : 22;
    const seeds =
      events.length > 0
        ? events
        : Array.from({ length: count }, (_, i) => ({
            slug: `filler-${i}`,
            title: '',
            cover_seed: `seed-${i}`,
          }));
    const out: Poster[] = [];
    for (let i = 0; i < count; i++) {
      const e = seeds[i % seeds.length]! as { slug: string; title: string; cover_seed: string };
      const col = i % 6;
      const row = Math.floor(i / 6);
      const jitterX = ((i * 37) % 11) - 5;
      const jitterY = ((i * 53) % 9) - 4;
      out.push({
        seed: e.cover_seed,
        slug: `${e.slug}-${i}`,
        title: e.title,
        x: 2 + col * 16.5 + jitterX,
        y: 2 + row * 22 + jitterY,
        size: 96 + ((i * 29) % 64),
        delay: (i % 7) * 140,
        bg: coverBackground(e.cover_seed + i),
        key: coverBackground(e.cover_seed + i),
      });
    }
    return out;
  }
}

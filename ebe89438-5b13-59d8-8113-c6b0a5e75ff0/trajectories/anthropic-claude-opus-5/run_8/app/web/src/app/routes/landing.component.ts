import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, type EventSummary } from '../core/models';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';
import { CoverComponent } from '../ui/cover.component';
import { CategoryIconComponent, IconComponent } from '../ui/icons.component';

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
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, CoverComponent, CategoryIconComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <div class="public-shell">
      <main id="main" class="wall-holder">
        <!-- The poster wall drifts on a clock; no scroll listener is attached. -->
        <div class="wall" aria-hidden="true">
          @for (p of visiblePosters(); track p.seed) {
            <div
              class="poster-tile"
              [style.left.%]="p.left"
              [style.top.%]="p.top"
              [style.width.px]="p.size"
              [style.animation-delay.ms]="p.delay"
            >
              <app-cover [seed]="p.seed" [title]="p.title" radius="12px" [showTitle]="false" />
            </div>
          }
        </div>

        <section class="headline">
          <h1 class="title serif">
            <span class="word-slot" aria-hidden="true">
              @for (w of [adjective()]; track w) {
                <span class="word-rise">{{ w }}</span>
              }
            </span>
            <span class="sr-only">{{ adjective() }} events start here</span>
            <span class="line" aria-hidden="true">events</span>
            <span class="line gradient" aria-hidden="true">start here</span>
          </h1>
          <p class="blurb t-longform">
            Deku is where a city keeps its evenings: <a class="ink-link run" [routerLink]="['/discover']" [queryParams]="{ category: 'running' }">run clubs</a>,
            <a class="ink-link party" [routerLink]="['/discover']" [queryParams]="{ category: 'tech' }">launch parties</a> and
            <a class="ink-link fire" [routerLink]="['/discover']" [queryParams]="{ category: 'arts-and-culture' }">firework shows</a>,
            each at its own short address with a seat waiting for you.
          </p>
          <div class="cta">
            <a class="btn btn-primary btn-pill" [routerLink]="primaryLink()">Create Your First Event</a>
            <a class="btn btn-text secondary" routerLink="/discover">
              Discover Events
              <span class="arrow"><app-icon name="arrow-right" [size]="18" /></span>
            </a>
          </div>
        </section>

        <section class="shelf" aria-labelledby="shelf-calendars">
          <h2 id="shelf-calendars" class="t-section-heading">Calendars to follow</h2>
          @if (loading()) {
            <ul class="grid">
              @for (i of [1, 2, 3]; track i) {
                <li><div class="skeleton skeleton-card" style="height: 132px"></div></li>
              }
            </ul>
          } @else {
            <ul class="grid">
              @for (e of shelfEvents(); track e.slug) {
                <li>
                  <a class="card card-lift shelf-card" [routerLink]="['/', e.slug]">
                    <span class="shelf-cover"><app-cover [seed]="e.cover_seed || e.slug" [title]="e.title" radius="11px" [showTitle]="false" /></span>
                    <span class="shelf-body">
                      <span class="t-card-title">{{ e.title }}</span>
                      <span class="t-caption muted">{{ e.calendar_name }} · {{ e.city }}</span>
                    </span>
                  </a>
                </li>
              } @empty {
                <li class="t-caption muted">Nothing published yet. Be the first.</li>
              }
            </ul>
          }
        </section>

        <section class="shelf" aria-labelledby="shelf-categories">
          <h2 id="shelf-categories" class="t-section-heading">Browse by category</h2>
          <ul class="grid cats">
            @for (c of categories; track c) {
              <li>
                <a class="card card-lift cat-card" [routerLink]="['/', c]">
                  <app-category-icon [name]="c" [size]="28" />
                  <span class="t-card-title">{{ label(c) }}</span>
                </a>
              </li>
            }
          </ul>
        </section>

        <section class="closing">
          <h2 class="serif">Your evening, at its own address.</h2>
          <a class="btn btn-primary btn-pill" [routerLink]="primaryLink()">Create Your First Event</a>
        </section>
      </main>

      <footer class="foot">
        <span class="t-caption muted">Deku Community Calendar</span>
        <a class="t-caption muted" routerLink="/terms">Terms</a>
        <a class="t-caption muted" routerLink="/app">Get the App</a>
      </footer>
    </div>
  `,
  styles: [
    `
      .wall-holder {
        position: relative;
        flex: 1;
      }
      .wall {
        position: absolute;
        inset: 0 0 auto 0;
        height: 760px;
        z-index: -1;
        overflow: hidden;
        pointer-events: none;
      }
      .poster-tile {
        position: absolute;
        aspect-ratio: 1 / 1;
        border-radius: 12px;
        overflow: hidden;
        opacity: 0.5;
        filter: saturate(1.1);
        animation: nudge 1000ms linear infinite;
      }
      .headline {
        max-width: 640px;
        margin: 0 auto;
        padding: var(--s8) var(--s5) var(--s7);
        position: relative;
        z-index: 1;
        text-align: left;
      }
      .title {
        font-family: var(--serif);
        font-weight: 700;
        font-size: 64px;
        line-height: 72px;
        letter-spacing: -0.03em;
        display: flex;
        flex-direction: column;
      }
      .word-slot {
        display: block;
        overflow: hidden;
        height: 72px;
        position: relative;
      }
      .word-rise {
        display: block;
        animation: landing-title-rise 1200ms linear both;
      }
      .gradient {
        background: linear-gradient(to right, #f31a7c, #d69712);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .blurb {
        max-width: 480px;
        color: var(--ink-36);
        margin-top: var(--s5);
      }
      .ink-link {
        text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09);
        text-underline-offset: 3px;
      }
      @media (hover: hover) {
        .ink-link.run:hover {
          color: #3cbd2c;
        }
        .ink-link.party:hover {
          color: #f31a7c;
        }
        .ink-link.fire:hover {
          color: #146aeb;
        }
      }
      .cta {
        display: flex;
        gap: var(--s3);
        align-items: center;
        margin-top: var(--s6);
        flex-wrap: wrap;
      }
      .secondary .arrow {
        display: inline-flex;
        animation: arrow-fade 600ms linear forwards;
      }
      .shelf {
        max-width: 1080px;
        margin: 0 auto;
        padding: var(--s6) var(--s5);
        position: relative;
        z-index: 1;
      }
      .shelf h2 {
        margin-bottom: var(--s4);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s4);
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (min-width: 1580px) {
        .grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      .cats {
        grid-template-columns: repeat(2, 1fr);
      }
      @media (min-width: 650px) {
        .cats {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .cats {
          grid-template-columns: repeat(6, 1fr);
        }
      }
      .shelf-card {
        display: flex;
        gap: var(--s3);
        align-items: center;
        padding: var(--s3);
      }
      .shelf-cover {
        width: 56px;
        flex: none;
      }
      .shelf-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .shelf-body > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cat-card {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        align-items: flex-start;
        padding: var(--s4);
        min-height: 96px;
        justify-content: center;
      }
      .muted {
        color: var(--muted);
      }
      .closing {
        max-width: 640px;
        margin: 0 auto;
        padding: var(--s8) var(--s5);
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s5);
      }
      .closing h2 {
        font-size: 32px;
        line-height: 40px;
        font-weight: 400;
      }
      .foot {
        display: flex;
        gap: var(--s4);
        justify-content: center;
        padding: var(--s6) var(--s5);
        border-top: 1px solid var(--ink-08);
      }
      @media (max-width: 999px) {
        .title {
          font-size: 44px;
          line-height: 50px;
        }
        .word-slot {
          height: 50px;
        }
      }
      @media (max-width: 483px) {
        .title {
          font-size: 36px;
          line-height: 42px;
        }
        .word-slot {
          height: 42px;
        }
        .headline {
          padding: var(--s7) var(--s4) var(--s6);
        }
      }
    `,
  ],
})
export class LandingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly categories = CATEGORIES;
  readonly loading = signal(true);
  readonly events = signal<EventSummary[]>([]);
  readonly adjectiveIndex = signal(0);
  readonly adjective = computed(() => ADJECTIVES[this.adjectiveIndex() % ADJECTIVES.length]);
  readonly posterCount = signal(22);

  private timer?: ReturnType<typeof setInterval>;
  private resizeHandler = () => this.setPosterCount();

  readonly shelfEvents = computed(() => this.events().slice(0, 6));

  readonly posters = computed<Poster[]>(() => {
    const evs = this.events();
    const out: Poster[] = [];
    const columns = [2, 14, 26, 38, 50, 62, 74, 86];
    for (let i = 0; i < 22; i++) {
      const ev = evs.length ? evs[i % evs.length] : null;
      const col = columns[i % columns.length];
      const row = Math.floor(i / columns.length);
      out.push({
        seed: ev ? `${ev.cover_seed || ev.slug}-${i}` : `poster-${i}`,
        title: ev?.title ?? '',
        slug: ev?.slug ?? null,
        left: col + ((i * 7) % 6),
        top: row * 27 + ((i * 11) % 14),
        size: 108 + ((i * 13) % 64),
        delay: (i % 7) * 140,
      });
    }
    return out;
  });

  readonly visiblePosters = computed(() => this.posters().slice(0, this.posterCount()));

  label(c: string) {
    return CATEGORY_LABELS[c];
  }

  primaryLink() {
    const acc = this.api.account();
    if (!acc) return '/signup';
    return acc.role === 'host' ? '/create' : '/discover';
  }

  ngOnInit(): void {
    clearTheme();
    this.setPosterCount();
    window.addEventListener('resize', this.resizeHandler, { passive: true });
    this.timer = setInterval(() => this.adjectiveIndex.update((i) => i + 1), HOLD_MS);
    this.api
      .listEvents({ limit: 12 })
      .then((r) => this.events.set(r.events))
      .catch(() => this.events.set([]))
      .finally(() => this.loading.set(false));
    if (!this.api.bootstrapped()) void this.api.loadMe();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener('resize', this.resizeHandler);
  }

  private setPosterCount() {
    const w = window.innerWidth;
    this.posterCount.set(w >= 1000 ? 22 : w >= 650 ? 12 : 8);
  }
}

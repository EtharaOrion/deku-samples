import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, EventRecord } from '../api.service';
import { PublicBarComponent } from '../public-bar';
import { CatIconComponent, EventCoverComponent } from '../widgets';
import { CATEGORIES, CATEGORY_LABELS, coverColors, isCategory } from '../shared';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];

@Component({
  selector: 'route-landing', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBarComponent, CatIconComponent, EventCoverComponent],
  template: `
    <public-bar></public-bar>
    <main id="main" class="wall">
      <!-- the poster wall, drifting on a clock, never on scroll -->
      <div class="posters" aria-hidden="true">
        @for (p of posters(); track $index) {
          <div class="poster" [style]="styleOf(p)">
            <div class="poster-inner">
              <event-cover [seed]="p.seed" [title]="p.title" size="sm"></event-cover>
            </div>
          </div>
        }
      </div>

      <section class="hero">
        <h1 class="headline t-display">
          <span class="clip"><span class="word" [style.animation-duration.ms]="1200">{{ adjective() }}</span></span>
          <span>events</span>
          <span class="gradient-text">start here</span>
        </h1>
        <p class="t-para lede">
          A quiet home for the things you run after work —
          <a routerLink="/discover" [queryParams]="{ category: 'running' }" class="wavy wavy-green">run clubs</a>,
          <a routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }" class="wavy wavy-pink">launch parties</a> and
          <a routerLink="/discover" [queryParams]="{ category: 'books' }" class="wavy wavy-blue">firework shows</a>.
          Publish an evening at its own address, collect guests, and check them in at the door.
        </p>
        <div class="actions">
          <a routerLink="/signup" class="btn btn-primary pill-btn">Create Your First Event</a>
          <a routerLink="/discover" class="btn btn-secondary pill-btn">Discover Events <span class="arrow" aria-hidden="true">→</span></a>
        </div>
      </section>

      <section class="shelf" aria-labelledby="shelves">
        <h2 id="shelves" class="t-overline">Calendars to follow</h2>
        <ul class="grid grid-3">
          @for (c of calendars(); track c.slug) {
            <li><a class="card card-lift calendar-card" [routerLink]="['/' + c.slug]">
              <div class="row gap-12">
                <cat-icon [category]="c.category" [size]="24"></cat-icon>
                <div class="stack gap-4">
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption">{{ c.city }} · {{ c.published_events }} events</span>
                </div>
              </div>
            </a></li>
          }
        </ul>
      </section>

      <section class="shelf" aria-labelledby="cats">
        <h2 id="cats" class="t-overline">Browse by category</h2>
        <ul class="grid grid-3">
          @for (c of categoryList; track c) {
            <li><a class="card card-lift cat-card" [routerLink]="['/' + c]">
              <cat-icon [category]="c" [size]="24" [label]="true"></cat-icon>
              <span class="t-card-title">{{ labelOf(c) }}</span>
            </a></li>
          }
        </ul>
      </section>

      <section class="closing band">
        <div class="band-inner">
          <h2 class="t-display">Your evening has an address.</h2>
          <a routerLink="/signup" class="btn btn-primary pill-btn">Create Your First Event</a>
        </div>
      </section>

      <footer class="site-footer" role="contentinfo">
        <span>Community Calendar · <a routerLink="/legal" class="link">Terms</a></span>
        <span class="tertiary">Drawn, typeset and hosted as one small app.</span>
      </footer>
    </main>
  `,
  styles: [`
    :host{display:block;position:relative}
    .wall{position:relative;overflow:hidden;padding-top:64px}
    .posters{position:absolute;inset:0;z-index:-1;display:grid;place-items:center;pointer-events:none}
    .poster{position:absolute;width:132px;height:132px;opacity:.9;animation:nudge 12000ms linear infinite}
    .poster-inner{border-radius:11px;overflow:hidden;box-shadow:rgba(0,0,0,.18) 0 12px 32px 0;transform:rotate(var(--rot))}
    .poster:hover{animation-play-state:running}
    .hero{max-width:960px;margin:0 auto;padding:96px 24px 48px;text-align:center;position:relative;z-index:1}
    .headline{font-size:64px;line-height:72px;font-weight:700;letter-spacing:-.03em;max-width:640px;margin:0 auto 24px;display:flex;flex-direction:column}
    .clip{display:block;overflow:hidden;position:relative}
    .word{display:inline-block;animation:landing-title-rise 1200ms linear both}
    .gradient-text{
      background:linear-gradient(90deg,#f31a7c,#d69712);
      -webkit-background-clip:text;background-clip:text;color:transparent;
    }
    .lede{max-width:480px;margin:0 auto 32px;color:var(--ink-3);text-align:center}
    .wavy{text-decoration:underline wavy rgba(21,21,21,.09) 1px;transition:color .21s ease-out}
    .wavy-green:hover{color:#3cbd2c}.wavy-pink:hover{color:#f31a7c}.wavy-blue:hover{color:#146aeb}
    .actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    .arrow{animation:arrow-fade 600ms linear both}
    .shelf{max-width:1080px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:16px;position:relative;z-index:1}
    .calendar-card,.cat-card{padding:16px;display:flex;align-items:center;gap:12px}
    .cat-card{flex-direction:column;align-items:flex-start}
    .closing{padding:64px 24px}
    .band-inner{max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
    .band-inner h2{font-size:32px;line-height:38px}
    @media (max-width:999px){ .headline{font-size:44px;line-height:50px} }
    @media (max-width:483px){ .headline{font-size:36px;line-height:42px} .poster{width:96px;height:96px} }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  api = inject(ApiService);
  posters = signal<Array<{ seed: string; title: string; x: number; y: number; rot: number; delay: number }>>([]);
  calendars = signal<any[]>([]);
  adjective = signal(ADJECTIVES[0]);
  categoryList = CATEGORIES;
  labelOf = (c: string) => CATEGORY_LABELS[c] || c;
  private timer: any = null;
  private adjTimer: any = null;

  ngOnInit() {
    // a scattered wall of covers, deterministic from the published events
    this.api.get<EventRecord[]>('/events?limit=20').then((events) => {
      const seeds = events.length ? events : [];
      const tiles: any[] = [];
      const count = typeof window !== 'undefined' && window.innerWidth < 484 ? 8 : window.innerWidth < 1000 ? 12 : 22;
      for (let i = 0; i < count; i++) {
        const e = seeds[i % Math.max(seeds.length, 1)];
        tiles.push({
          seed: e ? e.cover_seed || e.slug : 'seed-' + i,
          title: e ? e.title : 'Community',
          x: 4 + (i * 37) % 92,
          y: 3 + ((i * 53) % 90),
          rot: ((i * 29) % 40) - 20,
          delay: (i % 7) * 600,
        });
      }
      this.posters.set(tiles);
    }).catch(() => { });

    this.api.get<any[]>('/calendars/public').then(c => this.calendars.set(c)).catch(() => { });

    let i = 0;
    this.adjTimer = setInterval(() => { i = (i + 1) % ADJECTIVES.length; this.adjective.set(ADJECTIVES[i]); }, 2400);
  }

  styleOf(p: any): string {
    return `left:${p.x}%;top:${p.y}%;animation-delay:${p.delay}ms;--rot:${p.rot}deg`;
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.adjTimer) clearInterval(this.adjTimer);
  }
}

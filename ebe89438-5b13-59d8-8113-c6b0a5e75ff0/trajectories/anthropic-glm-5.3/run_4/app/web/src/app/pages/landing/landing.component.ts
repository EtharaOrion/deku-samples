import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { EventItem } from '../../core/auth.service';
import { CoverService } from '../../core/cover.service';
import { CATEGORY_GLYPHS, CATEGORY_LIST } from '../../core/visuals';

const ADJECTIVES = ['Delightful', 'Vivid', 'Stellar', 'Lovely'];
const HOLD_MS = 2400;

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="wall" aria-hidden="true">
      @for (p of posters(); track p.id) {
        <div class="poster" [style.left.%]="p.x" [style.top.%]="p.y" [style.--w.px]="p.w" [style.--tilt]="p.tilt + 'deg'">
          <div class="poster-card">
            <div class="poster-cover cover-saturate">
              <img class="cover-img" [src]="p.uri" alt="" />
              <div class="cover-glow"></div>
              <div class="cover-sheen"></div>
            </div>
            <span class="poster-title">{{ p.title }}</span>
          </div>
        </div>
      }
    </div>

    <section class="hero">
      <h1 class="headline serif">
        <span class="clip"><span class="word">{{ adjective() }}</span></span>
        <span class="line">events</span>
        <span class="line gradient-text">start here</span>
      </h1>
      <p class="lede">
        Gatherline is a hosting tool for people who run small public gatherings —
        <a class="wavy run" routerLink="/discover" [queryParams]="{ category: 'running' }">run clubs</a>,
        <a class="wavy party" routerLink="/discover" [queryParams]="{ category: 'arts-and-culture' }">launch parties</a>,
        <a class="wavy fire" routerLink="/discover" [queryParams]="{ category: 'climate' }">firework shows</a>.
        Publish one page, share one address, and let the seats look after themselves.
      </p>
      <div class="actions">
        <a class="btn btn-primary" routerLink="/signup">Create Your First Event</a>
        <a class="btn btn-ghost" routerLink="/discover">
          Discover Events <span class="arrow" aria-hidden="true">→</span>
        </a>
      </div>
    </section>

    <section class="shelf" aria-labelledby="calendars-h">
      <h2 id="calendars-h" class="overline">Calendars to follow</h2>
      <ul class="shelf-grid">
        @for (cal of calendars(); track cal.slug) {
          <li><a class="card lift cal-card" [routerLink]="['/', cal.slug]">
            <span class="cal-name">{{ cal.name }}</span>
            <span class="caption cal-meta">{{ cal.city }} · {{ cal.category }}</span>
          </a></li>
        } @empty {
          <li><div class="skeleton" style="height:96px"></div></li>
          <li><div class="skeleton" style="height:96px"></div></li>
        }
      </ul>
    </section>

    <section class="shelf" aria-labelledby="categories-h">
      <h2 id="categories-h" class="overline">Browse by category</h2>
      <ul class="shelf-grid cats">
        @for (cat of categories; track cat) {
          <li>
            <a class="card lift cat-card" [routerLink]="['/', cat]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" [attr.stroke]="glyph(cat).hue" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path [attr.d]="glyph(cat).path" />
              </svg>
              <span class="cat-label">{{ glyph(cat).label }}</span>
            </a>
          </li>
        }
      </ul>
    </section>

    <footer class="closing">
      <h2 class="serif closing-title">Your gathering deserves its own page.</h2>
      <a class="btn btn-primary" routerLink="/signup">Create Your First Event</a>
      <p class="caption closing-note">Free events only. No payments, no messaging, no noise.</p>
    </footer>
  `,
  styles: [`
    :host { display: block; position: relative; min-height: 100vh; overflow: hidden; }
    .wall { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
    .poster { position: absolute; width: var(--w); animation: drift 7000ms ease-in-out infinite; }
    .poster-card {
      display: flex; flex-direction: column; gap: 8px;
      border-radius: var(--r-media);
      box-shadow: var(--elev-card);
      background: var(--paper);
      padding: 8px;
    }
    .poster-cover { position: relative; border-radius: 7px; overflow: hidden; aspect-ratio: 1; }
    .poster-title { font-size: 11px; line-height: 16px; color: var(--ink-64); padding: 0 4px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hero {
      position: relative; z-index: 1;
      padding: 128px 24px 48px;
      max-width: 760px; margin: 0 auto;
      display: flex; flex-direction: column; gap: 24px;
    }
    .headline {
      font-size: 64px; line-height: 72px; font-weight: 700; letter-spacing: -0.03em;
      max-width: 640px; margin: 0;
      display: flex; flex-direction: column;
    }
    .line { display: block; }
    .clip { overflow: hidden; display: block; height: 72px; }
    .word { display: block; animation: landing-title-rise 1200ms linear both; }
    .gradient-text {
      background: linear-gradient(to right, #f31a7c, #d69712);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lede { font-size: 16px; line-height: 25.6px; color: var(--ink-36); max-width: 480px; }
    .wavy { text-decoration: underline 1px wavy rgba(21, 21, 21, 0.09); text-underline-offset: 4px; }
    .wavy.run:hover { color: #3cbd2c; }
    .wavy.party:hover { color: #f31a7c; }
    .wavy.fire:hover { color: #146aeb; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
    .shelf { padding: 32px 24px; max-width: 1080px; margin: 0 auto; }
    .shelf h2 { margin-bottom: 16px; }
    .shelf-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .cal-card { padding: 16px; display: flex; flex-direction: column; gap: 4px; min-height: 96px; }
    .cal-name { font-size: 14px; line-height: 21px; font-weight: 500; }
    .cal-meta { color: var(--muted); }
    .cat-card { padding: 16px; display: flex; align-items: center; gap: 12px; min-height: 64px; }
    .cat-label { font-size: 14px; line-height: 21px; }
    .closing { padding: 64px 24px 96px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .closing-title { font-size: 32px; line-height: 40px; }
    .closing-note { color: var(--muted); }
    @media (min-width: 484px) { .shelf-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (min-width: 1000px) { .shelf-grid.cats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (min-width: 1580px) { .shelf-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .shelf-grid.cats { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
    @media (max-width: 1000px) { .headline { font-size: 44px; line-height: 50px; } .clip { height: 50px; } }
    @media (max-width: 484px) { .headline { font-size: 36px; line-height: 42px; } .clip { height: 42px; } .hero { padding-top: 96px; } }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private covers = inject(CoverService);

  categories = CATEGORY_LIST;
  posters = signal<Array<{ id: number; uri: string; title: string; x: number; y: number; w: number; tilt: number }>>([]);
  calendars = signal<Array<{ slug: string; name: string; city: string; category: string }>>([]);

  adjective = signal(ADJECTIVES[0]);
  private idx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.api.listEvents({ limit: 24 }).then(({ items }) => {
      const count = window.innerWidth < 484 ? 8 : window.innerWidth < 1000 ? 12 : 22;
      const pool = items.length >= count ? items : [...items, ...items, ...items];
      const out: Array<{ id: number; uri: string; title: string; x: number; y: number; w: number; tilt: number }> = [];
      for (let i = 0; i < count && pool.length > 0; i++) {
        const ev = pool[i % pool.length] as EventItem;
        out.push({
          id: i,
          uri: this.covers.dataUri(ev.cover_seed, ev.title),
          title: ev.title,
          x: 4 + ((i * 37) % 88),
          y: 2 + ((i * 53) % 88),
          w: 150 + ((i * 29) % 90),
          tilt: ((i * 17) % 14) - 7,
        });
      }
      this.posters.set(out);
    });
    this.api.listEvents({ limit: 6 }).then(({ items }) => {
      const cals = items.map((e) => e.calendar).filter((c): c is { slug: string; name: string; owner_account_id: string } => !!c)
        .map((c) => ({ slug: c.slug, name: c.name, city: '', category: '' }));
      const seen = new Set<string>();
      this.calendars.set(cals.filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true))).slice(0, 6));
    });
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % ADJECTIVES.length;
      this.adjective.set(ADJECTIVES[this.idx]);
    }, HOLD_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  glyph(cat: string) { return CATEGORY_GLYPHS[cat] ?? { hue: '#146aeb', label: cat, path: '' }; }
}

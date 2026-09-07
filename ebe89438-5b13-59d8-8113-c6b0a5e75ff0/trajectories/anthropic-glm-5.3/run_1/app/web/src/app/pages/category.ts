import { Component, OnInit, signal, Input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PublicBarComponent } from '../public-bar';
import { CoverComponent } from '../cover';
import { IconComponent } from '../icon';
import { Api, ApiEvent } from '../api';
import { CATEGORY_LABEL, CATEGORIES } from '../categories';

const DESCRIPTIONS: Record<string, string> = {
  family: 'Things to bring the whole household to, at hours that suit them.',
  books: 'Reading nights, swaps and the people who still read aloud.',
  games: 'Tabletop evenings, playtests and tournaments with chairs pushed back.',
  tech: 'Meetups where the demo works on the second try.',
  'food-and-drink': 'Supper clubs, tastings and long tables in small rooms.',
  ai: 'Model evenings, prompt labs and the arguments that follow.',
  running: 'Run clubs, track sessions and slow recovery loops.',
  'arts-and-culture': 'Galleries by night, choirs by day, print fairs between.',
  climate: 'Repairs, river clean-ups and the meetings that plan them.',
  fitness: 'Strength mornings, mobility evenings and honest time trials.',
  wellness: 'Breathwork, saunas and walks that end in silence.',
  crypto: 'Wallet workshops and meetups with the projector working.',
};

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [PublicBarComponent, CoverComponent, IconComponent, RouterLink, CommonModule, FormsModule],
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap">
      <div class="mast">
        <div class="mast-main">
          <span class="glyph"><app-icon [name]="slug" [size]="48"></app-icon></span>
          <h1 class="h1">{{ label }}</h1>
          <p class="counts">{{ events().length }} event{{ events().length === 1 ? '' : 's' }} · {{ calendars().length }} calendar{{ calendars().length === 1 ? '' : 's' }}</p>
          <p class="desc">{{ description }}</p>
          <form class="subscribe" (submit)="subscribe($event)">
            <label class="field">
              <span class="visually-hidden">Email for category updates</span>
              <input type="email" [(ngModel)]="email" name="email" placeholder="you@example.com" required />
            </label>
            <button class="btn btn-secondary" type="submit">Subscribe</button>
          </form>
        </div>
        <div class="decor card" aria-hidden="true">
          <app-cover [seed]="slug + '-decor'" [size]="'100%'"></app-cover>
        </div>
      </div>

      @if (events().length === 0) {
        <div class="empty">
          <h2>There are currently no relevant events near you.</h2>
          <a class="btn btn-primary" routerLink="/discover">Explore Events</a>
        </div>
      } @else {
        <ul class="grid">
          @for (ev of events(); track ev.slug) {
            <li><a class="card ev-card" [routerLink]="['/' + ev.slug]">
              <app-cover [seed]="ev.cover_seed" [size]="'100%'" [radius]="'12px'"></app-cover>
              <div class="ev-body">
                <span class="ev-title">{{ ev.title }}</span>
                <span class="ev-meta">{{ ev.city }} · {{ shortDate(ev.starts_at, ev.time_zone) }}</span>
              </div>
            </a></li>
          }
        </ul>
      }

      @if (calendars().length > 0) {
        <h2 class="shelf-h">Calendars in {{ label }}</h2>
        <ul class="cal-grid">
          @for (cal of calendars(); track cal.slug) {
            <li><a class="card cal-card" [routerLink]="['/' + cal.slug]">
              <app-icon [name]="cal.category" [size]="24"></app-icon>
              <span class="cal-name">{{ cal.name }}</span>
              <span class="cal-city">{{ cal.city }}</span>
            </a></li>
          }
        </ul>
      }
    </main>
  `,
  styles: [`
    :host { display: block; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 96px; }
    .mast { display: flex; gap: 48px; align-items: flex-start; margin-bottom: 40px; }
    .mast-main { flex: 1; }
    .glyph { display: inline-flex; margin-bottom: 8px; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 40px; line-height: 48px; margin: 0 0 8px; }
    .counts { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--muted); margin: 0 0 12px; }
    .desc { font-size: 16px; line-height: 25.6px; color: var(--ink-64); margin: 0 0 20px; max-width: 520px; }
    .decor { width: 320px; flex: none; }
    .subscribe { display: flex; gap: 8px; max-width: 420px; }
    .subscribe .field { flex: 1; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .ev-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; text-decoration: none; color: var(--ink); }
    .ev-body { display: flex; flex-direction: column; gap: 6px; padding: 4px 8px 8px; }
    .ev-title { font-size: 14px; line-height: 21px; font-weight: 500; }
    .ev-meta { font-size: 13px; line-height: 16px; color: var(--muted); }
    .shelf-h { font-family: var(--serif); font-weight: 400; font-size: 24px; margin: 40px 0 16px; }
    .cal-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .cal-card { padding: 20px; display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: var(--ink); }
    .cal-name { font-size: 14px; line-height: 21px; font-weight: 500; }
    .cal-city { font-size: 13px; line-height: 16px; color: var(--muted); }
    .empty { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .empty h2 { font-family: var(--serif); font-weight: 400; font-size: 24px; margin: 0; }
    @media (max-width: 1000px) { .mast { flex-direction: column; } .decor { width: 100%; max-width: 320px; } }
    @media (max-width: 650px) { .cal-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 484px) { .grid, .cal-grid { grid-template-columns: 1fr; } .decor { display: none; } }
  `],
})
export class CategoryComponent implements OnInit {
  @Input() slugInput: string | null = null;
  slug = '';
  label = '';
  description = '';
  events = signal<ApiEvent[]>([]);
  calendars = signal<{ name: string; slug: string; city: string; category: string }[]>([]);
  email = '';

  constructor(private route: ActivatedRoute, private api: Api, private router: Router) {}

  ngOnInit() {
    if (this.slugInput) { this.boot(this.slugInput); return; }
    this.route.paramMap.subscribe((pm) => this.boot(pm.get('category') || ''));
  }

  boot(slug: string) {
      {
      this.slug = slug;
      if (!CATEGORY_LABEL[this.slug]) { this.router.navigateByUrl('/' + this.slug); return; }
      this.label = CATEGORY_LABEL[this.slug];
      this.description = DESCRIPTIONS[this.slug] || `Everything filed under ${this.label}.`;
      this.api.get<ApiEvent[]>(`/events?category=${this.slug}&limit=24`).then(({ body }) => {
        this.events.set((body as any) || []);
      });
      const known = ['riverside-run-club', 'northside-reading-nights'];
      const picks: Record<string, { name: string; slug: string; city: string }[]> = {
        running: [{ name: 'Riverside Run Club', slug: 'riverside-run-club', city: 'Berlin' }],
        books: [{ name: 'Northside Reading Nights', slug: 'northside-reading-nights', city: 'Lisbon' }],
      };
      this.calendars.set((picks[this.slug] || []).map((c) => ({ ...c, category: this.slug })));
      }
  }

  subscribe(e: Event) {
    e.preventDefault();
    this.api.flash(`You're subscribed to ${this.label}. We'll write when something is on.`, 'success');
    this.email = '';
  }

  shortDate(iso: string, zone: string) {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(iso));
  }
}

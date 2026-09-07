import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { Cover } from '../ui/cover';
import { CATEGORY_HUES } from '../ui/icons';
import { TimeFmt } from '../core/time';

const LABELS: Record<string, string> = {
  'family': 'Family', 'books': 'Books', 'games': 'Games', 'tech': 'Tech',
  'food-and-drink': 'Food and Drink', 'ai': 'AI', 'running': 'Running',
  'arts-and-culture': 'Arts and Culture', 'climate': 'Climate', 'fitness': 'Fitness',
  'wellness': 'Wellness', 'crypto': 'Crypto',
};
const DESCRIPTIONS: Record<string, string> = {
  'family': 'Things to do with the whole household, from toddlers to grandparents.',
  'books': 'Readings, swaps, clubs and quiet evenings with people who love pages.',
  'games': 'Board nights, playtests and tournaments where newcomers always fit.',
  'tech': 'Talks, demos and build nights for people who make things work.',
  'food-and-drink': 'Supper clubs, tastings and kitchens that welcome strangers.',
  'ai': 'Hands-on sessions and honest conversations about machine intelligence.',
  'running': 'Easy miles, track sessions and races for every pace on the road.',
  'arts-and-culture': 'Galleries, stages, studios and the people who fill them.',
  'climate': 'Repairs, planting and local action that adds up to something.',
  'fitness': 'Strength, movement and training with company that keeps you honest.',
  'wellness': 'Breath, rest and slow hours in rooms that make both easier.',
  'crypto': 'Meetups about coins, contracts and the web they are building.',
};

@Component({
  selector: 'cc-category',
  standalone: true,
  imports: [PublicBar, RouterLink, Cover],
  template: `
  <cc-public-bar></cc-public-bar>
  <main class="container page">
    <div class="mast spread">
      <div class="grow">
        <span class="glyph" [style.color]="hue" aria-hidden="true">{{ glyph }}</span>
        <h1 class="h1-display title">{{ label }}</h1>
        <p class="overline tertiary">{{ events.length }} events · {{ calendars.length }} calendars</p>
        <p class="desc">{{ description }}</p>
        <form class="sub row" (submit)="$event.preventDefault(); subscribed = true">
          <label class="grow">
            <span class="sr-only">Email for category updates</span>
            <input class="field" type="email" placeholder="you@example.com" required [(value)]="email">
          </label>
          <button class="btn btn-primary btn-sm" type="submit">Subscribe</button>
        </form>
        @if (subscribed) { <p class="caption ok">You are on the list for {{ label }}.</p> }
      </div>
      <aside class="deco card card-lift" aria-hidden="true"><cc-cover [seed]="slug" [size]="220"></cc-cover></aside>
    </div>

    @if (!events.length) {
      <div class="empty">
        <h2>There are currently no relevant events near you.</h2>
        <p>Browse everything else that is coming up instead.</p>
        <a class="btn btn-primary" routerLink="/discover">Explore Events</a>
      </div>
    } @else {
      <section>
        <h2 class="overline tertiary">Coming up</h2>
        <ul class="grid">
          @for (e of events; track e.slug) {
            <li><a class="card card-lift ev" [routerLink]="['/', e.slug]">
              <cc-cover [seed]="e.cover_seed || e.slug" [size]="120"></cc-cover>
              <div><p class="card-title">{{ e.title }}</p><p class="caption">{{ when(e) }}</p></div>
            </a></li>
          }
        </ul>
      </section>
    }

    @if (calendars.length) {
      <section>
        <h2 class="overline tertiary">Calendars</h2>
        <ul class="cal-grid">
          @for (c of calendars; track c.slug) {
            <li><a class="card card-lift cal" [routerLink]="['/', c.slug]">
              <p class="card-title">{{ c.name }}</p><p class="caption">{{ c.city }}</p>
            </a></li>
          }
        </ul>
      </section>
    }
  </main>`,
  styles: [`
    .page { padding-top: 104px; min-height: 100vh; }
    .mast { gap: 32px; align-items: start; margin-bottom: 48px; }
    .glyph { font-size: 48px; line-height: 1; display: block; margin-bottom: 12px; }
    .title { font-size: 40px; line-height: 46px; margin: 0 0 8px; }
    .desc { max-width: 480px; color: var(--ink-64); }
    .sub { margin-top: 16px; max-width: 420px; }
    .ok { color: var(--success); font-weight: 500; }
    .deco { padding: 12px; }
    .grid { list-style: none; padding: 0; margin: 16px 0 48px; display: grid;
      grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .ev { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
    .cal-grid { list-style: none; padding: 0; margin: 16px 0; display: grid;
      grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .cal { padding: 16px; }
    @media (max-width: 1000px) { .grid, .cal-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 650px) { .deco { display: none; } }
    @media (max-width: 484px) { .grid, .cal-grid { grid-template-columns: 1fr; } }
  `],
})
export class Category implements OnInit {
  slug = '';
  label = '';
  description = '';
  hue = '#48484a';
  glyph = '\u25C9';
  email = '';
  subscribed = false;
  events: any[] = [];
  calendars: any[] = [];

  constructor(private route: ActivatedRoute, private fmt: TimeFmt) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      this.slug = (m.get('slug') ?? '').toLowerCase();
      this.label = LABELS[this.slug] ?? this.slug;
      this.description = DESCRIPTIONS[this.slug] ?? '';
      this.hue = CATEGORY_HUES[this.slug] ?? '#48484a';
      const res = await fetch(`/api/events?category=${this.slug}&limit=100`);
      this.events = await res.json();
      const cal = await fetch(`/api/calendars/public?category=${this.slug}`).catch(() => null);
      if (cal && cal.ok) this.calendars = await cal.json(); else this.calendars = [];
    });
  }

  when(e: any): string { return this.fmt.inZone(e.starts_at, e.time_zone); }
}

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { Cover } from '../ui/cover';
import { Api } from '../core/api';
import { TimeFmt } from '../core/time';

interface EventCard {
  slug: string; title: string; category: string; city: string; time_zone: string;
  starts_at: string; ends_at: string; capacity: number; confirmed_count: number;
  remaining: number; state: string; theme_hex: string; cover_seed: string;
  calendar_name: string;
}

const PAGE = 20;
export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
];

/**
 * Discovery. The address is the state: every control writes its value into the
 * query string and reads it back on load.
 */
@Component({
  selector: 'cc-discover',
  standalone: true,
  imports: [PublicBar, RouterLink, Cover],
  template: `
  <cc-public-bar></cc-public-bar>
  <main class="container page">
    <h1 class="screen-title">Discover Events</h1>

    <form class="filters" role="search" (submit)="$event.preventDefault()">
      <label class="f">
        <span class="field-label">Category</span>
        <select class="field" [value]="category" (change)="setParam('category', $any($event.target).value)">
          <option value="">All categories</option>
          @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
        </select>
      </label>
      <label class="f">
        <span class="field-label">City</span>
        <input class="field" type="text" placeholder="City" [value]="city"
               (change)="setParam('city', $any($event.target).value)">
      </label>
      <label class="f grow">
        <span class="field-label">Search</span>
        <input class="field" type="search" placeholder="Search events" [value]="q"
               (change)="setParam('q', $any($event.target).value)">
      </label>
      @if (hasFilter) {
        <button class="btn btn-sm btn-secondary clear" type="button" (click)="clear()">Clear Filters</button>
      }
    </form>

    @if (loading) {
      <ul class="grid" aria-label="Loading events">
        @for (s of skeletons; track s) { <li><div class="skeleton skeleton-card"></div></li> }
      </ul>
    } @else if (!events.length) {
      <div class="empty">
        <h2>No Events Found</h2>
        <p>Try a wider date range or a different category.</p>
        <button class="btn btn-primary" type="button" (click)="clear()">Clear Filters</button>
      </div>
    } @else {
      <ul class="grid">
        @for (e of events; track e.slug) {
          <li>
            <a class="card card-lift ev" [routerLink]="['/', e.slug]">
              <cc-cover [seed]="e.cover_seed || e.slug" [size]="132"></cc-cover>
              <div class="ev-body">
                <p class="card-title">{{ e.title }}</p>
                <p class="caption">{{ when(e) }}</p>
                <p class="caption">{{ e.city }}</p>
                @if (e.state === 'registration_closed') {
                  <span class="pill pill-neutral"><span class="pill-dot"></span>Registration Closed</span>
                } @else {
                  <p class="caption seats">{{ seats(e) }}</p>
                }
              </div>
            </a>
          </li>
        }
      </ul>
      <nav class="pager spread" aria-label="Pages">
        <button class="btn btn-sm btn-secondary" type="button" [disabled]="offset === 0" (click)="page(-1)">Previous</button>
        <p class="caption">Showing {{ shown }} of {{ total }}</p>
        <button class="btn btn-sm btn-secondary" type="button" [disabled]="offset + PAGE >= total" (click)="page(1)">Next</button>
      </nav>
    }
  </main>`,
  styles: [`
    .page { padding-top: 104px; min-height: 100vh; }
    .filters { display: grid; grid-template-columns: 200px 200px 1fr auto; gap: 12px;
      align-items: end; margin: 24px 0 32px; }
    .f { display: block; }
    .clear { min-height: 44px; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid;
      grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .ev { display: flex; flex-direction: column; gap: 14px; padding: 14px; height: 100%; }
    .ev-body { display: grid; gap: 4px; }
    .seats { color: var(--muted); }
    .pager { margin: 32px 0; }
    @media (max-width: 1000px) { .filters { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 650px) { .filters { grid-template-columns: 1fr; } }
    @media (max-width: 484px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class Discover implements OnInit {
  readonly PAGE = PAGE;
  categories = CATEGORIES;
  events: EventCard[] = [];
  loading = true;
  total = 0;
  offset = 0;
  category = '';
  city = '';
  q = '';
  skeletons = Array.from({ length: 6 });

  constructor(private api: Api, private route: ActivatedRoute, private router: Router, private fmt: TimeFmt) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.category = params.get('category') ?? '';
      this.city = params.get('city') ?? '';
      this.q = params.get('q') ?? '';
      this.offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
      this.load();
    });
  }

  private async load(): Promise<void> {
    this.loading = true;
    const p = new URLSearchParams();
    if (this.category) p.set('category', this.category);
    if (this.city) p.set('city', this.city);
    if (this.q.trim()) p.set('q', this.q.trim());
    p.set('limit', String(PAGE));
    p.set('offset', String(this.offset));
    const res = await fetch(`/api/events?${p}`);
    this.total = Number(res.headers.get('X-Total-Count') ?? 0);
    this.events = await res.json();
    this.loading = false;
  }

  setParam(key: string, value: string): void {
    const p: Record<string, string | null> = { ...this.route.snapshot.queryParams };
    if (value) p[key] = value; else delete p[key];
    if (key !== 'offset') p['offset'] = null;
    this.router.navigate([], { queryParams: p, replaceUrl: true });
  }

  clear(): void { this.router.navigate([], { queryParams: {} }); }

  page(dir: number): void {
    this.setParam('offset', String(Math.max(0, this.offset + dir * PAGE)));
  }

  get hasFilter(): boolean { return !!(this.category || this.city || this.q.trim()); }
  get shown(): number { return this.events.length; }

  label(slug: string): string {
    return slug.split('-').map(w => w === 'and' ? '&' : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  when(e: EventCard): string { return this.fmt.inZone(e.starts_at, e.time_zone); }
  seats(e: EventCard): string {
    return e.remaining === 0 ? 'Waiting list only' : `${e.remaining} of ${e.capacity} seats left`;
  }
}

import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PublicBarComponent } from '../public-bar';
import { CoverComponent } from '../cover';
import { Api, ApiEvent } from '../api';
import { CATEGORIES } from '../categories';

/**
 * Discovery: every filter lives in the query string, so the address is the
 * state — reload, share, and the back button all restore the same list.
 */
@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [PublicBarComponent, CoverComponent, RouterLink, CommonModule],
  template: `
    <app-public-bar></app-public-bar>
    <main class="wrap">
      <h1 class="h1">Discover Events</h1>
      <div class="filters" role="search">
        <label class="field filter">
          <span class="visually-hidden">Category</span>
          <select [value]="filters.category" (change)="setFilter('category', $any($event.target).value)">
            <option value="">All categories</option>
            @for (c of categories; track c.slug) { <option [value]="c.slug">{{ c.label }}</option> }
          </select>
        </label>
        <label class="field filter">
          <span class="visually-hidden">City</span>
          <input placeholder="City" [value]="filters.city" (input)="setFilter('city', $any($event.target).value)" />
        </label>
        <label class="field filter grow">
          <span class="visually-hidden">Search events</span>
          <input placeholder="Search events" [value]="filters.q" (input)="setFilter('q', $any($event.target).value)" />
        </label>
        @if (hasFilters()) {
          <button class="btn btn-quiet clear" type="button" (click)="clear()">Clear Filters</button>
        }
      </div>

      @if (loading()) {
        <div class="grid">
          @for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton" style="height:320px"></div> }
        </div>
      } @else if (events().length === 0) {
        <div class="empty">
          <h2>No Events Found</h2>
          <p>Try a wider date range or a different category.</p>
          <button class="btn btn-primary" type="button" (click)="clear()">Clear Filters</button>
        </div>
      } @else {
        <ul class="grid">
          @for (ev of events(); track ev.slug) {
            <li>
              <a class="card ev-card" [routerLink]="['/' + ev.slug]">
                <app-cover [seed]="ev.cover_seed" [size]="'100%'" [radius]="'12px'"></app-cover>
                <div class="ev-body">
                  <span class="ev-title">{{ ev.title }}</span>
                  <span class="ev-meta">{{ ev.city }} · {{ shortDate(ev.starts_at, ev.time_zone) }}</span>
                  @if (ev.state === 'registration_closed') {
                    <span class="pill pill-muted">Registration closed</span>
                  } @else {
                    <span class="ev-seats">{{ seats(ev) }}</span>
                  }
                </div>
              </a>
            </li>
          }
        </ul>
        <nav class="pager" aria-label="Pages">
          <button class="btn btn-secondary btn-small" type="button" (click)="page(-1)" [disabled]="offset === 0">Previous</button>
          <span class="showing">Showing {{ events().length }} of {{ total() }}</span>
          <button class="btn btn-secondary btn-small" type="button" (click)="page(1)" [disabled]="offset + limit >= total()">Next</button>
        </nav>
      }
    </main>
  `,
  styles: [`
    :host { display: block; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 96px; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; margin: 0 0 24px; }
    .filters { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; margin-bottom: 24px; }
    .filter { min-width: 180px; }
    .filter.grow { flex: 1; min-width: 220px; }
    .clear { min-height: 44px; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .ev-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; text-decoration: none; color: var(--ink); }
    .ev-card:hover { box-shadow: rgba(0,0,0,.03) 0 3px 3px, rgba(0,0,0,.06) 0 17px 14px; }
    .ev-body { display: flex; flex-direction: column; gap: 6px; padding: 4px 8px 8px; }
    .ev-title { font-size: 14px; line-height: 21px; font-weight: 500; }
    .ev-meta { font-size: 13px; line-height: 16px; color: var(--muted); }
    .ev-seats { font-size: 13px; line-height: 16px; color: var(--ink-64); }
    .empty { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .empty h2 { font-family: var(--serif); font-weight: 400; font-size: 26px; margin: 0; }
    .empty p { color: var(--muted); margin: 0; }
    .pager { display: flex; align-items: center; justify-content: space-between; margin-top: 32px; gap: 12px; }
    .showing { font-size: 13px; line-height: 16px; color: var(--muted); }
    @media (min-width: 1580px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 484px) { .grid { grid-template-columns: 1fr; } .filters { flex-direction: column; align-items: stretch; } .filter, .filter.grow { min-width: 0; } }
  `],
})
export class DiscoverComponent implements OnInit {
  categories = CATEGORIES;
  events = signal<ApiEvent[]>([]);
  total = signal(0);
  loading = signal(true);
  filters = { category: '', city: '', q: '' };
  limit = 20;
  offset = 0;

  constructor(private api: Api, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe((qp) => {
      this.filters = {
        category: qp.get('category') || '',
        city: qp.get('city') || '',
        q: qp.get('q') || '',
      };
      this.offset = Number(qp.get('offset') || 0) || 0;
      this.load();
    });
  }

  hasFilters() { return !!(this.filters.category || this.filters.city || this.filters.q.trim()); }

  setFilter(key: 'category' | 'city' | 'q', value: string) {
    this.filters[key] = value;
    this.offset = 0;
    this.writeQuery();
  }

  clear() {
    this.filters = { category: '', city: '', q: '' };
    this.offset = 0;
    this.writeQuery();
  }

  page(dir: number) {
    this.offset = Math.max(0, this.offset + dir * this.limit);
    this.writeQuery();
  }

  writeQuery() {
    const params: Record<string, string> = {};
    if (this.filters.category) params['category'] = this.filters.category;
    if (this.filters.city) params['city'] = this.filters.city;
    if (this.filters.q.trim()) params['q'] = this.filters.q.trim();
    if (this.offset) params['offset'] = String(this.offset);
    this.router.navigate([], { queryParams: params, replaceUrl: true });
  }

  async load() {
    this.loading.set(true);
    const params = new URLSearchParams();
    if (this.filters.category) params.set('category', this.filters.category);
    if (this.filters.city) params.set('city', this.filters.city);
    if (this.filters.q.trim()) params.set('q', this.filters.q.trim());
    params.set('limit', String(this.limit));
    params.set('offset', String(this.offset));
    const { body, headers } = await this.api.get<ApiEvent[]>(`/events?${params}`);
    this.events.set((body as any) || []);
    const t = (headers as any)?.get?.('x-total-count');
    this.total.set(Number(t ?? (body as any)?.length ?? 0));
    this.loading.set(false);
  }

  totalText() { return this.total(); }

  seats(ev: ApiEvent) {
    if (ev.remaining === 0) return `Waiting list only`;
    return `${ev.remaining} of ${ev.capacity} seats left`;
  }

  shortDate(iso: string, zone: string) {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(iso));
  }
}

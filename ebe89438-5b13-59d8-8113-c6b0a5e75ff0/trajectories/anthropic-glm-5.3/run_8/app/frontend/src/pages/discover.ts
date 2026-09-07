import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Api, EventSummary } from '../api';
import { CATEGORIES } from '../domain';
import { Cover } from '../ui/cover';
import { Icon } from '../ui/icon';
import { DateChip } from '../ui/bits';

/**
 * Discovery. Every filtered view is an address: the filters live in the query
 * string, so a reload, a shared link and the back button restore the list.
 */
@Component({
  selector: 'g-discover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <h1 class="t-h1">Discover Events</h1>

      <div class="filters" role="search">
        <label class="field select-field">
          <span class="t-caption">Category</span>
          <select [value]="category()" (change)="setQuery('category', $any($event.target).value)" aria-label="Category">
            <option value="">All categories</option>
            @for (c of categories; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
          </select>
        </label>
        <label class="field">
          <span class="t-caption">City</span>
          <input type="text" [value]="city()" (input)="setQuery('city', $any($event.target).value)" placeholder="City" aria-label="City" />
        </label>
        <label class="field grow">
          <span class="t-caption">Search</span>
          <input type="search" [value]="q()" (input)="setQuery('q', $any($event.target).value)" placeholder="Search events" aria-label="Search events" />
        </label>
        @if (hasFilters()) {
          <button class="btn btn-quiet btn-sm clear" (click)="clear()">Clear Filters</button>
        }
      </div>

      @if (loading()) {
        <ul class="results" aria-hidden="true">
          @for (i of [1,2,3,4,5,6]; track i) {
            <li class="card result"><span class="skeleton skeleton-block"></span><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-line"></span></li>
          }
        </ul>
      } @else if (events().length === 0) {
        <div class="empty">
          <h2>No Events Found</h2>
          <p>Try a wider date range or a different category.</p>
          <button class="btn btn-primary" (click)="clear()">Clear Filters</button>
        </div>
      } @else {
        <ul class="results">
          @for (e of events(); track e.id) {
            <li>
              <a class="card result" [routerLink]="['/', e.slug]">
                <g-cover [seed]="e.cover_seed" [title]="e.title" [compact]="true" />
                <div class="result-body">
                  <div class="spread">
                    <h2 class="t-row title">{{ e.title }}</h2>
                    <g-date-chip [iso]="e.starts_at" />
                  </div>
                  <div class="row-wrap meta">
                    <span class="t-caption muted row"><g-icon name="pin" [size]="14" /> {{ e.city }}</span>
                    <span class="t-caption muted row"><g-icon name="globe" [size]="14" /> {{ zoneShort(e) }}</span>
                  </div>
                  @if (e.state === 'registration_closed') {
                    <span class="pill pill-neutral">Registration closed</span>
                  } @else if (e.remaining === 0) {
                    <span class="t-caption muted">Waiting list open</span>
                  } @else {
                    <span class="t-caption seats">{{ e.remaining }} of {{ e.capacity }} seats left</span>
                  }
                </div>
              </a>
            </li>
          }
        </ul>

        <nav class="pager spread" aria-label="Pages">
          <button class="btn btn-secondary btn-sm" (click)="prev()" [disabled]="offset() === 0">Previous</button>
          <span class="t-caption">Showing {{ events().length }} of {{ total() }}</span>
          <button class="btn btn-secondary btn-sm" (click)="next()" [disabled]="offset() + limit() >= total()">Next</button>
        </nav>
      }
    </div>
  `,
  imports: [RouterLink, Cover, Icon, DateChip],
  styles: [`
    :host { display: block; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 24px; }
    .filters { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .filters .field { min-width: 160px; margin: 0; }
    .grow { flex: 1; }
    .clear { margin-bottom: 4px; }
    .results { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 1579px) { .results { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 483px) { .results { grid-template-columns: 1fr; } }
    .result { padding: 12px; display: flex; flex-direction: column; gap: 12px; text-decoration: none; color: inherit; }
    @media (hover: hover) { .result:hover { box-shadow: var(--shadow-1); } }
    .title { font-size: 14px; line-height: 21px; font-weight: 500; }
    .result-body { display: flex; flex-direction: column; gap: 8px; }
    .meta { gap: 12px; }
    .seats { color: var(--green); font-weight: 500; }
    .pager { border-top: 1px solid var(--divider); padding-top: 16px; }
    @media (max-width: 649px) { .filters { flex-direction: column; align-items: stretch; } }
  `],
})
export class DiscoverPage {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  categories = CATEGORIES;
  events = signal<EventSummary[]>([]);
  total = signal(0);
  loading = signal(true);
  limit = signal(20);
  offset = signal(0);

  category = signal('');
  city = signal('');
  q = signal('');

  hasFilters = computed(() => Boolean(this.category() || this.city() || this.q()));

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      this.offset.set(Number(params.get('offset') ?? 0) || 0);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.events({
      category: this.category() || undefined,
      city: this.city() || undefined,
      q: this.q() || undefined,
      limit: this.limit(),
      offset: this.offset(),
    }).subscribe({
      next: (res) => {
        this.events.set(res.body ?? []);
        this.total.set(Number(res.headers.get('X-Total-Count') ?? 0));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setQuery(key: 'category' | 'city' | 'q' | 'offset', value: string | number): void {
    const v = String(value ?? '');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: v === '0' && key === 'offset' ? null : (v || null) },
      queryParamsHandling: 'merge',
    });
  }

  clear(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  prev(): void {
    this.setQuery('offset', Math.max(0, this.offset() - this.limit()));
  }

  next(): void {
    this.setQuery('offset', this.offset() + this.limit());
  }

  zoneShort(e: EventSummary): string {
    return e.time_zone.split('/').pop() ?? e.time_zone;
  }
}

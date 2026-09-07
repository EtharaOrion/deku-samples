import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { CATEGORIES, categoryLabel } from '../categories';
import { CoverComponent } from '../ui/cover.component';
import { TopbarComponent } from '../ui/topbar.component';
import { TimeService } from '../time.service';
import type { CommunityEvent } from '../types';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [RouterLink, CoverComponent, TopbarComponent],
  template: `
    <div class="page">
      <app-topbar></app-topbar>
      <main class="content" role="main">
        <h1 class="screen-title">Discover Events</h1>
        <form class="filters" role="search" (submit)="$event.preventDefault()">
          <div class="field">
            <label for="f-category">Category</label>
            <select id="f-category" [value]="filters().category ?? ''" (change)="setFilter('category', $any($event.target).value)">
              <option value="">All categories</option>
              @for (cat of categories; track cat.slug) {
                <option [value]="cat.slug">{{ cat.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="f-city">City</label>
            <input id="f-city" type="text" placeholder="City" [value]="filters().city ?? ''"
                   (input)="setFilter('city', $any($event.target).value)" />
          </div>
          <div class="field grow">
            <label for="f-q">Search</label>
            <input id="f-q" type="search" placeholder="Search events" [value]="filters().q ?? ''"
                   (input)="setFilter('q', $any($event.target).value)" />
          </div>
          @if (hasFilters()) {
            <button type="button" class="btn quiet small clear" (click)="clearFilters()">Clear Filters</button>
          }
        </form>

        @if (loading()) {
          <ul class="results grid three" aria-busy="true">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <li class="card result-card">
                <div class="skeleton" style="aspect-ratio: 16/9"></div>
                <div class="card-body">
                  <div class="skeleton line" style="width: 70%"></div>
                  <div class="skeleton line" style="width: 40%"></div>
                </div>
              </li>
            }
          </ul>
        } @else if (rows().length === 0) {
          <div class="empty card big">
            <h2 class="modal-title">No Events Found</h2>
            <p class="caption">Try a wider date range or a different category.</p>
            <button type="button" class="btn secondary" (click)="clearFilters()">Clear Filters</button>
          </div>
        } @else {
          <ul class="results grid three">
            @for (ev of rows(); track ev.slug) {
              <li>
                <a class="card result-card lift-hover" [routerLink]="['/', ev.slug]">
                  <app-cover [seed]="ev.cover_seed" [showTitle]="false" [rounded]="true"></app-cover>
                  <div class="card-body">
                    <p class="result-title">{{ ev.title }}</p>
                    <div class="result-meta">
                      <span class="date-chip" aria-hidden="true">
                        <span class="month">{{ month(ev) }}</span>
                        <span class="day">{{ day(ev) }}</span>
                      </span>
                      <span class="caption">{{ ev.city }}</span>
                      @if (ev.state === 'registration_closed') {
                        <span class="pill neutral">Registration Closed</span>
                      } @else {
                        <span class="caption seats">{{ seatsLine(ev) }}</span>
                      }
                    </div>
                  </div>
                </a>
              </li>
            }
          </ul>
          <nav class="pager" aria-label="Pages">
            <button type="button" class="btn secondary small" (click)="prevPage()" [disabled]="page() === 0">Previous</button>
            <span class="pager-count">Showing {{ shown() }} of {{ total() }}</span>
            <button type="button" class="btn secondary small" (click)="nextPage()" [disabled]="!hasNext()">Next</button>
          </nav>
        }
      </main>
    </div>
  `,
  styles: [
    `
    .page { min-height: 100vh; padding-top: 64px; }
    .content { max-width: 1080px; margin: 0 auto; padding: 32px 24px 80px; }
    .filters { display: grid; grid-template-columns: 180px 180px 1fr auto; gap: 12px; align-items: end; margin-top: 24px; }
    .filters .grow { grid-column: span 1; }
    .clear { margin-bottom: 4px; }
    .results { list-style: none; margin: 24px 0 0; padding: 0; }
    .result-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; text-decoration: none; color: inherit; }
    .result-card app-cover { width: 100%; aspect-ratio: 16 / 9; }
    .card-body { display: flex; flex-direction: column; gap: 8px; }
    .result-title { margin: 0; font-size: 14px; line-height: 21px; font-weight: 500; }
    .result-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .seats { color: var(--muted); }
    .date-chip {
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 8px; background: var(--ink-5); line-height: 1;
    }
    .date-chip .month { font-size: 11px; line-height: 14px; font-weight: 600; text-transform: uppercase; }
    .date-chip .day { font-size: 13px; font-weight: 600; }
    .empty { margin-top: 24px; padding: 48px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
    .pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 32px; }
    .pager-count { font-size: 14px; color: var(--ink-2); }
    @media (max-width: 999px) { .filters { grid-template-columns: 1fr 1fr; } .filters .grow { grid-column: span 2; } }
    @media (max-width: 649px) { .filters { grid-template-columns: 1fr; } .filters .grow { grid-column: span 1; } }
    @media (max-width: 483px) { .content { padding: 24px 16px 80px; } }
  `],
})
export class DiscoverComponent implements OnInit, OnDestroy {
  readonly categories = CATEGORIES;
  rows = signal<CommunityEvent[]>([]);
  total = signal(0);
  page = signal(0);
  loading = signal(true);
  filters = signal<{ category?: string; city?: string; q?: string }>({});

  private sub: { unsubscribe: () => void } | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router, private time: TimeService) {}

  ngOnInit() {
    this.sub = this.route.queryParams.subscribe((params) => {
      const next: { category?: string; city?: string; q?: string } = {};
      if (params['category']) next.category = params['category'];
      if (params['city']) next.city = params['city'];
      if (params['q']) next.q = params['q'];
      const page = Number(params['page'] ?? 0);
      this.filters.set(next);
      this.page.set(Number.isFinite(page) && page > 0 ? Math.floor(page) : 0);
      this.load();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  private load() {
    this.loading.set(true);
    const f = this.filters();
    this.api
      .events({ ...f, limit: PAGE_SIZE, offset: this.page() * PAGE_SIZE })
      .then((res) => {
        this.rows.set(res.rows);
        this.total.set(res.total);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  setFilter(key: 'category' | 'city' | 'q', value: string) {
    const params: Record<string, string | undefined> = { ...this.route.snapshot.queryParams };
    const trimmed = value.trim();
    if (trimmed) params[key] = value;
    else delete params[key];
    params['page'] = undefined;
    // The address is the state: every control writes through the query string.
    if (key === 'q') {
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.router.navigate([], { queryParams: this.clean(params) }), 250);
    } else {
      this.router.navigate([], { queryParams: this.clean(params) });
    }
  }

  private clean(params: Record<string, string | undefined>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v) out[k] = v;
    return out;
  }

  clearFilters() {
    this.router.navigate([], { queryParams: {} });
  }

  hasFilters(): boolean {
    const f = this.filters();
    return Boolean(f.category || f.city || f.q);
  }

  prevPage() {
    const p = Math.max(0, this.page() - 1);
    this.router.navigate([], { queryParams: { ...this.clean({ ...this.route.snapshot.queryParams }), page: p === 0 ? undefined : String(p) } });
  }

  nextPage() {
    const p = this.page() + 1;
    this.router.navigate([], { queryParams: { ...this.clean({ ...this.route.snapshot.queryParams }), page: String(p) } });
  }

  hasNext(): boolean {
    return (this.page() + 1) * PAGE_SIZE < this.total();
  }

  shown(): number {
    return this.rows().length;
  }

  month(ev: CommunityEvent): string {
    return this.time.shortDate(ev.starts_at, ev.time_zone).month;
  }

  day(ev: CommunityEvent): string {
    return this.time.shortDate(ev.starts_at, ev.time_zone).day;
  }

  seatsLine(ev: CommunityEvent): string {
    if (ev.remaining === 0) return 'Full';
    if (ev.remaining === 1) return '1 seat left';
    return `${ev.remaining} seats left`;
  }

  label(slug: string): string {
    return categoryLabel(slug);
  }
}

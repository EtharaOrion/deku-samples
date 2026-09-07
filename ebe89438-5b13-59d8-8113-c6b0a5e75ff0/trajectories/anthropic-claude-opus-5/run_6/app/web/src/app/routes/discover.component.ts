import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';
import { EventCardComponent } from '../ui/event-card.component';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, EventSummary } from '../core/models';

/**
 * Every filtered view is an address: each control writes its value into the
 * query string and reads it back on load, so a reload, a shared link and the
 * back button each restore exactly the list that was on screen.
 */
@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [FormsModule, RouterLink, PublicBarComponent, EventCardComponent],
  template: `
    <app-public-bar />
    <main id="main" class="page">
      <h1 class="t-screen-title">Discover Events</h1>

      <div class="filters" role="search">
        <label class="f">
          <span class="sr-only">Category</span>
          <select class="control" [ngModel]="category()" (ngModelChange)="setFilter('category', $event)"
                  aria-label="Category">
            <option value="">All categories</option>
            @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
          </select>
        </label>
        <label class="f">
          <span class="sr-only">City</span>
          <input class="control" type="text" placeholder="City" [ngModel]="city()"
                 (ngModelChange)="setFilter('city', $event)" aria-label="City" />
        </label>
        <label class="f grow">
          <span class="sr-only">Search events</span>
          <input class="control" type="search" placeholder="Search events" [ngModel]="q()"
                 (ngModelChange)="setFilter('q', $event)" aria-label="Search events" />
        </label>
        @if (hasFilters()) {
          <button type="button" class="btn btn-quiet btn-sm" (click)="clearFilters()">Clear Filters</button>
        }
      </div>

      @if (loading()) {
        <ul class="results">
          @for (i of [1,2,3,4,5,6]; track i) {
            <li class="card"><div class="skeleton skeleton-tile"></div>
              <div class="skeleton skeleton-text" style="margin-top:12px"></div>
              <div class="skeleton skeleton-text" style="width:50%"></div></li>
          }
        </ul>
      } @else if (events().length === 0) {
        <div class="empty">
          <h2>No Events Found</h2>
          <p>Try a wider date range or a different category.</p>
          <button type="button" class="btn btn-primary" (click)="clearFilters()">Clear Filters</button>
        </div>
      } @else {
        <ul class="results">
          @for (e of events(); track e.slug) { <li><app-event-card [event]="e" /></li> }
        </ul>
        <nav class="pager" aria-label="Pagination">
          <span class="t-caption">Showing {{ events().length }} of {{ total() }}</span>
          <div class="row" style="gap:8px">
            <button type="button" class="btn btn-primary btn-sm" [disabled]="offset() === 0"
                    (click)="page(-1)">Previous</button>
            <button type="button" class="btn btn-primary btn-sm"
                    [disabled]="offset() + events().length >= total()" (click)="page(1)">Next</button>
          </div>
        </nav>
      }
    </main>
  `,
  styles: [`
    main { padding-top: 96px; padding-bottom: 64px; }
    h1 { margin-bottom: 24px; }
    .filters { display: flex; gap: 12px; align-items: center; margin-bottom: 32px; flex-wrap: wrap; }
    .f { flex: 0 1 220px; } .f.grow { flex: 1 1 260px; }
    .results { display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
    @media (min-width: 1580px) { .results { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 483px) { .results { grid-template-columns: 1fr; } }
    @media (max-width: 649px) { .filters { flex-wrap: wrap; } .f { flex: 1 1 100%; } }
    .pager { display: flex; align-items: center; justify-content: space-between; margin-top: 32px; gap: 16px; flex-wrap: wrap; }
  `],
})
export class DiscoverComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  categories = CATEGORIES;
  label = (c: string) => CATEGORY_LABELS[c];

  events = signal<EventSummary[]>([]);
  total = signal(0);
  loading = signal(true);
  category = signal('');
  city = signal('');
  q = signal('');
  offset = signal(0);
  limit = 20;

  private debounce?: any;

  ngOnInit() {
    // the address is the state: every load reads the query string back
    this.route.queryParamMap.subscribe((p) => {
      this.category.set(p.get('category') || '');
      this.city.set(p.get('city') || '');
      this.q.set(p.get('q') || '');
      this.offset.set(Math.max(0, Number(p.get('offset') || 0)));
      this.fetch();
    });
  }

  hasFilters() { return !!(this.category() || this.city() || this.q()); }

  private fetch() {
    this.loading.set(true);
    this.api.listEvents({
      category: this.category(), city: this.city(), q: this.q(),
      limit: this.limit, offset: this.offset(),
    }).subscribe({
      next: ({ events, total }) => { this.events.set(events); this.total.set(total); this.loading.set(false); },
      error: () => { this.events.set([]); this.total.set(0); this.loading.set(false); },
    });
  }

  setFilter(key: 'category' | 'city' | 'q', value: string) {
    if (key === 'category') this.category.set(value);
    if (key === 'city') this.city.set(value);
    if (key === 'q') this.q.set(value);
    clearTimeout(this.debounce);
    const write = () => this.writeUrl(0);
    if (key === 'category') write(); else this.debounce = setTimeout(write, 300);
  }

  clearFilters() {
    this.category.set(''); this.city.set(''); this.q.set('');
    this.writeUrl(0);
  }

  page(dir: number) {
    this.writeUrl(Math.max(0, this.offset() + dir * this.limit));
  }

  private writeUrl(offset: number) {
    const qp: Record<string, string | null> = {
      category: this.category() || null,
      city: this.city() || null,
      q: this.q() || null,
      offset: offset ? String(offset) : null,
    };
    this.router.navigate([], { relativeTo: this.route, queryParams: qp, queryParamsHandling: '' });
  }
}

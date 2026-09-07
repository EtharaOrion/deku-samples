import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, EventSummary } from '../models';
import { TopBarComponent } from '../shared/top-bar.component';
import { EventCardComponent } from '../shared/event-card.component';
import { EmptyStateComponent, SkeletonComponent } from '../shared/ui.components';
import { clearTheme } from '../core/theme';

const PAGE_SIZE = 20;

/**
 * Every filtered view is an address: each control writes its value into the
 * query string on change and reads it back on load, so a reload, a shared link
 * and the back button each restore exactly the list that was on screen.
 */
@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    FormsModule, TopBarComponent, EventCardComponent, EmptyStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main id="main" class="container page" role="main">
      <h1 class="screen-title">Discover Events</h1>

      <div class="filters" role="search">
        <label class="f-item">
          <span class="visually-hidden">Category</span>
          <select class="field-input" [ngModel]="category()" (ngModelChange)="setCategory($event)"
                  name="category" aria-label="Category">
            <option value="">All categories</option>
            @for (c of categories; track c) {
              <option [value]="c">{{ label(c) }}</option>
            }
          </select>
        </label>
        <label class="f-item">
          <span class="visually-hidden">City</span>
          <input class="field-input" type="text" placeholder="City" aria-label="City"
                 [ngModel]="city()" (ngModelChange)="setCity($event)" name="city" />
        </label>
        <label class="f-item grow">
          <span class="visually-hidden">Search events</span>
          <input class="field-input" type="search" placeholder="Search events"
                 aria-label="Search events"
                 [ngModel]="q()" (ngModelChange)="setQ($event)" name="q" />
        </label>
        @if (anyFilter()) {
          <button type="button" class="btn btn-text" (click)="clearFilters()">Clear Filters</button>
        }
      </div>

      @if (loading()) {
        <ul class="grid">
          @for (i of [1,2,3,4,5,6]; track i) {
            <li><app-skeleton w="100%" h="260px" radius="12px" /></li>
          }
        </ul>
      } @else if (items().length === 0) {
        <app-empty-state
          heading="No Events Found"
          body="Try a wider date range or a different category."
          actionLabel="Clear Filters"
          (action)="clearFilters()" />
      } @else {
        <ul class="grid">
          @for (ev of items(); track ev.slug) {
            <li><app-event-card [ev]="ev" /></li>
          }
        </ul>

        <nav class="pager" aria-label="Pagination">
          <button type="button" class="btn btn-secondary btn-sm"
                  [disabled]="offset() === 0" (click)="page(-1)">Previous</button>
          <span class="showing caption">Showing {{ items().length }} of {{ total() }}</span>
          <button type="button" class="btn btn-secondary btn-sm"
                  [disabled]="offset() + items().length >= total()" (click)="page(1)">Next</button>
        </nav>
      }
    </main>
  `,
  styles: [`
    .page { padding: 112px var(--s5) var(--s8); max-width: 1080px; }
    h1 { margin-bottom: var(--s5); }
    .filters {
      display: flex; gap: var(--s3); align-items: center;
      margin-bottom: var(--s5); flex-wrap: wrap;
    }
    .f-item { display: block; min-width: 160px; }
    .grow { flex: 1; min-width: 200px; }
    @media (max-width: 649px) { .filters { gap: var(--s2); } .f-item { min-width: 140px; } }

    .grid { display: grid; grid-template-columns: 1fr; gap: var(--s4); }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1580px) { .grid { grid-template-columns: repeat(3, 1fr); } }

    .pager { display: flex; align-items: center; justify-content: center;
      gap: var(--s4); margin-top: var(--s6); }
    .showing { color: var(--ink-secondary); }
  `],
})
export class DiscoverComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  categories = CATEGORIES;
  items = signal<EventSummary[]>([]);
  total = signal(0);
  loading = signal(true);

  category = signal('');
  city = signal('');
  q = signal('');
  offset = signal(0);

  label(c: string) { return CATEGORY_LABELS[c] ?? c; }
  anyFilter() { return !!(this.category() || this.city() || this.q()); }

  ngOnInit() {
    clearTheme();
    // The address is the state: read it back on every navigation.
    this.route.queryParamMap.subscribe((p) => {
      this.category.set(p.get('category') ?? '');
      this.city.set(p.get('city') ?? '');
      this.q.set(p.get('q') ?? '');
      this.offset.set(Number(p.get('offset') ?? 0) || 0);
      this.fetch();
    });
  }

  private fetch() {
    this.loading.set(true);
    this.api.listEvents({
      category: this.category(), city: this.city(), q: this.q(),
      limit: PAGE_SIZE, offset: this.offset(),
    }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.total.set(0);
        this.loading.set(false);
      },
    });
  }

  /** Every control writes into the query string rather than into memory. */
  private write(patch: Record<string, string | null>, resetOffset = true) {
    const queryParams: Record<string, string | null> = { ...patch };
    if (resetOffset) queryParams['offset'] = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  setCategory(v: string) { this.write({ category: v || null }); }
  setCity(v: string) { this.write({ city: v || null }); }

  private qTimer: any = null;
  setQ(v: string) {
    this.q.set(v);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => this.write({ q: v.trim() || null }), 250);
  }

  clearFilters() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  page(dir: number) {
    const next = Math.max(0, this.offset() + dir * PAGE_SIZE);
    this.write({ offset: next ? String(next) : null }, false);
  }
}

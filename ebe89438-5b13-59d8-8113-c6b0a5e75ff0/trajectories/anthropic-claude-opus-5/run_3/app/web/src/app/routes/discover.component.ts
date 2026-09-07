import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, type EventSummary } from '../core/models';
import { PublicBarComponent } from '../layout/public-bar.component';
import { EventCardComponent } from '../shared/event-card.component';

const PAGE_SIZE = 20;

/**
 * Every filtered view is an address: the filters live in the query string, so
 * the same URL shows a second visitor the same list and the browser's back
 * button restores the previous list. Nothing is held in memory alone.
 */
@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [PublicBarComponent, EventCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main class="discover">
      <div class="page">
        <h1 class="t-screen-title">Discover Events</h1>

        <div class="filter-bar" role="search">
          <div class="field">
            <label for="category">Category</label>
            <select id="category" (change)="setFilter('category', asValue($event))">
              <option value="" [selected]="category() === ''">All categories</option>
              @for (c of categories; track c) {
                <option [value]="c" [selected]="c === category()">{{ labelFor(c) }}</option>
              }
            </select>
          </div>

          <div class="field">
            <label for="city">City</label>
            <input id="city" type="text" [value]="city()" placeholder="Any city" (change)="setFilter('city', asValue($event))" />
          </div>

          <div class="field grow">
            <label for="q">Search</label>
            <input id="q" type="search" [value]="q()" placeholder="Search events" (change)="setFilter('q', asValue($event))" />
          </div>

          @if (hasFilters()) {
            <button type="button" class="btn btn-sm clear" (click)="clearFilters()">Clear Filters</button>
          }
        </div>

        @if (loading()) {
          <ul class="results">
            @for (n of [1, 2, 3, 4, 5, 6]; track n) {
              <li>
                <div class="skeleton" style="aspect-ratio: 1; border-radius: 12px"></div>
                <div class="skeleton" style="height: 21px; margin-top: 12px; width: 70%"></div>
                <div class="skeleton" style="height: 16px; margin-top: 8px; width: 45%"></div>
              </li>
            }
          </ul>
        } @else if (events().length === 0) {
          <div class="empty-state">
            <h2>No Events Found</h2>
            <p>Try a wider date range or a different category.</p>
            <button type="button" class="btn btn-primary btn-pill" (click)="clearFilters()">Clear Filters</button>
          </div>
        } @else {
          <ul class="results">
            @for (event of events(); track event.slug) {
              <li><app-event-card [event]="event" /></li>
            }
          </ul>

          <nav class="pager" aria-label="Pagination">
            <span class="t-caption">Showing {{ events().length }} of {{ total() }}</span>
            <div class="pager-controls">
              <button type="button" class="btn btn-sm" [disabled]="offset() === 0" (click)="page(-1)">Previous</button>
              <button type="button" class="btn btn-sm" [disabled]="!hasNext()" (click)="page(1)">Next</button>
            </div>
          </nav>
        }
      </div>
    </main>
  `,
  styles: [
    `
      .discover {
        padding: 96px 0 96px;
        min-height: 100vh;
      }

      h1 {
        margin-bottom: 24px;
      }

      .filter-bar {
        display: flex;
        gap: 12px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-bottom: 32px;
      }

      .field {
        min-width: 180px;
      }

      .grow {
        flex: 1;
        min-width: 220px;
      }

      .clear {
        min-height: 44px;
      }

      .results {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }

      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid var(--divider);
        color: var(--muted);
        flex-wrap: wrap;
      }

      .pager-controls {
        display: flex;
        gap: 8px;
      }

      @media (min-width: 484px) {
        .results { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      @media (min-width: 1580px) {
        .results { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }

      /* The filter bar is one row at 1000px and above and wraps to two rows
         below 650px. */
      @media (max-width: 649px) {
        .filter-bar { gap: 8px; }
        .field { min-width: calc(50% - 4px); }
      }
    `,
  ],
})
export class DiscoverComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly categories = CATEGORIES;
  readonly events = signal<EventSummary[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);

  readonly category = signal('');
  readonly city = signal('');
  readonly q = signal('');
  readonly offset = signal(0);

  readonly hasFilters = computed(() => !!(this.category() || this.city() || this.q()));
  readonly hasNext = computed(() => this.offset() + this.events().length < this.total());

  ngOnInit() {
    // Every control reads its value back from the query string on load, so a
    // reload, a shared link and the back button each restore the same list.
    this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      this.offset.set(Math.max(0, Number(params.get('offset') ?? 0) || 0));
      this.load();
    });
  }

  private load() {
    this.loading.set(true);
    this.api
      .events({
        category: this.category() || undefined,
        city: this.city() || undefined,
        q: this.q() || undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      })
      .subscribe({
        next: (page) => {
          this.events.set(page.events);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: () => {
          this.events.set([]);
          this.total.set(0);
          this.loading.set(false);
        },
      });
  }

  asValue(event: Event) {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /** Every control writes its value into the query string on change. */
  setFilter(key: 'category' | 'city' | 'q', value: string) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value || null, offset: null },
      queryParamsHandling: 'merge',
    });
  }

  clearFilters() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  page(direction: 1 | -1) {
    const next = Math.max(0, this.offset() + direction * PAGE_SIZE);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { offset: next || null },
      queryParamsHandling: 'merge',
    });
  }

  labelFor(category: string) {
    return CATEGORY_LABELS[category] ?? category;
  }
}

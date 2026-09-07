import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Api } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, type EventSummary } from '../core/models';
import { PublicBar } from '../ui/chrome';
import { EventCard } from '../ui/shared';

const PAGE_SIZE = 20;

/**
 * Every control writes its value into the query string on change and reads it
 * back on load, so the address is the state and nothing is held in memory
 * alone: a reload, a shared link and the back button restore the same list.
 */
@Component({
  selector: 'app-discover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicBar, EventCard],
  template: `
    <app-public-bar />
    <main id="main" class="page wrap">
      <h1 class="t-screen-title">Discover Events</h1>

      <form class="filters" role="search" (submit)="$event.preventDefault()">
        <div class="filter">
          <label class="field-label" for="f-cat">Category</label>
          <select id="f-cat" class="field-control" (change)="setParam('category', asValue($event))">
            <option value="" [selected]="category() === ''">All categories</option>
            @for (c of categories; track c) {
              <option [value]="c" [selected]="category() === c">{{ label(c) }}</option>
            }
          </select>
        </div>
        <div class="filter">
          <label class="field-label" for="f-city">City</label>
          <input
            id="f-city"
            class="field-control"
            type="text"
            [value]="city()"
            placeholder="Any city"
            (change)="setParam('city', asValue($event))"
          />
        </div>
        <div class="filter">
          <label class="field-label" for="f-q">Search</label>
          <input
            id="f-q"
            class="field-control"
            type="search"
            [value]="q()"
            placeholder="Search events"
            (change)="setParam('q', asValue($event))"
          />
        </div>
        @if (anyFilter()) {
          <button type="button" class="btn btn-text clear" (click)="clearFilters()">Clear Filters</button>
        }
      </form>

      @if (loading()) {
        <ul class="grid" aria-busy="true">
          @for (n of [1, 2, 3, 4, 5, 6]; track n) {
            <li><div class="sk sk-card" style="height: 280px"></div></li>
          }
        </ul>
      } @else if (events().length) {
        <ul class="grid">
          @for (e of events(); track e.slug) {
            <li><app-event-card [event]="e" /></li>
          }
        </ul>
        <nav class="pager" aria-label="Pagination">
          <span class="t-caption">Showing {{ events().length }} of {{ total() }}</span>
          <span class="pager-controls">
            <button type="button" class="btn btn-sm" [disabled]="offset() === 0" (click)="page(-1)">
              Previous
            </button>
            <button
              type="button"
              class="btn btn-sm"
              [disabled]="offset() + events().length >= total()"
              (click)="page(1)"
            >
              Next
            </button>
          </span>
        </nav>
      } @else {
        <div class="empty">
          <h2>No Events Found</h2>
          <p>Try a wider date range or a different category.</p>
          <button type="button" class="btn btn-primary" (click)="clearFilters()">Clear Filters</button>
        </div>
      }
    </main>
  `,
  styles: [
    `
      .wrap {
        padding-top: calc(64px + var(--s7));
        padding-bottom: var(--s8);
      }
      h1 {
        margin-bottom: var(--s5);
      }
      .filters {
        display: flex;
        gap: var(--s3);
        align-items: flex-end;
        flex-wrap: wrap;
        margin-bottom: var(--s5);
      }
      .filter {
        flex: 1 1 200px;
        min-width: 160px;
      }
      .field-label {
        margin-bottom: var(--s1);
      }
      .clear {
        min-height: 44px;
      }
      .grid {
        display: grid;
        gap: var(--s4);
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1580px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (max-width: 649px) {
        .filters {
          gap: var(--s2);
        }
        .filter {
          flex: 1 1 45%;
        }
      }
      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        margin-top: var(--s6);
        flex-wrap: wrap;
        color: var(--ink-secondary);
      }
      .pager-controls {
        display: flex;
        gap: var(--s2);
      }
    `,
  ],
})
export class DiscoverRoute {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly categories = CATEGORIES;
  readonly loading = signal(true);
  readonly events = signal<EventSummary[]>([]);
  readonly total = signal(0);

  readonly category = signal('');
  readonly city = signal('');
  readonly q = signal('');
  readonly offset = signal(0);

  readonly anyFilter = computed(() => !!(this.category() || this.city() || this.q()));

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      this.offset.set(Number(params.get('offset') ?? 0) || 0);
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

  asValue(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement).value.trim();
  }

  setParam(key: string, value: string) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value || null, offset: null },
      queryParamsHandling: 'merge',
    });
  }

  clearFilters() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  page(direction: number) {
    const next = Math.max(0, this.offset() + direction * PAGE_SIZE);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { offset: next || null },
      queryParamsHandling: 'merge',
    });
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }
}

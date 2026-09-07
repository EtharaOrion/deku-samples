import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { CATEGORIES, CATEGORY_LABELS, type EventSummary } from '../core/models';
import { PublicBarComponent } from '../ui/public-bar.component';
import { EventCardComponent } from '../ui/event-card.component';
import { EmptyStateComponent } from '../ui/bits';

const PAGE_SIZE = 20;

/**
 * Every filtered view is an address: each control writes its value into the
 * query string on change and reads it back on load, so a reload, a shared link
 * and the browser's back button each restore exactly the list that was on
 * screen. Nothing is held in memory alone.
 */
@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [FormsModule, PublicBarComponent, EventCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main id="main" class="page wrap">
      <h1 class="head">Discover events</h1>

      <form class="filters" role="search" (ngSubmit)="$event.preventDefault()">
        <div class="field filters__cell">
          <label class="field__label" for="filter-category">Category</label>
          <select
            id="filter-category"
            class="input"
            [ngModel]="category()"
            name="category"
            (ngModelChange)="setFilter('category', $event)"
          >
            <option value="">All categories</option>
            @for (c of categories; track c) {
              <option [value]="c">{{ label(c) }}</option>
            }
          </select>
        </div>

        <div class="field filters__cell">
          <label class="field__label" for="filter-city">City</label>
          <input
            id="filter-city"
            class="input"
            name="city"
            [ngModel]="city()"
            (ngModelChange)="onCity($event)"
            placeholder="Any city"
          />
        </div>

        <div class="field filters__cell">
          <label class="field__label" for="filter-q">Search</label>
          <input
            id="filter-q"
            class="input"
            name="q"
            [ngModel]="q()"
            (ngModelChange)="onQ($event)"
            placeholder="Search events"
          />
        </div>

        @if (anyFilter()) {
          <button type="button" class="btn btn--text filters__clear" (click)="clear()">
            Clear Filters
          </button>
        }
      </form>

      @if (loading()) {
        <ul class="grid" aria-busy="true">
          @for (n of skeletonRows; track n) {
            <li><div class="skeleton skeleton--card card-skeleton"></div></li>
          }
        </ul>
      } @else if (events().length === 0) {
        <app-empty-state
          title="No Events Found"
          body="Try a wider date range or a different category."
          actionLabel="Clear Filters"
          (action)="clear()"
        />
      } @else {
        <ul class="grid">
          @for (e of events(); track e.slug) {
            <li><app-event-card [event]="e" /></li>
          }
        </ul>

        <nav class="pager" aria-label="Pages of results">
          <p class="t-caption pager__count">Showing {{ events().length }} of {{ total() }}</p>
          <div class="pager__controls">
            <button
              type="button"
              class="btn btn--sm"
              [disabled]="offset() === 0"
              (click)="page(-1)"
            >
              Previous
            </button>
            <button
              type="button"
              class="btn btn--sm"
              [disabled]="offset() + events().length >= total()"
              (click)="page(1)"
            >
              Next
            </button>
          </div>
        </nav>
      }
    </main>
  `,
  styles: [
    `
      .wrap {
        padding-top: 96px;
        padding-bottom: var(--s8);
        display: flex;
        flex-direction: column;
        gap: var(--s5);
      }
      .head { font-family: var(--serif); font-weight: 400; font-size: 36px; line-height: 42px; }

      .filters {
        display: flex;
        gap: var(--s3);
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .filters__cell { flex: 1 1 200px; min-width: 160px; }
      .filters__clear { flex: none; min-height: 44px; }
      @media (max-width: 649px) {
        .filters { flex-wrap: wrap; }
        .filters__cell { flex: 1 1 45%; }
      }

      .grid { display: grid; gap: var(--s4); grid-template-columns: 1fr; }
      @media (min-width: 484px) {
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (min-width: 1580px) {
        .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      .card-skeleton { height: 340px; }

      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        flex-wrap: wrap;
        padding-top: var(--s3);
        border-top: 1px solid var(--divider);
      }
      .pager__count { color: var(--ink-64); }
      .pager__controls { display: flex; gap: var(--s2); }
    `,
  ],
})
export class DiscoverPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private theme = inject(ThemeService);

  readonly categories = CATEGORIES;
  readonly skeletonRows = [1, 2, 3, 4, 5, 6];

  readonly category = signal('');
  readonly city = signal('');
  readonly q = signal('');
  readonly offset = signal(0);

  readonly events = signal<EventSummary[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);

  readonly anyFilter = computed(() => !!(this.category() || this.city().trim() || this.q().trim()));

  private sub: Subscription | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private lastKey = '';

  ngOnInit(): void {
    this.theme.clear();
    // The address is the state: every load reads the query string back.
    this.sub = this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      const offset = Number(params.get('offset') ?? '0');
      this.offset.set(Number.isFinite(offset) && offset >= 0 ? offset : 0);
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.debounce) clearTimeout(this.debounce);
  }

  label(name: string): string {
    return CATEGORY_LABELS[name] ?? name;
  }

  setFilter(key: 'category' | 'city' | 'q', value: string): void {
    this.write({ [key]: value || null, offset: null });
  }

  onCity(value: string): void {
    this.city.set(value);
    this.debounced(() => this.write({ city: value || null, offset: null }));
  }

  onQ(value: string): void {
    this.q.set(value);
    this.debounced(() => this.write({ q: value || null, offset: null }));
  }

  clear(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  page(direction: 1 | -1): void {
    const next = Math.max(0, this.offset() + direction * PAGE_SIZE);
    this.write({ offset: next === 0 ? null : String(next) });
  }

  private debounced(fn: () => void): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(fn, 260);
  }

  private write(patch: Record<string, string | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
  }

  /** No route paints twice for the same data. */
  private load(): void {
    const query = {
      category: this.category() || undefined,
      city: this.city().trim() || undefined,
      q: this.q().trim() || undefined,
      limit: PAGE_SIZE,
      offset: this.offset(),
    };
    const key = JSON.stringify(query);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.loading.set(true);
    this.api.events(query).subscribe({
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
}

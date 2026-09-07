import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, type EventSummary } from '../core/models';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';
import { EventCardComponent } from '../ui/event-card.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [FormsModule, PublicBarComponent, EventCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <div class="public-shell">
      <main id="main" class="page">
        <h1 class="t-screen-title">Discover Events</h1>

        <!-- Every control writes into the query string; the address is the state. -->
        <div class="filters" role="search">
          <div class="control">
            <label class="t-caption" for="f-category">Category</label>
            <select id="f-category" [ngModel]="category()" (ngModelChange)="setFilter('category', $event)">
              <option value="">All categories</option>
              @for (c of categories; track c) {
                <option [value]="c">{{ label(c) }}</option>
              }
            </select>
          </div>
          <div class="control">
            <label class="t-caption" for="f-city">City</label>
            <input id="f-city" type="text" [ngModel]="city()" (ngModelChange)="setFilterDebounced('city', $event)" placeholder="Any city" />
          </div>
          <div class="control grow">
            <label class="t-caption" for="f-q">Search</label>
            <input id="f-q" type="search" [ngModel]="q()" (ngModelChange)="setFilterDebounced('q', $event)" placeholder="Search events" />
          </div>
          @if (anyFilter()) {
            <button type="button" class="btn btn-text clear" (click)="clearFilters()">Clear Filters</button>
          }
        </div>

        @if (loading()) {
          <ul class="grid">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <li><div class="skeleton skeleton-card" style="height: 300px"></div></li>
            }
          </ul>
        } @else if (events().length === 0) {
          <div class="empty-state">
            <h2>No Events Found</h2>
            <p>Try a wider date range or a different category.</p>
            <button type="button" class="btn btn-primary btn-pill" (click)="clearFilters()">Clear Filters</button>
          </div>
        } @else {
          <ul class="grid">
            @for (e of events(); track e.slug) {
              <li><app-event-card [event]="e" /></li>
            }
          </ul>
          <nav class="pager" aria-label="Pagination">
            <button type="button" class="btn btn-sm" [disabled]="offset() === 0" (click)="page(-1)">Previous</button>
            <span class="t-caption count">Showing {{ events().length }} of {{ total() }}</span>
            <button type="button" class="btn btn-sm" [disabled]="offset() + events().length >= total()" (click)="page(1)">Next</button>
          </nav>
        }
      </main>
    </div>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .filters {
        display: flex;
        gap: var(--s3);
        align-items: flex-end;
        flex-wrap: wrap;
        margin-bottom: var(--s6);
      }
      .control {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        min-width: 160px;
      }
      .control.grow {
        flex: 1;
        min-width: 200px;
      }
      .control label {
        color: var(--ink-64);
        font-weight: 600;
      }
      .control input,
      .control select {
        min-height: 44px;
        padding: var(--s2) var(--s3);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }
      .clear {
        min-height: 44px;
        color: var(--blue);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s4);
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
        .control {
          min-width: calc(50% - var(--s2));
        }
      }
      .pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--s4);
        margin-top: var(--s6);
      }
      .count {
        color: var(--muted);
      }
    `,
  ],
})
export class DiscoverComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
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

  readonly anyFilter = computed(() => !!(this.category() || this.city().trim() || this.q().trim()));

  private sub?: Subscription;
  private debounce?: ReturnType<typeof setTimeout>;
  private lastKey = '';

  label(c: string) {
    return CATEGORY_LABELS[c];
  }

  ngOnInit(): void {
    clearTheme();
    if (!this.api.bootstrapped()) void this.api.loadMe();
    // The query string is read back on load and on every back-button restore.
    this.sub = this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      this.offset.set(Math.max(0, Number(params.get('offset') ?? '0') || 0));
      void this.load();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.debounce) clearTimeout(this.debounce);
  }

  private async load() {
    const key = JSON.stringify([this.category(), this.city(), this.q(), this.offset()]);
    if (key === this.lastKey) return; // no route paints twice for the same data
    this.lastKey = key;
    this.loading.set(true);
    try {
      const r = await this.api.listEvents({
        category: this.category() || undefined,
        city: this.city().trim() || undefined,
        q: this.q().trim() || undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      });
      this.events.set(r.events);
      this.total.set(r.total);
    } catch {
      this.events.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(key: 'category' | 'city' | 'q', value: string) {
    const params: Record<string, string | null> = { [key]: value || null, offset: null };
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }

  setFilterDebounced(key: 'city' | 'q', value: string) {
    if (key === 'city') this.city.set(value);
    else this.q.set(value);
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.setFilter(key, value), 260);
  }

  clearFilters() {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  page(direction: 1 | -1) {
    const next = Math.max(0, this.offset() + direction * PAGE_SIZE);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { offset: next || null },
      queryParamsHandling: 'merge',
    });
  }
}

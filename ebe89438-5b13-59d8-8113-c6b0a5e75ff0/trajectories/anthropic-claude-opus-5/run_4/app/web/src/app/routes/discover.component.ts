import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, EventSummary } from '../core/models';
import { EventCardComponent } from '../ui/event-card.component';
import { TopBarComponent } from '../ui/top-bar.component';

const PAGE = 20;

/**
 * Every control writes its value into the query string on change and reads it
 * back on load, so the address is the state and nothing is held in memory
 * alone: a reload, a shared link and the back button each restore exactly the
 * list that was on screen.
 */
@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [FormsModule, TopBarComponent, EventCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main class="page" id="main">
      <div class="col">
        <h1 class="t-serif title">Discover events</h1>

        <div class="filters" role="search">
          <div class="f">
            <label class="t-caption" for="cat">Category</label>
            <select id="cat" [ngModel]="category()" (ngModelChange)="setFilter('category', $event)">
              <option value="">All categories</option>
              @for (c of categories; track c) {
                <option [value]="c">{{ label(c) }}</option>
              }
            </select>
          </div>
          <div class="f">
            <label class="t-caption" for="city">City</label>
            <input id="city" [ngModel]="city()" (ngModelChange)="setFilterDebounced('city', $event)" placeholder="Any city" />
          </div>
          <div class="f grow">
            <label class="t-caption" for="q">Search</label>
            <input id="q" [ngModel]="q()" (ngModelChange)="setFilterDebounced('q', $event)" placeholder="Search events" />
          </div>
          @if (anyFilter()) {
            <button type="button" class="btn btn-text btn-sm clear" (click)="clearFilters()">Clear Filters</button>
          }
        </div>

        @if (loading()) {
          <ul class="grid">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <li>
                <div class="sk sk-card"></div>
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
          <ul class="grid">
            @for (e of events(); track e.slug) {
              <li><app-event-card [event]="e" /></li>
            }
          </ul>

          <nav class="pager" aria-label="Pages">
            <span class="t-caption showing">Showing {{ events().length }} of {{ total() }}</span>
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
      .page {
        padding: 96px var(--s5) var(--s8);
      }
      .col {
        max-width: 1080px;
        margin: 0 auto;
      }
      .title {
        font-size: 32px;
        line-height: 40px;
        margin-bottom: var(--s5);
      }
      .filters {
        display: flex;
        gap: var(--s3);
        align-items: flex-end;
        flex-wrap: wrap;
        margin-bottom: var(--s6);
      }
      .f {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 160px;
      }
      .f.grow {
        flex: 1;
        min-width: 200px;
      }
      .f label {
        color: var(--ink-64);
        font-weight: 600;
      }
      .f input,
      .f select {
        min-height: 44px;
        padding: 10px var(--s3);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }
      .clear {
        min-height: 44px;
      }
      .grid {
        display: grid;
        gap: var(--s5);
        grid-template-columns: 1fr;
      }
      .sk-card {
        height: 280px;
        border-radius: var(--r-card);
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
      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        margin-top: var(--s6);
        flex-wrap: wrap;
      }
      .showing {
        color: var(--muted);
      }
      .pager-controls {
        display: flex;
        gap: var(--s2);
      }
      @media (max-width: 649px) {
        .page {
          padding: 88px var(--s4) var(--s8);
        }
        .filters {
          gap: var(--s2);
        }
        .f,
        .f.grow {
          min-width: calc(50% - 8px);
        }
      }
    `,
  ],
})
export class DiscoverComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly categories = CATEGORIES;
  label = (c: string) => CATEGORY_LABELS[c] ?? c;

  readonly events = signal<EventSummary[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly category = signal('');
  readonly city = signal('');
  readonly q = signal('');
  readonly offset = signal(0);

  readonly anyFilter = computed(() => !!(this.category() || this.city().trim() || this.q().trim()));
  readonly hasNext = computed(() => this.offset() + this.events().length < this.total());

  private sub: Subscription | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private lastKey = '';

  ngOnInit() {
    this.sub = this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      this.offset.set(Math.max(0, Number(params.get('offset') ?? 0) || 0));
      void this.load();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.debounce) clearTimeout(this.debounce);
  }

  /** No route paints twice for the same data. */
  private async load() {
    const key = `${this.category()}|${this.city()}|${this.q()}|${this.offset()}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.loading.set(true);
    try {
      const page = await this.api.listEvents({
        category: this.category() || undefined,
        city: this.city().trim() || undefined,
        q: this.q().trim() || undefined,
        limit: PAGE,
        offset: this.offset(),
      });
      this.events.set(page.items);
      this.total.set(page.total);
    } catch {
      this.events.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(name: 'category' | 'city' | 'q', value: string) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [name]: value || null, offset: null },
      queryParamsHandling: 'merge',
    });
  }

  setFilterDebounced(name: 'city' | 'q', value: string) {
    if (name === 'city') this.city.set(value);
    else this.q.set(value);
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.setFilter(name, value), 260);
  }

  clearFilters() {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  page(direction: 1 | -1) {
    const next = Math.max(0, this.offset() + direction * PAGE);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { offset: next || null },
      queryParamsHandling: 'merge',
    });
  }
}

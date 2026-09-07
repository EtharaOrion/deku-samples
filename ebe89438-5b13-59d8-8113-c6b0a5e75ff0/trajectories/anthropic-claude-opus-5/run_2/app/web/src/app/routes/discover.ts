import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Api } from '../core/api';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EventSummary,
} from '../core/models';
import { ThemeService } from '../core/theme';
import { dayLabel, monthLabel } from '../core/time';
import { PublicBarComponent } from '../shell/public-bar';
import { CoverComponent } from '../ui/cover';
import { EmptyStateComponent, PillComponent, SkeletonComponent } from '../ui/kit';

const PAGE_SIZE = 20;

/**
 * Every filtered view is an address: the filters live in the query string, so
 * the same URL shows a second visitor the same list and the back button
 * restores the previous list. Nothing is held in memory alone.
 */
@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    CoverComponent,
    PillComponent,
    SkeletonComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!embedded()) {
      <app-public-bar></app-public-bar>
    }

    <main class="wrap" id="main" [class.embedded]="embedded()">
      <h1 class="screen-title">Discover Events</h1>

      <div class="filters" role="search">
        <div class="filter">
          <label class="field-label" for="f-category">Category</label>
          <select
            id="f-category"
            class="field-input"
            (change)="setCategory($any($event.target).value)"
          >
            <option value="" [selected]="category() === ''">All categories</option>
            @for (c of categories; track c) {
              <option [value]="c" [selected]="c === category()">{{ label(c) }}</option>
            }
          </select>
        </div>

        <div class="filter">
          <label class="field-label" for="f-city">City</label>
          <input
            id="f-city"
            class="field-input"
            type="text"
            [value]="city()"
            placeholder="Any city"
            (input)="setCity($any($event.target).value)"
          />
        </div>

        <div class="filter">
          <label class="field-label" for="f-q">Search</label>
          <input
            id="f-q"
            class="field-input"
            type="search"
            [value]="q()"
            placeholder="Search events"
            (input)="setQ($any($event.target).value)"
          />
        </div>

        @if (anyFilter()) {
          <button type="button" class="btn-text clear" (click)="clearFilters()">
            Clear Filters
          </button>
        }
      </div>

      @if (loading()) {
        <ul class="grid">
          @for (n of [1, 2, 3, 4, 5, 6]; track n) {
            <li class="skeleton-card">
              <app-skeleton height="0" radius="12px" [width]="'100%'"></app-skeleton>
              <div class="sk-cover"><app-skeleton height="100%" radius="12px"></app-skeleton></div>
              <app-skeleton height="14px" width="75%"></app-skeleton>
              <app-skeleton height="13px" width="40%"></app-skeleton>
            </li>
          }
        </ul>
      } @else if (events().length === 0) {
        <app-empty-state
          heading="No Events Found"
          body="Try a wider date range or a different category."
        >
          <button type="button" class="btn" (click)="clearFilters()">Clear Filters</button>
        </app-empty-state>
      } @else {
        <ul class="grid">
          @for (e of events(); track e.slug) {
            <li>
              <a class="card-link" [routerLink]="'/' + e.slug">
                <span class="cover">
                  <app-cover [seed]="e.cover_seed" [title]="e.title"></app-cover>
                </span>
                <span class="row">
                  <span class="chip" aria-hidden="true">
                    <span class="chip-month">{{ month(e) }}</span>
                    <span class="chip-day">{{ day(e) }}</span>
                  </span>
                  <span class="meta">
                    <span class="title">{{ e.title }}</span>
                    <span class="city">{{ e.city }}</span>
                    @if (e.state === 'registration_closed') {
                      <app-pill word="Registration Closed" tone="warning"></app-pill>
                    } @else {
                      <span class="seats">{{ seatCaption(e) }}</span>
                    }
                  </span>
                </span>
              </a>
            </li>
          }
        </ul>

        <nav class="pager" aria-label="Pagination">
          <button
            type="button"
            class="btn btn-sm"
            [disabled]="offset() === 0"
            (click)="goto(offset() - pageSize)"
          >
            Previous
          </button>
          <span class="showing">Showing {{ events().length }} of {{ total() }}</span>
          <button
            type="button"
            class="btn btn-sm"
            [disabled]="offset() + events().length >= total()"
            (click)="goto(offset() + pageSize)"
          >
            Next
          </button>
        </nav>
      }
    </main>
  `,
  styles: [
    `
      .wrap {
        max-width: 1080px;
        margin: 0 auto;
        padding: 96px 24px 96px;
      }
      .wrap.embedded { padding-top: 0; }
      .screen-title { margin-bottom: 24px; }

      /* one row at 1000px and above, two rows below 650px */
      .filters {
        display: flex;
        gap: 12px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-bottom: 32px;
      }
      .filter { flex: 1 1 200px; min-width: 160px; }
      .filter .field-label { margin-bottom: 6px; }
      .clear { flex: none; }

      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 24px;
      }
      .card-link { display: block; color: var(--ink); }
      .cover {
        display: block;
        border-radius: var(--r-card);
        overflow: hidden;
        box-shadow: var(--shadow-card);
        transition: box-shadow var(--dur) var(--ease);
      }
      @media (hover: hover) {
        .card-link:hover .cover { box-shadow: var(--shadow-fine); }
      }
      .row { display: flex; gap: 12px; margin-top: 12px; }
      .chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--r-nav);
        background: var(--ink-04);
        flex: none;
      }
      .chip-month {
        font-size: 11px;
        line-height: 14px;
        font-weight: 600;
        color: var(--ink-64);
      }
      .chip-day { font-size: 15px; line-height: 18px; font-weight: 600; }
      .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .title { font-size: 14px; line-height: 21px; font-weight: 500; }
      .city, .seats { font-size: 13px; line-height: 16px; color: var(--ink-64); }
      .seats { color: var(--ink-36); }

      .pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin-top: 48px;
      }
      .showing { font-size: 13px; line-height: 16px; color: var(--ink-64); }

      .skeleton-card { display: flex; flex-direction: column; gap: 8px; }
      .sk-cover { aspect-ratio: 1; }

      @media (min-width: 484px) {
        .grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (min-width: 1580px) {
        .grid { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 649px) {
        .filters { gap: 8px; }
        .filter { flex: 1 1 46%; }
      }
      @media (max-width: 483px) {
        .wrap { padding: 88px 16px 64px; }
      }
    `,
  ],
})
export class DiscoverComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private theme = inject(ThemeService);

  readonly categories = CATEGORIES;
  readonly pageSize = PAGE_SIZE;

  readonly events = signal<EventSummary[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly embedded = signal(false);

  readonly category = signal('');
  readonly city = signal('');
  readonly q = signal('');
  readonly offset = signal(0);

  readonly anyFilter = computed(
    () => !!this.category() || !!this.city().trim() || !!this.q().trim(),
  );

  private sub?: Subscription;
  private controller: AbortController | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.theme.clear();
    this.embedded.set(this.api.isSignedIn && this.router.url.startsWith('/discover') === false);

    // Every control reads its value back from the query string on load.
    this.sub = this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      const offset = Number(params.get('offset') ?? 0);
      this.offset.set(Number.isFinite(offset) && offset > 0 ? offset : 0);
      this.load();
    });
  }

  private load() {
    this.controller?.abort();
    this.controller = new AbortController();
    this.loading.set(true);
    this.api
      .listEvents(
        {
          category: this.category() || undefined,
          city: this.city().trim() || undefined,
          q: this.q().trim() || undefined,
          limit: PAGE_SIZE,
          offset: this.offset(),
        },
        this.controller.signal,
      )
      .then((page) => {
        this.events.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') this.loading.set(false);
      });
  }

  /** Every control writes its value into the query string on change. */
  private write(patch: Record<string, string | null>, immediate = true) {
    const run = () =>
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { offset: null, ...patch },
        queryParamsHandling: 'merge',
      });
    if (immediate) {
      run();
      return;
    }
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(run, 300);
  }

  setCategory(value: string) {
    this.category.set(value);
    this.write({ category: value || null });
  }

  setCity(value: string) {
    this.city.set(value);
    this.write({ city: value.trim() || null }, false);
  }

  setQ(value: string) {
    this.q.set(value);
    this.write({ q: value.trim() || null }, false);
  }

  clearFilters() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  goto(offset: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { offset: offset > 0 ? offset : null },
      queryParamsHandling: 'merge',
    });
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  month(e: EventSummary) {
    return monthLabel(e.starts_at, e.time_zone);
  }

  day(e: EventSummary) {
    return dayLabel(e.starts_at, e.time_zone);
  }

  seatCaption(e: EventSummary) {
    if (e.remaining === null) return 'Open registration';
    if (e.remaining === 0) return 'Full — waiting list';
    return `${e.remaining} ${e.remaining === 1 ? 'seat' : 'seats'} left`;
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.controller?.abort();
    if (this.debounce) clearTimeout(this.debounce);
  }
}

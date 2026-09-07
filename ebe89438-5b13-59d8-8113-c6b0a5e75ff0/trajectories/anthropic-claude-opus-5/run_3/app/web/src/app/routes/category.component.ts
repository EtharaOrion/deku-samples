import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORY_BLURBS, CATEGORY_LABELS, type CategoryCount, type EventSummary } from '../core/models';
import { PublicBarComponent } from '../layout/public-bar.component';
import { EventCardComponent } from '../shared/event-card.component';
import { CategoryIconComponent } from '../shared/icons.component';
import { CoverComponent } from '../shared/cover.component';

/**
 * One of the twelve names resolves here: a masthead of the category glyph, the
 * name, its counts, one sentence and a subscribe field, beside a decorative
 * card that is dropped below 650px.
 */
@Component({
  selector: 'app-category',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, EventCardComponent, CategoryIconComponent, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main class="category">
      <div class="page">
        <header class="masthead">
          <div class="masthead-text">
            <app-category-icon [category]="category" [size]="48" [label]="label" />
            <h1 class="t-serif">{{ label }}</h1>
            <p class="counts t-overline">{{ countsLine() }}</p>
            <p class="blurb t-longform">{{ blurb }}</p>

            <form class="subscribe" (submit)="subscribe($event)">
              <label class="visually-hidden" [attr.for]="'subscribe-' + category">
                Your email address for {{ label }} updates
              </label>
              <input [id]="'subscribe-' + category" type="email" placeholder="you@example.com" [value]="email()" (input)="email.set(asValue($event))" />
              <button type="submit" class="btn btn-primary btn-pill">Subscribe</button>
            </form>
            @if (subscribed()) {
              <p class="t-caption subscribed" role="status">
                Thanks. We will keep this address for {{ label }} updates.
              </p>
            }
          </div>

          <div class="decorative" aria-hidden="true">
            <app-cover [seed]="category" [title]="label" [size]="260" [showTitle]="false" />
          </div>
        </header>

        @if (loading()) {
          <ul class="results">
            @for (n of [1, 2, 3]; track n) {
              <li><div class="skeleton" style="height: 280px; border-radius: 12px"></div></li>
            }
          </ul>
        } @else if (events().length === 0) {
          <div class="empty-state">
            <h2>There are currently no relevant events near you.</h2>
            <a routerLink="/discover" class="btn btn-primary btn-pill">Explore Events</a>
          </div>
        } @else {
          <ul class="results">
            @for (event of events(); track event.slug) {
              <li><app-event-card [event]="event" /></li>
            }
          </ul>
        }
      </div>
    </main>
  `,
  styles: [
    `
      .category {
        padding: 96px 0 96px;
        min-height: 100vh;
      }

      .masthead {
        display: flex;
        gap: 48px;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 48px;
      }

      .masthead-text {
        max-width: 560px;
      }

      h1 {
        font-size: 40px;
        line-height: 48px;
        margin-top: 12px;
      }

      .counts {
        color: var(--muted);
        margin-top: 8px;
      }

      .blurb {
        color: var(--ink-64);
        margin-top: 12px;
      }

      .subscribe {
        display: flex;
        gap: 8px;
        margin-top: 24px;
        flex-wrap: wrap;
      }

      .subscribe input {
        flex: 1;
        min-width: 220px;
        min-height: 44px;
        padding: 10px 12px;
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }

      .subscribed {
        margin-top: 8px;
        color: var(--muted);
      }

      .results {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }

      @media (min-width: 484px) {
        .results { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      @media (min-width: 1000px) {
        .results { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }

      /* The decorative card is dropped below 650px. */
      @media (max-width: 649px) {
        .decorative { display: none; }
        .masthead { gap: 0; }
      }
    `,
  ],
})
export class CategoryComponent implements OnInit {
  @Input({ required: true }) category = '';

  private api = inject(ApiService);
  readonly events = signal<EventSummary[]>([]);
  readonly loading = signal(true);
  readonly counts = signal<CategoryCount | null>(null);
  readonly email = signal('');
  readonly subscribed = signal(false);

  get label() {
    return CATEGORY_LABELS[this.category] ?? this.category;
  }

  get blurb() {
    return CATEGORY_BLURBS[this.category] ?? 'Gatherings in this category, near you.';
  }

  ngOnInit() {
    this.load();
  }

  ngOnChanges() {
    this.load();
  }

  private load() {
    if (!this.category) return;
    this.loading.set(true);
    this.api.events({ category: this.category, limit: 100 }).subscribe({
      next: (page) => {
        this.events.set(page.events);
        this.loading.set(false);
      },
      error: () => {
        this.events.set([]);
        this.loading.set(false);
      },
    });
    this.api.categories().subscribe({
      next: (list) => this.counts.set(list.find((c) => c.slug === this.category) ?? null),
      error: () => this.counts.set(null),
    });
  }

  countsLine() {
    const c = this.counts();
    const events = c?.event_count ?? this.events().length;
    const calendars = c?.calendar_count ?? 0;
    const e = events === 1 ? '1 published event' : `${events} published events`;
    const cal = calendars === 1 ? '1 calendar' : `${calendars} calendars`;
    return `${e} \u00b7 ${cal}`;
  }

  asValue(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  subscribe(event: Event) {
    event.preventDefault();
    if (this.email()) this.subscribed.set(true);
  }
}

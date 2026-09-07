import {
  ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import {
  CATEGORY_BLURBS, CATEGORY_LABELS, CategoryCount, EventSummary,
} from '../models';
import { TopBarComponent } from '../shared/top-bar.component';
import { EventCardComponent } from '../shared/event-card.component';
import { CategoryIconComponent } from '../shared/icons.component';
import {
  CoverComponent, EmptyStateComponent, SkeletonComponent,
} from '../shared/ui.components';
import { NoticeService } from '../core/notice.service';

/**
 * A category masthead: the glyph in its assigned hue at 48px, the name as an
 * h1 in the display serif, the counts beneath it, one sentence and a subscribe
 * field, beside a decorative card that is dropped below 650px.
 */
@Component({
  selector: 'app-category',
  standalone: true,
  imports: [
    RouterLink, FormsModule, TopBarComponent, EventCardComponent,
    CategoryIconComponent, CoverComponent, EmptyStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main id="main" class="container page" role="main">
      <section class="masthead">
        <div class="lead">
          <app-category-icon [name]="slug" [size]="48" />
          <h1 class="display">{{ label }}</h1>
          <p class="counts overline">
            {{ counts()?.event_count ?? 0 }} published
            {{ (counts()?.event_count ?? 0) === 1 ? 'event' : 'events' }}
            · {{ counts()?.calendar_count ?? 0 }}
            {{ (counts()?.calendar_count ?? 0) === 1 ? 'calendar' : 'calendars' }}
          </p>
          <p class="blurb secondary">{{ blurb }}</p>
          <form class="subscribe" (ngSubmit)="subscribe()">
            <label class="visually-hidden" [attr.for]="'sub-' + slug">Your email address</label>
            <input class="field-input" [id]="'sub-' + slug" type="email" name="email"
                   placeholder="you@example.com" [(ngModel)]="email" />
            <button type="submit" class="btn btn-primary">Subscribe</button>
          </form>
        </div>
        <div class="decorative" aria-hidden="true">
          <app-cover [seed]="slug + '-masthead'" [size]="220" [title]="label" />
        </div>
      </section>

      <h2 class="section-title screen-title">Upcoming events</h2>
      @if (loading()) {
        <ul class="grid">
          @for (i of [1,2,3]; track i) { <li><app-skeleton w="100%" h="260px" radius="12px" /></li> }
        </ul>
      } @else if (events().length === 0) {
        <app-empty-state
          heading="There are currently no relevant events near you."
          body="Nothing is published in this category just yet."
          actionLabel="Explore Events"
          actionLink="/discover" />
      } @else {
        <ul class="grid">
          @for (ev of events(); track ev.slug) { <li><app-event-card [ev]="ev" /></li> }
        </ul>
      }
    </main>
  `,
  styles: [`
    .page { padding: 112px var(--s5) var(--s8); }
    .masthead {
      display: flex; gap: var(--s7); align-items: center;
      margin-bottom: var(--s7);
    }
    .lead { flex: 1; min-width: 0; }
    h1 { font-size: 40px; line-height: 48px; margin-top: var(--s3); }
    .counts { color: var(--ink-secondary); margin-top: var(--s2); }
    .blurb { margin-top: var(--s3); max-width: 480px; }
    .subscribe { display: flex; gap: var(--s2); margin-top: var(--s4); max-width: 420px; }
    .subscribe .field-input { flex: 1; }
    .decorative { flex: none; }
    /* The decorative card is dropped on a phone. */
    @media (max-width: 649px) { .decorative { display: none; } .masthead { gap: var(--s4); } }
    .section-title { margin-bottom: var(--s4); }
    .grid { display: grid; grid-template-columns: 1fr; gap: var(--s4); }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1000px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  `],
})
export class CategoryComponent implements OnChanges {
  @Input() slug = '';

  private api = inject(ApiService);
  private notices = inject(NoticeService);

  events = signal<EventSummary[]>([]);
  counts = signal<CategoryCount | null>(null);
  loading = signal(true);
  email = '';

  get label(): string { return CATEGORY_LABELS[this.slug] ?? this.slug; }
  get blurb(): string { return CATEGORY_BLURBS[this.slug] ?? 'Events in this category.'; }

  ngOnChanges() {
    if (!this.slug) return;
    this.loading.set(true);
    this.api.listEvents({ category: this.slug, limit: 100 }).subscribe({
      next: (r) => { this.events.set(r.items); this.loading.set(false); },
      error: () => { this.events.set([]); this.loading.set(false); },
    });
    this.api.categories().subscribe({
      next: (all) => this.counts.set(all.find((c) => c.slug === this.slug) ?? null),
      error: () => this.counts.set(null),
    });
  }

  subscribe() {
    this.notices.show(
      this.email
        ? 'Subscriptions are not part of this build, so nothing was sent.'
        : 'Enter a valid email address.',
      this.email ? 'info' : 'warning',
    );
  }
}

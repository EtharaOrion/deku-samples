import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { NoticeService } from '../core/notice.service';
import { PublicBarComponent } from '../ui/public-bar.component';
import { EventCardComponent } from '../ui/event-card.component';
import { IconComponent } from '../ui/icon.component';
import { EmptyStateComponent } from '../ui/bits';
import { coverBackground } from '../core/art';
import {
  CATEGORIES,
  CATEGORY_BLURB,
  CATEGORY_HUES,
  CATEGORY_LABELS,
  type CategoryPage,
  type EventSummary,
} from '../core/models';

export const CATEGORY_SET_CLIENT = new Set<string>(CATEGORIES);

/**
 * A masthead of the category glyph in its assigned hue at 48px, the name as an
 * h1 in the display serif, the counts beneath it, one sentence of description
 * and a subscribe field, beside a decorative card dropped below 650px.
 */
@Component({
  selector: 'app-category-page',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    EventCardComponent,
    IconComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main id="main" class="page wrap">
      <header class="masthead">
        <div class="masthead__text">
          <app-icon [name]="glyph()" [size]="48" [colour]="hue()" />
          <h1 class="masthead__head">{{ label() }}</h1>
          <p class="masthead__counts t-overline">
            {{ page()?.event_count ?? 0 }} published ·
            {{ page()?.calendar_count ?? 0 }} calendars
          </p>
          <p class="masthead__blurb t-prose">{{ blurb() }}</p>
          <form class="subscribe" (submit)="subscribe($event)">
            <label class="visually-hidden" [attr.for]="'sub-' + name()">
              Email address for {{ label() }} updates
            </label>
            <input
              class="input subscribe__input"
              [id]="'sub-' + name()"
              type="email"
              name="email"
              placeholder="you@example.com"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
            <button type="submit" class="btn btn--primary">Subscribe</button>
          </form>
        </div>
        <div class="masthead__card card card--lg" [style.background]="decor()" aria-hidden="true"></div>
      </header>

      <section class="section" aria-labelledby="cat-events">
        <h2 class="section__head t-screen-title" id="cat-events">Upcoming events</h2>
        @if (loading()) {
          <ul class="grid grid--events" aria-busy="true">
            @for (n of [1, 2, 3]; track n) {
              <li><div class="skeleton skeleton--card grid__skeleton"></div></li>
            }
          </ul>
        } @else if (events().length === 0) {
          <app-empty-state
            title="There are currently no relevant events near you."
            body="Nothing is published in this category just now. Other categories may have something on."
            actionLabel="Explore Events"
            actionLink="/discover"
          />
        } @else {
          <ul class="grid grid--events">
            @for (e of events(); track e.slug) {
              <li><app-event-card [event]="e" /></li>
            }
          </ul>
        }
      </section>

      @if ((page()?.calendars ?? []).length > 0) {
        <section class="section" aria-labelledby="cat-calendars">
          <h2 class="section__head t-screen-title" id="cat-calendars">Calendars in {{ label() }}</h2>
          <ul class="grid grid--calendars">
            @for (c of page()?.calendars ?? []; track c.slug) {
              <li>
                <a class="card card--lift cal" [routerLink]="'/' + c.slug">
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption cal__meta"
                    >{{ c.city }} · {{ c.published_event_count }} published</span
                  >
                </a>
              </li>
            }
          </ul>
        </section>
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
        gap: var(--s7);
      }
      .masthead { display: grid; grid-template-columns: 1fr; gap: var(--s5); align-items: center; }
      @media (min-width: 650px) {
        .masthead { grid-template-columns: minmax(0, 1fr) 260px; }
      }
      .masthead__text { display: flex; flex-direction: column; gap: var(--s3); align-items: flex-start; }
      .masthead__head { font-family: var(--serif); font-weight: 400; font-size: 44px; line-height: 50px; }
      .masthead__counts { color: var(--ink-64); }
      .masthead__blurb { color: var(--ink-64); max-width: 520px; }
      .masthead__card {
        height: 220px;
        border: 0;
        box-shadow: var(--elev-card);
        display: none;
      }
      @media (min-width: 650px) {
        .masthead__card { display: block; }
      }
      .subscribe { display: flex; gap: var(--s2); flex-wrap: wrap; width: 100%; max-width: 460px; }
      .subscribe__input { flex: 1 1 200px; }

      .section { display: flex; flex-direction: column; gap: var(--s4); }
      .section__head { font-family: var(--serif); font-weight: 400; }
      .grid { display: grid; gap: var(--s4); grid-template-columns: 1fr; }
      .grid__skeleton { height: 320px; }
      @media (min-width: 484px) {
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (min-width: 1000px) {
        .grid--calendars { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      @media (min-width: 1580px) {
        .grid--events { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      .cal { display: flex; flex-direction: column; gap: var(--s1); padding: var(--s4); color: inherit; }
      .cal__meta { color: var(--muted); }
    `,
  ],
})
export class CategoryPageComponent implements OnDestroy {
  readonly name = input.required<string>();

  private api = inject(ApiService);
  private themeService = inject(ThemeService);
  private notices = inject(NoticeService);

  readonly page = signal<CategoryPage | null>(null);
  readonly events = signal<EventSummary[]>([]);
  readonly loading = signal(true);
  readonly email = signal('');

  private loadedName = '';

  readonly label = computed(() => CATEGORY_LABELS[this.name()] ?? this.name());
  readonly hue = computed(() => CATEGORY_HUES[this.name()] ?? 'var(--ink)');
  readonly blurb = computed(() => CATEGORY_BLURB[this.name()] ?? 'Events in this category.');
  readonly glyph = computed(() => this.name() as any);
  readonly decor = computed(() => coverBackground(`category-${this.name()}`));

  constructor() {
    this.themeService.clear();
    effect(() => {
      const name = this.name();
      if (!name || name === this.loadedName) return;
      this.loadedName = name;
      this.load(name);
    });
  }

  ngOnDestroy(): void {
    this.themeService.clear();
  }

  private load(name: string): void {
    this.loading.set(true);
    this.api.category(name).subscribe({
      next: (p) => this.page.set(p),
      error: () => this.page.set(null),
    });
    this.api.events({ category: name, limit: 20 }).subscribe({
      next: (page) => {
        this.events.set(page.events);
        this.loading.set(false);
      },
      error: () => {
        this.events.set([]);
        this.loading.set(false);
      },
    });
  }

  subscribe(event: Event): void {
    event.preventDefault();
    const value = this.email().trim();
    if (!value || !/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value)) {
      this.notices.refusal('Enter a valid email address.');
      return;
    }
    this.email.set('');
    this.notices.success(`We will let you know when something new lands in ${this.label()}.`);
  }
}

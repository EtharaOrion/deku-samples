import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORY_BLURB, CATEGORY_LABELS, type CategoryPage } from '../core/models';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';
import { EventCardComponent } from '../ui/event-card.component';
import { CategoryIconComponent } from '../ui/icons.component';
import { CoverComponent } from '../ui/cover.component';

@Component({
  selector: 'app-category-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, EventCardComponent, CategoryIconComponent, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <div class="public-shell">
      <main id="main" class="page">
        <section class="masthead">
          <div class="copy">
            <app-category-icon [name]="name()" [size]="48" />
            <h1 class="serif">{{ label() }}</h1>
            @if (loading()) {
              <div class="skeleton" style="height: 18px; width: 220px"></div>
            } @else {
              <p class="counts t-overline">{{ data()?.event_count ?? 0 }} events · {{ data()?.calendar_count ?? 0 }} calendars</p>
            }
            <p class="blurb t-longform">{{ blurb() }}</p>
            <form class="subscribe" (ngSubmit)="subscribe($event)">
              <label class="sr-only" [attr.for]="'sub-' + name()">Email address for updates in {{ label() }}</label>
              <input [id]="'sub-' + name()" type="email" name="email" placeholder="you@example.com" />
              <button class="btn btn-primary" type="submit">Subscribe</button>
            </form>
          </div>
          <div class="decor card" aria-hidden="true">
            <app-cover [seed]="'cat-' + name()" [title]="label()" radius="12px" />
          </div>
        </section>

        @if (loading()) {
          <ul class="grid">
            @for (i of [1, 2, 3]; track i) {
              <li><div class="skeleton skeleton-card" style="height: 280px"></div></li>
            }
          </ul>
        } @else if ((data()?.events?.length ?? 0) === 0) {
          <div class="empty-state">
            <h2>There are currently no relevant events near you.</h2>
            <p>Widen the search and see what else the city is doing this month.</p>
            <a class="btn btn-primary btn-pill" routerLink="/discover">Explore Events</a>
          </div>
        } @else {
          <h2 class="t-section-heading section">Published events</h2>
          <ul class="grid">
            @for (e of data()!.events; track e.slug) {
              <li><app-event-card [event]="e" /></li>
            }
          </ul>
        }

        @if ((data()?.calendars?.length ?? 0) > 0) {
          <h2 class="t-section-heading section">Calendars in {{ label() }}</h2>
          <ul class="grid">
            @for (c of data()!.calendars; track c.slug) {
              <li>
                <a class="card card-lift cal" [routerLink]="['/', c.slug]">
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption muted">{{ c.city }} · {{ c.published_count }} published</span>
                  @if (!c.is_public) {
                    <span class="pill pill-private">Private</span>
                  }
                </a>
              </li>
            }
          </ul>
        }
      </main>
    </div>
  `,
  styles: [
    `
      .masthead {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s5);
        padding: var(--s7) 0 var(--s6);
        align-items: center;
      }
      @media (min-width: 650px) {
        .masthead {
          grid-template-columns: 1fr 280px;
        }
      }
      @media (max-width: 649px) {
        .decor {
          display: none;
        }
      }
      h1 {
        font-size: 40px;
        line-height: 48px;
        font-weight: 400;
        margin-top: var(--s3);
      }
      .counts {
        color: var(--ink-64);
        margin-top: var(--s2);
      }
      .blurb {
        color: var(--ink-64);
        max-width: 480px;
        margin-top: var(--s3);
      }
      .subscribe {
        display: flex;
        gap: var(--s2);
        margin-top: var(--s5);
        max-width: 420px;
      }
      .subscribe input {
        flex: 1;
        min-height: 44px;
        padding: var(--s2) var(--s3);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }
      .decor {
        overflow: hidden;
        border-radius: var(--r-card);
      }
      .section {
        margin: var(--s6) 0 var(--s4);
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
      @media (min-width: 1000px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      .cal {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        align-items: flex-start;
        padding: var(--s4);
      }
      .muted {
        color: var(--muted);
      }
    `,
  ],
})
export class CategoryPageComponent implements OnDestroy {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly name = input.required<string>();
  readonly data = signal<CategoryPage | null>(null);
  readonly loading = signal(true);

  private last = '';

  readonly label = computed(() => CATEGORY_LABELS[this.name()] ?? this.name());
  readonly blurb = computed(() => CATEGORY_BLURB[this.name()] ?? '');

  constructor() {
    clearTheme();
    effect(() => {
      const n = this.name();
      if (n && n !== this.last) {
        this.last = n;
        void this.load(n);
      }
    });
  }

  ngOnDestroy(): void {
    clearTheme();
  }

  private async load(name: string) {
    this.loading.set(true);
    try {
      this.data.set(await this.api.getCategory(name));
    } catch {
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  subscribe(event: Event) {
    event.preventDefault();
    this.notices.show('Subscriptions are not part of this build. Open a calendar to see what it has coming.', 'info');
  }
}

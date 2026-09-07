import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORY_BLURBS, CATEGORY_LABELS, CategoryPage, EventSummary } from '../core/models';
import { NoticeService } from '../core/notice.service';
import { coverBackground } from '../ui/cover';
import { EventCardComponent } from '../ui/event-card.component';
import { IconComponent, categoryHue } from '../ui/icon.component';
import { TopBarComponent } from '../ui/top-bar.component';

@Component({
  selector: 'app-category-page',
  standalone: true,
  imports: [FormsModule, RouterLink, TopBarComponent, IconComponent, EventCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main class="page" id="main">
      <div class="col">
        <section class="masthead">
          <div class="words">
            <app-icon [name]="name()" [size]="48" [color]="hue()" />
            <h1 class="t-serif">{{ label() }}</h1>
            <p class="t-overline counts">
              {{ page()?.event_count ?? 0 }} published · {{ page()?.calendar_count ?? 0 }} calendars
            </p>
            <p class="t-prose blurb">{{ blurb() }}</p>
            <form class="subscribe" (ngSubmit)="subscribe()">
              <label class="visually-hidden" for="sub-email">Your email</label>
              <input id="sub-email" type="email" [(ngModel)]="email" name="email" placeholder="you@example.com" />
              <button type="submit" class="btn btn-primary btn-pill">Subscribe</button>
            </form>
          </div>
          <div class="deco" aria-hidden="true">
            <div class="deco-tile" [style.background]="decoBg()"></div>
          </div>
        </section>

        @if (loading()) {
          <div class="sk" style="height:220px;border-radius:12px"></div>
        } @else if (events().length === 0) {
          <div class="empty-state">
            <h2>There are currently no relevant events near you.</h2>
            <a class="btn btn-primary btn-pill" routerLink="/discover">Explore Events</a>
          </div>
        } @else {
          <section aria-labelledby="events-h">
            <h2 id="events-h" class="t-overline shelf-head">Coming up</h2>
            <ul class="grid events">
              @for (e of events(); track e.slug) {
                <li><app-event-card [event]="e" /></li>
              }
            </ul>
          </section>
        }

        @if ((page()?.calendars ?? []).length) {
          <section aria-labelledby="cals-h">
            <h2 id="cals-h" class="t-overline shelf-head">Calendars in {{ label() }}</h2>
            <ul class="grid cals">
              @for (c of page()!.calendars; track c.slug) {
                <li>
                  <a class="cal card card-lift" [routerLink]="['/', c.slug]">
                    <app-icon [name]="c.category" [size]="24" [color]="hue()" />
                    <span class="t-card-title">{{ c.name }}</span>
                    <span class="t-caption muted">{{ c.city }}</span>
                    <span class="t-caption muted">{{ c.published_event_count }} published</span>
                  </a>
                </li>
              }
            </ul>
          </section>
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
        display: flex;
        flex-direction: column;
        gap: var(--s7);
      }
      .masthead {
        display: grid;
        grid-template-columns: 1fr 280px;
        gap: var(--s6);
        align-items: center;
      }
      .words {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
      h1 {
        font-size: 40px;
        line-height: 46px;
      }
      .counts {
        color: var(--muted);
      }
      .blurb {
        color: var(--ink-64);
        max-width: 520px;
      }
      .subscribe {
        display: flex;
        gap: var(--s2);
        max-width: 420px;
        margin-top: var(--s2);
      }
      .subscribe input {
        flex: 1;
        min-height: 44px;
        padding: 10px var(--s3);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }
      .deco-tile {
        aspect-ratio: 1;
        border-radius: 12.8% / 5.7%;
        box-shadow: var(--elev-card);
        opacity: 0.9;
      }
      .shelf-head {
        color: var(--ink-36);
        margin-bottom: var(--s4);
      }
      .grid {
        display: grid;
        gap: var(--s5);
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .cals {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (min-width: 1580px) {
        .events {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      .cal {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        padding: var(--s4);
        color: inherit;
        background: var(--paper);
      }
      .muted {
        color: var(--muted);
      }
      @media (max-width: 649px) {
        .page {
          padding: 88px var(--s4) var(--s8);
        }
        .masthead {
          grid-template-columns: 1fr;
        }
        .deco {
          display: none;
        }
        h1 {
          font-size: 32px;
          line-height: 38px;
        }
      }
    `,
  ],
})
export class CategoryPageComponent {
  name = input.required<string>();

  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly page = signal<CategoryPage | null>(null);
  readonly events = signal<EventSummary[]>([]);
  readonly loading = signal(true);

  email = '';
  private loaded = '';

  readonly label = computed(() => CATEGORY_LABELS[this.name()] ?? this.name());
  readonly blurb = computed(() => CATEGORY_BLURBS[this.name()] ?? 'Events in this category.');
  readonly hue = computed(() => categoryHue(this.name()));
  readonly decoBg = computed(() => coverBackground(this.name()));

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load() {
    const name = this.name();
    if (this.loaded === name) return;
    this.loaded = name;
    this.loading.set(true);
    try {
      const [page, list] = await Promise.all([
        this.api.category(name),
        this.api.listEvents({ category: name, limit: 20 }),
      ]);
      this.page.set(page);
      this.events.set(list.items);
    } catch {
      this.page.set(null);
      this.events.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  subscribe() {
    if (!this.email.includes('@')) {
      this.notices.refuse('Enter a valid email address.');
      return;
    }
    this.notices.success(`We will keep ${this.email} in mind for ${this.label()}.`);
    this.email = '';
  }
}

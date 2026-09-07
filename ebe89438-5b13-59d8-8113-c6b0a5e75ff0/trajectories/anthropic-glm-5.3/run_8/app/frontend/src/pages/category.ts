import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Api, Calendar, EventSummary } from '../api';
import { Toast, categoryMeta, CATEGORIES } from '../domain';
import { Icon } from '../ui/icon';
import { Cover } from '../ui/cover';
import { DateChip } from '../ui/bits';

/** One of the twelve categories. */
@Component({
  selector: 'g-category-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="mast spread">
        <div class="mast-text">
          <g-icon [name]="meta().key" [size]="48" [colour]="meta().hue" />
          <h1 class="t-display title">{{ meta().label }}</h1>
          <p class="counts t-overline muted">{{ events().length }} events · {{ calendars().length }} calendars</p>
          <p class="t-row secondary">{{ meta().blurb }}</p>
          <form class="subscribe row" (submit)="subscribe($event)">
            <label class="sr-only" for="sub">Email for category updates</label>
            <input id="sub" type="email" placeholder="Your email" [value]="email()" (input)="email.set($any($event.target).value)" />
            <button class="btn btn-secondary btn-sm" type="submit">Subscribe</button>
          </form>
        </div>
        <div class="decor" aria-hidden="true"><g-cover seed="category-{{ meta().key }}" [showTitle]="false" /></div>
      </div>

      @if (events().length === 0 && !loading()) {
        <div class="empty">
          <h2>There are currently no relevant events near you.</h2>
          <p>Try another category or come back soon.</p>
          <a class="btn btn-primary" routerLink="/discover">Explore Events</a>
        </div>
      } @else {
        <ul class="events">
          @for (e of events(); track e.id) {
            <li><a class="card ev" [routerLink]="['/', e.slug]">
              <g-cover [seed]="e.cover_seed" [title]="e.title" [compact]="true" />
              <div class="ev-body">
                <h2 class="t-row title">{{ e.title }}</h2>
                <div class="row t-caption muted"><g-icon name="pin" [size]="14" /> {{ e.city }} · {{ e.time_zone.split('/').pop() }}</div>
                <g-date-chip [iso]="e.starts_at" />
              </div>
            </a></li>
          }
        </ul>
      }

      @if (calendars().length) {
        <section class="cals">
          <h2 class="t-overline">Calendars in {{ meta().label }}</h2>
          <ul class="cal-grid">
            @for (c of calendars(); track c.slug) {
              <li><a class="card cal" [routerLink]="['/', c.slug]">
                <div class="row"><g-icon [name]="c.category" [size]="20" [colour]="categoryMeta(c.category).hue" />
                  <span class="t-row title">{{ c.name }}</span></div>
                <span class="t-caption muted">{{ c.city }}</span>
              </a></li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  imports: [RouterLink, Icon, Cover, DateChip],
  styles: [`
    :host { display: block; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 32px; }
    .mast { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 32px; align-items: start; }
    .mast-text { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .title { font-size: 40px; line-height: 46px; margin: 0; }
    .secondary { color: var(--ink-64); max-width: 480px; }
    .subscribe { gap: 8px; max-width: 420px; }
    .subscribe input { max-width: 240px; }
    .decor { width: 220px; }
    .events { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 1579px) { .events { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 483px) { .events { grid-template-columns: 1fr; } }
    .ev { padding: 12px; display: flex; flex-direction: column; gap: 12px; text-decoration: none; color: inherit; }
    .ev-body { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .title { font-weight: 500; }
    .cals { display: flex; flex-direction: column; gap: 16px; }
    .cal-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 999px) { .cal-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 483px) { .cal-grid { grid-template-columns: 1fr; } .mast { grid-template-columns: 1fr; } .decor { display: none; } }
  `],
})
export class CategoryPage {
  key = input.required<string>();
  private api = inject(Api);
  private http = inject(HttpClient);
  private toast = inject(Toast);
  categoryMeta = categoryMeta;

  events = signal<EventSummary[]>([]);
  calendars = signal<Calendar[]>([]);
  loading = signal(true);
  email = signal('');

  meta = computed(() => categoryMeta(this.key()));

  constructor() {
    effect(() => {
      const key = this.key();
      this.loading.set(true);
      this.api.events({ category: key, limit: 100 }).subscribe((res) => {
        this.events.set(res.body ?? []);
        this.loading.set(false);
      });
      this.http.get<Calendar[]>('/api/calendars').subscribe({
        next: (all) => this.calendars.set(all.filter((c) => c.category === key)),
        error: () => this.calendars.set([]),
      });
    });
  }

  subscribe(e: Event): void {
    e.preventDefault();
    this.toast.show(`We will write to ${this.email() || 'you'} when a ${this.meta().label.toLowerCase()} event appears.`, 'success');
    this.email.set('');
  }
}

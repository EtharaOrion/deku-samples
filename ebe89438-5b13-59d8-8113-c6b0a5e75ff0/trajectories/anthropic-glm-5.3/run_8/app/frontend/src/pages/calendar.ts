import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Calendar, EventSummary } from '../api';
import { Toast, categoryMeta } from '../domain';
import { Icon } from '../ui/icon';
import { Cover } from '../ui/cover';
import { Avatar } from '../ui/bits';
import { NotFoundPage } from './notfound';

/** A calendar at its own short address. */
@Component({
  selector: 'g-calendar-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <g-not-found />
    } @else if (cal()) {
      @if (cal(); as c) {
      <div class="wrap">
        <header class="head">
          <div class="row-wrap">
            <g-icon [name]="c.category" [size]="28" [colour]="categoryMeta(c.category).hue" />
            <h1 class="t-display title">{{ c.name }}</h1>
            @if (!c.is_public) { <span class="pill pill-info">Private calendar</span> }
          </div>
          <p class="t-row secondary">{{ c.city }} · run by {{ ownerName() }}</p>
          <p class="t-desc secondary">{{ blurb() }}</p>
        </header>

        @if (events().length === 0) {
          <div class="empty">
            <h2>No Events Found</h2>
            <p>This calendar has nothing published yet.</p>
            <a class="btn btn-primary" routerLink="/discover">Explore Events</a>
          </div>
        } @else {
          <ul class="events">
            @for (e of events(); track e.id) {
              <li><a class="card ev" [routerLink]="['/', e.slug]">
                <g-cover [seed]="e.cover_seed" [title]="e.title" [compact]="true" />
                <div class="ev-body">
                  <h2 class="t-row title">{{ e.title }}</h2>
                  <span class="t-caption muted">{{ e.city }} · {{ e.remaining }} seats left</span>
                </div>
              </a></li>
            }
          </ul>
        }
      </div>
      }
    }
  `,
  imports: [RouterLink, Icon, Cover, Avatar, NotFoundPage],
  styles: [`
    :host { display: block; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 32px; }
    .head { display: flex; flex-direction: column; gap: 12px; }
    .title { font-size: 36px; line-height: 42px; margin: 0; }
    .secondary { color: var(--ink-64); }
    .events { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 999px) { .events { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 483px) { .events { grid-template-columns: 1fr; } }
    .ev { padding: 12px; display: flex; flex-direction: column; gap: 12px; text-decoration: none; color: inherit; }
    .ev-body { display: flex; flex-direction: column; gap: 8px; }
    .title { font-weight: 500; }
  `],
})
export class CalendarPage {
  slug = input.required<string>();
  private api = inject(Api);
  categoryMeta = categoryMeta;
  cal = signal<(Calendar & { events: EventSummary[]; owner_handle: string; owner_name: string }) | null>(null);
  missing = signal(false);
  events = signal<EventSummary[]>([]);

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.api.calendar(slug).subscribe({
        next: (c) => {
          this.cal.set(c);
          this.events.set(c.events ?? []);
          this.missing.set(false);
        },
        error: () => this.missing.set(true),
      });
    });
  }

  ownerName(): string {
    return this.cal()?.owner_name ?? 'its host';
  }

  blurb(): string {
    const c = this.cal();
    return c ? `${categoryMeta(c.category).blurb} Events here are free to join.` : '';
  }
}

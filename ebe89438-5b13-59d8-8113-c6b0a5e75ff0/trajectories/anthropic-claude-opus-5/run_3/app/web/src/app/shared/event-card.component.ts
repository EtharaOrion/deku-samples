import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EventSummary } from '../core/models';
import { CoverComponent } from './cover.component';
import { dayNumber, monthLabel, shortDate } from '../core/time';

/**
 * One event card: its generated cover, the title, the date chip, the city and
 * a remaining-seats caption. A card whose event is registration_closed carries
 * the word in a pill and no seat caption.
 */
@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [RouterLink, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="'/' + event.slug" class="card-link lift">
      <app-cover [seed]="event.cover_seed" [title]="event.title" [size]="480" [showTitle]="false" />

      <div class="body">
        <div class="date-chip" aria-hidden="true">
          <span class="month t-month">{{ month }}</span>
          <span class="day">{{ day }}</span>
        </div>

        <div class="text">
          <h3 class="t-card-title">{{ event.title }}</h3>
          <p class="t-caption meta">
            <span class="visually-hidden">Starts </span>{{ date }} &middot; {{ event.city }}
          </p>

          @if (event.state === 'registration_closed') {
            <span class="pill">Registration Closed</span>
          } @else {
            <p class="t-caption seats">{{ seatsLine }}</p>
          }
        </div>
      </div>
    </a>
  `,
  styles: [
    `
      .card-link {
        display: block;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--elev-card);
        overflow: hidden;
        height: 100%;
      }

      app-cover {
        border-radius: var(--r-card) var(--r-card) 0 0;
        overflow: hidden;
      }

      .body {
        display: flex;
        gap: 12px;
        padding: 12px;
      }

      .date-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        flex: none;
        border-radius: var(--r-menu);
        background: var(--paper-inset);
        box-shadow: var(--hairline-inset);
      }

      .month {
        color: var(--muted);
        letter-spacing: 0.04em;
      }

      .day {
        font-size: 15px;
        line-height: 18px;
        font-weight: 600;
      }

      .text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      h3 {
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .meta,
      .seats {
        color: var(--muted);
      }
    `,
  ],
})
export class EventCardComponent {
  @Input({ required: true }) event!: EventSummary;

  get day() {
    return dayNumber(this.event.starts_at, this.event.time_zone);
  }

  get month() {
    return monthLabel(this.event.starts_at, this.event.time_zone);
  }

  get date() {
    return shortDate(this.event.starts_at, this.event.time_zone);
  }

  get seatsLine() {
    const remaining = this.event.remaining;
    if (remaining === null) return 'Open registration';
    if (remaining === 0) return 'Full \u2014 waiting list open';
    return remaining === 1 ? '1 seat left' : `${remaining} seats left`;
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CoverComponent } from './cover.component';
import type { EventSummary } from '../core/models';
import { shortDate } from '../core/format';

@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [RouterLink, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card card-lift tile" [routerLink]="['/', event().slug]">
      <app-cover [seed]="event().cover_seed || event().slug" [title]="event().title" radius="12px" />
      <div class="body">
        <div class="row">
          <span class="chip" aria-hidden="true">
            <span class="chip-month">{{ date().month }}</span>
            <span class="chip-day">{{ date().day }}</span>
          </span>
          <h3 class="t-card-title">{{ event().title }}</h3>
        </div>
        <p class="meta t-caption">{{ event().city }}</p>
        @if (event().state === 'registration_closed') {
          <span class="pill pill-warning">Registration Closed</span>
        } @else {
          <p class="seats t-caption">{{ seatCaption() }}</p>
        }
      </div>
    </a>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .tile {
        display: block;
        overflow: hidden;
        height: 100%;
      }
      .body {
        padding: var(--s3) var(--s3) var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }
      .row {
        display: flex;
        gap: var(--s3);
        align-items: flex-start;
      }
      .chip {
        flex: none;
        width: 40px;
        border-radius: var(--r-menu);
        border: 1px solid var(--ink-08);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2px 0 3px;
        background: var(--paper-inset);
      }
      .chip-month {
        font-size: 11px;
        line-height: 14px;
        font-weight: 600;
        color: var(--pink);
      }
      .chip-day {
        font-size: 15px;
        line-height: 18px;
        font-weight: 600;
      }
      h3 {
        margin: 0;
      }
      .meta,
      .seats {
        color: var(--muted);
      }
    `,
  ],
})
export class EventCardComponent {
  readonly event = input.required<EventSummary>();

  readonly date = computed(() => shortDate(this.event().starts_at, this.event().time_zone));

  readonly seatCaption = computed(() => {
    const e = this.event();
    if (e.remaining === null) return `${e.confirmed_count} going`;
    if (e.remaining === 0) return 'Full — waiting list open';
    return `${e.remaining} of ${e.capacity} seats left`;
  });
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CoverComponent } from './cover.component';
import { DateChipComponent } from './bits';
import { PillComponent } from './pill.component';
import { dayLine, timeLine, zoneAbbrev } from '../core/time';
import type { EventSummary } from '../core/models';

/**
 * One event card: its generated cover at radius 12px, the title at 14/21 at
 * weight 500, the date chip, the city and a remaining-seats caption. A card
 * whose event is registration_closed carries the word in a pill and no seat
 * caption.
 */
@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [RouterLink, CoverComponent, DateChipComponent, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card card--lift tile" [routerLink]="'/' + event().slug">
      <span class="tile__cover">
        <app-cover
          [seed]="event().cover_seed"
          [title]="event().title"
          [radius]="'12px'"
          [pixelSize]="240"
        />
      </span>
      <span class="tile__body">
        <span class="tile__head">
          <app-date-chip [instant]="event().starts_at" [zone]="event().time_zone" />
          <span class="tile__lines">
            <span class="t-card-title tile__title">{{ event().title }}</span>
            <span class="t-caption tile__when">{{ when() }}</span>
          </span>
        </span>
        <span class="tile__foot">
          <span class="t-caption tile__city">{{ event().city || 'Location to come' }}</span>
          @if (event().state === 'registration_closed') {
            <app-pill word="Registration Closed" tone="info" />
          } @else {
            <span class="t-caption tile__seats">{{ seats() }}</span>
          }
        </span>
      </span>
    </a>
  `,
  styles: [
    `
      :host { display: block; height: 100%; }
      .tile {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        padding: var(--s3);
        color: inherit;
        height: 100%;
      }
      .tile__cover { display: block; position: relative; }
      .tile__body { display: flex; flex-direction: column; gap: var(--s3); flex: 1; }
      .tile__head { display: flex; gap: var(--s3); align-items: flex-start; }
      .tile__lines { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .tile__title {
        color: var(--ink);
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .tile__when { color: var(--ink-64); }
      .tile__foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s2);
        margin-top: auto;
      }
      .tile__city { color: var(--muted); }
      .tile__seats { color: var(--ink-64); }
    `,
  ],
})
export class EventCardComponent {
  readonly event = input.required<EventSummary>();

  /** Times are written in the event's own zone. */
  readonly when = computed(() => {
    const e = this.event();
    if (!e.starts_at) return 'Date to be announced';
    return `${dayLine(e.starts_at, e.time_zone)}, ${timeLine(e.starts_at, e.time_zone)} ${zoneAbbrev(
      e.starts_at,
      e.time_zone,
    )}`;
  });

  readonly seats = computed(() => {
    const e = this.event();
    if (e.remaining === null) return 'Open to everyone';
    if (e.remaining === 0) return e.waitlist_enabled ? 'Full, waiting list open' : 'Full';
    return e.remaining === 1 ? '1 seat left' : `${e.remaining} seats left`;
  });
}

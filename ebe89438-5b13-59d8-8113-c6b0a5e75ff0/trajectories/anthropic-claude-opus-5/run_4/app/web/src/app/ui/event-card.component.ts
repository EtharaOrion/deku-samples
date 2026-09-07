import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventSummary } from '../core/models';
import { dateChip, formatShortDate } from '../core/time';
import { CoverComponent } from './cover.component';
import { PillComponent } from './pill.component';

@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [RouterLink, CoverComponent, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card card-lift" [routerLink]="['/', event().slug]">
      <app-cover class="cover" [seed]="event().cover_seed" [title]="event().title" />
      <div class="body">
        <span class="t-card-title">{{ event().title }}</span>
        <span class="t-caption meta">{{ when() }}</span>
        <span class="t-caption meta">{{ event().city }}</span>
        @if (event().state === 'registration_closed') {
          <app-pill eventState="registration_closed" />
        } @else if (seats() !== null) {
          <span class="t-caption seats">{{ seatsLabel() }}</span>
        }
      </div>
    </a>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      a {
        display: block;
        color: inherit;
        background: var(--paper);
        border-radius: var(--r-card);
        overflow: hidden;
        box-shadow: var(--elev-card);
        height: 100%;
      }
      .cover {
        border-radius: var(--r-card) var(--r-card) 0 0;
        overflow: hidden;
      }
      .body {
        padding: var(--s3) var(--s4) var(--s4);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .meta {
        color: var(--ink-64);
      }
      .seats {
        color: var(--muted);
        margin-top: 2px;
      }
      app-pill {
        margin-top: 4px;
      }
    `,
  ],
})
export class EventCardComponent {
  event = input.required<EventSummary>();

  readonly when = computed(() => formatShortDate(this.event().starts_at, this.event().time_zone));
  readonly chip = computed(() => dateChip(this.event().starts_at, this.event().time_zone));
  readonly seats = computed(() => this.event().remaining);
  readonly seatsLabel = computed(() => {
    const left = this.event().remaining;
    if (left === null) return '';
    if (left === 0) return 'Full — waiting list open';
    return left === 1 ? '1 seat left' : `${left} seats left`;
  });
}

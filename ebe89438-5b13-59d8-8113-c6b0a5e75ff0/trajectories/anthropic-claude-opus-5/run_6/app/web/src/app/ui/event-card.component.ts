import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CoverComponent } from './cover.component';
import { PillComponent } from './pill.component';
import { EventSummary } from '../core/models';
import { dateChip, formatIn } from '../core/time';

@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [RouterLink, CoverComponent, PillComponent],
  template: `
    <a class="card-link" [routerLink]="['/', event.slug]">
      <div class="cover">
        <app-cover [seed]="event.cover_seed" [title]="event.title" radius="12px" />
      </div>
      <div class="meta">
        <div class="row top">
          <span class="chip" aria-hidden="true">
            <span class="t-month">{{ chip.month }}</span>
            <span class="day">{{ chip.day }}</span>
          </span>
          <h3 class="t-card-title">{{ event.title }}</h3>
        </div>
        <p class="t-caption when">{{ when }}</p>
        <p class="t-caption city">{{ event.city }}</p>
        @if (event.state === 'registration_closed') {
          <app-pill text="Registration Closed" toneOverride="neutral" />
        } @else if (event.remaining !== null) {
          <p class="t-caption seats">{{ seatsCaption }}</p>
        }
      </div>
    </a>
  `,
  styles: [`
    .card-link {
      display: block; color: inherit; text-decoration: none;
      border-radius: var(--r-card); padding: 8px;
      transition: box-shadow var(--dur) var(--ease);
    }
    @media (hover: hover) { .card-link:hover { box-shadow: var(--elev-card); } }
    .cover { border-radius: var(--r-card); overflow: hidden; }
    .meta { padding: 12px 4px 4px; display: flex; flex-direction: column; gap: 4px; }
    .top { gap: 10px; align-items: flex-start; }
    .chip {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 40px; height: 44px; flex: none; border-radius: var(--r-menu);
      background: var(--ink-04); border: 1px solid var(--ink-08);
    }
    .chip .t-month { color: var(--danger); }
    .chip .day { font-size: 15px; line-height: 18px; font-weight: 700; }
    h3 { margin: 0; }
    .when, .city { color: var(--ink-64); }
    .seats { color: var(--muted); }
  `],
})
export class EventCardComponent {
  @Input({ required: true }) event!: EventSummary;

  get chip() { return dateChip(this.event.starts_at, this.event.time_zone); }
  get when() { return formatIn(this.event.starts_at, this.event.time_zone); }
  get seatsCaption() {
    const r = this.event.remaining ?? 0;
    if (r <= 0) return 'Full - join the waiting list';
    return r === 1 ? '1 seat left' : `${r} seats left`;
  }
}

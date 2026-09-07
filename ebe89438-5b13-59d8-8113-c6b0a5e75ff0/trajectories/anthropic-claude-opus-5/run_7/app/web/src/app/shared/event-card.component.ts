import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventSummary } from '../models';
import { CoverComponent } from './ui.components';
import { chipParts } from '../core/time';

/**
 * One event card: its generated cover at radius 12px, the title, the date
 * chip, the city and a remaining-seats caption. A card whose event is
 * registration_closed carries the word in a pill and no seat caption.
 */
@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [RouterLink, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card card-lift tile" [routerLink]="['/', ev.slug]">
      <app-cover [seed]="ev.cover_seed" size="100%" [title]="ev.title" radius="12px" />
      <div class="meta">
        <div class="row-top">
          <span class="date-chip" aria-hidden="true">
            <span class="chip-month">{{ chip.month }}</span>
            <span class="chip-day">{{ chip.day }}</span>
          </span>
          <span class="grow">
            <h3 class="card-title">{{ ev.title }}</h3>
            <p class="caption city">{{ ev.city }}</p>
          </span>
        </div>
        @if (ev.state === 'registration_closed') {
          <span class="pill pill-warning">Registration Closed</span>
        } @else {
          <p class="caption seats">{{ seats }}</p>
        }
      </div>
    </a>
  `,
  styles: [`
    .tile { display: block; overflow: hidden; color: inherit; }
    .tile:hover { color: inherit; }
    :host ::ng-deep app-cover > .cover-wrap { width: 100% !important; aspect-ratio: 1; height: auto !important; }
    .meta { padding: var(--s3); }
    .row-top { display: flex; gap: var(--s3); align-items: flex-start; }
    .grow { flex: 1; min-width: 0; }
    .date-chip {
      width: 40px; height: 40px; flex: none; border-radius: var(--r-menu);
      background: var(--ink-fill); border: 1px solid var(--ink-hairline);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .chip-month { font-size: 11px; line-height: 14px; font-weight: 600; color: var(--ink-secondary); }
    .chip-day { font-size: 15px; line-height: 18px; font-weight: 600; }
    .card-title { margin: 0; }
    .city { color: var(--muted-text); margin-top: 2px; }
    .seats { color: var(--ink-secondary); margin-top: var(--s2); }
  `],
})
export class EventCardComponent {
  @Input({ required: true }) ev!: EventSummary;

  get chip() { return chipParts(this.ev.starts_at, this.ev.time_zone); }

  get seats(): string {
    if (this.ev.capacity === null) return 'Unlimited seats';
    const left = this.ev.remaining ?? 0;
    if (left <= 0) return 'Full — waiting list open';
    return `${left} of ${this.ev.capacity} ${left === 1 ? 'seat' : 'seats'} left`;
  }
}

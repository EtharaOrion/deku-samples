import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { PublicBarComponent } from '../ui/public-bar.component';
import { PillComponent } from '../ui/pill.component';
import { ScanCodeComponent } from '../ui/bits';
import { NotFoundPage } from './not-found.page';
import {
  dayLine,
  icsFor,
  timeRange,
  visitorZone,
  zoneAbbrev,
  zonesDiffer,
} from '../core/time';
import { STATUS_TONES, STATUS_WORDS, type TicketView } from '../core/models';

/**
 * Anyone presenting the code, signed in or not, because a ticket that needs an
 * account is not presentable at a door. A single card of 400px centred on the
 * event's own themed ground.
 */
@Component({
  selector: 'app-ticket-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, PillComponent, ScanCodeComponent, NotFoundPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-public-bar />
      <main id="main" class="wrap">
        @if (loading()) {
          <div class="card card--lg ticket" aria-busy="true">
            <div class="skeleton line line--tall"></div>
            <div class="skeleton line"></div>
            <div class="skeleton block"></div>
          </div>
        } @else if (ticket(); as t) {
          <article class="card card--lg ticket">
            <h1 class="ticket__title">{{ t.title }}</h1>

            <div class="ticket__when">
              <p class="ticket__day">{{ dayText(t) }}</p>
              <p class="t-caption ticket__weak">{{ timeText(t) }}</p>
              @if (showVisitorZone(t)) {
                <p class="t-caption ticket__weak">{{ visitorText(t) }}</p>
              }
              <p class="t-caption ticket__weak">{{ t.city || 'Location to be announced' }}</p>
            </div>

            <app-pill [word]="statusWord(t)" [tone]="statusTone(t)" />

            @if (t.checked_in_at) {
              <p class="t-caption ticket__weak">Arrived at {{ arrivalText(t) }}</p>
            }

            <p class="ticket__code">{{ t.ticket_code }}</p>

            <div class="ticket__scan">
              <app-scan-code [payload]="address()" [size]="180" />
            </div>

            <div class="ticket__actions">
              <button type="button" class="btn btn--primary" (click)="addToCalendar(t)">
                Add to Calendar
              </button>
              <a class="btn" [routerLink]="'/' + t.event_slug">View Event</a>
            </div>
          </article>
        }
      </main>
    }
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 96px var(--s4) var(--s8);
        background: var(--event-ground, var(--paper));
      }
      .ticket {
        width: 100%;
        max-width: 400px;
        padding: var(--s6) var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        align-items: center;
        text-align: center;
        background: var(--paper);
      }
      .ticket__title {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 28px;
        line-height: 34px;
      }
      .ticket__when { display: flex; flex-direction: column; gap: 2px; }
      .ticket__day { font-size: 16px; line-height: 24px; font-weight: 500; }
      .ticket__weak { color: var(--ink-64); }
      /* The one place in the product a code may sit in a monospace face. */
      .ticket__code {
        font-family: var(--mono);
        font-size: 22px;
        line-height: 26px;
        letter-spacing: 0.06em;
        padding: var(--s2) var(--s4);
        background: var(--paper-inset);
        border-radius: var(--r-input);
      }
      .ticket__scan { padding: var(--s2); }
      .ticket__actions { display: flex; gap: var(--s2); flex-wrap: wrap; justify-content: center; }
      .line { height: 34px; width: 80%; }
      .line--tall { height: 44px; }
      .block { height: 180px; width: 180px; }
    `,
  ],
})
export class TicketPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private themeService = inject(ThemeService);

  readonly ticket = signal<TicketView | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);

  readonly address = computed(() =>
    typeof location === 'undefined'
      ? ''
      : `${location.origin}/t/${this.ticket()?.ticket_code ?? ''}`,
  );

  constructor() {
    const boot = this.themeService.bootstrapTheme();
    if (boot) this.themeService.apply(boot);
  }

  ngOnInit(): void {
    const code = (this.route.snapshot.paramMap.get('code') ?? '').toUpperCase();
    this.api.ticket(code).subscribe({
      next: (t) => {
        this.ticket.set(t);
        this.loading.set(false);
        document.title = `Ticket · ${t.title}`;
      },
      error: () => {
        // A code that never existed gets the not-found page.
        this.loading.set(false);
        this.missing.set(true);
        this.themeService.clear();
      },
    });
  }

  ngOnDestroy(): void {
    this.themeService.clear();
  }

  dayText(t: TicketView): string {
    return dayLine(t.starts_at, t.time_zone);
  }

  timeText(t: TicketView): string {
    return `${timeRange(t.starts_at, t.ends_at, t.time_zone)} ${zoneAbbrev(t.starts_at, t.time_zone)}`;
  }

  showVisitorZone(t: TicketView): boolean {
    return zonesDiffer(t.starts_at, t.time_zone);
  }

  visitorText(t: TicketView): string {
    const own = visitorZone();
    return `${timeRange(t.starts_at, t.ends_at, own)} ${zoneAbbrev(t.starts_at, own)} your time`;
  }

  arrivalText(t: TicketView): string {
    if (!t.checked_in_at) return '';
    return `${dayLine(t.checked_in_at, t.time_zone)}, ${timeRange(t.checked_in_at, null, t.time_zone)}`;
  }

  statusWord(t: TicketView): string {
    return STATUS_WORDS[t.status];
  }

  statusTone(t: TicketView): any {
    return STATUS_TONES[t.status];
  }

  /** Hands the visitor a calendar file for that event. */
  addToCalendar(t: TicketView): void {
    const blob = new Blob([icsFor({ ...t, slug: t.event_slug })], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.event_slug}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

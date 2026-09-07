import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiRefusal, ApiService } from '../core/api.service';
import type { Ticket } from '../core/models';
import { ScanCodeComponent, StatusPillComponent } from '../shared/ui';
import { IconComponent } from '../shared/icons.component';
import { arrivalLine, dateLine, icsFor, rangeLine, visitorLine, zonesDiffer } from '../core/time';
import { themeFor } from '../core/art';

/**
 * One ticket, readable by anyone presenting the code, signed in or not, because
 * a ticket that needs an account is not presentable at a door. A code that
 * never existed gets the not-found page.
 */
@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [RouterLink, ScanCodeComponent, StatusPillComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ticket-page" [style]="themeStyle()">
      @if (loading()) {
        <div class="card-lg ticket-card">
          <div class="skeleton" style="height: 32px; width: 70%"></div>
          <div class="skeleton" style="height: 20px; width: 50%; margin-top: 12px"></div>
          <div class="skeleton" style="height: 180px; margin-top: 24px; border-radius: 12px"></div>
        </div>
      } @else if (ticket()) {
        @let t = ticket()!;
        <div class="card-lg ticket-card">
          <h1 class="title">{{ t.title }}</h1>

          <div class="when">
            <span class="when-date">{{ dateOf(t) }}</span>
            <span class="when-time">{{ timeOf(t) }}</span>
            @if (showVisitorZone(t)) {
              <span class="when-visitor t-caption">{{ visitorTimeOf(t) }} your time</span>
            }
          </div>

          @if (t.location) {
            <p class="where">
              <app-icon name="pin" [size]="16" />
              {{ t.location }}
            </p>
          }

          <div class="status-row">
            <app-status-pill [status]="t.status" />
            @if (t.checked_in_at) {
              <span class="t-caption arrival">Arrived {{ arrivalOf(t) }}</span>
            }
          </div>

          <!-- The one place a code may sit in a monospace face. -->
          <p class="code t-mono">{{ t.ticket_code }}</p>

          <div class="scan">
            <app-scan-code [value]="ticketUrl()" [size]="180" />
          </div>

          <div class="actions">
            <button type="button" class="btn btn-pill" (click)="addToCalendar(t)">Add to Calendar</button>
            <a class="btn btn-primary btn-pill" [routerLink]="'/' + t.event_slug">View Event</a>
          </div>
        </div>
      }
    </main>
  `,
  styles: [
    `
      .ticket-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        background: var(--event-ground);
        color: var(--event-ink);
      }

      .ticket-card {
        width: 400px;
        max-width: 100%;
        background: var(--paper);
        padding: 32px;
        box-shadow: var(--elev-fine);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 12px;
      }

      .title {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 28px;
        line-height: 34px;
      }

      .when { display: flex; flex-direction: column; gap: 2px; }
      .when-date { font-weight: 500; }
      .when-time, .when-visitor { color: var(--muted); font-size: 15px; }

      .where {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--ink-64);
        font-size: 15px;
      }

      .status-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
      .arrival { color: var(--muted); }

      .code {
        font-size: 22px;
        line-height: 26px;
        letter-spacing: 0.06em;
        padding: 8px 14px;
        border-radius: var(--r-input);
        background: var(--paper-inset);
      }

      .scan { padding: 8px; }

      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
        width: 100%;
      }
    `,
  ],
})
export class TicketComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly ticket = signal<Ticket | null>(null);
  readonly loading = signal(true);

  readonly themeStyle = computed(() => {
    const t = this.ticket();
    if (!t) return '';
    const derived = themeFor(t.theme_hex);
    return `--event-ground:${derived.ground};--event-ink:${derived.ink};`;
  });

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const code = params.get('code') ?? '';
      this.loading.set(true);
      this.api.ticket(code).subscribe({
        next: (t) => {
          this.ticket.set(t);
          this.loading.set(false);
        },
        error: (err: ApiRefusal) => {
          this.loading.set(false);
          if (err.isNotFound) this.router.navigateByUrl('/not-found', { replaceUrl: true });
        },
      });
    });
  }

  ticketUrl() {
    const t = this.ticket();
    return t ? `${location.origin}/t/${t.ticket_code}` : location.href;
  }

  dateOf(t: Ticket) {
    return dateLine(t.starts_at, t.time_zone);
  }

  timeOf(t: Ticket) {
    return rangeLine(t.starts_at, t.ends_at, t.time_zone);
  }

  visitorTimeOf(t: Ticket) {
    return visitorLine(t.starts_at, t.ends_at);
  }

  showVisitorZone(t: Ticket) {
    return zonesDiffer(t.starts_at, t.time_zone);
  }

  arrivalOf(t: Ticket) {
    return arrivalLine(t.checked_in_at, t.time_zone);
  }

  /** Hands the visitor a calendar file for that event. */
  addToCalendar(t: Ticket) {
    const blob = new Blob([icsFor({ ...t, slug: t.event_slug })], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.event_slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

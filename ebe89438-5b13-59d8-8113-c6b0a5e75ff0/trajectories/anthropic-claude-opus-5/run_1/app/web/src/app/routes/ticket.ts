import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { ThemeLayer } from '../core/theme';
import { icsFor, timeOfDay, visitorLine, whenLine } from '../core/timefmt';
import type { Ticket } from '../core/models';
import { PublicBar } from '../ui/chrome';
import { ScanCode, StatusPill } from '../ui/shared';

/**
 * Anyone presenting the code, signed in or not, because a ticket that needs an
 * account is not presentable at a door.
 */
@Component({
  selector: 'app-ticket-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBar, ScanCode, StatusPill],
  template: `
    <app-public-bar />
    <main id="main" class="wrap">
      @if (loading()) {
        <div class="card card-lg tkt">
          <div class="sk sk-title" style="width: 70%"></div>
          <div class="sk sk-text" style="width: 50%"></div>
          <div class="sk" style="height: 180px; width: 180px; margin: 0 auto"></div>
        </div>
      } @else if (ticket(); as t) {
        <div class="card card-lg tkt">
          <h1 class="t-serif tkt-title">{{ t.title }}</h1>
          <p class="tkt-when t-body">{{ whenText() }}</p>
          @if (visitorText(); as v) {
            <p class="tkt-visitor t-caption">{{ v }}</p>
          }
          <p class="tkt-where t-body">{{ t.city }}</p>
          <p class="tkt-status"><app-status-pill [status]="t.status" /></p>
          @if (t.checked_in_at) {
            <p class="t-caption arrived">Arrived at {{ arrivedAt() }}</p>
          }
          <p class="tkt-code">{{ t.ticket_code }}</p>
          <app-scan-code [value]="ticketUrl()" [size]="180" [ink]="'#151515'" />
          <div class="tkt-actions">
            <button type="button" class="btn btn-block" (click)="addToCalendar(t)">Add to Calendar</button>
            <a class="btn btn-primary btn-block" [routerLink]="['/', t.event_slug]">View Event</a>
          </div>
        </div>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--event-ground);
        color: var(--event-ink);
      }
      .wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: calc(64px + var(--s5)) var(--s5) var(--s7);
      }
      .tkt {
        width: 100%;
        max-width: 400px;
        padding: var(--s6) var(--s5);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s3);
        text-align: center;
        background: var(--paper);
      }
      .tkt-title {
        font-size: 28px;
        line-height: 34px;
        color: var(--ink);
      }
      .tkt-when,
      .tkt-where {
        color: var(--ink-secondary);
      }
      .tkt-visitor,
      .arrived {
        color: var(--ink-tertiary);
      }
      /* the one place a code may sit in a monospace face */
      .tkt-code {
        font-family: var(--mono);
        font-size: 22px;
        line-height: 26px;
        letter-spacing: 0.06em;
        color: var(--ink);
        padding: var(--s2) var(--s4);
        background: var(--paper-inset);
        border-radius: var(--r-input);
      }
      .tkt-actions {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        width: 100%;
        margin-top: var(--s2);
      }
    `,
  ],
})
export class TicketRoute {
  readonly code = input.required<string>();
  private api = inject(Api);
  private router = inject(Router);
  private themeLayer = inject(ThemeLayer);

  readonly loading = signal(true);
  readonly ticket = signal<Ticket | null>(null);

  readonly whenText = computed(() => {
    const t = this.ticket();
    return t ? whenLine(t.starts_at, t.ends_at, t.time_zone) : '';
  });

  readonly visitorText = computed(() => {
    const t = this.ticket();
    return t ? visitorLine(t.starts_at, t.time_zone) : null;
  });

  readonly arrivedAt = computed(() => {
    const t = this.ticket();
    return t?.checked_in_at ? timeOfDay(t.checked_in_at, t.time_zone) : '';
  });

  readonly ticketUrl = computed(() =>
    typeof location !== 'undefined' ? `${location.origin}/t/${this.code()}` : `/t/${this.code()}`
  );

  constructor() {
    queueMicrotask(() => {
      this.api.ticket(this.code()).subscribe({
        next: (t) => {
          this.themeLayer.apply(t.theme_hex);
          this.ticket.set(t);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.router.navigate(['/not-found'], { skipLocationChange: true });
        },
      });
    });
  }

  /** Hands the visitor a calendar file for that event. */
  addToCalendar(t: Ticket) {
    const blob = new Blob([icsFor(t)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.event_slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

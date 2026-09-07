import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Ticket } from '../core/models';
import { ThemeService } from '../core/theme.service';
import { formatDateTime, formatRange, icsFor, visitorZone, zoneAbbrev, zonesDiffer } from '../core/time';
import { PillComponent } from '../ui/pill.component';
import { ScanCodeComponent } from '../ui/scan-code.component';
import { TopBarComponent } from '../ui/top-bar.component';
import { NotFoundComponent } from './not-found.component';

/**
 * Anyone presenting the code, signed in or not, because a ticket that needs an
 * account is not presentable at a door. A code that never existed gets the
 * ordinary not-found page.
 */
@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [RouterLink, TopBarComponent, PillComponent, ScanCodeComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <div class="themed">
        <div class="ground anim-theme-fade" aria-hidden="true"></div>
        <app-top-bar />
        <main class="page" id="main">
          @if (loading()) {
            <div class="ticket-card">
              <div class="sk sk-title" style="height:34px;width:70%"></div>
              <div class="sk sk-line" style="width:55%"></div>
              <div class="sk" style="height:160px;width:160px;margin:24px auto;border-radius:8px"></div>
            </div>
          } @else if (ticket(); as t) {
            <article class="ticket-card">
              <h1 class="t-serif">{{ t.title }}</h1>

              <p class="t-row when">{{ whenEvent() }}</p>
              <p class="t-caption zone">{{ eventZoneLabel() }}</p>
              @if (showVisitorZone()) {
                <p class="t-caption zone">{{ whenVisitor() }} your time</p>
              }
              <p class="t-row place">{{ t.location || t.city }}</p>

              <div class="state">
                <app-pill [status]="t.status" />
                @if (t.checked_in_at) {
                  <span class="t-caption arrived">Arrived {{ arrivedAt() }}</span>
                }
              </div>

              <p class="code">{{ t.ticket_code }}</p>

              <app-scan-code class="scan" [value]="ticketUrl()" [size]="168" />

              <div class="actions">
                <button type="button" class="btn btn-pill" (click)="addToCalendar()">Add to Calendar</button>
                <a class="btn btn-pill" [routerLink]="['/', t.event_slug]">View Event</a>
              </div>
            </article>
          }
        </main>
      </div>
    }
  `,
  styles: [
    `
      .themed {
        min-height: 100vh;
        background: var(--event-ground);
        color: var(--event-ink);
        position: relative;
      }
      .ground {
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background-image: radial-gradient(circle at 3% -50%, var(--event-stop-1), transparent 55%),
          radial-gradient(circle at 66% -175%, var(--event-stop-2), transparent 55%),
          radial-gradient(circle at -50% 120%, var(--event-stop-3), transparent 55%),
          radial-gradient(circle at 62% 100%, var(--event-stop-4), transparent 55%);
        animation: event-theme-fade-in 2000ms linear forwards;
      }
      .page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 96px var(--s4) var(--s8);
      }
      .ticket-card {
        width: 100%;
        max-width: 400px;
        background: var(--event-panel);
        border: 1px solid var(--event-hairline);
        border-radius: var(--r-card-lg);
        padding: var(--s6);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        text-align: center;
        align-items: center;
        backdrop-filter: blur(8px);
      }
      h1 {
        font-size: 28px;
        line-height: 34px;
        color: var(--event-ink);
      }
      .when {
        color: var(--event-ink);
      }
      .zone,
      .place {
        color: var(--event-ink-secondary);
      }
      .place {
        color: var(--event-ink);
        opacity: 0.7;
      }
      .state {
        display: flex;
        align-items: center;
        gap: var(--s2);
        margin-top: var(--s3);
        flex-wrap: wrap;
        justify-content: center;
      }
      .arrived {
        color: var(--event-ink-secondary);
      }
      .code {
        font-family: var(--mono);
        font-size: 22px;
        line-height: 26px;
        letter-spacing: 0.06em;
        margin-top: var(--s3);
        color: var(--event-ink);
      }
      .scan {
        margin: var(--s3) 0;
      }
      .actions {
        display: flex;
        gap: var(--s2);
        flex-wrap: wrap;
        justify-content: center;
      }
      .actions .btn {
        border-color: var(--event-hairline);
        background: transparent;
        color: var(--event-ink);
      }
    `,
  ],
})
export class TicketComponent {
  code = input.required<string>();

  private api = inject(ApiService);
  private theme = inject(ThemeService);

  readonly ticket = signal<Ticket | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  private loaded = '';

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load() {
    const code = this.code();
    if (this.loaded === code) return;
    this.loaded = code;
    try {
      const t = await this.api.ticket(code);
      this.theme.apply(t.theme_hex);
      this.ticket.set(t);
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  readonly ticketUrl = computed(() => `${location.origin}/t/${this.code().toUpperCase()}`);

  readonly whenEvent = computed(() => {
    const t = this.ticket();
    return t ? formatRange(t.starts_at, t.ends_at, t.time_zone) : '';
  });

  readonly eventZoneLabel = computed(() => {
    const t = this.ticket();
    return t ? `${t.time_zone} (${zoneAbbrev(t.starts_at, t.time_zone)})` : '';
  });

  readonly showVisitorZone = computed(() => {
    const t = this.ticket();
    return !!t && zonesDiffer(t.starts_at, t.time_zone);
  });

  readonly whenVisitor = computed(() => {
    const t = this.ticket();
    return t ? `${formatRange(t.starts_at, t.ends_at, visitorZone())} (${zoneAbbrev(t.starts_at, visitorZone())})` : '';
  });

  readonly arrivedAt = computed(() => {
    const t = this.ticket();
    return t?.checked_in_at ? formatDateTime(t.checked_in_at, visitorZone()) : '';
  });

  addToCalendar() {
    const t = this.ticket();
    if (!t) return;
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

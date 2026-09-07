import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Ticket, statusPillClass, statusWord } from '../models';
import { formatInZone, formatRange, icsFor, visitorZone, zonesDiffer } from '../core/time';
import { ScanCodeComponent, SkeletonComponent } from '../shared/ui.components';
import { TopBarComponent } from '../shared/top-bar.component';
import { NotFoundComponent } from './system.component';
import { applyTheme } from '../core/theme';

/**
 * One ticket, readable by anyone presenting the code, signed in or not,
 * because a ticket that needs an account is not presentable at a door. A code
 * that never existed gets the not-found page.
 */
@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [
    RouterLink, TopBarComponent, ScanCodeComponent, SkeletonComponent, NotFoundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <div class="themed-root">
        <app-top-bar />
        <main id="main" class="wrap" role="main">
          @if (loading()) {
            <div class="card card-lg ticket">
              <app-skeleton w="70%" h="32px" radius="8px" />
              <div style="height:16px"></div>
              <app-skeleton w="50%" h="18px" />
              <div style="height:24px"></div>
              <app-skeleton w="180px" h="180px" radius="12px" />
            </div>
          } @else if (t()) {
            @let tk = t()!;
            <div class="card card-lg ticket">
              <h1 class="title display">{{ tk.title }}</h1>

              <p class="when">{{ range(tk) }}</p>
              @if (showVisitorZone(tk)) {
                <p class="caption second-zone">{{ visitorLine(tk) }} your time</p>
              }
              <p class="where secondary">{{ tk.city }}</p>

              <p class="status-row">
                <span [class]="pill(tk)">{{ word(tk) }}</span>
                @if (tk.checked_in_at) {
                  <span class="caption arrived">Arrived {{ arrival(tk) }}</span>
                }
              </p>

              <p class="code">{{ tk.ticket_code }}</p>

              <div class="scan">
                <app-scan-code [text]="ticketUrl()" [size]="180"
                               label="Scan code for this ticket" />
              </div>

              <div class="actions">
                <button type="button" class="btn btn-primary" (click)="addToCalendar(tk)">
                  Add to Calendar
                </button>
                <a class="btn btn-secondary" [routerLink]="['/', tk.event_slug]">View Event</a>
              </div>
            </div>
          }
        </main>
      </div>
    }
  `,
  styles: [`
    .themed-root { min-height: 100vh; background: var(--event-ground); color: var(--event-ink); }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 112px var(--s4) var(--s8); }
    .ticket {
      width: 400px; max-width: 100%; padding: var(--s6); text-align: center;
      background: var(--paper);
    }
    .title { font-size: 26px; line-height: 32px; }
    .when { margin-top: var(--s4); font-weight: 500; }
    .second-zone { color: var(--muted-text); margin-top: 2px; }
    .where { margin-top: var(--s1); }
    .status-row { margin-top: var(--s4); display: flex; gap: var(--s2);
      align-items: center; justify-content: center; flex-wrap: wrap; }
    .arrived { color: var(--muted-text); }
    /* the one place a code may sit in a monospace face */
    .code {
      font-family: var(--mono); font-size: 22px; line-height: 26px;
      letter-spacing: 0.06em; margin-top: var(--s4);
    }
    .scan { display: flex; justify-content: center; margin-top: var(--s4); }
    .actions { display: flex; gap: var(--s2); justify-content: center;
      margin-top: var(--s5); flex-wrap: wrap; }
  `],
})
export class TicketComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  t = signal<Ticket | null>(null);
  loading = signal(true);
  missing = signal(false);

  ngOnInit() {
    const code = this.route.snapshot.paramMap.get('code') ?? '';
    this.api.getTicket(code).subscribe({
      next: (tk) => {
        this.t.set(tk);
        this.loading.set(false);
        applyTheme(tk.theme);
      },
      error: () => { this.missing.set(true); this.loading.set(false); },
    });
  }

  ticketUrl(): string {
    return `${window.location.origin}/t/${this.t()?.ticket_code ?? ''}`;
  }

  range(tk: Ticket) { return formatRange(tk.starts_at, tk.ends_at, tk.time_zone); }
  showVisitorZone(tk: Ticket) { return zonesDiffer(tk.starts_at, tk.time_zone); }
  visitorLine(tk: Ticket) { return formatInZone(tk.starts_at, visitorZone()); }
  arrival(tk: Ticket) { return formatInZone(tk.checked_in_at, tk.time_zone); }
  word(tk: Ticket) { return statusWord(tk.status); }
  pill(tk: Ticket) { return statusPillClass(tk.status); }

  /** Hands the visitor a calendar file for that event, built in the browser. */
  addToCalendar(tk: Ticket) {
    const ics = icsFor({
      title: tk.title, starts_at: tk.starts_at, ends_at: tk.ends_at,
      city: tk.city, slug: tk.event_slug,
    }, `${window.location.origin}/${tk.event_slug}`);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tk.event_slug}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

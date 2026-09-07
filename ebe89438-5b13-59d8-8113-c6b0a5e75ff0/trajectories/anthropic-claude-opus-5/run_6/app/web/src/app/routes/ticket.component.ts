import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';
import { PillComponent } from '../ui/pill.component';
import { ScanCodeComponent } from '../ui/scan-code.component';
import { ApiService } from '../core/api.service';
import { Ticket } from '../core/models';
import { deriveTheme } from '../core/art';
import { icsFor, longDateIn, timeRangeIn, visitorZone, zonesDiffer } from '../core/time';

/** Anyone presenting the code, signed in or not: the code is the credential. */
@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, PillComponent, ScanCodeComponent],
  template: `
    <div class="theme-root" [style]="themeStyle()">
      <app-public-bar />
      <main id="main" class="wrap">
        @if (loading()) {
          <div class="card card-lg ticket"><div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text"></div></div>
        }
      @if (!loading() && ticket(); as t) {
          <div class="card card-lg ticket">
            <h1 class="serif title">{{ t.title }}</h1>
            <p class="t-body">{{ longDate(t) }}</p>
            <p class="t-caption sub">{{ timeRange(t) }}</p>
            @if (differs(t)) { <p class="t-caption sub">{{ visitorLine(t) }} your time</p> }
            <p class="t-body place">{{ t.city }}</p>

            <app-pill [status]="t.status" />
            @if (t.checked_in_at) {
              <p class="t-caption sub">Arrived {{ arrival(t) }}</p>
            }

            <code class="code">{{ t.ticket_code }}</code>
            <app-scan-code [payload]="ticketUrl(t)" [size]="180" />

            <div class="actions">
              <button type="button" class="btn btn-primary" (click)="addToCalendar(t)">Add to Calendar</button>
              <a class="btn btn-primary" [routerLink]="['/', t.event_slug]">View Event</a>
            </div>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    .theme-root { min-height: 100vh; background: var(--event-ground); color: var(--event-ink); }
    .wrap { display: flex; align-items: center; justify-content: center; padding: 96px 24px 48px; }
    .ticket {
      width: 100%; max-width: 400px; padding: 32px; text-align: center;
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      background: var(--paper);
    }
    .title { font-size: 28px; line-height: 34px; }
    .sub { color: var(--ink-64); }
    .place { color: var(--ink-64); }
    .code { font-family: var(--mono); font-size: 22px; line-height: 26px; letter-spacing: 0.04em; border-radius: 4px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
  `],
})
export class TicketComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ticket = signal<Ticket | null>(null);
  loading = signal(true);

  themeStyle = computed(() => {
    const t = this.ticket();
    if (!t) return '';
    const d = deriveTheme(t.theme_hex);
    return `--event-ground:${d.ground};--event-ink:${d.ink};--event-accent:${d.theme}`;
  });

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      this.loading.set(true);
      this.api.getTicket(p.get('code') || '').subscribe({
        next: (t) => { this.ticket.set(t); this.loading.set(false); },
        error: () => { this.loading.set(false); this.router.navigateByUrl('/404', { skipLocationChange: true }); },
      });
    });
  }

  longDate(t: Ticket) { return longDateIn(t.starts_at, t.time_zone); }
  timeRange(t: Ticket) { return timeRangeIn(t.starts_at, t.ends_at, t.time_zone); }
  differs(t: Ticket) { return zonesDiffer(t.starts_at, t.time_zone); }
  visitorLine(t: Ticket) { return timeRangeIn(t.starts_at, t.ends_at, visitorZone()); }
  arrival(t: Ticket) { return longDateIn(t.checked_in_at, t.time_zone); }
  ticketUrl(t: Ticket) { return `${location.origin}/t/${t.ticket_code}`; }

  addToCalendar(t: Ticket) {
    const blob = new Blob([icsFor({
      title: t.title, slug: t.event_slug, starts_at: t.starts_at,
      ends_at: t.ends_at, city: t.city,
    })], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${t.event_slug}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
}

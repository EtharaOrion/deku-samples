import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api } from '../api';
import { themeFromHex } from '../theme';
import { StatusPillComponent, NotFoundEmbedComponent } from './bits';
import { fmtInZone } from './event';

/** /t/<code>: one ticket, presentable without an account. */
@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusPillComponent, NotFoundEmbedComponent],
  template: `
    @if (loading) {
      <main class="wrap"><div class="card card-24 ticket" style="min-height:320px">
        <div class="skeleton" style="height:28px;width:60%"></div><div class="skeleton" style="height:20px;width:40%;margin-top:12px"></div>
      </div></main>
    } @else if (!t) {
      <app-not-found-embed />
    } @else {
      <main class="wrap" [style.background]="th.ground" [style.color]="th.ink">
        <div class="card card-24 ticket">
          <h1 class="t-title">{{ t.title }}</h1>
          <p class="t-when">{{ when }}</p>
          @if (visitorWhen) { <p class="t-when-visitor">{{ visitorWhen }}</p> }
          <p class="t-place">{{ t.city }}</p>
          <app-status [status]="t.status" />
          <p class="t-code mono">{{ t.ticket_code }}</p>
          @if (t.checked_in_at) { <p class="t-arrived">Arrived {{ t.checked_in_at | date:'HH:mm' }}</p> }
          <div class="t-actions">
            <a class="btn btn-secondary" [href]="icsHref" [download]="t.event_slug + '.ics'">Add to Calendar</a>
            <a class="btn btn-ghost" [routerLink]="['/', t.event_slug]">View Event</a>
          </div>
        </div>
      </main>
    }
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .ticket { width: 400px; max-width: 100%; padding: 32px; display: flex; flex-direction: column; gap: 12px; }
    .t-title { font-family: var(--serif); font-size: 28px; line-height: 34px; font-weight: 400; }
    .t-when { font-size: 16px; line-height: 24px; }
    .t-when-visitor { font-size: 13px; line-height: 18px; opacity: .6; }
    .t-place { font-size: 16px; line-height: 24px; }
    .t-code { font-size: 22px; line-height: 26px; letter-spacing: .06em; }
    .t-arrived { font-size: 13px; line-height: 16px; color: #1a7f2e; }
    .t-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  `],
})
export class TicketComponent implements OnInit {
  loading = true;
  t: any = null;
  th = themeFromHex('#146aeb');
  private api = inject(Api);
  private route = inject(ActivatedRoute);

  get when() { return this.t ? fmtInZone(this.t.starts_at, this.t.ends_at, this.t.time_zone) : ''; }
  get visitorWhen() {
    if (!this.t) return null;
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z === this.t.time_zone) return null;
    return `${fmtInZone(this.t.starts_at, this.t.ends_at, z)} · your time`;
  }
  get icsHref() {
    if (!this.t) return '#';
    const dt = (s: string) => new Date(s).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Deku//Community Calendar//EN',
      'BEGIN:VEVENT',
      `UID:${this.t.ticket_code}@deku`, `DTSTAMP:${dt(new Date().toISOString())}`,
      `DTSTART:${dt(this.t.starts_at)}`, `DTEND:${dt(this.t.ends_at)}`,
      `SUMMARY:${this.t.title}`, `LOCATION:${this.t.city}`,
      `DESCRIPTION:Ticket ${this.t.ticket_code}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }

  ngOnInit() {
    const code = this.route.snapshot.paramMap.get('code') ?? '';
    this.api.getTicket(code).subscribe((t: any) => {
      this.t = t;
      this.th = themeFromHex(t.theme_hex ?? '#146aeb');
      this.loading = false;
    }, () => { this.t = null; this.loading = false; });
  }
}

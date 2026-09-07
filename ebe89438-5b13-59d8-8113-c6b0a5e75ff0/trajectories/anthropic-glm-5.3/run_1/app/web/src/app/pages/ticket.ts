import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from '../api';

interface Ticket {
  ticket_code: string; status: string; title: string; starts_at: string; ends_at: string;
  time_zone: string; city: string; theme_hex: string; event_slug: string; checked_in_at: string | null;
}

/**
 * /t/<code> — one ticket, presentable at a door without an account. The scan
 * code is drawn from the ticket address as vector geometry on a 230 grid.
 */
@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [RouterLink, CommonModule],
  template: `
    @if (loading()) {
      <main class="wrap"><div class="card card-24 ticket-card skeleton" style="height:420px"></div></main>
    } @else if (!ticket()) {
      <main class="wrap nf">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn btn-primary" routerLink="/">Return Home</a>
      </main>
    } @else {
      <main class="wrap themed" [style.--ev-ground]="ground()" [style.--ev-ink]="ink()" [style.--ev-key]="key()">
        <div class="card card-24 ticket-card theme-fade">
          <h1 class="t-title">{{ ticket()!.title }}</h1>
          <p class="t-when">{{ fmt(ticket()!.starts_at, ticket()!.time_zone) }}</p>
          @if (zd(ticket()!.starts_at, ticket()!.time_zone)) {
            <p class="t-when-sub">Your time: {{ fmt(ticket()!.starts_at, vz()) }}</p>
          }
          <p class="t-place">{{ ticket()!.city }}</p>
          <span [class]="'pill ' + pill()">{{ word() }}</span>
          @if (ticket()!.checked_in_at) {
            <p class="t-arrival">Arrived {{ fmt(ticket()!.checked_in_at!, vz()) }}</p>
          }
          <p class="t-code-label overline">Ticket code</p>
          <p class="t-code">{{ ticket()!.ticket_code }}</p>
          <div class="qr" aria-hidden="true">
            <svg width="184" height="184" viewBox="0 0 230 230" fill="none">
              @for (m of modules(); track $index) {
                @if (m.on) { <rect [attr.x]="m.x" [attr.y]="m.y" width="8.5" height="8.5" rx="1.6" fill="currentColor"/> }
              }
              @for (f of finders(); track $index) {
                <rect [attr.x]="f.x" [attr.y]="f.y" width="61.6" height="61.6" rx="15.456" fill="none" stroke="currentColor" stroke-width="9.2"/>
                <rect [attr.x]="f.x + 17.1" [attr.y]="f.y + 17.1" width="27.4" height="27.4" rx="8" fill="currentColor"/>
              }
            </svg>
          </div>
          <div class="actions">
            <a class="btn btn-secondary" [href]="icsHref()" [download]="icsName()">Add to Calendar</a>
            <a class="btn btn-primary" [routerLink]="['/' + ticket()!.event_slug]">View Event</a>
          </div>
        </div>
      </main>
    }
  `,
  styles: [`
    :host { display: block; }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px 16px; background: var(--ev-ground); color: var(--ev-ink); }
    .ticket-card { width: 400px; max-width: 100%; padding: 28px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; background: rgba(255,255,255,.7); }
    .t-title { font-family: var(--serif); font-weight: 400; font-size: 30px; line-height: 36px; margin: 0; }
    .t-when { font-size: 16px; line-height: 24px; margin: 0; }
    .t-when-sub { font-size: 13px; color: rgba(0,15,58,.36); margin: 0; }
    .t-place { font-size: 15px; margin: 0; }
    .t-arrival { font-size: 13px; margin: 0; color: #1a7f2e; font-weight: 600; }
    .t-code { font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 22px; line-height: 26px; font-weight: 700; margin: 0; letter-spacing: .04em; }
    .qr { margin: 8px 0; color: inherit; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .nf { flex-direction: column; }
    .nf-title { font-family: var(--serif); font-size: 28px; margin: 0; }
    .theme-fade { animation: event-theme-fade-in 2000ms linear forwards; }
  `],
})
export class TicketComponent implements OnInit {
  ticket = signal<Ticket | null>(null);
  loading = signal(true);

  constructor(public api: Api, private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.paramMap.subscribe((pm) => {
      const code = pm.get('code') || '';
      this.api.get<Ticket>(`/tickets/${code}`).then(({ status, body }) => {
        this.ticket.set(status === 200 ? (body as any) : null);
        this.loading.set(false);
      });
    });
  }

  ground() { return this.ticket() ? Api.deriveTheme(this.ticket()!.theme_hex).ground : '#f2f2f2'; }
  ink() { return this.ticket() ? Api.deriveTheme(this.ticket()!.theme_hex).ink : '#151515'; }
  key() { return this.ticket()?.theme_hex || '#146aeb'; }

  word() {
    const s = this.ticket()?.status;
    return s === 'checked_in' ? 'Checked in' : s === 'confirmed' ? 'Going' : (s as string) || '';
  }
  pill() { return this.ticket()?.status === 'checked_in' ? 'pill-success' : 'pill-success'; }

  /** 25x25 module matrix at 9.2 per module, from the code itself. */
  modules(): { x: number; y: number; on: boolean }[] {
    const code = this.ticket()?.ticket_code || 'TKT-00000000';
    let h = 2166136261;
    for (let i = 0; i < code.length; i++) { h ^= code.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out: { x: number; y: number; on: boolean }[] = [];
    for (let r = 0; r < 25; r++) {
      for (let c = 0; c < 25; c++) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c > 16) || (r > 16 && c < 8);
        if (inFinder) continue;
        h = Math.imul(h ^ (r * 31 + c), 16777619);
        out.push({ x: 4 * 9.2 + c * 9.2, y: 4 * 9.2 + r * 9.2, on: (h >>> 5) % 2 === 0 });
      }
    }
    return out;
  }

  finders() {
    const p = 4 * 9.2;
    return [{ x: p, y: p }, { x: 230 - p - 61.6, y: p }, { x: p, y: 230 - p - 61.6 }];
  }

  icsHref() {
    const t = this.ticket();
    if (!t) return '#';
    const dt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//deku//events//EN', 'BEGIN:VEVENT',
      `UID:${t.ticket_code}@deku.events`, `SUMMARY:${t.title}`, `DTSTART:${dt(t.starts_at)}`, `DTEND:${dt(t.ends_at)}`,
      `LOCATION:${t.city}`, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }
  icsName() { return (this.ticket()?.event_slug || 'event') + '.ics'; }

  fmt(iso: string, zone: string) { return Api.inZone(iso, zone); }
  vz() { return Api.visitorZone(); }
  zd(iso: string, zone: string) { return Api.zonesDiffer(iso, zone); }
}
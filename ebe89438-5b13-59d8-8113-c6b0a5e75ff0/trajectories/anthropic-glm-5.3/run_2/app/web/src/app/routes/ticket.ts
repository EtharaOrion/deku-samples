import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { Api, ApiError } from '../core/api';
import { NotFoundEmbed } from './not-found-embed';
import { deriveTheme, ThemeTokens } from '../core/theme';
import { TimeFmt } from '../core/time';

/** A ticket that needs an account is not presentable at a door. */
@Component({
  selector: 'cc-ticket',
  standalone: true,
  imports: [FormsModule, PublicBar, RouterLink, NotFoundEmbed],
  template: `
  <cc-public-bar></cc-public-bar>
  @if (loading) {
    <main class="wrap"><div class="skeleton card sk"></div></main>
  } @else if (!t) {
    <cc-not-found-embed></cc-not-found-embed>
  } @else {
    <main class="wrap" [style.--t-ground]="theme.ground" [style.--t-ink]="theme.ink"
          [style.--t-soft]="theme.inkSoft" [style.--t-line]="theme.hairline"
          [style.--t-fill]="theme.panelFill" [style.--t-sunk]="theme.sunk">
      <article class="card ticket">
        <p class="overline soft">Ticket</p>
        <h1 class="h1-display title">{{ t.title }}</h1>
        <p class="when">{{ when.primary }}</p>
        @if (when.secondary) { <p class="when-sec">{{ when.secondary }}</p> }
        <p class="place">{{ t.city }}</p>
        <span class="pill" [class.pill-ok]="t.status==='checked_in' || t.status==='confirmed'"
              [class.pill-neutral]="t.status!=='checked_in' && t.status!=='confirmed'">
          <span class="pill-dot"></span>{{ statusWord }}
        </span>
        @if (t.checked_in_at) { <p class="caption">Arrived {{ arrived }}</p> }
        <p class="code">{{ t.ticket_code }}</p>
        <svg class="qr" viewBox="0 0 230 230" role="img" aria-label="Scan code for this ticket">
          <rect x="0" y="0" width="230" height="230" fill="var(--t-ground)"/>
          @for (m of modules; track m.i) {
            <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" fill="var(--t-ink)"/>
          }
          @for (f of finders; track f.x) {
            <rect [attr.x]="f.x" [attr.y]="f.y" width="56.4" height="56.4" rx="15.456"
                  fill="none" stroke="var(--t-ink)" stroke-width="9.2"/>
          }
        </svg>
        <div class="row wrap-actions">
          <button class="btn btn-secondary btn-sm" type="button" (click)="download()">Add to Calendar</button>
          <a class="btn btn-secondary btn-sm" [routerLink]="['/', t.event_slug]">View Event</a>
        </div>
      </article>
    </main>
  }`,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 96px 16px;
      background: var(--t-ground); }
    .sk { width: 400px; height: 420px; }
    .ticket { width: 400px; max-width: 100%; padding: 28px; border-radius: 24px;
      background: var(--t-fill); border: 1px solid var(--t-line); color: var(--t-ink);
      display: grid; gap: 12px; justify-items: start; }
    .soft { color: var(--t-soft); }
    .title { font-size: 28px; line-height: 34px; margin: 0; }
    .when { font-size: 16px; margin: 0; }
    .when-sec { font-size: 13px; color: var(--t-soft); margin: 0; }
    .place { font-size: 15px; color: var(--t-soft); margin: 0; }
    .code { font-family: var(--mono); font-size: 22px; line-height: 26px; margin: 8px 0; letter-spacing: 0.04em; }
    .qr { width: 190px; height: 190px; border-radius: 11px; justify-self: center; }
    .wrap-actions { width: 100%; justify-content: space-between; }
  `],
})
export class Ticket implements OnInit {
  loading = true;
  t: any = null;
  theme = deriveTheme('#151515');
  modules: { i: number; x: number; y: number }[] = [];
  finders = [
    { x: 36.8, y: 36.8 }, { x: 137.0, y: 36.8 }, { x: 36.8, y: 137.0 },
  ];

  constructor(private route: ActivatedRoute, private api: Api, private fmt: TimeFmt) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      const code = m.get('code') ?? '';
      try {
        this.t = await this.api.request<any>(`/tickets/${code}`);
        this.theme = deriveTheme(this.t.theme_hex);
        this.buildQr(`${location.origin}/t/${code}`);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        this.t = null;
      } finally { this.loading = false; }
    });
  }

  /** A scan code drawn as vector geometry from the ticket address. */
  private buildQr(text: string): void {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const out: { i: number; x: number; y: number }[] = [];
    const quiet = 4;
    const size = 25;
    let s = h;
    const next = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const inFinder = (r: number, c: number) =>
          (r < 7 && c < 7) || (r < 7 && c >= 18) || (r >= 18 && c < 7);
        if (inFinder(row, col)) continue;
        if (next() > 0.5) out.push({ i: row * size + col, x: (quiet + col) * 9.2, y: (quiet + row) * 9.2 });
      }
    }
    this.modules = out;
  }

  get when(): { primary: string; secondary: string | null } {
    return this.t ? this.fmt.both(this.t.starts_at, this.t.time_zone) : { primary: '', secondary: null };
  }

  get arrived(): string {
    return this.t?.checked_in_at ? this.fmt.inZone(this.t.checked_in_at, this.fmt.localZone()) : '';
  }

  get statusWord(): string {
    const map: Record<string, string> = {
      confirmed: 'Confirmed', checked_in: 'Checked in', waitlisted: 'On the waiting list',
      pending_approval: 'Awaiting the host', declined: 'Declined',
      cancelled_by_guest: 'Cancelled', cancelled_by_host: 'Cancelled by the host',
    };
    return map[this.t?.status] ?? this.t?.status ?? '';
  }

  download(): void {
    if (!this.t) return;
    const start = this.t.starts_at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const end = this.t.ends_at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Community Calendar//EN',
      'BEGIN:VEVENT', `UID:${this.t.ticket_code}@calendar.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
      `DTSTART:${start}`, `DTEND:${end}`,
      `SUMMARY:${this.t.title}`, `LOCATION:${this.t.city}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${this.t.event_slug}.ics`; a.click();
    URL.revokeObjectURL(url);
  }
}

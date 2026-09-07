import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { Registration } from '../../core/auth.service';
import { applyTheme, themeFor } from '../../core/theme';
import { eventWhen, eventZoneTag, visitorWhen, sameZone, icsFor } from '../../core/time';
import { statusLabel, statusTone } from '../../core/visuals';
import { NotFoundComponent } from '../not-found/not-found.component';

@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, NotFoundComponent],
  template: `
    @if (notFound()) {
      <app-not-found />
    } @else {
      @if (ticket(); as t) {
      <div class="event-theme wrap">
        <div class="event-theme-ground" aria-hidden="true"></div>
        <div class="card-lg ticket">
          <span class="overline">Ticket</span>
          <h1 class="serif title">{{ t.title }}</h1>
          <p class="when">{{ when(t) }}</p>
          <p class="zone">{{ zone(t) }}</p>
          @if (!sameZone(t.time_zone)) {
            <p class="zone visitor">{{ visitorLine(t) }}</p>
          }
          <p class="place">{{ t.city }}</p>
          <span class="pill with-dot" [class]="'pill with-dot tone-' + tone(t)">{{ label(t) }}</span>
          @if (t.checked_in_at) {
            <p class="caption arrived">Arrived {{ t.checked_in_at | date: 'd MMM y, HH:mm' }} UTC</p>
          }
          <div class="code-block">
            <span class="caption codelabel">Ticket code</span>
            <code class="code">{{ t.ticket_code }}</code>
          </div>
          <div class="scan" aria-hidden="true">
            <svg viewBox="0 0 230 230" width="200" height="200">
              @for (m of modules(); track $index) {
                <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" fill="currentColor" rx="1.2" />
              }
            </svg>
          </div>
          <div class="row">
            <button class="btn btn-theme" (click)="addToCalendar(t)">Add to Calendar</button>
            <a class="btn btn-secondary" [routerLink]="['/', t.event_slug]">View Event</a>
          </div>
        </div>
      </div>
      } @else {
        <div class="wrap loading" aria-busy="true">
          <div class="card-lg ticket"><div class="skeleton" style="height:28px;width:70%"></div><div class="skeleton" style="height:20px;width:40%"></div><div class="skeleton" style="height:120px"></div></div>
        </div>
      }
    }
  `,
  styles: [`
    .wrap { min-height: calc(100vh - 64px); display: flex; align-items: center; justify-content: center; padding: 96px 24px 64px; }
    .ticket { width: 400px; padding: 28px; display: flex; flex-direction: column; gap: 12px; background: var(--event-ground); color: var(--event-ink); position: relative; z-index: 1; }
    .title { font-size: 28px; line-height: 34px; }
    .when { font-size: 16px; line-height: 24px; }
    .zone { color: var(--event-ink-secondary); font-size: 13px; line-height: 18px; }
    .code-block { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .code { font-family: ui-monospace, monospace; font-size: 22px; line-height: 26px; letter-spacing: 0.06em; padding: 8px 12px; border-radius: var(--r-input); background: var(--event-panel); border: 1px solid var(--event-hairline); align-self: flex-start; }
    .scan { align-self: center; color: var(--event-ink); opacity: 0.9; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
    .arrived { color: #0a7a24; }
  `],
})
export class TicketComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  ticket = signal<(Registration & { title: string; starts_at: string; time_zone: string; city: string; event_slug: string }) | null>(null);
  notFound = signal(false);
  modules = signal<Array<{ x: number; y: number }>>([]);

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code') ?? '';
    const t = await this.api.getTicket(code);
    if (!t) { this.notFound.set(true); return; }
    this.ticket.set(t as never);
    const theme = themeFor((t as any).theme_hex ?? '#146aeb');
    applyTheme(document.body, theme);
    document.documentElement.classList.add('theme-warm');
    document.documentElement.style.setProperty('--bar-ink', theme.ink);
    document.documentElement.style.setProperty('--bar-ink-secondary', theme.inkSecondary);
    this.modules.set(this.qrModules(window.location.href.split('?')[0]));
  }

  /** Vector scan code drawn from the ticket address: 25x25 modules, 4-module quiet zone. */
  qrModules(url: string): Array<{ x: number; y: number }> {
    const n = 25;
    let h = 2166136261;
    for (let i = 0; i < url.length; i++) { h ^= url.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = (): number => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const finder = (x: number, y: number, mx: number, my: number): boolean =>
      (x >= mx && x < mx + 7 && y >= my && y < my + 7) &&
      !(x > mx + 1 && x < mx + 5 && y > my + 1 && y < my + 5 && !(x === mx + 2 || x === mx + 4 || y === my + 2 || y === my + 4));
    const out: Array<{ x: number; y: number }> = [];
    const quiet = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const inTL = x < 7 && y < 7;
        const inTR = x >= n - 7 && y < 7;
        const inBL = x < 7 && y >= n - 7;
        let on: boolean;
        if (inTL) on = ringOn(x, y, 0, 0);
        else if (inTR) on = ringOn(x, y, n - 7, 0);
        else if (inBL) on = ringOn(x, y, 0, n - 7);
        else on = rnd() > 0.5;
        if (on) out.push({ x: (quiet + x) * 9.2, y: (quiet + y) * 9.2 });
      }
    }
    return out;

    function ringOn(x: number, y: number, mx: number, my: number): boolean {
      const dx = x - mx, dy = y - my;
      const outer = dx >= 0 && dx < 7 && dy >= 0 && dy < 7;
      const inner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      const hole = dx >= 1 && dx <= 5 && dy >= 1 && dy <= 5 && !inner;
      return outer && !hole;
    }
  }

  addToCalendar(t: any): void {
    const ics = icsFor({ title: t.title, city: t.city, starts_at: t.starts_at, ends_at: (t as any).ends_at ?? t.starts_at, slug: t.event_slug });
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t.event_slug}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  when(t: any): string { return eventWhen(t.starts_at, t.time_zone); }
  zone(t: any): string { return eventZoneTag(t.starts_at, t.time_zone); }
  visitorLine(t: any): string { return `${visitorWhen(t.starts_at)} your time`; }
  sameZone = sameZone;
  tone(t: any): string { return statusTone(t.status); }
  label(t: any): string { return statusLabel(t.status); }
}

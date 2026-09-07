import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { TimeService } from '../time.service';
import { TopbarComponent } from '../ui/topbar.component';
import { applyThemeVars, clearThemeVars, deriveTheme } from '../theme';
import { statusWord, statusTone } from '../categories';
import type { Ticket } from '../types';

@Component({
  selector: 'app-ticket-page',
  standalone: true,
  imports: [RouterLink, TopbarComponent],
  template: `
    <div class="ticket-page event-themed" [class.ready]="ready()">
      <app-topbar></app-topbar>
      @if (loading()) {
        <main class="wrap" role="main"><div class="ticket card big"><div class="skeleton title"></div><div class="skeleton line"></div><div class="skeleton line"></div></div></main>
      } @else if (ticket()) {
        <main class="wrap" role="main">
          <article class="ticket card big">
            <h1 class="serif title">{{ tk.title }}</h1>
            <p class="when">{{ long(tk.starts_at, tk.time_zone) }}</p>
            @if (differs(tk.starts_at, tk.time_zone)) {
              <p class="when-sub">{{ long(tk.starts_at, visitorZone()) }} {{ zone(tk.starts_at, visitorZone()) }} your time</p>
            }
            <p class="place">{{ tk.city }}</p>
            <span class="pill {{ tone(tk.status) }}"><span class="dot"></span>{{ word(tk.status) }}</span>
            @if (tk.checked_in_at) {
              <p class="arrived caption">Arrived {{ long(tk.checked_in_at, 'UTC') }}</p>
            }
            <p class="code-line"><span class="code big-code">{{ tk.ticket_code }}</span></p>
            <div class="qr" aria-hidden="true">
              <svg viewBox="0 0 230 230" width="180" height="180" role="img" aria-label="Ticket scan code">
                <rect width="230" height="230" fill="none"></rect>
                @for (mod of modules(); track $index) {
                  <rect [attr.x]="mod.x" [attr.y]="mod.y" width="9.2" height="9.2" rx="2" [attr.fill]="ink"></rect>
                }
                @for (finder of finders(); track $index) {
                  <rect [attr.x]="finder.x" [attr.y]="finder.y" width="55.2" height="55.2" rx="15.456" [attr.fill]="ink"></rect>
                  <rect [attr.x]="finder.x + 16.56" [attr.y]="finder.y + 16.56" width="22.08" height="22.08" rx="6" [attr.fill]="ground"></rect>
                }
              </svg>
            </div>
            <div class="actions">
              <a class="btn secondary" [href]="icsUrl" [download]="tk.event_slug + '.ics'">Add to Calendar</a>
              <a class="btn quiet" [routerLink]="['/', tk.event_slug]">View Event</a>
            </div>
          </article>
        </main>
      }
    </div>
  `,
  styles: [
    `
    :host { display: block; min-height: 100vh; }
    .ticket-page { min-height: 100vh; padding-top: 64px; opacity: 0; animation: event-theme-fade-in 2000ms linear forwards; }
    .ticket-page.ready { opacity: 1; }
    .wrap { display: flex; justify-content: center; padding: 32px 16px 80px; }
    .ticket { width: 400px; max-width: 100%; padding: 32px; display: flex; flex-direction: column; gap: 12px; }
    .title { font-size: 26px; line-height: 32px; color: var(--event-ink); }
    .when { margin: 0; color: var(--event-ink); font-weight: 500; }
    .when-sub, .place, .arrived { margin: 0; color: var(--event-ink-2); font-size: 14px; }
    .code-line { margin: 12px 0 0; }
    .big-code { font-size: 22px; line-height: 26px; padding: 8px 12px; color: var(--event-ink); background: var(--event-panel); }
    .qr { display: flex; justify-content: center; padding: 16px; background: #fff; border-radius: 12px; margin-top: 8px; }
    .actions { display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
    .actions .btn { flex: 1; }
  `],
})
export class TicketPageComponent {
  ticket = signal<Ticket | null>(null);
  loading = signal(true);
  ready = signal(false);
  modules = signal<Array<{ x: number; y: number }>>([]);
  finders = signal<Array<{ x: number; y: number }>>([]);
  ink = '#151515';
  ground = '#ffffff';
  icsUrl = '';

  private destroyRef = inject(DestroyRef);

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private time: TimeService,
  ) {
    this.route.paramMap.subscribe((p) => this.load(p.get('code') ?? ''));
    this.destroyRef.onDestroy(() => clearThemeVars());
  }

  private load(code: string) {
    this.loading.set(true);
    this.api
      .ticket(code)
      .then((t) => {
        this.ticket.set(t);
        this.icsUrl = `/api/ics/${t.event_slug}`;
        const theme = deriveTheme(t.theme_hex);
        applyThemeVars(null, theme);
        this.ink = theme.ink;
        this.buildCode(`${location.origin}/t/${t.ticket_code}`);
        this.loading.set(false);
        this.ready.set(true);
      })
      .catch((e: ApiFailure) => {
        if (e.status === 404) {
          this.router.navigate(['/not-found'], { skipLocationChange: true });
          return;
        }
        this.loading.set(false);
      });
  }

  /** A 25x25 module matrix drawn from geometry, hashed from the address it points at. */
  private buildCode(value: string) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const mods: Array<{ x: number; y: number }> = [];
    const quiet = 4;
    const step = 9.2;
    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 25; col++) {
        const inFinder =
          (row < 7 && col < 7) || (row < 7 && col > 17) || (row > 17 && col < 7);
        if (inFinder) continue;
        h = Math.imul(h ^ (row * 31 + col * 17 + 0x9e37), 16777619) >>> 0;
        if ((h & 3) === 0 || (h & 7) === 3) {
          mods.push({ x: (quiet + col) * step, y: (quiet + row) * step });
        }
      }
    }
    this.modules.set(mods);
    this.finders.set([
      { x: quiet * step, y: quiet * step },
      { x: (quiet + 18) * step, y: quiet * step },
      { x: quiet * step, y: (quiet + 18) * step },
    ]);
  }

  get tk() {
    return this.ticket()!;
  }

  long(instant: string, tz: string): string {
    return this.time.long(instant, tz);
  }

  zone(instant: string, tz: string): string {
    return this.time.zoneLabel(instant, tz);
  }

  differs(instant: string, tz: string): boolean {
    return this.time.differsFromVisitor(instant, tz);
  }

  visitorZone(): string {
    return this.time.visitorZone;
  }

  word(status: string): string {
    return statusWord(status);
  }

  tone(status: string): string {
    return statusTone(status);
  }
}

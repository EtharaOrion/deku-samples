import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Registration } from '../core/api';
import { statusWord, inZone, parseInstant, zoneLabel, localZone } from '../core/tokens';
import { EventWhenComponent } from '../ui/event-when';
import { NotFoundComponent } from './not-found';

/** A vector scan code drawn from geometry at render time. */
@Component({
  selector: 'app-scan-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 230 230" width="184" height="184" [attr.aria-label]="label()" role="img">
      <rect x="0" y="0" width="230" height="230" fill="var(--paper, #fff)" />
      @for (m of modules(); track $index) {
        <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" fill="#151515" />
      }
      @for (f of finders(); track $index) {
        <rect [attr.x]="f.x" [attr.y]="f.y" width="54.4" height="54.4" rx="15.456" fill="none" stroke="#151515" stroke-width="9.2" />
      }
    </svg>
  `,
  styles: [':host{display:inline-flex}'],
})
export class ScanCodeComponent {
  value = input.required<string>();
  label = input('Scan code');

  /** A 25x25 module matrix derived deterministically from the value. */
  modules = computed(() => {
    const out: { x: number; y: number }[] = [];
    let h = 2166136261;
    const v = this.value();
    for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); }
    const quiet = 4;
    const size = 25;
    for (let r = quiet; r < size - quiet; r++) {
      for (let c = quiet; c < size - quiet; c++) {
        const inFinder = (r < quiet + 7 && c < quiet + 7) || (r < quiet + 7 && c >= size - quiet - 7) || (r >= size - quiet - 7 && c < quiet + 7);
        if (inFinder) continue;
        h ^= r * 31 + c * 17;
        h = Math.imul(h, 16777619) >>> 0;
        if ((h & 3) === 0) out.push({ x: c * 9.2, y: r * 9.2 });
      }
    }
    return out;
  });

  finders = computed(() => [
    { x: 4 * 9.2 + 4.6, y: 4 * 9.2 + 4.6 },
    { x: (25 - 4 - 7) * 9.2 + 4.6, y: 4 * 9.2 + 4.6 },
    { x: 4 * 9.2 + 4.6, y: (25 - 4 - 7) * 9.2 + 4.6 },
  ]);
}

@Component({
  selector: 'app-ticket',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EventWhenComponent, ScanCodeComponent, NotFoundComponent],
  host: { '[style.--ev-key]': 'key()' },
  template: `
    @if (loading()) {
      <div class="wrap"><div class="skeleton card" style="height:420px"></div></div>
    } @else if (!t()) {
      <app-not-found />
    } @else {
      <div class="ground ev-theme-in" aria-hidden="true"></div>
      <div class="wrap">
        <article class="card">
          <p class="overline ev2">Ticket</p>
          <h1 class="title">{{ t()!.title }}</h1>
          <p class="line"><app-event-when [startsAt]="t()!.starts_at" [endsAt]="t()!.ends_at" [timeZone]="t()!.time_zone" /></p>
          <p class="line place">{{ t()!.city }}</p>
          <span class="pill" [attr.data-status]="t()!.status">{{ statusWord(t()!.status) }}</span>
          @if (arrived()) { <p class="arrived">Arrived {{ arrived() }}</p> }
          <p class="code-line"><code class="code ticket-code">{{ t()!.ticket_code }}</code></p>
          <app-scan-code [value]="address()" label="Scan code for this ticket" />
          <div class="actions">
            <a class="btn btn-primary" [href]="icsHref()" download>Export</a>
            <a class="btn btn-invert" [routerLink]="['/' + t()!.event_slug]">View Event</a>
          </div>
        </article>
      </div>
    }
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .ground { position: fixed; inset: 0; z-index: -1; background: var(--ev-ground);
      background-image: radial-gradient(900px 500px at 20% -20%, color-mix(in srgb, var(--ev-key) 22%, transparent), transparent 70%),
        radial-gradient(700px 500px at 100% 100%, color-mix(in srgb, var(--ev-key) 18%, transparent), transparent 70%); }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px 16px; }
    .card {
      width: 100%; max-width: 400px; background: var(--paper); border-radius: var(--r-card-lg);
      padding: 28px; display: flex; flex-direction: column; gap: 14px; align-items: flex-start;
      box-shadow: var(--shadow-primary), var(--ring-onboard); position: relative; z-index: 1;
    }
    .title { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0; }
    .line { font-size: 15px; line-height: 22px; margin: 0; }
    .place { color: var(--ink-64); }
    .arrived { font-size: 13px; color: #157a26; margin: 0; }
    .code-line { margin: 4px 0; }
    .ticket-code { font-size: 22px; line-height: 26px; padding: 6px 10px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  `],
})
export class TicketComponent {
  private api = inject(Api);
  code = input.required<string>();
  t = signal<(Registration & { event_slug: string; title: string; starts_at: string; ends_at: string; time_zone: string; city: string }) | null>(null);
  loading = signal(true);

  statusWord = statusWord;

  ngOnInit() {
    this.api.ticket(this.code()).subscribe({
      next: (t) => {
        this.t.set(t as any);
        document.documentElement.style.setProperty('--ev-key', t.theme_hex ?? '#146aeb');
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  key() { return this.t()?.theme_hex ?? 'var(--blue)'; }
  address() { return `${location.origin}/t/${this.code()}`; }

  arrived() {
    const at = this.t()?.checked_in_at;
    if (!at) return '';
    const d = parseInstant(at);
    return `${inZone(d, localZone(), { hour: 'numeric', minute: '2-digit' })} ${zoneLabel(d, localZone())}`;
  }

  /** A calendar file for the event, generated in the browser. */
  icsHref() {
    const t = this.t();
    if (!t) return '#';
    const fmt = (s: string) => parseInstant(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Community Calendar//EN',
      'BEGIN:VEVENT',
      `UID:${t.ticket_code}@calendar.local`,
      `SUMMARY:${t.title}`,
      `DTSTART:${fmt(t.starts_at)}`, `DTEND:${fmt(t.ends_at)}`,
      `LOCATION:${t.city}`,
      `DESCRIPTION:Ticket ${t.ticket_code}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { NoticeService } from '../notice.service';
import { PublicBarComponent } from '../public-bar';
import { ScanCodeComponent, StatusPillComponent } from '../widgets';
import { inZone, timeInZone, visitorLine, visitorZoneDiffers } from '../shared';
import { NotFoundComponent } from './not-found';

@Component({
  selector: 'route-ticket', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBarComponent, ScanCodeComponent, StatusPillComponent, NotFoundComponent],
  host: { '[style.background]': 'ground()', '[style.color]': 'ink()' },
  template: `
    @if (loading()) {
      <public-bar></public-bar>
      <main id="main" class="content-frame page"><div class="skeleton ticket-sk"></div></main>
    } @else if (!t()) {
      <route-not-found></route-not-found>
    } @else {
      <public-bar></public-bar>
      <main id="main" class="content-frame page themed">
        <div class="ticket card-lg elevated" [style.--t-ink]="ink()" [style.--t-ink2]="ink2()">
          <h1 class="t-display">{{ t()!.title }}</h1>
          <p class="t-body">{{ when() }}</p>
          @if (visitorZoneDiffers(t()!.time_zone)) { <p class="t-caption">{{ visitorLine(t()!.starts_at) }}</p> }
          <p class="t-body">{{ t()!.city }}</p>
          <status-pill [status]="t()!.status"></status-pill>
          @if (t()!.checked_in_at) {
            <p class="t-caption">Arrived {{ timeInZone(t()!.checked_in_at!, t()!.time_zone) }}</p>
          }
          <p class="code big">{{ t()!.ticket_code }}</p>
          <scan-code [value]="address()" [label]="'this ticket'" [size]="180"></scan-code>
          <div class="row">
            <button type="button" class="btn btn-primary" (click)="addToCalendar()">Add to Calendar</button>
            <a class="btn btn-secondary" [routerLink]="['/' + t()!.event_slug]">View Event</a>
          </div>
        </div>
      </main>
    }
  `,
  styles: [`
    :host{display:block;min-height:100vh}
    .page{display:grid;place-items:center;padding:96px 24px 48px}
    .themed{animation:event-theme-fade-in 2000ms linear both}
    .ticket{width:100%;max-width:400px;padding:32px;display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center}
    .ticket-sk{width:100%;max-width:400px;height:420px;border-radius:24px}
    .code.big{font-size:22px;line-height:26px;font-weight:600}
    @media (max-width:483px){ .page{padding-top:80px} }
  `],
})
export class TicketComponent implements OnInit {
  code = input.required<string>();
  api = inject(ApiService);
  private notice = inject(NoticeService);
  t = signal<any | null>(null);
  loading = signal(true);

  ground = computed(() => this.t()?.theme?.ground || '#ffffff');
  ink = computed(() => this.t()?.theme?.ink || '#151515');
  ink2 = computed(() => this.t()?.theme?.ink2 || 'rgba(21,21,21,.36)');

  visitorZoneDiffers = visitorZoneDiffers; visitorLine = visitorLine; timeInZone = timeInZone; inZone = inZone;
  when() {
    const t = this.t();
    if (!t) return '';
    return `${inZone(t.starts_at, t.time_zone)} · ${timeInZone(t.starts_at, t.time_zone)} (${t.time_zone})`;
  }

  address() { return location.origin + '/t/' + (this.t()?.ticket_code || this.code()); }

  ngOnInit() {
    this.api.get<any>(`/tickets/${encodeURIComponent(this.code())}`)
      .then(t => this.t.set(t))
      .catch(() => this.t.set(null))
      .finally(() => this.loading.set(false));
  }

  /** Build a calendar file in the browser: no upload, no service, one file. */
  addToCalendar() {
    const t = this.t();
    if (!t) return;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dt = (s: string) => new Date(s).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Community Calendar//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${t.ticket_code}@communitycalendar`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dt(t.starts_at)}`,
      `DTEND:${dt(t.ends_at)}`,
      `SUMMARY:${t.title}`,
      `LOCATION:${t.city}`,
      `DESCRIPTION:Your ticket code is ${t.ticket_code}.`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${t.event_slug}.ics`; a.click();
    URL.revokeObjectURL(url);
    this.notice.say('The calendar file is on its way to your downloads.', 'success');
  }
}

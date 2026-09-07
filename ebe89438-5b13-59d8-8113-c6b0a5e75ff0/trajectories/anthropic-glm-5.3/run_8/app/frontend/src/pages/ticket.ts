import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Ticket } from '../api';
import { Toast, statusWord } from '../domain';
import { Pill } from '../ui/bits';
import { Icon } from '../ui/icon';
import { icsFor, downloadText } from '../art';
import { zoneLine, visitorLine } from '../time';
import { NotFoundPage } from './notfound';

/**
 * One ticket, presented by its code. Anyone may open it, signed in or not,
 * because a ticket that needs an account is not presentable at a door.
 */
@Component({
  selector: 'g-ticket',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'missing') {
      <g-not-found />
    } @else if (state() === 'loading') {
      <div class="loading" aria-hidden="true"><span class="skeleton skeleton-block"></span></div>
    } @else if (ticket()) {
      @if (ticket(); as t) {
      <div class="wrap">
        <div class="ticket card card-lg" [style.--ev-key]="t.theme.key" [style.--ev-ground]="t.theme.ground"
             [style.--ev-ink]="t.theme.ink" [style.--ev-ink-rgb]="inkRgb(t)">
          <h1 class="t-display title">{{ t.title }}</h1>
          <div class="when">
            <div class="t-row">{{ line(t.starts_at, t.time_zone) }}</div>
            @if (visitor(t.starts_at, t.time_zone); as v) { <div class="t-caption visitor">{{ v }}</div> }
          </div>
          <div class="row place"><g-icon name="pin" [size]="16" /><span class="t-row">{{ t.city }}</span></div>
          <g-pill [word]="statusWord(t.status).word" [tone]="statusWord(t.status).tone" />
          @if (t.checked_in_at) {
            <p class="t-caption arrived">Arrived {{ line(t.checked_in_at, t.time_zone) }}</p>
          }
          <div class="code-block">
            <span class="t-caption code-label">Ticket code</span>
            <span class="code t-code">{{ t.ticket_code }}</span>
          </div>
          <svg class="scan" viewBox="0 0 230 230" width="140" height="140" role="img" aria-label="Scan code for this ticket">
            <g fill="var(--ev-ink, var(--ink))">
              @for (row of modules; track $index; let y = $index) {
                @for (cell of row; track $index; let x = $index) {
                  @if (cell) { <rect [attr.x]="xOf(x)" [attr.y]="yOf(y)" width="9.2" height="9.2" rx="1.6"/> }
                }
              }
            </g>
          </svg>
          <div class="actions row-wrap">
            <button class="btn btn-secondary btn-sm" (click)="addToCalendar(t)">
              <g-icon name="calendar" [size]="16" /> Add to Calendar
            </button>
            <a class="btn btn-secondary btn-sm" [routerLink]="['/', t.event_slug]">View Event</a>
          </div>
        </div>
      </div>
      }
    }
  `,
  imports: [RouterLink, Pill, Icon, NotFoundPage],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; justify-content: center; padding: 32px 16px 96px; }
    .loading { width: 400px; }
    .ticket {
      width: 400px; max-width: 100%; padding: 28px; display: flex; flex-direction: column; gap: 16px;
      align-items: flex-start; background: var(--ev-ground, var(--paper)); color: var(--ev-ink, var(--ink));
      border-radius: 24px;
    }
    .title { font-size: 30px; line-height: 36px; margin: 0; }
    .visitor { color: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.36); }
    .arrived { color: var(--success); font-weight: 500; }
    .code-block { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 12px;
                  border-radius: 8px; background: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.04); }
    .code-label { color: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.64); }
    .code { font-size: 22px; line-height: 26px; letter-spacing: 0.04em; }
    .scan { align-self: center; }
    .actions { width: 100%; }
  `],
})
export class TicketPage {
  code = input.required<string>();
  private api = inject(Api);
  private toast = inject(Toast);
  statusWord = statusWord;

  state = signal<'loading' | 'ready' | 'missing'>('loading');
  ticket = signal<Ticket | null>(null);
  modules: boolean[][] = [];

  constructor() {
    effect(() => {
      const code = this.code();
      this.state.set('loading');
      this.api.ticket(code).subscribe({
        next: (t) => {
          this.ticket.set(t);
          this.modules = this.scan(code);
          this.state.set('ready');
        },
        error: () => this.state.set('missing'),
      });
    });
  }

  private scan(code: string): boolean[][] {
    const size = 25;
    const grid: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    let state = 2166136261;
    const target = typeof location !== 'undefined' ? `${location.origin}/t/${code}` : code;
    for (let i = 0; i < target.length; i++) {
      state ^= target.charCodeAt(i);
      state = Math.imul(state, 16777619) >>> 0;
    }
    const rnd = () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 0xffffffff;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) grid[y][x] = rnd() > 0.5;
    const finder = (ox: number, oy: number) => {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const edge = x === 0 || y === 0 || x === 6 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          grid[oy + y][ox + x] = edge || core;
        }
      }
    };
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    return grid;
  }

  xOf(i: number): number { return 36.8 + i * 9.2; }
  yOf(y: number): number { return 36.8 + y * 9.2; }

  line(iso: string, zone: string): string { return zoneLine(iso, zone); }
  visitor(iso: string, zone: string): string | null { return visitorLine(iso, zone); }

  inkRgb(t: Ticket): string {
    const ink = t.theme.ink;
    if (ink.startsWith('#')) {
      const h = ink.slice(1);
      return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
    }
    return '0, 15, 58';
  }

  addToCalendar(t: Ticket): void {
    downloadText(`${t.event_slug}.ics`, icsFor(t.title, t.event_slug, t.starts_at, t.ends_at, t.city), 'text/calendar');
    this.toast.show('A calendar file has been downloaded.', 'success');
  }
}

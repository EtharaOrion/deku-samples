import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';
import { statusWord, statusTone } from '../categories';
import type { GuestListRow } from '../types';

const STATUS_FILTERS = ['all', 'pending_approval', 'confirmed', 'waitlisted', 'checked_in', 'declined', 'cancelled_by_guest'];

@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (loading()) {
      <div class="skeleton title"></div><div class="skeleton block"></div><div class="skeleton block"></div>
    } @else if (eventSlug()) {
      <h1 class="screen-title">Guests</h1>

      <section class="panel-block" aria-labelledby="queue-h">
        <h2 class="overline" id="queue-h">Approval queue</h2>
        @if (queue().length === 0) {
          <p class="caption">No requests waiting on you.</p>
        } @else {
          <ul class="queue-list">
            @for (row of queue(); track row.id) {
              <li class="queue-row">
                <div class="who">
                  <span class="name">{{ row.display_name }}</span>
                  <span class="caption">{{ row.email }}</span>
                </div>
                <div class="row">
                  <button class="btn secondary small" type="button" (click)="approve(row)">Approve</button>
                  <button class="btn quiet small" type="button" (click)="decline(row)">Decline</button>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <section class="panel-block" aria-labelledby="list-h">
        <div class="toolbar">
          <h2 class="overline" id="list-h">Guest list</h2>
          <div class="toolbar-actions">
            <label class="visually-hidden" for="status-filter">Filter by status</label>
            <select id="status-filter" class="filter" [value]="filter()" (change)="setFilter($any($event.target).value)">
              @for (f of filters; track f) {
                <option [value]="f">{{ f === 'all' ? 'All statuses' : word(f) }}</option>
              }
            </select>
            <button class="btn secondary small" type="button" (click)="exportCsv()">Export CSV</button>
          </div>
        </div>

        @if (rows().length === 0) {
          <div class="empty card big">
            <h3 class="modal-title">No Guests Yet</h3>
            <p class="caption">Share your event link and registrations will appear here.</p>
            <button class="btn secondary" type="button" (click)="copyLink()">Copy Link</button>
          </div>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Position</th><th scope="col">Ticket</th></tr>
              </thead>
              <tbody>
                @for (row of visible(); track row.id) {
                  <tr>
                    <td>{{ row.display_name }}</td>
                    <td class="email-cell">{{ row.email }}</td>
                    <td><span class="pill {{ tone(row.status) }}"><span class="dot"></span>{{ word(row.status) }}</span></td>
                    <td>@if (row.waitlist_position) { {{ row.waitlist_position }} } @else { — }</td>
                    <td>@if (row.ticket_code) { <span class="code">{{ row.ticket_code }}</span> } @else { — }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (hasMore()) {
            <button class="btn secondary small" type="button" (click)="showMore()">Show more</button>
          }
        }
      </section>

      <section class="panel-block" aria-labelledby="door-h">
        <h2 class="overline" id="door-h">The door</h2>
        <form class="door" (submit)="checkIn($event)" novalidate>
          <label class="visually-hidden" for="door-code">Ticket code</label>
          <input id="door-code" class="door-input" type="text" placeholder="TKT-" [value]="code()"
                 (input)="code.set($any($event.target).value.toUpperCase())" autocomplete="off" />
          <button class="btn primary" type="submit" [disabled]="working()">Check In</button>
        </form>
        <p class="door-answer" role="status" aria-live="polite">{{ doorAnswer() }}</p>
      </section>
    }
  `,
  styles: [
    `
    :host { display: block; }
    .panel-block { margin-top: 32px; }
    .queue-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .queue-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--divider); border-radius: 12px; }
    .who { display: flex; flex-direction: column; }
    .name { font-weight: 500; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .toolbar-actions { display: flex; gap: 8px; align-items: center; }
    .filter { min-height: 36px; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--ink-4); background: var(--paper); }
    .table-wrap { margin-top: 16px; overflow-x: auto; }
    .email-cell { color: var(--muted); font-size: 14px; }
    .empty { padding: 32px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-top: 16px; }
    .door { display: flex; gap: 8px; margin-top: 12px; }
    .door-input { min-height: 44px; padding: 10px 12px; border-radius: 4px; border: 1px solid var(--ink-4); background: var(--paper); font-family: ui-monospace, "SF Mono", Menlo, monospace; width: 220px; }
    .door-answer { font-size: 14px; margin-top: 8px; min-height: 20px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (max-width: 700px) { .email-cell { display: none; } }
    @media (max-width: 700px) { th:nth-child(2) { display: none; } }
  `],
})
export class ManageGuestsComponent {
  readonly filters = STATUS_FILTERS;
  eventSlug = signal<string | null>(null);
  rows = signal<GuestListRow[]>([]);
  filter = signal('all');
  shown = signal(25);
  loading = signal(true);
  code = signal('');
  working = signal(false);
  doorAnswer = signal('');


  queue = computed(() => this.rows().filter((r) => r.status === 'pending_approval'));
  visible = computed(() => {
    const f = this.filter();
    const filtered = f === 'all' ? this.rows() : this.rows().filter((r) => r.status === f);
    return filtered.slice(0, this.shown());
  });
  hasMore = computed(() => {
    const f = this.filter();
    const filtered = f === 'all' ? this.rows() : this.rows().filter((r) => r.status === f);
    return filtered.length > this.shown();
  });

  constructor(private api: ApiService, private route: ActivatedRoute, private notice: NoticeService) {
    this.route.paramMap.subscribe((p) => {
      const slug = p.get('slug') ?? '';
      this.eventSlug.set(slug);
      this.load(slug);
    });
  }

  load(slug: string) {
    this.loading.set(true);
    this.api
      .guestList(slug)
      .then((rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  setFilter(value: string) {
    this.filter.set(value);
    this.shown.set(25);
  }

  showMore() {
    this.shown.set(this.shown() + 50);
  }

  async approve(row: GuestListRow) {
    try {
      const res = await this.api.approveRegistration(row.id);
      if (res.note) this.notice.info(res.note);
      else this.notice.success(`${row.display_name} is confirmed.`);
      this.load(this.eventSlug() ?? '');
    } catch (e) {
      this.notice.danger((e as ApiFailure).message);
    }
  }

  async decline(row: GuestListRow) {
    try {
      await this.api.declineRegistration(row.id);
      this.notice.info(`${row.display_name}'s request is declined.`);
      this.load(this.eventSlug() ?? '');
    } catch (e) {
      this.notice.danger((e as ApiFailure).message);
    }
  }

  async checkIn(event: Event) {
    event.preventDefault();
    const code = this.code().trim();
    if (!code) {
      this.doorAnswer.set('Type or scan a ticket code that starts TKT-.');
      return;
    }
    this.working.set(true);
    try {
      const res = await this.api.checkIn(code);
      if (res.note) this.doorAnswer.set(res.note);
      else this.doorAnswer.set(`Checked in at ${new Date().toLocaleTimeString()}.`);
      this.load(this.eventSlug() ?? '');
    } catch (e) {
      this.doorAnswer.set((e as ApiFailure).message);
    } finally {
      this.working.set(false);
    }
  }

  /** The CSV travels with the bearer token, so it is fetched and saved as a file. */
  async exportCsv() {
    const slug = this.eventSlug();
    if (!slug) return;
    try {
      const res = await fetch(`/api/events/${slug}/registrations.csv`, {
        headers: { authorization: `Bearer ${this.api.token() ?? ''}` },
      });
      if (!res.ok) {
        this.notice.danger('The guest list could not be exported just now. Try again.');
        return;
      }
      const text = await res.text();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      this.notice.danger('The guest list could not be exported just now. Try again.');
    }
  }

  async copyLink() {
    const slug = this.eventSlug();
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/${slug}`);
      this.notice.success('Link copied.');
    } catch {
      this.notice.info(`${location.origin}/${slug}`);
    }
  }

  word(status: string): string {
    return statusWord(status);
  }

  tone(status: string): string {
    return statusTone(status);
  }
}

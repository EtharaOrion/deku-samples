import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Shell } from '../layout/shell';
import { Api, ApiError } from '../core/api';
import { NotFoundEmbed } from './not-found-embed';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'cc-manage-guests',
  standalone: true,
  imports: [FormsModule, Shell, NotFoundEmbed],
  template: `
  <cc-shell>
    @if (loading) {
      <div class="stack-16">@for (s of [1,2,3]; track s) { <div class="skeleton skeleton-text"></div> }</div>
    } @else if (!event) {
      <cc-not-found-embed></cc-not-found-embed>
    } @else {
      <h1 class="screen-title">{{ event.title }} · guests</h1>

      <section class="panel">
        <h2 class="overline tertiary">Approval queue</h2>
        @if (!queue.length) {
          <p class="caption">The queue is empty. Every request has an answer.</p>
        } @else {
          <ul class="stack-8">
            @for (q of queue; track q.id) {
              <li class="row q-row">
                <div class="grow">
                  <p class="list-row">{{ q.display_name }} · {{ q.email }}</p>
                </div>
                <button class="btn btn-sm btn-primary" type="button" (click)="approve(q)">Approve</button>
                <button class="btn btn-sm btn-secondary" type="button" (click)="decline(q)">Decline</button>
              </li>
            }
          </ul>
        }
      </section>

      <section class="panel">
        <div class="spread tools">
          <h2 class="overline tertiary">Guest list</h2>
          <div class="row">
            <select class="field filter" (change)="filter = $any($event.target).value" aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked in</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="pending_approval">Pending</option>
              <option value="declined">Declined</option>
              <option value="cancelled_by_guest">Cancelled</option>
            </select>
            <a class="btn btn-sm btn-secondary" [href]="csvUrl">Export CSV</a>
          </div>
        </div>
        @if (!rows.length) {
          <div class="empty">
            <h2>No Guests Yet</h2>
            <p>Share your event link and registrations will appear here.</p>
            <button class="btn btn-primary" type="button" (click)="copy()">Copy Link</button>
          </div>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Guest</th><th class="col-email">Email</th><th>Status</th><th>Waiting</th><th>Ticket</th></tr></thead>
              <tbody>
                @for (r of shown; track r.id) {
                  <tr>
                    <td>{{ r.display_name }}</td>
                    <td class="col-email">{{ r.email }}</td>
                    <td><span class="pill {{ pill(r.status) }}"><span class="pill-dot"></span>{{ word(r.status) }}</span></td>
                    <td>{{ r.waitlist_position ?? '' }}</td>
                    <td><span class="code">{{ r.ticket_code ?? '' }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (hasMore) {
            <button class="btn btn-sm btn-secondary" type="button" (click)="limit = limit + 50">
              Show more ({{ rows.length - limit }} hidden)
            </button>
          }
        }
      </section>

      <section class="panel">
        <h2 class="overline tertiary">The door</h2>
        <form class="row" (submit)="checkIn($event)">
          <label class="grow">
            <span class="sr-only">Ticket code</span>
            <input class="field" type="text" placeholder="TKT-" [(ngModel)]="code" name="code"
                   autocomplete="off" required>
          </label>
          <button class="btn btn-primary" type="submit" [disabled]="busy">Check In</button>
        </form>
        <p class="caption" role="status" aria-live="polite">{{ doorMessage }}</p>
      </section>
    }
  </cc-shell>`,
  styles: [`
    .panel { margin: 24px 0; padding: 20px; border: 1px solid var(--divider); border-radius: 12px;
      background: var(--panel); }
    .q-row { padding: 8px 0; border-bottom: 1px solid var(--divider); }
    .tools { margin-bottom: 16px; }
    .filter { width: auto; min-height: 36px; }
    .table-wrap { overflow-x: auto; }
    .empty { padding: 32px 0; }
    @media (max-width: 650px) { .col-email { display: none; } }
    @media (max-width: 484px) {
      .table, .table thead, .table tbody, .table tr, .table td { display: block; width: 100%; }
      .table thead { display: none; }
      .table td { border-bottom: 0; padding: 4px 0; }
      .table tr { border-bottom: 1px solid var(--divider); padding: 12px 0; }
      .table td::before { content: attr(data-label) ': '; font-size: 12px; color: var(--muted); }
    }
  `],
})
export class ManageGuests implements OnInit {
  slug = '';
  loading = true;
  event: any = null;
  queue: any[] = [];
  rows: any[] = [];
  filter = '';
  limit = 50;
  code = '';
  busy = false;
  doorMessage = '';

  constructor(private route: ActivatedRoute, private api: Api) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      this.slug = m.get('slug') ?? '';
      await this.load();
    });
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.event = await this.api.request<any>(`/events/${this.slug}`);
      const all = await this.api.request<any[]>(`/events/${this.slug}/registrations`);
      this.queue = all.filter(r => r.status === 'pending_approval');
      this.rows = all.filter(r => r.status !== 'pending_approval');
    } catch (err) {
      if (!((err as ApiError).status === 404)) throw err;
      this.event = null;
    } finally { this.loading = false; }
  }

  get shown(): any[] {
    const f = this.filter
      ? this.rows.filter(r => r.status === this.filter)
      : this.rows;
    return f.slice(0, this.limit);
  }
  get hasMore(): boolean {
    const f = this.filter ? this.rows.filter(r => r.status === this.filter) : this.rows;
    return f.length > this.limit;
  }
  get csvUrl(): string {
    return `/api/events/${this.slug}/registrations.csv`;
  }

  word(s: string): string {
    const m: Record<string, string> = {
      confirmed: 'Confirmed', checked_in: 'Checked in', waitlisted: 'Waiting list',
      pending_approval: 'Pending', declined: 'Declined',
      cancelled_by_guest: 'Cancelled', cancelled_by_host: 'Cancelled by host',
    };
    return m[s] ?? s;
  }
  pill(s: string): string {
    if (s === 'confirmed' || s === 'checked_in') return 'pill-ok';
    if (s === 'waitlisted' || s === 'pending_approval') return 'pil-warn';
    if (s === 'declined' || s.startsWith('cancelled')) return 'pill-bad';
    return 'pill-neutral';
  }

  async approve(q: any): Promise<void> {
    try {
      const r = await this.api.request<any>(`/registrations/${q.id}/approve`, { method: 'POST', body: '{}' });
      this.doorMessage = r.status === 'confirmed'
        ? `${q.display_name} is confirmed.`
        : `The event is full, so ${q.display_name} takes a waiting-list place.`;
    } catch (err) { this.doorMessage = (err as ApiError).message; }
    await this.load();
  }

  async decline(q: any): Promise<void> {
    try {
      await this.api.request(`/registrations/${q.id}/decline`, { method: 'POST', body: '{}' });
      this.doorMessage = `${q.display_name}'s request is declined.`;
    } catch (err) { this.doorMessage = (err as ApiError).message; }
    await this.load();
  }

  async checkIn(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.code.trim()) return;
    this.busy = true; this.doorMessage = '';
    try {
      const r = await this.api.request<any>(`/tickets/${this.code.trim()}/check-in`, { method: 'POST', body: '{}' });
      this.doorMessage = r.checked_in_at
        ? `Checked in at ${new Date(r.checked_in_at).toLocaleTimeString()}.`
        : 'Checked in.';
      this.code = '';
      await this.load();
    } catch (err) {
      this.doorMessage = (err as ApiError).message;
    } finally { this.busy = false; }
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(`${location.origin}/${this.slug}`).catch(() => null);
    this.doorMessage = 'The link is on your clipboard.';
  }
}

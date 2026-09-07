import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PillComponent } from '../ui/pill.component';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { EventDetail, GuestRow, STATUS_WORDS } from '../core/models';
import { longDateIn } from '../core/time';

/**
 * Three stacked panels sharing one table: the queue, the guest list and the
 * door. Only the rows the window shows are drawn, however long the list is.
 */
@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [RouterLink, FormsModule, PillComponent],
  template: `
    <main id="main" class="col">
      <h1 class="t-screen-title">Guests</h1>
      @if (event(); as e) { <p class="t-caption muted sub">{{ e.title }}</p> }

      <section class="panel">
        <h2 class="t-section">Approval queue</h2>
        @if (queue().length === 0) {
          <p class="t-caption muted">Nobody is waiting on you right now.</p>
        } @else {
          <ul class="queue">
            @for (g of queue(); track g.id) {
              <li class="q-row">
                <div class="grow">
                  <span class="t-row">{{ g.display_name }}</span>
                  <p class="t-caption muted">{{ g.email }}</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" (click)="approve(g)">Approve</button>
                <button type="button" class="btn btn-quiet btn-sm" (click)="decline(g)">Decline</button>
              </li>
            }
          </ul>
        }
      </section>

      <section class="panel">
        <div class="toolbar">
          <h2 class="t-section grow">Guest list</h2>
          <label>
            <span class="sr-only">Filter by status</span>
            <select class="control" [(ngModel)]="statusFilter" aria-label="Filter by status">
              <option value="">All statuses</option>
              @for (s of statuses; track s) { <option [value]="s">{{ word(s) }}</option> }
            </select>
          </label>
          <button type="button" class="btn btn-primary btn-sm" (click)="exportCsv()">Export CSV</button>
        </div>

        @if (loading()) {
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-text"></div>
        } @else if (filtered().length === 0) {
          <div class="empty">
            <h2>No Guests Yet</h2>
            <p>Share your event link and registrations will appear here.</p>
            <button type="button" class="btn btn-primary" (click)="copyLink()">Copy Link</button>
          </div>
        } @else {
          <div class="scroller" (scroll)="onScroll($event)" #scroller>
            <div [style.height.px]="filtered().length * rowHeight" class="spacer">
              <table [style.transform]="'translateY(' + startIndex() * rowHeight + 'px)'">
                <caption class="sr-only">Guests for this event</caption>
                <thead>
                  <tr>
                    <th scope="col">Guest</th>
                    <th scope="col" class="email-col">Email</th>
                    <th scope="col">Status</th>
                    <th scope="col">Waiting</th>
                    <th scope="col">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  @for (g of window(); track g.id) {
                    <tr>
                      <td data-label="Guest">{{ g.display_name }}</td>
                      <td data-label="Email" class="email-col">{{ g.email }}</td>
                      <td data-label="Status"><app-pill [status]="g.status" /></td>
                      <td data-label="Waiting">{{ g.waitlist_position ?? '' }}</td>
                      <td data-label="Ticket"><code class="code">{{ g.ticket_code ?? '' }}</code></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </section>

      <section class="panel">
        <h2 class="t-section">The door</h2>
        <form class="door" (ngSubmit)="checkIn()">
          <label class="field grow">
            <span class="label" for="door-code">Ticket code</span>
            <input id="door-code" class="control" [(ngModel)]="code" name="code" placeholder="TKT-" />
          </label>
          <button type="submit" class="btn btn-solid" [disabled]="busy()">Check In</button>
        </form>
        <p class="t-caption door-answer" aria-live="polite">{{ doorAnswer() }}</p>
      </section>
    </main>
  `,
  styles: [`
    .col { max-width: 900px; padding: 32px 24px 64px; }
    .sub { margin-bottom: 24px; }
    .panel { border-top: 1px solid var(--divider); padding: 24px 0; }
    .panel h2 { margin-bottom: 12px; }
    .queue { display: flex; flex-direction: column; }
    .q-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--divider); flex-wrap: wrap; }
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .scroller { max-height: 420px; overflow-y: auto; }
    .spacer { position: relative; }
    table { width: 100%; border-collapse: collapse; position: absolute; top: 0; left: 0; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--divider); font-size: 15px; line-height: 22px; }
    th { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--ink-64); }
    .code { font-family: var(--mono); font-size: 13px; }
    .door { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .door-answer { margin-top: 8px; color: var(--ink-64); }
    @media (max-width: 649px) { .email-col { display: none; } }
    @media (max-width: 483px) {
      table, thead, tbody, tr, td { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid var(--divider); padding: 8px 0; }
      td { border: none; padding: 2px 0; }
      td::before { content: attr(data-label) ': '; font-weight: 600; color: var(--ink-64); }
      .scroller { max-height: none; }
      .spacer { height: auto !important; }
      table { position: static; transform: none !important; }
    }
  `],
})
export class ManageGuestsComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notices = inject(NoticeService);

  event = signal<EventDetail | null>(null);
  guests = signal<GuestRow[]>([]);
  loading = signal(true);
  busy = signal(false);
  doorAnswer = signal('');
  code = '';
  statusFilter = '';
  statuses = Object.keys(STATUS_WORDS);
  word = (s: string) => STATUS_WORDS[s as keyof typeof STATUS_WORDS];

  rowHeight = 43;
  startIndex = signal(0);
  private visibleCount = 14;

  filtered = computed(() =>
    this.statusFilter ? this.guests().filter((g) => g.status === this.statusFilter) : this.guests());

  queue = computed(() => this.guests().filter((g) => g.status === 'pending_approval'));

  window = computed(() =>
    this.filtered().slice(this.startIndex(), this.startIndex() + this.visibleCount));

  ngOnInit() {
    this.route.paramMap.subscribe((p) => this.load(p.get('slug') || ''));
  }

  private load(slug: string) {
    this.loading.set(true);
    this.api.getEvent(slug).subscribe({
      next: (e) => {
        if (!e.is_owner) { this.router.navigateByUrl('/404', { skipLocationChange: true }); return; }
        this.event.set(e);
        this.refresh();
      },
      error: () => { this.loading.set(false); this.router.navigateByUrl('/404', { skipLocationChange: true }); },
    });
  }

  private refresh() {
    const e = this.event();
    if (!e) return;
    this.api.guestList(e.slug).subscribe({
      next: (g) => { this.guests.set(g); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onScroll(ev: Event) {
    const top = (ev.target as HTMLElement).scrollTop;
    this.startIndex.set(Math.max(0, Math.floor(top / this.rowHeight) - 2));
  }

  approve(g: GuestRow) {
    this.api.approve(g.id).subscribe({
      next: (r) => {
        this.refresh();
        if (r.status === 'waitlisted') {
          this.notices.show(
            `${g.display_name} was approved into a full event, so they went to the waiting list at number ${r.waitlist_position}.`,
            'warning');
        } else {
          this.notices.show(`${g.display_name} is confirmed.`, 'success');
        }
      },
      error: (e: Refusal) => this.notices.show(e.message, 'danger'),
    });
  }

  decline(g: GuestRow) {
    this.api.decline(g.id).subscribe({
      next: () => { this.refresh(); this.notices.show(`${g.display_name} was declined.`, 'info'); },
      error: (e: Refusal) => this.notices.show(e.message, 'danger'),
    });
  }

  checkIn() {
    const code = this.code.trim().toUpperCase();
    if (!code) return;
    this.busy.set(true);
    this.api.checkIn(code).subscribe({
      next: (r) => {
        this.busy.set(false);
        const e = this.event();
        const at = r.checked_in_at ? longDateIn(r.checked_in_at, e?.time_zone || 'UTC') : '';
        this.doorAnswer.set(r.already_checked_in
          ? `That ticket already arrived on ${at}.`
          : `Checked in. Welcome.`);
        this.code = '';
        this.refresh();
      },
      error: (err: Refusal) => {
        this.busy.set(false);
        this.doorAnswer.set(err.status === 404 ? 'No ticket carries that code.' : err.message);
      },
    });
  }

  async exportCsv() {
    const e = this.event();
    if (!e) return;
    try { await this.api.downloadCsv(e.slug); }
    catch { this.notices.show('That export is not yours to download.', 'danger'); }
  }

  async copyLink() {
    const e = this.event();
    if (!e) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/${e.slug}`);
      this.notices.show('The event address is on your clipboard.', 'success');
    } catch { this.notices.show(`${location.origin}/${e.slug}`, 'info'); }
  }
}

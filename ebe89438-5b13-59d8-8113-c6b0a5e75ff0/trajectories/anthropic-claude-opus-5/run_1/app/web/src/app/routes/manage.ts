import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Notices } from '../core/notices';
import { shortDate, timeOfDay, whenLine } from '../core/timefmt';
import type { EventDetail, GuestRow, RegistrationStatus, Refusal } from '../core/models';
import { Shell } from '../ui/chrome';
import { Icon } from '../ui/icons';
import { Dialog, StatePill, StatusPill } from '../ui/shared';

/* ---------------------------------------------------------------- */
/* overview                                                          */
/* ---------------------------------------------------------------- */

@Component({
  selector: 'app-manage-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, Shell, Icon, StatePill, Dialog],
  template: `
    <app-shell>
      @if (loading()) {
        <div class="sk sk-title" style="width: 50%; height: 34px"></div>
        <div class="sk sk-text" style="width: 30%"></div>
        <div class="sk sk-card" style="height: 120px; margin-top: 24px"></div>
      } @else if (event(); as e) {
        <header class="head">
          <h1 class="t-screen-title">{{ e.title }}</h1>
          <app-state-pill [state]="e.state" />
        </header>

        <p class="address">
          <a class="address-link" [routerLink]="['/', e.slug]">{{ origin }}/{{ e.slug }}</a>
          <button type="button" class="btn btn-sm" (click)="copyLink(e.slug)">
            <app-icon name="copy" [size]="16" />
            Copy Link
          </button>
        </p>

        @if (e.state === 'cancelled') {
          <section class="panel cancel-notice">
            <h2 class="t-section">This event is cancelled</h2>
            <p class="t-prose">{{ e.cancel_reason }}</p>
          </section>
        } @else {
          <ul class="counters">
            <li class="counter">
              <span class="counter-n">{{ e.confirmed_count }}/{{ e.capacity ?? '\u221e' }}</span>
              <span class="t-overline counter-l">Confirmed</span>
            </li>
            <li class="counter">
              <span class="counter-n">{{ e.waitlist_count }}</span>
              <span class="t-overline counter-l">Waiting</span>
            </li>
            <li class="counter">
              <span class="counter-n">{{ e.pending_count }}</span>
              <span class="t-overline counter-l">Awaiting Approval</span>
            </li>
            <li class="counter">
              <span class="counter-n">{{ e.checked_in_count }}</span>
              <span class="t-overline counter-l">Arrived</span>
            </li>
          </ul>

          <section class="todo">
            <h2 class="t-section">Next three things</h2>
            <ol class="todo-list">
              @for (t of todos(); track t) {
                <li class="t-row">{{ t }}</li>
              }
            </ol>
          </section>
        }

        <nav class="sisters" aria-label="Manage this event">
          <a class="btn" [routerLink]="['/event', e.slug, 'manage', 'guests']">Guests, Queue and Door</a>
          <a class="btn" [routerLink]="['/event', e.slug, 'manage', 'registration']">Capacity and Approval</a>
          @if (e.state !== 'cancelled') {
            <button type="button" class="btn btn-text danger" (click)="cancelOpen.set(true)">Cancel Event</button>
          }
        </nav>
      }

      @if (cancelOpen()) {
        <app-dialog heading="Cancel this event?" (closed)="cancelOpen.set(false)">
          <p class="t-prose">
            Every guest still holding a place is mailed your reason, word for word, and this cannot
            be undone.
          </p>
          <label class="field">
            <span class="field-label">Reason</span>
            <textarea class="field-control" name="reason" [(ngModel)]="reason"></textarea>
          </label>
          <div class="dialog-actions">
            <button type="button" class="btn" (click)="cancelOpen.set(false)">Keep The Event</button>
            <button
              type="button"
              class="btn btn-danger"
              [disabled]="!reason.trim() || busy()"
              (click)="cancelEvent()"
            >
              Cancel Event
            </button>
          </div>
        </app-dialog>
      }
    </app-shell>
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: var(--s3);
        flex-wrap: wrap;
        margin-bottom: var(--s2);
      }
      .address {
        display: flex;
        align-items: center;
        gap: var(--s3);
        margin-bottom: var(--s5);
        flex-wrap: wrap;
      }
      .address-link {
        color: var(--ink-secondary);
        font-size: 15px;
        line-height: 22px;
        word-break: break-all;
      }
      .counters {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--s4);
        margin-bottom: var(--s6);
        max-width: 720px;
      }
      @media (min-width: 650px) {
        .counters {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      .counter {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
      }
      .counter-n {
        font-size: 22px;
        line-height: 26px;
        font-weight: 700;
      }
      .counter-l {
        color: var(--ink-tertiary);
      }
      .todo {
        margin-bottom: var(--s6);
        max-width: 640px;
      }
      .todo h2 {
        color: var(--ink-secondary);
        margin-bottom: var(--s2);
      }
      .todo-list {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }
      .todo-list li {
        padding-left: var(--s4);
        position: relative;
        color: var(--ink);
      }
      .todo-list li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 9px;
        width: 5px;
        height: 5px;
        border-radius: 100%;
        background: var(--ink-tertiary);
      }
      .sisters {
        display: flex;
        gap: var(--s2);
        flex-wrap: wrap;
      }
      .danger {
        color: var(--danger);
      }
      .cancel-notice {
        padding: var(--s4);
        border-left: 4px solid var(--danger);
        margin-bottom: var(--s5);
        max-width: 640px;
      }
      .cancel-notice h2 {
        margin-bottom: var(--s2);
      }
    `,
  ],
})
export class ManageOverviewRoute {
  readonly slug = input.required<string>();
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly origin = typeof location !== 'undefined' ? location.origin : '';
  readonly loading = signal(true);
  readonly event = signal<EventDetail | null>(null);
  readonly cancelOpen = signal(false);
  readonly busy = signal(false);
  reason = '';

  readonly todos = computed(() => {
    const e = this.event();
    if (!e) return [];
    const out: string[] = [];
    if (e.pending_count > 0)
      out.push(`Work the queue: ${e.pending_count} ${e.pending_count === 1 ? 'request is' : 'requests are'} awaiting your decision.`);
    if (e.state === 'draft') out.push('Finish the details and publish this event so guests can find it.');
    if (e.waitlist_count > 0)
      out.push(`Raise capacity to seat the ${e.waitlist_count} waiting, or leave the list as it is.`);
    if (e.confirmed_count === 0 && e.state === 'published')
      out.push('Share the link — nobody has registered yet.');
    if (e.checked_in_count > 0)
      out.push(`${e.checked_in_count} ${e.checked_in_count === 1 ? 'guest has' : 'guests have'} arrived; keep the door open.`);
    out.push('Check the date, the place and the capacity once more before the day.');
    return out.slice(0, 3);
  });

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load() {
    this.loading.set(true);
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        // the not-permitted case renders the ordinary not-found page
        if (!e.is_owner) {
          this.router.navigate(['/not-found'], { skipLocationChange: true });
          return;
        }
        this.event.set(e);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      },
    });
  }

  copyLink(slug: string) {
    const url = `${this.origin}/${slug}`;
    navigator.clipboard?.writeText(url).then(
      () => this.notices.success('The link is on your clipboard.'),
      () => this.notices.show(url)
    );
  }

  cancelEvent() {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.cancelEvent(this.slug(), this.reason.trim()).subscribe({
      next: (e) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.event.set(e);
        this.notices.success('The event is called off and every guest has been told why.');
      },
      error: (err: Refusal) => {
        this.busy.set(false);
        this.notices.refuse(err.message);
      },
    });
  }
}

/* ---------------------------------------------------------------- */
/* guests, queue and door                                            */
/* ---------------------------------------------------------------- */

const ROW_HEIGHT = 56;

@Component({
  selector: 'app-manage-guests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Shell, StatusPill],
  template: `
    <app-shell>
      @if (loading()) {
        <div class="sk sk-title" style="width: 45%; height: 34px"></div>
        <div class="sk sk-row"></div>
        <div class="sk sk-row"></div>
      } @else if (event(); as e) {
        <h1 class="t-screen-title">{{ e.title }} &mdash; Guests</h1>

        <section class="panel-block" aria-labelledby="queue-h">
          <h2 id="queue-h" class="t-section">The queue</h2>
          @if (queue().length) {
            <ul class="queue">
              @for (g of queue(); track g.id) {
                <li class="queue-row">
                  <span class="queue-who">
                    <span class="t-row name">{{ g.display_name }}</span>
                    <span class="t-caption muted">{{ g.email }}</span>
                  </span>
                  <span class="queue-actions">
                    <button type="button" class="btn btn-sm" (click)="approve(g)" [disabled]="busyId() === g.id">
                      Approve
                    </button>
                    <button type="button" class="btn btn-sm btn-text" (click)="decline(g)" [disabled]="busyId() === g.id">
                      Decline
                    </button>
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="t-prose muted">Nobody is waiting on a decision.</p>
          }
        </section>

        <section class="panel-block" aria-labelledby="list-h">
          <div class="list-head">
            <h2 id="list-h" class="t-section">The guest list</h2>
            <div class="toolbar">
              <label class="sr-only" for="status-filter">Filter by status</label>
              <select id="status-filter" class="field-control filter" [(ngModel)]="statusFilter" name="sf">
                <option value="">Every status</option>
                @for (s of statuses; track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
              <button type="button" class="btn btn-sm" (click)="exportCsv()">Export CSV</button>
            </div>
          </div>

          @if (filtered().length) {
            <div class="table-scroll" #scroller (scroll)="onScroll($event)">
              <div class="table-spacer" [style.height.px]="filtered().length * ROW_HEIGHT">
                <table class="guests" [style.transform]="'translateY(' + windowTop() + 'px)'">
                  <thead>
                    <tr>
                      <th scope="col">Guest</th>
                      <th scope="col" class="col-email">Email</th>
                      <th scope="col">Status</th>
                      <th scope="col">Waiting</th>
                      <th scope="col">Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- only the rows the window shows are drawn -->
                    @for (g of windowRows(); track g.id) {
                      <tr>
                        <td data-label="Guest">{{ g.display_name }}</td>
                        <td data-label="Email" class="col-email muted">{{ g.email }}</td>
                        <td data-label="Status"><app-status-pill [status]="g.status" /></td>
                        <td data-label="Waiting">{{ g.waitlist_position ?? '\u2014' }}</td>
                        <td data-label="Ticket" class="code">{{ g.ticket_code ?? '\u2014' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          } @else {
            <div class="empty">
              <h2>No Guests Yet</h2>
              <p>Share your event link and registrations will appear here.</p>
              <button type="button" class="btn btn-primary" (click)="copyLink(e.slug)">Copy Link</button>
            </div>
          }
        </section>

        <section class="panel-block" aria-labelledby="door-h">
          <h2 id="door-h" class="t-section">The door</h2>
          <form class="door" (ngSubmit)="checkIn()">
            <label class="field door-field">
              <span class="field-label" for="door-code">Ticket code</span>
              <input
                id="door-code"
                class="field-control"
                name="code"
                placeholder="TKT-"
                [(ngModel)]="doorCode"
                [attr.aria-describedby]="doorAnswer() ? 'door-answer' : null"
              />
            </label>
            <button type="submit" class="btn btn-primary door-btn" [disabled]="busyDoor()">Check In</button>
          </form>
          <p class="door-answer t-row" id="door-answer" role="status" aria-live="polite">{{ doorAnswer() }}</p>
        </section>
      }
    </app-shell>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .panel-block {
        margin-bottom: var(--s7);
        max-width: 900px;
      }
      .panel-block h2 {
        color: var(--ink-secondary);
        margin-bottom: var(--s3);
      }
      .muted {
        color: var(--text-muted);
      }
      .queue {
        border-top: 1px solid var(--paper-divider);
      }
      .queue-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--paper-divider);
        flex-wrap: wrap;
      }
      .queue-who {
        display: flex;
        flex-direction: column;
      }
      .name {
        font-weight: 500;
      }
      .queue-actions {
        display: flex;
        gap: var(--s2);
      }
      .list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        flex-wrap: wrap;
        margin-bottom: var(--s3);
      }
      .list-head h2 {
        margin-bottom: 0;
      }
      .toolbar {
        display: flex;
        gap: var(--s2);
        align-items: center;
      }
      .filter {
        min-height: 44px;
        width: auto;
        min-width: 160px;
      }
      .table-scroll {
        max-height: 448px;
        overflow-y: auto;
        border-top: 1px solid var(--paper-divider);
      }
      .table-spacer {
        position: relative;
      }
      .guests {
        width: 100%;
        table-layout: fixed;
      }
      .guests th {
        text-align: left;
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        color: var(--ink-tertiary);
        padding: var(--s2) var(--s2) var(--s2) 0;
        position: sticky;
        top: 0;
        background: var(--paper);
        z-index: 1;
      }
      .guests td {
        padding: var(--s3) var(--s2) var(--s3) 0;
        border-bottom: 1px solid var(--paper-divider);
        font-size: 15px;
        line-height: 22px;
        height: 56px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .code {
        font-family: var(--mono);
        font-size: 13px;
      }
      .door {
        display: flex;
        gap: var(--s2);
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .door-field {
        flex: 1 1 240px;
        margin-bottom: 0;
      }
      .door-btn {
        min-height: 44px;
      }
      .door-answer:empty {
        display: none;
      }
      .door-answer {
        margin-top: var(--s3);
        font-weight: 500;
      }
      @media (max-width: 649px) {
        .col-email {
          display: none;
        }
      }
      /* below 484px each guest becomes a card keeping the header words as labels */
      @media (max-width: 483px) {
        .table-scroll {
          max-height: none;
        }
        .table-spacer {
          height: auto !important;
        }
        .guests,
        .guests tbody,
        .guests tr,
        .guests td {
          display: block;
          width: 100%;
          transform: none !important;
        }
        .guests thead {
          display: none;
        }
        .guests tr {
          border: 1px solid var(--ink-hairline);
          border-radius: var(--r-card);
          padding: var(--s3);
          margin-bottom: var(--s2);
        }
        .guests td {
          border: 0;
          height: auto;
          white-space: normal;
          display: flex;
          justify-content: space-between;
          gap: var(--s3);
          padding: var(--s1) 0;
        }
        .guests td::before {
          content: attr(data-label);
          font-size: 13px;
          line-height: 18px;
          font-weight: 600;
          color: var(--ink-tertiary);
        }
        .col-email {
          display: flex;
        }
      }
    `,
  ],
})
export class ManageGuestsRoute {
  readonly slug = input.required<string>();
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly ROW_HEIGHT = ROW_HEIGHT;
  readonly statuses: RegistrationStatus[] = [
    'pending_approval',
    'confirmed',
    'waitlisted',
    'checked_in',
    'declined',
    'cancelled_by_guest',
    'cancelled_by_host',
  ];

  readonly loading = signal(true);
  readonly event = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly busyId = signal<string | null>(null);
  readonly busyDoor = signal(false);
  readonly doorAnswer = signal('');
  readonly scrollTop = signal(0);

  statusFilter = '';
  doorCode = '';
  private readonly filterTick = signal(0);

  readonly queue = computed(() => this.guests().filter((g) => g.status === 'pending_approval'));

  readonly filtered = computed(() => {
    this.filterTick();
    const f = this.statusFilter;
    return f ? this.guests().filter((g) => g.status === f) : this.guests();
  });

  private readonly WINDOW = 12;
  readonly firstIndex = computed(() =>
    Math.max(0, Math.floor(this.scrollTop() / ROW_HEIGHT) - 2)
  );
  readonly windowTop = computed(() => this.firstIndex() * ROW_HEIGHT);
  readonly windowRows = computed(() =>
    this.filtered().slice(this.firstIndex(), this.firstIndex() + this.WINDOW)
  );

  constructor() {
    setInterval(() => this.filterTick.update((n) => n + 1), 250);
    queueMicrotask(() => this.load());
  }

  private load() {
    this.loading.set(true);
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        if (!e.is_owner) {
          this.router.navigate(['/not-found'], { skipLocationChange: true });
          return;
        }
        this.event.set(e);
        this.api.guests(this.slug()).subscribe({
          next: (rows) => {
            this.guests.set(rows);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      },
    });
  }

  onScroll(e: Event) {
    this.scrollTop.set((e.target as HTMLElement).scrollTop);
  }

  approve(g: GuestRow) {
    this.busyId.set(g.id);
    this.api.approve(g.id).subscribe({
      next: (r) => {
        this.busyId.set(null);
        // approving into a full event says so in a notice rather than silently
        if (r.moved_to_waitlist)
          this.notices.show(
            `${g.display_name} was moved to the waiting list because the event is full.`,
            'warning'
          );
        else this.notices.success(`${g.display_name} is confirmed.`);
        this.load();
      },
      error: (e: Refusal) => {
        this.busyId.set(null);
        this.notices.refuse(e.message);
      },
    });
  }

  decline(g: GuestRow) {
    this.busyId.set(g.id);
    this.api.decline(g.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notices.show(`${g.display_name} was declined and has been told.`, 'warning');
        this.load();
      },
      error: (e: Refusal) => {
        this.busyId.set(null);
        this.notices.refuse(e.message);
      },
    });
  }

  checkIn() {
    const code = this.doorCode.trim().toUpperCase();
    if (!code) {
      this.doorAnswer.set('Type the ticket code from the guest.');
      return;
    }
    this.busyDoor.set(true);
    this.api.checkIn(code).subscribe({
      next: (r) => {
        this.busyDoor.set(false);
        this.doorAnswer.set(
          r.already_checked_in
            ? `That ticket already arrived at ${new Date(r.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
            : 'Checked in. Let them through.'
        );
        this.doorCode = '';
        this.load();
      },
      error: (e: Refusal) => {
        this.busyDoor.set(false);
        this.doorAnswer.set(e.message);
      },
    });
  }

  exportCsv() {
    const token = this.auth.token;
    fetch(`/api/events/${encodeURIComponent(this.slug())}/registrations.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error('refused');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.slug()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.notices.success('The guest list is downloading.');
      })
      .catch(() => this.notices.refuse('That guest list could not be downloaded just now.'));
  }

  copyLink(slug: string) {
    const url = `${location.origin}/${slug}`;
    navigator.clipboard?.writeText(url).then(
      () => this.notices.success('The link is on your clipboard.'),
      () => this.notices.show(url)
    );
  }
}

/* ---------------------------------------------------------------- */
/* capacity and approval                                             */
/* ---------------------------------------------------------------- */

@Component({
  selector: 'app-manage-registration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Shell],
  template: `
    <app-shell>
      @if (loading()) {
        <div class="sk sk-title" style="width: 50%; height: 34px"></div>
        <div class="sk sk-row"></div>
      } @else if (event(); as e) {
        <h1 class="t-screen-title">{{ e.title }} &mdash; Registration</h1>

        <div class="settings">
          <div class="row">
            <span class="row-main">
              <label class="row-label t-body" for="cap">Capacity</label>
              <span class="row-caption t-caption">{{ capCaption() }}</span>
            </span>
            <span class="row-control">
              <button type="button" class="step" (click)="stepCapacity(-1)" aria-label="Lower the capacity by one">&minus;</button>
              <input
                id="cap"
                class="field-control cap"
                type="number"
                min="1"
                max="500"
                [(ngModel)]="capacity"
                name="cap"
                [attr.aria-invalid]="capRefusal() ? 'true' : null"
                [attr.aria-describedby]="capRefusal() ? 'cap-refusal' : null"
              />
              <button type="button" class="step" (click)="stepCapacity(1)" aria-label="Raise the capacity by one">+</button>
              <button type="button" class="btn btn-sm" (click)="saveCapacity()" [disabled]="busy()">Save</button>
            </span>
          </div>
          @if (capRefusal()) {
            <p class="field-refusal" id="cap-refusal">{{ capRefusal() }}</p>
          }

          <div class="row">
            <span class="row-main">
              <span class="row-label t-body" id="app-l">Approval Required</span>
              <span class="row-caption t-caption">Every registration waits for your decision before it holds a seat.</span>
            </span>
            <span class="row-control">
              <input
                type="checkbox"
                role="switch"
                [checked]="e.approval_required"
                (change)="toggle('approval_required', $event)"
                aria-labelledby="app-l"
                [attr.aria-checked]="e.approval_required"
              />
            </span>
          </div>

          <div class="row">
            <span class="row-main">
              <span class="row-label t-body" id="wl-l">Waiting List</span>
              <span class="row-caption t-caption">When the event is full, a registration takes a waiting-list place instead of being refused.</span>
            </span>
            <span class="row-control">
              <input
                type="checkbox"
                role="switch"
                [checked]="e.waitlist_enabled"
                (change)="toggle('waitlist_enabled', $event)"
                aria-labelledby="wl-l"
                [attr.aria-checked]="e.waitlist_enabled"
              />
            </span>
          </div>

          <div class="row">
            <span class="row-main">
              <span class="row-label t-body" id="open-l">Registration Open</span>
              <span class="row-caption t-caption">Turning this off shows the closed panel on the public page and mails nobody.</span>
            </span>
            <span class="row-control">
              <input
                type="checkbox"
                role="switch"
                [checked]="e.state === 'published'"
                (change)="toggleOpen($event)"
                aria-labelledby="open-l"
                [attr.aria-checked]="e.state === 'published'"
                [disabled]="e.state === 'draft' || e.state === 'cancelled'"
              />
            </span>
          </div>
        </div>

        <p class="announce sr-only" role="status" aria-live="polite">{{ announcement() }}</p>
      }
    </app-shell>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .settings {
        max-width: 720px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        padding: var(--s4) 0;
        border-bottom: 1px solid var(--paper-divider);
        flex-wrap: wrap;
        min-height: 44px;
      }
      .row-main {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        flex: 1 1 260px;
      }
      .row-label {
        font-weight: 500;
      }
      .row-caption {
        color: var(--text-muted);
        max-width: 420px;
      }
      .row-control {
        display: flex;
        align-items: center;
        gap: var(--s2);
      }
      .cap {
        width: 84px;
        text-align: center;
        min-height: 44px;
      }
      .step {
        width: 44px;
        height: 44px;
        border-radius: var(--r-nav);
        border: 1px solid var(--ink-hairline);
        background: var(--paper);
        cursor: pointer;
        font-size: 18px;
        color: var(--ink);
      }
      @media (hover: hover) {
        .step:hover {
          background: var(--ink-fill);
        }
      }
      input[type='checkbox'][role='switch'] {
        width: 44px;
        height: 26px;
        accent-color: var(--blue);
        cursor: pointer;
      }
    `,
  ],
})
export class ManageRegistrationRoute {
  readonly slug = input.required<string>();
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly loading = signal(true);
  readonly event = signal<EventDetail | null>(null);
  readonly busy = signal(false);
  readonly capRefusal = signal<string | null>(null);
  readonly announcement = signal('');
  capacity = 0;

  readonly capCaption = computed(() => {
    const e = this.event();
    if (this.capRefusal()) return '';
    return e ? `${e.confirmed_count} confirmed, ${e.waitlist_count} waiting.` : '';
  });

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load() {
    this.loading.set(true);
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        if (!e.is_owner) {
          this.router.navigate(['/not-found'], { skipLocationChange: true });
          return;
        }
        this.event.set(e);
        this.capacity = e.capacity ?? 0;
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      },
    });
  }

  stepCapacity(by: number) {
    this.capacity = Math.max(1, Math.min(500, Number(this.capacity) + by));
  }

  saveCapacity() {
    if (this.busy()) return;
    this.busy.set(true);
    this.capRefusal.set(null);
    this.api.updateEvent(this.slug(), { capacity: Number(this.capacity) }).subscribe({
      next: (e) => {
        this.busy.set(false);
        this.event.set(e);
        this.capacity = e.capacity ?? 0;
        const moved = e.promoted_from_waitlist ?? 0;
        if (moved > 0) {
          const line = `${moved} ${moved === 1 ? 'guest was' : 'guests were'} moved from the waiting list to a seat.`;
          this.notices.success(line);
          this.announcement.set(line);
        } else {
          this.notices.success('Capacity saved.');
        }
      },
      error: (err: Refusal) => {
        this.busy.set(false);
        // the caption reads the pinned sentence when a lower number is refused
        this.capRefusal.set(err.message);
        const e = this.event();
        if (e) this.capacity = e.capacity ?? 0;
      },
    });
  }

  toggle(field: 'approval_required' | 'waitlist_enabled', ev: Event) {
    const value = (ev.target as HTMLInputElement).checked;
    this.api.updateEvent(this.slug(), { [field]: value }).subscribe({
      next: (e) => {
        this.event.set(e);
        this.notices.success('Saved.');
      },
      error: (err: Refusal) => {
        this.notices.refuse(err.message);
        this.load();
      },
    });
  }

  toggleOpen(ev: Event) {
    const open = (ev.target as HTMLInputElement).checked;
    this.api.updateEvent(this.slug(), { state: open ? 'published' : 'registration_closed' }).subscribe({
      next: (e) => {
        this.event.set(e);
        this.notices.success(
          open ? 'Registration is open again.' : 'Registration is closed; nobody was mailed.'
        );
      },
      error: (err: Refusal) => {
        this.notices.refuse(err.message);
        this.load();
      },
    });
  }
}

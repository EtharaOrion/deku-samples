import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ApiService, ApiFailure } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { ManageStore } from './manage.shell';
import { AvatarComponent } from '../ui/avatar.component';
import { PillComponent } from '../ui/pill.component';
import { EmptyStateComponent, SpinnerComponent } from '../ui/bits';
import { dayLine, timeLine } from '../core/time';
import { STATUS_TONES, STATUS_WORDS, type GuestRow, type RegistrationStatus } from '../core/models';

const ROW_HEIGHT = 56;
const OVERSCAN = 6;

/**
 * Three stacked panels sharing one table. The queue comes first and shows only
 * pending_approval rows; approving a request into a full event moves that row to
 * the waiting list and says so in a notice rather than silently. Only the rows
 * the window shows are drawn, however long the list is.
 */
@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [AvatarComponent, PillComponent, EmptyStateComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="t-screen-title head">Guests</h1>

    <!-- The queue -->
    <section class="panel" aria-labelledby="queue-head">
      <h2 class="t-overline panel__head" id="queue-head">
        The queue · {{ queue().length }} awaiting an answer
      </h2>
      @if (queue().length === 0) {
        <p class="t-caption panel__quiet">Nothing is waiting for an answer.</p>
      } @else {
        <ul class="queue">
          @for (g of queue(); track g.id) {
            <li class="queue__row">
              <app-avatar [name]="g.display_name" [size]="32" />
              <span class="queue__lines">
                <span class="t-row queue__name">{{ g.display_name }}</span>
                <span class="t-caption queue__email">{{ g.email }}</span>
              </span>
              <span class="spacer"></span>
              <button
                type="button"
                class="btn btn--sm"
                (click)="approve(g)"
                [disabled]="workingId() === g.id"
              >
                @if (workingId() === g.id) {
                  <app-spinner />
                }
                Approve
              </button>
              <button
                type="button"
                class="btn btn--sm"
                (click)="decline(g)"
                [disabled]="workingId() === g.id"
              >
                Decline
              </button>
            </li>
          }
        </ul>
      }
    </section>

    <!-- The guest list -->
    <section class="panel" aria-labelledby="list-head">
      <div class="toolbar">
        <h2 class="t-overline panel__head" id="list-head">
          The guest list · {{ filtered().length }} shown
        </h2>
        <span class="spacer"></span>
        <div class="field toolbar__filter">
          <label class="visually-hidden" for="status-filter">Filter by status</label>
          <select
            id="status-filter"
            class="input"
            [value]="statusFilter()"
            (change)="statusFilter.set($any($event.target).value)"
          >
            <option value="">Every status</option>
            @for (s of statuses; track s) {
              <option [value]="s">{{ word(s) }}</option>
            }
          </select>
        </div>
        <button type="button" class="btn btn--sm" (click)="exportCsv()" [disabled]="exporting()">
          @if (exporting()) {
            <app-spinner />
          }
          Export CSV
        </button>
      </div>

      @if (loading()) {
        <div class="skeleton table-skeleton" aria-busy="true"></div>
      } @else if (guests().length === 0) {
        <app-empty-state
          title="No Guests Yet"
          body="Share your event link and registrations will appear here."
          actionLabel="Copy Link"
          (action)="copyLink()"
        />
      } @else {
        <div class="scroller" #scroller (scroll)="onScroll($event)">
          <div class="scroller__spacer" [style.height.px]="filtered().length * rowHeight">
            <table class="table" [style.transform]="'translateY(' + offsetPx() + 'px)'">
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
                @for (g of windowed(); track g.id) {
                  <tr class="table__row">
                    <td data-label="Guest">
                      <span class="cell-guest">
                        <app-avatar [name]="g.display_name" [size]="24" />
                        {{ g.display_name }}
                      </span>
                    </td>
                    <td data-label="Email" class="col-email">{{ g.email }}</td>
                    <td data-label="Status">
                      <app-pill [word]="word(g.status)" [tone]="tone(g.status)" />
                    </td>
                    <td data-label="Waiting">{{ g.waitlist_position ?? '—' }}</td>
                    <td data-label="Ticket" class="cell-code">{{ g.ticket_code ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>

    <!-- The door -->
    <section class="panel" aria-labelledby="door-head">
      <h2 class="t-overline panel__head" id="door-head">The door</h2>
      <form class="door" (submit)="checkIn($event)">
        <div class="field door__field">
          <label class="field__label" for="door-code">Ticket code</label>
          <input
            id="door-code"
            class="input door__input"
            placeholder="TKT-"
            [value]="code()"
            (input)="code.set($any($event.target).value.toUpperCase())"
            aria-describedby="door-answer"
          />
        </div>
        <button type="submit" class="btn btn--primary door__action" [disabled]="checking()">
          @if (checking()) {
            <app-spinner />
          }
          Check In
        </button>
      </form>
      <p class="t-caption door__answer" id="door-answer" role="status" aria-live="polite">
        {{ doorAnswer() }}
      </p>
    </section>
  `,
  styles: [
    `
      .head { font-family: var(--serif); font-weight: 400; margin-bottom: var(--s5); }
      .panel {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        padding: var(--s4) 0;
        border-bottom: 1px solid var(--divider);
        margin-bottom: var(--s5);
      }
      .panel__head { color: var(--ink-64); text-transform: uppercase; letter-spacing: 0.06em; }
      .panel__quiet { color: var(--muted); }

      .queue { display: flex; flex-direction: column; }
      .queue__row {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s2) 0;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }
      .queue__lines { display: flex; flex-direction: column; min-width: 0; }
      .queue__name { font-weight: 500; }
      .queue__email { color: var(--muted); }

      .toolbar { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
      .toolbar__filter { min-width: 170px; }
      .table-skeleton { height: 260px; border-radius: var(--r-card); }

      /* Only the rows the window shows are drawn, however long the list is. */
      .scroller { max-height: 440px; overflow-y: auto; position: relative; }
      .scroller__spacer { position: relative; }
      .table { width: 100%; border-collapse: collapse; position: absolute; top: 0; left: 0; }
      .table th {
        text-align: left;
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        color: var(--ink-64);
        padding: var(--s2) var(--s2);
        border-bottom: 1px solid var(--divider);
        position: sticky;
        top: 0;
        background: var(--paper);
      }
      .table td {
        padding: var(--s2);
        border-bottom: 1px solid var(--divider);
        font-size: 15px;
        line-height: 22px;
        height: 56px;
      }
      .cell-guest { display: inline-flex; align-items: center; gap: var(--s2); }
      .cell-code { font-family: var(--mono); font-size: 13px; }

      @media (max-width: 649px) {
        .col-email { display: none; }
      }
      /* Below 484px the table becomes one card per guest, keeping the header
         words as labels on each value. */
      @media (max-width: 483px) {
        .scroller { max-height: none; }
        .scroller__spacer { height: auto !important; }
        .table { position: static; transform: none !important; }
        .table thead { display: none; }
        .table tbody, .table tr, .table td { display: block; width: 100%; }
        .table__row {
          border: 1px solid var(--ink-08);
          border-radius: var(--r-card);
          padding: var(--s2);
          margin-bottom: var(--s2);
        }
        .table td { border: 0; height: auto; display: flex; gap: var(--s2); }
        .table td::before {
          content: attr(data-label);
          font-size: 13px;
          line-height: 22px;
          font-weight: 600;
          color: var(--ink-64);
          min-width: 72px;
        }
      }

      .door { display: flex; gap: var(--s2); align-items: flex-end; flex-wrap: wrap; }
      .door__field { flex: 1 1 220px; }
      .door__input { font-family: var(--mono); }
      .door__answer { color: var(--ink-64); min-height: 16px; }
    `,
  ],
})
export class ManageGuestsPage {
  readonly store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly statuses: RegistrationStatus[] = [
    'pending_approval',
    'confirmed',
    'checked_in',
    'waitlisted',
    'declined',
    'cancelled_by_guest',
    'cancelled_by_host',
  ];

  readonly rowHeight = ROW_HEIGHT;

  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly workingId = signal<number | null>(null);
  readonly statusFilter = signal('');
  readonly code = signal('');
  readonly checking = signal(false);
  readonly doorAnswer = signal('');
  readonly exporting = signal(false);
  readonly scrollTop = signal(0);

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly queue = computed(() => this.guests().filter((g) => g.status === 'pending_approval'));

  readonly filtered = computed(() => {
    const filter = this.statusFilter();
    const rows = filter ? this.guests().filter((g) => g.status === filter) : this.guests();
    return [...rows].sort(
      (a, b) =>
        a.status.localeCompare(b.status) ||
        (a.waitlist_position ?? Number.MAX_SAFE_INTEGER) -
          (b.waitlist_position ?? Number.MAX_SAFE_INTEGER) ||
        a.email.localeCompare(b.email),
    );
  });

  private readonly firstIndex = computed(() =>
    Math.max(0, Math.floor(this.scrollTop() / ROW_HEIGHT) - OVERSCAN),
  );

  readonly offsetPx = computed(() => this.firstIndex() * ROW_HEIGHT);

  readonly windowed = computed(() => {
    const rows = this.filtered();
    const visible = Math.ceil(440 / ROW_HEIGHT) + OVERSCAN * 2;
    return rows.slice(this.firstIndex(), this.firstIndex() + visible);
  });

  constructor() {
    queueMicrotask(() => this.load());
  }

  /** The skeleton is painted once; a reload after an action replaces the rows. */
  private load(quiet = false): void {
    const slug = this.store.slug();
    if (!slug) {
      setTimeout(() => this.load(quiet), 60);
      return;
    }
    if (!quiet) this.loading.set(true);
    this.api.guestList(slug).subscribe({
      next: (rows) => {
        this.guests.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onScroll(event: Event): void {
    this.scrollTop.set((event.target as HTMLElement).scrollTop);
  }

  word(status: RegistrationStatus): string {
    return STATUS_WORDS[status];
  }

  tone(status: RegistrationStatus): any {
    return STATUS_TONES[status];
  }

  approve(g: GuestRow): void {
    this.workingId.set(g.id);
    this.api.approve(g.id).subscribe({
      next: (updated) => {
        this.workingId.set(null);
        this.load(true);
        this.store.refresh();
        if (updated.moved_to_waitlist) {
          // Approving into a full event says so rather than doing it silently.
          this.notices.show(
            `${g.display_name} moved to the waiting list at position ${updated.waitlist_position}, because every seat is taken.`,
            'warning',
          );
        } else {
          this.notices.success(`${g.display_name} is confirmed and has been sent a ticket.`);
        }
      },
      error: (e: ApiFailure) => {
        this.workingId.set(null);
        this.notices.refusal(e.message);
      },
    });
  }

  decline(g: GuestRow): void {
    this.workingId.set(g.id);
    this.api.decline(g.id).subscribe({
      next: () => {
        this.workingId.set(null);
        this.load(true);
        this.notices.show(`${g.display_name} was declined and has been written to.`, 'info');
      },
      error: (e: ApiFailure) => {
        this.workingId.set(null);
        this.notices.refusal(e.message);
      },
    });
  }

  checkIn(event: Event): void {
    event.preventDefault();
    const code = this.code().trim().toUpperCase();
    if (!code) {
      this.doorAnswer.set('Type a ticket code to check somebody in.');
      return;
    }
    this.checking.set(true);
    this.api.checkIn(code).subscribe({
      next: (reg) => {
        this.checking.set(false);
        this.code.set('');
        this.load(true);
        this.store.refresh();
        if (reg.already_checked_in) {
          // A code already checked in answers with the arrival time rather than
          // a second arrival.
          const at = reg.checked_in_at
            ? `${dayLine(reg.checked_in_at, this.store.event()?.time_zone ?? 'UTC')} at ${timeLine(
                reg.checked_in_at,
                this.store.event()?.time_zone ?? 'UTC',
              )}`
            : 'earlier';
          this.doorAnswer.set(`That ticket already arrived on ${at}.`);
          this.notices.show(`That ticket already arrived on ${at}.`, 'info');
        } else {
          this.doorAnswer.set('Checked in.');
          this.notices.success('Checked in.');
        }
      },
      error: (e: ApiFailure) => {
        this.checking.set(false);
        this.doorAnswer.set(
          e.status === 404 ? 'No ticket on this event carries that code.' : e.message,
        );
      },
    });
  }

  copyLink(): void {
    const value = `${location.origin}/${this.store.slug()}`;
    navigator.clipboard?.writeText(value).then(
      () => this.notices.success('The event link is on your clipboard.'),
      () => this.notices.refusal('Your browser would not let us copy. Select the address instead.'),
    );
  }

  /** Downloads the guest list as a file named after the event. */
  exportCsv(): void {
    const slug = this.store.slug();
    this.exporting.set(true);
    this.api.guestListCsv(slug).subscribe({
      next: (text) => {
        this.exporting.set(false);
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.notices.success(`The guest list downloaded as ${slug}.csv.`);
      },
      error: (e: ApiFailure) => {
        this.exporting.set(false);
        this.notices.refusal(e.message);
      },
    });
  }
}

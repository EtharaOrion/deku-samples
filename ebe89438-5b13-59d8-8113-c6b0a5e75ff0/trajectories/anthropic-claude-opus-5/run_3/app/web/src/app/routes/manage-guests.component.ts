import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ApiRefusal, ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { ManageStore } from './manage.component';
import { STATUS_WORDS, type GuestRow, type RegistrationStatus } from '../core/models';
import { StatusPillComponent } from '../shared/ui';
import { IconComponent } from '../shared/icons.component';
import { arrivalLine } from '../core/time';

const ROW_HEIGHT = 52;
const OVERSCAN = 6;

/**
 * The guest list, the queue and the door: three stacked panels sharing one
 * table. However long the list is, only the rows the window shows are drawn.
 */
@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [StatusPillComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="t-screen-title">Guests</h1>

    <!-- The queue comes first and shows only pending_approval rows. -->
    <section class="panel" aria-labelledby="queue-heading">
      <h2 id="queue-heading" class="t-longform-heading">Approval queue</h2>
      @if (queue().length === 0) {
        <p class="muted t-caption">Nothing is waiting on your decision.</p>
      } @else {
        <ul class="queue">
          @for (row of queue(); track row.id) {
            <li class="queue-row">
              <span class="queue-name">
                <span class="t-list-row">{{ row.display_name }}</span>
                <span class="t-caption muted">{{ row.email }}</span>
              </span>
              <span class="queue-actions">
                <button type="button" class="btn btn-sm" (click)="approve(row)" [disabled]="busy() === row.id">
                  Approve
                </button>
                <button type="button" class="btn btn-sm decline" (click)="decline(row)" [disabled]="busy() === row.id">
                  Decline
                </button>
              </span>
            </li>
          }
        </ul>
      }
    </section>

    <!-- The door. -->
    <section class="panel" aria-labelledby="door-heading">
      <h2 id="door-heading" class="t-longform-heading">The door</h2>
      <form class="door" (submit)="checkIn($event)">
        <div class="field door-field">
          <label for="door-code">Ticket code</label>
          <input
            id="door-code"
            type="text"
            placeholder="TKT-"
            [value]="doorCode()"
            (input)="doorCode.set(asValue($event))"
            autocomplete="off"
          />
        </div>
        <button type="submit" class="btn btn-primary btn-pill" [disabled]="!doorCode().trim() || working()">
          Check In
        </button>
      </form>
      @if (doorAnswer()) {
        <p class="door-answer" role="status">{{ doorAnswer() }}</p>
      }
    </section>

    <!-- The guest list. -->
    <section class="panel" aria-labelledby="list-heading">
      <div class="list-head">
        <h2 id="list-heading" class="t-longform-heading">Guest list</h2>
        <div class="toolbar">
          <div class="field">
            <label class="visually-hidden" for="status-filter">Filter by status</label>
            <select id="status-filter" [value]="statusFilter()" (change)="statusFilter.set(asValue($event))">
              <option value="">All statuses</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ word(s) }}</option>
              }
            </select>
          </div>
          <button type="button" class="btn btn-sm" (click)="exportCsv()">
            <app-icon name="download" [size]="16" />
            Export CSV
          </button>
        </div>
      </div>

      @if (store.guestsLoading()) {
        @for (n of [1, 2, 3, 4]; track n) {
          <div class="skeleton" style="height: 44px; margin-top: 8px"></div>
        }
      } @else if (filtered().length === 0) {
        <div class="empty-state">
          <h2>No Guests Yet</h2>
          <p>Share your event link and registrations will appear here.</p>
          <button type="button" class="btn btn-primary btn-pill" (click)="copyLink()">Copy Link</button>
        </div>
      } @else {
        <div class="scroller" #scroller (scroll)="onScroll()">
          <div class="spacer" [style.height.px]="filtered().length * rowHeight">
            <table class="guests" [style.transform]="'translateY(' + offsetY() + 'px)'">
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
                @for (row of window(); track row.id) {
                  <tr>
                    <td [attr.data-label]="'Guest'">{{ row.display_name }}</td>
                    <td [attr.data-label]="'Email'" class="col-email">{{ row.email }}</td>
                    <td [attr.data-label]="'Status'"><app-status-pill [status]="row.status" /></td>
                    <td [attr.data-label]="'Waiting'">{{ row.waitlist_position ?? '\\u2014' }}</td>
                    <td [attr.data-label]="'Ticket'" class="code">{{ row.ticket_code ?? '\\u2014' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      h1 { margin-bottom: 24px; }

      .panel {
        padding: 20px;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--elev-card);
        margin-bottom: 24px;
      }

      .muted { color: var(--muted); }

      .queue { margin-top: 12px; }

      .queue-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }

      .queue-name { display: flex; flex-direction: column; min-width: 0; }
      .queue-actions { display: flex; gap: 8px; }
      .decline { color: var(--danger); }

      .door { display: flex; gap: 12px; align-items: flex-end; margin-top: 12px; flex-wrap: wrap; }
      .door-field { flex: 1; min-width: 200px; }
      .door-answer { margin-top: 12px; font-size: 15px; line-height: 22px; }

      .list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .toolbar { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }

      /* Only the rows the window shows are drawn, however long the list is. */
      .scroller {
        max-height: 520px;
        overflow-y: auto;
        position: relative;
      }

      .spacer { position: relative; }

      table {
        width: 100%;
        border-collapse: collapse;
        position: absolute;
        top: 0;
        left: 0;
      }

      th {
        text-align: left;
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        color: var(--muted);
        padding: 8px 8px;
        border-bottom: 1px solid var(--divider);
        background: var(--paper);
        position: sticky;
        top: 0;
      }

      td {
        padding: 0 8px;
        height: 52px;
        border-bottom: 1px solid var(--divider);
        font-size: 15px;
        line-height: 22px;
        vertical-align: middle;
      }

      .code { font-family: var(--mono); font-size: 13px; }

      /* The table keeps its columns to 650px, then drops the email column. */
      @media (max-width: 649px) {
        .col-email { display: none; }
      }

      /* Below 484px it becomes one card per guest carrying the same words. */
      @media (max-width: 483px) {
        .scroller { max-height: none; }
        .spacer { height: auto !important; }
        table { position: static; transform: none !important; }
        thead { display: none; }
        tbody, tr, td { display: block; width: 100%; }

        tr {
          border: 1px solid var(--ink-08);
          border-radius: var(--r-card);
          padding: 12px;
          margin-bottom: 12px;
        }

        td {
          height: auto;
          border: none;
          padding: 4px 0;
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        td::before {
          content: attr(data-label);
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
        }
      }
    `,
  ],
})
export class ManageGuestsComponent implements OnInit {
  store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  readonly rowHeight = ROW_HEIGHT;
  readonly statuses: RegistrationStatus[] = [
    'pending_approval',
    'confirmed',
    'waitlisted',
    'checked_in',
    'declined',
    'cancelled_by_guest',
    'cancelled_by_host',
  ];

  readonly statusFilter = signal('');
  readonly doorCode = signal('');
  readonly doorAnswer = signal('');
  readonly working = signal(false);
  readonly busy = signal<string | null>(null);
  readonly scrollTop = signal(0);
  readonly viewportHeight = signal(520);

  readonly queue = computed(() => this.store.guests().filter((g) => g.status === 'pending_approval'));

  readonly filtered = computed(() => {
    const filter = this.statusFilter();
    const rows = this.store.guests();
    return filter ? rows.filter((r) => r.status === filter) : rows;
  });

  private startIndex = computed(() =>
    Math.max(0, Math.floor(this.scrollTop() / ROW_HEIGHT) - OVERSCAN)
  );

  readonly window = computed(() => {
    const rows = this.filtered();
    const visible = Math.ceil(this.viewportHeight() / ROW_HEIGHT) + OVERSCAN * 2;
    return rows.slice(this.startIndex(), this.startIndex() + visible);
  });

  readonly offsetY = computed(() => this.startIndex() * ROW_HEIGHT);

  ngOnInit() {
    if (!this.store.guests().length) this.store.loadGuests();
  }

  onScroll() {
    const el = this.scroller?.nativeElement;
    if (!el) return;
    this.scrollTop.set(el.scrollTop);
    this.viewportHeight.set(el.clientHeight);
  }

  asValue(event: Event) {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  word(status: RegistrationStatus) {
    return STATUS_WORDS[status];
  }

  approve(row: GuestRow) {
    this.busy.set(row.id);
    this.api.approve(row.id).subscribe({
      next: (reg) => {
        this.busy.set(null);
        this.store.loadGuests();
        // Approving a request into a full event says so in a notice rather
        // than silently.
        if (reg.status === 'waitlisted') {
          this.notices.show(
            `${row.display_name} was moved to the waiting list at position ${reg.waitlist_position}, because the event is full.`,
            'warning'
          );
        } else {
          this.notices.success(`${row.display_name} is confirmed and has been emailed a ticket.`);
        }
      },
      error: (err: ApiRefusal) => {
        this.busy.set(null);
        this.notices.refuse(err.message);
      },
    });
  }

  decline(row: GuestRow) {
    this.busy.set(row.id);
    this.api.decline(row.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.store.loadGuests();
        this.notices.success(`${row.display_name} has been declined and told.`);
      },
      error: (err: ApiRefusal) => {
        this.busy.set(null);
        this.notices.refuse(err.message);
      },
    });
  }

  checkIn(event: Event) {
    event.preventDefault();
    const code = this.doorCode().trim().toUpperCase();
    this.working.set(true);
    this.doorAnswer.set('');
    this.api.checkIn(code).subscribe({
      next: (reg) => {
        this.working.set(false);
        this.doorCode.set('');
        this.store.loadGuests();
        const ev = this.store.event();
        if (reg.already_checked_in) {
          // A code already checked in answers with the arrival time rather than
          // a second arrival.
          this.doorAnswer.set(
            `Already checked in at ${arrivalLine(reg.checked_in_at, ev?.time_zone ?? 'UTC')}. One arrival, not two.`
          );
        } else {
          this.doorAnswer.set('Checked in. Welcome them through.');
        }
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.doorAnswer.set(
          err.isNotFound ? 'That code does not match a ticket for this event.' : err.message
        );
      },
    });
  }

  async exportCsv() {
    try {
      await this.api.downloadCsv(this.store.slug());
      this.notices.success('The guest list has been downloaded.');
    } catch (err) {
      this.notices.refuse((err as ApiRefusal).message);
    }
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/${this.store.slug()}`);
      this.notices.success('The event link has been copied.');
    } catch {
      this.notices.show('Copy the address from the bar to share this event.', 'info');
    }
  }
}

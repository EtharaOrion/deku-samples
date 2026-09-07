import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Refusal } from '../../core/api.service';
import { NoticeService } from '../../core/notice.service';
import { GuestRow, statusPillClass, statusWord } from '../../models';
import { ManageStore } from './manage.store';
import { IconComponent } from '../../shared/icons.component';
import {
  AvatarComponent, EmptyStateComponent, SkeletonComponent,
} from '../../shared/ui.components';
import { formatInZone } from '../../core/time';

const ROW_HEIGHT = 56;
const OVERSCAN = 6;

/**
 * Three stacked panels sharing one table: the queue, the guest list and the
 * door. However long the list is, only the rows the window shows are drawn.
 */
@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [
    FormsModule, IconComponent, AvatarComponent, EmptyStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="visually-hidden">Guests</h1>

    <!-- the queue comes first -->
    @if (queue().length) {
      <section class="panel" aria-labelledby="queue-h">
        <h2 id="queue-h" class="longform-heading">Awaiting your decision</h2>
        <ul class="queue">
          @for (g of queue(); track g.id) {
            <li class="queue-row list-row">
              <app-avatar [name]="g.display_name" [size]="32" [decorative]="true" />
              <span class="grow">
                <span class="name">{{ g.display_name }}</span>
                <span class="caption tertiary email">{{ g.email }}</span>
              </span>
              <button type="button" class="btn btn-secondary btn-sm"
                      (click)="approve(g)" [disabled]="busy() === g.id">Approve</button>
              <button type="button" class="btn btn-text btn-sm"
                      (click)="decline(g)" [disabled]="busy() === g.id">Decline</button>
            </li>
          }
        </ul>
      </section>
    }

    <!-- the guest list -->
    <section class="panel" aria-labelledby="list-h">
      <div class="list-head">
        <h2 id="list-h" class="longform-heading">Guest list</h2>
        <div class="tools">
          <label>
            <span class="visually-hidden">Filter by status</span>
            <select class="field-input status-filter" [(ngModel)]="filter"
                    (ngModelChange)="filterChanged()" aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="declined">Declined</option>
              <option value="cancelled_by_guest">Cancelled</option>
            </select>
          </label>
          <button type="button" class="btn btn-secondary btn-sm" (click)="exportCsv()">
            <app-icon name="download" [size]="16" />
            Export CSV
          </button>
        </div>
      </div>

      @if (store.guestsLoading()) {
        <div class="skels">
          @for (i of [1,2,3]; track i) { <app-skeleton w="100%" h="44px" /> }
        </div>
      } @else if (rows().length === 0) {
        <app-empty-state
          heading="No Guests Yet"
          body="Share your event link and registrations will appear here."
          actionLabel="Copy Link"
          (action)="copyLink()" />
      } @else {
        <div class="scroller" #scroller (scroll)="onScroll()">
          <div class="spacer" [style.height.px]="rows().length * rowHeight">
            <table class="guests" [style.transform]="'translateY(' + offsetY() + 'px)'">
              <caption class="visually-hidden">
                Guests for this event, sorted by status, then waiting-list position, then email
              </caption>
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
                @for (g of visible(); track g.id) {
                  <tr>
                    <td data-label="Guest">
                      <span class="cell-guest">
                        <app-avatar [name]="g.display_name" [size]="28" [decorative]="true" />
                        {{ g.display_name }}
                      </span>
                    </td>
                    <td data-label="Email" class="col-email">{{ g.email }}</td>
                    <td data-label="Status"><span [class]="pill(g)">{{ word(g) }}</span></td>
                    <td data-label="Waiting">{{ g.waitlist_position ?? '—' }}</td>
                    <td data-label="Ticket" class="code">{{ g.ticket_code ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>

    <!-- the door -->
    <section class="panel" aria-labelledby="door-h">
      <h2 id="door-h" class="longform-heading">The door</h2>
      <form class="door" (ngSubmit)="checkIn()">
        <label class="field door-field">
          <span class="field-label" for="door-code">Ticket code</span>
          <input class="field-input" id="door-code" name="code" placeholder="TKT-"
                 [(ngModel)]="code" autocomplete="off" />
        </label>
        <button type="submit" class="btn btn-solid" [disabled]="checking()">Check In</button>
      </form>
      <p class="door-answer" aria-live="polite">{{ doorAnswer() }}</p>
    </section>
  `,
  styles: [`
    .panel { margin-bottom: var(--s6); }
    .queue { margin-top: var(--s3); display: flex; flex-direction: column; }
    .queue-row { display: flex; align-items: center; gap: var(--s3);
      padding: var(--s3) 0; border-bottom: 1px solid var(--divider); flex-wrap: wrap; }
    .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .name { font-weight: 500; }
    .email { color: var(--muted-text); }

    .list-head { display: flex; align-items: center; justify-content: space-between;
      gap: var(--s3); flex-wrap: wrap; margin-bottom: var(--s3); }
    .tools { display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap; }
    .status-filter { min-width: 160px; }
    .skels { display: flex; flex-direction: column; gap: var(--s2); }

    /* Only the rows the window shows are drawn. */
    .scroller { max-height: 448px; overflow-y: auto; position: relative;
      border: 1px solid var(--ink-hairline); border-radius: var(--r-card); }
    .spacer { position: relative; }
    table { position: absolute; top: 0; left: 0; right: 0; }
    thead th {
      text-align: left; font-size: 13px; line-height: 18px; font-weight: 600;
      color: var(--ink-secondary); padding: var(--s2) var(--s3);
      border-bottom: 1px solid var(--divider); background: var(--paper);
    }
    tbody td { padding: var(--s2) var(--s3); border-bottom: 1px solid var(--divider);
      font-size: 15px; line-height: 22px; height: 56px; }
    .cell-guest { display: flex; align-items: center; gap: var(--s2); }
    .code { font-family: var(--mono); font-size: 13px; }

    @media (max-width: 649px) { .col-email { display: none; } }
    /* Below 484px the table becomes one card per guest, keeping the header
       words as labels on each value. */
    @media (max-width: 483px) {
      .scroller { max-height: none; }
      table, thead, tbody, tr, td { display: block; }
      thead { display: none; }
      table { position: static; transform: none !important; }
      .spacer { height: auto !important; }
      tr { padding: var(--s3); border-bottom: 1px solid var(--divider); }
      tbody td { height: auto; border: none; padding: 2px 0; display: flex; gap: var(--s2); }
      tbody td::before { content: attr(data-label) ': '; font-weight: 600;
        color: var(--ink-secondary); font-size: 13px; }
    }

    .door { display: flex; gap: var(--s2); align-items: flex-end; margin-top: var(--s3);
      flex-wrap: wrap; }
    .door-field { flex: 1; min-width: 200px; margin-bottom: 0; }
    .door-answer { margin-top: var(--s2); color: var(--ink-secondary); min-height: 24px; }
  `],
})
export class ManageGuestsComponent {
  store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  filter = '';
  code = '';
  rowHeight = ROW_HEIGHT;
  busy = signal<number | null>(null);
  checking = signal(false);
  doorAnswer = signal('');
  scrollTop = signal(0);
  viewportRows = signal(12);

  queue = computed(() => this.store.guests().filter((g) => g.status === 'pending_approval'));

  rows = computed(() => {
    const all = this.store.guests();
    return this.filter ? all.filter((g) => g.status === this.filter) : all;
  });

  private startIndex = computed(() =>
    Math.max(0, Math.floor(this.scrollTop() / ROW_HEIGHT) - OVERSCAN));

  visible = computed(() => {
    const start = this.startIndex();
    return this.rows().slice(start, start + this.viewportRows() + OVERSCAN * 2);
  });

  offsetY = computed(() => this.startIndex() * ROW_HEIGHT);

  onScroll() {
    const el = this.scroller?.nativeElement;
    if (!el) return;
    this.scrollTop.set(el.scrollTop);
    this.viewportRows.set(Math.ceil(el.clientHeight / ROW_HEIGHT));
  }

  filterChanged() { this.scrollTop.set(0); }

  word(g: GuestRow) { return statusWord(g.status); }
  pill(g: GuestRow) { return statusPillClass(g.status); }

  approve(g: GuestRow) {
    this.busy.set(g.id);
    this.api.approve(g.id).subscribe({
      next: (reg) => {
        this.busy.set(null);
        // Approving into a full event moves the row to the waiting list and
        // says so in a notice rather than silently.
        if (reg.status === 'waitlisted') {
          this.notices.show(
            `${g.display_name} was moved to the waiting list because the event is full.`,
            'warning',
          );
        } else {
          this.notices.show(`${g.display_name} is confirmed.`, 'success');
        }
        this.store.refreshGuests();
        this.store.refreshEvent();
      },
      error: (e: Refusal) => {
        this.busy.set(null);
        this.notices.show(e.message, 'danger');
      },
    });
  }

  decline(g: GuestRow) {
    this.busy.set(g.id);
    this.api.decline(g.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.notices.show(`${g.display_name} was declined.`, 'info');
        this.store.refreshGuests();
        this.store.refreshEvent();
      },
      error: (e: Refusal) => {
        this.busy.set(null);
        this.notices.show(e.message, 'danger');
      },
    });
  }

  checkIn() {
    const code = this.code.trim().toUpperCase();
    if (!code) return;
    this.checking.set(true);
    this.api.checkIn(code).subscribe({
      next: (reg) => {
        this.checking.set(false);
        const ev = this.store.ev();
        const at = formatInZone(reg.checked_in_at, ev?.time_zone ?? 'UTC');
        // A code already checked in answers with the arrival time rather than
        // a second arrival.
        this.doorAnswer.set(
          (reg as any).already_checked_in
            ? `That ticket already arrived at ${at}.`
            : `Checked in at ${at}.`,
        );
        this.code = '';
        this.store.refreshGuests();
      },
      error: (e: Refusal) => {
        this.checking.set(false);
        this.doorAnswer.set(
          e.status === 404 ? 'That code does not match a ticket for this event.' : e.message,
        );
      },
    });
  }

  copyLink() {
    const ev = this.store.ev();
    if (!ev) return;
    const url = `${window.location.origin}/${ev.slug}`;
    navigator.clipboard?.writeText(url).then(
      () => this.notices.show('Link copied.', 'success'),
      () => this.notices.show(`Copy this address: ${url}`, 'info'),
    );
  }

  /** Downloads the guest list as a file named after the event. */
  exportCsv() {
    const ev = this.store.ev();
    if (!ev) return;
    this.api.downloadCsv(ev.slug).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ev.slug}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e: Refusal) => this.notices.show(e.message, 'danger'),
    });
  }
}

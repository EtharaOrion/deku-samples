import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../../core/api.service';
import { NoticeService } from '../../core/notice.service';
import { statusLabel, statusTone, type GuestRow, type RegistrationStatus } from '../../core/models';
import { formatInZone } from '../../core/format';
import { AvatarComponent, IconComponent, SpinnerComponent } from '../../ui/icons.component';
import { ManageStateService } from './manage-state.service';

const ROW_HEIGHT = 56;
const OVERSCAN = 6;

@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [FormsModule, AvatarComponent, IconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state.loading()) {
      <div class="skeleton" style="height: 240px"></div>
    } @else if (state.event(); as ev) {
      <h1 class="t-screen-title">Guests</h1>

      <!-- The approval queue comes first. -->
      <section class="panel-block" aria-labelledby="queue-heading">
        <h2 id="queue-heading" class="t-section-heading">The queue</h2>
        @if (queue().length === 0) {
          <p class="t-caption muted">Nothing is waiting on you.</p>
        } @else {
          <ul class="queue">
            @for (r of queue(); track r.id) {
              <li class="queue-row">
                <app-avatar [name]="r.display_name" [size]="32" />
                <span class="who">
                  <span class="t-row">{{ r.display_name }}</span>
                  <span class="t-caption muted">{{ r.email }}</span>
                </span>
                <span class="queue-actions">
                  <button type="button" class="btn btn-sm" (click)="approve(r)" [disabled]="busy() === r.id">Approve</button>
                  <button type="button" class="btn btn-sm btn-text danger" (click)="decline(r)" [disabled]="busy() === r.id">
                    Decline
                  </button>
                </span>
              </li>
            }
          </ul>
        }
      </section>

      <!-- The guest list. -->
      <section class="panel-block" aria-labelledby="list-heading">
        <div class="toolbar">
          <h2 id="list-heading" class="t-section-heading">The guest list</h2>
          <div class="tools">
            <label class="sr-only" for="status-filter">Filter by status</label>
            <select id="status-filter" [ngModel]="filter()" (ngModelChange)="filter.set($event)">
              <option value="">All statuses</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ label(s) }}</option>
              }
            </select>
            <button type="button" class="btn btn-sm" (click)="exportCsv()">
              <app-icon name="download" [size]="16" />
              Export CSV
            </button>
          </div>
        </div>

        @if (filtered().length === 0) {
          <div class="empty-state">
            <h2>No Guests Yet</h2>
            <p>Share your event link and registrations will appear here.</p>
            <button type="button" class="btn btn-primary btn-pill" (click)="copyLink()">Copy Link</button>
          </div>
        } @else {
          <!-- Only the rows the window shows are drawn, however long the list is. -->
          <div class="scroller" #scroller (scroll)="onScroll()">
            <div class="spacer" [style.height.px]="filtered().length * rowHeight">
              <table [style.transform]="'translateY(' + offsetPx() + 'px)'">
                <caption class="sr-only">Guests for {{ ev.title }}, sorted by status then waiting-list position then email</caption>
                <thead>
                  <tr>
                    <th scope="col">Guest</th>
                    <th scope="col" class="col-email">Email</th>
                    <th scope="col">Status</th>
                    <th scope="col">Position</th>
                    <th scope="col">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of window(); track r.id) {
                    <tr>
                      <td data-label="Guest">
                        <span class="cell-name">
                          <app-avatar [name]="r.display_name" [size]="24" />
                          {{ r.display_name }}
                        </span>
                      </td>
                      <td data-label="Email" class="col-email">{{ r.email }}</td>
                      <td data-label="Status"><span class="pill" [class]="tone(r.status)">{{ label(r.status) }}</span></td>
                      <td data-label="Position">{{ r.waitlist_position ?? '—' }}</td>
                      <td data-label="Ticket" class="code">{{ r.ticket_code ?? '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </section>

      <!-- The door. -->
      <section class="panel-block" aria-labelledby="door-heading">
        <h2 id="door-heading" class="t-section-heading">The door</h2>
        <form class="door" (ngSubmit)="checkIn()">
          <div class="field door-field">
            <label for="door-code">Ticket code</label>
            <input id="door-code" name="code" type="text" placeholder="TKT-" [(ngModel)]="code" autocomplete="off" />
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="checking()">
            @if (checking()) {
              <app-spinner [size]="18" />
            }
            Check In
          </button>
        </form>
        <p class="t-caption door-answer" role="status" aria-live="polite">{{ doorAnswer() }}</p>
      </section>
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .panel-block {
        border: 1px solid var(--ink-08);
        border-radius: var(--r-card-lg);
        padding: var(--s5);
        margin-bottom: var(--s5);
      }
      .muted {
        color: var(--muted);
      }
      .queue {
        display: flex;
        flex-direction: column;
        margin-top: var(--s3);
      }
      .queue-row {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }
      .who {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .queue-actions {
        display: flex;
        gap: var(--s2);
      }
      .danger {
        color: var(--danger);
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        flex-wrap: wrap;
        margin-bottom: var(--s3);
      }
      .tools {
        display: flex;
        gap: var(--s2);
        align-items: center;
      }
      .tools select {
        min-height: 44px;
        padding: 0 var(--s3);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }
      .scroller {
        max-height: 480px;
        overflow-y: auto;
        position: relative;
      }
      .spacer {
        position: relative;
      }
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
        color: var(--ink-64);
        padding: var(--s2) var(--s2);
        border-bottom: 1px solid var(--divider);
        background: var(--paper);
        position: sticky;
        top: 0;
        z-index: 1;
      }
      td {
        padding: var(--s2);
        border-bottom: 1px solid var(--divider);
        font-size: 15px;
        line-height: 22px;
        height: 56px;
      }
      .cell-name {
        display: flex;
        align-items: center;
        gap: var(--s2);
      }
      .code {
        font-family: var(--mono);
        font-size: 13px;
      }
      .door {
        display: flex;
        gap: var(--s3);
        align-items: flex-end;
        margin-top: var(--s3);
        flex-wrap: wrap;
      }
      .door-field {
        flex: 1;
        min-width: 200px;
        margin-bottom: 0;
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
      @media (max-width: 483px) {
        .scroller {
          max-height: none;
          overflow: visible;
        }
        .spacer {
          height: auto !important;
        }
        table {
          position: static;
          transform: none !important;
        }
        thead {
          display: none;
        }
        tr {
          display: block;
          border: 1px solid var(--ink-08);
          border-radius: var(--r-card);
          padding: var(--s3);
          margin-bottom: var(--s3);
        }
        td {
          display: flex;
          justify-content: space-between;
          gap: var(--s3);
          height: auto;
          border: 0;
          padding: var(--s1) 0;
        }
        td::before {
          content: attr(data-label);
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-64);
        }
        .col-email {
          display: flex;
        }
      }
    `,
  ],
})
export class ManageGuestsComponent {
  readonly state = inject(ManageStateService);
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

  readonly filter = signal('');
  readonly busy = signal<string | null>(null);
  readonly checking = signal(false);
  readonly doorAnswer = signal('');
  readonly scrollTop = signal(0);
  readonly rowHeight = ROW_HEIGHT;
  code = '';

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly queue = computed(() => this.state.guests().filter((r) => r.status === 'pending_approval'));

  readonly filtered = computed(() => {
    const f = this.filter();
    const rows = this.state.guests();
    return f ? rows.filter((r) => r.status === f) : rows;
  });

  readonly firstIndex = computed(() => Math.max(0, Math.floor(this.scrollTop() / ROW_HEIGHT) - OVERSCAN));

  readonly window = computed(() => {
    const rows = this.filtered();
    const visible = Math.ceil(480 / ROW_HEIGHT) + OVERSCAN * 2;
    return rows.slice(this.firstIndex(), this.firstIndex() + visible);
  });

  readonly offsetPx = computed(() => this.firstIndex() * ROW_HEIGHT);

  onScroll() {
    const el = this.scroller()?.nativeElement;
    if (el) this.scrollTop.set(el.scrollTop);
  }

  label(s: RegistrationStatus) {
    return statusLabel(s);
  }

  tone(s: RegistrationStatus) {
    return statusTone(s);
  }

  async approve(row: GuestRow) {
    this.busy.set(row.id);
    try {
      const updated = await this.api.approve(row.id);
      await this.state.refresh();
      if (updated.status === 'waitlisted') {
        this.notices.show(
          `${row.display_name} was approved into a full event, so they hold waiting-list place ${updated.waitlist_position}.`,
          'warning',
        );
      } else {
        this.notices.show(`${row.display_name} is confirmed and has been mailed their ticket.`, 'success');
      }
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.busy.set(null);
    }
  }

  async decline(row: GuestRow) {
    this.busy.set(row.id);
    try {
      await this.api.decline(row.id);
      await this.state.refresh();
      this.notices.show(`${row.display_name} was declined and has been told.`, 'info');
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.busy.set(null);
    }
  }

  async checkIn() {
    const code = this.code.trim().toUpperCase();
    if (!code || this.checking()) return;
    this.checking.set(true);
    this.doorAnswer.set('');
    try {
      const reg = await this.api.checkIn(code);
      await this.state.refresh();
      const ev = this.state.event();
      const at = formatInZone(reg.checked_in_at!, ev?.time_zone ?? 'UTC');
      // A second check-in of the same code answers with the arrival time, not a second arrival.
      this.doorAnswer.set(
        reg.already_checked_in ? `That ticket was already checked in at ${at}.` : `Checked in at ${at}.`,
      );
      this.notices.show(reg.already_checked_in ? 'That ticket is already through the door.' : 'Checked in.', reg.already_checked_in ? 'warning' : 'success');
      this.code = '';
    } catch (e) {
      const err = e as ApiError;
      this.doorAnswer.set(err.status === 404 ? 'No ticket carries that code. Check it and try again.' : err.message);
    } finally {
      this.checking.set(false);
    }
  }

  async exportCsv() {
    const ev = this.state.event();
    if (!ev) return;
    try {
      await this.api.downloadGuestListCsv(ev.slug);
      this.notices.show('The guest list is downloading.', 'success');
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    }
  }

  async copyLink() {
    const ev = this.state.event();
    if (!ev) return;
    const url = `${window.location.origin}/${ev.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      this.notices.show('The event link is on your clipboard.', 'success');
    } catch {
      this.notices.show(`Copy this address by hand: ${url}`, 'info');
    }
  }
}

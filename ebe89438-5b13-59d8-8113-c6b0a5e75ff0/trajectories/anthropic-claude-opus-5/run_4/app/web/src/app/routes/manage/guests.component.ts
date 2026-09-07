import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, ApiService } from '../../core/api.service';
import { EventDetail, GuestRow, STATUS_LABELS, RegistrationStatus } from '../../core/models';
import { NoticeService } from '../../core/notice.service';
import { formatDateTime, visitorZone } from '../../core/time';
import { IconComponent } from '../../ui/icon.component';
import { PillComponent } from '../../ui/pill.component';
import { ShellComponent } from '../../ui/shell.component';
import { NotFoundComponent } from '../not-found.component';
import { ManageNavComponent } from './manage-nav.component';

const ROW_HEIGHT = 52;
const OVERSCAN = 6;

@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [FormsModule, ShellComponent, ManageNavComponent, PillComponent, IconComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-shell>
        <h1 class="t-screen-title">{{ event()?.title ?? 'Guests' }}</h1>
        <app-manage-nav [slug]="slug()" />

        @if (loading()) {
          <div class="sk" style="height:240px;border-radius:12px"></div>
        } @else {
          <!-- The queue comes first and shows only requests awaiting a decision. -->
          <section class="block" aria-labelledby="queue-h">
            <h2 id="queue-h" class="t-section">The queue</h2>
            @if (queue().length === 0) {
              <p class="t-caption muted">Nothing is waiting on your decision.</p>
            } @else {
              <ul class="queue">
                @for (g of queue(); track g.id) {
                  <li class="q-row">
                    <span class="t-row">{{ g.display_name }}</span>
                    <span class="t-caption muted email">{{ g.email }}</span>
                    <span class="q-actions">
                      <button type="button" class="btn btn-sm" (click)="approve(g)" [disabled]="busy() === g.id">
                        Approve
                      </button>
                      <button type="button" class="btn btn-text btn-sm" (click)="decline(g)" [disabled]="busy() === g.id">
                        Decline
                      </button>
                    </span>
                  </li>
                }
              </ul>
            }
          </section>

          <!-- The guest list. Only the rows the window shows are drawn, however
               long the list is. -->
          <section class="block" aria-labelledby="list-h">
            <div class="toolbar">
              <h2 id="list-h" class="t-section">Guest list</h2>
              <div class="tools">
                <label class="visually-hidden" for="status-filter">Filter by status</label>
                <select id="status-filter" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
                  <option value="">Every status</option>
                  @for (s of statuses; track s) {
                    <option [value]="s">{{ statusLabel(s) }}</option>
                  }
                </select>
                <button type="button" class="btn btn-sm" (click)="exportCsv()">
                  <app-icon name="download" [size]="16" />
                  <span>Export CSV</span>
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
              <div class="table-scroll" #scroller (scroll)="onScroll()">
                <table>
                  <caption class="visually-hidden">
                    Guests for {{ event()?.title }}, sorted by status, then waiting-list position, then email
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
                  <tbody [style.height.px]="totalHeight()">
                    <tr class="spacer" [style.height.px]="topPad()" aria-hidden="true">
                      <td colspan="5"></td>
                    </tr>
                    @for (g of window(); track g.id) {
                      <tr>
                        <td data-label="Guest">{{ g.display_name }}</td>
                        <td data-label="Email" class="col-email">{{ g.email }}</td>
                        <td data-label="Status"><app-pill [status]="g.status" /></td>
                        <td data-label="Waiting">{{ g.waitlist_position ?? '—' }}</td>
                        <td data-label="Ticket" class="code">{{ g.ticket_code ?? '—' }}</td>
                      </tr>
                    }
                    <tr class="spacer" [style.height.px]="bottomPad()" aria-hidden="true">
                      <td colspan="5"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            }
          </section>

          <!-- The door. -->
          <section class="block" aria-labelledby="door-h">
            <h2 id="door-h" class="t-section">The door</h2>
            <form class="door" (ngSubmit)="checkIn()">
              <div class="field door-field">
                <label for="code">Ticket code</label>
                <input id="code" name="code" [(ngModel)]="code" placeholder="TKT-" autocomplete="off" />
              </div>
              <button type="submit" class="btn btn-primary btn-pill" [disabled]="!code.trim() || checking()">
                Check In
              </button>
            </form>
            <p class="door-answer" role="status" aria-live="polite">{{ doorAnswer() }}</p>
          </section>
        }
      </app-shell>
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .block {
        margin-bottom: var(--s7);
      }
      .block h2 {
        margin-bottom: var(--s3);
      }
      .muted {
        color: var(--muted);
      }
      .queue {
        display: flex;
        flex-direction: column;
      }
      .q-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--divider);
      }
      .q-actions {
        display: flex;
        gap: var(--s2);
        justify-content: flex-end;
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
      .table-scroll {
        max-height: 460px;
        overflow: auto;
        border: 1px solid var(--ink-08);
        border-radius: var(--r-card);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 15px;
        line-height: 22px;
      }
      thead th {
        position: sticky;
        top: 0;
        background: var(--paper);
        text-align: left;
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        color: var(--muted);
        padding: var(--s3);
        border-bottom: 1px solid var(--divider);
        z-index: 1;
      }
      tbody td {
        padding: var(--s3);
        border-bottom: 1px solid var(--divider);
        height: 52px;
      }
      tr.spacer td {
        padding: 0;
        border: 0;
        height: inherit;
      }
      .code {
        font-family: var(--mono);
        font-size: 13px;
      }
      .door {
        display: flex;
        gap: var(--s3);
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .door-field {
        margin-bottom: 0;
        min-width: 220px;
      }
      .door-answer:empty {
        display: none;
      }
      .door-answer {
        margin-top: var(--s3);
        font-size: 15px;
        line-height: 22px;
        color: var(--ink-64);
      }

      @media (max-width: 649px) {
        .col-email {
          display: none;
        }
        .q-row {
          grid-template-columns: 1fr;
        }
        .q-actions {
          justify-content: flex-start;
        }
      }
      /* Below 484px the table becomes one card per guest, keeping the header
         words as labels on each value. */
      @media (max-width: 483px) {
        thead {
          display: none;
        }
        table,
        tbody,
        tr,
        td {
          display: block;
          width: 100%;
        }
        tbody tr:not(.spacer) {
          border: 1px solid var(--ink-08);
          border-radius: var(--r-card);
          margin-bottom: var(--s3);
          padding: var(--s2);
        }
        tbody td {
          height: auto;
          border: 0;
          display: flex;
          justify-content: space-between;
          gap: var(--s3);
          padding: 6px var(--s2);
        }
        tbody td::before {
          content: attr(data-label);
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
        }
        tbody {
          height: auto !important;
        }
      }
    `,
  ],
})
export class ManageGuestsComponent {
  slug = input.required<string>();

  private api = inject(ApiService);
  private notices = inject(NoticeService);
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly statuses: RegistrationStatus[] = [
    'pending_approval',
    'confirmed',
    'checked_in',
    'waitlisted',
    'declined',
    'cancelled_by_guest',
    'cancelled_by_host',
  ];

  readonly event = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly statusFilter = signal('');
  readonly busy = signal<number | null>(null);
  readonly checking = signal(false);
  readonly doorAnswer = signal('');
  readonly scrollTop = signal(0);
  readonly viewportRows = signal(12);

  code = '';
  private loaded = '';

  statusLabel = (s: RegistrationStatus) => STATUS_LABELS[s];

  readonly queue = computed(() => this.guests().filter((g) => g.status === 'pending_approval'));

  readonly filtered = computed(() => {
    const f = this.statusFilter();
    return f ? this.guests().filter((g) => g.status === f) : this.guests();
  });

  readonly totalHeight = computed(() => this.filtered().length * ROW_HEIGHT);
  readonly firstIndex = computed(() =>
    Math.max(0, Math.floor(this.scrollTop() / ROW_HEIGHT) - OVERSCAN),
  );
  readonly lastIndex = computed(() =>
    Math.min(this.filtered().length, this.firstIndex() + this.viewportRows() + OVERSCAN * 2),
  );
  readonly window = computed(() => this.filtered().slice(this.firstIndex(), this.lastIndex()));
  readonly topPad = computed(() => this.firstIndex() * ROW_HEIGHT);
  readonly bottomPad = computed(() => Math.max(0, (this.filtered().length - this.lastIndex()) * ROW_HEIGHT));

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load() {
    const slug = this.slug();
    if (this.loaded === slug) return;
    this.loaded = slug;
    try {
      const e = await this.api.event(slug);
      if (!e.is_owner) {
        this.missing.set(true);
        return;
      }
      this.event.set(e);
      this.guests.set(await this.api.guests(slug));
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  onScroll() {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    this.scrollTop.set(el.scrollTop);
    this.viewportRows.set(Math.ceil(el.clientHeight / ROW_HEIGHT));
  }

  private async refresh() {
    this.guests.set(await this.api.guests(this.slug()));
    this.event.set(await this.api.event(this.slug()));
  }

  /** Approving into a full event moves that row to the waiting list and says so. */
  async approve(g: GuestRow) {
    this.busy.set(g.id);
    try {
      const r = await this.api.approve(g.id);
      await this.refresh();
      if (r.status === 'waitlisted') {
        this.notices.warn(
          `This event just filled up. ${g.display_name} is on the waiting list at number ${r.waitlist_position}.`,
        );
      } else {
        this.notices.success(`${g.display_name} has a seat, and the ticket is on its way by email.`);
      }
    } catch (err) {
      this.notices.refuse((err as ApiError).message);
    } finally {
      this.busy.set(null);
    }
  }

  async decline(g: GuestRow) {
    this.busy.set(g.id);
    try {
      await this.api.decline(g.id);
      await this.refresh();
      this.notices.success(`${g.display_name} has been told, kindly.`);
    } catch (err) {
      this.notices.refuse((err as ApiError).message);
    } finally {
      this.busy.set(null);
    }
  }

  /** A code already checked in answers with the arrival time, not a second arrival. */
  async checkIn() {
    const code = this.code.trim().toUpperCase();
    if (!code) return;
    this.checking.set(true);
    this.doorAnswer.set('');
    try {
      const r = await this.api.checkIn(code);
      if (r.already_checked_in) {
        this.doorAnswer.set(
          `That ticket already arrived at ${formatDateTime(r.checked_in_at, visitorZone())}. One arrival, not two.`,
        );
      } else {
        this.doorAnswer.set('Checked in. Welcome them through.');
      }
      this.code = '';
      await this.refresh();
    } catch (err) {
      this.doorAnswer.set((err as ApiError).message);
    } finally {
      this.checking.set(false);
    }
  }

  async exportCsv() {
    try {
      await this.api.downloadGuestCsv(this.slug());
    } catch (err) {
      this.notices.refuse((err as ApiError).message);
    }
  }

  async copyLink() {
    const url = `${location.origin}/${this.slug()}`;
    try {
      await navigator.clipboard.writeText(url);
      this.notices.success('The address is on your clipboard.');
    } catch {
      this.notices.warn(`Copy this by hand: ${url}`);
    }
  }
}

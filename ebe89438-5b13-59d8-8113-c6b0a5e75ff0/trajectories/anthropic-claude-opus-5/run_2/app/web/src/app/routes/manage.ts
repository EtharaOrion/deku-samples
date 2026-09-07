import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, ApiError } from '../core/api';
import {
  EVENT_STATE_TONES,
  EVENT_STATE_WORDS,
  EventDetail,
  GuestRow,
  RegistrationStatus,
  STATUS_TONES,
  STATUS_WORDS,
} from '../core/models';
import { Notices } from '../core/notices';
import { ThemeService } from '../core/theme';
import { dateTimeInZone, timeInZone } from '../core/time';
import {
  DialogComponent,
  EmptyStateComponent,
  PillComponent,
  SkeletonComponent,
} from '../ui/kit';

/* --------------------------------------------------------------- overview */

@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PillComponent,
    SkeletonComponent,
    DialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <app-skeleton height="32px" width="50%"></app-skeleton>
      <app-skeleton height="90px" radius="12px"></app-skeleton>
    } @else if (event(); as e) {
      <header class="masthead">
        <div class="mast-row">
          <h1 class="screen-title">{{ e.title }}</h1>
          <app-pill [word]="stateWord(e)" [tone]="stateTone(e)"></app-pill>
        </div>
        <p class="address">
          <span class="addr-text">{{ address(e) }}</span>
          <button type="button" class="btn btn-sm" (click)="copyLink(e)">Copy Link</button>
        </p>
      </header>

      @if (e.state === 'cancelled') {
        <section class="notice-panel">
          <h2 class="np-title">This event has been cancelled</h2>
          <p class="np-body">{{ e.cancel_reason }}</p>
        </section>
      } @else {
        <ul class="counters">
          <li>
            <span class="count">{{ e.confirmed_count }}/{{ e.capacity }}</span>
            <span class="overline">Confirmed</span>
          </li>
          <li>
            <span class="count">{{ waiting() }}</span>
            <span class="overline">Waiting</span>
          </li>
          <li>
            <span class="count">{{ awaiting() }}</span>
            <span class="overline">Awaiting Approval</span>
          </li>
          <li>
            <span class="count">{{ arrived() }}</span>
            <span class="overline">Arrived</span>
          </li>
        </ul>

        <section class="todo">
          <h2 class="section-title">Next three things</h2>
          <ol class="todo-list">
            @for (item of todos(); track item) {
              <li>{{ item }}</li>
            }
          </ol>
        </section>
      }

      <nav class="sisters" aria-label="Manage this event">
        <a class="btn btn-sm" [routerLink]="'/event/' + e.slug + '/manage/guests'">
          Guests, queue and door
        </a>
        <a class="btn btn-sm" [routerLink]="'/event/' + e.slug + '/manage/registration'">
          Capacity and approval
        </a>
        @if (e.state !== 'cancelled') {
          <button type="button" class="btn btn-sm danger-text" (click)="cancelOpen.set(true)">
            Cancel Event
          </button>
        }
      </nav>

      @if (cancelOpen()) {
        <app-dialog heading="Cancel this event?" (closed)="cancelOpen.set(false)">
          <p class="dialog-body">
            Every guest still holding a place will be emailed your reason, and the event
            cannot be brought back.
          </p>
          <div class="field">
            <label class="field-label" for="reason">Why is it off?</label>
            <textarea
              id="reason"
              name="reason"
              class="field-input"
              rows="3"
              [(ngModel)]="reason"
            ></textarea>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn" (click)="cancelOpen.set(false)">Keep It</button>
            <button
              type="button"
              class="btn btn-danger"
              [disabled]="!reason.trim() || working()"
              (click)="confirmCancel()"
            >
              {{ working() ? 'Cancelling…' : 'Cancel Event' }}
            </button>
          </div>
        </app-dialog>
      }
    }
  `,
  styles: [managementStyles()],
})
export class ManageOverviewComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly slug = input.required<string>();
  readonly event = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly cancelOpen = signal(false);
  readonly working = signal(false);
  reason = '';

  private controller = new AbortController();

  readonly waiting = computed(
    () => this.guests().filter((g) => g.status === 'waitlisted').length,
  );
  readonly awaiting = computed(
    () => this.guests().filter((g) => g.status === 'pending_approval').length,
  );
  readonly arrived = computed(
    () => this.guests().filter((g) => g.status === 'checked_in').length,
  );

  readonly todos = computed(() => {
    const out: string[] = [];
    if (this.awaiting() > 0) {
      out.push(`Work the approval queue: ${this.awaiting()} waiting on you.`);
    }
    const e = this.event();
    if (e && e.capacity !== null && e.confirmed_count >= e.capacity && this.waiting() > 0) {
      out.push(`Raise capacity to seat ${this.waiting()} on the waiting list.`);
    }
    if (this.arrived() === 0 && this.guests().length > 0) {
      out.push('Check tickets in at the door when guests arrive.');
    }
    out.push('Share the event address so more people can find it.');
    return out.slice(0, 3);
  });

  constructor() {
    inject(ThemeService).clear();
  }

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    Promise.all([
      this.api.getEvent(this.slug(), this.controller.signal),
      this.api.listGuests(this.slug(), this.controller.signal),
    ])
      .then(([event, guests]) => {
        // A guest reaching a manage route meets the ordinary not-found page.
        if (!event.is_owner) throw new ApiError(404, 'Not found');
        this.event.set(event);
        this.guests.set(guests);
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  address(e: EventDetail) {
    return `${window.location.origin}/${e.slug}`;
  }

  async copyLink(e: EventDetail) {
    try {
      await navigator.clipboard.writeText(this.address(e));
      this.notices.success('The event address is on your clipboard.');
    } catch {
      this.notices.info(this.address(e));
    }
  }

  stateWord(e: EventDetail) {
    return EVENT_STATE_WORDS[e.state];
  }

  stateTone(e: EventDetail) {
    return EVENT_STATE_TONES[e.state];
  }

  async confirmCancel() {
    this.working.set(true);
    try {
      const updated = await this.api.cancelEvent(this.slug(), this.reason.trim());
      this.event.set({ ...(this.event() as EventDetail), ...updated });
      this.cancelOpen.set(false);
      this.notices.success('The event is cancelled and every guest has been emailed.');
    } catch (err) {
      this.notices.danger(
        err instanceof ApiError ? err.message : 'That did not go through.',
      );
    } finally {
      this.working.set(false);
    }
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

/* ----------------------------------------------------------------- guests */

@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [FormsModule, PillComponent, SkeletonComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <app-skeleton height="32px" width="40%"></app-skeleton>
      <app-skeleton height="200px" radius="12px"></app-skeleton>
    } @else if (event(); as e) {
      <h1 class="screen-title">{{ e.title }} · Guests</h1>

      <!-- The queue comes first and shows only pending_approval rows. -->
      @if (queue().length) {
        <section class="panel-block" aria-labelledby="queue-h">
          <h2 id="queue-h" class="section-title">Approval queue</h2>
          <ul class="queue">
            @for (g of queue(); track g.id) {
              <li class="queue-row">
                <span class="who">
                  <span class="name">{{ g.display_name }}</span>
                  <span class="email">{{ g.email }}</span>
                </span>
                <span class="q-actions">
                  <button type="button" class="btn btn-sm" (click)="approve(g)" [disabled]="busy()">
                    Approve
                  </button>
                  <button type="button" class="btn btn-sm" (click)="decline(g)" [disabled]="busy()">
                    Decline
                  </button>
                </span>
              </li>
            }
          </ul>
        </section>
      }

      <section class="panel-block" aria-labelledby="list-h">
        <div class="toolbar">
          <h2 id="list-h" class="section-title">Guest list</h2>
          <div class="tools">
            <label class="sr-only" for="status-filter">Filter by status</label>
            <select
              id="status-filter"
              class="field-input compact"
              [value]="filter()"
              (change)="filter.set($any($event.target).value)"
            >
              <option value="">All statuses</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ word(s) }}</option>
              }
            </select>
            <button type="button" class="btn btn-sm" (click)="exportCsv()">Export CSV</button>
          </div>
        </div>

        @if (filtered().length === 0) {
          <app-empty-state
            heading="No Guests Yet"
            body="Share your event link and registrations will appear here."
          >
            <button type="button" class="btn" (click)="copyLink(e)">Copy Link</button>
          </app-empty-state>
        } @else {
          <!-- only the rows the window shows are drawn, however long the list -->
          <div class="table-scroll" #scroller (scroll)="onScroll()">
            <div class="spacer" [style.height.px]="topPad()"></div>
            <table class="guests">
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
                @for (g of window(); track g.id) {
                  <tr>
                    <td data-label="Guest">{{ g.display_name }}</td>
                    <td data-label="Email" class="col-email">{{ g.email }}</td>
                    <td data-label="Status">
                      <app-pill [word]="word(g.status)" [tone]="tone(g.status)"></app-pill>
                    </td>
                    <td data-label="Waiting">{{ g.waitlist_position ?? '—' }}</td>
                    <td data-label="Ticket" class="code-cell">{{ g.ticket_code ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="spacer" [style.height.px]="bottomPad()"></div>
          </div>
        }
      </section>

      <!-- the door -->
      <section class="panel-block" aria-labelledby="door-h">
        <h2 id="door-h" class="section-title">The door</h2>
        <form class="door" (ngSubmit)="checkIn()" novalidate>
          <div class="field door-field">
            <label class="field-label" for="door-code">Ticket code</label>
            <input
              id="door-code"
              name="code"
              class="field-input"
              placeholder="TKT-"
              [(ngModel)]="doorCode"
            />
          </div>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">Check In</button>
        </form>
        <p class="door-answer" role="status" aria-live="polite">{{ doorAnswer() }}</p>
      </section>
    }
  `,
  styles: [managementStyles()],
})
export class ManageGuestsComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly slug = input.required<string>();
  readonly event = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly filter = signal('');
  readonly doorAnswer = signal('');
  doorCode = '';

  readonly statuses: RegistrationStatus[] = [
    'pending_approval',
    'confirmed',
    'waitlisted',
    'checked_in',
    'declined',
    'cancelled_by_guest',
    'cancelled_by_host',
  ];

  private controller = new AbortController();
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /* virtualisation: only the rows on screen are drawn */
  private readonly ROW = 53;
  private readonly OVERSCAN = 6;
  readonly scrollTop = signal(0);
  readonly viewportHeight = signal(600);

  readonly queue = computed(() =>
    this.guests().filter((g) => g.status === 'pending_approval'),
  );

  readonly filtered = computed(() => {
    const f = this.filter();
    return f ? this.guests().filter((g) => g.status === f) : this.guests();
  });

  readonly firstIndex = computed(() =>
    Math.max(0, Math.floor(this.scrollTop() / this.ROW) - this.OVERSCAN),
  );

  readonly window = computed(() => {
    const count =
      Math.ceil(this.viewportHeight() / this.ROW) + this.OVERSCAN * 2;
    return this.filtered().slice(this.firstIndex(), this.firstIndex() + count);
  });

  readonly topPad = computed(() => this.firstIndex() * this.ROW);
  readonly bottomPad = computed(() =>
    Math.max(
      0,
      (this.filtered().length - this.firstIndex() - this.window().length) * this.ROW,
    ),
  );

  constructor() {
    inject(ThemeService).clear();
  }

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    Promise.all([
      this.api.getEvent(this.slug(), this.controller.signal),
      this.api.listGuests(this.slug(), this.controller.signal),
    ])
      .then(([event, guests]) => {
        if (!event.is_owner) throw new ApiError(404, 'Not found');
        this.event.set(event);
        this.guests.set(guests);
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  private async refreshGuests() {
    this.guests.set(await this.api.listGuests(this.slug()));
  }

  onScroll() {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    this.scrollTop.set(el.scrollTop);
    this.viewportHeight.set(el.clientHeight);
  }

  word(s: RegistrationStatus) {
    return STATUS_WORDS[s];
  }

  tone(s: RegistrationStatus) {
    return STATUS_TONES[s];
  }

  async approve(g: GuestRow) {
    this.busy.set(true);
    try {
      const updated = await this.api.approve(g.id);
      await this.refreshGuests();
      if (updated.status === 'waitlisted') {
        // says so in a notice rather than silently
        this.notices.warn(
          `${g.display_name} was moved to the waiting list at position ${updated.waitlist_position}, because the event is full.`,
        );
      } else {
        this.notices.success(`${g.display_name} is confirmed and has been emailed.`);
      }
    } catch (err) {
      this.notices.danger(
        err instanceof ApiError ? err.message : 'That did not go through.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async decline(g: GuestRow) {
    this.busy.set(true);
    try {
      await this.api.decline(g.id);
      await this.refreshGuests();
      this.notices.info(`${g.display_name} has been declined and emailed.`);
    } catch (err) {
      this.notices.danger(
        err instanceof ApiError ? err.message : 'That did not go through.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async checkIn() {
    const code = this.doorCode.trim().toUpperCase();
    if (!code) return;
    this.busy.set(true);
    this.doorAnswer.set('');
    try {
      const reg = await this.api.checkIn(code);
      await this.refreshGuests();
      if (reg.already_checked_in) {
        // a code already checked in answers with the arrival time
        const at = reg.checked_in_at
          ? timeInZone(reg.checked_in_at, this.event()?.time_zone ?? 'UTC')
          : 'earlier';
        this.doorAnswer.set(`That ticket was already checked in at ${at}.`);
      } else {
        this.doorAnswer.set('Checked in. Welcome them through.');
      }
      this.doorCode = '';
    } catch (err) {
      this.doorAnswer.set(
        err instanceof ApiError ? err.message : 'That code was not recognised.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async exportCsv() {
    try {
      await this.api.downloadCsv(this.slug());
      this.notices.success('The guest list is downloading.');
    } catch {
      this.notices.danger('That export is not available to you.');
    }
  }

  async copyLink(e: EventDetail) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${e.slug}`);
      this.notices.success('The event address is on your clipboard.');
    } catch {
      this.notices.info(`${window.location.origin}/${e.slug}`);
    }
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

/* ----------------------------------------------------- registration settings */

@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [FormsModule, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <app-skeleton height="32px" width="40%"></app-skeleton>
      <app-skeleton height="220px" radius="12px"></app-skeleton>
    } @else if (event(); as e) {
      <h1 class="screen-title">{{ e.title }} · Registration</h1>

      <ul class="settings">
        <li class="setting">
          <div class="s-copy">
            <span class="s-label" id="cap-label">Capacity</span>
            <span class="s-caption">{{ capacityCaption() }}</span>
          </div>
          <div class="stepper" role="group" aria-labelledby="cap-label">
            <button type="button" class="step" (click)="bumpCapacity(-1)" [disabled]="busy()">
              <span class="sr-only">Lower the capacity</span><span aria-hidden="true">−</span>
            </button>
            <input
              class="cap-input"
              type="number"
              min="1"
              max="500"
              aria-labelledby="cap-label"
              [(ngModel)]="capacity"
              (change)="saveCapacity()"
            />
            <button type="button" class="step" (click)="bumpCapacity(1)" [disabled]="busy()">
              <span class="sr-only">Raise the capacity</span><span aria-hidden="true">+</span>
            </button>
          </div>
        </li>

        <li class="setting">
          <div class="s-copy">
            <span class="s-label" id="appr-label">Approval required</span>
            <span class="s-caption">Every request waits for you before a seat is held.</span>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-labelledby="appr-label"
            [attr.aria-checked]="e.approval_required"
            [class.on]="e.approval_required"
            (click)="toggle('approval_required', !e.approval_required)"
            [disabled]="busy()"
          >
            <span class="knob"></span>
            <span class="sr-only">{{ e.approval_required ? 'On' : 'Off' }}</span>
          </button>
        </li>

        <li class="setting">
          <div class="s-copy">
            <span class="s-label" id="wait-label">Waiting list</span>
            <span class="s-caption">A full event takes waiting-list places instead of refusing.</span>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-labelledby="wait-label"
            [attr.aria-checked]="e.waitlist_enabled"
            [class.on]="e.waitlist_enabled"
            (click)="toggle('waitlist_enabled', !e.waitlist_enabled)"
            [disabled]="busy()"
          >
            <span class="knob"></span>
            <span class="sr-only">{{ e.waitlist_enabled ? 'On' : 'Off' }}</span>
          </button>
        </li>

        <li class="setting">
          <div class="s-copy">
            <span class="s-label" id="open-label">Registration Open</span>
            <span class="s-caption">Turning this off shows the closed panel and emails nobody.</span>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-labelledby="open-label"
            [attr.aria-checked]="isOpen()"
            [class.on]="isOpen()"
            (click)="toggleOpen()"
            [disabled]="busy() || e.state === 'cancelled'"
          >
            <span class="knob"></span>
            <span class="sr-only">{{ isOpen() ? 'Open' : 'Closed' }}</span>
          </button>
        </li>
      </ul>

      <p class="live" role="status" aria-live="polite">{{ liveMessage() }}</p>
    }
  `,
  styles: [managementStyles()],
})
export class ManageRegistrationComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly slug = input.required<string>();
  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly liveMessage = signal('');
  readonly refusal = signal('');

  capacity = 0;
  private controller = new AbortController();

  readonly isOpen = computed(() => this.event()?.state === 'published');

  readonly capacityCaption = computed(() => {
    if (this.refusal()) return this.refusal();
    const e = this.event();
    return e ? `${e.confirmed_count} of ${e.capacity} seats are taken.` : '';
  });

  constructor() {
    inject(ThemeService).clear();
  }

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api
      .getEvent(this.slug(), this.controller.signal)
      .then((event) => {
        if (!event.is_owner) throw new ApiError(404, 'Not found');
        this.event.set(event);
        this.capacity = event.capacity ?? 0;
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  bumpCapacity(delta: number) {
    this.capacity = Math.max(1, Math.min(500, (this.capacity || 0) + delta));
    this.saveCapacity();
  }

  async saveCapacity() {
    const e = this.event();
    if (!e || this.capacity === e.capacity) return;
    this.busy.set(true);
    this.refusal.set('');
    try {
      const updated = await this.api.updateEvent(this.slug(), {
        capacity: Number(this.capacity),
      });
      this.event.set(updated);
      this.capacity = updated.capacity ?? 0;
      if (updated.promoted_count && updated.promoted_count > 0) {
        // the count a raise moves to a seat is announced politely
        const n = updated.promoted_count;
        const line = `${n} ${n === 1 ? 'guest was' : 'guests were'} moved from the waiting list to a seat.`;
        this.liveMessage.set(line);
        this.notices.success(line);
      } else {
        this.liveMessage.set('Capacity saved.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        this.refusal.set(err.message);
        this.notices.danger(err.message);
      }
      this.capacity = e.capacity ?? 0;
    } finally {
      this.busy.set(false);
    }
  }

  async toggle(field: 'approval_required' | 'waitlist_enabled', value: boolean) {
    this.busy.set(true);
    try {
      const updated = await this.api.updateEvent(this.slug(), { [field]: value });
      this.event.set(updated);
      this.liveMessage.set('Saved.');
    } catch (err) {
      this.notices.danger(
        err instanceof ApiError ? err.message : 'That did not save.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async toggleOpen() {
    const e = this.event();
    if (!e) return;
    this.busy.set(true);
    try {
      const state = this.isOpen() ? 'registration_closed' : 'published';
      const updated = await this.api.updateEvent(this.slug(), { state });
      this.event.set(updated);
      this.liveMessage.set(
        state === 'registration_closed'
          ? 'Registration is closed. The public panel now says so.'
          : 'Registration is open again.',
      );
    } catch (err) {
      this.notices.danger(
        err instanceof ApiError ? err.message : 'That did not save.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

function managementStyles(): string {
  return `
    .screen-title { margin-bottom: 24px; }
    .masthead { margin-bottom: 32px; }
    .mast-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .address {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .addr-text {
      font-size: 13px;
      line-height: 16px;
      color: var(--ink-64);
      word-break: break-all;
    }
    .counters {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .counters li {
      padding: 16px;
      border-radius: var(--r-card);
      background: var(--paper-inset);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .count { font-size: 22px; line-height: 26px; font-weight: 700; }
    .overline { color: var(--ink-64); }
    .section-title {
      font-size: 16px;
      line-height: 25.6px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .todo { margin-bottom: 32px; }
    .todo-list { display: flex; flex-direction: column; gap: 8px; }
    .todo-list li {
      font-size: 15px;
      line-height: 22px;
      color: var(--ink-64);
      padding-left: 16px;
      position: relative;
    }
    .todo-list li::before {
      content: '·';
      position: absolute;
      left: 4px;
      color: var(--ink-36);
    }
    .sisters { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 24px; }
    .danger-text { color: var(--danger); }
    .notice-panel {
      border: 1px solid rgba(255, 59, 48, 0.4);
      border-radius: var(--r-card);
      padding: 20px;
      margin-bottom: 32px;
    }
    .np-title { font-size: 16px; line-height: 24px; font-weight: 600; margin-bottom: 8px; }
    .np-body { color: var(--ink-64); line-height: 25.6px; }
    .panel-block { margin-bottom: 48px; }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .tools { display: flex; gap: 8px; align-items: center; }
    .compact { min-height: 44px; width: auto; }
    .queue { display: flex; flex-direction: column; }
    .queue-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--divider);
      flex-wrap: wrap;
    }
    .who { display: flex; flex-direction: column; }
    .name { font-size: 15px; line-height: 22px; font-weight: 500; }
    .email { font-size: 13px; line-height: 16px; color: var(--ink-64); }
    .q-actions { display: flex; gap: 8px; }
    .table-scroll { max-height: 560px; overflow-y: auto; }
    .guests { width: 100%; border-collapse: collapse; }
    .guests th {
      text-align: left;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      color: var(--ink-64);
      padding: 8px 12px 8px 0;
      border-bottom: 1px solid var(--divider);
      position: sticky;
      top: 0;
      background: var(--paper);
    }
    .guests td {
      padding: 14px 12px 14px 0;
      border-bottom: 1px solid var(--divider);
      font-size: 15px;
      line-height: 22px;
      vertical-align: middle;
    }
    .code-cell { font-family: var(--font-mono); font-size: 13px; }
    .door { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .door-field { flex: 1; min-width: 200px; margin-bottom: 0; }
    .door-answer { margin-top: 12px; font-size: 13px; line-height: 18px; color: var(--ink-64); }
    .settings { display: flex; flex-direction: column; }
    .setting {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 20px 0;
      border-bottom: 1px solid var(--divider);
    }
    .s-copy { display: flex; flex-direction: column; gap: 4px; }
    .s-label { font-size: 16px; line-height: 24px; font-weight: 500; }
    .s-caption { font-size: 13px; line-height: 16px; color: var(--ink-64); }
    .stepper { display: flex; align-items: center; gap: 4px; }
    .step {
      width: 44px;
      height: 44px;
      border-radius: var(--r-nav);
      border: 1px solid var(--ink-08);
      background: var(--paper);
      cursor: pointer;
      font-size: 18px;
      color: var(--ink);
    }
    .cap-input {
      width: 72px;
      height: 44px;
      text-align: center;
      border: 1px solid var(--ink-08);
      border-radius: var(--r-input);
      background: var(--paper);
      color: var(--ink);
      font-size: 16px;
    }
    .switch {
      width: 52px;
      height: 32px;
      min-width: 44px;
      border-radius: var(--r-round);
      border: none;
      background: var(--disabled-fill);
      position: relative;
      cursor: pointer;
      flex: none;
      padding: 0;
    }
    .switch .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 26px;
      height: 26px;
      border-radius: 100%;
      background: var(--paper);
      box-shadow: var(--shadow-card);
      transition: transform var(--dur) var(--ease);
    }
    .switch.on { background: var(--success); }
    .switch.on .knob { transform: translateX(20px); }
    .live { margin-top: 16px; font-size: 13px; line-height: 18px; color: var(--ink-64); }
    .dialog-body { font-size: 15px; line-height: 22px; color: var(--ink-64); margin-bottom: 16px; }
    .dialog-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .spacer { width: 100%; }
    @media (min-width: 650px) {
      .counters { grid-template-columns: repeat(4, 1fr); }
    }
    /* the table drops the email column, then becomes one card per guest */
    @media (max-width: 649px) {
      .col-email { display: none; }
    }
    @media (max-width: 483px) {
      .guests, .guests tbody, .guests tr, .guests td { display: block; width: 100%; }
      .guests thead { display: none; }
      .guests tr {
        border: 1px solid var(--divider);
        border-radius: var(--r-card);
        padding: 12px;
        margin-bottom: 12px;
      }
      .guests td { border: none; padding: 4px 0; display: flex; justify-content: space-between; gap: 12px; }
      /* the card form keeps the header words as labels on each value */
      .guests td::before {
        content: attr(data-label);
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-64);
      }
      .setting { flex-direction: column; align-items: flex-start; gap: 12px; }
    }
  `;
}

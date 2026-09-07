import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManageStore } from './manage.shell';
import { ApiService, ApiFailure } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { PillComponent } from '../ui/pill.component';
import { DialogComponent } from '../ui/dialog.component';
import { SpinnerComponent } from '../ui/bits';
import { dayLine, timeRange, zoneAbbrev } from '../core/time';
import { EVENT_STATE_TONES, EVENT_STATE_WORDS, type GuestRow } from '../core/models';

/**
 * A masthead of the title, its state as a word in a pill, and its address as a
 * copyable line. Below it a row of four counters over overlines, then the next
 * three things to do and a link to each sister screen. A cancelled event
 * replaces the counters with the notice carrying the host's own reason.
 */
@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [RouterLink, PillComponent, DialogComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.event(); as e) {
      <header class="masthead">
        <div class="masthead__top">
          <h1 class="t-screen-title masthead__title">{{ e.title }}</h1>
          <app-pill [word]="stateWord(e.state)" [tone]="stateTone(e.state)" />
        </div>
        <p class="t-caption masthead__when">{{ when(e) }}</p>
        <div class="address">
          <code class="address__value">{{ address(e.slug) }}</code>
          <button type="button" class="btn btn--sm" (click)="copyLink(e.slug)">Copy Link</button>
        </div>
      </header>

      @if (e.state === 'cancelled') {
        <section class="notice-block" role="status">
          <h2 class="t-prose-h">This event has been cancelled</h2>
          <p class="t-prose">{{ e.cancel_reason }}</p>
        </section>
      } @else {
        <ul class="counters">
          <li class="counter">
            <span class="counter__value">{{ e.confirmed_count }}/{{ e.capacity ?? '∞' }}</span>
            <span class="t-overline counter__label">Confirmed</span>
          </li>
          <li class="counter">
            <span class="counter__value">{{ waiting() }}</span>
            <span class="t-overline counter__label">Waiting</span>
          </li>
          <li class="counter">
            <span class="counter__value">{{ pending() }}</span>
            <span class="t-overline counter__label">Awaiting approval</span>
          </li>
          <li class="counter">
            <span class="counter__value">{{ arrived() }}</span>
            <span class="t-overline counter__label">Arrived</span>
          </li>
        </ul>

        <section class="todo" aria-labelledby="todo-head">
          <h2 class="t-overline todo__head" id="todo-head">Next three things to do</h2>
          <ol class="todo__list">
            @for (item of todo(); track item) {
              <li class="t-row todo__item">{{ item }}</li>
            }
          </ol>
        </section>
      }

      <nav class="sisters" aria-label="Other management screens">
        <a class="btn" [routerLink]="'/event/' + e.slug + '/manage/guests'">Guests, queue and door</a>
        <a class="btn" [routerLink]="'/event/' + e.slug + '/manage/registration'"
          >Capacity and approval</a
        >
      </nav>

      @if (e.state !== 'cancelled') {
        <section class="danger">
          <h2 class="t-prose-h">Call this event off</h2>
          <p class="t-caption danger__body">
            Everybody still holding a place is written to with your own words. A cancellation cannot
            be undone.
          </p>
          <button type="button" class="btn btn--danger" (click)="cancelOpen.set(true)">
            Cancel Event
          </button>
        </section>
      }
    }

    @if (cancelOpen()) {
      <app-dialog heading="Cancel this event?" (closed)="cancelOpen.set(false)">
        <p class="t-prose">
          Every guest still holding a place is mailed your reason word for word, and this cannot be
          undone.
        </p>
        <div class="field" [class.field--refused]="!!refusal()">
          <label class="field__label" for="cancel-reason">Your reason</label>
          <textarea
            id="cancel-reason"
            class="input"
            rows="3"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          ></textarea>
          @if (refusal()) {
            <p class="field__refusal" role="alert">{{ refusal() }}</p>
          }
        </div>
        <div dialogActions>
          <button type="button" class="btn" (click)="cancelOpen.set(false)">Keep It On</button>
          <button
            type="button"
            class="btn btn--danger"
            (click)="cancelEvent()"
            [disabled]="reason().trim().length === 0 || working()"
          >
            @if (working()) {
              <app-spinner />
            }
            Cancel Event
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: [
    `
      .masthead { display: flex; flex-direction: column; gap: var(--s2); margin-bottom: var(--s6); }
      .masthead__top { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; }
      .masthead__title { font-family: var(--serif); font-weight: 400; }
      .masthead__when { color: var(--muted); }
      .address { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
      .address__value {
        font-family: var(--mono);
        font-size: 13px;
        background: var(--paper-inset);
        padding: var(--s1) var(--s2);
        border-radius: var(--r-input);
        word-break: break-all;
      }

      .counters {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--s4);
        margin-bottom: var(--s6);
      }
      @media (min-width: 650px) {
        .counters { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
      .counter { display: flex; flex-direction: column; gap: var(--s1); }
      .counter__value { font-size: 22px; line-height: 26px; font-weight: 700; }
      .counter__label { color: var(--ink-64); text-transform: uppercase; letter-spacing: 0.06em; }

      .todo { display: flex; flex-direction: column; gap: var(--s2); margin-bottom: var(--s6); }
      .todo__head { color: var(--ink-64); text-transform: uppercase; letter-spacing: 0.06em; }
      .todo__list { display: flex; flex-direction: column; gap: var(--s2); }
      .todo__item {
        padding-left: var(--s4);
        position: relative;
        color: var(--ink-64);
      }
      .todo__item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 9px;
        width: 6px;
        height: 6px;
        border-radius: var(--r-circle);
        background: var(--ink-36);
      }

      .sisters { display: flex; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s6); }

      .notice-block {
        border: 1px solid var(--ink-08);
        border-left: 4px solid var(--danger);
        border-radius: var(--r-card);
        padding: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        margin-bottom: var(--s6);
      }
      .danger {
        border-top: 1px solid var(--divider);
        padding-top: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        align-items: flex-start;
      }
      .danger__body { color: var(--muted); max-width: 520px; }
    `,
  ],
})
export class ManageOverviewPage {
  readonly store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly guests = signal<GuestRow[]>([]);
  readonly cancelOpen = signal(false);
  readonly reason = signal('');
  readonly working = signal(false);
  readonly refusal = signal<string | null>(null);

  readonly waiting = computed(() => this.guests().filter((g) => g.status === 'waitlisted').length);
  readonly pending = computed(
    () => this.guests().filter((g) => g.status === 'pending_approval').length,
  );
  readonly arrived = computed(() => this.guests().filter((g) => g.status === 'checked_in').length);

  readonly todo = computed(() => {
    const e = this.store.event();
    const items: string[] = [];
    if (!e) return items;
    if (this.pending() > 0) {
      items.push(`Answer ${this.pending()} request${this.pending() === 1 ? '' : 's'} in the queue.`);
    }
    if (this.waiting() > 0 && (e.remaining ?? 0) === 0) {
      items.push(`Raise capacity to seat ${this.waiting()} guest${this.waiting() === 1 ? '' : 's'} waiting.`);
    }
    if (e.confirmed_count === 0) items.push('Share the event link so registrations can start.');
    if (e.state === 'registration_closed') items.push('Registration is closed; reopen it when you are ready.');
    items.push('Check tickets in at the door on the guests screen.');
    items.push('Export the guest list before the day.');
    return items.slice(0, 3);
  });

  constructor() {
    // The counters are derived from the guest list on read, never from a stored counter.
    queueMicrotask(() => this.loadGuests());
  }

  private loadGuests(): void {
    const slug = this.store.slug();
    if (!slug) {
      setTimeout(() => this.loadGuests(), 60);
      return;
    }
    this.api.guestList(slug).subscribe({
      next: (rows) => this.guests.set(rows),
      error: () => this.guests.set([]),
    });
  }

  when(e: { starts_at: string | null; ends_at: string | null; time_zone: string }): string {
    if (!e.starts_at) return 'Date to be announced';
    return `${dayLine(e.starts_at, e.time_zone)} · ${timeRange(
      e.starts_at,
      e.ends_at,
      e.time_zone,
    )} ${zoneAbbrev(e.starts_at, e.time_zone)}`;
  }

  address(slug: string): string {
    return typeof location === 'undefined' ? `/${slug}` : `${location.origin}/${slug}`;
  }

  copyLink(slug: string): void {
    const value = this.address(slug);
    navigator.clipboard?.writeText(value).then(
      () => this.notices.success('The event link is on your clipboard.'),
      () => this.notices.refusal('Your browser would not let us copy. Select the address instead.'),
    );
  }

  stateWord(state: any): string {
    return EVENT_STATE_WORDS[state as keyof typeof EVENT_STATE_WORDS] ?? state;
  }

  stateTone(state: any): any {
    return EVENT_STATE_TONES[state as keyof typeof EVENT_STATE_TONES] ?? 'neutral';
  }

  cancelEvent(): void {
    const slug = this.store.slug();
    this.refusal.set(null);
    this.working.set(true);
    this.api.cancelEvent(slug, this.reason().trim()).subscribe({
      next: () => {
        this.working.set(false);
        this.cancelOpen.set(false);
        this.reason.set('');
        this.store.refresh();
        this.notices.show('The event is cancelled and every guest has been written to.', 'danger');
      },
      error: (e: ApiFailure) => {
        this.working.set(false);
        this.refusal.set(e.message);
      },
    });
  }
}

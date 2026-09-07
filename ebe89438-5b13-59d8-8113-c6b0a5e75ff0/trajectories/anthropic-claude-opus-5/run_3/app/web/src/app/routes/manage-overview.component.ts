import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManageStore } from './manage.component';
import { ApiRefusal, ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { EVENT_STATE_WORDS } from '../core/models';
import { IconComponent } from '../shared/icons.component';
import { DialogComponent } from '../shared/ui';

/** The dashboard. The owning host only. */
@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [RouterLink, IconComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    `@if (store.event(); as ev) {
      <header class="masthead">
        <h1 class="t-screen-title">{{ ev.title }}</h1>
        <span class="pill" [class]="'pill ' + stateTone(ev.state)">{{ stateWord(ev.state) }}</span>
      </header>

      <div class="address-line">
        <a class="address" [routerLink]="'/' + ev.slug">{{ publicUrl(ev.slug) }}</a>
        <button type="button" class="btn btn-sm" (click)="copyLink(ev.slug)">
          <app-icon name="copy" [size]="16" />
          Copy Link
        </button>
      </div>

      @if (ev.state === 'cancelled') {
        <!-- A cancelled event replaces the counters with the notice carrying
             the host's own reason. -->
        <div class="cancelled-notice">
          <h2 class="t-longform-heading">This event has been cancelled</h2>
          <p>{{ ev.cancel_reason }}</p>
        </div>
      } @else {
        <ul class="counters">
          <li>
            <span class="counter">{{ ev.confirmed_count }}<span class="of">/{{ ev.capacity ?? '\\u221e' }}</span></span>
            <span class="t-overline label">Confirmed</span>
          </li>
          <li>
            <span class="counter">{{ counts().waiting }}</span>
            <span class="t-overline label">Waiting</span>
          </li>
          <li>
            <span class="counter">{{ counts().pending }}</span>
            <span class="t-overline label">Awaiting Approval</span>
          </li>
          <li>
            <span class="counter">{{ counts().arrived }}</span>
            <span class="t-overline label">Arrived</span>
          </li>
        </ul>

        <section class="todo">
          <h2 class="t-overline section-title">Next three things to do</h2>
          <ul class="todo-list">
            @for (item of todo(); track item) {
              <li class="t-list-row">{{ item }}</li>
            }
          </ul>
        </section>
      }

      <nav class="sisters">
        <a class="btn btn-sm" [routerLink]="['/event', ev.slug, 'manage', 'guests']">Guests, queue and door</a>
        <a class="btn btn-sm" [routerLink]="['/event', ev.slug, 'manage', 'registration']">Capacity and approval</a>
      </nav>

      @if (ev.state !== 'cancelled') {
        <div class="danger-zone">
          <button type="button" class="btn-text danger" (click)="cancelOpen.set(true)">Cancel this event</button>
        </div>
      }

      @if (cancelOpen()) {
        <app-dialog heading="Cancel this event?" (closed)="cancelOpen.set(false)">
          <p class="dialog-body">
            Every guest still holding a place is emailed your reason, word for word, and this cannot be undone.
          </p>
          <div class="field">
            <label for="cancel-reason">Reason</label>
            <textarea
              id="cancel-reason"
              rows="3"
              [value]="reason()"
              (input)="reason.set(asValue($event))"
            ></textarea>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-pill" (click)="cancelOpen.set(false)">Keep Event</button>
            <!-- The action becomes available only once the reason is typed. -->
            <button
              type="button"
              class="btn btn-danger btn-pill"
              [disabled]="!reason().trim() || working()"
              (click)="confirmCancel(ev.slug)"
            >
              Cancel Event
            </button>
          </div>
        </app-dialog>
      }
    }`,
  styles: [
    `
      .masthead {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .address-line {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
        flex-wrap: wrap;
      }

      .address {
        color: var(--ink-64);
        font-size: 14px;
        word-break: break-all;
      }

      @media (hover: hover) {
        .address:hover { color: var(--blue); }
      }

      .counters {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 32px;
      }

      .counters li {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 16px;
        border-radius: var(--r-card);
        background: var(--paper-inset);
      }

      .counter { font-size: 22px; line-height: 26px; font-weight: 700; }
      .of { color: var(--muted); font-weight: 500; }
      .label { color: var(--muted); }

      .cancelled-notice {
        margin-top: 24px;
        padding: 16px;
        border-radius: var(--r-card);
        background: rgba(255, 59, 48, 0.06);
        border-left: 4px solid var(--danger);
      }

      .cancelled-notice p { margin-top: 6px; color: var(--ink-64); }

      .todo { margin-top: 32px; }
      .section-title { color: var(--ink-36); margin-bottom: 8px; }

      .todo-list li {
        padding: 10px 0;
        border-bottom: 1px solid var(--divider);
        color: var(--ink-64);
      }

      .sisters { display: flex; gap: 8px; margin-top: 32px; flex-wrap: wrap; }

      .danger-zone { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--divider); }
      .danger { color: var(--danger); }

      .dialog-body { color: var(--ink-64); margin-bottom: 16px; }
      .dialog-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; flex-wrap: wrap; }

      @media (min-width: 650px) {
        .counters { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
    `,
  ],
})
export class ManageOverviewComponent implements OnInit {
  store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly cancelOpen = signal(false);
  readonly reason = signal('');
  readonly working = signal(false);

  readonly counts = computed(() => {
    const guests = this.store.guests();
    return {
      waiting: guests.filter((g) => g.status === 'waitlisted').length,
      pending: guests.filter((g) => g.status === 'pending_approval').length,
      arrived: guests.filter((g) => g.status === 'checked_in').length,
    };
  });

  readonly todo = computed(() => {
    const ev = this.store.event();
    const c = this.counts();
    const items: string[] = [];
    if (c.pending) items.push(`Work the approval queue: ${c.pending} waiting on your decision.`);
    if (ev && ev.state === 'draft') items.push('Fill in the missing details and publish this event.');
    if (c.waiting) items.push(`${c.waiting} on the waiting list. Raising capacity seats them at once.`);
    if (ev && ev.confirmed_count === 0) items.push('Share the event link so registrations can start arriving.');
    items.push('Check tickets in at the door from the guests screen.');
    return items.slice(0, 3);
  });

  ngOnInit() {
    // The guest list feeds the counters; the sister screens reuse it.
    if (!this.store.guests().length) this.store.loadGuests();
  }

  publicUrl(slug: string) {
    return `${location.origin}/${slug}`;
  }

  async copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(this.publicUrl(slug));
      this.notices.success('The event link has been copied.');
    } catch {
      this.notices.show('Copy the address from the bar to share this event.', 'info');
    }
  }

  asValue(event: Event) {
    return (event.target as HTMLTextAreaElement).value;
  }

  confirmCancel(slug: string) {
    this.working.set(true);
    this.api.cancelEvent(slug, this.reason().trim()).subscribe({
      next: (ev) => {
        this.store.setEvent(ev);
        this.working.set(false);
        this.cancelOpen.set(false);
        this.notices.success(
          `${ev.title} has been cancelled and ${ev.notified_count ?? 0} guests were emailed your reason.`
        );
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.notices.refuse(err.message);
      },
    });
  }

  stateWord(state: keyof typeof EVENT_STATE_WORDS) {
    return EVENT_STATE_WORDS[state];
  }

  stateTone(state: string) {
    if (state === 'published') return 'pill-success';
    if (state === 'cancelled') return 'pill-danger';
    if (state === 'registration_closed') return 'pill-warning';
    return 'pill-info';
  }
}

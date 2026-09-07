import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiRefusal, ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { ManageStore } from './manage.component';

/** Capacity and approval. The owning host only. */
@Component({
  selector: 'app-manage-registration',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.event(); as ev) {
      <h1 class="t-screen-title">Registration</h1>

      <div class="rows">
        <div class="setting-row">
          <div class="setting-text">
            <label class="setting-label" for="capacity">Capacity</label>
            <span class="caption" [class.refused]="capacityRefusal()">
              {{ capacityRefusal() || 'Seats available at this event.' }}
            </span>
          </div>
          <div class="setting-control">
            <input
              id="capacity"
              type="number"
              min="1"
              max="500"
              [value]="capacity()"
              (input)="capacity.set(+asValue($event))"
              [attr.aria-describedby]="'capacity-caption'"
              class="stepper"
            />
            <button
              type="button"
              class="btn btn-sm"
              (click)="saveCapacity(ev.slug)"
              [disabled]="working() || capacity() === ev.capacity"
            >
              Save
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-label" id="approval-label">Approval required</span>
            <span class="caption">The host decides on each request before a seat is held.</span>
          </div>
          <div class="setting-control">
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="ev.approval_required"
              aria-labelledby="approval-label"
              class="switch"
              [class.on]="ev.approval_required"
              (click)="toggle(ev.slug, 'approval_required', !ev.approval_required)"
            >
              <span class="switch-word">{{ ev.approval_required ? 'On' : 'Off' }}</span>
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-label" id="waitlist-label">Waiting list</span>
            <span class="caption">When the event is full, further guests take a numbered place.</span>
          </div>
          <div class="setting-control">
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="ev.waitlist_enabled"
              aria-labelledby="waitlist-label"
              class="switch"
              [class.on]="ev.waitlist_enabled"
              (click)="toggle(ev.slug, 'waitlist_enabled', !ev.waitlist_enabled)"
            >
              <span class="switch-word">{{ ev.waitlist_enabled ? 'On' : 'Off' }}</span>
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-label" id="open-label">Registration Open</span>
            <span class="caption">Turning this off changes the public panel to its closed state and mails nobody.</span>
          </div>
          <div class="setting-control">
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="isOpen()"
              aria-labelledby="open-label"
              class="switch"
              [class.on]="isOpen()"
              [disabled]="ev.state === 'cancelled' || ev.state === 'draft'"
              (click)="toggleOpen(ev.slug)"
            >
              <span class="switch-word">{{ isOpen() ? 'Open' : 'Closed' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- The count a raise moves to a seat is announced politely. -->
      <p class="live" role="status" aria-live="polite">{{ liveMessage() }}</p>
    }
  `,
  styles: [
    `
      h1 { margin-bottom: 24px; }

      .rows { max-width: 640px; }

      .setting-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 16px 0;
        border-bottom: 1px solid var(--divider);
      }

      .setting-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .setting-label { font-size: 16px; line-height: 24px; font-weight: 500; }
      .caption { font-size: 13px; line-height: 16px; color: var(--muted); }
      .caption.refused { color: var(--danger); }

      .setting-control { display: flex; gap: 8px; align-items: center; flex: none; }

      .stepper {
        width: 96px;
        min-height: 44px;
        padding: 10px 12px;
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }

      .switch {
        min-width: 88px;
        min-height: 44px;
        border-radius: var(--r-round);
        border: 1px solid var(--ink-08);
        background: var(--ink-04);
        color: var(--ink-64);
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      }

      .switch.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
      .switch[disabled] { opacity: 0.5; cursor: not-allowed; }

      .live { margin-top: 16px; font-size: 15px; line-height: 22px; }
      .live:empty { display: none; }
    `,
  ],
})
export class ManageRegistrationComponent implements OnInit {
  store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly capacity = signal(0);
  readonly working = signal(false);
  readonly capacityRefusal = signal('');
  readonly liveMessage = signal('');

  readonly isOpen = computed(() => this.store.event()?.state === 'published');

  ngOnInit() {
    const ev = this.store.event();
    if (ev?.capacity) this.capacity.set(ev.capacity);
    if (!this.store.guests().length) this.store.loadGuests();
  }

  asValue(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  saveCapacity(slug: string) {
    this.working.set(true);
    this.capacityRefusal.set('');
    this.api.updateEvent(slug, { capacity: this.capacity() }).subscribe({
      next: (ev) => {
        this.store.setEvent(ev);
        this.store.loadGuests();
        this.working.set(false);
        const moved = ev.promoted_count ?? 0;
        if (moved > 0) {
          const message =
            moved === 1
              ? 'One person moved from the waiting list to a seat, and was emailed a ticket.'
              : `${moved} people moved from the waiting list to a seat, and were emailed tickets.`;
          this.liveMessage.set(message);
          this.notices.success(message);
        } else {
          this.liveMessage.set('Capacity saved. Nobody was waiting.');
          this.notices.success('Capacity saved.');
        }
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        // The caption reads the pinned refusal when a lower number is refused.
        this.capacityRefusal.set(err.message);
        const ev = this.store.event();
        if (ev?.capacity) this.capacity.set(ev.capacity);
      },
    });
  }

  toggle(slug: string, field: 'approval_required' | 'waitlist_enabled', value: boolean) {
    this.working.set(true);
    this.api.updateEvent(slug, { [field]: value }).subscribe({
      next: (ev) => {
        this.store.setEvent(ev);
        this.working.set(false);
        this.notices.success('Saved.');
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.notices.refuse(err.message);
      },
    });
  }

  toggleOpen(slug: string) {
    const next = this.isOpen() ? 'registration_closed' : 'published';
    this.working.set(true);
    this.api.updateEvent(slug, { state: next }).subscribe({
      next: (ev) => {
        this.store.setEvent(ev);
        this.working.set(false);
        this.notices.success(
          next === 'registration_closed'
            ? 'Registration is closed. The public panel now says so.'
            : 'Registration is open again.'
        );
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.notices.refuse(err.message);
      },
    });
  }
}

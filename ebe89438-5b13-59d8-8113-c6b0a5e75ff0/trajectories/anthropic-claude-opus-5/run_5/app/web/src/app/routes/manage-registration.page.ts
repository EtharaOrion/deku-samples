import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ApiService, ApiFailure } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { ManageStore } from './manage.shell';
import { SpinnerComponent } from '../ui/bits';

/**
 * Four setting rows, each a label at 16/24 with its control at the right and a
 * caption beneath. Every switch and stepper carries a name and reports its state
 * to a reader, and the count a raise moves to a seat is announced politely.
 */
@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="t-screen-title head">Registration</h1>

    @if (store.event(); as e) {
      <div class="rows">
        <!-- Capacity -->
        <section class="row">
          <div class="row__label">
            <label class="t-body" for="cap-input">Capacity</label>
            <p class="t-caption row__caption" [class.row__caption--refused]="!!capacityRefusal()">
              {{ capacityRefusal() ?? 'How many seats this event holds, from 1 to 500.' }}
            </p>
          </div>
          <div class="row__control">
            <button
              type="button"
              class="btn btn--sm stepper__btn"
              (click)="step(-1)"
              [disabled]="saving()"
            >
              <span aria-hidden="true">−</span>
              <span class="visually-hidden">Lower the capacity by one</span>
            </button>
            <input
              id="cap-input"
              class="input stepper"
              type="number"
              min="1"
              max="500"
              [value]="capacity()"
              (input)="capacity.set(+$any($event.target).value)"
              [attr.aria-valuenow]="capacity()"
              [attr.aria-describedby]="'cap-help'"
            />
            <button
              type="button"
              class="btn btn--sm stepper__btn"
              (click)="step(1)"
              [disabled]="saving()"
            >
              <span aria-hidden="true">+</span>
              <span class="visually-hidden">Raise the capacity by one</span>
            </button>
            <button
              type="button"
              class="btn btn--primary btn--sm"
              (click)="saveCapacity()"
              [disabled]="saving() || capacity() === e.capacity"
            >
              @if (saving()) {
                <app-spinner />
              }
              Save
            </button>
          </div>
        </section>
        <p class="visually-hidden" id="cap-help" role="status" aria-live="polite">{{ raiseAnnounce() }}</p>

        <!-- Approval -->
        <section class="row">
          <div class="row__label">
            <span class="t-body" id="approval-label">Approval Required</span>
            <p class="t-caption row__caption">
              Read each request before a seat is confirmed.
            </p>
          </div>
          <div class="row__control">
            <button
              type="button"
              role="switch"
              class="switch"
              [class.switch--on]="e.approval_required"
              [attr.aria-checked]="e.approval_required"
              aria-labelledby="approval-label"
              (click)="toggle('approval_required', !e.approval_required)"
              [disabled]="saving()"
            >
              <span class="switch__knob"></span>
              <span class="visually-hidden">{{ e.approval_required ? 'On' : 'Off' }}</span>
            </button>
          </div>
        </section>

        <!-- Waiting list -->
        <section class="row">
          <div class="row__label">
            <span class="t-body" id="waitlist-label">Waitlist Enabled</span>
            <p class="t-caption row__caption">
              Keep a waiting list once every seat is taken.
            </p>
          </div>
          <div class="row__control">
            <button
              type="button"
              role="switch"
              class="switch"
              [class.switch--on]="e.waitlist_enabled"
              [attr.aria-checked]="e.waitlist_enabled"
              aria-labelledby="waitlist-label"
              (click)="toggle('waitlist_enabled', !e.waitlist_enabled)"
              [disabled]="saving()"
            >
              <span class="switch__knob"></span>
              <span class="visually-hidden">{{ e.waitlist_enabled ? 'On' : 'Off' }}</span>
            </button>
          </div>
        </section>

        <!-- Registration open -->
        <section class="row">
          <div class="row__label">
            <span class="t-body" id="open-label">Registration Open</span>
            <p class="t-caption row__caption">
              Turning this off shows the closed panel on the public page and mails nobody.
            </p>
          </div>
          <div class="row__control">
            <button
              type="button"
              role="switch"
              class="switch"
              [class.switch--on]="isOpen()"
              [attr.aria-checked]="isOpen()"
              aria-labelledby="open-label"
              (click)="toggleOpen()"
              [disabled]="saving() || e.state === 'cancelled' || e.state === 'draft'"
            >
              <span class="switch__knob"></span>
              <span class="visually-hidden">{{ isOpen() ? 'Open' : 'Closed' }}</span>
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styles: [
    `
      .head { font-family: var(--serif); font-weight: 400; margin-bottom: var(--s5); }
      .rows { display: flex; flex-direction: column; max-width: 640px; }
      .row {
        display: flex;
        align-items: center;
        gap: var(--s4);
        justify-content: space-between;
        padding: var(--s4) 0;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }
      .row__label { display: flex; flex-direction: column; gap: var(--s1); min-width: 0; flex: 1 1 240px; }
      .row__caption { color: var(--muted); }
      .row__caption--refused { color: var(--danger); }
      .row__control { display: flex; align-items: center; gap: var(--s2); }
      .stepper { width: 84px; text-align: center; }
      .stepper__btn { min-width: 44px; padding: 0; }

      .switch {
        width: 52px;
        height: 32px;
        min-height: 44px;
        border-radius: var(--r-round);
        border: 1px solid var(--ink-08);
        background: var(--disabled-fill);
        position: relative;
        cursor: pointer;
        padding: 0;
        display: inline-flex;
        align-items: center;
      }
      .switch__knob {
        position: absolute;
        left: 3px;
        width: 24px;
        height: 24px;
        border-radius: var(--r-circle);
        background: var(--paper);
        box-shadow: var(--elev-card);
        transition: transform var(--dur) var(--ease);
      }
      .switch--on { background: var(--success); border-color: var(--success); }
      .switch--on .switch__knob { transform: translateX(20px); }
      .switch:disabled { opacity: 0.5; cursor: not-allowed; }
      @media (prefers-reduced-motion: reduce) {
        .switch__knob { transition: none; }
      }
    `,
  ],
})
export class ManageRegistrationPage {
  readonly store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly capacity = signal(1);
  readonly saving = signal(false);
  readonly capacityRefusal = signal<string | null>(null);
  readonly raiseAnnounce = signal('');

  readonly isOpen = computed(() => this.store.event()?.state === 'published');

  private synced = false;

  constructor() {
    effect(() => {
      const e = this.store.event();
      if (e && !this.synced) {
        this.capacity.set(e.capacity ?? 1);
        this.synced = true;
      }
    });
  }

  step(delta: number): void {
    this.capacity.update((v) => Math.min(500, Math.max(1, v + delta)));
  }

  saveCapacity(): void {
    this.capacityRefusal.set(null);
    this.saving.set(true);
    this.api.patchEvent(this.store.slug(), { capacity: this.capacity() }).subscribe({
      next: (e) => {
        this.saving.set(false);
        this.store.patch(e);
        const moved = e.promoted_from_waitlist ?? 0;
        if (moved > 0) {
          const line = `${moved} guest${moved === 1 ? '' : 's'} moved from the waiting list to a seat.`;
          this.raiseAnnounce.set(line);
          this.notices.success(line);
        } else {
          this.notices.success('Capacity saved.');
        }
      },
      error: (e: ApiFailure) => {
        this.saving.set(false);
        // The caption reads the pinned sentence when a lower number is refused.
        this.capacityRefusal.set(e.message);
        const stored = this.store.event()?.capacity;
        if (stored) this.capacity.set(stored);
      },
    });
  }

  toggle(key: 'approval_required' | 'waitlist_enabled', value: boolean): void {
    this.saving.set(true);
    this.api.patchEvent(this.store.slug(), { [key]: value }).subscribe({
      next: (e) => {
        this.saving.set(false);
        this.store.patch(e);
        this.notices.success('Saved.');
      },
      error: (err: ApiFailure) => {
        this.saving.set(false);
        this.notices.refusal(err.message);
      },
    });
  }

  /** Closing and reopening registration mails nobody. */
  toggleOpen(): void {
    const next = this.isOpen() ? 'registration_closed' : 'published';
    this.saving.set(true);
    this.api.patchEvent(this.store.slug(), { state: next }).subscribe({
      next: (e) => {
        this.saving.set(false);
        this.store.patch(e);
        this.notices.success(
          next === 'registration_closed'
            ? 'Registration is closed. The public panel now shows the closed state.'
            : 'Registration is open again.',
        );
      },
      error: (err: ApiFailure) => {
        this.saving.set(false);
        this.notices.refusal(err.message);
      },
    });
  }
}

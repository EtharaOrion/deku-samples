import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Refusal } from '../../core/api.service';
import { NoticeService } from '../../core/notice.service';
import { EventDetail } from '../../models';
import { ManageStore } from './manage.store';
import { DialogComponent } from '../../shared/dialog.component';
import { SpinnerComponent } from '../../shared/ui.components';

/**
 * Four setting rows, each a label with its control at the right and a caption
 * beneath. Every switch and stepper carries a name and reports its state to a
 * reader, and the count a raise moves to a seat is announced politely.
 */
@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [FormsModule, DialogComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.ev(); as ev) {
      <h1 class="visually-hidden">Registration settings</h1>

      <div class="rows">
        <!-- capacity -->
        <div class="setting">
          <div class="text">
            <label class="row-label" for="cap">Capacity</label>
            <p class="field-caption" id="cap-cap">
              {{ capacityCaption(ev) }}
            </p>
          </div>
          <div class="control">
            <button type="button" class="btn btn-secondary btn-sm step"
                    (click)="stepCapacity(-1)" aria-label="Lower capacity by one">−</button>
            <input class="field-input cap-input" id="cap" type="number" min="1" max="500"
                   [(ngModel)]="capacity" aria-describedby="cap-cap"
                   [attr.aria-valuenow]="capacity" />
            <button type="button" class="btn btn-secondary btn-sm step"
                    (click)="stepCapacity(1)" aria-label="Raise capacity by one">+</button>
            <button type="button" class="btn btn-solid btn-sm"
                    (click)="saveCapacity(ev)" [disabled]="working() || capacity === ev.capacity">
              @if (working()) { <app-spinner /> }
              Save
            </button>
          </div>
        </div>

        <!-- approval -->
        <div class="setting">
          <div class="text">
            <span class="row-label" id="appr-label">Approval Required</span>
            <p class="field-caption">Each request waits for your decision before a seat is held.</p>
          </div>
          <div class="control">
            <button type="button" role="switch" class="switch"
                    [attr.aria-checked]="ev.approval_required"
                    aria-labelledby="appr-label"
                    (click)="toggle('approval_required', !ev.approval_required)">
              <span class="knob"></span>
              <span class="visually-hidden">{{ ev.approval_required ? 'On' : 'Off' }}</span>
            </button>
          </div>
        </div>

        <!-- waiting list -->
        <div class="setting">
          <div class="text">
            <span class="row-label" id="wait-label">Waiting List</span>
            <p class="field-caption">When the event is full, new registrations join a waiting list.</p>
          </div>
          <div class="control">
            <button type="button" role="switch" class="switch"
                    [attr.aria-checked]="ev.waitlist_enabled"
                    aria-labelledby="wait-label"
                    (click)="toggle('waitlist_enabled', !ev.waitlist_enabled)">
              <span class="knob"></span>
              <span class="visually-hidden">{{ ev.waitlist_enabled ? 'On' : 'Off' }}</span>
            </button>
          </div>
        </div>

        <!-- registration open -->
        <div class="setting">
          <div class="text">
            <span class="row-label" id="open-label">Registration Open</span>
            <p class="field-caption">Turning this off shows the closed panel and mails nobody.</p>
          </div>
          <div class="control">
            <button type="button" role="switch" class="switch"
                    [attr.aria-checked]="ev.state === 'published'"
                    aria-labelledby="open-label"
                    [disabled]="ev.state === 'cancelled' || ev.state === 'draft'"
                    (click)="toggleOpen(ev)">
              <span class="knob"></span>
              <span class="visually-hidden">{{ ev.state === 'published' ? 'Open' : 'Closed' }}</span>
            </button>
          </div>
        </div>
      </div>

      <p class="announce visually-hidden" aria-live="polite">{{ announcement() }}</p>

      @if (ev.state !== 'cancelled') {
        <section class="danger-zone">
          <h2 class="longform-heading">Call this event off</h2>
          <p class="field-caption">
            Every guest still holding a place is emailed your reason. This cannot be undone.
          </p>
          <button type="button" class="btn btn-danger" (click)="askCancel()">Cancel Event</button>
        </section>
      }

      @if (cancelOpen()) {
        <app-dialog heading="Cancel this event?" (closed)="cancelOpen.set(false)">
          <p>
            Everyone still holding a place at {{ ev.title }} will be emailed your reason,
            word for word. A cancellation cannot be undone.
          </p>
          <label class="field reason-field">
            <span class="field-label" for="reason">Reason</span>
            <textarea class="field-input" id="reason" rows="3" [(ngModel)]="reason"
                      name="reason"></textarea>
          </label>
          <ng-container dialogActions>
            <button type="button" class="btn btn-secondary" (click)="cancelOpen.set(false)">
              Keep the event
            </button>
            <!-- the action becomes available only once a reason is typed -->
            <button type="button" class="btn btn-danger"
                    [disabled]="!reason.trim() || working()" (click)="confirmCancel(ev)">
              Cancel Event
            </button>
          </ng-container>
        </app-dialog>
      }
    }
  `,
  styles: [`
    .rows { display: flex; flex-direction: column; }
    .setting {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: var(--s4); padding: var(--s4) 0; border-bottom: 1px solid var(--divider);
      flex-wrap: wrap;
    }
    .text { flex: 1; min-width: 220px; }
    .row-label { font-size: 16px; line-height: 24px; font-weight: 500; display: block; }
    .control { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
    .cap-input { width: 88px; text-align: center; }
    .step { min-width: 44px; }
    .switch {
      width: 52px; height: 32px; border-radius: var(--r-round);
      background: var(--disabled-fill); position: relative; cursor: pointer;
      border: 1px solid var(--ink-hairline);
      transition: background-color var(--dur) var(--ease);
      min-width: 44px;
    }
    .switch[aria-checked="true"] { background: var(--success); }
    .switch[disabled] { opacity: 0.5; cursor: not-allowed; }
    .knob {
      position: absolute; top: 3px; left: 3px; width: 24px; height: 24px;
      border-radius: 100%; background: #ffffff; box-shadow: var(--shadow-card);
      transition: transform var(--dur) var(--ease);
    }
    .switch[aria-checked="true"] .knob { transform: translateX(20px); }
    .danger-zone { margin-top: var(--s7); padding-top: var(--s5);
      border-top: 1px solid var(--divider); }
    .danger-zone .btn { margin-top: var(--s3); }
    .reason-field { margin-top: var(--s4); }
  `],
})
export class ManageRegistrationComponent {
  store = inject(ManageStore);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  capacity = 0;
  reason = '';
  working = signal(false);
  cancelOpen = signal(false);
  announcement = signal('');
  private seeded = false;

  constructor() {
    // Seed the stepper from the event once it has landed.
    queueMicrotask(() => this.seed());
  }

  private seed() {
    const ev = this.store.ev();
    if (ev && !this.seeded) {
      this.capacity = ev.capacity ?? 0;
      this.seeded = true;
    } else if (!ev) {
      setTimeout(() => this.seed(), 120);
    }
  }

  capacityCaption(ev: EventDetail): string {
    // The pinned sentence when a lower number is refused.
    if (this.capacity < ev.confirmed_count) {
      return `You already have ${ev.confirmed_count} guests confirmed.`;
    }
    return `${ev.confirmed_count} of ${ev.capacity} seats are taken.`;
  }

  stepCapacity(delta: number) {
    this.capacity = Math.max(1, Math.min(500, (Number(this.capacity) || 0) + delta));
  }

  saveCapacity(ev: EventDetail) {
    if (this.working()) return;
    this.working.set(true);
    this.api.updateEvent(ev.slug, { capacity: Number(this.capacity) }).subscribe({
      next: (updated) => {
        this.working.set(false);
        this.store.setEvent(updated);
        this.store.refreshGuests();
        const moved = updated.promoted_count ?? 0;
        if (moved > 0) {
          // Raising capacity while people are waiting answers with a notice
          // naming how many were moved to a seat.
          const line = `${moved} ${moved === 1 ? 'guest was' : 'guests were'} moved from the waiting list to a seat.`;
          this.notices.show(line, 'success');
          this.announcement.set(line);
        } else {
          this.notices.show('Capacity saved.', 'success');
        }
      },
      error: (e: Refusal) => {
        this.working.set(false);
        this.notices.show(e.message, 'danger');
        this.capacity = ev.capacity ?? 0;
      },
    });
  }

  toggle(field: 'approval_required' | 'waitlist_enabled', value: boolean) {
    const ev = this.store.ev();
    if (!ev) return;
    this.api.updateEvent(ev.slug, { [field]: value }).subscribe({
      next: (updated) => {
        this.store.setEvent(updated);
        this.notices.show('Saved.', 'success');
      },
      error: (e: Refusal) => this.notices.show(e.message, 'danger'),
    });
  }

  /** published <-> registration_closed, and neither mails anybody. */
  toggleOpen(ev: EventDetail) {
    const next = ev.state === 'published' ? 'registration_closed' : 'published';
    this.api.updateEvent(ev.slug, { state: next }).subscribe({
      next: (updated) => {
        this.store.setEvent(updated);
        this.notices.show(
          updated.state === 'published' ? 'Registration is open again.' : 'Registration is closed.',
          'info',
        );
      },
      error: (e: Refusal) => this.notices.show(e.message, 'danger'),
    });
  }

  askCancel() {
    this.reason = '';
    this.cancelOpen.set(true);
  }

  confirmCancel(ev: EventDetail) {
    if (!this.reason.trim() || this.working()) return;
    this.working.set(true);
    this.api.cancelEvent(ev.slug, this.reason.trim()).subscribe({
      next: (updated) => {
        this.working.set(false);
        this.cancelOpen.set(false);
        this.store.setEvent(updated);
        this.notices.show('The event has been cancelled and your guests have been emailed.', 'info');
      },
      error: (e: Refusal) => {
        this.working.set(false);
        this.notices.show(e.message, 'danger');
      },
    });
  }
}

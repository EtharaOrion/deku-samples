import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../../core/api.service';
import { NoticeService } from '../../core/notice.service';
import { SpinnerComponent } from '../../ui/icons.component';
import { ManageStateService } from './manage-state.service';

@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [FormsModule, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state.loading()) {
      <div class="skeleton" style="height: 320px"></div>
    } @else if (state.event(); as ev) {
      <h1 class="t-screen-title">Registration</h1>

      <div class="rows">
        <div class="row">
          <div class="labels">
            <label class="t-body" for="capacity">Capacity</label>
            <p class="caption t-caption" [class.refusal]="capacityRefusal()">
              {{ capacityRefusal() || 'How many seats this event has, from 1 to 500.' }}
            </p>
          </div>
          <div class="control">
            <button type="button" class="step" (click)="stepCapacity(-1)" [disabled]="working()">
              <span class="sr-only">Lower the capacity by one</span>
              <span aria-hidden="true">−</span>
            </button>
            <input
              id="capacity"
              type="number"
              min="1"
              max="500"
              [(ngModel)]="capacity"
              aria-label="Capacity"
              [attr.aria-valuenow]="capacity"
            />
            <button type="button" class="step" (click)="stepCapacity(1)" [disabled]="working()">
              <span class="sr-only">Raise the capacity by one</span>
              <span aria-hidden="true">+</span>
            </button>
            <button type="button" class="btn btn-sm" (click)="saveCapacity()" [disabled]="working() || capacity === ev.capacity">
              @if (working()) {
                <app-spinner [size]="16" />
              }
              Save
            </button>
          </div>
        </div>

        <div class="row">
          <div class="labels">
            <label class="t-body" for="approval">Approval Required</label>
            <p class="caption t-caption">A request holds no seat until you say yes.</p>
          </div>
          <input
            id="approval"
            type="checkbox"
            role="switch"
            class="switch"
            [ngModel]="ev.approval_required"
            (ngModelChange)="toggle('approval_required', $event)"
            [attr.aria-checked]="ev.approval_required"
          />
        </div>

        <div class="row">
          <div class="labels">
            <label class="t-body" for="waitlist">Waiting List</label>
            <p class="caption t-caption">With this off, a full event refuses new registrations outright.</p>
          </div>
          <input
            id="waitlist"
            type="checkbox"
            role="switch"
            class="switch"
            [ngModel]="ev.waitlist_enabled"
            (ngModelChange)="toggle('waitlist_enabled', $event)"
            [attr.aria-checked]="ev.waitlist_enabled"
          />
        </div>

        <div class="row">
          <div class="labels">
            <label class="t-body" for="open">Registration Open</label>
            <p class="caption t-caption">
              Turning this off shows the closed panel publicly and mails nobody. Guests already in keep their tickets.
            </p>
          </div>
          <input
            id="open"
            type="checkbox"
            role="switch"
            class="switch"
            [ngModel]="ev.state === 'published'"
            (ngModelChange)="toggleOpen($event)"
            [attr.aria-checked]="ev.state === 'published'"
            [disabled]="ev.state === 'draft' || ev.state === 'cancelled'"
          />
        </div>
      </div>

      <p class="t-caption announce" role="status" aria-live="polite">{{ announcement() }}</p>
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .rows {
        max-width: 640px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        padding: var(--s4) 0;
        border-bottom: 1px solid var(--divider);
        min-height: 44px;
        flex-wrap: wrap;
      }
      .labels {
        flex: 1;
        min-width: 220px;
      }
      .caption {
        color: var(--muted);
        margin-top: var(--s1);
      }
      .caption.refusal {
        color: var(--danger);
        font-weight: 500;
      }
      .control {
        display: flex;
        align-items: center;
        gap: var(--s2);
      }
      .control input {
        width: 72px;
        min-height: 44px;
        text-align: center;
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        padding: var(--s2);
      }
      .step {
        min-width: 44px;
        min-height: 44px;
        border-radius: var(--r-btn-sm);
        border: 1px solid var(--ink-08);
        background: var(--ink-04);
        color: var(--ink);
        cursor: pointer;
        font-size: 18px;
        transition: background-color var(--dur) var(--ease);
      }
      @media (hover: hover) {
        .step:hover:not(:disabled) {
          background: var(--ink-08);
        }
      }
      .switch {
        width: 44px;
        height: 26px;
      }
      .announce:empty {
        display: none;
      }
      .announce {
        margin-top: var(--s4);
        font-weight: 500;
      }
    `,
  ],
})
export class ManageRegistrationComponent {
  readonly state = inject(ManageStateService);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly working = signal(false);
  readonly capacityRefusal = signal('');
  readonly announcement = signal('');
  private capacitySig = signal<number | null>(null);

  get capacity(): number {
    return this.capacitySig() ?? this.state.event()?.capacity ?? 1;
  }
  set capacity(v: number) {
    this.capacitySig.set(Number(v));
  }

  stepCapacity(delta: number) {
    const next = Math.min(500, Math.max(1, this.capacity + delta));
    this.capacitySig.set(next);
  }

  async saveCapacity() {
    const ev = this.state.event();
    if (!ev || this.working()) return;
    this.capacityRefusal.set('');
    this.working.set(true);
    try {
      const updated = await this.api.patchEvent(ev.slug, { capacity: Number(this.capacity) });
      await this.state.refresh();
      this.capacitySig.set(null);
      const moved = updated.promoted_count ?? 0;
      if (moved > 0) {
        const words = `${moved} ${moved === 1 ? 'guest was' : 'guests were'} moved from the waiting list to a seat and mailed.`;
        this.announcement.set(words);
        this.notices.show(words, 'success');
      } else {
        this.announcement.set('Capacity saved. Nobody was waiting, so nobody was mailed.');
        this.notices.show('Capacity saved.', 'success');
      }
    } catch (e) {
      const err = e as ApiError;
      this.capacityRefusal.set(err.message);
      this.capacitySig.set(this.state.event()?.capacity ?? 1);
    } finally {
      this.working.set(false);
    }
  }

  async toggle(field: 'approval_required' | 'waitlist_enabled', value: boolean) {
    const ev = this.state.event();
    if (!ev) return;
    try {
      await this.api.patchEvent(ev.slug, { [field]: value });
      await this.state.refresh();
      this.notices.show('Saved.', 'success');
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
      await this.state.refresh();
    }
  }

  async toggleOpen(open: boolean) {
    const ev = this.state.event();
    if (!ev) return;
    try {
      await this.api.patchEvent(ev.slug, { state: open ? 'published' : 'registration_closed' });
      await this.state.refresh();
      this.announcement.set(
        open ? 'Registration is open again and the public panel is back to what it was.' : 'Registration is closed. Nobody was mailed.',
      );
      this.notices.show(open ? 'Registration is open again.' : 'Registration is closed for this event.', 'success');
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
      await this.state.refresh();
    }
  }
}

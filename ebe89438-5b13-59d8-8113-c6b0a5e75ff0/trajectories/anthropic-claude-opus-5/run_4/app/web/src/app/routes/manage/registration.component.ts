import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, ApiService } from '../../core/api.service';
import { EventDetail } from '../../core/models';
import { NoticeService } from '../../core/notice.service';
import { ShellComponent } from '../../ui/shell.component';
import { NotFoundComponent } from '../not-found.component';
import { ManageNavComponent } from './manage-nav.component';

@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [FormsModule, ShellComponent, ManageNavComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-shell>
        <h1 class="t-screen-title">{{ event()?.title ?? 'Registration' }}</h1>
        <app-manage-nav [slug]="slug()" />

        @if (loading()) {
          <div class="sk" style="height:280px;border-radius:12px"></div>
        } @else if (event(); as e) {
          <div class="rows">
            <div class="row">
              <label class="t-body label" for="capacity">Capacity</label>
              <div class="control">
                <button
                  type="button"
                  class="step"
                  (click)="stepCapacity(-1)"
                  aria-label="Lower capacity by one"
                  [disabled]="saving()"
                >
                  −
                </button>
                <input
                  id="capacity"
                  class="num"
                  type="number"
                  min="1"
                  max="500"
                  [ngModel]="capacity()"
                  (ngModelChange)="capacity.set(+$event)"
                  [attr.aria-describedby]="capacityRefusal() ? 'cap-caption' : 'cap-help'"
                />
                <button
                  type="button"
                  class="step"
                  (click)="stepCapacity(1)"
                  aria-label="Raise capacity by one"
                  [disabled]="saving()"
                >
                  +
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  (click)="saveCapacity()"
                  [disabled]="capacity() === e.capacity || saving()"
                >
                  Apply
                </button>
              </div>
              @if (capacityRefusal()) {
                <span class="caption refusal-caption" id="cap-caption">{{ capacityRefusal() }}</span>
              } @else {
                <span class="caption" id="cap-help">
                  {{ e.confirmed_count }} confirmed of {{ e.capacity }}. Raising this seats the waiting list at once.
                </span>
              }
            </div>

            <div class="row">
              <span class="t-body label" id="approval-label">Approval required</span>
              <div class="control">
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  [class.on]="e.approval_required"
                  [attr.aria-checked]="e.approval_required"
                  aria-labelledby="approval-label"
                  (click)="toggle('approval_required', !e.approval_required)"
                  [disabled]="saving()"
                >
                  <span class="knob"></span>
                  <span class="visually-hidden">{{ e.approval_required ? 'On' : 'Off' }}</span>
                </button>
              </div>
              <span class="caption">A new registration then holds no seat until you approve it.</span>
            </div>

            <div class="row">
              <span class="t-body label" id="waitlist-label">Waiting list</span>
              <div class="control">
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  [class.on]="e.waitlist_enabled"
                  [attr.aria-checked]="e.waitlist_enabled"
                  aria-labelledby="waitlist-label"
                  (click)="toggle('waitlist_enabled', !e.waitlist_enabled)"
                  [disabled]="saving()"
                >
                  <span class="knob"></span>
                  <span class="visually-hidden">{{ e.waitlist_enabled ? 'On' : 'Off' }}</span>
                </button>
              </div>
              <span class="caption">With this off, a full event refuses a registration outright.</span>
            </div>

            <div class="row">
              <span class="t-body label" id="open-label">Registration Open</span>
              <div class="control">
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  [class.on]="isOpen()"
                  [attr.aria-checked]="isOpen()"
                  aria-labelledby="open-label"
                  (click)="toggleOpen()"
                  [disabled]="saving() || e.state === 'cancelled' || e.state === 'draft'"
                >
                  <span class="knob"></span>
                  <span class="visually-hidden">{{ isOpen() ? 'Open' : 'Closed' }}</span>
                </button>
              </div>
              <span class="caption">
                Turning this off shows the closed panel publicly and mails nobody. Guests keep their tickets.
              </span>
            </div>
          </div>

          <p class="announce" role="status" aria-live="polite">{{ announcement() }}</p>
        }
      </app-shell>
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .rows {
        max-width: 568px;
      }
      .row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: var(--s3);
        padding: var(--s4) 0;
        border-bottom: 1px solid var(--divider);
      }
      .caption {
        grid-column: 1 / -1;
        font-size: 13px;
        line-height: 16px;
        color: var(--muted);
      }
      .refusal-caption {
        color: #b3261e;
      }
      .control {
        display: flex;
        align-items: center;
        gap: var(--s2);
      }
      .step {
        width: 44px;
        height: 44px;
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      .num {
        width: 80px;
        min-height: 44px;
        text-align: center;
        padding: 10px var(--s2);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }
      .switch {
        width: 52px;
        height: 32px;
        min-width: 44px;
        border-radius: var(--r-round);
        border: 1px solid var(--ink-08);
        background: var(--disabled-fill);
        position: relative;
        cursor: pointer;
        transition: background-color var(--dur) var(--ease);
        padding: 0;
      }
      .switch.on {
        background: var(--success);
      }
      .knob {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 24px;
        height: 24px;
        border-radius: 100%;
        background: #fff;
        box-shadow: var(--elev-card);
        transition: transform var(--dur) var(--ease);
      }
      .switch.on .knob {
        transform: translateX(20px);
      }
      .announce:empty {
        display: none;
      }
      .announce {
        margin-top: var(--s4);
        font-size: 15px;
        line-height: 22px;
        color: var(--ink-64);
      }
    `,
  ],
})
export class ManageRegistrationComponent {
  slug = input.required<string>();

  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly saving = signal(false);
  readonly capacity = signal(0);
  readonly capacityRefusal = signal('');
  readonly announcement = signal('');

  private loaded = '';

  readonly isOpen = computed(() => this.event()?.state === 'published');

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
      this.capacity.set(e.capacity ?? 1);
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  stepCapacity(delta: number) {
    this.capacity.set(Math.max(1, Math.min(500, this.capacity() + delta)));
  }

  /** Raising capacity while people are waiting answers with how many were seated. */
  async saveCapacity() {
    this.saving.set(true);
    this.capacityRefusal.set('');
    try {
      const e = await this.api.updateEvent(this.slug(), { capacity: this.capacity() });
      this.event.set(e);
      this.capacity.set(e.capacity ?? 1);
      const moved = e.promoted_from_waitlist ?? 0;
      if (moved > 0) {
        const words = `${moved} waiting guest${moved === 1 ? '' : 's'} moved to a seat.`;
        this.announcement.set(words);
        this.notices.success(words);
      } else {
        this.announcement.set('Capacity saved.');
        this.notices.success('Capacity saved.');
      }
    } catch (err) {
      const e = err as ApiError;
      this.capacityRefusal.set(e.message);
      this.capacity.set(this.event()?.capacity ?? 1);
    } finally {
      this.saving.set(false);
    }
  }

  async toggle(field: 'approval_required' | 'waitlist_enabled', value: boolean) {
    this.saving.set(true);
    try {
      const e = await this.api.updateEvent(this.slug(), { [field]: value });
      this.event.set(e);
      this.notices.success('Saved.');
    } catch (err) {
      this.notices.refuse((err as ApiError).message);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleOpen() {
    const e = this.event();
    if (!e) return;
    this.saving.set(true);
    try {
      const next = e.state === 'published' ? 'registration_closed' : 'published';
      const updated = await this.api.updateEvent(this.slug(), { state: next });
      this.event.set(updated);
      this.notices.success(
        next === 'registration_closed'
          ? 'Registration is closed. Nobody was mailed.'
          : 'Registration is open again.',
      );
    } catch (err) {
      this.notices.refuse((err as ApiError).message);
    } finally {
      this.saving.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Registration } from '../core/api';
import { statusWord } from '../core/tokens';
import { SignedShellComponent } from '../shells/signed-shell';
import { NotFoundComponent } from './not-found';
import { SkeletonComponent } from '../ui/skeleton';
import { DialogComponent } from '../ui/dialog';

/** Capacity, approval, waiting list and the registration switch. */
@Component({
  selector: 'app-manage-registration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SignedShellComponent, SkeletonComponent, NotFoundComponent, FormsModule, DialogComponent],
  template: `
    <app-signed-shell>
      @if (loading()) {
        <app-skeleton [count]="3" [height]="56" [art]="40" />
      } @else if (!event()) {
        <app-not-found />
      } @else {
        <header class="head">
          <h1>Registration</h1>
          <span class="pill" [attr.data-status]="event()!.state">{{ statusWord(event()!.state) }}</span>
        </header>

        @if (moved()) { <p class="notice" role="status">{{ moved() }} waiting guest{{ moved() === 1 ? '' : 's' }} moved to a seat and mailed.</p> }

        <section class="panel">
          <div class="row">
            <div class="words">
              <span class="fl">Capacity</span>
              @if (capRefusal()) { <span class="refusal">{{ capRefusal() }}</span> }
              @else { <span class="caption">You already have {{ confirmed() }} guests confirmed.</span> }
            </div>
            <div class="ctl">
              <button type="button" class="step" (click)="nudge(-1)" aria-label="Lower capacity by one">−</button>
              <input class="input num" type="number" min="1" max="500" [(ngModel)]="capacity" aria-label="Capacity" />
              <button type="button" class="step" (click)="nudge(1)" aria-label="Raise capacity by one">+</button>
              <button type="button" class="btn btn-invert btn-sm" (click)="saveCapacity()" [disabled]="busy()">
                {{ busy() ? 'Saving' : 'Save' }}
              </button>
            </div>
          </div>

          <div class="row">
            <div class="words"><span class="fl">Approval</span><span class="caption">Every request waits for you.</span></div>
            <label class="sw">
              <input type="checkbox" [checked]="event()!.approval_required" (change)="toggle('approval_required', $any($event.target).checked)" />
              <span class="track" aria-hidden="true"><span class="knob"></span></span>
              <span class="visually-hidden">Approval required</span>
            </label>
          </div>

          <div class="row">
            <div class="words"><span class="fl">Waiting list</span><span class="caption">Full events take a queue.</span></div>
            <label class="sw">
              <input type="checkbox" [checked]="event()!.waitlist_enabled" (change)="toggle('waitlist_enabled', $any($event.target).checked)" />
              <span class="track" aria-hidden="true"><span class="knob"></span></span>
              <span class="visually-hidden">Waiting list enabled</span>
            </label>
          </div>

          <div class="row">
            <div class="words">
              <span class="fl">Registration Open</span>
              <span class="caption">Off takes no new registrations; held places keep their tickets.</span>
            </div>
            <label class="sw">
              <input type="checkbox" [checked]="event()!.state === 'published'" (change)="toggleRegistration($any($event.target).checked)" />
              <span class="track" aria-hidden="true"><span class="knob"></span></span>
              <span class="visually-hidden">Registration open</span>
            </label>
          </div>
        </section>

        @if (event()!.state !== 'cancelled') {
          <section class="panel">
            <div class="row">
              <div class="words"><span class="fl">Cancel this event</span>
                <span class="caption">Every guest still holding a place is mailed your words.</span></div>
              <button type="button" class="btn btn-danger btn-sm" (click)="openCancel()">Cancel Event</button>
            </div>
          </section>
        }
      }
    </app-signed-shell>

    <app-dialog [open]="cancelOpen()" title="Cancel this event"
                body="This cannot be undone. Every guest still holding a place is mailed your reason word for word."
                [closed]="closeCancel">
      <label class="field">
        <span class="fl">Your reason</span>
        <input class="input" [(ngModel)]="reason" aria-describedby="rz" />
        <span class="caption" id="rz">Type it out; the action unlocks once you have.</span>
      </label>
      <div class="acts">
        <button type="button" class="btn btn-quiet" (click)="cancelOpen.set(false)">Keep the event</button>
        <button type="button" class="btn btn-danger" [disabled]="!reason.trim() || busy()"
                (click)="confirmCancelEvent()">Yes, cancel this event</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    h1 { font: 700 22px/26px var(--sans); }
    .panel { padding: 8px 20px; border-radius: var(--r-card); background: var(--panel); margin-bottom: 20px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0;
      border-top: 1px solid var(--divider); flex-wrap: wrap; }
    .row:first-of-type { border-top: none; }
    .words { display: flex; flex-direction: column; gap: 4px; }
    .fl { font: 500 16px/24px var(--sans); }
    .caption { font-size: 13px; line-height: 18px; color: var(--muted); }
    .ctl { display: flex; align-items: center; gap: 8px; }
    .step { width: 44px; height: 44px; border-radius: var(--r-input); border: 1px solid var(--ink-08);
      background: var(--paper); font-size: 20px; cursor: pointer; }
    .num { width: 84px; text-align: center; }
    .sw { position: relative; display: inline-flex; width: 52px; height: 32px; flex: none; }
    .sw input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .track { position: absolute; inset: 0; border-radius: 100px; background: var(--disabled-fill);
      box-shadow: var(--ink-08) 0 0 0 1px inset; pointer-events: none; }
    .knob { position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 100%;
      background: var(--paper); box-shadow: var(--shadow-card); }
    .sw input:checked + .track { background: var(--success); }
    .sw input:checked + .track .knob { transform: translateX(20px); }
    .sw input:focus-visible + .track { outline: 2px solid var(--blue); outline-offset: 2px; }
    .refusal { font-size: 13px; color: var(--danger); }
    .acts { display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }
    .notice { padding: 12px 16px; border-radius: var(--r-card); background: rgba(40, 205, 65, 0.1);
      border: 1px solid rgba(40, 205, 65, 0.35); margin-bottom: 16px; font-size: 14px; }
    @media (max-width: 649px) { .ctl { width: 100%; justify-content: space-between; } }
  `],
})
export class ManageRegistrationComponent {
  private api = inject(Api);
  slug = input.required<string>();
  event = signal<any | null>(null);
  regs = signal<Registration[]>([]);
  loading = signal(true);
  busy = signal(false);
  capacity = 0;
  capRefusal = signal('');
  moved = signal(0);
  cancelOpen = signal(false);
  reason = '';

  statusWord = statusWord;

  ngOnInit() { this.load(); }

  load() {
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        this.event.set(e);
        this.capacity = e.capacity;
        this.api.registrations(this.slug()).subscribe({
          next: (r) => { this.regs.set(r); this.loading.set(false); },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  confirmed = computed(() => this.regs().filter((r) => r.status === 'confirmed' || r.status === 'checked_in').length);

  openCancel() { this.reason = ''; this.cancelOpen.set(true); }
  closeCancel = () => this.cancelOpen.set(false);

  confirmCancelEvent() {
    const why = this.reason.trim();
    if (!why || this.busy()) return;
    this.busy.set(true);
    this.api.cancelEvent(this.slug(), why).subscribe({
      next: () => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.api.notify('The event is cancelled and every holder is mailed.', 'warning');
        this.load();
      },
      error: (e) => { this.busy.set(false); this.api.notify(this.api.messageFor(e), 'danger'); },
    });
  }

  nudge(d: number) { this.capacity = Math.min(500, Math.max(1, this.capacity + d)); }

  saveCapacity() {
    if (this.busy()) return;
    this.capRefusal.set('');
    this.moved.set(0);
    this.busy.set(true);
    this.api.patchEvent(this.slug(), { capacity: this.capacity }).subscribe({
      next: (e) => {
        this.busy.set(false);
        this.event.set({ ...this.event(), ...e });
        if (e.moved_to_seats) this.moved.set(e.moved_to_seats);
        this.api.notify('Capacity saved.', 'success');
      },
      error: (err) => {
        this.busy.set(false);
        this.capRefusal.set(this.api.messageFor(err));
      },
    });
  }

  toggle(field: 'approval_required' | 'waitlist_enabled', value: boolean) {
    if (this.busy()) return;
    this.api.patchEvent(this.slug(), { [field]: value }).subscribe({
      next: (e) => { this.event.set({ ...this.event(), ...e }); this.api.notify('Saved.', 'success'); },
      error: (e) => this.api.notify(this.api.messageFor(e), 'danger'),
    });
  }

  toggleRegistration(open: boolean) {
    const to = open ? 'published' : 'registration_closed';
    this.api.patchEvent(this.slug(), { state: to }).subscribe({
      next: (e) => {
        this.event.set({ ...this.event(), ...e });
        this.api.notify(open ? 'Registration is open again.' : 'Registration is closed. Nobody is mailed.', 'info');
      },
      error: (e) => this.api.notify(this.api.messageFor(e), 'danger'),
    });
  }
}

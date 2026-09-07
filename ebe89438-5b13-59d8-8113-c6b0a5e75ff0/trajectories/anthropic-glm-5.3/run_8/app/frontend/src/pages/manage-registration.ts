import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, EventSummary } from '../api';
import { Toast } from '../domain';
import { Icon } from '../ui/icon';
import { NotFoundPage } from './notfound';

/** Capacity and approval. Owning host only. */
@Component({
  selector: 'g-manage-registration',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'missing') { <g-not-found />
    } @else if (ev()) {
      @if (ev(); as e) {
      <div class="wrap">
        <header class="head spread">
          <div>
            <h1 class="t-h1">Registration settings</h1>
            <a class="t-caption back" [routerLink]="['/event', e.slug, 'manage', 'overview']">← {{ e.title }}</a>
          </div>
          <a class="btn btn-secondary btn-sm" [routerLink]="['/event', e.slug, 'manage', 'guests']">Guest list and door</a>
        </header>

        <section class="card row-setting">
          <div class="spread">
            <div>
              <h2 class="t-row strong">Capacity</h2>
              <p class="field-hint">{{ caption() }}</p>
            </div>
            <div class="stepper" role="group" aria-label="Capacity">
              <button (click)="step(-1)" [disabled]="capacity() <= 1 || busy()" aria-label="Fewer seats">−</button>
              <span class="value">{{ capacity() }}</span>
              <button (click)="step(1)" [disabled]="capacity() >= 500 || busy()" aria-label="More seats">+</button>
            </div>
          </div>
          @if (error(); as m) { <span class="field-error">{{ m }}</span> }
        </section>

        <section class="card row-setting">
          <div class="spread">
            <div>
              <h2 class="t-row strong">Approval required</h2>
              <p class="field-hint">Requests hold no seat until you approve them.</p>
            </div>
            <button class="switch" role="switch" [attr.aria-checked]="approval()" (click)="toggleApproval()" [disabled]="busy()">
              <span class="track"><span class="knob"></span></span>
              <span class="sr-only">Approval required</span>
            </button>
          </div>
        </section>

        <section class="card row-setting">
          <div class="spread">
            <div>
              <h2 class="t-row strong">Waiting list</h2>
              <p class="field-hint">Further guests queue in order once the room fills.</p>
            </div>
            <button class="switch" role="switch" [attr.aria-checked]="waitlist()" (click)="toggleWaitlist()" [disabled]="busy()">
              <span class="track"><span class="knob"></span></span>
              <span class="sr-only">Waiting list enabled</span>
            </button>
          </div>
        </section>

        <section class="card row-setting">
          <div class="spread">
            <div>
              <h2 class="t-row strong">Registration Open</h2>
              <p class="field-hint">Off closes registration at once; held places keep their tickets.</p>
            </div>
            <button class="switch" role="switch" [attr.aria-checked]="registrationOpen()" (click)="toggleRegistration()" [disabled]="busy()">
              <span class="track"><span class="knob"></span></span>
              <span class="sr-only">Registration open</span>
            </button>
          </div>
        </section>

        <div role="status" aria-live="polite">
          @if (notice(); as n) { <p class="t-row notice-line">{{ n }}</p> }
        </div>
      </div>
      }
    }
  `,
  imports: [RouterLink, Icon, NotFoundPage],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; flex-direction: column; gap: 16px; }
    .back { color: var(--muted); text-decoration: none; }
    @media (hover: hover) { .back:hover { text-decoration: underline; } }
    .row-setting { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .strong { font-weight: 500; }
    .notice-line { color: var(--success); font-weight: 500; }
  `],
})
export class ManageRegistrationPage {
  slug = input.required<string>();
  private api = inject(Api);
  private toast = inject(Toast);

  ev = signal<EventSummary | null>(null);
  state = signal<'loading' | 'ready' | 'missing'>('loading');
  capacity = signal(20);
  approval = signal(false);
  waitlist = signal(false);
  registrationOpen = signal(true);
  busy = signal(false);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);

  constructor() {
    effect(() => { this.load(this.slug()); });
  }

  load(slug: string): void {
    this.api.event(slug).subscribe({
      next: (e) => {
        if (!e.is_owner) { this.state.set('missing'); return; }
        this.ev.set(e);
        this.capacity.set(e.capacity);
        this.approval.set(e.approval_required);
        this.waitlist.set(e.waitlist_enabled);
        this.registrationOpen.set(e.state === 'published');
        this.state.set('ready');
      },
      error: () => this.state.set('missing'),
    });
  }

  caption(): string {
    const e = this.ev();
    if (!e) return '';
    return `You already have ${e.confirmed_count} guests confirmed.`;
  }

  step(delta: number): void {
    const next = Math.min(500, Math.max(1, this.capacity() + delta));
    if (next === this.capacity()) return;
    this.capacity.set(next);
    this.error.set(null);
    this.notice.set(null);
    this.busy.set(true);
    this.api.patchEvent(this.slug(), { capacity: next }).subscribe({
      next: (res) => {
        this.busy.set(false);
        const moved = (res as EventSummary & { moved_from_waitlist?: number }).moved_from_waitlist ?? 0;
        if (moved > 0) {
          this.notice.set(`${moved} guest${moved === 1 ? '' : 's'} moved from the waiting list to a seat.`);
          this.toast.show(`${moved} waiting-list place(s) became seats.`, 'success');
        } else if (delta > 0) {
          this.notice.set('Capacity raised. Nobody was waiting.');
        }
        this.load(this.slug());
      },
      error: (err) => {
        this.busy.set(false);
        const e = this.ev();
        this.capacity.set(e?.capacity ?? this.capacity());
        this.error.set(err?.error?.message ?? 'We could not change the capacity.');
        this.toast.show(err?.error?.message ?? 'We could not change the capacity.', 'danger');
      },
    });
  }

  private patch(body: Record<string, unknown>, done: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.patchEvent(this.slug(), body).subscribe({
      next: () => { this.busy.set(false); done(); this.load(this.slug()); },
      error: (err) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'That change did not go through.', 'danger');
      },
    });
  }

  toggleApproval(): void {
    const next = !this.approval();
    this.approval.set(next);
    this.patch({ approval_required: next }, () => this.toast.show(next ? 'Approvals are on.' : 'Approvals are off.', 'info'));
  }

  toggleWaitlist(): void {
    const next = !this.waitlist();
    this.waitlist.set(next);
    this.patch({ waitlist_enabled: next }, () => this.toast.show(next ? 'The waiting list is on.' : 'The waiting list is off.', 'info'));
  }

  toggleRegistration(): void {
    const next = !this.registrationOpen();
    this.registrationOpen.set(next);
    this.patch({ state: next ? 'published' : 'registration_closed' }, () =>
      this.toast.show(next ? 'Registration is open again.' : 'Registration is closed. Held places keep their tickets.', 'info'));
  }
}

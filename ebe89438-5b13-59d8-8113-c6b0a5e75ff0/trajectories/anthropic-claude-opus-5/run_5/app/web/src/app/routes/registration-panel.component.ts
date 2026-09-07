import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, ApiFailure } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { NoticeService } from '../core/notice.service';
import { SpinnerComponent } from '../ui/bits';
import type { EventDetail, MyRegistration } from '../core/models';

/**
 * The registration panel shows exactly one of six states: register, request to
 * join, request received, you are going, you are number n on the waiting list,
 * or registration closed. Its answer to a submission is an assertive live
 * region. Below 484px it leaves the flow and sticks to the foot of the screen as
 * a 72px bar carrying the one primary action.
 *
 * It decides no colour of its own, which is what lets it sit correctly on a
 * themed event page and on a plain screen.
 */
@Component({
  selector: 'app-registration-panel',
  standalone: true,
  imports: [RouterLink, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [attr.aria-labelledby]="'reg-head'">
      <div class="panel__inner">
        <h2 class="panel__head t-prose-h" id="reg-head">{{ heading() }}</h2>
        <p class="panel__body t-caption">{{ blurb() }}</p>

        @if (ticketCode()) {
          <p class="panel__code">
            <span class="visually-hidden">Your ticket code is </span>
            <span class="panel__code-value">{{ ticketCode() }}</span>
          </p>
        }

        <!-- The panel's own answer is assertive. -->
        <p class="visually-hidden" role="alert" aria-live="assertive">{{ answer() }}</p>

        <div class="panel__actions">
          @if (state() === 'closed') {
            <button type="button" class="btn btn--block" disabled>Registration Is Closed</button>
          } @else if (state() === 'cancelled') {
            <button type="button" class="btn btn--block" disabled>Event Cancelled</button>
          } @else if (state() === 'ended') {
            <button type="button" class="btn btn--block" disabled>This Event Has Ended</button>
          } @else if (state() === 'going' || state() === 'checked_in') {
            <a class="btn btn--primary btn--block" [routerLink]="'/t/' + ticketCode()">View Ticket</a>
            <button type="button" class="btn btn--block" (click)="leave()" [disabled]="working()">
              @if (working()) {
                <app-spinner />
              }
              Cancel Registration
            </button>
          } @else if (state() === 'waitlisted') {
            <button type="button" class="btn btn--block" (click)="leave()" [disabled]="working()">
              @if (working()) {
                <app-spinner />
              }
              Leave Waiting List
            </button>
          } @else if (state() === 'pending') {
            <button type="button" class="btn btn--block" (click)="leave()" [disabled]="working()">
              @if (working()) {
                <app-spinner />
              }
              Withdraw Request
            </button>
          } @else {
            <button
              type="button"
              class="btn btn--primary btn--block"
              (click)="register()"
              [disabled]="working()"
            >
              @if (working()) {
                <app-spinner />
              }
              {{ state() === 'request' ? 'Request to Join' : primaryLabel() }}
            </button>
          }
        </div>

        @if (refusal()) {
          <p class="panel__refusal field__refusal">{{ refusal() }}</p>
        }

        <p class="panel__seats t-caption">{{ seats() }}</p>
      </div>
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .panel {
        border: 1px solid var(--event-hairline, var(--ink-08));
        background: var(--event-panel, var(--ink-04));
        border-radius: var(--r-card-lg);
        padding: var(--s5);
      }
      .panel__inner { display: flex; flex-direction: column; gap: var(--s3); }
      .panel__head { color: var(--event-ink, var(--ink)); }
      .panel__body { color: var(--event-ink-secondary, var(--ink-64)); }
      .panel__code {
        font-family: var(--mono);
        font-size: 22px;
        line-height: 26px;
        letter-spacing: 0.04em;
        padding: var(--s2) var(--s3);
        background: var(--event-sunk, var(--paper-inset));
        border-radius: var(--r-input);
        color: var(--event-ink, var(--ink));
        word-break: break-all;
      }
      .panel__actions { display: flex; flex-direction: column; gap: var(--s2); }
      .panel__seats { color: var(--event-ink-secondary, var(--ink-36)); }
      .panel__refusal { color: var(--danger); }

      /* Below 484px the panel leaves the flow and sticks to the foot of the
         screen as a 72px bar carrying the one primary action. */
      @media (max-width: 483px) {
        :host { position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-bar); }
        .panel {
          border-radius: 0;
          border-left: 0;
          border-right: 0;
          border-bottom: 0;
          min-height: 72px;
          padding: var(--s3) var(--s4);
          background: var(--event-ground, var(--paper));
          box-shadow: var(--elev-fine);
          display: flex;
          align-items: center;
        }
        .panel__inner { width: 100%; gap: var(--s1); }
        .panel__head,
        .panel__body,
        .panel__seats,
        .panel__code { display: none; }
        .panel__actions { flex-direction: row; }
      }
    `,
  ],
})
export class RegistrationPanelComponent {
  readonly event = input.required<EventDetail>();
  readonly changed = output<MyRegistration | null>();

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private notices = inject(NoticeService);

  readonly working = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly answer = signal('');

  private registration = computed(() => this.event().my_registration);

  readonly state = computed<
    'register' | 'request' | 'pending' | 'going' | 'checked_in' | 'waitlisted' | 'closed' | 'cancelled' | 'ended'
  >(() => {
    const e = this.event();
    const reg = this.registration();
    if (reg?.status === 'confirmed') return 'going';
    if (reg?.status === 'checked_in') return 'checked_in';
    if (reg?.status === 'waitlisted') return 'waitlisted';
    if (reg?.status === 'pending_approval') return 'pending';
    if (e.state === 'cancelled') return 'cancelled';
    if (e.state === 'registration_closed') return 'closed';
    if (e.has_ended) return 'ended';
    return e.approval_required ? 'request' : 'register';
  });

  readonly ticketCode = computed(() => this.registration()?.ticket_code ?? null);

  readonly heading = computed(() => {
    switch (this.state()) {
      case 'going':
        return "You're going";
      case 'checked_in':
        return "You're checked in";
      case 'waitlisted':
        return `You're number ${this.registration()?.waitlist_position ?? 1} on the waiting list`;
      case 'pending':
        return 'Request received';
      case 'request':
        return 'Request to join';
      case 'closed':
        return 'Registration Is Closed';
      case 'cancelled':
        return 'This event was called off';
      case 'ended':
        return 'This event has ended';
      default:
        return 'Register';
    }
  });

  readonly blurb = computed(() => {
    const e = this.event();
    switch (this.state()) {
      case 'going':
        return 'Your seat is held. Bring the code below to the door.';
      case 'checked_in':
        return 'You arrived and were checked in at the door.';
      case 'waitlisted':
        return 'If somebody cancels, the first place on the list becomes a seat and we write to you at once.';
      case 'pending':
        return 'The host reads every request before confirming a seat. We will write when there is an answer.';
      case 'request':
        return 'This host approves each guest, so your request goes to them rather than straight to a seat.';
      case 'closed':
        return 'The host has stopped taking registrations for this event.';
      case 'cancelled':
        return e.cancel_reason ?? 'The host called this event off.';
      case 'ended':
        return 'Registration for a past event is closed.';
      default:
        return 'Free to attend. One seat per account.';
    }
  });

  readonly primaryLabel = computed(() =>
    this.event().remaining === 0 && this.event().waitlist_enabled ? 'Join Waiting List' : 'Register',
  );

  readonly seats = computed(() => {
    const e = this.event();
    if (e.capacity === null) return 'Open to everyone';
    const left = e.remaining ?? 0;
    if (left === 0) {
      return e.waitlist_enabled
        ? `${e.confirmed_count} of ${e.capacity} seats taken · waiting list open`
        : `${e.confirmed_count} of ${e.capacity} seats taken · full`;
    }
    return `${e.confirmed_count} of ${e.capacity} seats taken`;
  });

  register(): void {
    if (!this.auth.signedIn()) {
      this.router.navigate(['/login'], { queryParams: { next: `/${this.event().slug}` } });
      return;
    }
    this.refusal.set(null);
    this.working.set(true);
    this.api.register(this.event().slug).subscribe({
      next: (reg) => {
        this.working.set(false);
        this.changed.emit(reg);
        if (reg.status === 'confirmed') {
          this.answer.set(`You have a seat. Your ticket code is ${reg.ticket_code}.`);
          this.notices.show('Your seat is confirmed and the ticket is on its way to your inbox.', 'success');
        } else if (reg.status === 'waitlisted') {
          this.answer.set(`This event just filled up. You are on the waiting list.`);
          this.notices.show('This event just filled up. You are on the waiting list.', 'warning');
        } else if (reg.status === 'pending_approval') {
          this.answer.set('Your request has reached the host.');
          this.notices.show('Your request has reached the host.', 'warning');
        }
      },
      error: (e: ApiFailure) => {
        this.working.set(false);
        this.refusal.set(e.message);
        this.answer.set(e.message);
      },
    });
  }

  leave(): void {
    const reg = this.registration();
    if (!reg) return;
    this.refusal.set(null);
    this.working.set(true);
    this.api.cancelRegistration(reg.id).subscribe({
      next: (updated) => {
        this.working.set(false);
        this.changed.emit(updated);
        this.answer.set('Your place has been released.');
        this.notices.show('Your place has been released.', 'info');
      },
      error: (e: ApiFailure) => {
        this.working.set(false);
        this.refusal.set(e.message);
        this.answer.set(e.message);
      },
    });
  }
}

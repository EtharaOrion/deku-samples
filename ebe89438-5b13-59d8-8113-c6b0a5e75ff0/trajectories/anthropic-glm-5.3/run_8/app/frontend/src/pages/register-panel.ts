import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, EventSummary, MyRegistration } from '../api';
import { Toast } from '../domain';

/**
 * The registration panel: exactly one of six states — register, request to
 * join, request received, you are going, you are number n on the waiting list,
 * or registration closed. Its answer is an assertive live region.
 */
@Component({
  selector: 'g-register-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [class.closed]="panelState() === 'closed'" [attr.aria-label]="'Registration'">
      @switch (panelState()) {
        @case ('closed') {
          <h2 class="t-h2">Registration Is Closed</h2>
          <p class="t-row secondary">The host has stopped taking registrations for this event.</p>
        }
        @case ('register') {
          <div class="head">
            <h2 class="t-h2">{{ event().approval_required ? 'Request a place' : 'Take a seat' }}</h2>
            @if (seatsLeft() !== null) {
              <p class="t-row secondary">{{ seatsLeft() }} of {{ event().capacity }} seats left</p>
            } @else {
              <p class="t-row secondary">Free to join</p>
            }
          </div>
          <p class="t-caption hint">Your place is held the moment you register.</p>
        }
        @case ('request-received') {
          <div class="head">
            <span class="pill pill-warning"><span class="dot"></span>Request received</span>
            <h2 class="t-h2">The host is deciding</h2>
            <p class="t-row secondary">You hold no seat until {{ hostName() }} approves your request.</p>
          </div>
        }
        @case ('going') {
          <div class="head">
            <span class="pill pill-success"><span class="dot"></span>You are going</span>
            <h2 class="t-h2">Your seat is held</h2>
          </div>
          @if (registration()?.ticket_code; as code) {
            <div class="ticket">
              <span class="t-caption code-label">Ticket code</span>
              <a class="code t-code" [routerLink]="['/t', code]" [attr.aria-label]="'View ticket ' + code">{{ code }}</a>
            </div>
          }
        }
        @case ('waiting') {
          <div class="head">
            <span class="pill pill-warning"><span class="dot"></span>On the waiting list</span>
            <h2 class="t-h2">You are number {{ registration()?.waitlist_position }} on the waiting list</h2>
            <p class="t-row secondary">You hold no seat yet. We will write to you if one opens.</p>
          </div>
        }
        @case ('declined') {
          <div class="head">
            <span class="pill pill-danger"><span class="dot"></span>Declined</span>
            <h2 class="t-h2">The host could not take your request</h2>
            <p class="t-row secondary">You can register again for another event at any time.</p>
          </div>
        }
        @default {
          <div class="skeleton skeleton-line"></div>
        }
      }

      <div class="answer" role="status" aria-live="assertive">
        @if (answer(); as a) { <p class="t-row">{{ a }}</p> }
      </div>

      <div class="actions">
        @switch (actionState()) {
          @case ('register') {
            <button class="btn btn-primary btn-block action" (click)="register()" [disabled]="working()">
              @if (working()) { <span class="rotator" aria-hidden="true"></span> }
              {{ event().approval_required ? 'Request to join' : 'Register' }}
            </button>
          }
          @case ('cancel') {
            <a class="btn btn-secondary btn-sm" [routerLink]="['/home']">Manage in My events</a>
          }
          @case ('closed') {
            <span class="t-caption">Registration opens again if the host reopens it.</span>
          }
          @case ('signin') {
            <a class="btn btn-primary btn-block action" [routerLink]="['/login']" [queryParams]="{ next: '/' + event().slug }">Sign in to register</a>
          }
          @default { <span></span> }
        }
      </div>
    </section>
  `,
  imports: [RouterLink],
  styles: [`
    :host { display: block; }
    .panel {
      border: 1px solid rgba(var(--ev-ink-rgb, 0, 15, 58), 0.08);
      background: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.04);
      border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 16px;
      position: relative; z-index: 1;
    }
    .head { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .secondary { color: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.64); }
    .hint { color: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.36); }
    .ticket { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: 8px;
              background: var(--paper); border: 1px solid rgba(var(--ev-ink-rgb, 0, 15, 58), 0.08); }
    .code-label { color: var(--muted); }
    .code { font-size: 22px; line-height: 26px; letter-spacing: 0.04em; color: var(--ink); text-decoration: none; font-weight: 600; }
    @media (hover: hover) { .code:hover { text-decoration: underline; } }
    .answer { min-height: 24px; }
    .answer p { margin: 0; }
    .actions { display: flex; flex-direction: column; gap: 8px; }

    /* Below 484px the panel leaves the flow and sticks to the foot of the screen. */
    @media (max-width: 483px) {
      .panel {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-bar);
        border-radius: 16px 16px 0 0; padding: 12px 16px 16px; min-height: 72px;
        box-shadow: var(--shadow-card); background: var(--paper);
        color: var(--ink);
      }
      .panel .secondary, .panel .hint { color: var(--ink-64); }
      .panel .ticket { border-color: var(--ink-08); }
      .answer { min-height: 0; font-size: 13px; line-height: 16px; }
      .panel.closed { position: static; box-shadow: none; margin: 0 -16px; border-radius: 0; }
    }
  `],
})
export class RegisterPanel {
  event = input.required<EventSummary>();
  registrationInput = input<MyRegistration | null>(null);
  changed = output<void>();
  registration = signal<MyRegistration | null>(null);

  constructor() {
    effect(() => {
      this.registration.set(this.registrationInput());
    });
  }

  private api = inject(Api);
  private toast = inject(Toast);

  working = signal(false);
  answer = signal<string | null>(null);

  panelState = computed<'register' | 'request-received' | 'going' | 'waiting' | 'declined' | 'closed' | 'loading'>(() => {
    const e = this.event();
    if (e.state === 'registration_closed') return 'closed';
    if (e.state === 'cancelled') return 'closed';
    const reg = this.registration();
    if (!reg) return 'register';
    switch (reg.status) {
      case 'pending_approval': return 'request-received';
      case 'confirmed':
      case 'checked_in': return 'going';
      case 'waitlisted': return 'waiting';
      case 'declined': return 'declined';
      default: return 'register';
    }
  });

  actionState = computed<'register' | 'cancel' | 'closed' | 'signin' | 'none'>(() => {
    if (!this.api.account()) return this.panelState() === 'closed' ? 'closed' : 'signin';
    if (this.panelState() === 'closed') return 'closed';
    if (['going', 'request-received', 'waiting', 'declined'].includes(this.panelState())) return 'cancel';
    return 'register';
  });

  seatsLeft = computed<number | null>(() => {
    const e = this.event();
    if (e.capacity <= 0) return null;
    return Math.max(0, e.capacity - e.confirmed_count);
  });

  hostName(): string {
    return this.event().calendar.owner.display_name;
  }

  register(): void {
    if (this.working()) return;
    this.working.set(true);
    this.answer.set(null);
    this.api.register(this.event().slug).subscribe({
      next: (reg) => {
        this.working.set(false);
        this.registration.set(reg as MyRegistration);
        if (reg.status === 'confirmed') {
          this.answer.set(`You are going. Your ticket code is ${reg.ticket_code}.`);
        } else if (reg.status === 'waitlisted') {
          this.answer.set(`This event just filled up. You are on the waiting list at position ${reg.waitlist_position}.`);
        } else if (reg.status === 'pending_approval') {
          this.answer.set('Your request has reached the host. You hold no seat until they approve it.');
        }
        this.changed.emit();
      },
      error: (err) => {
        this.working.set(false);
        const message = err?.error?.message ?? 'We could not register you. Try again in a moment.';
        this.answer.set(message);
      },
    });
  }
}

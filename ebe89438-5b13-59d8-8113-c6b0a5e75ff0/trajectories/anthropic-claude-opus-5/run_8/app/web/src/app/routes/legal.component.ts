import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink, PublicBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <div class="public-shell">
      <main id="main" class="page prose">
        <h1 class="serif">Terms of Use</h1>
        <h2 class="t-section-heading">What this service is</h2>
        <p class="t-longform">
          Deku hosts calendars for small public gatherings. A host publishes an event at its own short address and collects
          guests; a guest registers and holds a ticket. Events here are free: there are no prices, no payments and no refunds.
        </p>
        <h2 class="t-section-heading">Accounts</h2>
        <p class="t-longform">
          Signing up creates a guest account. Host accounts are seeded by the organisers of this deployment. You are
          responsible for what happens under your account, and you may edit your own display name and handle and nobody
          else’s.
        </p>
        <h2 class="t-section-heading">Seats and waiting lists</h2>
        <p class="t-longform">
          A seat is held only while your registration is confirmed or checked in. Cancelling frees the seat immediately and it
          passes to the head of that event’s waiting list. A host may close registration, raise capacity, or call an event off
          with a stated reason, and we will write to everyone still holding a place.
        </p>
        <h2 class="t-section-heading">Mail</h2>
        <p class="t-longform">
          We send one message per change to your registration, to your address alone. We do not send reminders, marketing or
          any message you did not cause.
        </p>
        <p class="t-longform">
          Questions belong with the host of the calendar you joined. <a class="link" routerLink="/discover">Back to discovery</a>.
        </p>
      </main>
    </div>
  `,
  styles: [
    `
      .prose {
        max-width: 640px;
        padding-top: var(--s7);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }
      h1 {
        font-size: 36px;
        line-height: 44px;
        font-weight: 400;
      }
      h2 {
        margin-top: var(--s4);
      }
      p {
        color: var(--ink-64);
      }
      .link {
        color: var(--blue);
      }
    `,
  ],
})
export class LegalComponent implements OnInit {
  ngOnInit(): void {
    clearTheme();
  }
}

import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { PublicBarComponent } from '../ui/public-bar.component';
import { ThemeService } from '../core/theme.service';

/** The same chrome around plain prose. */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [PublicBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <main id="main" class="page wrap">
      <h1 class="head">Terms of Use</h1>
      <section class="prose">
        <h2 class="t-prose-h">What this is</h2>
        <p class="t-prose">
          Deku is a hosting tool for small public gatherings. A host keeps a calendar, publishes an
          event at its own short address, and collects guests. A guest browses, registers and holds
          a ticket. Everything here is free: there are no prices, no payments and no refunds.
        </p>
        <h2 class="t-prose-h">Your account</h2>
        <p class="t-prose">
          Signing up creates a guest account. You are responsible for what you post and for the
          people you invite. Do not use somebody else's name, and do not register on behalf of a
          person who has not asked you to.
        </p>
        <h2 class="t-prose-h">Seats and waiting lists</h2>
        <p class="t-prose">
          A seat is held only while your registration is confirmed. Cancelling releases it at once
          to whoever is first on the waiting list. A host may close registration, raise or lower
          capacity within the limits of the seats already taken, or call an event off entirely, in
          which case everybody holding a place is written to with the host's own reason.
        </p>
        <h2 class="t-prose-h">Mail</h2>
        <p class="t-prose">
          We write to you when something changes about a registration you hold: a seat confirmed, a
          request answered, a waiting-list place taken or offered, or an event called off. We do not
          send reminders, newsletters or anything you did not ask for.
        </p>
        <h2 class="t-prose-h">Ending it</h2>
        <p class="t-prose">
          You can stop using Deku whenever you like. An account that breaks these terms may be
          suspended.
        </p>
      </section>
    </main>
  `,
  styles: [
    `
      .wrap { padding-top: 96px; padding-bottom: var(--s8); max-width: 640px; }
      .head {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 44px;
        line-height: 50px;
        margin-bottom: var(--s5);
      }
      .prose { display: flex; flex-direction: column; gap: var(--s3); }
      .prose h2 { margin-top: var(--s4); }
      .prose p { color: var(--ink-64); }
    `,
  ],
})
export class LegalPage implements OnInit {
  private theme = inject(ThemeService);

  ngOnInit(): void {
    this.theme.clear();
  }
}

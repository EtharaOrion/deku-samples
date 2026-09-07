import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicShellComponent } from '../shells/public-shell';

@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicShellComponent, RouterLink],
  template: `
    <app-public-shell>
      <article class="page">
        <h1>Terms of Service</h1>
        <section>
          <h2>What this is</h2>
          <p>Community Calendar is a hosting tool for small public gatherings. A host keeps a calendar, publishes an
            event at its own short address and collects guests. A guest browses, registers and holds a ticket.</p>
        </section>
        <section>
          <h2>Free events only</h2>
          <p>There are no prices, no payments and no refunds on this service. A host may not charge through it and a
            guest owes nothing for a place.</p>
        </section>
        <section>
          <h2>What we write to you about</h2>
          <p>Every outcome of a registration reaches you by email: a confirmed place, a waiting-list place, an approval,
            a decline and a cancellation with the host's own reason. Nothing else is sent.</p>
        </section>
        <section>
          <h2>Your account</h2>
          <p>Signup is open and always creates a guest account. You may leave an event you hold a place at, which frees
            the seat for the next person waiting.</p>
        </section>
      </article>
    </app-public-shell>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding: 48px 24px 96px; display: flex; flex-direction: column; gap: 24px; }
    h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; }
    h2 { font: 600 16px/25.6px var(--sans); margin-bottom: 8px; }
    p { font-size: 16px; line-height: 25.6px; color: var(--ink-64); }
  `],
})
export class LegalComponent {}

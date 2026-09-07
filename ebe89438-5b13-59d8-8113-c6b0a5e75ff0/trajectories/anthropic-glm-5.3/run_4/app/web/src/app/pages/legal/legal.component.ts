import { Component } from '@angular/core';

@Component({
  selector: 'app-legal',
  standalone: true,
  template: `
    <article class="page">
      <h1 class="serif">Terms</h1>
      <p class="lede">Gatherline hosts free gatherings. These terms say what that means.</p>
      <section>
        <h2>Free events only</h2>
        <p>Gatherline carries no prices and takes no payments. A host may not charge through the product, and a guest owes nothing for a seat.</p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>You are responsible for your credentials. Accounts can be suspended for abuse of the platform or of other people.</p>
      </section>
      <section>
        <h2>Your data</h2>
        <p>A host you register with can see your email and display name on their guest list. Nothing else about you is shared with them.</p>
      </section>
    </article>
  `,
  styles: [`
    .page { max-width: 640px; }
    h1 { font-size: 32px; line-height: 40px; margin-bottom: 8px; }
    .lede { color: var(--muted); margin-bottom: 24px; }
    section { margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
    h2 { font-size: 16px; line-height: 25.6px; font-weight: 600; }
    p { font-size: 16px; line-height: 25.6px; }
  `],
})
export class LegalComponent {}

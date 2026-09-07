import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A long-form legal route with the same chrome around plain prose. */
@Component({
  selector: 'g-legal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="wrap t-longform">
      <h1 class="t-h1">Terms and House Rules</h1>
      <p>Gather is a hosting tool for small public gatherings. These terms describe what the service does and what it deliberately leaves out.</p>
      <h2 class="t-section">Free events only</h2>
      <p>Events on Gather are free to attend. There are no prices, no payments, no refunds and no disputes, because no money ever moves through the service.</p>
      <h2 class="t-section">Email and password only</h2>
      <p>Sign-in is with an email and a password. There are no emailed sign-in codes, no phone sign-in, no third-party identity providers and no passkeys.</p>
      <h2 class="t-section">Hosts own their calendars</h2>
      <p>A host owns the calendars they create, the events on those calendars, the guest lists and the door. No other host can read or change them.</p>
      <h2 class="t-section">Guests hold their own place</h2>
      <p>A guest may register for an event, hold a ticket, and cancel their own registration. A guest may not read a guest list, approve anybody, or check anybody in.</p>
      <h2 class="t-section">No series, no messaging</h2>
      <p>There are no recurring series, no guest reliability signals, no messaging, no inbox and no push notifications. Mail is sent from the request that causes the transition and nowhere else.</p>
      <h2 class="t-section">Suspended accounts</h2>
      <p>An account that breaks these rules may be suspended. A suspended account sees the suspension page and nothing else.</p>
    </article>
  `,
  styles: [`
    :host { display: block; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 24px 96px; display: flex; flex-direction: column; gap: 16px; }
  `],
})
export class LegalPage {}

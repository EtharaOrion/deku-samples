import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TopbarComponent } from '../ui/topbar.component';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink, TopbarComponent],
  template: `
    <div class="page">
      <app-topbar></app-topbar>
      <main class="wrap long-form" role="main">
        <h1 class="screen-title">Terms</h1>
        <p>Deku hosts community calendars for small public gatherings. These terms set out what the service does and what we ask of the people who use it.</p>
        <h2>Accounts</h2>
        <p>Signing up creates a guest account. A guest can browse published events, register for them, hold a ticket and cancel a registration. Host accounts are granted by us and own calendars.</p>
        <h2>Events</h2>
        <p>A host publishes an event on a calendar it owns. Publishing an event makes it reachable at its own short address. Cancelling an event needs a reason, which is sent to every guest still holding a place, word for word.</p>
        <h2>Registrations</h2>
        <p>A registration holds at most one seat per event per account. Seats are limited by capacity and enforced by the database, so two people taking the last seat at the same instant produce one seat and one waiting-list place.</p>
        <h2>Mail</h2>
        <p>Every outcome of a registration reaches the guest by email from the request that caused it. We send no other mail.</p>
        <h2>Contact</h2>
        <p>Write to the host of the event through the address on its page. Write to us through the address on this one.</p>
        <p><a routerLink="/" class="link">Return Home</a></p>
      </main>
    </div>
  `,
  styles: [
    `
    .page { min-height: 100vh; padding-top: 64px; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 24px 80px; }
    .wrap p { color: var(--ink-2); }
  `],
})
export class LegalComponent {}

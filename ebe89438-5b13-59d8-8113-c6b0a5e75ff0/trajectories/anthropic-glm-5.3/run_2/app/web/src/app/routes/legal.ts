import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';

@Component({
  selector: 'cc-legal',
  standalone: true,
  imports: [PublicBar, RouterLink],
  template: `
  <cc-public-bar></cc-public-bar>
  <main class="container page prose">
    <h1 class="h1-display title">Terms</h1>
    <p>Community Calendar is a hosting tool for small public gatherings. Hosts publish events;
    guests reserve seats and hold tickets. There are no prices and no payments anywhere in the
    product, so there is nothing to refund and nothing to dispute.</p>
    <h2>Accounts</h2>
    <p>Signing up creates a guest account. Host accounts are seeded by the operator. You are
    responsible for keeping your password to yourself; we store it hashed and never read it back.</p>
    <h2>Events and seats</h2>
    <p>A seat is a promise held in the database, not in anybody's memory. When an event fills, the
    next guest in line takes a waiting-list place. Cancelling your seat hands it to the head of the
    waiting list at once.</p>
    <h2>Mail</h2>
    <p>Every registration outcome reaches you by mail, from the request that caused it. Cancelling
    your own registration sends nothing.</p>
    <h2>Contact</h2>
    <p>Write to the host of the event you are registered for. Their address is on the event page.</p>
  </main>`,
  styles: [`
    .page { padding-top: 120px; min-height: 100vh; max-width: 720px; }
    .title { font-size: 36px; margin: 0 0 24px; }
  `],
})
export class Legal {}

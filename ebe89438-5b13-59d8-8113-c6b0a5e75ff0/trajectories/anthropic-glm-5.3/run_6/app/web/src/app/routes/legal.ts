import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBarComponent } from '../public-bar';

@Component({
  selector: 'route-legal', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBarComponent],
  template: `
    <public-bar></public-bar>
    <main id="main" class="content-frame page">
      <article class="prose">
        <h1 class="t-display">Terms and Privacy</h1>
        <h2 class="t-h-long">What this is</h2>
        <p class="t-para">Community Calendar is a place to publish small public gatherings and collect guests. A host owns a calendar, publishes events on it, and works the guest list. A guest browses published events, registers, holds a ticket, and cancels their own registration.</p>
        <h2 class="t-h-long">What we do not do</h2>
        <p class="t-para">There are no prices and no payments. There is no messaging, no recurring series, and no map. Mail is sent for registration outcomes and event cancellations only, from the request that causes them.</p>
        <h2 class="t-h-long">Your account</h2>
        <p class="t-para">You sign in with an email address and a password. The password is stored hashed. A bearer token keeps you signed in on this device; signing out withdraws it.</p>
        <h2 class="t-h-long">Conduct</h2>
        <p class="t-para">Hosts may cancel an event with a reason, which every guest still holding a place receives word for word. Guests who cannot come should cancel, because the seat passes to the next person on the waiting list at once.</p>
        <p class="t-para"><a routerLink="/" class="link">Return Home</a></p>
      </article>
    </main>
  `,
  styles: [`
    .page{max-width:640px;margin:0 auto;padding-top:64px}
    .prose{display:flex;flex-direction:column;gap:16px;padding:32px 0}
    .prose h1{font-size:32px;line-height:38px}
  `],
})
export class LegalComponent { }

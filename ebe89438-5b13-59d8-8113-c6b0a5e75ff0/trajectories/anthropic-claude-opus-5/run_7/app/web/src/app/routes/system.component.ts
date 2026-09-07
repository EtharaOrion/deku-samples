import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TopBarComponent } from '../shared/top-bar.component';
import { BrandComponent } from '../shared/ui.components';

/**
 * The same page answers a route that never existed and a route the visitor may
 * not see, because wording that differed would confirm a private event exists.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main id="main" class="wrap" role="main">
      <h1 class="code display">404 · Page Not Found</h1>
      <p class="body secondary">
        Looks like you discovered a page that doesn't exist or you don't have access to.
      </p>
      <a routerLink="/" class="btn btn-primary">Return Home</a>
    </main>
  `,
  styles: [`
    .wrap {
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: var(--s4);
      padding: 96px var(--s5) var(--s8); text-align: center;
    }
    .code { font-size: 32px; line-height: 40px; }
    .body { max-width: 420px; }
  `],
})
export class NotFoundComponent {}

/** The one route where the lockup is tinted pink. */
@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="wrap" role="main">
      <div class="lock"><app-brand [size]="22" tint="#f31a7c" /></div>
      <h1 class="display">Account Suspended</h1>
      <p class="body secondary">
        This user account is suspended for violating our terms of service.
      </p>
    </main>
  `,
  styles: [`
    .wrap {
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: var(--s4);
      padding: var(--s8) var(--s5); text-align: center;
    }
    h1 { font-size: 32px; line-height: 40px; }
    .body { max-width: 420px; }
    .lock :global(a:hover) { color: #d5176d; }
  `],
})
export class SuspendedComponent {}

/** A long-form legal route renders the same chrome around plain prose. */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main id="main" class="container prose" role="main">
      <h1 class="display">Terms of Service</h1>
      <h2 class="longform-heading">Using Deku Events</h2>
      <p class="longform">
        Deku Events hosts calendars for small public gatherings. Anyone may browse
        published events and register for a seat. Hosts keep calendars and are
        responsible for the events they publish on them.
      </p>
      <h2 class="longform-heading">Registrations and seats</h2>
      <p class="longform">
        A seat is held only while a registration is confirmed. Cancelling a
        registration returns the seat to the event, and the first person waiting
        takes it. Events here are free: there are no prices, payments or refunds.
      </p>
      <h2 class="longform-heading">Conduct</h2>
      <p class="longform">
        Accounts that misrepresent an event or the person running it may be
        suspended. A suspended account keeps its address but can no longer sign in.
      </p>
    </main>
  `,
  styles: [`
    .prose { padding: 112px var(--s5) var(--s8); max-width: 640px; }
    h1 { font-size: 32px; line-height: 40px; margin-bottom: var(--s5); }
    h2 { margin-top: var(--s5); margin-bottom: var(--s2); }
    p { color: var(--ink-secondary); }
  `],
})
export class LegalComponent {}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { PublicBarComponent } from '../layout/public-bar.component';
import { LockupComponent, ScanCodeComponent } from '../shared/ui';
import { CoverComponent } from '../shared/cover.component';

/**
 * The same page answers a route that never existed and a route the visitor may
 * not see, because wording that differed would confirm a private event exists.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, PublicBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <main class="system">
      <h1 class="code">404 &middot; Page Not Found</h1>
      <p class="body t-longform">
        Looks like you discovered a page that doesn&rsquo;t exist or you don&rsquo;t have access to.
      </p>
      <a routerLink="/" class="btn btn-primary btn-pill">Return Home</a>
    </main>
  `,
  styles: [SYSTEM_STYLES()],
})
export class NotFoundComponent {}

@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [LockupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="system">
      <app-lockup [size]="24" [tinted]="true" />
      <h1 class="code suspended-title">Account Suspended</h1>
      <p class="body t-longform">This user account is suspended for violating our terms of service.</p>
    </main>
  `,
  styles: [SYSTEM_STYLES()],
})
export class SuspendedComponent {}

/**
 * The get-the-app page: a scan code generated at render time from the address
 * it points at, plus four decorative stickers at slight angles.
 */
@Component({
  selector: 'app-get-the-app',
  standalone: true,
  imports: [PublicBarComponent, ScanCodeComponent, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <main class="system app-page">
      <div class="stickers" aria-hidden="true">
        @for (sticker of stickers; track sticker.seed) {
          <div class="sticker" [style.transform]="'rotate(' + sticker.angle + 'deg)'">
            <app-cover [seed]="sticker.seed" [size]="88" [showTitle]="false" />
          </div>
        }
      </div>

      <h1 class="code">Get the App</h1>
      <p class="body t-longform">
        Point a camera at this code to open Deku on your phone. Everything here works in the browser, so there is
        nothing to install.
      </p>

      <div class="scan">
        <app-scan-code [value]="address" [size]="230" />
      </div>
      <p class="t-caption address">{{ address }}</p>
    </main>
  `,
  styles: [
    SYSTEM_STYLES() +
      `
      .app-page { position: relative; overflow: hidden; }

      .scan {
        margin-top: 8px;
        padding: 16px;
        border-radius: var(--r-card-lg);
        background: var(--paper);
        box-shadow: var(--elev-card);
      }

      .address { color: var(--muted); word-break: break-all; }

      .stickers {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: -1;
      }

      .sticker { position: absolute; }
      .sticker:nth-child(1) { top: 12%; left: 8%; }
      .sticker:nth-child(2) { top: 22%; right: 10%; }
      .sticker:nth-child(3) { bottom: 18%; left: 14%; }
      .sticker:nth-child(4) { bottom: 12%; right: 12%; }

      @media (max-width: 649px) { .stickers { display: none; } }
    `,
  ],
})
export class GetTheAppComponent {
  private doc = inject(DOCUMENT);

  readonly stickers = [
    { seed: 'sticker-one', angle: -8 },
    { seed: 'sticker-two', angle: 6 },
    { seed: 'sticker-three', angle: 4 },
    { seed: 'sticker-four', angle: -5 },
  ];

  /** Read from the address the page is actually served at; never hardcoded. */
  get address() {
    return this.doc.defaultView?.location.origin ?? '/';
  }
}

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [PublicBarComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <main class="legal">
      <div class="page">
        <h1 class="t-serif">Terms of Use</h1>

        <h2 class="t-longform-heading">Using Deku</h2>
        <p class="t-longform">
          Deku hosts calendars for small public gatherings. Events are free to attend and free to publish. A host is
          responsible for the gathering they run and for the words they publish about it.
        </p>

        <h2 class="t-longform-heading">Your account</h2>
        <p class="t-longform">
          An account is yours alone. Signing up creates a guest account, which can browse events, register for them and
          hold tickets. Host accounts keep calendars and publish events on them.
        </p>

        <h2 class="t-longform-heading">Registrations and tickets</h2>
        <p class="t-longform">
          A registration reserves one seat at one event. A ticket code is the credential at the door, so treat it as you
          would a paper ticket. Cancelling a registration frees the seat for whoever is next on the waiting list.
        </p>

        <h2 class="t-longform-heading">Email</h2>
        <p class="t-longform">
          We write to you when something about your registration changes: a seat confirmed, a place on a waiting list, a
          host's decision, or an event called off. We do not sell your address.
        </p>

        <a routerLink="/" class="btn btn-pill back">Return Home</a>
      </div>
    </main>
  `,
  styles: [
    `
      .legal { padding: 112px 0 96px; min-height: 100vh; }
      h1 { font-size: 36px; line-height: 44px; margin-bottom: 24px; }
      h2 { margin-top: 32px; }
      p { color: var(--ink-64); margin-top: 8px; max-width: 640px; }
      .back { margin-top: 40px; }
    `,
  ],
})
export class LegalComponent {}

function SYSTEM_STYLES() {
  return `
    .system {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 96px 24px;
      text-align: center;
    }

    .code {
      font-family: var(--serif);
      font-weight: 400;
      font-size: 32px;
      line-height: 40px;
    }

    .suspended-title { font-size: 28px; }

    .body {
      color: var(--ink-64);
      max-width: 480px;
    }
  `;
}

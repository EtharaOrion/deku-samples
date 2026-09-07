import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiRefusal } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { LockupComponent } from '../shared/ui';

/**
 * One centred card of 400px on the paper ground, radius 24px. A next parameter
 * survives the round trip and is where a successful sign-in lands; without one
 * a guest lands on /home and a host on /calendars.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule, LockupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="auth">
      <div class="card-lg auth-card" [class.shake]="shaking()">
        <app-lockup [size]="22" />
        <h1 class="t-serif">Welcome back</h1>

        <form (submit)="submit($event)" novalidate>
          <div class="field" [class.is-refused]="refusalField() === 'email'">
            <label for="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              [(ngModel)]="email"
              [attr.aria-describedby]="refusal() ? 'auth-refusal' : null"
            />
          </div>

          <div class="field" [class.is-refused]="refusalField() === 'password'">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              [attr.aria-describedby]="refusal() ? 'auth-refusal' : null"
            />
          </div>

          <!-- A refused sign-in answers under the fields with a sentence naming
               what to do next. -->
          @if (refusal()) {
            <p id="auth-refusal" class="refusal-line" role="alert">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn-primary btn-pill submit" [disabled]="working()">
            @if (working()) {
              <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" fill="none" stroke-width="6" /></svg>
            }
            Sign In
          </button>
        </form>

        <a [routerLink]="'/signup'" [queryParams]="{ next: next() }" class="switch">
          New here? Create an account
        </a>
      </div>
    </main>
  `,
  styles: [AUTH_STYLES()],
})
export class LoginComponent implements OnInit {
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusalField = signal<string | null>(null);
  readonly shaking = signal(false);
  readonly next = signal<string | null>(null);

  ngOnInit() {
    this.route.queryParamMap.subscribe((p) => this.next.set(p.get('next')));
  }

  async submit(event: Event) {
    event.preventDefault();
    this.refusal.set('');
    this.refusalField.set(null);
    this.working.set(true);
    try {
      const account = await this.session.signIn(this.email.trim(), this.password);
      await this.router.navigateByUrl(this.session.landingFor(account, this.next()));
    } catch (err) {
      const refusal = err as ApiRefusal;
      this.refusal.set(refusal.message);
      this.refusalField.set(refusal.field ?? null);
      // The fields keep what was typed except the password.
      this.password = '';
      this.shake();
    } finally {
      this.working.set(false);
    }
  }

  private shake() {
    this.shaking.set(true);
    setTimeout(() => this.shaking.set(false), 420);
  }
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [RouterLink, FormsModule, LockupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="auth">
      <div class="card-lg auth-card" [class.shake]="shaking()">
        <app-lockup [size]="22" />
        <h1 class="t-serif">Create your account</h1>

        <form (submit)="submit($event)" novalidate>
          <div class="field" [class.is-refused]="refusalField() === 'name'">
            <label for="name">Name</label>
            <input id="name" name="name" type="text" autocomplete="name" [(ngModel)]="name" />
          </div>

          <div class="field" [class.is-refused]="refusalField() === 'email'">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" [(ngModel)]="email" />
          </div>

          <div class="field" [class.is-refused]="refusalField() === 'password'">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="new-password"
              [(ngModel)]="password"
            />
            <span class="caption">At least 8 characters.</span>
          </div>

          @if (refusal()) {
            <p id="auth-refusal" class="refusal-line" role="alert">{{ refusal() }}</p>
          }

          <p class="caption guest-note">A new account is a guest account.</p>

          <button type="submit" class="btn btn-primary btn-pill submit" [disabled]="working()">
            @if (working()) {
              <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" fill="none" stroke-width="6" /></svg>
            }
            Create Account
          </button>
        </form>

        <a [routerLink]="'/login'" [queryParams]="{ next: next() }" class="switch">
          Already have an account? Sign in
        </a>
      </div>
    </main>
  `,
  styles: [AUTH_STYLES()],
})
export class SignupComponent implements OnInit {
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = '';
  email = '';
  password = '';
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusalField = signal<string | null>(null);
  readonly shaking = signal(false);
  readonly next = signal<string | null>(null);

  ngOnInit() {
    this.route.queryParamMap.subscribe((p) => this.next.set(p.get('next')));
  }

  async submit(event: Event) {
    event.preventDefault();
    this.refusal.set('');
    this.refusalField.set(null);

    if (!this.name.trim()) {
      this.refusal.set('Add your name so hosts know who is coming.');
      this.refusalField.set('name');
      this.shake();
      return;
    }

    this.working.set(true);
    try {
      const account = await this.session.signUp(this.name.trim(), this.email.trim(), this.password);
      await this.router.navigateByUrl(this.session.landingFor(account, this.next()));
    } catch (err) {
      const refusal = err as ApiRefusal;
      this.refusal.set(refusal.message);
      this.refusalField.set(refusal.field ?? null);
      this.password = '';
      this.shake();
    } finally {
      this.working.set(false);
    }
  }

  private shake() {
    this.shaking.set(true);
    setTimeout(() => this.shaking.set(false), 420);
  }
}

function AUTH_STYLES() {
  return `
    .auth {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 16px;
      background: var(--paper);
    }

    .auth-card {
      width: 400px;
      max-width: 100%;
      background: var(--paper);
      padding: 32px;
      box-shadow: var(--elev-fine), var(--ring-onboarding);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .auth-card.shake { animation: shake 0.4s var(--ease); }

    h1 { font-size: 26px; line-height: 32px; }

    form { display: flex; flex-direction: column; gap: 16px; }

    .submit { width: 100%; margin-top: 4px; }

    .refusal-line {
      color: var(--danger);
      font-size: 13px;
      line-height: 18px;
    }

    .guest-note { color: var(--muted); }

    .switch {
      color: var(--ink-64);
      font-size: 14px;
      text-align: center;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (hover: hover) {
      .switch:hover { color: var(--ink); }
    }
  `;
}

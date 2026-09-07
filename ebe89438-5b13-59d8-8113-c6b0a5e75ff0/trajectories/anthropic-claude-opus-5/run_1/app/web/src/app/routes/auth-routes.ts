import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import type { Refusal } from '../core/models';
import { Brand } from '../ui/icons';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Brand],
  template: `
    <main id="main" class="auth-wrap">
      <div class="card card-lg auth-card" [class.shake]="shaking()">
        <app-brand [size]="20" />
        <h1 class="t-serif auth-title">Welcome back</h1>
        <form (ngSubmit)="submit()">
          <label class="field">
            <span class="field-label">Email</span>
            <input
              class="field-control"
              type="email"
              name="email"
              autocomplete="email"
              [(ngModel)]="email"
              [attr.aria-invalid]="refusal() ? 'true' : null"
              [attr.aria-describedby]="refusal() ? 'login-refusal' : null"
              required
            />
          </label>
          <label class="field">
            <span class="field-label">Password</span>
            <input
              class="field-control"
              type="password"
              name="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              [attr.aria-invalid]="refusal() ? 'true' : null"
              [attr.aria-describedby]="refusal() ? 'login-refusal' : null"
              required
            />
          </label>
          @if (refusal()) {
            <p class="field-refusal" id="login-refusal">{{ refusal() }}</p>
          }
          <button class="btn btn-primary btn-block" type="submit" [disabled]="busy()">
            @if (busy()) {
              <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="30" fill="none" stroke-width="6" /></svg>
            }
            Sign In
          </button>
        </form>
        <p class="t-caption auth-alt">
          New here? <a [routerLink]="['/signup']" [queryParams]="{ next: next() }">Create an account</a>
        </p>
      </div>
    </main>
  `,
  styles: [
    `
      .auth-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s5);
        background: var(--paper);
      }
      .auth-card {
        width: 100%;
        max-width: 400px;
        padding: var(--s6) var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
      .auth-title {
        font-size: 26px;
        line-height: 32px;
      }
      form {
        margin-top: var(--s2);
      }
      .auth-alt {
        color: var(--ink-secondary);
        text-align: center;
      }
    `,
  ],
})
export class LoginRoute {
  private auth = inject(Auth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly shaking = signal(false);
  readonly next = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap.subscribe((p) => this.next.set(p.get('next')));
    if (this.auth.signedIn()) this.land();
  }

  submit() {
    if (this.busy()) return;
    this.refusal.set(null);
    this.busy.set(true);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.land();
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        // the fields keep what was typed except the password
        this.password = '';
        this.refusal.set(e.message);
        this.shake();
      },
    });
  }

  private shake() {
    this.shaking.set(true);
    setTimeout(() => this.shaking.set(false), 450);
  }

  private land() {
    this.router.navigateByUrl(this.next() || this.auth.landingRoute());
  }
}

@Component({
  selector: 'app-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Brand],
  template: `
    <main id="main" class="auth-wrap">
      <div class="card card-lg auth-card" [class.shake]="shaking()">
        <app-brand [size]="20" />
        <h1 class="t-serif auth-title">Create an account</h1>
        <form (ngSubmit)="submit()">
          <label class="field">
            <span class="field-label">Name</span>
            <input class="field-control" type="text" name="name" autocomplete="name" [(ngModel)]="name" required />
          </label>
          <label class="field">
            <span class="field-label">Email</span>
            <input class="field-control" type="email" name="email" autocomplete="email" [(ngModel)]="email" required />
          </label>
          <label class="field">
            <span class="field-label">Password</span>
            <input
              class="field-control"
              type="password"
              name="password"
              autocomplete="new-password"
              [(ngModel)]="password"
              [attr.aria-describedby]="'signup-note'"
              required
            />
            <span class="field-caption" id="signup-note">A new account is a guest account.</span>
          </label>
          @if (refusal()) {
            <p class="field-refusal">{{ refusal() }}</p>
          }
          <button class="btn btn-primary btn-block" type="submit" [disabled]="busy()">
            @if (busy()) {
              <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="30" fill="none" stroke-width="6" /></svg>
            }
            Create Account
          </button>
        </form>
        <p class="t-caption auth-alt">
          Already have one? <a [routerLink]="['/login']" [queryParams]="{ next: next() }">Sign in</a>
        </p>
      </div>
    </main>
  `,
  styles: [
    `
      .auth-wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s5);
        background: var(--paper);
      }
      .auth-card {
        width: 100%;
        max-width: 400px;
        padding: var(--s6) var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
      .auth-title {
        font-size: 26px;
        line-height: 32px;
      }
      form {
        margin-top: var(--s2);
      }
      .auth-alt {
        color: var(--ink-secondary);
        text-align: center;
      }
    `,
  ],
})
export class SignupRoute {
  private auth = inject(Auth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = '';
  email = '';
  password = '';
  readonly busy = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly shaking = signal(false);
  readonly next = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap.subscribe((p) => this.next.set(p.get('next')));
  }

  submit() {
    if (this.busy()) return;
    this.refusal.set(null);
    this.busy.set(true);
    this.auth.signup(this.name.trim(), this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.router.navigateByUrl(this.next() || '/home');
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        this.password = '';
        this.refusal.set(e.message);
        this.shaking.set(true);
        setTimeout(() => this.shaking.set(false), 450);
      },
    });
  }
}

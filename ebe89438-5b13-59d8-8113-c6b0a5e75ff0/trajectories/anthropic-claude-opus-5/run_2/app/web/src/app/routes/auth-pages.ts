import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, ApiError } from '../core/api';
import { ThemeService } from '../core/theme';
import { BrandComponent } from '../ui/kit';

/** Where a successful sign-in lands: `next`, else /home for a guest, /calendars for a host. */
function landing(role: string, next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return role === 'host' ? '/calendars' : '/home';
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap" id="main">
      <div class="card card-lg" [class.shake]="shaking()">
        <app-brand [size]="20"></app-brand>
        <h1 class="title display">Sign in</h1>

        <form (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label class="field-label" for="email">Email</label>
            <input
              id="email"
              name="email"
              class="field-input"
              type="email"
              autocomplete="email"
              [(ngModel)]="email"
              [attr.aria-invalid]="refusal() ? 'true' : null"
              [attr.aria-describedby]="refusal() ? 'login-refusal' : null"
              required
            />
          </div>

          <div class="field">
            <label class="field-label" for="password">Password</label>
            <input
              id="password"
              name="password"
              class="field-input"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              [attr.aria-invalid]="refusal() ? 'true' : null"
              [attr.aria-describedby]="refusal() ? 'login-refusal' : null"
              required
            />
          </div>

          @if (refusal()) {
            <p class="field-refusal" id="login-refusal">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn-primary submit" [disabled]="working()">
            {{ working() ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>

        <p class="alt">
          New here?
          <a [routerLink]="'/signup'" [queryParams]="{ next: next() }">Create an account</a>
        </p>
      </div>
    </main>
  `,
  styles: [authCardStyles()],
})
export class LoginComponent {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private theme = inject(ThemeService);

  email = '';
  password = '';
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly shaking = signal(false);

  constructor() {
    this.theme.clear();
  }

  next() {
    return this.route.snapshot.queryParamMap.get('next');
  }

  async submit() {
    this.refusal.set('');
    this.working.set(true);
    try {
      const account = await this.api.login(this.email.trim(), this.password);
      this.router.navigateByUrl(landing(account.role, this.next()));
    } catch (err) {
      // The fields keep what was typed except the password.
      this.password = '';
      this.refusal.set(
        err instanceof ApiError
          ? err.message
          : 'That did not work. Check the address and try again.',
      );
      this.shaking.set(true);
      setTimeout(() => this.shaking.set(false), 450);
    } finally {
      this.working.set(false);
    }
  }
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap" id="main">
      <div class="card card-lg" [class.shake]="shaking()">
        <app-brand [size]="20"></app-brand>
        <h1 class="title display">Create an account</h1>

        <form (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label class="field-label" for="name">Name</label>
            <input
              id="name"
              name="name"
              class="field-input"
              type="text"
              autocomplete="name"
              [(ngModel)]="name"
              [attr.aria-invalid]="field() === 'name' ? 'true' : null"
              [attr.aria-describedby]="refusal() ? 'signup-refusal' : null"
              required
            />
          </div>

          <div class="field">
            <label class="field-label" for="email">Email</label>
            <input
              id="email"
              name="email"
              class="field-input"
              type="email"
              autocomplete="email"
              [(ngModel)]="email"
              [attr.aria-invalid]="field() === 'email' ? 'true' : null"
              [attr.aria-describedby]="refusal() ? 'signup-refusal' : null"
              required
            />
          </div>

          <div class="field">
            <label class="field-label" for="password">Password</label>
            <input
              id="password"
              name="password"
              class="field-input"
              type="password"
              autocomplete="new-password"
              [(ngModel)]="password"
              [attr.aria-invalid]="field() === 'password' ? 'true' : null"
              [attr.aria-describedby]="refusal() ? 'signup-refusal' : null"
              required
            />
            <span class="field-caption">A new account is a guest account.</span>
          </div>

          @if (refusal()) {
            <p class="field-refusal" id="signup-refusal">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn-primary submit" [disabled]="working()">
            {{ working() ? 'Creating…' : 'Create Account' }}
          </button>
        </form>

        <p class="alt">
          Already have an account?
          <a [routerLink]="'/login'" [queryParams]="{ next: next() }">Sign in</a>
        </p>
      </div>
    </main>
  `,
  styles: [authCardStyles()],
})
export class SignupComponent {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private theme = inject(ThemeService);

  name = '';
  email = '';
  password = '';
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly field = signal<string | null>(null);
  readonly shaking = signal(false);

  constructor() {
    this.theme.clear();
  }

  next() {
    return this.route.snapshot.queryParamMap.get('next');
  }

  async submit() {
    this.refusal.set('');
    this.field.set(null);
    this.working.set(true);
    try {
      const account = await this.api.signup(
        this.name.trim(),
        this.email.trim(),
        this.password,
      );
      this.router.navigateByUrl(landing(account.role, this.next()));
    } catch (err) {
      this.password = '';
      if (err instanceof ApiError) {
        this.refusal.set(err.message);
        this.field.set(err.field);
      } else {
        this.refusal.set('That did not work. Try again in a moment.');
      }
      this.shaking.set(true);
      setTimeout(() => this.shaking.set(false), 450);
    } finally {
      this.working.set(false);
    }
  }
}

function authCardStyles(): string {
  return `
    .wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      background: var(--paper);
    }
    .card {
      width: 100%;
      max-width: 400px;
      padding: 32px;
      background: var(--paper);
      box-shadow: var(--shadow-primary);
    }
    .title {
      font-size: 22px;
      line-height: 26px;
      margin: 16px 0 24px;
    }
    .submit { width: 100%; margin-top: 8px; }
    .alt {
      margin-top: 24px;
      font-size: 13px;
      line-height: 16px;
      color: var(--ink-64);
      text-align: center;
    }
    @media (max-width: 483px) {
      .card { padding: 24px; }
    }
  `;
}

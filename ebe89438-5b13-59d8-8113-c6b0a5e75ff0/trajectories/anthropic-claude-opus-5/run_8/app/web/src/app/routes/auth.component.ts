import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, ApiError } from '../core/api.service';
import { clearTheme } from '../core/theme';
import { BrandComponent, SpinnerComponent } from '../ui/icons.component';
import { PublicBarComponent } from '../ui/public-bar.component';

@Component({
  selector: 'app-auth-card',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent, SpinnerComponent, PublicBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <div class="public-shell centre">
      <main id="main" class="card auth-card" [class.shaking]="shake()">
        <a class="lock" routerLink="/"><app-brand [size]="20" /></a>
        <h1 class="serif">{{ mode() === 'signup' ? 'Create your account' : 'Welcome back' }}</h1>

        <form (ngSubmit)="submit()" novalidate>
          @if (mode() === 'signup') {
            <div class="field" [class.invalid]="field() === 'name'">
              <label for="name">Your name</label>
              <input id="name" name="name" type="text" autocomplete="name" [(ngModel)]="name" [attr.aria-describedby]="field() === 'name' ? 'form-refusal' : null" />
            </div>
          }
          <div class="field" [class.invalid]="field() === 'email'">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" [(ngModel)]="email" [attr.aria-describedby]="field() === 'email' ? 'form-refusal' : null" />
          </div>
          <div class="field" [class.invalid]="field() === 'password'">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              [attr.autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'"
              [(ngModel)]="password"
              [attr.aria-describedby]="field() === 'password' ? 'form-refusal' : null"
            />
          </div>

          @if (refusal()) {
            <p class="refusal-line t-caption" id="form-refusal" role="alert">{{ refusal() }}</p>
          }

          @if (mode() === 'signup') {
            <p class="caption t-caption">A new account is a guest account. Hosts are seeded by the organisers.</p>
          }

          <button class="btn btn-primary btn-block" type="submit" [disabled]="working()">
            @if (working()) {
              <app-spinner [size]="18" />
            }
            {{ mode() === 'signup' ? 'Create Account' : 'Sign In' }}
          </button>
        </form>

        @if (mode() === 'signup') {
          <a class="switch t-caption" [routerLink]="['/login']" [queryParams]="{ next: nextParam() }">Already have an account? Sign in</a>
        } @else {
          <a class="switch t-caption" [routerLink]="['/signup']" [queryParams]="{ next: nextParam() }">New here? Create an account</a>
        }
      </main>
    </div>
  `,
  styles: [
    `
      .centre {
        align-items: center;
        justify-content: center;
        padding: var(--s5);
      }
      .auth-card {
        width: 400px;
        max-width: 100%;
        border-radius: var(--r-card-lg);
        padding: var(--s6);
        box-shadow: var(--elev-card), var(--ring-card);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }
      .shaking {
        animation: shake 0.3s var(--ease);
      }
      .lock {
        display: inline-flex;
        align-self: flex-start;
      }
      h1 {
        font-size: 26px;
        line-height: 32px;
        font-weight: 400;
      }
      form {
        display: block;
      }
      .refusal-line {
        color: var(--danger);
        font-weight: 500;
        margin-bottom: var(--s3);
      }
      .caption {
        color: var(--muted);
        margin-bottom: var(--s3);
      }
      .switch {
        color: var(--blue);
        align-self: flex-start;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
      }
    `,
  ],
})
export class AuthCardComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly mode = input.required<'login' | 'signup'>();
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly field = signal<string | null>(null);
  readonly shake = signal(false);

  name = '';
  email = '';
  password = '';

  nextParam(): string | null {
    return this.route.snapshot.queryParamMap.get('next');
  }

  ngOnInit(): void {
    clearTheme();
    if (!this.api.bootstrapped()) void this.api.loadMe();
  }

  private refuse(message: string, field: string | null) {
    this.refusal.set(message);
    this.field.set(field);
    this.password = '';
    this.shake.set(true);
    setTimeout(() => this.shake.set(false), 320);
  }

  async submit() {
    if (this.working()) return;
    this.refusal.set('');
    this.field.set(null);

    if (!this.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.refuse('Enter a valid email address.', 'email');
      return;
    }
    if (this.mode() === 'signup' && this.name.trim().length < 2) {
      this.refuse('Add your name so hosts know who is coming.', 'name');
      return;
    }
    if (!this.password) {
      this.refuse('Enter your password to continue.', 'password');
      return;
    }

    this.working.set(true);
    try {
      const acc =
        this.mode() === 'signup'
          ? await this.api.signup(this.name.trim(), this.email.trim(), this.password)
          : await this.api.login(this.email.trim(), this.password);
      const next = this.nextParam();
      const fallback = acc.role === 'host' ? '/calendars' : '/home';
      await this.router.navigateByUrl(next && next.startsWith('/') ? next : fallback);
    } catch (e) {
      const err = e as ApiError;
      this.refuse(err.message ?? 'That did not go through. Check the details and try again.', err.field ?? null);
    } finally {
      this.working.set(false);
    }
  }
}

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [AuthCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-auth-card mode="login" />`,
})
export class SignInComponent {}

@Component({
  selector: 'app-sign-up',
  standalone: true,
  imports: [AuthCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-auth-card mode="signup" />`,
})
export class SignUpComponent {}

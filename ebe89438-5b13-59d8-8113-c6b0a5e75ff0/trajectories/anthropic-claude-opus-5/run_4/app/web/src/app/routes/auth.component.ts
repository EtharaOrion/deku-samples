import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { BrandComponent } from '../ui/brand.component';

/**
 * One centred card of 400px on the paper ground at radius 24px. A next
 * parameter survives the round trip and is where a successful sign-in lands;
 * without one a guest lands on /home and a host on /calendars. A refused
 * sign-in answers under the fields, the fields keep what was typed except the
 * password, and the card answers with the shake.
 */
@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page" id="main">
      <div class="card-auth" [class.shake]="shakeOn()">
        <app-brand />
        <h1 class="t-screen-title">{{ mode() === 'signup' ? 'Create your account' : 'Welcome back' }}</h1>

        <form (ngSubmit)="submit()" novalidate>
          @if (mode() === 'signup') {
            <div class="field" [class.invalid]="fieldOf('name')">
              <label for="name">Your name</label>
              <input
                id="name"
                name="name"
                autocomplete="name"
                [(ngModel)]="name"
                [attr.aria-describedby]="fieldOf('name') ? 'refusal' : null"
              />
            </div>
          }

          <div class="field" [class.invalid]="fieldOf('email')">
            <label for="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              [(ngModel)]="email"
              [attr.aria-describedby]="fieldOf('email') ? 'refusal' : null"
            />
          </div>

          <div class="field" [class.invalid]="fieldOf('password')">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              [autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'"
              [(ngModel)]="password"
              [attr.aria-describedby]="fieldOf('password') ? 'refusal' : null"
            />
          </div>

          @if (mode() === 'signup') {
            <p class="t-caption note">A new account is a guest account. Hosting is by invitation.</p>
          }

          @if (refusal()) {
            <p class="refusal" id="refusal" role="alert">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn-primary btn-pill full" [disabled]="working()">
            @if (working()) {
              <svg class="spinner" viewBox="0 0 66 66" aria-hidden="true">
                <circle fill="none" stroke-width="6" stroke-linecap="round" cx="33" cy="33" r="30" />
              </svg>
            }
            <span>{{ mode() === 'signup' ? 'Create Account' : 'Sign In' }}</span>
          </button>
        </form>

        @if (mode() === 'signup') {
          <a class="alt" [routerLink]="['/login']" [queryParams]="{ next: next() }">Already have an account? Sign in</a>
        } @else {
          <a class="alt" [routerLink]="['/signup']" [queryParams]="{ next: next() }">New here? Create an account</a>
        }
      </div>
    </main>
  `,
  styles: [
    `
      .page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s7) var(--s4);
        background: var(--paper);
      }
      .card-auth {
        width: 100%;
        max-width: 400px;
        background: var(--paper);
        border-radius: var(--r-card-lg);
        padding: var(--s6);
        box-shadow: var(--elev-card), var(--ring-card);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }
      h1 {
        font-family: var(--serif);
        font-weight: 400;
      }
      form {
        display: block;
      }
      .full {
        width: 100%;
      }
      .note {
        color: var(--muted);
        margin-bottom: var(--s3);
      }
      .refusal {
        margin-bottom: var(--s3);
      }
      .alt {
        color: var(--ink-64);
        font-size: 14px;
        line-height: 21px;
        text-align: center;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      @media (hover: hover) {
        .alt:hover {
          color: var(--ink);
        }
      }
    `,
  ],
})
export class AuthComponent {
  mode = input.required<'login' | 'signup'>();

  private api = inject(ApiService);
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = '';
  email = '';
  password = '';

  readonly refusal = signal('');
  readonly refusedField = signal('');
  readonly working = signal(false);
  readonly shakeOn = signal(false);

  readonly next = computed(() => this.route.snapshot.queryParamMap.get('next') ?? '');

  fieldOf(name: string): boolean {
    return this.refusedField() === name;
  }

  async submit() {
    if (this.working()) return;
    this.refusal.set('');
    this.refusedField.set('');
    this.working.set(true);
    try {
      const account =
        this.mode() === 'signup'
          ? await this.api.signup(this.name.trim(), this.email.trim(), this.password)
          : (await this.api.login(this.email.trim(), this.password)).account;
      this.session.setAccount(account);
      const target = this.next() || (account.role === 'host' ? '/calendars' : '/home');
      await this.router.navigateByUrl(target);
    } catch (err) {
      const e = err as ApiError;
      this.password = '';
      this.refusal.set(e.message ?? 'That did not go through. Check the details and try again.');
      this.refusedField.set(e.field ?? '');
      this.shakeOn.set(false);
      setTimeout(() => this.shakeOn.set(true));
      setTimeout(() => this.shakeOn.set(false), 500);
    } finally {
      this.working.set(false);
    }
  }
}

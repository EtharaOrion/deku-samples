import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { ApiFailure } from '../core/api.service';
import { BrandComponent } from '../ui/brand.component';
import { SpinnerComponent } from '../ui/bits';

/**
 * One centred card of 400px on the paper ground at radius 24px, carrying the
 * lockup, an h1, the fields, one primary action and one text link to the other
 * route. A next parameter survives the round trip. A refused sign-in answers
 * under the fields with a sentence naming what to do next, the fields keep what
 * was typed except the password, and the card answers with the shake.
 */
@Component({
  selector: 'app-auth-card',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="wrap">
      <section class="card card--lg panel" [class.panel--refused]="shakeKey()">
        <a routerLink="/" class="panel__brand" aria-label="Deku, go to the landing page">
          <app-brand [markSize]="22" [wordSize]="22" />
        </a>
        <h1 class="panel__head">{{ mode() === 'signup' ? 'Create your account' : 'Sign in' }}</h1>

        <form class="panel__form" (ngSubmit)="submit()" novalidate>
          @if (mode() === 'signup') {
            <div class="field" [class.field--refused]="field() === 'name'">
              <label class="field__label" for="auth-name">Your name</label>
              <input
                id="auth-name"
                class="input"
                name="name"
                autocomplete="name"
                [(ngModel)]="name"
                [attr.aria-describedby]="field() === 'name' ? 'auth-refusal' : null"
                [attr.aria-invalid]="field() === 'name' ? 'true' : null"
              />
            </div>
          }

          <div class="field" [class.field--refused]="field() === 'email'">
            <label class="field__label" for="auth-email">Email</label>
            <input
              id="auth-email"
              class="input"
              type="email"
              name="email"
              autocomplete="email"
              [(ngModel)]="email"
              [attr.aria-describedby]="field() === 'email' ? 'auth-refusal' : null"
              [attr.aria-invalid]="field() === 'email' ? 'true' : null"
            />
          </div>

          <div class="field" [class.field--refused]="field() === 'password'">
            <label class="field__label" for="auth-password">Password</label>
            <input
              id="auth-password"
              class="input"
              type="password"
              name="password"
              [attr.autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'"
              [(ngModel)]="password"
              [attr.aria-describedby]="field() === 'password' ? 'auth-refusal' : null"
              [attr.aria-invalid]="field() === 'password' ? 'true' : null"
            />
          </div>

          @if (mode() === 'signup') {
            <p class="t-caption panel__caption">A new account is a guest account.</p>
          }

          @if (refusal()) {
            <p class="field__refusal" id="auth-refusal" role="alert">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn--primary btn--block" [disabled]="working()">
            @if (working()) {
              <app-spinner />
            }
            {{ mode() === 'signup' ? 'Create Account' : 'Sign In' }}
          </button>
        </form>

        @if (mode() === 'signup') {
          <a class="panel__swap t-caption" [routerLink]="'/login'" [queryParams]="carry()"
            >Already have an account? Sign in</a
          >
        } @else {
          <a class="panel__swap t-caption" [routerLink]="'/signup'" [queryParams]="carry()"
            >New here? Create an account</a
          >
        }
      </section>
    </main>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s7) var(--s4);
        background: var(--paper);
      }
      .panel {
        width: 100%;
        max-width: 400px;
        padding: var(--s6) var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
        align-items: stretch;
      }
      .panel--refused { animation: shake 0.4s var(--ease); }
      .panel__brand { align-self: center; color: var(--ink); }
      .panel__head {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 28px;
        line-height: 34px;
        text-align: center;
      }
      .panel__form { display: flex; flex-direction: column; gap: var(--s3); }
      .panel__caption { color: var(--muted); }
      .panel__swap { text-align: center; color: var(--ink-64); }
      @media (hover: hover) {
        .panel__swap:hover { color: var(--blue); }
      }
    `,
  ],
})
export class AuthCard implements OnInit {
  readonly mode = input.required<'login' | 'signup'>();

  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private theme = inject(ThemeService);

  name = '';
  email = '';
  password = '';

  readonly working = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly field = signal<string | null>(null);
  readonly shakeKey = signal(0);

  private next: string | null = null;

  ngOnInit(): void {
    this.theme.clear();
    this.next = this.route.snapshot.queryParamMap.get('next');
    if (this.auth.signedIn()) {
      this.router.navigateByUrl(this.auth.landingRoute(this.next));
    }
  }

  carry(): Record<string, string> {
    return this.next ? { next: this.next } : {};
  }

  submit(): void {
    if (this.working()) return;
    this.refusal.set(null);
    this.field.set(null);
    this.working.set(true);

    const call: Observable<unknown> =
      this.mode() === 'signup'
        ? this.auth.signup(this.name, this.email, this.password)
        : this.auth.login(this.email, this.password);

    call.subscribe({
      next: () => {
        this.working.set(false);
        this.router.navigateByUrl(this.auth.landingRoute(this.next));
      },
      error: (e: ApiFailure) => {
        this.working.set(false);
        // The fields keep what was typed except the password.
        this.password = '';
        this.refusal.set(e.message);
        this.field.set(e.field ?? null);
        this.shakeKey.update((v) => v + 1);
      },
    });
  }
}

@Component({
  selector: 'app-sign-in-page',
  standalone: true,
  imports: [AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-auth-card mode="login" />`,
})
export class SignInPage {}

@Component({
  selector: 'app-sign-up-page',
  standalone: true,
  imports: [AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-auth-card mode="signup" />`,
})
export class SignUpPage {}

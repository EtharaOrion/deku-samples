import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Refusal } from '../core/api.service';
import { Account } from '../models';
import { BrandComponent, SpinnerComponent } from '../shared/ui.components';
import { clearTheme } from '../core/theme';

/**
 * One centred card of 400px on the paper ground. A refused sign-in answers
 * under the fields with a sentence naming what to do next, the fields keep
 * what was typed except the password, and the card answers with the shake.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="wrap" role="main">
      <div class="card card-lg auth" [class.shake]="shaking()">
        <app-brand [size]="20" />
        <h1 class="title display">Sign in</h1>

        <form (ngSubmit)="submit()" novalidate>
          <label class="field" [class.field-invalid]="fieldIs('email')">
            <span class="field-label">Email</span>
            <input class="field-input" type="email" name="email" autocomplete="email"
                   [(ngModel)]="email" required
                   [attr.aria-describedby]="refusal() ? 'auth-refusal' : null" />
          </label>
          <label class="field" [class.field-invalid]="fieldIs('password')">
            <span class="field-label">Password</span>
            <input class="field-input" type="password" name="password" autocomplete="current-password"
                   [(ngModel)]="password" required
                   [attr.aria-describedby]="refusal() ? 'auth-refusal' : null" />
          </label>

          @if (refusal()) {
            <p class="field-refusal" id="auth-refusal" role="alert">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn-solid btn-block submit" [disabled]="working()">
            @if (working()) { <app-spinner /> }
            Sign In
          </button>
        </form>

        <p class="alt caption">
          New here? <a [routerLink]="'/signup'" [queryParams]="{ next: next() }">Create an account</a>
        </p>
      </div>
    </main>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: var(--s7) var(--s4); background: var(--paper); }
    .auth { width: 400px; max-width: 100%; padding: var(--s6); }
    .title { font-size: 28px; line-height: 34px; margin: var(--s4) 0 var(--s5); }
    .submit { margin-top: var(--s4); }
    .alt { margin-top: var(--s4); text-align: center; color: var(--ink-secondary); }
    .shake { animation: shake 0.4s var(--ease); }
  `],
})
export class LoginComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  working = signal(false);
  refusal = signal<string | null>(null);
  refusedField = signal<string | null>(null);
  shaking = signal(false);
  next = signal<string | null>(null);

  ngOnInit() {
    clearTheme();
    this.next.set(this.route.snapshot.queryParamMap.get('next'));
  }

  fieldIs(name: string) { return this.refusedField() === name; }

  submit() {
    if (this.working()) return;
    this.working.set(true);
    this.refusal.set(null);
    this.refusedField.set(null);
    this.api.login(this.email.trim(), this.password).subscribe({
      next: (acct) => {
        this.working.set(false);
        landAfterAuth(this.router, acct, this.next());
      },
      error: (r: Refusal) => {
        this.working.set(false);
        this.password = ''; // the fields keep what was typed except the password
        this.refusal.set(r.message);
        this.refusedField.set(r.field ?? null);
        this.shaking.set(true);
        setTimeout(() => this.shaking.set(false), 450);
      },
    });
  }
}

/** Sign up asks for a name, an email and a password, and says in a caption
 *  that a new account is a guest account. */
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="wrap" role="main">
      <div class="card card-lg auth" [class.shake]="shaking()">
        <app-brand [size]="20" />
        <h1 class="title display">Create your account</h1>

        <form (ngSubmit)="submit()" novalidate>
          <label class="field" [class.field-invalid]="fieldIs('name')">
            <span class="field-label">Name</span>
            <input class="field-input" type="text" name="name" autocomplete="name"
                   [(ngModel)]="name" required />
          </label>
          <label class="field" [class.field-invalid]="fieldIs('email')">
            <span class="field-label">Email</span>
            <input class="field-input" type="email" name="email" autocomplete="email"
                   [(ngModel)]="email" required />
          </label>
          <label class="field" [class.field-invalid]="fieldIs('password')">
            <span class="field-label">Password</span>
            <input class="field-input" type="password" name="password" autocomplete="new-password"
                   [(ngModel)]="password" required minlength="8" />
            <span class="field-caption">At least 8 characters.</span>
          </label>

          @if (refusal()) {
            <p class="field-refusal" id="signup-refusal" role="alert">{{ refusal() }}</p>
          }

          <p class="caption note">A new account is a guest account.</p>

          <button type="submit" class="btn btn-solid btn-block submit" [disabled]="working()">
            @if (working()) { <app-spinner /> }
            Create Account
          </button>
        </form>

        <p class="alt caption">
          Already have an account?
          <a [routerLink]="'/login'" [queryParams]="{ next: next() }">Sign in</a>
        </p>
      </div>
    </main>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: var(--s7) var(--s4); background: var(--paper); }
    .auth { width: 400px; max-width: 100%; padding: var(--s6); }
    .title { font-size: 28px; line-height: 34px; margin: var(--s4) 0 var(--s5); }
    .note { color: var(--muted-text); margin-top: var(--s3); }
    .submit { margin-top: var(--s4); }
    .alt { margin-top: var(--s4); text-align: center; color: var(--ink-secondary); }
    .shake { animation: shake 0.4s var(--ease); }
  `],
})
export class SignupComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = '';
  email = '';
  password = '';
  working = signal(false);
  refusal = signal<string | null>(null);
  refusedField = signal<string | null>(null);
  shaking = signal(false);
  next = signal<string | null>(null);

  ngOnInit() {
    clearTheme();
    this.next.set(this.route.snapshot.queryParamMap.get('next'));
  }

  fieldIs(name: string) { return this.refusedField() === name; }

  submit() {
    if (this.working()) return;
    if (!this.name.trim()) {
      this.refusal.set('Add your name so hosts know who is coming.');
      this.refusedField.set('name');
      this.shake();
      return;
    }
    this.working.set(true);
    this.refusal.set(null);
    this.refusedField.set(null);
    this.api.signup(this.name.trim(), this.email.trim(), this.password).subscribe({
      next: (acct) => {
        this.working.set(false);
        landAfterAuth(this.router, acct, this.next());
      },
      error: (r: Refusal) => {
        this.working.set(false);
        this.password = '';
        this.refusal.set(r.message);
        this.refusedField.set(r.field ?? null);
        this.shake();
      },
    });
  }

  private shake() {
    this.shaking.set(true);
    setTimeout(() => this.shaking.set(false), 450);
  }
}

/** Login lands on `next`, else /home for a guest and /calendars for a host. */
function landAfterAuth(router: Router, acct: Account, next: string | null) {
  if (next && next.startsWith('/')) {
    router.navigateByUrl(next);
    return;
  }
  router.navigate([acct.role === 'host' ? '/calendars' : '/home']);
}

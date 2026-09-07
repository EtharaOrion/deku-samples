import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api, homeFor } from '../api';
import { Brand } from '../ui/brand';
import { Icon } from '../ui/icon';

/** Sign in: one centred card of 400px, radius 24px. */
@Component({
  selector: 'g-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <form class="card card-lg auth" (ngSubmit)="submit()" [class.shake]="shake()" novalidate>
        <g-brand />
        <h1 class="t-h1">Sign in</h1>
        <label class="field">
          <span>Email</span>
          <input type="email" name="email" [(ngModel)]="email" required autocomplete="email" placeholder="you@example.com" [attr.aria-invalid]="!!refusal()" />
          @if (emailError(); as m) { <span class="field-error">{{ m }}</span> }
        </label>
        <label class="field">
          <span>Password</span>
          <input type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" placeholder="Your password" />
        </label>
        @if (refusal(); as r) { <p class="refusal t-row" role="alert">{{ r }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [disabled]="working()">
          @if (working()) { <span class="rotator" aria-hidden="true"></span> } Sign in
        </button>
        <p class="t-caption switch">New here? <a routerLink="/signup" [queryParams]="{ next: next() }">Create an account</a></p>
      </form>
    </div>
  `,
  imports: [RouterLink, FormsModule, Brand, Icon],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; justify-content: center; padding: 48px 16px 96px; }
    .auth { width: 400px; max-width: 100%; display: flex; flex-direction: column; gap: 16px; padding: 32px; }
    .refusal { color: #c4150e; }
    .switch { text-align: center; }
    .switch a { color: var(--blue); }
  `],
})
export class LoginPage {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = signal('');
  password = signal('');
  working = signal(false);
  refusal = signal<string | null>(null);
  emailError = signal<string | null>(null);
  shake = signal(false);

  next(): string {
    return this.route.snapshot.queryParamMap.get('next') ?? '';
  }

  submit(): void {
    const email = this.email().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      this.emailError.set('Enter a valid email address.');
      this.bump();
      return;
    }
    this.emailError.set(null);
    if (!this.password()) {
      this.refusal.set('Add your password to sign in.');
      this.bump();
      return;
    }
    this.working.set(true);
    this.refusal.set(null);
    this.api.login(email, this.password()).subscribe({
      next: (res) => {
        this.api.setSession(res.access_token, res);
        const next = this.next();
        this.router.navigateByUrl(next || homeFor(res));
      },
      error: (err) => {
        this.working.set(false);
        this.refusal.set(err?.error?.message ?? 'That email and password do not match. Check them and try again.');
        this.bump();
      },
    });
  }

  private bump(): void {
    this.shake.set(false);
    setTimeout(() => this.shake.set(true), 0);
    setTimeout(() => this.shake.set(false), 500);
  }
}

/** Sign up: a new account is always a guest account. */
@Component({
  selector: 'g-signup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <form class="card card-lg auth" (ngSubmit)="submit()" [class.shake]="shake()" novalidate>
        <g-brand />
        <h1 class="t-h1">Create your account</h1>
        <label class="field">
          <span>Name</span>
          <input type="text" name="name" [(ngModel)]="name" required autocomplete="name" placeholder="Your name" [attr.aria-invalid]="!!fieldError('name')" />
          @if (fieldError('name'); as m) { <span class="field-error">{{ m }}</span> }
        </label>
        <label class="field">
          <span>Email</span>
          <input type="email" name="email" [(ngModel)]="email" required autocomplete="email" placeholder="you@example.com" [attr.aria-invalid]="!!fieldError('email')" />
          @if (fieldError('email'); as m) { <span class="field-error">{{ m }}</span> }
        </label>
        <label class="field">
          <span>Password</span>
          <input type="password" name="password" [(ngModel)]="password" required autocomplete="new-password" placeholder="At least 8 characters" />
          @if (fieldError('password'); as m) { <span class="field-error">{{ m }}</span> }
        </label>
        <p class="t-caption note">A new account is a guest account. Host accounts are seeded.</p>
        @if (refusal(); as r) { <p class="refusal t-row" role="alert">{{ r }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [disabled]="working()">
          @if (working()) { <span class="rotator" aria-hidden="true"></span> } Create account
        </button>
        <p class="t-caption switch">Already have one? <a routerLink="/login" [queryParams]="{ next: next() }">Sign in</a></p>
      </form>
    </div>
  `,
  imports: [RouterLink, FormsModule, Brand, Icon],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; justify-content: center; padding: 48px 16px 96px; }
    .auth { width: 400px; max-width: 100%; display: flex; flex-direction: column; gap: 16px; padding: 32px; }
    .refusal { color: #c4150e; }
    .note { color: var(--muted); }
    .switch { text-align: center; }
    .switch a { color: var(--blue); }
  `],
})
export class SignupPage {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = signal('');
  email = signal('');
  password = signal('');
  working = signal(false);
  refusal = signal<string | null>(null);
  fields = signal<Record<string, string>>({});
  shake = signal(false);

  next(): string {
    return this.route.snapshot.queryParamMap.get('next') ?? '';
  }

  fieldError(key: string): string | null {
    return this.fields()[key] ?? null;
  }

  submit(): void {
    const fields: Record<string, string> = {};
    if (!this.name().trim() || this.name().trim().length < 2) fields.name = 'Add your name so hosts know who is coming.';
    const email = this.email().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = 'Enter a valid email address.';
    if (this.password().length < 8) fields.password = 'Choose a password of at least 8 characters.';
    if (Object.keys(fields).length) {
      this.fields.set(fields);
      this.bump();
      return;
    }
    this.fields.set({});
    this.working.set(true);
    this.refusal.set(null);
    this.api.signup(email, this.password(), this.name().trim()).subscribe({
      next: (res) => {
        this.api.setSession(res.access_token, res);
        const next = this.next();
        this.router.navigateByUrl(next || '/home');
      },
      error: (err) => {
        this.working.set(false);
        this.refusal.set(err?.error?.message ?? 'We could not create that account. Try again in a moment.');
        this.fields.set(err?.error?.fields ?? {});
        this.bump();
      },
    });
  }

  private bump(): void {
    this.shake.set(false);
    setTimeout(() => this.shake.set(true), 0);
    setTimeout(() => this.shake.set(false), 500);
  }
}

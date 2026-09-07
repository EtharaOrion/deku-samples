import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { BrandMarkComponent } from '../ui/brand-mark';
import { PublicShellComponent } from '../shells/public-shell';

/**
 * One centred card. A refused sign-in names what to do next, keeps what was
 * typed except the password, and answers with the shake.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BrandMarkComponent, PublicShellComponent],
  template: `
    <app-public-shell>
      <div class="wrap">
        <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate [class.shake]="shake()">
          <a class="brand" routerLink="/" aria-label="Community Calendar home">
            <app-brand-mark [size]="18" /><span class="word">Calendar</span>
          </a>
          <h1>Sign in</h1>
          <p class="hint">Use the email and password you signed up with.</p>

          <label class="field">
            <span class="fl">Email</span>
            <input class="input" type="email" formControlName="email" autocomplete="email" aria-describedby="em" />
            @if (msg()) { <span class="refusal" id="em" role="alert">{{ msg() }}</span> }
            @else { <span class="caption" id="em">The address you registered with.</span> }
          </label>

          <label class="field">
            <span class="fl">Password</span>
            <input class="input" type="password" formControlName="password" autocomplete="current-password" />
          </label>

          <button class="btn btn-primary wide" type="submit" [disabled]="working()">
            @if (working()) { <span class="spinner" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8"></circle></svg></span> Sign in }
            @else { Sign in }
          </button>

          <p class="switch">New here? <a routerLink="/signup" [queryParams]="query()">Create an account</a></p>
        </form>
      </div>
    </app-public-shell>
  `,
  styles: [`
    .wrap { min-height: calc(100vh - 64px); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card {
      width: 100%; max-width: 400px; background: var(--paper); border-radius: var(--r-card-lg);
      padding: 32px; display: flex; flex-direction: column; gap: 16px;
      box-shadow: var(--shadow-primary), var(--ring-onboard);
    }
    .brand { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--ink); align-self: flex-start; }
    .brand .word { font: 700 16px/24px var(--sans); letter-spacing: -0.02em; }
    h1 { font: 700 22px/26px var(--sans); margin: 0; }
    .hint { font-size: 14px; line-height: 20px; color: var(--muted); margin-top: -8px; }
    .field { display: block; }
    .fl { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    .refusal { display: block; font-size: 13px; line-height: 18px; color: var(--danger); margin-top: 6px; }
    .wide { width: 100%; }
    .switch { font-size: 14px; line-height: 20px; text-align: center; margin: 0; }
  `],
})
export class LoginComponent {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  working = signal(false);
  shake = signal(false);
  msg = signal('');
  query = () => this.nextQuery();

  submit() {
    if (this.working() || this.form.invalid) {
      if (this.form.controls.email.invalid) this.msg.set('Enter a valid email address.');
      else this.msg.set('Enter your password.');
      this.bump();
      return;
    }
    this.working.set(true);
    this.msg.set('');
    const { email, password } = this.form.getRawValue();
    this.api.login({ email, password }).subscribe({
      next: (a: any) => {
        const next = this.nextPath();
        this.router.navigateByUrl(next || (a.role === 'host' ? '/calendars' : '/home'));
      },
      error: (e) => {
        this.working.set(false);
        this.msg.set(this.api.messageFor(e));
        this.bump();
      },
    });
  }

  private bump() {
    this.shake.set(false);
    setTimeout(() => this.shake.set(true), 0);
    setTimeout(() => this.shake.set(false), 500);
  }

  nextQuery() { return this.route.snapshot.queryParamMap.keys.length ? { next: this.route.snapshot.queryParamMap.get('next') ?? undefined } : {}; }
  nextPath() { return this.route.snapshot.queryParamMap.get('next'); }
}

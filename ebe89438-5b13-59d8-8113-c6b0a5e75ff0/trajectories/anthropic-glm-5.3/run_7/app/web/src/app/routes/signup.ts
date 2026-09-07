import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { BrandMarkComponent } from '../ui/brand-mark';
import { PublicShellComponent } from '../shells/public-shell';

@Component({
  selector: 'app-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BrandMarkComponent, PublicShellComponent],
  template: `
    <app-public-shell>
      <div class="wrap">
        <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate [class.shake]="shake()">
          <a class="brand" routerLink="/" aria-label="Community Calendar home">
            <app-brand-mark [size]="18" /><span class="word">Calendar</span>
          </a>
          <h1>Create your account</h1>
          <p class="caption note">A new account is a guest account: you can browse, register and hold tickets.</p>

          <label class="field">
            <span class="fl">Name</span>
            <input class="input" formControlName="name" autocomplete="name" aria-describedby="nm" />
            @if (field() === 'name') { <span class="refusal" id="nm" role="alert">{{ msg() }}</span> }
          </label>

          <label class="field">
            <span class="fl">Email</span>
            <input class="input" type="email" formControlName="email" autocomplete="email" aria-describedby="em" />
            @if (field() === 'email') { <span class="refusal" id="em" role="alert">{{ msg() }}</span> }
          </label>

          <label class="field">
            <span class="fl">Password</span>
            <input class="input" type="password" formControlName="password" autocomplete="new-password" aria-describedby="pw" />
            @if (field() === 'password') { <span class="refusal" id="pw" role="alert">{{ msg() }}</span> }
            @else { <span class="caption" id="pw">At least 8 characters.</span> }
          </label>

          <button class="btn btn-primary wide" type="submit" [disabled]="working()">
            @if (working()) { Signing up } @else { Create account }
          </button>

          <p class="switch">Already have one? <a routerLink="/login">Sign in</a></p>
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
    .note { margin-top: -8px; }
    .field { display: block; }
    .fl { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    .refusal { display: block; font-size: 13px; line-height: 18px; color: var(--danger); margin-top: 6px; }
    .wide { width: 100%; }
    .switch { font-size: 14px; line-height: 20px; text-align: center; margin: 0; }
  `],
})
export class SignupComponent {
  private api = inject(Api);
  private router = inject(Router);

  form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  working = signal(false);
  shake = signal(false);
  msg = signal('');
  field = signal('');

  submit() {
    if (this.working()) return;
    if (this.form.controls.name.invalid) return this.refuse('Add your name so hosts know who is coming.', 'name');
    if (this.form.controls.email.invalid) return this.refuse('Enter a valid email address.', 'email');
    if (this.form.controls.password.invalid) return this.refuse('Use a password of at least 8 characters.', 'password');

    this.working.set(true);
    this.msg.set('');
    this.api.signup(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: (e) => {
        this.working.set(false);
        const f = this.api.statusFor(e) === 409 ? 'email' : '';
        this.refuse(this.api.messageFor(e), f);
      },
    });
  }

  private refuse(message: string, field: string) {
    this.msg.set(message);
    this.field.set(field);
    this.shake.set(false);
    setTimeout(() => this.shake.set(true), 0);
    setTimeout(() => this.shake.set(false), 500);
  }
}

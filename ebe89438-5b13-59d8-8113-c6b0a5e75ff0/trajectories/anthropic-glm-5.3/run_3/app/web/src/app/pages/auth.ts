import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../api';
import { BrandMark } from '../chrome';
import { PublicBarComponent } from '../chrome';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BrandMark],
  template: `
    <main class="auth-wrap">
      <div class="card card-24 auth-card" [class.shake]="shake">
        <a routerLink="/" class="brand-link" aria-label="Deku home"><app-brand /></a>
        <h1>Sign in</h1>
        <form (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email"
                   [(ngModel)]="email" [readonly]="working" placeholder="you@example.com" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password"
                   [(ngModel)]="password" [readonly]="working" />
          </div>
          @if (refusal) { <p class="refusal" role="alert">{{ refusal }}</p> }
          <button class="btn btn-primary full" type="submit" [disabled]="working">
            @if (working) { <svg class="spinner" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7"></circle></svg> Sign In }
            @else { Sign In }
          </button>
        </form>
        <p class="swap">New here? <a routerLink="/signup" [queryParams]="queryParams" class="link">Create an account</a></p>
      </div>
    </main>
  `,
  styles: [`
    .auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth-card { width: 400px; max-width: 100%; padding: 32px; display: flex; flex-direction: column; gap: 20px; }
    h1 { font-size: 22px; line-height: 26px; font-weight: 700; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .brand-link { align-self: flex-start; color: var(--ink); }
    .full { width: 100%; }
    .refusal { font-size: 14px; line-height: 21px; color: var(--danger); }
    .swap { font-size: 14px; line-height: 21px; color: var(--muted); }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  refusal = '';
  working = false;
  shake = false;
  get queryParams() { return this.route.snapshot.queryParams; }

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  async submit() {
    this.refusal = '';
    if (!this.email.trim()) { this.refusal = 'Enter a valid email address.'; this.doShake(); return; }
    if (!this.password) { this.refusal = 'Enter your password to sign in.'; this.doShake(); return; }
    this.working = true;
    try {
      const acct = await this.auth.login(this.email.trim().toLowerCase(), this.password);
      const next = this.route.snapshot.queryParamMap.get('next');
      const dest = next && next.startsWith('/') ? next : (acct.role === 'host' ? '/calendars' : '/home');
      this.router.navigateByUrl(dest);
    } catch (e: any) {
      this.refusal = e?.message ?? 'That email and password do not match. Check both and try again.';
      this.doShake();
    } finally { this.working = false; }
  }
  private doShake() {
    this.shake = false;
    setTimeout(() => (this.shake = true), 0);
    setTimeout(() => (this.shake = false), 500);
  }
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BrandMark],
  template: `
    <main class="auth-wrap">
      <div class="card card-24 auth-card" [class.shake]="shake">
        <a routerLink="/" class="brand-link" aria-label="Deku home"><app-brand /></a>
        <h1>Create your account</h1>
        <form (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="name">Name</label>
            <input id="name" name="name" type="text" autocomplete="name" [(ngModel)]="name" />
            @if (nameError) { <p class="field-error" role="alert">{{ nameError }}</p> }
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" [(ngModel)]="email" />
            @if (emailError) { <p class="field-error" role="alert">{{ emailError }}</p> }
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="new-password" [(ngModel)]="password" />
            @if (pwError) { <p class="field-error" role="alert">{{ pwError }}</p> }
          </div>
          <p class="caption guest-note">A new account is a guest account. Host accounts are seeded by the team.</p>
          @if (refusal) { <p class="refusal" role="alert">{{ refusal }}</p> }
          <button class="btn btn-primary full" type="submit" [disabled]="working">
            @if (working) { <svg class="spinner" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7"></circle></svg> Creating }
            @else { Create Account }
          </button>
        </form>
        <p class="swap">Already have an account? <a routerLink="/login" [queryParams]="queryParams" class="link">Sign in</a></p>
      </div>
    </main>
  `,
  styles: [`
    .auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth-card { width: 400px; max-width: 100%; padding: 32px; display: flex; flex-direction: column; gap: 20px; }
    h1 { font-size: 22px; line-height: 26px; font-weight: 700; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .brand-link { align-self: flex-start; color: var(--ink); }
    .full { width: 100%; }
    .refusal { font-size: 14px; line-height: 21px; color: var(--danger); }
    .swap { font-size: 14px; line-height: 21px; color: var(--muted); }
    .guest-note { font-size: 13px; line-height: 16px; }
  `],
})
export class SignupComponent {
  name = ''; email = ''; password = '';
  nameError = ''; emailError = ''; pwError = ''; refusal = '';
  working = false; shake = false;
  get queryParams() { return this.route.snapshot.queryParams; }

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  async submit() {
    this.nameError = this.emailError = this.pwError = this.refusal = '';
    let bad = false;
    if (!this.name.trim()) { this.nameError = 'Add your name so hosts know who is coming.'; bad = true; }
    if (!this.email.trim()) { this.emailError = 'Enter a valid email address.'; bad = true; }
    if (this.password.length < 8) { this.pwError = 'Use at least eight characters for your password.'; bad = true; }
    if (bad) { this.doShake(); return; }
    this.working = true;
    try {
      await this.auth.signup(this.email.trim().toLowerCase(), this.password, this.name.trim());
      this.router.navigateByUrl('/home');
    } catch (e: any) {
      this.refusal = e?.message ?? 'Something went wrong on our side. Please try again.';
      this.doShake();
    } finally { this.working = false; }
  }
  private doShake() {
    this.shake = false; setTimeout(() => (this.shake = true), 0); setTimeout(() => (this.shake = false), 500);
  }
}

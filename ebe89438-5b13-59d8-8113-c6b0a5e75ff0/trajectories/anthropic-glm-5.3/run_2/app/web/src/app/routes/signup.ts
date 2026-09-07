import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { BrandMark } from '../ui/icons';
import { Auth } from '../core/auth';
import { ApiError } from '../core/api';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'cc-signup',
  standalone: true,
  imports: [FormsModule, PublicBar, RouterLink, BrandMark],
  template: `
  <cc-public-bar></cc-public-bar>
  <main class="wrap">
    <form class="card auth" [class.shake]="shake" (submit)="submit($event)" novalidate>
      <a routerLink="/" class="brand" aria-label="Community Calendar home">
        <cc-brand-mark></cc-brand-mark><span class="wordmark">Community Calendar</span>
      </a>
      <h1 class="h1-display title">Create an account</h1>
      @if (refusal) { <p class="refusal" role="alert">{{ refusal }}</p> }
      <label>
        <span class="field-label">Name</span>
        <input class="field" type="text" name="name" autocomplete="name" [(ngModel)]="name"
               required placeholder="Your name">
        @if (field === 'name') { <span class="field-error">Add your name so hosts know who is coming.</span> }
      </label>
      <label>
        <span class="field-label">Email</span>
        <input class="field" type="email" name="email" autocomplete="email" [(ngModel)]="email"
               required placeholder="you@example.com">
        @if (field === 'email') { <span class="field-error">Enter a valid email address.</span> }
      </label>
      <label>
        <span class="field-label">Password</span>
        <input class="field" type="password" name="password" autocomplete="new-password"
               [(ngModel)]="password" required placeholder="At least 8 characters">
      </label>
      <button class="btn btn-primary btn-block" type="submit" [disabled]="busy">
        {{ busy ? 'Creating…' : 'Create Account' }}
      </button>
      <p class="caption center">A new account is a guest account.</p>
      <p class="caption center">Already have one? <a routerLink="/login">Sign in</a></p>
    </form>
  </main>`,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 96px 16px; }
    .auth { width: 400px; max-width: 100%; padding: 32px; border-radius: 24px; display: grid; gap: 18px; }
    .brand { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); justify-self: center; }
    .wordmark { font-weight: 700; letter-spacing: -0.02em; font-size: 15px; }
    .title { font-size: 26px; margin: 0; text-align: center; }
    .refusal { margin: 0; font-size: 14px; line-height: 20px; color: var(--danger);
      background: rgba(255,59,48,0.08); padding: 10px 12px; border-radius: 8px; }
  `],
})
export class Signup {
  name = '';
  email = '';
  password = '';
  refusal = '';
  field = '';
  busy = false;
  shake = false;

  constructor(private auth: Auth, private router: Router) {}

  async submit(e: Event): Promise<void> {
    e.preventDefault();
    this.refusal = ''; this.field = '';
    if (!this.name.trim()) { this.field = 'name'; this.refusal = 'Add your name so hosts know who is coming.'; this.doShake(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) { this.field = 'email'; this.refusal = 'Enter a valid email address.'; this.doShake(); return; }
    if (this.password.length < 8) { this.refusal = 'Choose a password of at least 8 characters.'; this.doShake(); return; }
    this.busy = true;
    try {
      await this.auth.signup(this.email.trim().toLowerCase(), this.password, this.name.trim());
      await this.auth.load().catch(() => null);
      this.router.navigateByUrl('/home');
    } catch (err) {
      this.refusal = (err as ApiError).message;
      this.doShake();
    } finally { this.busy = false; }
  }

  private doShake(): void {
    this.shake = false;
    setTimeout(() => { this.shake = true; setTimeout(() => { this.shake = false; }, 420); }, 0);
  }
}

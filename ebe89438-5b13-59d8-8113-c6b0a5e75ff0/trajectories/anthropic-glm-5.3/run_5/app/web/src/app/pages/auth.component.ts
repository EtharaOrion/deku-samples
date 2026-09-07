import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { BrandMarkComponent } from '../ui/brand-mark.component';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent, FormsModule],
  template: `
    <div class="auth-page">
      <main class="auth-card card big" role="main">
        <a class="brand" routerLink="/">
          <app-brand-mark [size]="18"></app-brand-mark>
          <span>Deku</span>
        </a>
        <h1 class="modal-title">{{ mode === 'login' ? 'Sign In' : 'Create Your Account' }}</h1>
        <p class="caption">{{ mode === 'login' ? 'Welcome back.' : 'A new account is a guest account.' }}</p>

        <form class="stack-16" (submit)="submit($event)" novalidate>
          @if (mode === 'signup') {
            <div class="field" [class.refused]="refusalField === 'name'">
              <label for="a-name">Name</label>
              <input id="a-name" type="text" autocomplete="name" name="name" [(ngModel)]="name" [ngModelOptions]="{ standalone: true }" required />
              @if (refusalField === 'name') { <p class="refusal" [attr.aria-live]="'polite'">{{ refusal }}</p> }
            </div>
          }
          <div class="field" [class.refused]="refusalField === 'email'">
            <label for="a-email">Email</label>
            <input id="a-email" type="email" autocomplete="email" name="email" [(ngModel)]="email" [ngModelOptions]="{ standalone: true }" required />
            @if (refusalField === 'email') { <p class="refusal" [attr.aria-live]="'polite'">{{ refusal }}</p> }
          </div>
          <div class="field" [class.refused]="refusalField === 'password'">
            <label for="a-password">Password</label>
            <input id="a-password" type="password" [attr.autocomplete]="mode === 'login' ? 'current-password' : 'new-password'"
                   name="password" [(ngModel)]="password" [ngModelOptions]="{ standalone: true }" required />
            @if (refusalField === 'password') { <p class="refusal" [attr.aria-live]="'polite'">{{ refusal }}</p> }
          </div>

          <p class="form-refusal" role="alert">{{ refusal }}</p>

          <button class="btn primary" type="submit" [disabled]="working()">
            @if (working()) {
              <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg>
              {{ mode === 'login' ? 'Signing In' : 'Creating Account' }}
            } @else {
              {{ mode === 'login' ? 'Sign In' : 'Create Account' }}
            }
          </button>
        </form>

        <p class="caption switch-link">
          {{ mode === 'login' ? 'New here?' : 'Already have an account?' }}
          <a [routerLink]="mode === 'login' ? '/signup' : '/login'" [queryParams]="queryParams()">{{ mode === 'login' ? 'Create a guest account' : 'Sign in instead' }}</a>
        </p>
      </main>
    </div>
  `,
  styles: [
    `
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--paper); }
    .auth-card { width: 400px; max-width: 100%; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
    .form-refusal { min-height: 20px; margin: 0; font-size: 14px; line-height: 20px; color: var(--danger); }
    .form-refusal:empty { display: none; }
    .switch-link { margin-top: 8px; }
    .switch-link a { color: var(--link-blue); }
  `],
})
export class AuthPageComponent {
  mode: 'login' | 'signup' = 'login';
  email = '';
  password = '';
  name = '';
  refusal = '';
  refusalField: string | null = null;
  working = signal(false);
  queryParams = signal<{ next?: string }>({});

  constructor(private api: ApiService, private router: Router, private route: ActivatedRoute) {
    this.route.data.subscribe((d) => {
      this.mode = (d['mode'] as 'login' | 'signup') ?? 'login';
    });
    this.route.queryParams.subscribe((p) => {
      this.queryParams.set(p['next'] ? { next: p['next'] } : {});
    });
  }

  async submit(event: Event) {
    event.preventDefault();
    if (this.working()) return;
    this.refusal = '';
    this.refusalField = null;

    const email = this.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.refusal = 'Enter a valid email address.';
      this.refusalField = 'email';
      return;
    }
    if (!this.password) {
      this.refusal = 'Enter your password.';
      this.refusalField = 'password';
      return;
    }
    if (this.mode === 'signup' && !this.name.trim()) {
      this.refusal = 'Add your name so hosts know who is coming.';
      this.refusalField = 'name';
      return;
    }

    this.working.set(true);
    try {
      const account =
        this.mode === 'login'
          ? await this.api.login(email, this.password)
          : await this.api.signup(email, this.password, this.name.trim());
      const next = this.queryParams()['next'];
      if (next && next.startsWith('/')) {
        await this.router.navigateByUrl(next);
      } else {
        await this.router.navigateByUrl(account.role === 'host' ? '/calendars' : '/home');
      }
    } catch (e) {
      const failure = e as ApiFailure;
      this.refusal = failure.message || 'Check the details and try again.';
      this.refusalField = failure.field ?? null;
      this.password = '';
    } finally {
      this.working.set(false);
    }
  }
}

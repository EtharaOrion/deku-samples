import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../api.service';
import { BrandMarkComponent } from '../widgets';

@Component({
  selector: 'route-signup', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, BrandMarkComponent],
  template: `
    <main id="main" class="page">
      <div class="auth card card-lg elevated onboarding-card" [class.shake]="shake()">
        <a routerLink="/" class="auth-brand" aria-label="Community Calendar home">
          <brand-mark [size]="18"></brand-mark><span>Community Calendar</span>
        </a>
        <h1 class="t-display">Create an account</h1>
        <form (ngSubmit)="submit()" novalidate>
          <div class="field" [class.invalid]="fieldError() === 'name'">
            <label for="name">Name</label>
            <input id="name" name="name" type="text" autocomplete="name" [(ngModel)]="name">
            @if (fieldError() === 'name') { <p class="field-error">{{ message() }}</p> }
          </div>
          <div class="field" [class.invalid]="fieldError() === 'email'">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" [(ngModel)]="email">
            @if (fieldError() === 'email') { <p class="field-error">{{ message() }}</p> }
          </div>
          <div class="field" [class.invalid]="fieldError() === 'password'">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="new-password" [(ngModel)]="password">
            @if (fieldError() === 'password') { <p class="field-error">{{ message() }}</p> }
          </div>
          @if (message() && !fieldError()) { <p class="field-error" role="alert">{{ message() }}</p> }
          <button class="btn btn-primary wide" type="submit" [disabled]="busy()">
            @if (busy()) { <svg class="spinner" viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="30"></circle></svg> Creating… }
            @else { Create Account }
          </button>
        </form>
        <p class="t-caption">A new account is a guest account. Host accounts are set up by the Community Calendar team.</p>
        <p class="t-caption">Already have one? <a routerLink="/login" class="link" [queryParams]="queryParams()">Sign In</a></p>
      </div>
    </main>
  `,
  styles: [`
    .page{min-height:100vh;display:grid;place-items:center;padding:24px}
    .auth{width:100%;max-width:400px;padding:32px;display:flex;flex-direction:column;gap:20px}
    .auth-brand{display:inline-flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em}
    form{display:flex;flex-direction:column;gap:16px}
    .wide{width:100%}
  `],
})
export class SignupComponent {
  api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  name = signal(''); email = signal(''); password = signal('');
  message = signal(''); fieldError = signal<string | null>(null);
  busy = signal(false); shake = signal(false);

  queryParams() {
    const next = this.route.snapshot.queryParamMap.get('next');
    return next ? { next } : {};
  }

  async submit() {
    this.message.set(''); this.fieldError.set(null); this.busy.set(true);
    try {
      const account = await this.api.post<any>('/auth/signup', {
        name: this.name(), email: this.email(), password: this.password(),
      });
      const res = await this.api.post<{ access_token: string; account: any }>('/auth/login', {
        email: this.email(), password: this.password(),
      });
      this.api.setSession(res.access_token, res.account);
      const next = this.route.snapshot.queryParamMap.get('next');
      this.router.navigateByUrl(next && next.startsWith('/') ? next : '/home');
    } catch (e) {
      const err = e as ApiError;
      this.message.set(err.message || 'Check the fields and try again.');
      this.fieldError.set(err.field ?? null);
      this.shake.set(false);
      setTimeout(() => this.shake.set(true), 0);
    } finally { this.busy.set(false); }
  }
}

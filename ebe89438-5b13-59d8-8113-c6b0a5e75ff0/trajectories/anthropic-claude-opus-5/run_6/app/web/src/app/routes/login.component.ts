import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BrandComponent } from '../ui/brand.component';
import { AuthService } from '../core/auth.service';
import { Refusal } from '../core/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent],
  template: `
    <main id="main" class="wrap">
      <div class="card card-lg" [class.shake]="shaking()">
        <app-brand />
        <h1 class="t-screen-title">Sign in</h1>
        <form (ngSubmit)="submit()" novalidate>
          <label class="field" [class.refused]="!!fieldError('email')">
            <span class="label">Email</span>
            <input class="control" type="email" name="email" [(ngModel)]="email"
                   autocomplete="email" [attr.aria-describedby]="refusal() ? 'login-refusal' : null" />
          </label>
          <label class="field" [class.refused]="!!fieldError('password')">
            <span class="label">Password</span>
            <input class="control" type="password" name="password" [(ngModel)]="password"
                   autocomplete="current-password" [attr.aria-describedby]="refusal() ? 'login-refusal' : null" />
          </label>
          @if (refusal()) {
            <p class="refusal-line" id="login-refusal" role="alert">{{ refusal() }}</p>
          }
          <button type="submit" class="btn btn-solid btn-block" [disabled]="busy()">
            @if (busy()) { <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" /></svg> }
            Sign In
          </button>
        </form>
        <p class="alt t-caption">
          New here? <a [routerLink]="'/signup'" [queryParams]="{ next: next() }">Create an account</a>
        </p>
      </div>
    </main>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--paper); }
    .card { width: 100%; max-width: 400px; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
    h1 { margin: 8px 0 8px; }
    .refusal-line { color: var(--danger); font-size: 13px; line-height: 16px; margin-bottom: 12px; }
    .alt { color: var(--ink-64); text-align: center; }
  `],
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  busy = signal(false);
  refusal = signal('');
  shaking = signal(false);
  next = signal<string | null>(null);
  private field = signal<string | undefined>(undefined);

  fieldError(name: string) { return this.field() === name; }

  ngOnInit() {
    this.route.queryParamMap.subscribe((p) => this.next.set(p.get('next')));
  }

  async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set('');
    this.field.set(undefined);
    try {
      const account = await this.auth.login(this.email.trim(), this.password);
      const target = this.next() || this.auth.homeFor(account);
      this.router.navigateByUrl(target);
    } catch (e) {
      const r = e as Refusal;
      // the fields keep what was typed except the password, and the card shakes
      this.password = '';
      this.field.set(r.field);
      this.refusal.set(r.message || 'That email and password do not match an account. Check the address and try again.');
      this.shaking.set(true);
      setTimeout(() => this.shaking.set(false), 450);
    } finally {
      this.busy.set(false);
    }
  }
}

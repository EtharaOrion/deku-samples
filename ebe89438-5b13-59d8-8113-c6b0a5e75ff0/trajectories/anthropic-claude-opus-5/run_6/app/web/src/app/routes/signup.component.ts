import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BrandComponent } from '../ui/brand.component';
import { AuthService } from '../core/auth.service';
import { Refusal } from '../core/api.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandComponent],
  template: `
    <main id="main" class="wrap">
      <div class="card card-lg" [class.shake]="shaking()">
        <app-brand />
        <h1 class="t-screen-title">Create your account</h1>
        <form (ngSubmit)="submit()" novalidate>
          <label class="field" [class.refused]="field() === 'name'">
            <span class="label">Name</span>
            <input class="control" type="text" name="name" [(ngModel)]="name" autocomplete="name" />
          </label>
          <label class="field" [class.refused]="field() === 'email'">
            <span class="label">Email</span>
            <input class="control" type="email" name="email" [(ngModel)]="email" autocomplete="email" />
          </label>
          <label class="field" [class.refused]="field() === 'password'">
            <span class="label">Password</span>
            <input class="control" type="password" name="password" [(ngModel)]="password"
                   autocomplete="new-password" />
            <span class="caption">At least 8 characters.</span>
          </label>
          @if (refusal()) { <p class="refusal-line" role="alert">{{ refusal() }}</p> }
          <p class="caption t-caption note">A new account is a guest account.</p>
          <button type="submit" class="btn btn-solid btn-block" [disabled]="busy()">
            @if (busy()) { <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" /></svg> }
            Create Account
          </button>
        </form>
        <p class="alt t-caption">
          Already have an account? <a [routerLink]="'/login'" [queryParams]="{ next: next() }">Sign in</a>
        </p>
      </div>
    </main>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { width: 100%; max-width: 400px; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
    h1 { margin: 8px 0; }
    .refusal-line { color: var(--danger); font-size: 13px; line-height: 16px; margin-bottom: 12px; }
    .note { color: var(--muted); margin-bottom: 16px; display: block; }
    .alt { color: var(--ink-64); text-align: center; }
  `],
})
export class SignupComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = ''; email = ''; password = '';
  busy = signal(false);
  refusal = signal('');
  field = signal<string | undefined>(undefined);
  shaking = signal(false);
  next = signal<string | null>(null);

  ngOnInit() { this.route.queryParamMap.subscribe((p) => this.next.set(p.get('next'))); }

  async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set('');
    this.field.set(undefined);
    try {
      const account = await this.auth.signup(this.name.trim(), this.email.trim(), this.password);
      this.router.navigateByUrl(this.next() || this.auth.homeFor(account));
    } catch (e) {
      const r = e as Refusal;
      this.password = '';
      this.field.set(r.field);
      this.refusal.set(r.message);
      this.shaking.set(true);
      setTimeout(() => this.shaking.set(false), 450);
    } finally {
      this.busy.set(false);
    }
  }
}

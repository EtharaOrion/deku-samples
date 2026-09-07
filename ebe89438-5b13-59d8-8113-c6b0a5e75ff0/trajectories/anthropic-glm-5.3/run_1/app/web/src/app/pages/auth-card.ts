import { Component, Input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrandComponent } from '../brand';
import { Api } from '../api';
import { Auth } from '../auth';

@Component({
  selector: 'app-auth-card',
  standalone: true,
  imports: [BrandComponent, RouterLink, CommonModule, FormsModule],
  template: `
    <main class="wrap">
      <div class="card card-24 auth-card" [class.shake]="shake()">
        <app-brand></app-brand>
        <h1 class="h1">{{ mode === 'login' ? 'Sign In' : 'Create Your Account' }}</h1>

        @if (mode === 'signup') {
          <div class="field" [class.refused]="refusalField === 'name'">
            <label for="name">Name</label>
            <input id="name" type="text" autocomplete="name" [(ngModel)]="name" (ngModelChange)="refusal = null" placeholder="Your name" />
            @if (refusalField === 'name') { <p class="refusal" id="name-refusal">{{ refusal }}</p> }
          </div>
        }
        <div class="field" [class.refused]="refusalField === 'email'">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" [(ngModel)]="email" (ngModelChange)="refusal = null" placeholder="you@example.com" aria-describedby="email-refusal" />
          @if (refusalField === 'email') { <p class="refusal" id="email-refusal">{{ refusal }}</p> }
        </div>
        <div class="field" [class.refused]="refusalField === 'password'">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" [(ngModel)]="password" (ngModelChange)="refusal = null" placeholder="At least 8 characters" />
          @if (refusalField === 'password') { <p class="refusal">{{ refusal }}</p> }
        </div>

        @if (mode === 'signup') {
          <p class="caption">A new account is a guest account: you can browse, register and hold tickets. Hosting is by invitation.</p>
        }

        <button class="btn btn-primary" type="button" (click)="submit()" [disabled]="working()">
          @if (working()) { Working… } @else { {{ mode === 'login' ? 'Sign In' : 'Create Account' }} }
        </button>

        @if (refusal && !refusalField) { <p class="refusal-line">{{ refusal }}</p> }

        <p class="swap">
          @if (mode === 'login') {
            New here? <a class="link link-blue" [routerLink]="['/signup']" [queryParams]="next ? { next: next } : {}">Create an account</a>
          } @else {
            Already have one? <a class="link link-blue" [routerLink]="['/login']" [queryParams]="next ? { next: next } : {}">Sign in</a>
          }
        </p>
      </div>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth-card { width: 400px; max-width: 100%; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 8px 0 8px; }
    .caption { font-size: 13px; line-height: 16px; color: var(--muted); margin: 0; }
    .refusal-line { font-size: 14px; line-height: 20px; color: #b3231c; margin: 0; }
    .swap { font-size: 14px; line-height: 20px; color: var(--muted); margin: 4px 0 0; }
  `],
})
export class AuthCardComponent {
  @Input('mode') modeInput: 'login' | 'signup' | null = null;
  mode: 'login' | 'signup' = 'login';
  email = ''; password = ''; name = '';
  refusal: string | null = null;
  refusalField: string | null = null;
  working = signal(false);
  shake = signal(false);
  next: string | null = null;

  constructor(private api: Api, private auth: Auth, private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    if (this.modeInput) this.mode = this.modeInput;
    else this.route.data.subscribe((d) => { this.mode = (d as any)['mode'] || 'login'; });
    this.route.queryParamMap.subscribe((qp) => { this.next = qp.get('next'); });
  }

  async submit() {
    this.working.set(true);
    this.refusal = null; this.refusalField = null;
    const path = this.mode === 'login' ? '/auth/login' : '/auth/signup';
    const payload = this.mode === 'login'
      ? { email: this.email, password: this.password }
      : { email: this.email, password: this.password, name: this.name };
    const { status, body } = await this.api.post<any>(path, payload);
    this.working.set(false);
    if (status === 200 || status === 201) {
      const token = body.access_token;
      const account = body.account ?? body;
      this.auth.setSession(token, account);
      const dest = this.next || (account.role === 'host' ? '/calendars' : '/home');
      this.router.navigateByUrl(dest);
      return;
    }
    this.refusal = body?.message || `That didn't work. Check the fields and try once more.`;
    this.refusalField = body?.field ?? null;
    this.password = '';
    this.shake.set(false);
    setTimeout(() => this.shake.set(true), 0);
    setTimeout(() => this.shake.set(false), 500);
  }
}

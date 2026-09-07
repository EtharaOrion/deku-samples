import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { STAR_PATH } from '../../core/visuals';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="wrap">
      <form class="card card-lg auth" (submit)="submit($event)" [class.shake]="shake()">
        <a class="brand" routerLink="/" aria-label="Gatherline home">
          <svg width="24" height="24" viewBox="0 0 133 134" aria-hidden="true"><path [attr.d]="star" fill="currentColor"/></svg>
          <span class="word">Gatherline</span>
        </a>
        <h1 class="serif">Create your account</h1>
        <div class="field" [class.invalid]="field() === 'name'">
          <label for="name">Name</label>
          <input id="name" type="text" autocomplete="name" [(ngModel)]="name" required placeholder="Your name" />
          @if (field() === 'name') { <p class="refusal">{{ refusal() }}</p> }
        </div>
        <div class="field" [class.invalid]="field() === 'email'">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" [(ngModel)]="email" required placeholder="you@example.com" />
          @if (field() === 'email') { <p class="refusal">{{ refusal() }}</p> }
        </div>
        <div class="field" [class.invalid]="field() === 'password'">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="new-password" [(ngModel)]="password" required placeholder="At least 8 characters" />
          @if (field() === 'password') { <p class="refusal">{{ refusal() }}</p> }
        </div>
        <p class="caption note">A new account is a guest account: you can browse, register and hold tickets. Hosting is by invitation.</p>
        <button class="btn btn-primary" type="submit" [disabled]="working()">
          @if (working()) { <span class="spinner"></span> } Create Account
        </button>
        <p class="caption swap">Already have one? <a routerLink="/login" class="link">Sign in</a></p>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth { width: 400px; padding: 32px; display: flex; flex-direction: column; gap: 14px; background: var(--paper); }
    h1 { font-size: 26px; line-height: 32px; }
    .note { color: var(--muted); }
    .swap { text-align: center; color: var(--muted); }
    .brand { align-self: flex-start; }
  `],
})
export class SignupComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  star = STAR_PATH;

  name = signal('');
  email = signal('');
  password = signal('');
  working = signal(false);
  refusal = signal('');
  field = signal('');
  shake = signal(false);

  async submit(e: Event): Promise<void> {
    e.preventDefault();
    this.refusal.set('');
    this.working.set(true);
    try {
      await this.auth.signup(this.name(), this.email(), this.password()).toPromise();
      this.router.navigateByUrl('/home');
    } catch (err: any) {
      const body = err?.error ?? {};
      this.refusal.set(body.message ?? 'That did not go through. Please try again.');
      this.field.set(body.field ?? '');
      this.shake.set(true);
      setTimeout(() => this.shake.set(false), 450);
    } finally {
      this.working.set(false);
    }
  }
}

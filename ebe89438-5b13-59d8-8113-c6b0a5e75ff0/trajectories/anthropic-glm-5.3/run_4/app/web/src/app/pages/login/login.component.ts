import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { STAR_PATH } from '../../core/visuals';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="wrap">
      <form class="card-lg card auth" (submit)="submit($event)" [class.shake]="shake()">
        <a class="brand" routerLink="/" aria-label="Gatherline home">
          <svg width="24" height="24" viewBox="0 0 133 134" aria-hidden="true"><path [attr.d]="star" fill="currentColor"/></svg>
          <span class="word">Gatherline</span>
        </a>
        <h1 class="serif">Welcome back</h1>
        <div class="field" [class.invalid]="!!refusal()">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" [(ngModel)]="email" required placeholder="you@example.com" />
        </div>
        <div class="field" [class.invalid]="!!refusal()">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" [(ngModel)]="password" required placeholder="Your password" />
          @if (refusal()) { <p class="refusal" id="login-refusal">{{ refusal() }}</p> }
        </div>
        <button class="btn btn-primary" type="submit" [disabled]="working()">
          @if (working()) { <span class="spinner"></span> } Sign In
        </button>
        <p class="caption swap">New here? <a routerLink="/signup" class="link">Create an account</a></p>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .auth { width: 400px; padding: 32px; display: flex; flex-direction: column; gap: 16px; background: var(--paper); }
    h1 { font-size: 26px; line-height: 32px; }
    .swap { text-align: center; color: var(--muted); }
    .brand { align-self: flex-start; }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  star = STAR_PATH;

  email = signal('');
  password = signal('');
  working = signal(false);
  refusal = signal('');
  shake = signal(false);

  next(): string {
    const n = this.route.snapshot.queryParamMap.get('next');
    return n && n.startsWith('/') ? n : '';
  }

  async submit(e: Event): Promise<void> {
    e.preventDefault();
    this.refusal.set('');
    this.working.set(true);
    try {
      const acc = await this.auth.login(this.email(), this.password()).toPromise();
      const n = this.next();
      if (n) { this.router.navigateByUrl(n); return; }
      this.router.navigateByUrl(acc?.role === 'host' ? '/calendars' : '/home');
    } catch {
      this.refusal.set('That email and password do not match. Check them and try again.');
      this.shake.set(true);
      setTimeout(() => this.shake.set(false), 450);
    } finally {
      this.working.set(false);
    }
  }
}

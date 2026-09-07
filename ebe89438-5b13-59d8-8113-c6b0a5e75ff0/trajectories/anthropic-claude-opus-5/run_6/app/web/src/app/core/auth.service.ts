import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { Account } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly account = signal<Account | null>(null);
  readonly ready = signal(false);
  readonly isSignedIn = computed(() => this.account() !== null);
  readonly isHost = computed(() => this.account()?.role === 'host');

  /** Restores the session once at start-up; an expired token is cleared. */
  async restore(): Promise<void> {
    if (!this.api.token) { this.ready.set(true); return; }
    try {
      const me = await firstValueFrom(this.api.me());
      this.account.set(me);
    } catch {
      this.api.setToken(null);
      this.account.set(null);
    } finally {
      this.ready.set(true);
    }
  }

  async login(email: string, password: string): Promise<Account> {
    const res = await firstValueFrom(this.api.login(email, password));
    this.api.setToken(res.access_token);
    this.account.set(res.account);
    return res.account;
  }

  async signup(name: string, email: string, password: string): Promise<Account> {
    const res = await firstValueFrom(this.api.signup(name, email, password));
    this.api.setToken(res.access_token);
    const account: Account = {
      id: res.id, email: res.email, display_name: res.display_name,
      handle: res.handle, role: res.role,
    };
    this.account.set(account);
    return account;
  }

  logout() {
    this.api.setToken(null);
    this.account.set(null);
    this.router.navigateByUrl('/');
  }

  /** Where a successful sign-in lands when no next parameter came along. */
  homeFor(account: Account | null): string {
    return account?.role === 'host' ? '/calendars' : '/home';
  }

  /** An expired token is cleared and the visitor is sent to sign in again. */
  handleExpired(currentPath: string) {
    this.api.setToken(null);
    this.account.set(null);
    this.router.navigate(['/login'], { queryParams: { next: currentPath } });
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiRefusal, ApiService } from './api.service';
import type { Account } from './models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly account = signal<Account | null>(null);
  readonly ready = signal(false);
  readonly isSignedIn = computed(() => this.account() !== null);
  readonly isHost = computed(() => this.account()?.role === 'host');

  /** Restores the session once at boot; no route paints twice for the same data. */
  async restore() {
    if (this.ready()) return;
    if (!this.api.token) {
      this.ready.set(true);
      return;
    }
    try {
      const account = await firstValueFrom(this.api.me());
      this.account.set(account);
    } catch (err) {
      // An expired token is cleared and the visitor is sent to sign in again.
      if (err instanceof ApiRefusal && err.isUnauthenticated) this.api.setToken(null);
      this.account.set(null);
    } finally {
      this.ready.set(true);
    }
  }

  async signIn(email: string, password: string) {
    const res = await firstValueFrom(this.api.login({ email, password }));
    this.api.setToken(res.access_token);
    this.account.set(res.account);
    return res.account;
  }

  async signUp(name: string, email: string, password: string) {
    const res = await firstValueFrom(this.api.signup({ name, email, password }));
    this.api.setToken(res.access_token);
    const { access_token, ...account } = res as any;
    this.account.set(account as Account);
    return account as Account;
  }

  /** Logout returns to the landing route. */
  signOut() {
    this.api.setToken(null);
    this.account.set(null);
    this.router.navigateByUrl('/');
  }

  /** Login lands on next, else /home for a guest and /calendars for a host. */
  landingFor(account: Account, next?: string | null) {
    if (next && next.startsWith('/') && !next.startsWith('//')) return next;
    return account.role === 'host' ? '/calendars' : '/home';
  }

  /** An expired session sends the visitor to /login?next=<current>. */
  handleExpiry(currentPath: string) {
    this.api.setToken(null);
    this.account.set(null);
    this.router.navigate(['/login'], { queryParams: { next: currentPath } });
  }

  setAccount(account: Account) {
    this.account.set(account);
  }
}

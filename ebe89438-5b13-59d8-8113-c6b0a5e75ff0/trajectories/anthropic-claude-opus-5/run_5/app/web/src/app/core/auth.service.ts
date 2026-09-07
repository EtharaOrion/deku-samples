import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import type { Account } from './models';

const TOKEN_KEY = 'deku.token';
const ACCOUNT_KEY = 'deku.account';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly account = signal<Account | null>(readStored<Account>(ACCOUNT_KEY));
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  readonly signedIn = computed(() => !!this.token() && !!this.account());
  readonly isHost = computed(() => this.account()?.role === 'host');

  login(email: string, password: string) {
    return this.api.login({ email, password }).pipe(
      tap((res) => this.adopt(res.access_token, res.account)),
    );
  }

  signup(name: string, email: string, password: string) {
    return this.api.signup({ name, email, password }).pipe(
      tap((res) =>
        this.adopt(res.access_token, {
          id: res.id,
          email: res.email,
          display_name: res.display_name,
          handle: res.handle,
          role: res.role,
        }),
      ),
    );
  }

  adopt(token: string, account: Account) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    this.token.set(token);
    this.account.set(account);
  }

  setAccount(account: Account) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    this.account.set(account);
  }

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    this.token.set(null);
    this.account.set(null);
  }

  /** Logout returns the visitor to the landing route. */
  logout() {
    this.clear();
    this.router.navigateByUrl('/');
  }

  /** An expired token is cleared and sends the visitor to /login?next=<current>. */
  expire() {
    const next = this.router.url.split('?')[0];
    this.clear();
    this.router.navigate(['/login'], { queryParams: next && next !== '/' ? { next } : {} });
  }

  /** Login lands on next, else /home for a guest and /calendars for a host. */
  landingRoute(next?: string | null): string {
    if (next && next.startsWith('/') && !next.startsWith('//')) return next;
    return this.isHost() ? '/calendars' : '/home';
  }
}

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

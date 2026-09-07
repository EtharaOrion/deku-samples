import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Api } from './api';
import type { Account } from './models';

const TOKEN_KEY = 'deku.token';
const ACCOUNT_KEY = 'deku.account';

@Injectable({ providedIn: 'root' })
export class Auth {
  private api = inject(Api);
  private router = inject(Router);

  private readonly _account = signal<Account | null>(readAccount());
  private readonly _token = signal<string | null>(readToken());

  readonly account = this._account.asReadonly();
  readonly signedIn = computed(() => !!this._token() && !!this._account());
  readonly isHost = computed(() => this._account()?.role === 'host');

  get token(): string | null {
    return this._token();
  }

  login(email: string, password: string) {
    return this.api.login({ email, password }).pipe(
      tap((res) => {
        this.store(res.access_token, res.account);
      })
    );
  }

  signup(name: string, email: string, password: string) {
    return this.api.signup({ name, email, password }).pipe(
      tap((res) => {
        const { access_token, ...account } = res as Account & { access_token: string };
        this.store(access_token, account as Account);
      })
    );
  }

  private store(token: string, account: Account) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    this._token.set(token);
    this._account.set(account);
  }

  patchAccount(account: Account) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    this._account.set(account);
  }

  /** Logout returns the visitor to the landing wall. */
  logout() {
    this.clear();
    this.router.navigateByUrl('/');
  }

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    this._token.set(null);
    this._account.set(null);
  }

  /** An expired token is cleared and the visitor is sent to sign in again. */
  expire() {
    this.clear();
    const next = this.router.url && this.router.url !== '/' ? this.router.url : '/home';
    this.router.navigate(['/login'], { queryParams: { next } });
  }

  landingRoute(): string {
    return this._account()?.role === 'host' ? '/calendars' : '/home';
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

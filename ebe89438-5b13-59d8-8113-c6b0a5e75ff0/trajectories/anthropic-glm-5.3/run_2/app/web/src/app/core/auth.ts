import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Api, ApiError, Account } from './api';

const TOKEN_KEY = 'cc_token';
const ACCOUNT_KEY = 'cc_account';

@Injectable({ providedIn: 'root' })
export class Auth {
  account: Account | null = null;
  ready: Promise<void> | null = null;

  constructor(private api: Api, private router: Router) {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (raw) {
      try { this.account = JSON.parse(raw); } catch { this.account = null; }
    }
  }

  get token(): string | null { return localStorage.getItem(TOKEN_KEY); }
  get isSignedIn(): boolean { return !!this.token; }
  get isHost(): boolean { return this.account?.role === 'host'; }

  async load(): Promise<void> {
    if (!this.token) { this.account = null; return; }
    if (!this.ready) {
      this.ready = this.api.request<Account>('/accounts/me')
        .then(a => { this.account = a; localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); })
        .catch((e: ApiError) => {
          if (e.status === 401) { this.clear(); }
          throw e;
        });
    }
    return this.ready;
  }

  async login(email: string, password: string): Promise<Account> {
    const res = await this.api.request<Account & { access_token: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    this.store(res.access_token, res);
    return res;
  }

  async signup(email: string, password: string, name: string): Promise<Account> {
    const res = await this.api.request<Account & { access_token: string }>('/auth/signup', {
      method: 'POST', body: JSON.stringify({ email, password, name }),
    });
    this.store(res.access_token, res);
    return res;
  }

  private store(token: string, account: Account): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    this.account = account;
    this.ready = null;
  }

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    this.account = null;
    this.ready = null;
  }

  logout(): void {
    this.clear();
    this.router.navigate(['/']);
  }

  landingRoute(): string {
    return this.isHost ? '/calendars' : '/home';
  }
}

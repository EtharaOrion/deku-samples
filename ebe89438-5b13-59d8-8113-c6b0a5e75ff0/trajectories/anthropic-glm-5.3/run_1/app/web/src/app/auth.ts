import { Injectable, signal } from '@angular/core';

export interface Account {
  id: string; email: string; display_name: string; handle: string;
  role: 'host' | 'guest'; access_token?: string;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private _account = signal<Account | null>(null);
  private _token: string | null = null;
  readonly account = this._account.asReadonly();

  constructor() {
    const t = localStorage.getItem('deku_token');
    const a = localStorage.getItem('deku_account');
    if (t && a) {
      this._token = t;
      try { this._account.set(JSON.parse(a)); } catch { this.clear(); }
    }
  }

  get token(): string | null { return this._token; }

  setSession(token: string, account: Account) {
    this._token = token;
    this._account.set(account);
    localStorage.setItem('deku_token', token);
    localStorage.setItem('deku_account', JSON.stringify(account));
  }

  updateAccount(account: Account) {
    this._account.set(account);
    localStorage.setItem('deku_account', JSON.stringify(account));
  }

  clear() {
    this._token = null;
    this._account.set(null);
    localStorage.removeItem('deku_token');
    localStorage.removeItem('deku_account');
  }

  get isHost() { return this._account()?.role === 'host'; }
}

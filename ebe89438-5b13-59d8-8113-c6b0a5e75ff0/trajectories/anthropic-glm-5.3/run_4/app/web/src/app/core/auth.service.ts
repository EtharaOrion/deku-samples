import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

export type Account = {
  id: string; email: string; display_name: string; handle: string;
  role: 'host' | 'guest'; access_token?: string;
};

export type EventItem = {
  id: string; slug: string; title: string; category: string; city: string;
  time_zone: string; cover_seed: string; theme_hex: string; description: string;
  starts_at: string; ends_at: string; capacity: number; approval_required: boolean;
  waitlist_enabled: boolean; state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  confirmed_count: number; remaining: number;
  cancel_reason?: string | null;
  calendar?: { slug: string; name: string; owner_account_id: string };
  my_registration?: Registration | null;
  has_ended?: boolean;
};

export type Registration = {
  id: string; event_id?: string; account_id?: string; status: string;
  waitlist_position: number | null; ticket_code: string | null;
  checked_in_at: string | null; email?: string; display_name?: string;
  event?: {
    slug: string; title: string; starts_at: string; ends_at: string; time_zone: string;
    state: string; theme_hex: string; cover_seed: string; city: string; capacity: number;
    cancel_reason: string | null;
  };
};

const TOKEN_KEY = 'gatherline_token';
const ACCOUNT_KEY = 'gatherline_account';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _account = signal<Account | null>(null);
  private _ready = signal(false);
  private loaded = false;

  account = this._account.asReadonly();
  ready = this._ready.asReadonly();
  isHost = computed(() => this._account()?.role === 'host');

  /** The stored token is the source of truth; the account may still be loading. */
  token = (): string | null => localStorage.getItem(TOKEN_KEY);

  constructor(private http: HttpClient, private router: Router) {}

  private accountResolve: (() => void) | null = null;
  private accountPromise: Promise<void> = new Promise((resolve) => { this.accountResolve = resolve; });
  private accountSettled = false;

  /**
   * Resolves once the session is fully known: either no token, or the account
   * fetched from the server. Guards wait on this so a hard navigation to a
   * protected route never mistakes a loading session for a signed-out one.
   */
  whenAccount(): Promise<Account | null> {
    return this.accountPromise.then(() => this._account());
  }

  /** Resolves as soon as a token has been looked for (cheap, pre-network). */
  whenReady(): Promise<void> {
    if (this._ready()) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => this._ready() ? resolve() : setTimeout(check, 10);
      check();
    });
  }

  restore(): void {
    if (this.loaded) return;
    this.loaded = true;
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      this._ready.set(true);
      this.settleAccount();
      return;
    }
    // Hydrate synchronously so the first paint of a signed-in visitor knows who
    // they are, then confirm against the server.
    const cached = localStorage.getItem(ACCOUNT_KEY);
    if (cached) {
      try {
        this._account.set({ ...JSON.parse(cached), access_token: stored });
      } catch {
        localStorage.removeItem(ACCOUNT_KEY);
      }
    }
    this._ready.set(true);
    this.http.get<Account>('/api/accounts/me').subscribe({
      next: (acc) => {
        this._account.set({ ...acc, access_token: stored });
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
        this.settleAccount();
      },
      error: () => {
        this.expire();
        this.settleAccount();
      },
    });
  }

  login(email: string, password: string) {
    return this.http.post<Account>('/api/auth/login', { email, password }).pipe(
      tap((acc) => this.apply(acc)),
    );
  }

  signup(name: string, email: string, password: string) {
    return this.http.post<Account>('/api/auth/signup', { name, email, password }).pipe(
      tap((acc) => this.apply(acc)),
    );
  }

  logout(): void {
    const token = this.token();
    if (token) this.http.post('/api/auth/logout', {}).subscribe({ error: () => undefined });
    localStorage.removeItem(TOKEN_KEY);
    this._account.set(null);
    this.router.navigate(['/']);
  }

  refresh(): void {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    this.http.get<Account>('/api/accounts/me').subscribe({
      next: (acc) => this._account.set({ ...acc, access_token: localStorage.getItem(TOKEN_KEY)! }),
      error: () => this.expire(),
    });
  }

  update(data: { display_name?: string; handle?: string }) {
    return this.http.patch<Account>('/api/accounts/me', data).pipe(
      tap((acc) => {
        this._account.update((cur) => (cur ? { ...cur, ...acc } : acc));
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ ...acc, access_token: token }));
      }),
    );
  }

  private settleAccount(): void {
    if (this.accountSettled) return;
    this.accountSettled = true;
    this.accountResolve?.();
  }

  expire(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    this._account.set(null);
  }

  private apply(acc: Account): void {
    localStorage.setItem(TOKEN_KEY, acc.access_token!);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
    this._account.set(acc);
  }
}

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export interface Account { id: string; email: string; display_name: string; handle: string; role: 'host' | 'guest'; }
export interface Theme { ground: string; sunk: string; ink: string; ink2: string; hairline: string; panel: string; soft: string; valid: boolean; key: string; }
export interface EventRecord {
  id?: string; slug: string; title: string; category: string; city: string; time_zone: string;
  cover_seed?: string; theme_hex: string; description?: string; starts_at: string; ends_at: string;
  capacity: number; approval_required: boolean; waitlist_enabled: boolean;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  published_at?: string | null; cancelled_at?: string | null; cancel_reason?: string | null;
  calendar_slug?: string; calendar_name?: string; owner_handle?: string; is_public_calendar?: boolean;
  confirmed_count: number; remaining: number; is_past?: boolean; theme?: Theme;
}
export interface Registration {
  id: string; account_id: string; email?: string; display_name?: string; status: string;
  waitlist_position: number | null; ticket_code: string | null; checked_in_at?: string | null;
  event_id?: string; event_slug?: string; title?: string; starts_at?: string; ends_at?: string;
  time_zone?: string; city?: string; is_past?: boolean;
}
export interface CalendarRecord {
  id: string; owner_account_id: string; name: string; slug: string; category: string; city: string;
  is_public: boolean; created_at?: string; published_events?: number; owner_handle?: string; owner_name?: string; event_count?: number; events?: EventRecord[];
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) { super(body?.message || 'Request failed'); }
  get field(): string | undefined { return this.body?.field; }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private token: string | null = null;
  private accountSubject = new BehaviorSubject<Account | null>(null);
  account$ = this.accountSubject.asObservable();

  constructor(private router: Router) {
    const t = localStorage.getItem('cc_token');
    if (t) this.token = t;
    const a = localStorage.getItem('cc_account');
    if (a) { try { this.accountSubject.next(JSON.parse(a)); } catch { } }
  }

  get account(): Account | null { return this.accountSubject.value; }
  get tokenValue(): string | null { return this.token; }

  private url(path: string): string { return path.startsWith('/api') ? path : '/api' + path; }

  async request<T>(method: string, path: string, body?: unknown, opts: { raw?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.token) headers['authorization'] = 'Bearer ' + this.token;
    let res: Response;
    try {
      res = await fetch(this.url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, { message: 'We could not reach the calendar. Check your connection and try again.' });
    }
    if (res.status === 401 && this.account && path !== '/auth/login') {
      this.clearSession();
      this.router.navigate(['/login'], { queryParams: { next: this.router.url } });
      throw new ApiError(401, await res.json().catch(() => ({ message: 'Please sign in again.' })));
    }
    if (!res.ok) {
      const b = await res.json().catch(() => ({ message: 'Something went wrong. Please try again.' }));
      throw new ApiError(res.status, b);
    }
    if (opts.raw) return res as unknown as T;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json() as T;
    return await res.text() as unknown as T;
  }

  get<T>(path: string, opts?: { raw?: boolean }): Promise<T> { return this.request<T>('GET', path, undefined, opts || {}); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  patch<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PATCH', path, body); }

  setSession(token: string, account: Account) {
    this.token = token;
    localStorage.setItem('cc_token', token);
    localStorage.setItem('cc_account', JSON.stringify(account));
    this.accountSubject.next(account);
  }

  clearSession() {
    this.token = null;
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_account');
    this.accountSubject.next(null);
  }

  async refreshAccount(): Promise<void> {
    if (!this.token) return;
    try {
      const a = await this.get<Account>('/accounts/me');
      this.accountSubject.next(a);
      localStorage.setItem('cc_account', JSON.stringify(a));
    } catch { }
  }

  async logout(): Promise<void> {
    try { await this.post('/auth/logout'); } catch { }
    this.clearSession();
  }
}

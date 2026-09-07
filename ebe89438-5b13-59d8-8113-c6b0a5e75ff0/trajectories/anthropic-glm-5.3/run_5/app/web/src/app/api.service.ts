import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, catchError, throwError } from 'rxjs';
import type { Account, CommunityEvent, Registration, GuestListRow, Calendar, Ticket } from './types';

const TOKEN_KEY = 'deku.token';
const ACCOUNT_KEY = 'deku.account';

export type ApiFailure = { status: number; message: string; field?: string | null };

@Injectable({ providedIn: 'root' })
export class ApiService {
  private _account = signal<Account | null>(this.readStoredAccount());
  account = this._account.asReadonly();
  token = computed(() => this._account()?.access_token ?? null);
  isHost = computed(() => this._account()?.role === 'host');

  constructor(private http: HttpClient) {}

  private readStoredAccount(): Account | null {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      if (!raw) return null;
      const acc = JSON.parse(raw) as Account;
      if (!acc.access_token) return null;
      return acc;
    } catch {
      return null;
    }
  }

  setSession(account: Account) {
    this._account.set(account);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    if (account.access_token) localStorage.setItem(TOKEN_KEY, account.access_token);
  }

  clearSession() {
    this._account.set(null);
    localStorage.removeItem(ACCOUNT_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  /** A 401 mid-session clears the token; the router sends the visitor to login. */
  markExpired() {
    this.clearSession();
  }

  private headers(): HttpHeaders {
    const t = this.token();
    return t ? new HttpHeaders({ authorization: `Bearer ${t}` }) : new HttpHeaders();
  }

  private fail(err: HttpErrorResponse): never {
    if (err.status === 401) this.markExpired();
    const body = err.error as { message?: string; field?: string } | null;
    throw {
      status: err.status,
      message: body?.message ?? this.plainMessage(err),
      field: body?.field ?? null,
    } satisfies ApiFailure;
  }

  private plainMessage(err: HttpErrorResponse): string {
    if (err.status === 0) return 'The network is not answering. Check the connection and try again.';
    if (err.status >= 500) return 'Something on our side did not finish. Try again in a moment.';
    return 'That request could not be completed.';
  }

  private get<T>(path: string, withAuth = false): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(path, { headers: withAuth ? this.headers() : undefined }).pipe(
        catchError((e: HttpErrorResponse) => { this.fail(e); }),
      ),
    );
  }

  private post<T>(path: string, body?: unknown, withAuth = true): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(path, body, { headers: this.headers() }).pipe(
        catchError((e: HttpErrorResponse) => { this.fail(e); }),
      ),
    );
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.patch<T>(path, body, { headers: this.headers() }).pipe(
        catchError((e: HttpErrorResponse) => { this.fail(e); }),
      ),
    );
  }

  // --- auth ---

  async login(email: string, password: string): Promise<Account> {
    const acc = await this.post<Account>('/api/auth/login', { email, password }, false);
    this.setSession(acc);
    return acc;
  }

  async signup(email: string, password: string, name: string): Promise<Account> {
    const acc = await this.post<Account>('/api/auth/signup', { email, password, name }, false);
    this.setSession(acc);
    return acc;
  }

  me(): Promise<Account> {
    return this.get<Account>('/api/accounts/me', true);
  }

  updateMe(body: { display_name?: string; handle?: string }): Promise<Account> {
    return this.patch<Account>('/api/accounts/me', body);
  }

  // --- events ---

  events(params: { category?: string; city?: string; q?: string; limit?: number; offset?: number }): Promise<{ rows: CommunityEvent[]; total: number }> {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.city) qs.set('city', params.city);
    if (params.q) qs.set('q', params.q);
    qs.set('limit', String(params.limit ?? 20));
    qs.set('offset', String(params.offset ?? 0));
    const path = `/api/events?${qs.toString()}`;
    return firstValueFrom(
      this.http.get<CommunityEvent[]>(path, { observe: 'response', headers: this.headers() }).pipe(
        catchError((e: HttpErrorResponse) => { this.fail(e); }),
      ),
    ).then((res) => ({ rows: res.body ?? [], total: Number(res.headers.get('X-Total-Count') ?? 0) }));
  }

  event(slug: string, auth = false): Promise<CommunityEvent> {
    return this.get<CommunityEvent>(`/api/events/${slug}`, auth);
  }

  createEvent(body: Record<string, unknown>): Promise<CommunityEvent> {
    return this.post<CommunityEvent>('/api/events', body);
  }

  patchEvent(slug: string, body: Record<string, unknown>): Promise<CommunityEvent> {
    return this.patch<CommunityEvent>(`/api/events/${slug}`, body);
  }

  cancelEvent(slug: string, reason: string): Promise<CommunityEvent> {
    return this.post<CommunityEvent>(`/api/events/${slug}/cancel`, { reason });
  }

  guestList(slug: string): Promise<GuestListRow[]> {
    return this.get<GuestListRow[]>(`/api/events/${slug}/registrations`, true);
  }

  // --- registrations ---

  register(eventSlug: string): Promise<Registration> {
    return this.post<Registration>('/api/registrations', { event_slug: eventSlug });
  }

  myRegistrations(): Promise<Registration[]> {
    return this.get<Registration[]>('/api/registrations/me', true);
  }

  cancelRegistration(id: string): Promise<Registration> {
    return this.post<Registration>(`/api/registrations/${id}/cancel`, {});
  }

  approveRegistration(id: string): Promise<GuestListRow & { note: string | null }> {
    return this.post<GuestListRow & { note: string | null }>(`/api/registrations/${id}/approve`, {});
  }

  declineRegistration(id: string): Promise<GuestListRow & { note: string | null }> {
    return this.post<GuestListRow & { note: string | null }>(`/api/registrations/${id}/decline`, {});
  }

  checkIn(code: string): Promise<GuestListRow & { note: string | null }> {
    return this.post<GuestListRow & { note: string | null }>(`/api/tickets/${code}/check-in`, {});
  }

  ticket(code: string): Promise<Ticket> {
    return this.get<Ticket>(`/api/tickets/${code}`);
  }

  // --- calendars ---

  calendars(): Promise<Calendar[]> {
    return this.get<Calendar[]>('/api/calendars', true);
  }

  createCalendar(body: { name: string; slug: string; category: string; city: string; is_public: boolean }): Promise<Calendar> {
    return this.post<Calendar>('/api/calendars', body);
  }

  resolve(slug: string): Promise<{ kind: string; slug: string }> {
    return this.get<{ kind: string; slug: string }>(`/api/resolve/${slug}`);
  }
}

import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, share, tap, catchError } from 'rxjs';


export type Account = {
  id: string; email: string; display_name: string; handle: string; role: 'host' | 'guest';
};

export type EventCard = {
  slug: string; title: string; category: string; city: string; time_zone: string;
  starts_at: string; ends_at: string; capacity: number; confirmed_count: number;
  remaining: number; state: string; theme_hex: string; description?: string;
  approval_required?: boolean; waitlist_enabled?: boolean; cover_seed?: string;
  calendar_slug?: string; calendar_name?: string; cancel_reason?: string | null;
};

export type Registration = {
  id: string; status: string; waitlist_position: number | null; ticket_code: string | null;
  event_slug?: string; title?: string; starts_at?: string; ends_at?: string; time_zone?: string;
  city?: string; theme_hex?: string; cover_seed?: string; event_state?: string;
  capacity?: number; confirmed_count?: number; checked_in_at?: string | null;
  email?: string; display_name?: string;
};

export type Calendar = {
  id: string; name: string; slug: string; category: string; city: string;
  is_public: boolean; owner_account_id: string; created_at?: string; published_events?: number;
};

export type Notice = { id: number; message: string; kind: 'success' | 'warning' | 'danger' | 'info' };

let noticeSeq = 0;

@Injectable({ providedIn: 'root' })
export class Api {
  constructor(private http: HttpClient, private router: Router) {}

  /* ------------------------------- auth ------------------------------- */

  private _account = signal<Account | null>(null);
  private _token = signal<string | null>(localStorage.getItem('cc_token'));
  private _accountLoaded = signal<boolean>(this._token() !== null);

  readonly account = this._account.asReadonly();
  readonly signedIn = computed(() => this._account() !== null);
  readonly isHost = computed(() => this._account()?.role === 'host');
  readonly accountLoaded = this._accountLoaded.asReadonly();

  private authHeaders(): Record<string, string> {
    const t = this._token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  signup(body: { email: string; password: string; name: string }) {
    return this.http.post<Account & { access_token: string }>('/api/auth/signup', body).pipe(
      tap((r) => { this.applySession(r.access_token, r); }),
    );
  }

  login(body: { email: string; password: string }) {
    return this.http.post<Account & { access_token: string }>('/api/auth/login', body).pipe(
      tap((r) => { this.applySession(r.access_token, r); }),
    );
  }

  private applySession(token: string, account: Account) {
    localStorage.setItem('cc_token', token);
    this._token.set(token);
    this._account.set(account);
    this._accountLoaded.set(true);
  }

  logout() {
    localStorage.removeItem('cc_token');
    this._token.set(null);
    this._account.set(null);
    this._accountLoaded.set(true);
  }

  /** Clears an expired token and sends the visitor to sign in. */
  handleExpired(currentPath: string) {
    this.logout();
    this.router.navigate(['/login'], { queryParams: { next: currentPath } });
  }

  private inflight: Observable<Account | null> | null = null;

  /** Resolves once the session is known, so a route never guesses too early. */
  loadAccount(): Observable<Account | null> {
    if (this._account()) return of(this._account());
    if (!this._token()) { this._accountLoaded.set(true); return of(null); }
    if (!this.inflight) {
      this.inflight = this.http.get<Account>('/api/accounts/me', { headers: this.authHeaders() }).pipe(
        tap((a) => { this._account.set(a); this._accountLoaded.set(true); this.inflight = null; }),
        catchError((e) => {
          this._accountLoaded.set(true);
          this.inflight = null;
          if (e instanceof HttpErrorResponse && e.status === 401) this.logout();
          return of(null);
        }),
        share(),
      );
    }
    return this.inflight;
  }

  patchAccount(body: { display_name?: string; handle?: string }) {
    return this.http.patch<Account>('/api/accounts/me', body, { headers: this.authHeaders() });
  }

  /* ------------------------------ notices ------------------------------ */

  private _notices = signal<Notice[]>([]);
  readonly notices = this._notices.asReadonly();

  notify(message: string, kind: Notice['kind'] = 'info') {
    const id = ++noticeSeq;
    this._notices.update((n) => [...n, { id, message, kind }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number) {
    this._notices.update((n) => n.filter((x) => x.id !== id));
  }

  /* ------------------------------- api -------------------------------- */

  private req<T>(method: string, path: string, body?: unknown): Observable<T> {
    return this.http.request<T>(method, path, {
      body: body ?? undefined,
      headers: this.authHeaders(),
    });
  }

  health() { return this.http.get('/api/health'); }

  resolve(slug: string) { return this.http.get<{ kind: string; slug: string }>(`/api/resolve/${slug}`); }

  events(params: Record<string, string | number>) {
    return this.http.get<EventCard[]>('/api/events', {
      params: params as any,
      headers: this.authHeaders(),
      observe: 'response',
    });
  }

  event(slug: string) { return this.req<EventCard>('GET', `/api/events/${slug}`); }

  createEvent(body: unknown) { return this.req<EventCard>('POST', '/api/events', body); }

  patchEvent(slug: string, body: unknown) {
    return this.req<EventCard & { moved_to_seats?: number }>('PATCH', `/api/events/${slug}`, body);
  }

  cancelEvent(slug: string, reason: string) {
    return this.req<EventCard>('POST', `/api/events/${slug}/cancel`, { reason });
  }

  registrations(slug: string) { return this.req<Registration[]>('GET', `/api/events/${slug}/registrations`); }

  myRegistrations() { return this.req<Registration[]>('GET', '/api/registrations/me'); }

  register(eventSlug: string) {
    return this.req<Registration>('POST', '/api/registrations', { event_slug: eventSlug });
  }

  cancelRegistration(id: string) {
    return this.req<Registration>('POST', `/api/registrations/${id}/cancel`, {});
  }

  approve(id: string) { return this.req<Registration>('POST', `/api/registrations/${id}/approve`, {}); }
  decline(id: string) { return this.req<Registration>('POST', `/api/registrations/${id}/decline`, {}); }

  ticket(code: string) {
    return this.http.get<Registration & { event_slug: string; title: string }>(`/api/tickets/${code}`);
  }

  checkIn(code: string) {
    return this.req<Registration & { already_checked_in_at?: string | null }>(
      'POST', `/api/tickets/${code}/check-in`, {});
  }

  calendars() { return this.req<Calendar[]>('GET', '/api/calendars'); }

  createCalendar(body: unknown) { return this.req<Calendar>('POST', '/api/calendars', body); }

  /** Human sentences for refusals; never the word "error". */
  messageFor(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const m = (e.error as any)?.message;
      if (typeof m === 'string' && m) return m;
      if (e.status === 401) return 'Sign in to continue.';
      if (e.status === 429) return 'Too many attempts. Wait a minute and try again.';
      if (e.status === 0) return 'The connection dropped. Try again in a moment.';
      return 'That did not go through. Check what you typed and try again.';
    }
    return 'That did not go through. Try again in a moment.';
  }

  statusFor(e: unknown): number | null {
    return e instanceof HttpErrorResponse ? e.status : null;
  }
}

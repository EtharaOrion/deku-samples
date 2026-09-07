import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  Account, Calendar, EventDetail, EventSummary, GuestRow, MyRegistration,
  Registration, Ticket,
} from './models';

export interface EventPage { events: EventSummary[]; total: number; }

export class Refusal extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'request_refused',
    public field?: string,
    public extra: Record<string, unknown> = {},
  ) { super(message); }
}

/** Every screen's data arrives from /api on the same origin. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private tokenSig = signal<string | null>(this.readToken());

  private readToken(): string | null {
    try { return localStorage.getItem('deku.token'); } catch { return null; }
  }

  get token(): string | null { return this.tokenSig(); }

  setToken(token: string | null) {
    this.tokenSig.set(token);
    try {
      if (token) localStorage.setItem('deku.token', token);
      else localStorage.removeItem('deku.token');
    } catch { /* storage may be unavailable */ }
  }

  private headers(): HttpHeaders {
    let h = new HttpHeaders();
    const t = this.token;
    if (t) h = h.set('Authorization', `Bearer ${t}`);
    return h;
  }

  private fail = (e: HttpErrorResponse) => {
    const body: any = e.error || {};
    const message = body.message || 'Something did not go through. Try again in a moment.';
    return throwError(() => new Refusal(e.status, message, body.code, body.field, body));
  };

  get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(`/api${path}`, { headers: this.headers(), params })
      .pipe(catchError(this.fail));
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`/api${path}`, body, { headers: this.headers() })
      .pipe(catchError(this.fail));
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.patch<T>(`/api${path}`, body, { headers: this.headers() })
      .pipe(catchError(this.fail));
  }

  // ------------------------------------------------------------------ events

  /** Reads X-Total-Count so a page control knows how many pages exist. */
  listEvents(q: { category?: string; city?: string; q?: string; limit?: number; offset?: number }): Observable<EventPage> {
    let params = new HttpParams();
    if (q.category) params = params.set('category', q.category);
    if (q.city) params = params.set('city', q.city);
    if (q.q) params = params.set('q', q.q);
    params = params.set('limit', String(q.limit ?? 20));
    params = params.set('offset', String(q.offset ?? 0));
    return this.http.get<EventSummary[]>('/api/events', {
      headers: this.headers(), params, observe: 'response',
    }).pipe(
      map((res) => ({
        events: res.body ?? [],
        total: Number(res.headers.get('X-Total-Count') ?? (res.body?.length ?? 0)),
      })),
      catchError(this.fail),
    );
  }

  getEvent(slug: string) { return this.get<EventDetail>(`/events/${encodeURIComponent(slug)}`); }
  createEvent(body: unknown) { return this.post<EventDetail>('/events', body); }
  patchEvent(slug: string, body: unknown) { return this.patch<EventDetail>(`/events/${encodeURIComponent(slug)}`, body); }
  cancelEvent(slug: string, reason: string) {
    return this.post<EventDetail>(`/events/${encodeURIComponent(slug)}/cancel`, { reason });
  }
  guestList(slug: string) { return this.get<GuestRow[]>(`/events/${encodeURIComponent(slug)}/registrations`); }

  // ----------------------------------------------------------- registrations
  register(eventSlug: string) { return this.post<Registration>('/registrations', { event_slug: eventSlug }); }
  myRegistrations() { return this.get<MyRegistration[]>('/registrations/me'); }
  cancelRegistration(id: number) { return this.post<Registration>(`/registrations/${id}/cancel`); }
  approve(id: number) { return this.post<Registration>(`/registrations/${id}/approve`); }
  decline(id: number) { return this.post<Registration>(`/registrations/${id}/decline`); }

  // ----------------------------------------------------------------- tickets
  getTicket(code: string) { return this.get<Ticket>(`/tickets/${encodeURIComponent(code)}`); }
  checkIn(code: string) {
    return this.post<Registration & { already_checked_in: boolean }>(
      `/tickets/${encodeURIComponent(code)}/check-in`);
  }

  // --------------------------------------------------------------- calendars
  myCalendars() { return this.get<Calendar[]>('/calendars'); }
  createCalendar(body: unknown) { return this.post<Calendar>('/calendars', body); }
  publicCalendar(slug: string) {
    return this.get<{ calendar: Calendar; events: EventSummary[] }>(
      `/calendars/${encodeURIComponent(slug)}/public`);
  }

  // ---------------------------------------------------------------- accounts
  me() { return this.get<Account>('/accounts/me'); }
  updateMe(body: unknown) { return this.patch<Account>('/accounts/me', body); }
  publicAccount(handle: string) {
    return this.get<{ account: Account; calendars: Calendar[] }>(
      `/accounts/${encodeURIComponent(handle)}/public`);
  }

  // ------------------------------------------------------------------- misc
  resolve(slug: string) {
    return this.get<{ kind: string; slug: string }>(`/resolve/${encodeURIComponent(slug)}`);
  }
  category(name: string) {
    return this.get<{ category: string; event_count: number; calendar_count: number; calendars: Calendar[] }>(
      `/categories/${encodeURIComponent(name)}`);
  }

  login(email: string, password: string) {
    return this.http.post<{ access_token: string; account: Account }>(
      '/api/auth/login', { email, password }).pipe(catchError(this.fail));
  }

  signup(name: string, email: string, password: string) {
    return this.http.post<Account & { access_token: string }>(
      '/api/auth/signup', { name, email, password }).pipe(catchError(this.fail));
  }

  /** The export is fetched with the bearer token, then handed to the browser. */
  async downloadCsv(slug: string): Promise<void> {
    const res = await fetch(`/api/events/${encodeURIComponent(slug)}/registrations.csv`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (!res.ok) throw new Refusal(res.status, 'That export is not yours to download.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

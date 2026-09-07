import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import type {
  Account,
  Calendar,
  CategoryCount,
  EventDetail,
  EventSummary,
  GuestRow,
  Registration,
  ResolveResult,
  Ticket,
} from './models';

/** A refusal from the server, carrying what happened and which field it names. */
export class ApiRefusal extends Error {
  constructor(
    public status: number,
    message: string,
    public field?: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isUnauthenticated() {
    return this.status === 401;
  }
}

export type EventsPage = { events: EventSummary[]; total: number };

export type EventsQuery = {
  category?: string;
  city?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

const TOKEN_KEY = 'deku.token';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setToken(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private headers(): HttpHeaders {
    const token = this.token;
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  private fail(err: unknown) {
    if (err instanceof HttpErrorResponse) {
      const body: any = err.error || {};
      const message =
        typeof body?.message === 'string'
          ? body.message
          : err.status === 0
            ? 'The app could not reach the server. Check your connection and try again.'
            : 'Something went wrong. Please try again.';
      return throwError(() => new ApiRefusal(err.status, message, body?.field, body));
    }
    return throwError(() => new ApiRefusal(0, 'Something went wrong. Please try again.'));
  }

  private get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http
      .get<T>(`/api${path}`, { headers: this.headers(), params })
      .pipe(catchError((e) => this.fail(e)));
  }

  private post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .post<T>(`/api${path}`, body, { headers: this.headers() })
      .pipe(catchError((e) => this.fail(e)));
  }

  private patch<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .patch<T>(`/api${path}`, body, { headers: this.headers() })
      .pipe(catchError((e) => this.fail(e)));
  }

  /* auth */
  signup(body: { email: string; password: string; name: string }) {
    return this.post<Account & { access_token: string }>('/auth/signup', body);
  }

  login(body: { email: string; password: string }) {
    return this.post<{ access_token: string; account: Account }>('/auth/login', body);
  }

  me() {
    return this.get<Account>('/accounts/me');
  }

  updateMe(body: { display_name?: string; handle?: string }) {
    return this.patch<Account>('/accounts/me', body);
  }

  /* discovery */
  events(query: EventsQuery = {}): Observable<EventsPage> {
    let params = new HttpParams();
    if (query.category) params = params.set('category', query.category);
    if (query.city) params = params.set('city', query.city);
    if (query.q) params = params.set('q', query.q);
    params = params.set('limit', String(query.limit ?? 20));
    params = params.set('offset', String(query.offset ?? 0));
    return this.http
      .get<EventSummary[]>('/api/events', { headers: this.headers(), params, observe: 'response' })
      .pipe(
        map((res) => ({
          events: res.body ?? [],
          // The header tells a page control how many pages exist without fetching them.
          total: Number(res.headers.get('X-Total-Count') ?? (res.body ?? []).length),
        })),
        catchError((e) => this.fail(e))
      );
  }

  event(slug: string) {
    return this.get<EventDetail>(`/events/${encodeURIComponent(slug)}`);
  }

  resolve(slug: string) {
    return this.get<ResolveResult>(`/resolve/${encodeURIComponent(slug)}`);
  }

  categories() {
    return this.get<CategoryCount[]>('/categories');
  }

  createEvent(body: Record<string, unknown>) {
    return this.post<EventDetail>('/events', body);
  }

  updateEvent(slug: string, body: Record<string, unknown>) {
    return this.patch<EventDetail>(`/events/${encodeURIComponent(slug)}`, body);
  }

  cancelEvent(slug: string, reason: string) {
    return this.post<EventDetail>(`/events/${encodeURIComponent(slug)}/cancel`, { reason });
  }

  /* registrations */
  register(eventSlug: string) {
    return this.post<Registration>('/registrations', { event_slug: eventSlug });
  }

  myRegistrations() {
    return this.get<Registration[]>('/registrations/me');
  }

  cancelRegistration(id: string) {
    return this.post<Registration>(`/registrations/${id}/cancel`);
  }

  approve(id: string) {
    return this.post<Registration>(`/registrations/${id}/approve`);
  }

  decline(id: string) {
    return this.post<Registration>(`/registrations/${id}/decline`);
  }

  guests(slug: string) {
    return this.get<GuestRow[]>(`/events/${encodeURIComponent(slug)}/registrations`);
  }

  /* tickets */
  ticket(code: string) {
    return this.get<Ticket>(`/tickets/${encodeURIComponent(code)}`);
  }

  checkIn(code: string) {
    return this.post<Registration>(`/tickets/${encodeURIComponent(code)}/check-in`);
  }

  /* calendars */
  calendars() {
    return this.get<Calendar[]>('/calendars');
  }

  calendar(slug: string) {
    return this.get<Calendar & { events: EventSummary[]; is_owner: boolean; owner_name: string; owner_handle: string }>(
      `/calendars/${encodeURIComponent(slug)}`
    );
  }

  createCalendar(body: Record<string, unknown>) {
    return this.post<Calendar>('/calendars', body);
  }

  profile(handle: string) {
    return this.get<{ id: string; display_name: string; handle: string; role: string; calendars: Calendar[] }>(
      `/accounts/${encodeURIComponent(handle)}/profile`
    );
  }

  /** The CSV download, carried with the bearer token the guest list needs. */
  async downloadCsv(slug: string) {
    const res = await fetch(`/api/events/${encodeURIComponent(slug)}/registrations.csv`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (!res.ok) throw new ApiRefusal(res.status, 'That guest list is not available to you.');
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

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, map, throwError } from 'rxjs';
import {
  Account, Calendar, CalendarPage, CategoryCount, EventDetail, EventSummary,
  GuestRow, MyRegistration, PagedEvents, Registration, Ticket,
} from '../models';

const TOKEN_KEY = 'deku.token';
const ACCOUNT_KEY = 'deku.account';

/** A refusal carries a sentence and, when the server named one, a field. */
export interface Refusal {
  message: string;
  field?: string;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly account = signal<Account | null>(readStoredAccount());
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  get isSignedIn(): boolean { return this.token() !== null; }
  get isHost(): boolean { return this.account()?.role === 'host'; }

  private authHeaders(): HttpHeaders {
    const t = this.token();
    return new HttpHeaders(t ? { Authorization: `Bearer ${t}` } : {});
  }

  private handle = (err: HttpErrorResponse) => {
    // An expired or rejected token is cleared and the visitor is sent to sign
    // in, carrying where they were as `next`.
    if (err.status === 401 && this.token()) {
      this.clearSession();
      const here = this.router.url;
      this.router.navigate(['/login'], { queryParams: { next: here } });
    }
    const body: any = err.error ?? {};
    return throwError((): Refusal => ({
      message: typeof body.message === 'string'
        ? body.message
        : 'Something did not go through. Please try again.',
      field: body.field,
      status: err.status,
    }));
  };

  // ------------------------------------------------------------- session
  setSession(token: string, account: Account) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    this.token.set(token);
    this.account.set(account);
  }

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    this.token.set(null);
    this.account.set(null);
  }

  login(email: string, password: string): Observable<Account> {
    return this.http.post<any>('/api/auth/login', { email, password }).pipe(
      map((res) => {
        this.setSession(res.access_token, res.account);
        return res.account as Account;
      }),
      catchError(this.handle),
    );
  }

  signup(name: string, email: string, password: string): Observable<Account> {
    return this.http.post<any>('/api/auth/signup', { name, email, password }).pipe(
      map((res) => {
        const account: Account = {
          id: res.id, email: res.email, display_name: res.display_name,
          handle: res.handle, role: res.role,
        };
        this.setSession(res.access_token, account);
        return account;
      }),
      catchError(this.handle),
    );
  }

  me(): Observable<Account> {
    return this.http.get<Account>('/api/accounts/me', { headers: this.authHeaders() }).pipe(
      map((a) => {
        this.account.set(a);
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
        return a;
      }),
      catchError(this.handle),
    );
  }

  updateMe(patch: { display_name?: string; handle?: string }): Observable<Account> {
    return this.http.patch<Account>('/api/accounts/me', patch, { headers: this.authHeaders() }).pipe(
      map((a) => {
        this.account.set(a);
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
        return a;
      }),
      catchError(this.handle),
    );
  }

  // -------------------------------------------------------------- events
  listEvents(filters: {
    category?: string; city?: string; q?: string; limit?: number; offset?: number;
  }): Observable<PagedEvents> {
    let params = new HttpParams();
    if (filters.category) params = params.set('category', filters.category);
    if (filters.city) params = params.set('city', filters.city);
    if (filters.q) params = params.set('q', filters.q);
    params = params.set('limit', String(filters.limit ?? 20));
    params = params.set('offset', String(filters.offset ?? 0));
    return this.http.get<EventSummary[]>('/api/events', { params, observe: 'response' }).pipe(
      map((res) => ({
        items: res.body ?? [],
        total: Number(res.headers.get('X-Total-Count') ?? 0),
      })),
      catchError(this.handle),
    );
  }

  getEvent(slug: string): Observable<EventDetail> {
    return this.http.get<EventDetail>(`/api/events/${encodeURIComponent(slug)}`, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  createEvent(body: Record<string, unknown>): Observable<EventDetail> {
    return this.http.post<EventDetail>('/api/events', body, { headers: this.authHeaders() })
      .pipe(catchError(this.handle));
  }

  updateEvent(slug: string, body: Record<string, unknown>): Observable<EventDetail> {
    return this.http.patch<EventDetail>(`/api/events/${encodeURIComponent(slug)}`, body, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  cancelEvent(slug: string, reason: string): Observable<EventDetail> {
    return this.http.post<EventDetail>(`/api/events/${encodeURIComponent(slug)}/cancel`,
      { reason }, { headers: this.authHeaders() }).pipe(catchError(this.handle));
  }

  guestList(slug: string): Observable<GuestRow[]> {
    return this.http.get<GuestRow[]>(`/api/events/${encodeURIComponent(slug)}/registrations`, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  /** The CSV is fetched with the bearer token and handed to the browser as a
   *  download, so the export obeys the same authorization as the JSON list. */
  downloadCsv(slug: string): Observable<Blob> {
    return this.http.get(`/api/events/${encodeURIComponent(slug)}/registrations.csv`, {
      headers: this.authHeaders(), responseType: 'blob',
    }).pipe(catchError(this.handle));
  }

  // ------------------------------------------------------- registrations
  register(eventSlug: string): Observable<Registration> {
    return this.http.post<Registration>('/api/registrations', { event_slug: eventSlug }, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  myRegistrations(): Observable<MyRegistration[]> {
    return this.http.get<MyRegistration[]>('/api/registrations/me', {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  cancelRegistration(id: number): Observable<Registration> {
    return this.http.post<Registration>(`/api/registrations/${id}/cancel`, {}, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  approve(id: number): Observable<Registration> {
    return this.http.post<Registration>(`/api/registrations/${id}/approve`, {}, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  decline(id: number): Observable<Registration> {
    return this.http.post<Registration>(`/api/registrations/${id}/decline`, {}, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  // ------------------------------------------------------------- tickets
  getTicket(code: string): Observable<Ticket> {
    return this.http.get<Ticket>(`/api/tickets/${encodeURIComponent(code)}`)
      .pipe(catchError(this.handle));
  }

  checkIn(code: string): Observable<Registration> {
    return this.http.post<Registration>(`/api/tickets/${encodeURIComponent(code)}/check-in`, {}, {
      headers: this.authHeaders(),
    }).pipe(catchError(this.handle));
  }

  // ----------------------------------------------------------- calendars
  myCalendars(): Observable<Calendar[]> {
    return this.http.get<Calendar[]>('/api/calendars', { headers: this.authHeaders() })
      .pipe(catchError(this.handle));
  }

  createCalendar(body: Record<string, unknown>): Observable<Calendar> {
    return this.http.post<Calendar>('/api/calendars', body, { headers: this.authHeaders() })
      .pipe(catchError(this.handle));
  }

  getCalendar(slug: string): Observable<CalendarPage> {
    return this.http.get<CalendarPage>(`/api/calendars/${encodeURIComponent(slug)}`)
      .pipe(catchError(this.handle));
  }

  getProfile(handle: string): Observable<any> {
    return this.http.get<any>(`/api/accounts/handle/${encodeURIComponent(handle)}`)
      .pipe(catchError(this.handle));
  }

  // ------------------------------------------------------------ resolve
  resolve(slug: string): Observable<{ kind: string; slug: string }> {
    return this.http.get<{ kind: string; slug: string }>(`/api/resolve/${encodeURIComponent(slug)}`)
      .pipe(catchError(this.handle));
  }

  categories(): Observable<CategoryCount[]> {
    return this.http.get<CategoryCount[]>('/api/categories').pipe(catchError(this.handle));
  }
}

function readStoredAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

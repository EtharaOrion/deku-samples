import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type {
  Account,
  AccountPage,
  Calendar,
  CalendarPage,
  CategoryPage,
  EventDetail,
  EventSummary,
  GuestRow,
  LandingData,
  MyRegistrationRow,
  Registration,
  TicketView,
} from './models';

export class ApiFailure extends Error {
  status: number;
  field?: string;
  rateLimit?: number;

  constructor(status: number, message: string, field?: string, rateLimit?: number) {
    super(message);
    this.status = status;
    this.field = field;
    this.rateLimit = rateLimit;
  }
}

export interface EventQuery {
  category?: string;
  city?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface EventPage {
  events: EventSummary[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  /** Same origin: the shell and the JSON API share one address. */
  private base = '/api';

  private fail = (e: HttpErrorResponse) => {
    const body: any = e.error ?? {};
    const message =
      typeof body?.message === 'string'
        ? body.message
        : e.status === 0
          ? 'The app could not reach the server. Check your connection and try again.'
          : 'Something did not work. Try again in a moment.';
    return throwError(() => new ApiFailure(e.status, message, body?.field, body?.rate_limit));
  };

  private wrap<T>(o: Observable<T>): Observable<T> {
    return o.pipe(catchError(this.fail));
  }

  // -- auth ----------------------------------------------------------------

  signup(body: { email: string; password: string; name: string }) {
    return this.wrap(
      this.http.post<Account & { access_token: string }>(`${this.base}/auth/signup`, body),
    );
  }

  login(body: { email: string; password: string }) {
    return this.wrap(
      this.http.post<{ access_token: string; account: Account }>(`${this.base}/auth/login`, body),
    );
  }

  // -- public --------------------------------------------------------------

  landing() {
    return this.wrap(this.http.get<LandingData>(`${this.base}/landing`));
  }

  resolve(slug: string) {
    return this.wrap(
      this.http.get<{ kind: 'system' | 'category' | 'event' | 'calendar' | 'account'; slug: string }>(
        `${this.base}/resolve/${encodeURIComponent(slug)}`,
      ),
    );
  }

  events(query: EventQuery): Observable<EventPage> {
    let params = new HttpParams();
    if (query.category) params = params.set('category', query.category);
    if (query.city) params = params.set('city', query.city);
    if (query.q) params = params.set('q', query.q);
    params = params.set('limit', String(query.limit ?? 20));
    params = params.set('offset', String(query.offset ?? 0));
    return this.wrap(
      this.http
        .get<EventSummary[]>(`${this.base}/events`, { params, observe: 'response' })
        .pipe(
          map((res) => ({
            events: res.body ?? [],
            total: Number(res.headers.get('X-Total-Count') ?? 0),
          })),
        ),
    );
  }

  event(slug: string) {
    return this.wrap(this.http.get<EventDetail>(`${this.base}/events/${encodeURIComponent(slug)}`));
  }

  calendarPage(slug: string) {
    return this.wrap(this.http.get<CalendarPage>(`${this.base}/calendars/${encodeURIComponent(slug)}`));
  }

  accountPage(handle: string) {
    return this.wrap(
      this.http.get<AccountPage>(`${this.base}/accounts/handle/${encodeURIComponent(handle)}`),
    );
  }

  category(name: string) {
    return this.wrap(this.http.get<CategoryPage>(`${this.base}/categories/${encodeURIComponent(name)}`));
  }

  ticket(code: string) {
    return this.wrap(this.http.get<TicketView>(`${this.base}/tickets/${encodeURIComponent(code)}`));
  }

  // -- account -------------------------------------------------------------

  me() {
    return this.wrap(this.http.get<Account>(`${this.base}/accounts/me`));
  }

  updateMe(body: { display_name?: string; handle?: string }) {
    return this.wrap(this.http.patch<Account>(`${this.base}/accounts/me`, body));
  }

  // -- calendars -----------------------------------------------------------

  myCalendars() {
    return this.wrap(this.http.get<Calendar[]>(`${this.base}/calendars`));
  }

  createCalendar(body: { name: string; slug: string; category: string; city: string; is_public: boolean }) {
    return this.wrap(this.http.post<Calendar>(`${this.base}/calendars`, body));
  }

  // -- events, as a host ---------------------------------------------------

  createEvent(body: Record<string, unknown>) {
    return this.wrap(this.http.post<EventDetail>(`${this.base}/events`, body));
  }

  patchEvent(slug: string, body: Record<string, unknown>) {
    return this.wrap(
      this.http.patch<EventDetail>(`${this.base}/events/${encodeURIComponent(slug)}`, body),
    );
  }

  cancelEvent(slug: string, reason: string) {
    return this.wrap(
      this.http.post<EventDetail>(`${this.base}/events/${encodeURIComponent(slug)}/cancel`, { reason }),
    );
  }

  guestList(slug: string) {
    return this.wrap(
      this.http.get<GuestRow[]>(`${this.base}/events/${encodeURIComponent(slug)}/registrations`),
    );
  }

  guestListCsv(slug: string) {
    return this.wrap(
      this.http.get(`${this.base}/events/${encodeURIComponent(slug)}/registrations.csv`, {
        responseType: 'text',
      }),
    );
  }

  // -- registrations -------------------------------------------------------

  register(eventSlug: string) {
    return this.wrap(this.http.post<Registration>(`${this.base}/registrations`, { event_slug: eventSlug }));
  }

  myRegistrations() {
    return this.wrap(this.http.get<MyRegistrationRow[]>(`${this.base}/registrations/me`));
  }

  cancelRegistration(id: number) {
    return this.wrap(this.http.post<Registration>(`${this.base}/registrations/${id}/cancel`, {}));
  }

  approve(id: number) {
    return this.wrap(this.http.post<Registration>(`${this.base}/registrations/${id}/approve`, {}));
  }

  decline(id: number) {
    return this.wrap(this.http.post<Registration>(`${this.base}/registrations/${id}/decline`, {}));
  }

  checkIn(code: string) {
    return this.wrap(
      this.http.post<Registration>(`${this.base}/tickets/${encodeURIComponent(code)}/check-in`, {}),
    );
  }
}

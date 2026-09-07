import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import type {
  Account,
  Calendar,
  CalendarPage,
  CategoryPage,
  EventDetail,
  EventSummary,
  GuestRow,
  MyRegistration,
  MyRegistrationRow,
  PublicAccount,
  Refusal,
  ResolveResult,
  Ticket,
} from './models';

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

/** Every screen's data arrives from /api on the same origin. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  private fail(e: HttpErrorResponse) {
    const body = (e.error ?? {}) as Record<string, unknown>;
    const refusal: Refusal = {
      message:
        typeof body['message'] === 'string' && body['message']
          ? (body['message'] as string)
          : e.status === 0
            ? 'The app could not reach the server. Check your connection and try again.'
            : 'Something did not go through. Try that again in a moment.',
      status: e.status,
      ...body,
    };
    return throwError(() => refusal);
  }

  private wrap<T>(o: Observable<T>): Observable<T> {
    return o.pipe(catchError((e: HttpErrorResponse) => this.fail(e)));
  }

  /* ---- auth ---- */

  signup(body: { email: string; password: string; name: string }) {
    return this.wrap(
      this.http.post<Account & { access_token: string }>('/api/auth/signup', body)
    );
  }

  login(body: { email: string; password: string }) {
    return this.wrap(
      this.http.post<{ access_token: string; account: Account }>('/api/auth/login', body)
    );
  }

  me() {
    return this.wrap(this.http.get<Account>('/api/accounts/me'));
  }

  updateMe(body: { display_name?: string; handle?: string }) {
    return this.wrap(this.http.patch<Account>('/api/accounts/me', body));
  }

  /* ---- discovery ---- */

  resolve(slug: string) {
    return this.wrap(this.http.get<ResolveResult>(`/api/resolve/${encodeURIComponent(slug)}`));
  }

  events(query: EventQuery = {}): Observable<EventPage> {
    let params = new HttpParams();
    if (query.category) params = params.set('category', query.category);
    if (query.city) params = params.set('city', query.city);
    if (query.q) params = params.set('q', query.q);
    params = params.set('limit', String(query.limit ?? 20));
    params = params.set('offset', String(query.offset ?? 0));
    return this.wrap(
      this.http
        .get<EventSummary[]>('/api/events', { params, observe: 'response' })
        .pipe(
          map((res) => ({
            events: res.body ?? [],
            total: Number(res.headers.get('X-Total-Count') ?? (res.body?.length ?? 0)),
          }))
        )
    );
  }

  landing() {
    return this.wrap(
      this.http.get<{ events: EventSummary[]; calendars: CalendarPage[] }>('/api/landing')
    );
  }

  category(name: string) {
    return this.wrap(this.http.get<CategoryPage>(`/api/categories/${encodeURIComponent(name)}`));
  }

  /* ---- events ---- */

  event(slug: string) {
    return this.wrap(this.http.get<EventDetail>(`/api/events/${encodeURIComponent(slug)}`));
  }

  createEvent(body: Record<string, unknown>) {
    return this.wrap(this.http.post<EventDetail>('/api/events', body));
  }

  updateEvent(slug: string, body: Record<string, unknown>) {
    return this.wrap(this.http.patch<EventDetail>(`/api/events/${encodeURIComponent(slug)}`, body));
  }

  cancelEvent(slug: string, reason: string) {
    return this.wrap(
      this.http.post<EventDetail>(`/api/events/${encodeURIComponent(slug)}/cancel`, { reason })
    );
  }

  guests(slug: string) {
    return this.wrap(
      this.http.get<GuestRow[]>(`/api/events/${encodeURIComponent(slug)}/registrations`)
    );
  }

  /* ---- registrations ---- */

  register(eventSlug: string) {
    return this.wrap(
      this.http.post<MyRegistration>('/api/registrations', { event_slug: eventSlug })
    );
  }

  myRegistrations() {
    return this.wrap(this.http.get<MyRegistrationRow[]>('/api/registrations/me'));
  }

  cancelRegistration(id: string) {
    return this.wrap(this.http.post<MyRegistration>(`/api/registrations/${id}/cancel`, {}));
  }

  approve(id: string) {
    return this.wrap(
      this.http.post<MyRegistration & { moved_to_waitlist: boolean }>(
        `/api/registrations/${id}/approve`,
        {}
      )
    );
  }

  decline(id: string) {
    return this.wrap(this.http.post<MyRegistration>(`/api/registrations/${id}/decline`, {}));
  }

  /* ---- tickets ---- */

  ticket(code: string) {
    return this.wrap(this.http.get<Ticket>(`/api/tickets/${encodeURIComponent(code)}`));
  }

  checkIn(code: string) {
    return this.wrap(
      this.http.post<MyRegistration & { already_checked_in: boolean; checked_in_at: string }>(
        `/api/tickets/${encodeURIComponent(code)}/check-in`,
        {}
      )
    );
  }

  /* ---- calendars ---- */

  calendars() {
    return this.wrap(this.http.get<Calendar[]>('/api/calendars'));
  }

  createCalendar(body: {
    name: string;
    slug: string;
    category: string;
    city: string;
    is_public: boolean;
  }) {
    return this.wrap(this.http.post<Calendar>('/api/calendars', body));
  }

  calendar(slug: string) {
    return this.wrap(this.http.get<CalendarPage>(`/api/calendars/${encodeURIComponent(slug)}`));
  }

  account(handle: string) {
    return this.wrap(this.http.get<PublicAccount>(`/api/accounts/${encodeURIComponent(handle)}`));
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of, firstValueFrom } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface Account { id: number; email: string; display_name: string; handle: string; role: 'host' | 'guest'; }
export interface Registration {
  id: number; event_id: number; account_id?: number; status: string;
  email?: string; display_name?: string;
  waitlist_position?: number | null; ticket_code?: string | null;
  checked_in_at?: string | null; created_at: string; updated_at: string;
  event_title?: string; event_slug?: string; already_checked_in?: boolean; starts_at?: string; ends_at?: string;
  time_zone?: string; city?: string; category?: string; theme_hex?: string;
  cover_seed?: string; event_state?: string; capacity?: number; notice?: string;
}
export interface EventItem {
  id: number; slug: string; title: string; category: string; city: string;
  time_zone: string; starts_at: string; ends_at: string; capacity: number;
  confirmed_count: number; remaining: number; state: string; theme_hex: string;
  cover_seed: string; description?: string; approval_required?: boolean;
  waitlist_enabled?: boolean; calendar_name?: string; published_events?: number;
  ended?: boolean; cancel_reason?: string | null;
  calendar?: { slug: string; name: string; category: string; city: string; is_public: boolean; owner: { id: number; display_name: string; handle: string } | null };
  my_registration?: { id: number; status: string; waitlist_position: number | null; ticket_code: string | null; checked_in_at: string | null } | null;
}
export interface Calendar { id: number; owner_account_id: number; name: string; slug: string; category: string; city: string; is_public: boolean; published_events?: number; }

const TOKEN_KEY = 'cc.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _account = new BehaviorSubject<Account | null>(null);
  account$ = this._account.asObservable();
  get accountValue(): Account | null { return this._account.value; }
  private _ready = new BehaviorSubject<boolean>(false);
  ready$ = this._ready.asObservable();

  constructor(private http: HttpClient) {
    const t = this.token();
    if (t) {
      this.http.get<Account>('/api/accounts/me', { headers: this.authHeaders(t) }).pipe(
        catchError(() => { localStorage.removeItem(TOKEN_KEY); return of(null as unknown as Account); })
      ).subscribe(a => { this._account.next(a); this._ready.next(true); });
    } else {
      this._account.next(null);
      this._ready.next(true);
    }
  }

  token(): string | null { return localStorage.getItem(TOKEN_KEY); }
  authHeaders(t?: string | null): HttpHeaders {
    const tok = t ?? this.token();
    return tok ? new HttpHeaders({ authorization: `Bearer ${tok}` }) : new HttpHeaders();
  }

  setToken(t: string | null) {
    if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
  }

  async loadAccount(): Promise<void> {
    const t = this.token();
    if (!t) { this._account.next(null); return; }
    try {
      const a = await firstValueFrom(this.http.get<Account | null>('/api/accounts/me', { headers: this.authHeaders() })
        .pipe(catchError(() => of(null))));
      this._account.next(a ?? null);
      if (!a) this.setToken(null);
    } catch {
      this.setToken(null); this._account.next(null);
    }
  }

  async login(email: string, password: string): Promise<Account> {
    const r = await firstValueFrom(this.http.post<Account & { access_token: string }>('/api/auth/login', { email, password }));
    this.setToken(r.access_token);
    this._account.next({ id: r.id, email: r.email, display_name: r.display_name, handle: r.handle, role: r.role });
    return r;
  }

  async signup(email: string, password: string, name: string): Promise<Account> {
    const r = await firstValueFrom(this.http.post<Account & { access_token: string }>('/api/auth/signup', { email, password, name }));
    this.setToken(r.access_token);
    this._account.next({ id: r.id, email: r.email, display_name: r.display_name, handle: r.handle, role: r.role });
    return r;
  }

  logout() { this.setToken(null); this._account.next(null); }

  patchMe(body: { display_name?: string; handle?: string }): Observable<Account> {
    return this.http.patch<Account>('/api/accounts/me', body, { headers: this.authHeaders() });
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public field?: string, public body?: any) { super(message); }
}

@Injectable({ providedIn: 'root' })
export class Api {
  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): HttpHeaders { return this.auth.authHeaders(); }

  /** Await an observable as a plain value. */
  pr<T>(o: Observable<T>): Promise<T> { return firstValueFrom(o); }

  private err<T>(): (source: Observable<T>) => Observable<T> {
    return catchError((e: any): never => {
      const b = e?.error ?? {};
      throw new ApiError(e?.status ?? 0, b.message ?? 'Something went wrong on our side. Please try again.', b.field, b);
    });
  }

  listEvents(f: { category?: string; city?: string; q?: string; limit?: number; offset?: number } = {}):
      Observable<{ items: EventItem[]; total: number }> {
    let p = new HttpParams();
    if (f.category) p = p.set('category', f.category);
    if (f.city) p = p.set('city', f.city);
    if (f.q) p = p.set('q', f.q);
    if (f.limit != null) p = p.set('limit', String(f.limit));
    if (f.offset != null) p = p.set('offset', String(f.offset));
    return this.http.get<EventItem[]>('/api/events', { params: p, headers: this.headers(), observe: 'response' }).pipe(
      map((r: any) => ({ items: (r.body ?? []) as EventItem[], total: Number(r.headers.get('X-Total-Count') ?? 0) })),
      this.err<{ items: EventItem[]; total: number }>()
    );
  }

  getEvent(slug: string) {
    return this.http.get<EventItem>(`/api/events/${slug}`, { headers: this.headers() }).pipe(this.err<EventItem>());
  }

  resolve(slug: string) {
    return this.http.get<{ kind: string; slug: string }>(`/api/resolve/${slug}`).pipe(this.err<{kind:string;slug:string}>());
  }

  myRegistrations() {
    return this.http.get<Registration[]>('/api/registrations/me', { headers: this.headers() }).pipe(this.err<Registration[]>());
  }

  register(eventSlug: string) {
    return this.http.post<Registration>('/api/registrations', { event_slug: eventSlug }, { headers: this.headers() }).pipe(this.err<Registration>());
  }

  cancelRegistration(id: number) {
    return this.http.post<Registration>(`/api/registrations/${id}/cancel`, {}, { headers: this.headers() }).pipe(this.err<Registration>());
  }

  getTicket(code: string) {
    return this.http.get<any>(`/api/tickets/${code}`).pipe(this.err<any>());
  }

  checkIn(code: string) {
    return this.http.post<Registration>(`/api/tickets/${code}/check-in`, {}, { headers: this.headers() }).pipe(this.err<Registration>());
  }

  approve(id: number) {
    return this.http.post<Registration>(`/api/registrations/${id}/approve`, {}, { headers: this.headers() }).pipe(this.err<Registration>());
  }
  decline(id: number) {
    return this.http.post<Registration>(`/api/registrations/${id}/decline`, {}, { headers: this.headers() }).pipe(this.err<Registration>());
  }
  hostCancelRegistration(id: number) {
    return this.http.post<Registration>(`/api/registrations/${id}/cancel-by-host`, {}, { headers: this.headers() }).pipe(this.err<Registration>());
  }

  myCalendars() {
    return this.http.get<Calendar[]>('/api/calendars', { headers: this.headers() }).pipe(this.err<Calendar[]>());
  }
  createCalendar(b: { name: string; slug: string; category: string; city: string; is_public: boolean }) {
    return this.http.post<Calendar>('/api/calendars', b, { headers: this.headers() }).pipe(this.err<Calendar>());
  }

  eventRegistrations(slug: string) {
    return this.http.get<Registration[]>(`/api/events/${slug}/registrations`, { headers: this.headers() }).pipe(this.err<Registration[]>());
  }

  createEvent(b: any) {
    return this.http.post<EventItem>('/api/events', b, { headers: this.headers() }).pipe(this.err<EventItem>());
  }
  patchEvent(slug: string, b: any) {
    return this.http.patch<EventItem>(`/api/events/${slug}`, b, { headers: this.headers() }).pipe(this.err<EventItem>());
  }
  cancelEvent(slug: string, reason: string) {
    return this.http.post<EventItem>(`/api/events/${slug}/cancel`, { reason }, { headers: this.headers() }).pipe(this.err<EventItem>());
  }

  categories() { return of(CATEGORIES); }
}

export const CATEGORIES: { slug: string; label: string; hue: string; blurb: string }[] = [
  { slug: 'family', label: 'Family', hue: '#f31a7c', blurb: 'Things to do with the people you grew up with.' },
  { slug: 'books', label: 'Books', hue: '#146aeb', blurb: 'Reading nights, swaps and signings.' },
  { slug: 'games', label: 'Games', hue: '#3cbd2c', blurb: 'Board games, playtests and tournaments.' },
  { slug: 'tech', label: 'Tech', hue: '#ab46dd', blurb: 'Talks, demos and build nights.' },
  { slug: 'food-and-drink', hue: '#d69712', label: 'Food & Drink', blurb: 'Supper clubs, tastings and markets.' },
  { slug: 'ai', label: 'AI', hue: '#007aff', blurb: 'Model demos, papers and practice.' },
  { slug: 'running', label: 'Running', hue: '#28cd41', blurb: 'Run clubs, track sessions and races.' },
  { slug: 'arts-and-culture', label: 'Arts & Culture', hue: '#f31a7c', blurb: 'Galleries, theatre and openings.' },
  { slug: 'climate', label: 'Climate', hue: '#3cbd2c', blurb: 'Clean-ups, repair and field work.' },
  { slug: 'fitness', label: 'Fitness', hue: '#146aeb', blurb: 'Training sessions and movement.' },
  { slug: 'wellness', label: 'Wellness', hue: '#ab46dd', blurb: 'Breathwork, rest and recovery.' },
  { slug: 'crypto', label: 'Crypto', hue: '#d69712', blurb: 'Meetups and protocol talks.' },
];

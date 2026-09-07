import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  Account,
  ApiRefusal,
  Calendar,
  CalendarPage,
  CategoryPage,
  EventDetail,
  EventSummary,
  GuestRow,
  Profile,
  Registration,
  Ticket,
} from './models';

export class ApiError extends Error {
  constructor(
    public status: number,
    public refusal: ApiRefusal,
  ) {
    super(refusal.message);
  }
  get field() {
    return this.refusal.field;
  }
}

export interface Paged<T> {
  items: T[];
  total: number;
}

const TOKEN_KEY = 'cc.token';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private router = inject(Router);

  /** The API lives on the same origin under /api; no address is hardcoded. */
  private base = '/api';

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

  private async request<T>(
    path: string,
    init: RequestInit & { anonymous?: boolean } = {},
  ): Promise<{ data: T; headers: Headers; status: number }> {
    const headers = new Headers(init.headers ?? {});
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = this.token;
    if (token && !init.anonymous) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(this.base + path, { ...init, headers });

    if (res.status === 401 && token) {
      // An expired token is cleared and the visitor is sent to sign in again.
      this.setToken(null);
      const next = location.pathname + location.search;
      if (!location.pathname.startsWith('/login')) {
        this.router.navigate(['/login'], { queryParams: { next } });
      }
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const refusal = (data ?? {}) as ApiRefusal;
      throw new ApiError(res.status, {
        ...refusal,
        message: refusal.message ?? 'That did not go through. Try again in a moment.',
      });
    }
    return { data: data as T, headers: res.headers, status: res.status };
  }

  private async get<T>(path: string): Promise<T> {
    return (await this.request<T>(path)).data;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return (await this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })).data;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    return (await this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })).data;
  }

  /* ---------------- auth ---------------- */

  async login(email: string, password: string): Promise<{ access_token: string; account: Account }> {
    const out = await this.post<{ access_token: string; account: Account }>('/auth/login', { email, password });
    this.setToken(out.access_token);
    return out;
  }

  async signup(name: string, email: string, password: string): Promise<Account & { access_token: string }> {
    const out = await this.post<Account & { access_token: string }>('/auth/signup', { name, email, password });
    this.setToken(out.access_token);
    return out;
  }

  me(): Promise<Account> {
    return this.get<Account>('/accounts/me');
  }

  updateMe(body: { display_name?: string; handle?: string }): Promise<Account> {
    return this.patch<Account>('/accounts/me', body);
  }

  /* ---------------- discovery ---------------- */

  async listEvents(params: {
    category?: string;
    city?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<Paged<EventSummary>> {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.city) qs.set('city', params.city);
    if (params.q) qs.set('q', params.q);
    qs.set('limit', String(params.limit ?? 20));
    qs.set('offset', String(params.offset ?? 0));
    const res = await this.request<EventSummary[]>(`/events?${qs.toString()}`);
    return { items: res.data, total: Number(res.headers.get('X-Total-Count') ?? res.data.length) };
  }

  event(slug: string): Promise<EventDetail> {
    return this.get<EventDetail>(`/events/${encodeURIComponent(slug)}`);
  }

  resolve(slug: string): Promise<{ kind: string; slug: string }> {
    return this.get(`/resolve/${encodeURIComponent(slug)}`);
  }

  landing(): Promise<{ events: EventSummary[]; calendars: Calendar[] }> {
    return this.get('/landing');
  }

  category(name: string): Promise<CategoryPage> {
    return this.get<CategoryPage>(`/categories/${encodeURIComponent(name)}`);
  }

  calendar(slug: string): Promise<CalendarPage> {
    return this.get<CalendarPage>(`/calendars/${encodeURIComponent(slug)}`);
  }

  profile(handle: string): Promise<Profile> {
    return this.get<Profile>(`/profiles/${encodeURIComponent(handle)}`);
  }

  /* ---------------- events, host side ---------------- */

  createEvent(body: Record<string, unknown>): Promise<EventDetail> {
    return this.post<EventDetail>('/events', body);
  }

  updateEvent(slug: string, body: Record<string, unknown>): Promise<EventDetail> {
    return this.patch<EventDetail>(`/events/${encodeURIComponent(slug)}`, body);
  }

  cancelEvent(slug: string, reason: string): Promise<EventDetail> {
    return this.post<EventDetail>(`/events/${encodeURIComponent(slug)}/cancel`, { reason });
  }

  guests(slug: string): Promise<GuestRow[]> {
    return this.get<GuestRow[]>(`/events/${encodeURIComponent(slug)}/registrations`);
  }

  async downloadGuestCsv(slug: string): Promise<void> {
    const res = await fetch(`${this.base}/events/${encodeURIComponent(slug)}/registrations.csv`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, { message: 'That guest list is not yours to download.' });
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

  /* ---------------- registrations ---------------- */

  register(eventSlug: string): Promise<Registration> {
    return this.post<Registration>('/registrations', { event_slug: eventSlug });
  }

  myRegistrations(): Promise<Registration[]> {
    return this.get<Registration[]>('/registrations/me');
  }

  cancelRegistration(id: number): Promise<Registration> {
    return this.post<Registration>(`/registrations/${id}/cancel`);
  }

  approve(id: number): Promise<Registration> {
    return this.post<Registration>(`/registrations/${id}/approve`);
  }

  decline(id: number): Promise<Registration> {
    return this.post<Registration>(`/registrations/${id}/decline`);
  }

  /* ---------------- tickets ---------------- */

  ticket(code: string): Promise<Ticket> {
    return this.get<Ticket>(`/tickets/${encodeURIComponent(code)}`);
  }

  checkIn(code: string): Promise<Registration> {
    return this.post<Registration>(`/tickets/${encodeURIComponent(code)}/check-in`);
  }

  /* ---------------- calendars ---------------- */

  myCalendars(): Promise<Calendar[]> {
    return this.get<Calendar[]>('/calendars');
  }

  createCalendar(body: {
    name: string;
    slug: string;
    category: string;
    city: string;
    is_public: boolean;
  }): Promise<Calendar> {
    return this.post<Calendar>('/calendars', body);
  }
}

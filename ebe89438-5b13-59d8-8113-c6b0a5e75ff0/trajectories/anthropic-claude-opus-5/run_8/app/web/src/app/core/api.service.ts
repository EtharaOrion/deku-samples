import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type {
  Account,
  Calendar,
  CalendarPage,
  CategoryPage,
  EventDetail,
  EventSummary,
  GuestRow,
  ProfilePage,
  Registration,
  ResolveResult,
  TicketView,
} from './models';

export class ApiError extends Error {
  status: number;
  field: string | null;
  constructor(status: number, message: string, field: string | null = null) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const TOKEN_KEY = 'deku.token';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private router = inject(Router);
  readonly account = signal<Account | null>(null);
  readonly bootstrapped = signal(false);

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

  /** An expired token is cleared and the visitor is sent to sign in again. */
  private expire() {
    this.setToken(null);
    this.account.set(null);
    const current = this.router.url === '/' ? '' : this.router.url;
    this.router.navigate(['/login'], current ? { queryParams: { next: current } } : {});
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; auth?: boolean; withHeaders?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const token = this.token;
    if (token) headers['authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401 && token) {
      this.expire();
      throw new ApiError(401, 'Your session has expired. Sign in again to continue.');
    }

    const text = await res.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const message =
        (data && typeof data === 'object' && data.message) ||
        'Something did not go through. Check the details and try again.';
      throw new ApiError(res.status, message, (data && data.field) ?? null);
    }
    if (options.withHeaders) return { data, headers: res.headers } as unknown as T;
    return data as T;
  }

  // ---- auth
  async login(email: string, password: string): Promise<Account> {
    const r = await this.request<{ access_token: string; account: Account }>('POST', '/auth/login', {
      body: { email, password },
    });
    this.setToken(r.access_token);
    this.account.set(r.account);
    return r.account;
  }

  async signup(name: string, email: string, password: string): Promise<Account> {
    const r = await this.request<Account & { access_token: string }>('POST', '/auth/signup', {
      body: { name, email, password },
    });
    this.setToken(r.access_token);
    const { access_token, ...acc } = r as any;
    this.account.set(acc);
    return acc;
  }

  logout() {
    this.setToken(null);
    this.account.set(null);
  }

  async loadMe(): Promise<Account | null> {
    if (!this.token) {
      this.account.set(null);
      this.bootstrapped.set(true);
      return null;
    }
    try {
      const acc = await this.request<Account>('GET', '/accounts/me');
      this.account.set(acc);
      return acc;
    } catch {
      this.setToken(null);
      this.account.set(null);
      return null;
    } finally {
      this.bootstrapped.set(true);
    }
  }

  // ---- public reads
  resolve(slug: string) {
    return this.request<ResolveResult>('GET', `/resolve/${encodeURIComponent(slug)}`);
  }

  async listEvents(params: { category?: string; city?: string; q?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.city) qs.set('city', params.city);
    if (params.q) qs.set('q', params.q);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const r = await this.request<{ data: EventSummary[]; headers: Headers }>(
      'GET',
      `/events${qs.toString() ? '?' + qs.toString() : ''}`,
      { withHeaders: true },
    );
    return { events: r.data, total: Number(r.headers.get('X-Total-Count') ?? r.data.length) };
  }

  getEvent(slug: string) {
    return this.request<EventDetail>('GET', `/events/${encodeURIComponent(slug)}`);
  }

  getCalendar(slug: string) {
    return this.request<CalendarPage>('GET', `/calendars/${encodeURIComponent(slug)}`);
  }

  getCategory(name: string) {
    return this.request<CategoryPage>('GET', `/categories/${encodeURIComponent(name)}`);
  }

  getProfile(handle: string) {
    return this.request<ProfilePage>('GET', `/accounts/handle/${encodeURIComponent(handle)}`);
  }

  getTicket(code: string) {
    return this.request<TicketView>('GET', `/tickets/${encodeURIComponent(code)}`);
  }

  // ---- registrations
  register(eventSlug: string) {
    return this.request<Registration>('POST', '/registrations', { body: { event_slug: eventSlug } });
  }

  myRegistrations() {
    return this.request<Registration[]>('GET', '/registrations/me');
  }

  cancelRegistration(id: string) {
    return this.request<Registration>('POST', `/registrations/${id}/cancel`);
  }

  approve(id: string) {
    return this.request<Registration>('POST', `/registrations/${id}/approve`);
  }

  decline(id: string) {
    return this.request<Registration>('POST', `/registrations/${id}/decline`);
  }

  checkIn(code: string) {
    return this.request<Registration>('POST', `/tickets/${encodeURIComponent(code)}/check-in`);
  }

  // ---- host
  guestList(slug: string) {
    return this.request<GuestRow[]>('GET', `/events/${encodeURIComponent(slug)}/registrations`);
  }

  async downloadGuestListCsv(slug: string): Promise<void> {
    const res = await fetch(`/api/events/${encodeURIComponent(slug)}/registrations.csv`, {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, 'That export is not available to this account.');
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

  calendars() {
    return this.request<Calendar[]>('GET', '/calendars');
  }

  createCalendar(body: { name: string; slug: string; category: string; city: string; is_public: boolean }) {
    return this.request<Calendar>('POST', '/calendars', { body });
  }

  createEvent(body: Record<string, unknown>) {
    return this.request<EventDetail>('POST', '/events', { body });
  }

  patchEvent(slug: string, body: Record<string, unknown>) {
    return this.request<EventDetail>('PATCH', `/events/${encodeURIComponent(slug)}`, { body });
  }

  cancelEvent(slug: string, reason: string) {
    return this.request<EventDetail>('POST', `/events/${encodeURIComponent(slug)}/cancel`, { body: { reason } });
  }

  updateAccount(body: { display_name?: string; handle?: string }) {
    return this.request<Account>('PATCH', '/accounts/me', { body });
  }
}

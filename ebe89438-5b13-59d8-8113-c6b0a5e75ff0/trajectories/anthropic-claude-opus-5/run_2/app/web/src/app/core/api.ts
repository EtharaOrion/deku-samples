import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Account,
  ApiRefusal,
  Calendar,
  CategorySummary,
  EventDetail,
  EventSummary,
  GuestRow,
  MyRegistration,
  PublicCalendar,
  PublicProfile,
  Registration,
  Ticket,
} from './models';

const TOKEN_KEY = 'cc.token';
const ACCOUNT_KEY = 'cc.account';

export class ApiError extends Error implements ApiRefusal {
  constructor(
    public status: number,
    message: string,
    public field: string | null = null,
  ) {
    super(message);
  }
}

export interface Page<T> {
  items: T[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private router = inject(Router);

  readonly account = signal<Account | null>(readStoredAccount());
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  get isSignedIn() {
    return this.token() !== null;
  }

  private headers(withBody: boolean): Record<string, string> {
    const h: Record<string, string> = {};
    if (withBody) h['content-type'] = 'application/json';
    const t = this.token();
    if (t) h['authorization'] = `Bearer ${t}`;
    return h;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<{ data: T; headers: Headers }> {
    const res = await fetch(`/api${path}`, {
      method: init.method || 'GET',
      headers: this.headers(init.body !== undefined),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });

    if (res.status === 401 && this.token()) {
      // An expired token is cleared and the visitor is sent to sign in again.
      this.clearSession();
      const next = this.router.url || '/home';
      this.router.navigate(['/login'], { queryParams: { next } });
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
      const refusal = (data ?? {}) as { message?: string; field?: string | null };
      throw new ApiError(
        res.status,
        refusal.message || 'That did not work. Try again in a moment.',
        refusal.field ?? null,
      );
    }
    return { data: data as T, headers: res.headers };
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return (await this.request<T>(path, { signal })).data;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return (await this.request<T>(path, { method: 'POST', body: body ?? {} })).data;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    return (await this.request<T>(path, { method: 'PATCH', body })).data;
  }

  /* ------------------------------------------------------------------ auth */

  private storeSession(token: string, account: Account) {
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

  async login(email: string, password: string): Promise<Account> {
    const out = await this.post<{ access_token: string; account: Account }>(
      '/auth/login',
      { email, password },
    );
    this.storeSession(out.access_token, out.account);
    return out.account;
  }

  async signup(name: string, email: string, password: string): Promise<Account> {
    const out = await this.post<Account & { access_token: string }>('/auth/signup', {
      name,
      email,
      password,
    });
    const account: Account = {
      id: out.id,
      email: out.email,
      display_name: out.display_name,
      handle: out.handle,
      role: out.role,
    };
    this.storeSession(out.access_token, account);
    return account;
  }

  logout() {
    this.clearSession();
  }

  /** Confirms the stored token still stands, refreshing the cached account. */
  async refreshAccount(): Promise<Account | null> {
    if (!this.token()) return null;
    try {
      const me = await this.get<Account>('/accounts/me');
      this.account.set(me);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(me));
      return me;
    } catch {
      return null;
    }
  }

  updateMe(body: { display_name?: string; handle?: string }) {
    return this.patch<Account>('/accounts/me', body).then((acc) => {
      this.account.set(acc);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
      return acc;
    });
  }

  /* ---------------------------------------------------------------- events */

  async listEvents(
    params: { category?: string; city?: string; q?: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ): Promise<Page<EventSummary>> {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.city) qs.set('city', params.city);
    if (params.q) qs.set('q', params.q);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const suffix = qs.toString();
    const out = await this.request<EventSummary[]>(
      `/events${suffix ? `?${suffix}` : ''}`,
      { signal },
    );
    return {
      items: out.data,
      total: Number(out.headers.get('X-Total-Count') ?? out.data.length),
    };
  }

  getEvent(slug: string, signal?: AbortSignal) {
    return this.get<EventDetail>(`/events/${encodeURIComponent(slug)}`, signal);
  }

  createEvent(body: Record<string, unknown>) {
    return this.post<EventDetail>('/events', body);
  }

  updateEvent(slug: string, body: Record<string, unknown>) {
    return this.patch<EventDetail>(`/events/${encodeURIComponent(slug)}`, body);
  }

  cancelEvent(slug: string, reason: string) {
    return this.post<EventDetail>(`/events/${encodeURIComponent(slug)}/cancel`, {
      reason,
    });
  }

  listGuests(slug: string, signal?: AbortSignal) {
    return this.get<GuestRow[]>(
      `/events/${encodeURIComponent(slug)}/registrations`,
      signal,
    );
  }

  csvUrl(slug: string) {
    return `/api/events/${encodeURIComponent(slug)}/registrations.csv`;
  }

  /** The export carries the bearer token, so it is fetched and then saved. */
  async downloadCsv(slug: string): Promise<void> {
    const res = await fetch(this.csvUrl(slug), { headers: this.headers(false) });
    if (!res.ok) {
      throw new ApiError(res.status, 'That export is not available to you.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* --------------------------------------------------------- registrations */

  register(eventSlug: string) {
    return this.post<Registration>('/registrations', { event_slug: eventSlug });
  }

  myRegistrations(signal?: AbortSignal) {
    return this.get<MyRegistration[]>('/registrations/me', signal);
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

  /* --------------------------------------------------------------- tickets */

  getTicket(code: string, signal?: AbortSignal) {
    return this.get<Ticket>(`/tickets/${encodeURIComponent(code)}`, signal);
  }

  checkIn(code: string) {
    return this.post<Registration>(`/tickets/${encodeURIComponent(code)}/check-in`);
  }

  /* ------------------------------------------------------------- calendars */

  myCalendars(signal?: AbortSignal) {
    return this.get<Calendar[]>('/calendars', signal);
  }

  createCalendar(body: {
    name: string;
    slug: string;
    category: string;
    city: string;
    is_public: boolean;
  }) {
    return this.post<Calendar>('/calendars', body);
  }

  publicCalendar(slug: string, signal?: AbortSignal) {
    return this.get<PublicCalendar>(
      `/calendars/${encodeURIComponent(slug)}/public`,
      signal,
    );
  }

  publicProfile(handle: string, signal?: AbortSignal) {
    return this.get<PublicProfile>(
      `/accounts/${encodeURIComponent(handle)}/public`,
      signal,
    );
  }

  categorySummary(name: string, signal?: AbortSignal) {
    return this.get<CategorySummary>(
      `/categories/${encodeURIComponent(name)}/summary`,
      signal,
    );
  }

  resolve(slug: string, signal?: AbortSignal) {
    return this.get<{ kind: string; slug: string }>(
      `/resolve/${encodeURIComponent(slug)}`,
      signal,
    );
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

import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';

export interface Account {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
}

export interface ThemeTokens {
  key: string;
  ground: string;
  ground_sunk: string;
  ink: string;
  ink_secondary: string;
  hairline: string;
  panel: string;
  pale: boolean;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  city: string;
  time_zone: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  confirmed_count: number;
  remaining: number;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  theme_hex: string;
  theme: ThemeTokens;
  cover_seed: string;
  waitlist_enabled: boolean;
  approval_required: boolean;
  calendar: { slug: string; name: string; is_public: boolean; owner: { handle: string; display_name: string } };
  is_owner?: boolean;
  description?: string;
  waitlist_count?: number;
  pending_count?: number;
  arrived_count?: number;
  cancel_reason?: string | null;
  my_registration?: MyRegistration | null;
}

export interface MyRegistration {
  id: string;
  status: string;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at?: string | null;
}

export interface RegistrationRow {
  id: string;
  account_id: string;
  email: string;
  display_name: string;
  status: string;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
}

export interface MyRegistrationFull extends MyRegistration {
  event: EventSummary & { ended: boolean };
}

const TOKEN_KEY = 'gather.token';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  constructor() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      this.token.next(token);
      this.refreshMe().subscribe({
        next: () => this.markReady(),
        error: () => this.clearSession(),
      });
    } else {
      this.markReady();
    }
  }

  token = new BehaviorSubject<string | null>(null);
  account = signal<Account | null>(null);
  ready = signal<boolean>(!localStorage.getItem(TOKEN_KEY));
  private readyFlag: { promise: Promise<void>; resolve: () => void } = (() => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, resolve };
  })();

  /** Resolves once the session has been restored from storage. */
  settled(): Promise<void> {
    if (this.ready()) return Promise.resolve();
    return this.readyFlag.promise;
  }

  get authHeader(): { [h: string]: string } {
    const t = this.token.value;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  setSession(token: string, account: Account): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.token.next(token);
    this.account.set(account);
    this.markReady();
  }

  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.token.next(null);
    this.account.set(null);
    this.markReady();
  }

  private markReady(): void {
    this.ready.set(true);
    this.readyFlag.resolve();
  }

  refreshMe() {
    return this.http.get<Account>('/api/accounts/me', { headers: this.authHeader }).pipe(
      tap((a) => this.account.set(a)),
    );
  }

  signup(email: string, password: string, name: string) {
    return this.http.post<Account & { access_token: string }>('/api/auth/signup', { email, password, name });
  }

  login(email: string, password: string) {
    return this.http.post<Account & { access_token: string }>('/api/auth/login', { email, password });
  }

  logout() {
    this.http.post('/api/auth/logout', {}, { headers: this.authHeader }).subscribe({ error: () => {} });
    this.clearSession();
  }

  saveProfile(displayName: string, handle: string) {
    return this.http.patch<Account>('/api/accounts/me', { display_name: displayName, handle }, { headers: this.authHeader });
  }

  // ---- events ----
  events(params: { category?: string; city?: string; q?: string; limit?: number; offset?: number }) {
    return this.http.get<EventSummary[]>('/api/events', {
      params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
      headers: this.authHeader,
      observe: 'response',
    });
  }

  event(slug: string) {
    return this.http.get<EventSummary>(`/api/events/${slug}`, { headers: this.authHeader });
  }

  createEvent(body: Record<string, unknown>) {
    return this.http.post<EventSummary>('/api/events', body, { headers: this.authHeader });
  }

  patchEvent(slug: string, body: Record<string, unknown>) {
    return this.http.patch<EventSummary>(`/api/events/${slug}`, body, { headers: this.authHeader });
  }

  cancelEvent(slug: string, reason: string) {
    return this.http.post<EventSummary>(`/api/events/${slug}/cancel`, { reason }, { headers: this.authHeader });
  }

  shelves() {
    return this.http.get<{ calendars: ShelfCalendar[]; events: EventSummary[] }>('/api/shelves');
  }

  // ---- registrations ----
  register(eventSlug: string) {
    return this.http.post<MyRegistration & { message?: string }>('/api/registrations', { event_slug: eventSlug }, { headers: this.authHeader });
  }

  myRegistrations() {
    return this.http.get<MyRegistrationFull[]>('/api/registrations/me', { headers: this.authHeader });
  }

  cancelRegistration(id: string) {
    return this.http.post<MyRegistration & { promoted?: number }>(`/api/registrations/${id}/cancel`, {}, { headers: this.authHeader });
  }

  guestList(slug: string) {
    return this.http.get<RegistrationRow[]>(`/api/events/${slug}/registrations`, { headers: this.authHeader });
  }

  approve(id: string) {
    return this.http.post<RegistrationRow>(`/api/registrations/${id}/approve`, {}, { headers: this.authHeader });
  }

  decline(id: string) {
    return this.http.post<RegistrationRow>(`/api/registrations/${id}/decline`, {}, { headers: this.authHeader });
  }

  ticket(code: string) {
    return this.http.get<Ticket>(`/api/tickets/${code}`);
  }

  checkIn(code: string) {
    return this.http.post<CheckedIn>(`/api/tickets/${code}/check-in`, {}, { headers: this.authHeader });
  }

  // ---- calendars ----
  calendars() {
    return this.http.get<Calendar[]>('/api/calendars', { headers: this.authHeader });
  }

  calendar(slug: string) {
    return this.http.get<Calendar & { events: EventSummary[]; owner_handle: string; owner_name: string }>(`/api/calendars/${slug}`, { headers: this.authHeader });
  }

  createCalendar(body: Record<string, unknown>) {
    return this.http.post<Calendar>('/api/calendars', body, { headers: this.authHeader });
  }

  resolve(slug: string) {
    return this.http.get<{ kind: string; slug: string }>(`/api/resolve/${slug}`);
  }
}

export interface ShelfCalendar {
  slug: string;
  name: string;
  category: string;
  city: string;
  published_count: number;
}

export interface Calendar {
  id: string;
  owner_account_id: string;
  name: string;
  slug: string;
  category: string;
  city: string;
  is_public: boolean;
  created_at: string;
  published_count?: number;
}

export interface Ticket {
  id: string;
  ticket_code: string;
  status: string;
  checked_in_at: string | null;
  event_slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  city: string;
  theme_hex: string;
  theme: ThemeTokens;
  cover_seed: string;
  event_state: string;
}

export interface CheckedIn {
  id: string;
  status: string;
  ticket_code: string;
  checked_in_at: string | null;
  already_checked_in: boolean;
}

/** Landing target after signing in. */
export function homeFor(account: Account | null): string {
  return account?.role === 'host' ? '/calendars' : '/home';
}

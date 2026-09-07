import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from './auth';

export interface ApiEvent {
  id: string; slug: string; title: string; category: string; city: string;
  time_zone: string; cover_seed: string; theme_hex: string; description: string;
  starts_at: string; ends_at: string; capacity: number; confirmed_count: number;
  remaining: number; state: string; approval_required: boolean; waitlist_enabled: boolean;
  cancel_reason: string | null;
  calendar?: { name: string; slug: string; owner_account_id: string; published_count?: number };
  my_registration?: MyRegistration | null;
  has_ended?: boolean;
}

export interface MyRegistration {
  id: string; event_id: string; status: string;
  waitlist_position: number | null; ticket_code: string | null;
  event?: { slug: string; title: string; starts_at: string; ends_at: string; time_zone: string; city: string; theme_hex: string; cover_seed: string; category: string; state: string; capacity: number };
}

export interface NoticeMsg { text: string; kind: 'success' | 'warning' | 'danger' | 'info'; }

@Injectable({ providedIn: 'root' })
export class Api {
  readonly notice = signal<NoticeMsg | null>(null);
  private timer: any = null;

  private router = inject(Router);

  constructor(private auth: Auth) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T; headers: Headers }> {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as any) };
    if (this.auth.token) headers['authorization'] = `Bearer ${this.auth.token}`;
    const res = await fetch(`/api${path}`, { ...init, headers });
    let body: any = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) body = await res.json().catch(() => null);
    else body = await res.text();
    if (res.status === 401 && this.auth.token && !path.startsWith('/auth/')) {
      this.auth.clear();
      const next = encodeURIComponent(typeof location !== 'undefined' ? location.pathname : '/');
      this.router.navigateByUrl(`/login?next=${next}`);
    }
    return { status: res.status, body, headers: res.headers };
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: any) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }); }
  patch<T>(path: string, body: any) { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }); }

  flash(text: string, kind: NoticeMsg['kind'] = 'info') {
    this.notice.set({ text, kind });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.notice.set(null), 6000);
  }

  /** UTC instant -> the parts a zone needs, formatted with Intl */
  static inZone(iso: string, zone: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone,
    }).format(d);
  }

  static visitorZone(): string {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }

  static zonesDiffer(iso: string, zone: string): boolean {
    const a = Api.inZone(iso, zone);
    const b = Api.inZone(iso, Api.visitorZone());
    return a !== b;
  }

  /** the HSL derivation the server performs, mirrored for client-side use */
  static deriveTheme(hex: string) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hue = 0;
    if (max !== min) {
      const d = max - min;
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60; if (hue < 0) hue += 360;
    }
    const hsl = (s: number, l: number) => {
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1)); };
      const to = (v: number) => Math.round(Math.max(0, Math.min(255, v * 255))).toString(16).padStart(2, '0');
      return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
    };
    return { ground: hsl(0.08, 0.94), sunk: hsl(0.10, 0.90), ink: hsl(1.0, 0.11), key: hex };
  }
}

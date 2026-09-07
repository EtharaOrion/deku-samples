import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

export interface Account {
  id: string; email: string; display_name: string; handle: string;
  role: 'host' | 'guest'; created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class Api {
  constructor(private router: Router) {}

  private token(): string | null {
    return localStorage.getItem('cc_token');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    const token = this.token();
    if (token) headers['authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api${path}`, { ...init, headers });
    if (res.status === 401 && token) {
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_account');
      const cur = this.router.url;
      this.router.navigate(['/login'], { queryParams: { next: cur } });
      throw new ApiError(401, 'unauthorized', 'Your session has ended. Sign in to continue.');
    }
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
    if (!res.ok) {
      throw new ApiError(res.status, body?.code ?? 'unknown', body?.message ?? 'That did not work.');
    }
    return body as T;
  }

  list<T>(path: string, init: RequestInit = {}): Promise<{ items: T[]; total: number }> {
    return this.request<T[]>(path, init).then(items => ({ items, total: -1 }));
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string,
              public fields?: Record<string, string>) {
    super(message);
  }
}

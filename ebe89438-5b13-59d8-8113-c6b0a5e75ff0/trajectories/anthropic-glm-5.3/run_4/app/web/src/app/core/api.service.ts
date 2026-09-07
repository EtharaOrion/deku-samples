import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { EventItem, Registration } from './auth.service';

export type ApiError = { status: number; message: string; field?: string };

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  private err(e: unknown): ApiError {
    const anyE = e as { status?: number; error?: { message?: string; field?: string } };
    return {
      status: anyE?.status ?? 0,
      message: anyE?.error?.message ?? 'That did not go through. Please try again.',
      field: anyE?.error?.field,
    };
  }

  async health(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get('/api/health'));
      return true;
    } catch {
      return false;
    }
  }

  async listEvents(filters: { category?: string; city?: string; q?: string; limit?: number; offset?: number }):
    Promise<{ items: EventItem[]; total: number }> {
    let params = new HttpParams();
    if (filters.category) params = params.set('category', filters.category);
    if (filters.city) params = params.set('city', filters.city);
    if (filters.q && filters.q.trim()) params = params.set('q', filters.q.trim());
    if (filters.limit != null) params = params.set('limit', String(filters.limit));
    if (filters.offset != null) params = params.set('offset', String(filters.offset));
    try {
      const res = await firstValueFrom(this.http.get<EventItem[]>('/api/events', { params, observe: 'response' }));
      return { items: res.body ?? [], total: Number(res.headers.get('X-Total-Count') ?? '0') };
    } catch (e) {
      return { items: [], total: 0 };
    }
  }

  async getEvent(slug: string): Promise<EventItem | null> {
    try {
      return await firstValueFrom(this.http.get<EventItem>(`/api/events/${slug}`));
    } catch {
      return null;
    }
  }

  async resolve(slug: string): Promise<{ kind: string; slug: string } | null> {
    try {
      return await firstValueFrom(this.http.get<{ kind: string; slug: string }>(`/api/resolve/${slug}`));
    } catch {
      return null;
    }
  }

  async register(eventSlug: string): Promise<{ ok: boolean; registration?: Registration; error?: ApiError }> {
    try {
      const registration = await firstValueFrom(this.http.post<Registration>('/api/registrations', { event_slug: eventSlug }));
      return { ok: true, registration };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async cancelRegistration(id: string): Promise<{ ok: boolean; error?: ApiError }> {
    try {
      await firstValueFrom(this.http.post(`/api/registrations/${id}/cancel`, {}));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async myRegistrations(): Promise<Array<Registration & { event: NonNullable<Registration['event']> }>> {
    try {
      return await firstValueFrom(this.http.get<any[]>('/api/registrations/me'));
    } catch {
      return [];
    }
  }

  async getTicket(code: string): Promise<Registration | null> {
    try {
      return await firstValueFrom(this.http.get<Registration>(`/api/tickets/${code}`));
    } catch {
      return null;
    }
  }

  async guestList(slug: string): Promise<Registration[] | null> {
    try {
      return await firstValueFrom(this.http.get<Registration[]>(`/api/events/${slug}/registrations`));
    } catch {
      return null;
    }
  }

  async approve(id: string): Promise<{ ok: boolean; error?: ApiError }> {
    try {
      await firstValueFrom(this.http.post(`/api/registrations/${id}/approve`, {}));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async decline(id: string): Promise<{ ok: boolean; error?: ApiError }> {
    try {
      await firstValueFrom(this.http.post(`/api/registrations/${id}/decline`, {}));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async checkIn(code: string): Promise<{ ok: boolean; registration?: Registration; error?: ApiError }> {
    try {
      const registration = await firstValueFrom(this.http.post<Registration>(`/api/tickets/${code}/check-in`, {}));
      return { ok: true, registration };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async myCalendars(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>('/api/calendars'));
    } catch {
      return [];
    }
  }

  async createCalendar(body: any): Promise<{ ok: boolean; calendar?: any; error?: ApiError }> {
    try {
      const calendar = await firstValueFrom(this.http.post<any>('/api/calendars', body));
      return { ok: true, calendar };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async createEvent(body: any): Promise<{ ok: boolean; event?: EventItem; error?: ApiError }> {
    try {
      const event = await firstValueFrom(this.http.post<EventItem>('/api/events', body));
      return { ok: true, event };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async patchEvent(slug: string, body: any): Promise<{ ok: boolean; event?: EventItem; error?: ApiError }> {
    try {
      const event = await firstValueFrom(this.http.patch<EventItem>(`/api/events/${slug}`, body));
      return { ok: true, event };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async cancelEvent(slug: string, reason: string): Promise<{ ok: boolean; event?: EventItem; error?: ApiError }> {
    try {
      const event = await firstValueFrom(this.http.post<EventItem>(`/api/events/${slug}/cancel`, { reason }));
      return { ok: true, event };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }

  async updateProfile(data: { display_name?: string; handle?: string }): Promise<{ ok: boolean; account?: any; error?: ApiError }> {
    try {
      const account = await firstValueFrom(this.http.patch('/api/accounts/me', data));
      return { ok: true, account };
    } catch (e) {
      return { ok: false, error: this.err(e) };
    }
  }
}

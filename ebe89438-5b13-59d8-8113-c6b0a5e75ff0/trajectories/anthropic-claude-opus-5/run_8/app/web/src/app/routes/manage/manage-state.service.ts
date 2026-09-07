import { Injectable, inject, signal } from '@angular/core';
import { ApiService, ApiError } from '../../core/api.service';
import type { EventDetail, GuestRow } from '../../core/models';

/**
 * The three manage screens share one load of the event and its guest list, so a
 * move between them does not paint the same data twice.
 */
@Injectable()
export class ManageStateService {
  private api = inject(ApiService);

  readonly event = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly denied = signal(false);
  private slug = '';

  async load(slug: string, force = false) {
    if (!force && slug === this.slug && this.event()) return;
    this.slug = slug;
    this.loading.set(true);
    this.denied.set(false);
    try {
      const [ev, guests] = await Promise.all([this.api.getEvent(slug), this.api.guestList(slug)]);
      this.event.set(ev);
      this.guests.set(guests);
      if (!ev.is_owner) this.denied.set(true);
    } catch (e) {
      // A route the visitor may not see answers exactly as one that never existed.
      if ([403, 404, 401].includes((e as ApiError).status)) this.denied.set(true);
      this.event.set(null);
      this.guests.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async refresh() {
    if (this.slug) await this.load(this.slug, true);
  }

  setEvent(ev: EventDetail) {
    this.event.set(ev);
  }
}

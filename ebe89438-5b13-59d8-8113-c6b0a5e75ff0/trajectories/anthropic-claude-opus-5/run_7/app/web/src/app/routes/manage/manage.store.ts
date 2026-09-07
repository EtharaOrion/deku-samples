import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { EventDetail, GuestRow } from '../../models';

/**
 * One store per manage shell, so the three sister screens share the event and
 * the guest list. No route paints twice for the same data.
 */
@Injectable()
export class ManageStore {
  private api = inject(ApiService);

  readonly ev = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly guestsLoading = signal(true);
  readonly missing = signal(false);
  private slug = '';

  load(slug: string) {
    if (!slug || slug === this.slug) return;
    this.slug = slug;
    this.loading.set(true);
    this.missing.set(false);
    this.api.getEvent(slug).subscribe({
      next: (ev) => {
        // Reading an event you do not own is not the same as managing it: the
        // manage screens are for the owning host alone.
        if (!ev.is_owner) {
          this.missing.set(true);
          this.loading.set(false);
          return;
        }
        this.ev.set(ev);
        this.loading.set(false);
        this.refreshGuests();
      },
      error: () => { this.missing.set(true); this.loading.set(false); },
    });
  }

  refreshEvent() {
    if (!this.slug) return;
    this.api.getEvent(this.slug).subscribe({
      next: (ev) => this.ev.set(ev),
      error: () => { /* keep what is on screen */ },
    });
  }

  refreshGuests() {
    if (!this.slug) return;
    this.guestsLoading.set(true);
    this.api.guestList(this.slug).subscribe({
      next: (rows) => { this.guests.set(rows); this.guestsLoading.set(false); },
      error: () => { this.guests.set([]); this.guestsLoading.set(false); },
    });
  }

  setEvent(ev: EventDetail) { this.ev.set(ev); }
}

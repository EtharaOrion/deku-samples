import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api, ApiEvent } from '../../api';
import { Auth } from '../../auth';

interface GuestRow { id: string; account_id: string; email: string; display_name: string; status: string; waitlist_position: number | null; ticket_code: string | null; }

/** The three manage screens share this base: owning host only. */
@Component({
  selector: 'app-manage-base',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: ``,
})
export class ManageBaseComponent implements OnInit {
  slug = '';
  event = signal<ApiEvent | null>(null);
  guests = signal<GuestRow[]>([]);
  loading = signal(true);
  notFound = signal(false);

  constructor(protected api: Api, protected auth: Auth, protected route: ActivatedRoute, protected router: Router) {}

  ngOnInit() {
    this.route.paramMap.subscribe((pm) => {
      this.slug = pm.get('slug') || '';
      this.load();
    });
  }

  async load() {
    this.loading.set(true);
    const { status, body } = await this.api.get<ApiEvent>(`/events/${this.slug}`);
    if (status !== 200) { this.notFound.set(true); this.loading.set(false); return; }
    this.event.set(body);
    const ev = body as any;
    const isOwner = ev?.calendar?.owner_account_id === this.auth.account()?.id;
    const isHost = this.auth.account()?.role === 'host';
    if (!isOwner || !isHost || !this.auth.token) { this.notFound.set(true); this.loading.set(false); return; }
    await this.loadGuests();
    this.loading.set(false);
  }

  async loadGuests() {
    const { status, body } = await this.api.get<GuestRow[]>(`/events/${this.slug}/registrations`);
    if (status === 200) this.guests.set((body as any) || []);
    else this.guests.set([]);
  }

  counts() {
    const g = this.guests();
    return {
      confirmed: g.filter((r) => r.status === 'confirmed' || r.status === 'checked_in').length,
      waiting: g.filter((r) => r.status === 'waitlisted').length,
      pending: g.filter((r) => r.status === 'pending_approval').length,
      arrived: g.filter((r) => r.status === 'checked_in').length,
    };
  }
}

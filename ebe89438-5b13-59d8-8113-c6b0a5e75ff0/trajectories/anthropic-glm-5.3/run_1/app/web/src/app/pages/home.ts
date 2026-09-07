import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CoverComponent } from '../cover';
import { Api, MyRegistration } from '../api';
import { Auth } from '../auth';

/** /home — the guest's registrations, Upcoming then Past. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CoverComponent, RouterLink, CommonModule],
  template: `
    <h1 class="h1">Your events</h1>
    @if (loading()) {
      <div class="skeleton" style="height:280px"></div>
    } @else if (regs().length === 0) {
      <div class="empty">
        <h2>No Upcoming Events</h2>
        <p>Events you register for will appear here.</p>
        <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
      </div>
    } @else {
      @for (group of groups(); track group.label) {
        <section class="group" [attr.aria-labelledby]="group.id">
          <h2 class="group-h" [id]="group.id">{{ group.label }}</h2>
          @if (group.items.length === 0) {
            <p class="group-empty">{{ group.label === 'Upcoming' ? 'Nothing coming up yet.' : 'Nothing past yet.' }}</p>
          } @else {
            <ul class="rows">
              @for (r of group.items; track r.id) {
                <li class="row">
                  <app-cover [seed]="r.event?.cover_seed || r.id" [size]="'44px'" [radius]="'11px'"></app-cover>
                  <div class="row-main">
                    <a class="row-title" [routerLink]="['/' + r.event?.slug]">{{ r.event?.title }}</a>
                    <span class="row-when">{{ fmt(r.event?.starts_at || '', r.event?.time_zone || 'UTC') }} · {{ r.event?.time_zone }}</span>
                  </div>
                  <span [class]="'pill ' + pillFor(r.status)">{{ statusWord(r.status) }}</span>
                  <div class="row-action">
                    @if (r.status === 'confirmed' || r.status === 'checked_in') {
                      <a class="btn btn-secondary btn-small" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                      <button class="btn btn-quiet" type="button" (click)="openCancel(r)">Cancel seat</button>
                    } @else if (r.status === 'waitlisted') {
                      <button class="btn btn-secondary btn-small" type="button" (click)="leaveWaitlist(r)">Leave Waiting List</button>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      }
    }

    @if (cancelling(); as r) {
      <div class="scrim" (click)="closeCancel()" (keydown.escape)="closeCancel()">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title" (click)="$event.stopPropagation()">
          <h2 class="dialog-h" id="cancel-title">Cancel your seat?</h2>
          <p class="dialog-p">Your seat at {{ r.event?.title }} goes back to the event and the first person on the waiting list takes it. This cannot be undone.</p>
          <div class="dialog-actions">
            <button class="btn btn-secondary" type="button" (click)="closeCancel()">Keep my seat</button>
            <button class="btn btn-danger" type="button" (click)="confirmCancel(r)">Cancel my seat</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0 0 24px; }
    .group-h { font-size: 13px; line-height: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 28px 0 8px; }
    .rows { list-style: none; margin: 0; padding: 0; }
    .row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--divider); font-size: 15px; line-height: 22px; }
    .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .row-title { font-size: 15px; line-height: 22px; font-weight: 500; text-decoration: none; color: var(--ink); }
    .row-title:hover { text-decoration: underline; }
    .row-when { font-size: 13px; line-height: 16px; color: var(--muted); }
    .row-action { display: flex; gap: 8px; align-items: center; }
    .empty { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .empty h2 { font-family: var(--serif); font-weight: 400; font-size: 26px; margin: 0; }
    .empty p { color: var(--muted); margin: 0; }
    .group-empty { font-size: 15px; color: var(--muted); }
    .dialog-h { font-size: 17px; line-height: 22px; margin: 0 0 8px; font-weight: 600; }
    .dialog-p { font-size: 14px; line-height: 21px; color: var(--muted); margin: 0 0 20px; }
    .dialog-actions { display: flex; gap: 12px; justify-content: flex-end; }
    @media (max-width: 650px) { .row { flex-wrap: wrap; } .row-action { width: 100%; justify-content: flex-end; } }
  `],
})
export class HomeComponent implements OnInit {
  regs = signal<MyRegistration[]>([]);
  loading = signal(true);
  cancelling = signal<MyRegistration | null>(null);

  constructor(public api: Api, public auth: Auth) {}

  ngOnInit() { this.load(); }

  async load() {
    this.loading.set(true);
    const { body } = await this.api.get<MyRegistration[]>('/registrations/me');
    this.regs.set((body as any) || []);
    this.loading.set(false);
  }

  groups() {
    const now = Date.now();
    const up = this.regs().filter((r) => r.status !== 'cancelled_by_guest' && r.status !== 'declined' && r.status !== 'cancelled_by_host' && new Date(r.event?.ends_at || 0).getTime() >= now);
    const past = this.regs().filter((r) => !up.includes(r));
    return [{ id: 'upcoming', label: 'Upcoming', items: up }, { id: 'past', label: 'Past', items: past }];
  }

  statusWord(s: string) {
    return ({
      pending_approval: 'Awaiting host', confirmed: 'Going', waitlisted: 'Waiting list',
      declined: 'Declined', cancelled_by_guest: 'Cancelled', cancelled_by_host: 'Cancelled', checked_in: 'Checked in',
    } as Record<string, string>)[s] || s;
  }
  pillFor(s: string) {
    if (s === 'confirmed' || s === 'checked_in') return 'pill-success';
    if (s === 'pending_approval' || s === 'waitlisted') return 'pill-warning';
    if (s === 'declined' || s === 'cancelled_by_guest' || s === 'cancelled_by_host') return 'pill-danger';
    return 'pill-muted';
  }

  openCancel(r: MyRegistration) { this.cancelling.set(r); }
  closeCancel() { this.cancelling.set(null); }

  async confirmCancel(r: MyRegistration) {
    await this.api.post(`/registrations/${r.id}/cancel`);
    this.cancelling.set(null);
    this.api.flash(`Your seat is released. The waiting list has been told.`, 'success');
    await this.load();
  }

  async leaveWaitlist(r: MyRegistration) {
    await this.api.post(`/registrations/${r.id}/cancel`);
    this.api.flash(`You have left the waiting list.`, 'info');
    await this.load();
  }

  fmt(iso: string, zone: string) { return Api.inZone(iso, zone); }
  vz() { return Api.visitorZone(); }
  zd(iso: string, zone: string) { return Api.zonesDiffer(iso, zone); }
}
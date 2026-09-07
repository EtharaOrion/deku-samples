import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, AuthService, EventItem, Registration } from '../api';
import { NoticeService } from '../notice';
import { IconDirective } from '../icons';
import { StatusPillComponent, NotFoundComponent } from './bits';

/** /event/<slug>/manage/guests: the queue, the list and the door. */
@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconDirective, StatusPillComponent, NotFoundComponent],
  template: `
    @if (denied) { <app-not-found /> } @else {
      <nav class="tabs" aria-label="Manage this event">
        <a [routerLink]="['/event', slug, 'manage', 'overview']">Overview</a>
        <a [routerLink]="['/event', slug, 'manage', 'guests']" class="on" aria-current="page">Guests</a>
        <a [routerLink]="['/event', slug, 'manage', 'registration']">Registration</a>
      </nav>
      <h1 class="screen-title">Guests</h1>

      <section class="block">
        <h2 class="block-title">Approval queue</h2>
        @if (queue.length === 0) {
          <p class="caption">No requests waiting for a decision.</p>
        } @else {
          <ul class="queue">
            @for (r of queue; track r.id) {
              <li class="q-row">
                <div class="q-main"><span class="q-name">{{ r.display_name }}</span><span class="caption">{{ r.email }}</span></div>
                <div class="q-actions">
                  <button type="button" class="btn btn-primary btn-small" (click)="approve(r)">Approve</button>
                  <button type="button" class="btn btn-ghost btn-small" (click)="decline(r)">Decline</button>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <section class="block">
        <div class="list-head">
          <h2 class="block-title">Guest list</h2>
          <div class="tools">
            <label class="sr-only" for="filter">Filter by status</label>
            <select id="filter" [value]="filter" (change)="filter = $any($event.target).value">
              <option value="">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="pending_approval">Pending approval</option>
              <option value="checked_in">Checked in</option>
              <option value="declined">Declined</option>
              <option value="cancelled_by_guest">Cancelled</option>
            </select>
            <button type="button" class="btn btn-secondary btn-small" (click)="exportCsv()">Export CSV</button>
          </div>
        </div>
        @if (all.length === 0) {
          <div class="empty card">
            <h3 class="empty-title">No Guests Yet</h3>
            <p class="empty-body">Share your event link and registrations will appear here.</p>
            <button type="button" class="btn btn-secondary" (click)="copy()">Copy Link</button>
          </div>
        } @else if (rows.length === 0) {
          <p class="caption">Nobody holds that status on this event.</p>
        } @else {
          <div class="table-wrap">
            <table class="guests">
              <thead><tr>
                <th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Status</th>
                <th scope="col">Position</th><th scope="col">Ticket</th>
              </tr></thead>
              <tbody>
                @for (r of rows; track r.id) {
                  <tr>
                    <td>{{ r.display_name }}</td>
                    <td class="mono-cell">{{ r.email }}</td>
                    <td><app-status [status]="r.status" /></td>
                    <td>{{ r.waitlist_position ?? '—' }}</td>
                    <td><span class="mono">{{ r.ticket_code ?? '—' }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section class="block">
        <h2 class="block-title">The door</h2>
        <form class="door" (submit)="checkIn($event)">
          <label for="door" class="sr-only">Ticket code</label>
          <input id="door" class="mono" placeholder="TKT-" [(ngModel)]="code" name="code" />
          <button class="btn btn-primary" type="submit" [disabled]="doorWorking">Check In</button>
        </form>
        <p class="door-answer" role="status" aria-live="polite">{{ doorAnswer }}</p>
      </section>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--divider); }
    .tabs a { padding: 12px 16px; font-size: 15px; line-height: 22px; color: var(--ink-64); border-bottom: 2px solid transparent; }
    .tabs a.on { color: var(--ink); font-weight: 600; border-bottom-color: var(--ink); }
    .block { margin-top: 32px; }
    .block-title { font-size: 16px; line-height: 25.6px; font-weight: 600; margin-bottom: 12px; }
    .queue { display: flex; flex-direction: column; }
    .q-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--divider); }
    .q-main { display: flex; flex-direction: column; flex: 1; }
    .q-name { font-size: 15px; line-height: 22px; font-weight: 500; }
    .q-actions { display: flex; gap: 8px; }
    .list-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .tools { display: flex; gap: 8px; align-items: center; }
    .tools select { border-radius: 4px; border: 1px solid var(--ink-08); padding: 8px 10px; min-height: 36px; }
    .table-wrap { overflow-x: auto; }
    table.guests { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 22px; }
    .guests th { text-align: left; font-size: 13px; line-height: 18px; font-weight: 600; color: var(--ink-64); padding: 8px 12px; border-bottom: 1px solid var(--divider); }
    .guests td { padding: 12px; border-bottom: 1px solid var(--divider); }
    .mono-cell, .mono { font-variant-numeric: tabular-nums; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    .empty { padding: 32px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .empty-title { font-family: var(--serif); font-weight: 400; font-size: 20px; }
    .empty-body { color: var(--muted); }
    .door { display: flex; gap: 8px; }
    .door input { flex: 1; max-width: 320px; border-radius: 4px; border: 1px solid var(--ink-08); padding: 10px 12px; min-height: 44px; }
    .door-answer { min-height: 20px; margin-top: 8px; font-size: 14px; line-height: 20px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 649px) { .guests .mono-cell { display: none; } .guests th:nth-child(2) { display: none; } }
    @media (max-width: 483px) {
      table.guests, .guests thead, .guests tbody, .guests tr, .guests td { display: block; width: 100%; }
      .guests thead { display: none; }
      .guests tr { border: 1px solid var(--divider); border-radius: 12px; padding: 8px; margin-bottom: 8px; }
      .guests td { border: none; padding: 4px 8px; }
      .guests td::before { content: attr(data-label); font-size: 11px; line-height: 16px; color: var(--muted); display: block; }
    }
  `],
})
export class ManageGuestsComponent implements OnInit {
  all: Registration[] = [];
  denied = false;
  slug = '';
  filter = '';
  code = '';
  doorAnswer = '';
  doorWorking = false;
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private notice = inject(NoticeService);
  private auth = inject(AuthService);

  /** Fetches the file with the bearer token and hands it to the browser. */
  async exportCsv() {
    try {
      const res = await fetch(`/api/events/${this.slug}/registrations.csv`, {
        headers: { authorization: `Bearer ${localStorage.getItem('cc.token') ?? ''}` },
      });
      if (!res.ok) throw new Error('The guest list is not yours to export.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.slug}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.notice.polite('Guest list exported.', 'success');
    } catch (e: any) {
      this.notice.show(e?.message ?? 'That did not go through.', 'danger');
    }
  }
  get queue() { return this.all.filter(r => r.status === 'pending_approval'); }
  get rows() {
    const list = this.filter ? this.all.filter(r => r.status === this.filter) : this.all;
    return list;
  }
  ngOnInit() {
    this.slug = this.route.parent?.snapshot.paramMap.get('slug') ?? '';
    this.auth.account$.subscribe(a => { if (a?.role === 'guest') this.denied = true; });
    this.api.eventRegistrations(this.slug).subscribe(r => (this.all = r), () => (this.denied = true));
  }
  async approve(r: Registration) {
    try {
      const out = await this.api.pr(this.api.approve(r.id));
      Object.assign(r, out);
      if (out.status === 'waitlisted') this.notice.polite('The event is full, so this request joined the waiting list.', 'warn');
      else this.notice.polite(`${r.display_name} is confirmed.`, 'success');
      this.api.eventRegistrations(this.slug).subscribe(x => (this.all = x));
    } catch (e: any) { this.notice.show(e?.message ?? 'That did not go through.', 'danger'); }
  }
  async decline(r: Registration) {
    try {
      await this.api.pr(this.api.decline(r.id));
      this.notice.polite(`${r.display_name}'s request is declined.`, 'info');
      this.api.eventRegistrations(this.slug).subscribe(x => (this.all = x));
    } catch (e: any) { this.notice.show(e?.message ?? 'That did not go through.', 'danger'); }
  }
  async checkIn(ev: Event) {
    ev.preventDefault();
    if (!this.code.trim()) { this.doorAnswer = 'Type or paste a ticket code first.'; return; }
    this.doorWorking = true;
    try {
      const out = await this.api.pr(this.api.checkIn(this.code.trim().toUpperCase()));
      this.doorAnswer = out.already_checked_in
        ? `Already checked in at ${new Date(out.checked_in_at!).toLocaleTimeString()}.`
        : `Checked in at ${new Date(out.checked_in_at!).toLocaleTimeString()}.`;
      this.code = '';
      this.api.eventRegistrations(this.slug).subscribe(x => (this.all = x));
    } catch (e: any) { this.doorAnswer = e?.message ?? 'That code did not match a ticket.'; }
    finally { this.doorWorking = false; }
  }
  async copy() {
    try { await navigator.clipboard.writeText(`${location.origin}/${this.slug}`); this.notice.polite('Link copied.', 'success'); }
    catch { this.notice.show('Copy it from the address line instead.', 'info'); }
  }
}

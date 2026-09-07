import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ManageBaseComponent } from './manage-base';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { ActivatedRoute, Router } from '@angular/router';

/** /event/<slug>/manage/guests — the list, the queue and the door. */
@Component({
  selector: 'app-manage-guests',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    @if (loading()) {
      <div class="skeleton" style="height:420px"></div>
    } @else if (notFound()) {
      <div class="nf">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn btn-primary" routerLink="/">Return Home</a>
      </div>
    } @else if (event(); as ev) {
      <div class="head">
        <h1 class="h1">Guests</h1>
        <a class="crumb" [routerLink]="['/event', ev.slug, 'manage', 'overview']">← {{ ev.title }}</a>
      </div>

      @if (queue().length > 0) {
        <section class="panel" aria-labelledby="queue-h">
          <h2 class="panel-h" id="queue-h">Awaiting your decision</h2>
          <ul class="queue">
            @for (r of queue(); track r.id) {
              <li class="q-row">
                <span class="q-name">{{ r.display_name }}</span>
                <span class="q-email">{{ r.email }}</span>
                <span class="q-actions">
                  <button class="btn btn-primary btn-small" type="button" (click)="approve(r)">Approve</button>
                  <button class="btn btn-secondary btn-small" type="button" (click)="decline(r)">Decline</button>
                </span>
              </li>
            }
          </ul>
          @if (queueNotice()) { <p class="notice-line" role="status">{{ queueNotice() }}</p> }
        </section>
      }

      <section class="panel" aria-labelledby="list-h">
        <div class="panel-bar">
          <h2 class="panel-h" id="list-h">Guest list</h2>
          <div class="panel-tools">
            <label class="field inline">
              <span class="visually-hidden">Filter by status</span>
              <select [(ngModel)]="statusFilter" (ngModelChange)="loadGuests()">
                <option value="">All statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked_in">Checked in</option>
                <option value="waitlisted">Waiting list</option>
                <option value="pending_approval">Awaiting approval</option>
                <option value="declined">Declined</option>
                <option value="cancelled_by_guest">Cancelled by guest</option>
              </select>
            </label>
            <a class="btn btn-secondary btn-small" [href]="csvHref()" download>Export CSV</a>
          </div>
        </div>

        @if (guests().length === 0) {
          <div class="empty">
            <h3>No Guests Yet</h3>
            <p>Share your event link and registrations will appear here.</p>
            <button class="btn btn-primary" type="button" (click)="copy()">Copy Link</button>
          </div>
        } @else {
          <table class="tbl">
            <thead>
              <tr><th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Position</th><th scope="col">Ticket</th></tr>
            </thead>
            <tbody>
              @for (r of guests(); track r.id) {
                <tr>
                  <td>{{ r.display_name }}</td>
                  <td class="email-cell">{{ r.email }}</td>
                  <td><span [class]="'pill ' + pill(r.status)">{{ word(r.status) }}</span></td>
                  <td>{{ r.waitlist_position ?? '—' }}</td>
                  <td><code class="tcode">{{ r.ticket_code || '—' }}</code></td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>

      <section class="panel" aria-labelledby="door-h">
        <h2 class="panel-h" id="door-h">The door</h2>
        <form class="door" (submit)="checkIn($event)">
          <label class="field grow" for="door-code">
            <span class="visually-hidden">Ticket code</span>
            <input id="door-code" type="text" [(ngModel)]="code" name="code" placeholder="TKT-" autocomplete="off" />
          </label>
          <button class="btn btn-primary" type="submit" [disabled]="doorWorking()">
            @if (doorWorking()) { Checking… } @else { Check In }
          </button>
        </form>
        @if (doorAnswer(); as ans) { <p class="notice-line" [class.ok]="doorOk()" role="status">{{ ans }}</p> }
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0; }
    .crumb { font-size: 14px; color: var(--muted); text-decoration: none; }
    .crumb:hover { color: var(--ink); }
    .panel { border: 1px solid var(--ink-08); border-radius: 12px; padding: 20px; margin-bottom: 20px; background: var(--paper); }
    .panel-h { font-size: 16px; line-height: 24px; font-weight: 600; margin: 0; }
    .panel-bar { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .panel-tools { display: flex; gap: 8px; align-items: center; }
    .field.inline select { min-height: 44px; }
    .queue { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; }
    .q-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--divider); }
    .q-name { font-weight: 500; }
    .q-email { color: var(--muted); font-size: 13px; flex: 1; }
    .q-actions { display: flex; gap: 8px; }
    .notice-line { font-size: 14px; line-height: 20px; margin: 12px 0 0; color: var(--muted); }
    .notice-line.ok { color: #1a7f2e; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 22px; }
    .tbl th { text-align: left; font-size: 11px; line-height: 16px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); padding: 8px 12px 8px 0; border-bottom: 1px solid var(--divider); }
    .tbl td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--divider); vertical-align: top; }
    .tcode { font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 13px; }
    .email-cell { color: var(--muted); }
    .empty { text-align: center; padding: 48px 16px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
    .empty h3 { font-family: var(--serif); font-weight: 400; font-size: 22px; margin: 0; }
    .empty p { color: var(--muted); margin: 0; }
    .door { display: flex; gap: 12px; margin-top: 12px; }
    .grow { flex: 1; }
    .nf { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .nf-title { font-family: var(--serif); font-size: 28px; margin: 0; }
    @media (max-width: 650px) { .email-cell, .tbl th:nth-child(2) { display: none; } }
    @media (max-width: 484px) {
      .tbl, .tbl tbody, .tbl tr, .tbl td { display: block; width: 100%; }
      .tbl thead { display: none; }
      .tbl tr { border: 1px solid var(--divider); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
      .tbl td { border: 0; padding: 2px 0; }
      .tbl td::before { content: attr(data-label); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-right: 8px; }
    }
  `],
})
export class ManageGuestsComponent extends ManageBaseComponent {
  statusFilter = '';
  code = '';
  doorWorking = signal(false);
  doorAnswer = signal<string | null>(null);
  doorOk = signal(false);
  queueNotice = signal<string | null>(null);

  constructor(api: Api, auth: Auth, route: ActivatedRoute, router: Router) { super(api, auth, route, router); }

  queue() { return this.guests().filter((r) => r.status === 'pending_approval'); }

  csvHref() { return `/api/events/${this.slug}/registrations.csv`; }

  word(s: string) {
    return ({ pending_approval: 'Awaiting host', confirmed: 'Going', waitlisted: 'Waiting list', declined: 'Declined', cancelled_by_guest: 'Cancelled', cancelled_by_host: 'Cancelled', checked_in: 'Checked in' } as any)[s] || s;
  }
  pill(s: string) {
    if (s === 'confirmed' || s === 'checked_in') return 'pill-success';
    if (s === 'pending_approval' || s === 'waitlisted') return 'pill-warning';
    if (s === 'declined' || s.startsWith('cancelled')) return 'pill-danger';
    return 'pill-muted';
  }

  async approve(r: any) {
    const { status, body } = await this.api.post<any>(`/registrations/${r.id}/approve`);
    if (status === 200 && body.status === 'confirmed') this.queueNotice.set(`${r.display_name} is confirmed and has been mailed a ticket.`);
    else if (status === 200 && body.status === 'waitlisted') this.queueNotice.set(`The event is full, so ${r.display_name} takes waiting-list place ${body.waitlist_position}.`);
    else this.queueNotice.set(body?.message || `That didn't go through. Try once more.`);
    await this.loadGuests();
  }

  async decline(r: any) {
    const { status, body } = await this.api.post<any>(`/registrations/${r.id}/decline`);
    if (status === 200) this.queueNotice.set(`${r.display_name} has been told their request was declined.`);
    else this.queueNotice.set(body?.message || `That didn't go through. Try once more.`);
    await this.loadGuests();
  }

  async checkIn(e: Event) {
    e.preventDefault();
    const code = this.code.trim().toUpperCase();
    if (!code) return;
    this.doorWorking.set(true);
    this.doorAnswer.set(null);
    const { status, body } = await this.api.post<any>(`/tickets/${code}/check-in`);
    this.doorWorking.set(false);
    if (status === 200 && (body as any).already_checked_in) {
      this.doorOk.set(true);
      const t = new Date((body as any).checked_in_at);
      this.doorAnswer.set(`Already checked in. They arrived at ${t.toLocaleTimeString()}.`);
    } else if (status === 200) {
      this.doorOk.set(true);
      this.doorAnswer.set(`Checked in. Welcome them in.`);
    } else {
      this.doorOk.set(false);
      this.doorAnswer.set((body as any)?.message || `That code doesn't match a seat. Check the letters and try again.`);
    }
    await this.loadGuests();
  }

  async copy() {
    const url = `${location.origin}/${this.slug}`;
    try { await navigator.clipboard.writeText(url); this.api.flash(`Link copied to your clipboard.`, 'success'); }
    catch { this.api.flash(`The link is ${url}`, 'info'); }
  }
}

import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Shell } from '../layout/shell';
import { Cover } from '../ui/cover';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { TimeFmt } from '../core/time';

@Component({
  selector: 'cc-home',
  standalone: true,
  imports: [FormsModule, Shell, RouterLink, Cover],
  template: `
  <cc-shell>
    <h1 class="screen-title">Your events</h1>
    @if (loading) {
      <div class="stack-16">@for (s of [1,2,3]; track s) { <div class="skeleton skeleton-text"></div> }</div>
    } @else if (!upcoming.length && !past.length) {
      <div class="empty">
        <h2>No Upcoming Events</h2>
        <p>Events you register for will appear here.</p>
        <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
      </div>
    } @else {
      @if (upcoming.length) {
        <section aria-labelledby="up-h">
          <h2 id="up-h" class="overline tertiary">Upcoming</h2>
          <ul class="list">
            @for (r of upcoming; track r.id) {
              <li class="row item">
                <cc-cover [seed]="r.cover_seed || r.event_slug" [size]="44"></cc-cover>
                <div class="grow">
                  <a class="title-line" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                  <p class="caption">{{ when(r) }}</p>
                </div>
                <span class="pill {{ pillClass(r.status) }}"><span class="pill-dot"></span>{{ word(r.status) }}</span>
                @if (r.status === 'confirmed' || r.status === 'checked_in') {
                  <a class="btn btn-sm btn-secondary" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                  <button class="btn btn-sm btn-danger" type="button" (click)="confirming = r">Cancel Seat</button>
                } @else if (r.status === 'waitlisted') {
                  <button class="btn btn-sm btn-secondary" type="button" (click)="leave(r)">Leave Waiting List</button>
                }
              </li>
            }
          </ul>
        </section>
      }
      @if (past.length) {
        <section aria-labelledby="past-h">
          <h2 id="past-h" class="overline tertiary">Past</h2>
          <ul class="list">
            @for (r of past; track r.id) {
              <li class="row item">
                <cc-cover [seed]="r.cover_seed || r.event_slug" [size]="44"></cc-cover>
                <div class="grow">
                  <span class="title-line">{{ r.title }}</span>
                  <p class="caption">{{ when(r) }}</p>
                </div>
                <span class="pill {{ pillClass(r.status) }}"><span class="pill-dot"></span>{{ word(r.status) }}</span>
              </li>
            }
          </ul>
        </section>
      }
    }
    @if (confirming) {
      <div class="scrim" (click)="confirming = null"></div>
      <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="cancel-h">
        <h2 id="cancel-h" class="screen-title">Cancel your seat</h2>
        <p class="caption">This frees the seat at once and offers it to the head of the waiting list. Type the word cancel to confirm.</p>
        <form class="stack-16" (submit)="doCancel($event)">
          <label>
            <span class="field-label">Type “cancel”</span>
            <input class="field" [(ngModel)]="confirmWord" name="word" autocomplete="off">
          </label>
          <div class="row spread">
            <button class="btn btn-secondary" type="button" (click)="confirming = null">Keep my seat</button>
            <button class="btn btn-danger" type="submit" [disabled]="confirmWord.trim().toLowerCase() !== 'cancel'">Cancel Seat</button>
          </div>
        </form>
      </div>
    }
  </cc-shell>`,
  styles: [`
    .list { list-style: none; margin: 16px 0 40px; padding: 0; }
    .item { padding: 14px 0; border-bottom: 1px solid var(--divider); gap: 16px; }
    .title-line { font-size: 15px; line-height: 22px; font-weight: 500; color: var(--ink); }
    .scrim { position: fixed; inset: 0; background: rgba(21,21,21,0.8); z-index: 9901; }
    .dialog { position: fixed; z-index: 9999; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: min(480px, calc(100vw - 32px)); padding: 28px; border-radius: 24px;
      animation: dialog-in 0.3s var(--ease-out) both; }
    @keyframes dialog-in { from { opacity: 0; transform: translate(-50%, -46%); } }
  `],
})
export class Home implements OnInit {
  loading = true;
  upcoming: any[] = [];
  past: any[] = [];
  confirming: any = null;
  confirmWord = '';

  constructor(private api: Api, private auth: Auth, private fmt: TimeFmt) {}

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    const rows = await this.api.request<any[]>('/registrations/me');
    this.upcoming = rows.filter(r => !this.fmt.isPast(r.ends_at));
    this.past = rows.filter(r => this.fmt.isPast(r.ends_at));
    this.loading = false;
  }

  when(r: any): string { return this.fmt.inZone(r.starts_at, r.time_zone); }

  word(s: string): string {
    const m: Record<string, string> = {
      confirmed: 'Confirmed', checked_in: 'Checked in', waitlisted: 'On the waiting list',
      pending_approval: 'Awaiting the host', declined: 'Declined',
      cancelled_by_guest: 'Cancelled', cancelled_by_host: 'Cancelled by the host',
    };
    return m[s] ?? s;
  }
  pillClass(s: string): string {
    if (s === 'confirmed' || s === 'checked_in') return 'pill-ok';
    if (s === 'waitlisted' || s === 'pending_approval') return 'pil-warn';
    if (s === 'declined' || s === 'cancelled_by_guest' || s === 'cancelled_by_host') return 'pill-bad';
    return 'pill-neutral';
  }

  async doCancel(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.confirming) return;
    const target = this.confirming;
    this.confirming = null;
    this.confirmWord = '';
    await this.api.request(`/registrations/${target.id}/cancel`, { method: 'POST', body: '{}' });
    await this.load();
  }

  async leave(r: any): Promise<void> {
    await this.api.request(`/registrations/${r.id}/cancel`, { method: 'POST', body: '{}' });
    await this.load();
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService, type Registration } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { statusLabel, statusTone, initials, avatarHue } from '../../core/visuals';
import { cardDate } from '../../core/time';
import { CoverService } from '../../core/cover.service';

type Row = Registration & { event: NonNullable<Registration['event']> };

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="head">
        <h1 class="screen-title">Your registrations</h1>
        <p class="caption sub">Signed in as {{ account()?.display_name }} · {{ account()?.email }}</p>
      </header>

      @if (loading()) {
        <div class="rows">
          @for (i of [1,2,3]; track i) {
            <div class="row skel"><div class="skeleton" style="width:44px;height:44px;border-radius:12px"></div><div class="skel-lines"><div class="skeleton" style="height:16px;width:40%"></div><div class="skeleton" style="height:12px;width:24%"></div></div></div>
          }
        </div>
      } @else if (rows().length === 0) {
        <div class="empty-state">
          <h2>No Upcoming Events</h2>
          <p>Events you register for will appear here.</p>
          <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
        </div>
      } @else {
        <section aria-labelledby="upcoming-h">
          <h2 id="upcoming-h" class="overline sec">Upcoming</h2>
          <ul class="rows">
            @for (r of upcoming(); track r.id) {
              <li class="row">
                <img class="thumb" [src]="cover(r)" alt="" />
                <div class="who">
                  <a class="title" [routerLink]="['/', r.event.slug]">{{ r.event.title }}</a>
                  <span class="caption when">{{ when(r) }}</span>
                </div>
                <span class="pill with-dot" [class]="'pill with-dot tone-' + tone(r)">{{ label(r) }}</span>
                <div class="act">
                  @if (r.status === 'confirmed' || r.status === 'checked_in') {
                    <a class="btn-text" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                    <button class="btn-text danger" (click)="askCancel(r)">Cancel Seat</button>
                  } @else if (r.status === 'waitlisted') {
                    <button class="btn-text danger" (click)="askCancel(r)">Leave Waiting List</button>
                  }
                </div>
              </li>
            } @empty { <li class="caption none">Nothing upcoming.</li> }
          </ul>
        </section>

        @if (past().length > 0) {
          <section aria-labelledby="past-h">
            <h2 id="past-h" class="overline sec">Past</h2>
            <ul class="rows">
              @for (r of past(); track r.id) {
                <li class="row past">
                  <img class="thumb" [src]="cover(r)" alt="" />
                  <div class="who">
                    <a class="title" [routerLink]="['/', r.event.slug]">{{ r.event.title }}</a>
                    <span class="caption when">{{ when(r) }}</span>
                  </div>
                  <span class="pill with-dot" [class]="'pill with-dot tone-' + tone(r)">{{ label(r) }}</span>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>

    @if (cancelTarget(); as t) {
      <div class="scrim" (click)="closeCancel()" role="dialog" aria-modal="true" aria-labelledby="cancel-h">
        <div class="dialog" (click)="$event.stopPropagation()">
          <h2 id="cancel-h">Release your place?</h2>
          <p class="body">Your seat at {{ t.event.title }} goes back to the host and the next person on the waiting list is confirmed at once. This cannot be undone from here.</p>
          <div class="row">
            <button class="btn btn-secondary" (click)="closeCancel()">Keep my place</button>
            <button class="btn btn-danger" (click)="confirmCancel()" [disabled]="working()">
              @if (working()) { <span class="spinner"></span> } Release place
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .head { margin-bottom: 24px; display: flex; flex-direction: column; gap: 4px; }
    .sub { color: var(--muted); }
    .sec { margin: 24px 0 8px; color: var(--muted); }
    .rows { display: flex; flex-direction: column; }
    .row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--divider); font-size: 15px; line-height: 22px; }
    .row.past { opacity: 0.7; }
    .thumb { width: 44px; height: 44px; border-radius: var(--r-media); object-fit: cover; flex: none; }
    .who { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .title { font-weight: 500; }
    .when { color: var(--muted); }
    .act { display: flex; gap: 4px; align-items: center; }
    .act .danger { color: #a31710; }
    .skel-lines { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .none { color: var(--muted); padding: 12px 0; }
    .body { color: var(--muted); font-size: 14px; line-height: 21px; }
    @media (max-width: 650px) {
      .row { flex-wrap: wrap; }
      .act { width: 100%; justify-content: flex-end; }
    }
  `],
})
export class HomeComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);
  private covers = inject(CoverService);

  account = this.auth.account;
  rows = signal<Row[]>([]);
  loading = signal(true);
  working = signal(false);
  cancelTarget = signal<Row | null>(null);

  upcoming = signal<Row[]>([]);
  past = signal<Row[]>([]);

  async ngOnInit(): Promise<void> {
    await this.auth.whenAccount();
    const list = await this.api.myRegistrations();
    const now = Date.now();
    const active = list.filter((r) => !['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(r.status));
    this.rows.set(active);
    this.upcoming.set(active.filter((r) => new Date(r.event.ends_at).getTime() >= now));
    this.past.set(active.filter((r) => new Date(r.event.ends_at).getTime() < now));
    this.loading.set(false);
  }

  askCancel(r: Row): void { this.cancelTarget.set(r); }
  closeCancel(): void { this.cancelTarget.set(null); }

  async confirmCancel(): Promise<void> {
    const t = this.cancelTarget();
    if (!t) return;
    this.working.set(true);
    const res = await this.api.cancelRegistration(t.id);
    this.working.set(false);
    this.cancelTarget.set(null);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    const list = await this.api.myRegistrations();
    const now = Date.now();
    const active = list.filter((r) => !['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(r.status));
    this.rows.set(active);
    this.upcoming.set(active.filter((r) => new Date(r.event.ends_at).getTime() >= now));
    this.past.set(active.filter((r) => new Date(r.event.ends_at).getTime() < now));
    this.toasts.show('Your place is released. If someone was waiting, they are confirmed now.', 'info');
  }

  cover(r: Row): string { return this.covers.dataUri(r.event.cover_seed, r.event.title); }
  when(r: Row): string { return cardDate(r.event.starts_at, r.event.time_zone); }
  tone(r: Row): string { return statusTone(r.status); }
  label(r: Row): string { return statusLabel(r.status); }
}

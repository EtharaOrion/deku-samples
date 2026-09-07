import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';
import { TimeService } from '../time.service';
import { CoverComponent } from '../ui/cover.component';
import { statusWord, statusTone } from '../categories';
import type { Registration } from '../types';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CoverComponent],
  template: `
    <section aria-labelledby="upcoming">
      <div class="row between">
        <h1 class="screen-title" id="upcoming">Your registrations</h1>
        <a class="btn secondary small" routerLink="/discover">Discover Events</a>
      </div>

      @if (loading()) {
        <ul class="rows" aria-busy="true">
          @for (i of [1, 2, 3]; track i) {
            <li class="row-item"><div class="skeleton" style="width:44px;height:44px"></div><div class="skeleton line" style="width:40%"></div></li>
          }
        </ul>
      } @else if (upcoming().length === 0) {
        <div class="empty card big">
          <h2 class="modal-title">No Upcoming Events</h2>
          <p class="caption">Events you register for will appear here.</p>
          <a class="btn primary" routerLink="/discover">Discover Events</a>
        </div>
      } @else {
        <ul class="rows">
          @for (reg of upcoming(); track reg.id) {
            <li class="row-item">
              <a class="thumb" [routerLink]="['/', reg.event_slug]"><app-cover [seed]="reg.cover_seed ?? reg.event_slug ?? 'x'" [showTitle]="false" [rounded]="true"></app-cover></a>
              <div class="row-main">
                <a class="row-title" [routerLink]="['/', reg.event_slug]">{{ reg.title }}</a>
                <span class="row-when caption">{{ long(reg.starts_at!, reg.time_zone!) }}</span>
              </div>
              <span class="pill {{ tone(reg.status) }}"><span class="dot"></span>{{ word(reg.status) }}</span>
              <span class="row-action">
                @if (reg.status === 'confirmed' || reg.status === 'checked_in') {
                  @if (reg.ticket_code) {
                    <a class="btn secondary small" [routerLink]="['/t', reg.ticket_code]">View Ticket</a>
                  }
                  <button class="btn quiet small" type="button" (click)="askCancel(reg)">Cancel place</button>
                } @else if (reg.status === 'waitlisted') {
                  <button class="btn quiet small" type="button" (click)="askCancel(reg)">Leave Waiting List</button>
                }
              </span>
            </li>
          }
        </ul>
      }
    </section>

    @if (past().length > 0) {
      <section aria-labelledby="past" class="past">
        <h2 class="overline" id="past">Past</h2>
        <ul class="rows">
          @for (reg of past(); track reg.id) {
            <li class="row-item">
              <a class="thumb" [routerLink]="['/', reg.event_slug]"><app-cover [seed]="reg.cover_seed ?? reg.event_slug ?? 'x'" [showTitle]="false" [rounded]="true"></app-cover></a>
              <div class="row-main">
                <a class="row-title" [routerLink]="['/', reg.event_slug]">{{ reg.title }}</a>
                <span class="row-when caption">{{ long(reg.starts_at!, reg.time_zone!) }}</span>
              </div>
              <span class="pill {{ tone(reg.status) }}"><span class="dot"></span>{{ word(reg.status) }}</span>
            </li>
          }
        </ul>
      </section>
    }

    @if (confirming()) {
      <div class="scrim" (click)="closeDialog()" role="presentation">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" (click)="$event.stopPropagation()">
          <h2 class="modal-title" id="dlg-title">Cancel your place?</h2>
          <p class="dlg-copy">Your seat at {{ cf.title }} is released at once and the next person on the waiting list takes it.</p>
          <div class="dlg-actions">
            <button class="btn secondary" type="button" (click)="closeDialog()">Keep my place</button>
            <button class="btn danger" type="button" (click)="confirmCancel(cf)">Yes, cancel my place</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
    :host { display: block; }
    .rows { list-style: none; margin: 16px 0 0; padding: 0; }
    .row-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--divider); }
    .thumb { width: 44px; height: 44px; flex: none; display: block; }
    .row-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .row-title { font-size: 15px; line-height: 22px; text-decoration: none; color: inherit; font-weight: 500; }
    .row-title:hover { text-decoration: underline; }
    .row-when { font-size: 13px; }
    .row-action { display: flex; gap: 8px; align-items: center; }
    .empty { margin-top: 24px; padding: 48px 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
    .past { margin-top: 48px; }
    .dlg-copy { color: var(--ink-2); }
    .dlg-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
    @media (max-width: 700px) { .row-when { display: none; } }
  `],
})
export class HomeComponent {
  loading = signal(true);
  upcoming = signal<Registration[]>([]);
  past = signal<Registration[]>([]);
  confirming = signal<Registration | null>(null);

  constructor(private api: ApiService, private notice: NoticeService, private time: TimeService) {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .myRegistrations()
      .then((rows) => {
        const now = Date.now();
        const up: Registration[] = [];
        const past: Registration[] = [];
        for (const r of rows) {
          if (r.starts_at && new Date(r.starts_at).getTime() < now) past.push(r);
          else up.push(r);
        }
        this.upcoming.set(up);
        this.past.set(past);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  get cf(): Registration {
    return this.confirming()!;
  }

  askCancel(reg: Registration) {
    this.confirming.set(reg);
  }

  closeDialog() {
    this.confirming.set(null);
  }

  async confirmCancel(reg: Registration) {
    try {
      await this.api.cancelRegistration(reg.id);
      this.notice.success('Your place is released.');
      this.closeDialog();
      this.load();
    } catch (e) {
      this.notice.danger((e as ApiFailure).message);
    }
  }

  word(status: string): string {
    return statusWord(status);
  }

  tone(status: string): string {
    return statusTone(status);
  }

  long(instant: string, tz: string): string {
    return this.time.long(instant, tz);
  }
}

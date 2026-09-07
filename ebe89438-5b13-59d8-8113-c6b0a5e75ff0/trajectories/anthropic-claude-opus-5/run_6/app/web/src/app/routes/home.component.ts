import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CoverComponent } from '../ui/cover.component';
import { PillComponent } from '../ui/pill.component';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { MyRegistration } from '../core/models';
import { formatIn } from '../core/time';

/** The guest's registrations, in two groups: Upcoming first and Past second. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CoverComponent, PillComponent],
  template: `
    <main id="main" class="col">
      <h1 class="t-screen-title">Your events</h1>

      @if (loading()) {
        <ul class="rows">
          @for (i of [1,2,3]; track i) {
            <li class="row-item"><div class="skeleton thumb"></div>
              <div class="grow"><div class="skeleton skeleton-text" style="width:40%"></div>
              <div class="skeleton skeleton-text" style="width:25%"></div></div></li>
          }
        </ul>
      } @else if (upcoming().length === 0 && past().length === 0) {
        <div class="empty">
          <h2>No Upcoming Events</h2>
          <p>Events you register for will appear here.</p>
          <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
        </div>
      } @else {
        <section class="group">
          <h2 class="t-section">Upcoming</h2>
          @if (upcoming().length === 0) {
            <div class="empty">
              <h2>No Upcoming Events</h2>
              <p>Events you register for will appear here.</p>
              <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
            </div>
          } @else {
            <ol class="rows">
              @for (r of upcoming(); track r.id) {
                <li class="row-item">
                  <a class="thumb-link" [routerLink]="['/', r.event_slug]" [attr.aria-label]="r.title">
                    <app-cover [seed]="r.cover_seed" [showTitle]="false" radius="8px" />
                  </a>
                  <div class="grow">
                    <a class="t-row title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                    <p class="t-caption when">{{ when(r) }}</p>
                  </div>
                  <app-pill [status]="r.status" />
                  <div class="controls">
                    @if (r.ticket_code) {
                      <a class="btn btn-primary btn-sm" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                      <button type="button" class="btn btn-quiet btn-sm" (click)="askCancel(r)">Cancel</button>
                    } @else if (r.status === 'waitlisted') {
                      <button type="button" class="btn btn-primary btn-sm" (click)="askCancel(r)">Leave Waiting List</button>
                    } @else if (r.status === 'pending_approval') {
                      <button type="button" class="btn btn-quiet btn-sm" (click)="askCancel(r)">Withdraw</button>
                    }
                  </div>
                </li>
              }
            </ol>
          }
        </section>

        @if (past().length) {
          <section class="group">
            <h2 class="t-section">Past</h2>
            <ol class="rows">
              @for (r of past(); track r.id) {
                <li class="row-item">
                  <a class="thumb-link" [routerLink]="['/', r.event_slug]" [attr.aria-label]="r.title">
                    <app-cover [seed]="r.cover_seed" [showTitle]="false" radius="8px" />
                  </a>
                  <div class="grow">
                    <a class="t-row title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                    <p class="t-caption when">{{ when(r) }}</p>
                  </div>
                  <app-pill [status]="r.status" />
                </li>
              }
            </ol>
          </section>
        }
      }
    </main>

    @if (pending(); as p) {
      <div class="scrim" (click)="pending.set(null)">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title"
             (click)="$event.stopPropagation()">
          <h2 id="cancel-title">Cancel your registration?</h2>
          <p class="t-body">
            Your place at {{ p.title }} is released and the first person waiting takes it.
          </p>
          <div class="dialog-actions">
            <button type="button" class="btn btn-primary" (click)="pending.set(null)">Keep My Place</button>
            <button type="button" class="btn btn-danger" (click)="confirmCancel(p)">Cancel Registration</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .col { max-width: 900px; padding: 32px 24px 64px; }
    h1 { margin-bottom: 24px; }
    .group { margin-bottom: 32px; }
    .group h2 { margin-bottom: 8px; }
    .rows { display: flex; flex-direction: column; }
    .row-item {
      display: flex; align-items: center; gap: 12px; padding: 12px 0;
      border-bottom: 1px solid var(--divider);
    }
    .thumb-link, .thumb { width: 44px; height: 44px; flex: none; border-radius: 8px; overflow: hidden; display: block; }
    .thumb { background: var(--skeleton); }
    .title { color: inherit; display: block; font-weight: 500; }
    .when { color: var(--ink-64); }
    .controls { display: flex; gap: 8px; flex-wrap: wrap; }
    @media (max-width: 649px) {
      .row-item { flex-wrap: wrap; }
      .controls { width: 100%; }
    }
  `],
})
export class HomeComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  regs = signal<MyRegistration[]>([]);
  loading = signal(true);
  pending = signal<MyRegistration | null>(null);

  private isPast = (r: MyRegistration) =>
    !!r.ends_at && new Date(r.ends_at).getTime() < Date.now();

  upcoming = computed(() => this.regs().filter((r) => !this.isPast(r)));
  past = computed(() => this.regs().filter((r) => this.isPast(r)));

  ngOnInit() { this.load(); }

  private load() {
    this.loading.set(true);
    this.api.myRegistrations().subscribe({
      next: (rows) => { this.regs.set(rows); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  when(r: MyRegistration) { return formatIn(r.starts_at, r.time_zone); }

  askCancel(r: MyRegistration) { this.pending.set(r); }

  confirmCancel(r: MyRegistration) {
    this.pending.set(null);
    this.api.cancelRegistration(r.id).subscribe({
      next: (updated) => {
        // the row moves to its new status in place rather than vanishing
        this.regs.update((list) => list.map((x) =>
          x.id === r.id ? { ...x, ...updated, status: updated.status,
                            ticket_code: updated.ticket_code,
                            waitlist_position: updated.waitlist_position } : x));
        this.notices.show(`Your place at ${r.title} is released.`, 'success');
      },
      error: (e: Refusal) => this.notices.show(e.message, 'danger'),
    });
  }
}

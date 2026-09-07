import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiRefusal, ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import type { Registration } from '../core/models';
import { CoverComponent } from '../shared/cover.component';
import { DialogComponent, StatusPillComponent } from '../shared/ui';
import { dateLine } from '../core/time';

/**
 * The guest's registrations: two groups, Upcoming first and Past second, each
 * an ordered list of rows divided by hairlines.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CoverComponent, StatusPillComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="t-screen-title">Your Registrations</h1>

    @if (loading()) {
      <ul class="rows">
        @for (n of [1, 2, 3]; track n) {
          <li class="row">
            <div class="skeleton" style="width: 44px; height: 44px; border-radius: 11px"></div>
            <div style="flex: 1">
              <div class="skeleton" style="height: 22px; width: 45%"></div>
              <div class="skeleton" style="height: 16px; width: 30%; margin-top: 6px"></div>
            </div>
          </li>
        }
      </ul>
    } @else if (upcoming().length === 0 && past().length === 0) {
      <div class="empty-state">
        <h2>No Upcoming Events</h2>
        <p>Events you register for will appear here.</p>
        <a routerLink="/discover" class="btn btn-primary btn-pill">Discover Events</a>
      </div>
    } @else {
      @if (upcoming().length) {
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" class="t-overline group">Upcoming</h2>
          <ul class="rows">
            @for (reg of upcoming(); track reg.id) {
              <li class="row">
                <a [routerLink]="'/' + reg.event!.slug" class="thumb" aria-hidden="true" tabindex="-1">
                  <app-cover [seed]="reg.event!.cover_seed" [size]="44" [showTitle]="false" />
                </a>
                <div class="row-text">
                  <a [routerLink]="'/' + reg.event!.slug" class="row-title t-list-row">{{ reg.event!.title }}</a>
                  <span class="row-date t-caption">{{ dateFor(reg) }}</span>
                </div>
                <app-status-pill [status]="reg.status" />
                <div class="row-action">
                  @if (reg.status === 'confirmed' || reg.status === 'checked_in') {
                    <a class="btn btn-sm" [routerLink]="'/t/' + reg.ticket_code">View Ticket</a>
                    <button type="button" class="btn-text" (click)="askCancel(reg)">Cancel</button>
                  } @else if (reg.status === 'waitlisted') {
                    <button type="button" class="btn btn-sm" (click)="askCancel(reg)">Leave Waiting List</button>
                  } @else if (reg.status === 'pending_approval') {
                    <button type="button" class="btn-text" (click)="askCancel(reg)">Withdraw</button>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (past().length) {
        <section aria-labelledby="past-heading">
          <h2 id="past-heading" class="t-overline group">Past</h2>
          <ul class="rows">
            @for (reg of past(); track reg.id) {
              <li class="row">
                <a [routerLink]="'/' + reg.event!.slug" class="thumb" aria-hidden="true" tabindex="-1">
                  <app-cover [seed]="reg.event!.cover_seed" [size]="44" [showTitle]="false" />
                </a>
                <div class="row-text">
                  <a [routerLink]="'/' + reg.event!.slug" class="row-title t-list-row">{{ reg.event!.title }}</a>
                  <span class="row-date t-caption">{{ dateFor(reg) }}</span>
                </div>
                <app-status-pill [status]="reg.status" />
                <div class="row-action"></div>
              </li>
            }
          </ul>
        </section>
      }
    }

    @if (pendingCancel(); as target) {
      <app-dialog heading="Cancel this registration?" (closed)="pendingCancel.set(null)">
        <p class="dialog-body">
          Cancelling frees your seat at {{ target.event?.title }}, and the next person on the waiting list takes it.
        </p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-pill" (click)="pendingCancel.set(null)">Keep My Place</button>
          <button type="button" class="btn btn-danger btn-pill" (click)="confirmCancel(target)" [disabled]="working()">
            Cancel Registration
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: [
    `
      h1 { margin-bottom: 24px; }

      .group {
        color: var(--ink-36);
        margin: 32px 0 8px;
      }

      .rows { border-top: 1px solid var(--divider); }

      .row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 0;
        border-bottom: 1px solid var(--divider);
      }

      .thumb {
        flex: none;
        border-radius: var(--r-media);
        overflow: hidden;
      }

      .row-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .row-title {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .row-date { color: var(--muted); }

      .row-action {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }

      .dialog-body { color: var(--ink-64); }

      .dialog-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 24px;
        flex-wrap: wrap;
      }

      @media (max-width: 649px) {
        .row { flex-wrap: wrap; }
        .row-action { width: 100%; justify-content: flex-end; }
      }
    `,
  ],
})
export class HomeComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly registrations = signal<Registration[]>([]);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly pendingCancel = signal<Registration | null>(null);

  readonly upcoming = computed(() =>
    this.registrations().filter((r) => !r.event?.has_ended && !this.isGone(r))
  );
  readonly past = computed(() => this.registrations().filter((r) => r.event?.has_ended || this.isGone(r)));

  ngOnInit() {
    this.load();
  }

  private isGone(r: Registration) {
    return ['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(r.status);
  }

  private load() {
    this.loading.set(true);
    this.api.myRegistrations().subscribe({
      next: (rows) => {
        this.registrations.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.registrations.set([]);
        this.loading.set(false);
      },
    });
  }

  askCancel(reg: Registration) {
    this.pendingCancel.set(reg);
  }

  confirmCancel(reg: Registration) {
    this.working.set(true);
    this.api.cancelRegistration(reg.id).subscribe({
      next: (updated) => {
        // The row moves to its new status in place rather than vanishing.
        this.registrations.update((list) =>
          list.map((r) => (r.id === updated.id ? { ...r, ...updated, event: r.event } : r))
        );
        this.working.set(false);
        this.pendingCancel.set(null);
        this.notices.success('Your registration has been cancelled.');
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.pendingCancel.set(null);
        this.notices.refuse(err.message);
      },
    });
  }

  dateFor(reg: Registration) {
    // The date in the event's own zone.
    return reg.event ? dateLine(reg.event.starts_at, reg.event.time_zone) : '';
  }
}

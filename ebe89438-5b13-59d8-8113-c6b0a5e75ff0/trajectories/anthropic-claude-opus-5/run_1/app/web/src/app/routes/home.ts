import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Notices } from '../core/notices';
import { shortDate, timeOfDay } from '../core/timefmt';
import type { MyRegistrationRow, Refusal } from '../core/models';
import { Shell } from '../ui/chrome';
import { CoverArt } from '../ui/cover-art';
import { Dialog, StatusPill } from '../ui/shared';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Shell, CoverArt, StatusPill, Dialog],
  template: `
    <app-shell>
      <h1 class="t-screen-title">Your Events</h1>

      @if (loading()) {
        <div class="group" aria-busy="true">
          @for (n of [1, 2, 3]; track n) {
            <div class="sk sk-row"></div>
          }
        </div>
      } @else if (rows().length) {
        <section class="group" aria-labelledby="g-upcoming">
          <h2 id="g-upcoming" class="t-section group-h">Upcoming</h2>
          @if (upcoming().length) {
            <ol class="rows">
              @for (r of upcoming(); track r.id) {
                <li class="row">
                  <span class="thumb"><app-cover [seed]="r.cover_seed" [showTitle]="false" radius="var(--r-nav)" /></span>
                  <span class="row-main">
                    <a class="row-title t-row" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                    <span class="row-date t-caption">{{ dateOf(r) }}</span>
                  </span>
                  <app-status-pill [status]="r.status" />
                  <span class="row-actions">
                    @if (r.status === 'confirmed' || r.status === 'checked_in') {
                      <a class="btn btn-sm" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                      @if (r.status === 'confirmed') {
                        <button type="button" class="btn btn-sm btn-text" (click)="ask(r)">Cancel</button>
                      }
                    } @else if (r.status === 'waitlisted') {
                      <button type="button" class="btn btn-sm" (click)="ask(r)">Leave Waiting List</button>
                    } @else if (r.status === 'pending_approval') {
                      <button type="button" class="btn btn-sm btn-text" (click)="ask(r)">Withdraw</button>
                    }
                  </span>
                </li>
              }
            </ol>
          } @else {
            <div class="empty">
              <h2>No Upcoming Events</h2>
              <p>Events you register for will appear here.</p>
              <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
            </div>
          }
        </section>

        @if (past().length) {
          <section class="group" aria-labelledby="g-past">
            <h2 id="g-past" class="t-section group-h">Past</h2>
            <ol class="rows">
              @for (r of past(); track r.id) {
                <li class="row">
                  <span class="thumb"><app-cover [seed]="r.cover_seed" [showTitle]="false" radius="var(--r-nav)" /></span>
                  <span class="row-main">
                    <a class="row-title t-row" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                    <span class="row-date t-caption">{{ dateOf(r) }}</span>
                  </span>
                  <app-status-pill [status]="r.status" />
                  <span class="row-actions"></span>
                </li>
              }
            </ol>
          </section>
        }
      } @else {
        <div class="empty">
          <h2>No Upcoming Events</h2>
          <p>Events you register for will appear here.</p>
          <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
        </div>
      }

      @if (asking(); as r) {
        <app-dialog [heading]="dialogHeading()" (closed)="asking.set(null)">
          <p class="t-prose">{{ dialogBody() }}</p>
          <div class="dialog-actions">
            <button type="button" class="btn" (click)="asking.set(null)">Keep My Place</button>
            <button type="button" class="btn btn-danger" (click)="confirmCancel(r)" [disabled]="busy()">
              {{ r.status === 'waitlisted' ? 'Leave Waiting List' : 'Cancel Registration' }}
            </button>
          </div>
        </app-dialog>
      }
    </app-shell>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .group {
        margin-bottom: var(--s7);
        max-width: 900px;
      }
      .group-h {
        color: var(--ink-secondary);
        margin-bottom: var(--s3);
      }
      .rows {
        border-top: 1px solid var(--paper-divider);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--paper-divider);
      }
      .thumb {
        width: 44px;
        flex: 0 0 auto;
        display: block;
      }
      .row-main {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .row-title {
        color: var(--ink);
        font-weight: 500;
      }
      .row-date {
        color: var(--ink-tertiary);
      }
      .row-actions {
        display: flex;
        gap: var(--s2);
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      @media (max-width: 649px) {
        .row {
          flex-wrap: wrap;
        }
        .row-actions {
          width: 100%;
          justify-content: flex-start;
        }
      }
    `,
  ],
})
export class HomeRoute {
  private api = inject(Api);
  private notices = inject(Notices);

  readonly loading = signal(true);
  readonly rows = signal<MyRegistrationRow[]>([]);
  readonly asking = signal<MyRegistrationRow | null>(null);
  readonly busy = signal(false);

  private readonly isPast = (r: MyRegistrationRow) =>
    !!r.ends_at && new Date(r.ends_at).getTime() < Date.now();

  readonly upcoming = computed(() => this.rows().filter((r) => !this.isPast(r)));
  readonly past = computed(() => this.rows().filter((r) => this.isPast(r)));

  readonly dialogHeading = computed(() =>
    this.asking()?.status === 'waitlisted' ? 'Leave this waiting list?' : 'Cancel this registration?'
  );

  readonly dialogBody = computed(() => {
    const r = this.asking();
    if (!r) return '';
    if (r.status === 'waitlisted')
      return `You will lose your place in the queue for ${r.title} and will not be moved up if a seat opens.`;
    return `Your seat at ${r.title} is released at once and passes to whoever is first on the waiting list.`;
  });

  constructor() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.myRegistrations().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  dateOf(r: MyRegistrationRow) {
    const d = shortDate(r.starts_at, r.time_zone);
    const t = timeOfDay(r.starts_at, r.time_zone);
    return t ? `${d}, ${t} \u00b7 ${r.city}` : `${d} \u00b7 ${r.city}`;
  }

  ask(r: MyRegistrationRow) {
    this.asking.set(r);
  }

  confirmCancel(r: MyRegistrationRow) {
    this.busy.set(true);
    this.api.cancelRegistration(r.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.asking.set(null);
        // the row moves to its new status in place rather than vanishing
        this.rows.update((list) =>
          list.map((x) =>
            x.id === r.id
              ? { ...x, status: updated.status, ticket_code: null, waitlist_position: null }
              : x
          )
        );
        this.notices.success(`Your place at ${r.title} has been released.`);
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        this.asking.set(null);
        this.notices.refuse(e.message);
      },
    });
  }
}

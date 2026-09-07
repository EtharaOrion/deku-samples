import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { Registration } from '../core/models';
import { NoticeService } from '../core/notice.service';
import { formatShortDate, isPast } from '../core/time';
import { CoverComponent } from '../ui/cover.component';
import { DialogComponent } from '../ui/dialog.component';
import { PillComponent } from '../ui/pill.component';
import { ShellComponent } from '../ui/shell.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ShellComponent, CoverComponent, PillComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <h1 class="t-screen-title">Your registrations</h1>

      @if (loading()) {
        <div class="rows">
          @for (i of [1, 2, 3]; track i) {
            <div class="sk" style="height:68px;border-radius:8px;margin-bottom:8px"></div>
          }
        </div>
      } @else if (upcoming().length === 0 && past().length === 0) {
        <div class="empty-state">
          <h2>No Upcoming Events</h2>
          <p>Events you register for will appear here.</p>
          <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
        </div>
      } @else {
        <section aria-labelledby="up-h" class="group">
          <h2 id="up-h" class="t-overline">Upcoming</h2>
          @if (upcoming().length === 0) {
            <div class="empty-state">
              <h2>No Upcoming Events</h2>
              <p>Events you register for will appear here.</p>
              <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
            </div>
          } @else {
            <ol class="rows">
              @for (r of upcoming(); track r.id) {
                <li class="row">
                  <app-cover class="thumb" [seed]="r.cover_seed ?? ''" [showTitle]="false" [media]="true" />
                  <a class="t-row title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                  <span class="t-caption when">{{ when(r) }}</span>
                  <app-pill [status]="r.status" />
                  <span class="trailing">
                    @if (r.ticket_code) {
                      <a class="btn btn-sm" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                      <button type="button" class="btn btn-text btn-sm" (click)="ask(r)">Cancel</button>
                    } @else if (r.status === 'waitlisted') {
                      <button type="button" class="btn btn-sm" (click)="ask(r)">Leave Waiting List</button>
                    } @else if (r.status === 'pending_approval') {
                      <button type="button" class="btn btn-text btn-sm" (click)="ask(r)">Withdraw</button>
                    }
                  </span>
                </li>
              }
            </ol>
          }
        </section>

        @if (past().length) {
          <section aria-labelledby="past-h" class="group">
            <h2 id="past-h" class="t-overline">Past</h2>
            <ol class="rows">
              @for (r of past(); track r.id) {
                <li class="row">
                  <app-cover class="thumb" [seed]="r.cover_seed ?? ''" [showTitle]="false" [media]="true" />
                  <a class="t-row title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                  <span class="t-caption when">{{ when(r) }}</span>
                  <app-pill [status]="r.status" />
                  <span class="trailing"></span>
                </li>
              }
            </ol>
          </section>
        }
      }
    </app-shell>

    @if (pending(); as p) {
      <app-dialog heading="Give up your place?" (closed)="pending.set(null)">
        <p class="t-prose">
          Cancelling releases your seat at {{ p.title }} at once, and the first person waiting takes it.
        </p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-pill" (click)="pending.set(null)">Keep My Place</button>
          <button type="button" class="btn btn-danger btn-pill" (click)="confirmCancel()" [disabled]="working()">
            Cancel Registration
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s6);
      }
      .group {
        margin-bottom: var(--s7);
      }
      .group h2 {
        color: var(--ink-36);
        margin-bottom: var(--s3);
      }
      .rows {
        display: flex;
        flex-direction: column;
      }
      .row {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto auto auto;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--divider);
        font-size: 15px;
        line-height: 22px;
      }
      .thumb {
        width: 44px;
        height: 44px;
        border-radius: var(--r-media);
        overflow: hidden;
      }
      .title {
        color: var(--ink);
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .when {
        color: var(--muted);
        white-space: nowrap;
      }
      .trailing {
        display: flex;
        gap: var(--s2);
        justify-content: flex-end;
      }
      .dialog-actions {
        display: flex;
        gap: var(--s2);
        justify-content: flex-end;
        margin-top: var(--s5);
        flex-wrap: wrap;
      }
      @media (max-width: 649px) {
        .row {
          grid-template-columns: 44px minmax(0, 1fr);
          grid-template-areas: 'thumb title' 'thumb when' '. state' '. trailing';
          row-gap: 4px;
        }
        .thumb {
          grid-area: thumb;
        }
        .title {
          grid-area: title;
        }
        .when {
          grid-area: when;
        }
        app-pill {
          grid-area: state;
        }
        .trailing {
          grid-area: trailing;
          justify-content: flex-start;
        }
      }
    `,
  ],
})
export class HomeComponent {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly registrations = signal<Registration[]>([]);
  readonly loading = signal(true);
  readonly pending = signal<Registration | null>(null);
  readonly working = signal(false);

  readonly upcoming = computed(() =>
    this.registrations().filter((r) => !isPast(r.ends_at ?? r.starts_at)),
  );
  readonly past = computed(() => this.registrations().filter((r) => isPast(r.ends_at ?? r.starts_at)));

  constructor() {
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      this.registrations.set(await this.api.myRegistrations());
    } finally {
      this.loading.set(false);
    }
  }

  when(r: Registration) {
    return formatShortDate(r.starts_at, r.time_zone ?? 'UTC');
  }

  ask(r: Registration) {
    this.pending.set(r);
  }

  /** The row moves to its new status in place rather than vanishing. */
  async confirmCancel() {
    const r = this.pending();
    if (!r) return;
    this.working.set(true);
    try {
      const updated = await this.api.cancelRegistration(r.id);
      this.registrations.update((list) =>
        list.map((x) =>
          x.id === r.id ? { ...x, status: updated.status, ticket_code: null, waitlist_position: null } : x,
        ),
      );
      this.notices.success(`Your place at ${r.title} has been given up.`);
      this.pending.set(null);
    } catch (err) {
      this.notices.refuse((err as ApiError).message);
    } finally {
      this.working.set(false);
    }
  }
}
